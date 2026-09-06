import "server-only";
import { put } from "@vercel/blob";
import { z } from "zod";
import { carrierFetch } from "../http";
import { suggestVehicle, type VehicleClass } from "../measure";
import { toE164 } from "../phone";
import { mapCarrierStatus } from "../status";
import { trace } from "../trace";
import {
	type CarrierAdapter,
	type CarrierBooking,
	CarrierNotConfigured,
	type CarrierQuote,
	type DeliveryJob,
	type TrackingUpdate,
} from "../types";

/**
 * GDEX — the parcel partner.
 *
 * Three things separate it from Lalamove and every design choice here follows
 * from them: it prices by **postcode and kilogram** rather than by coordinate,
 * it has **no webhook** (the API documents no callback operation, so tracking
 * is the cron poll only), and booking **debits an e-Wallet** — which makes
 * `CreateConsignment` the one call in this file that must never be retried.
 *
 * The account's own profile is the sender. `GetUserDetails` returns Name,
 * Mobile, Email, Address1, PostalCode, City, State, Location and — the field
 * that matters — `LocationId`, which `CreateConsignment` requires and which
 * cannot be derived from an address without a second lookup. WORKSHOP_ADDRESS
 * is a placeholder too vague to geocode (see the open question in CLAUDE.md);
 * the GDEX profile is a real registered address, so GDEX sidesteps that
 * problem entirely rather than inheriting it.
 */

/**
 * A job GDEX cannot be asked about — no weight, no postcode, too many pieces,
 * no pickup day.
 *
 * Separate from `CarrierNotConfigured` for the same reason
 * `LalamoveNotDeliverable` is: the cause is the job, not the environment, and
 * `quotes/route.ts` puts this message straight onto the GDEX comparison row
 * where the admin can act on it.
 */
export class GdexNotDeliverable extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GdexNotDeliverable";
	}
}

/** Malaysia. GDEX takes ISO-3166 alpha-3, not the alpha-2 everything else uses. */
export const COUNTRY = "MYS";

/** Documents are paper. Anything Infinite Cabinet ships is not. */
export const PARCEL_TYPE = "Parcel";

/** GDEX caps a consignment at fifteen pieces. */
export const MAX_PIECES = 15;

/**
 * Our four vehicle classes in GDEX's three.
 *
 * GDEX collects with a motorbike, a van or an offsize truck. A car-sized job
 * goes on the bike — this is a parcel network, and the class only decides
 * which vehicle turns up at the loading bay.
 */
export const TRANSPORTATION: Record<VehicleClass, string> = {
	car: "Motorbike",
	van: "Van",
	lorry_1t: "OffsizeTruck",
	lorry_3t: "OffsizeTruck",
};

/**
 * The weight GDEX prices against.
 *
 * `GetShippingRate` takes no dimensions, so this is actual weight and nothing
 * else. GDEX's real rate card charges volumetric weight on a bulky, light
 * parcel, which means a wide flat door panel can quote low here and invoice
 * high — the same gap `easyparcel.ts` carries and names.
 *
 * ponytail: actual weight only. Add a volumetric max once Infinite Cabinet
 * confirms GDEX's contracted divisor; guessing it over-quotes and loses jobs.
 *
 * Refuses rather than defaults. The catalogue carries no weights, so most jobs
 * arrive with none — and a fabricated kilogram would be quoted against and then
 * invoiced differently, which is the exact failure `deliveryItemSchema`'s
 * nullable `weightKg` was written to avoid. The message names the fix, because
 * the fix is a field the admin can fill in on this screen.
 */
export function weightOf(job: DeliveryJob): number {
	const kg = job.totalWeightKg;
	if (kg === null || kg <= 0) {
		trace("gdex.refused", { why: "no weight", deliveryId: job.id });
		throw new GdexNotDeliverable(
			"This job has no weight — GDEX prices by the kilogram, so give each item a weight and compare again",
		);
	}
	return kg;
}

export function piecesOf(job: DeliveryJob): number {
	const pieces = job.items.reduce((sum, item) => sum + item.qty, 0);
	if (pieces === 0) {
		throw new GdexNotDeliverable("This job has no items to send");
	}
	if (pieces > MAX_PIECES) {
		trace("gdex.refused", { why: "pieces", pieces, deliveryId: job.id });
		throw new GdexNotDeliverable(
			`This job is ${pieces} pieces — GDEX takes at most ${MAX_PIECES} on one consignment, so split it`,
		);
	}
	return pieces;
}

export function transportationFor(job: DeliveryJob): string {
	const suggestion = suggestVehicle(job.items);
	if (suggestion.id === null) {
		trace("gdex.refused", { why: "vehicle", reason: suggestion.reason });
		throw new GdexNotDeliverable(
			`This job is ${suggestion.reason} — GDEX collects with one vehicle`,
		);
	}
	return TRANSPORTATION[suggestion.id];
}

/**
 * The destination postcode, off the job.
 *
 * Kept by the geocode at save time (`a0f153e`) rather than parsed out of the
 * address here — a component the geocoder identified cannot be confused with a
 * lot number, and it is the same reply the pin came from. Null means the
 * address did not geocode to one, which is a refusal: GDEX prices postcode to
 * postcode and there is nothing to guess with.
 */
function sitePostcodeOf(job: DeliveryJob): string {
	if (job.sitePostcode === null || job.sitePostcode === "") {
		trace("gdex.refused", { why: "no postcode", address: job.siteAddress });
		throw new GdexNotDeliverable(
			"The site address did not geocode to a postcode — GDEX prices postcode to postcode, so correct the address and compare again",
		);
	}
	return job.sitePostcode;
}

export type RateRequest = {
	ReferenceNumber: number;
	FromPostCode: string;
	ToPostCode: string;
	ParcelType: string;
	Weight: number;
	Country: string;
};

/**
 * The rate payload — an array, because GDEX prices a batch and we send one.
 *
 * `ReferenceNumber` is the delivery number staff say out loud, which makes the
 * reply's row identifiable in the event log without a lookup table.
 */
export function rateBody(
	job: DeliveryJob,
	fromPostcode: string,
): RateRequest[] {
	return [
		{
			ReferenceNumber: job.number,
			FromPostCode: fromPostcode,
			ToPostCode: sitePostcodeOf(job),
			ParcelType: PARCEL_TYPE,
			Weight: weightOf(job),
			Country: COUNTRY,
		},
	];
}

/** GDEX will not collect more than five days out, and not in the past. */
export const MAX_PICKUP_DAYS = 5;

/**
 * A moment as the date and wall-clock time it is in Malaysia.
 *
 * `en-CA` is the locale that formats a date as `YYYY-MM-DD`, and `en-GB` with
 * `hour12: false` the one that gives `HH:MM:SS` — the same trick, and the same
 * reason, as `collectionDate` in `easyparcel.ts`.
 */
export function kualaLumpur(at: Date): { date: string; time: string } {
	const timeZone = "Asia/Kuala_Lumpur";
	return {
		date: new Intl.DateTimeFormat("en-CA", { timeZone }).format(at),
		time: new Intl.DateTimeFormat("en-GB", {
			timeZone,
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		}).format(at),
	};
}

export type PickupInfo = {
	Transportation: string;
	ParcelReadyTime: string;
	PickupDate: string;
	PickupRemark?: string;
	IsTrolleyRequired: boolean;
};

/**
 * The pickup arrangement, from the job's scheduled time.
 *
 * A GDEX pickup needs a day, and the job's `scheduledAt` is the only day this
 * app knows about — so a job with none is refused rather than collected on a
 * guessed date. `addressNotes` becomes `PickupRemark` for the same reason it
 * becomes Lalamove's `remarks`: gate codes are what the driver at the boom
 * gate actually needs.
 */
export function pickupInfo(job: DeliveryJob): PickupInfo {
	const at = job.scheduledAt;
	if (at === null) {
		throw new GdexNotDeliverable(
			"This job has no scheduled date — GDEX needs a day to send a driver, so set Scheduled and compare again",
		);
	}
	const { date, time } = kualaLumpur(at);
	return {
		Transportation: transportationFor(job),
		// GDEX takes the moment twice: the day to collect, and the wall-clock
		// time the parcel is on the bench. Both are Malaysian local time, for the
		// same reason `easyparcel.ts` formats `collection_date` in
		// `Asia/Kuala_Lumpur` — a driver reads a clock on a wall in Dengkil, not
		// a UTC offset, and a job scheduled 08:00 UTC is a 16:00 collection.
		ParcelReadyTime: time,
		// Deliberately not `toISOString()`. Sending the true instant would have a
		// timezone-naive reader collect eight hours early; stamping local time
		// with a `Z` would assert a moment that is false. A naive local date-time
		// is the one of the three that claims nothing untrue — see the open
		// question, which is for GDEX to settle.
		PickupDate: `${date}T${time}`,
		...(job.addressNotes ? { PickupRemark: job.addressNotes } : {}),
		// Nothing in this app knows whether a trolley is wanted, and a wrong
		// `true` sends a trolley to a job that is two door handles.
		IsTrolleyRequired: false,
	};
}

export type GdexUserDetails = {
	Name: string;
	Email: string;
	MobileNumber: string;
	Address1: string;
	Address2: string | null;
	PostalCode: string;
	City: string | null;
	LocationId: number;
	Location: string;
	State: string | null;
};

/**
 * A number GDEX will dial, as `60123456789`.
 *
 * `toE164` gives `+60123456789`; the leading `+` comes off because GDEX's own
 * `GetUserDetails` returns `MobileNumber` in the bare form. Same shape as
 * `easyparcel.ts`'s `phoneParts`, which strips `+60` for the same reason —
 * an E.164 string is the thing we can validate, not necessarily the thing the
 * partner's form field accepts.
 *
 * A number typed with another country's code is refused rather than sent: this
 * app only ever ships within Malaysia, and a `+65` number reaching a Malaysian
 * courier is a driver who cannot phone the customer from the gate.
 */
function phoneOrThrow(raw: string, whose: string): string {
	const e164 = toE164(raw);
	if (e164 === null || !e164.startsWith("+60")) {
		throw new GdexNotDeliverable(
			`The ${whose} phone number (${raw}) is not a number GDEX can call`,
		);
	}
	return e164.slice(1);
}

/**
 * The consignment payload.
 *
 * One consignment per job. GDEX allows ten and fifteen pieces within one, and
 * a cabinet job that needs more than that is a lorry job, not a parcel job.
 *
 * `ShipmentValue` is zero because `IsInsurance` is false: the field is what
 * enhanced liability is priced on, and declaring a value we have not been given
 * would either buy cover nobody asked for or misstate the contents.
 */
export function consignmentBody(job: DeliveryJob, sender: GdexUserDetails) {
	return {
		Name: sender.Name,
		Mobile: phoneOrThrow(sender.MobileNumber, "workshop's"),
		Email: sender.Email,
		Address1: sender.Address1,
		...(sender.Address2 ? { Address2: sender.Address2 } : {}),
		Postcode: sender.PostalCode,
		LocationId: sender.LocationId,
		Location: sender.Location,
		...(sender.City ? { City: sender.City } : {}),
		...(sender.State ? { State: sender.State } : {}),
		Pickup: pickupInfo(job),
		Consignments: [
			{
				// Ours, printed on the consignment note — the fastest way to tie a
				// note in GDEX's portal to a job number staff say aloud.
				OrderId: `ICB-${job.number}`,
				ShipmentContent: job.items
					.map((i) => i.label)
					.join(", ")
					.slice(0, 200),
				ParcelType: PARCEL_TYPE,
				ShipmentValue: 0,
				Pieces: piecesOf(job),
				Weight: weightOf(job),
				Name: job.customerName,
				Mobile: phoneOrThrow(job.customerPhone, "customer's"),
				Address1: job.siteAddress,
				Postcode: sitePostcodeOf(job),
				Country: COUNTRY,
				IsInsurance: false,
				IsTrackingSms: false,
				...(job.addressNotes ? { Note1: job.addressNotes } : {}),
			},
		],
	};
}

/**
 * The myGDEX account's Integration Token, from the web application's User
 * Profile page — not the developer portal. Read per call, not at import, so a
 * test can stub it.
 */
const USER_TOKEN = () => process.env.GDEX_USER_TOKEN ?? "";

/** The Azure APIM subscription key, from the developer portal. */
const SUBSCRIPTION_KEY = () => process.env.GDEX_PRIMARY_API_KEY ?? "";

/**
 * The sandbox, and only the sandbox.
 *
 * Live is the same host without `/test`, but the account holds no active
 * subscription to the live `myGDEX` product — every call would come back
 * "invalid subscription key". A flag that can only select a broken target is
 * worse than a constant, so going live is a deliberate edit here plus an
 * approved live subscription, not an environment variable somebody flips.
 */
const BASE = "https://myopenapi.gdexpress.com/test/api/MyGDex";

/**
 * Every GDEX call. Two credentials, two headers, and they fail differently.
 *
 * `subscription-key` is the gateway's, NOT `Ocp-Apim-Subscription-Key` — GDEX
 * renamed APIM's default, so the standard header is silently ignored and the
 * gateway answers "missing subscription key" while you are sending one. That
 * cost a debugging session on 2026-09-06; do not change it back.
 *
 * The two 401s mean opposite things and name different people to ask: one
 * about the subscription key means the request never reached GDEX, and one
 * about the user token means it did and the account was refused.
 */
async function call<T>(
	method: "GET" | "POST" | "PUT",
	path: string,
	body?: unknown,
	idempotent = false,
): Promise<T> {
	const token = USER_TOKEN();
	const subscriptionKey = SUBSCRIPTION_KEY();
	if (token === "" || subscriptionKey === "") {
		throw new CarrierNotConfigured("gdex");
	}
	return carrierFetch<T>(`${BASE}${path}`, {
		carrierId: "gdex",
		method,
		headers: {
			"User-Token": token,
			"subscription-key": subscriptionKey,
		},
		...(body === undefined ? {} : { body }),
		idempotent,
	});
}

/**
 * Every GDEX reply is `{ statusCode, data, message }` and the HTTP status
 * agrees with `statusCode` — `carrierFetch` has already thrown on a non-2xx by
 * the time these parse, so only the envelope's shape is in question here.
 */
const envelope = <T extends z.ZodType>(data: T) =>
	z.object({ statusCode: z.number(), data, message: z.string().nullish() });

const userDetailsSchema = envelope(
	z.object({
		Name: z.string(),
		Email: z.string(),
		MobileNumber: z.string(),
		Address1: z.string(),
		Address2: z.string().nullish(),
		PostalCode: z.string(),
		City: z.string().nullish(),
		LocationId: z.number(),
		Location: z.string(),
		State: z.string().nullish(),
	}),
);

const rateSchema = envelope(
	z.array(
		z.object({
			ReferenceNumber: z.number(),
			Rate: z.number(),
			HasError: z.boolean(),
			Error: z.string().nullish(),
		}),
	),
);

const consignmentSchema = envelope(
	z.object({
		InvoiceNumber: z.string().nullish(),
		ConsignmentNumbers: z.array(z.string()).min(1),
		GrandTotal: z.number().nullish(),
	}),
);

const statusSchema = envelope(
	z.array(
		z.object({
			ConsignmentNote: z.string(),
			ConsignmentNoteStatus: z.string().nullish(),
		}),
	),
);

/** Same reasoning as Lalamove's `readReply`: a ZodError path list explains nothing. */
function readReply<T>(schema: z.ZodType<T>, payload: unknown, what: string): T {
	const parsed = schema.safeParse(payload);
	if (parsed.success) return parsed.data;
	const seen = JSON.stringify(payload) ?? String(payload);
	trace("gdex.unreadable", { what, payload: seen });
	throw new Error(
		`GDEX's ${what} reply was not the shape we expect: ${seen.slice(0, 200)}`,
	);
}

/**
 * The sender block, from the GDEX account's own profile.
 *
 * Fetched on every quote and every booking rather than cached: it is one small
 * GET, it changes when someone edits the account, and a stale `LocationId` is a
 * parcel collected from an address the workshop moved out of.
 */
async function senderDetails(): Promise<GdexUserDetails> {
	const reply = readReply(
		userDetailsSchema,
		await call("GET", "/GetUserDetails", undefined, true),
		"user details",
	);
	return {
		...reply.data,
		Address2: reply.data.Address2 ?? null,
		City: reply.data.City ?? null,
		State: reply.data.State ?? null,
	};
}

/**
 * Where a consignment note lives, derived rather than stored.
 *
 * The consignment number is already on the delivery row as `carrierOrderId`, so
 * the serving route can rebuild this path without a second column. Private: the
 * note carries the customer's name, phone and home address, and a consignment
 * number is guessable enough that a public object would be a disclosure waiting
 * to happen. `/api/admin/deliveries/[id]/label` is the only way in, behind the
 * admin cookie `proxy.ts` already enforces.
 */
export function labelPathname(consignmentNumber: string): string {
	return `logistics/gdex/${consignmentNumber}.pdf`;
}

/**
 * Fetch the consignment note and keep a copy.
 *
 * GDEX serves the PDF only while the shipment is pending — once it is
 * collected, cancelled or delivered the endpoint refuses — so this is a
 * booking-time capture, not a link we can follow later.
 *
 * A raw `fetch` rather than `call`: `carrierFetch` parses JSON, and this is a
 * PDF body. Failure is swallowed on purpose. The consignment is already created
 * and the e-Wallet already debited by the time this runs, so throwing here
 * would fail a booking that in fact succeeded; a missing label costs a trip to
 * GDEX's portal, and a phantom un-booking costs a parcel nobody sent.
 */
async function storeLabel(consignmentNumber: string): Promise<string | null> {
	try {
		const response = await fetch(
			`${BASE}/GetConsignmentsImage?ConsignmentNumber=${encodeURIComponent(consignmentNumber)}`,
			{
				headers: {
					"User-Token": USER_TOKEN(),
					"subscription-key": SUBSCRIPTION_KEY(),
				},
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!response.ok) {
			trace("gdex.label", { consignmentNumber, status: response.status });
			return null;
		}
		await put(labelPathname(consignmentNumber), await response.blob(), {
			access: "private",
			addRandomSuffix: false,
			contentType: "application/pdf",
			allowOverwrite: true,
		});
		return consignmentNumber;
	} catch (error) {
		trace("gdex.label", { consignmentNumber, error: String(error) });
		return null;
	}
}

export const gdexAdapter: CarrierAdapter = {
	id: "gdex",

	// Both, deliberately. GDEX_PUBLIC_KEY is NOT accepted as a fallback for
	// the user token: it sits in `.env.local` and is proven invalid, so
	// honouring it would turn "nobody set this up" into an unexplained 401.
	isConfigured: () => USER_TOKEN() !== "" && SUBSCRIPTION_KEY() !== "",

	async quote(job): Promise<CarrierQuote> {
		// Before anything is dialled: an unweighed or postcode-less job is
		// refused here, and the message goes on the comparison row.
		const weight = weightOf(job);
		trace("gdex.quote", {
			deliveryId: job.id,
			weight,
			items: job.items.length,
		});

		const sender = await senderDetails();
		const reply = readReply(
			rateSchema,
			await call(
				"POST",
				"/GetShippingRate",
				rateBody(job, sender.PostalCode),
				true,
			),
			"rate",
		);

		const [row] = reply.data;
		if (row === undefined) {
			throw new GdexNotDeliverable("GDEX priced nothing for this job");
		}
		// A per-row error arrives inside a 200 — a rate of 0 with HasError true.
		// Reading only `Rate` would put "RM 0" on the comparison row and let an
		// admin book a parcel GDEX has already said it cannot carry.
		if (row.HasError) {
			throw new GdexNotDeliverable(
				row.Error ?? "GDEX would not price this job",
			);
		}

		return {
			carrierId: "gdex",
			priceRm: row.Rate,
			// GDEX quotes a rate, not a time. Transit days depend on the lane and
			// are not in this reply; inventing minutes would put a promise on the
			// screen nobody made.
			etaMinutes: null,
			notes: `Parcel, ${weight} kg`,
		};
	},

	async book(job): Promise<CarrierBooking> {
		trace("gdex.book", { deliveryId: job.id });
		const sender = await senderDetails();

		// Not idempotent, and `carrierFetch` will not retry it: a retried
		// consignment is a second parcel and a second e-Wallet debit.
		const reply = readReply(
			consignmentSchema,
			await call("POST", "/CreateConsignment", consignmentBody(job, sender)),
			"consignment",
		);

		const consignmentNumber = reply.data.ConsignmentNumbers[0];
		const stored = await storeLabel(consignmentNumber);

		return {
			carrierOrderId: consignmentNumber,
			// Our route, not a blob URL: the note is private and the admin cookie
			// is what opens it. Null when the capture failed, so the print link
			// simply does not render rather than pointing at nothing.
			labelUrl:
				stored === null ? null : `/api/admin/deliveries/${job.id}/label`,
			// GDEX returns no share link. Its public tracking page takes a
			// consignment number, but the URL is not in the API documentation, so
			// null is the honest answer rather than a guessed link an admin would
			// send to a customer.
			// ponytail: fill this in once the tracking URL is confirmed with GDEX.
			trackingUrl: null,
		};
	},

	async track(carrierOrderId): Promise<TrackingUpdate> {
		const reply = readReply(
			statusSchema,
			await call("POST", "/GetLastShipmentStatus", [carrierOrderId], true),
			"shipment status",
		);

		const row =
			reply.data.find((r) => r.ConsignmentNote === carrierOrderId) ??
			reply.data[0];
		const status = row?.ConsignmentNoteStatus ?? "";

		return {
			// An unmapped word gives null, and `applyTrackingUpdate` leaves the row
			// where it is — see the docblock on `mapCarrierStatus`.
			status: status === "" ? null : mapCarrierStatus("gdex", status),
			message: `GDEX reports ${status || "no status"}`,
			raw: reply.data,
		};
	},

	async cancel(carrierOrderId): Promise<void> {
		// GDEX refuses once the consignment has been scanned, or after 14 days,
		// with a 400 whose message says which. `advance/route.ts` turns that into
		// `carrier_refused_cancel` and shows the message — a job that could not be
		// cancelled still has a parcel moving.
		await call(
			"PUT",
			`/CancelConsignment?ConsignmentNumber=${encodeURIComponent(carrierOrderId)}`,
		);
	},
};
