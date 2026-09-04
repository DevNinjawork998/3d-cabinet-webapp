import "server-only";
import { createHmac } from "node:crypto";
import { WORKSHOP_PHONE } from "../carriers";
import { suggestVehicle, type VehicleClass } from "../measure";
import { toE164 } from "../phone";
import type { DeliveryJob } from "../types";

/**
 * Lalamove — the vehicle partner, and the only one that says where the driver is.
 *
 * The v3 API is a three-call chain: `POST /v3/quotations` returns a price and a
 * `quotationId` good for five minutes, `POST /v3/orders` spends it, and
 * `GET /v3/orders/{id}` is how we find out what happened. `book/route.ts`
 * already re-quotes immediately before booking, so that five-minute window is
 * handled by code that exists — this adapter only has to carry the quotation's
 * stop ids from one call to the next, which is what `quoteRef` is for.
 */

/**
 * A job Lalamove cannot be asked about — no pin, no readable phone, too big for
 * one vehicle.
 *
 * Separate from `CarrierNotConfigured` because the cause is the job, not the
 * environment, and the message goes straight onto the comparison row where the
 * admin can act on it: `quotes/route.ts` puts a rejected quote's message in the
 * `error` field of that carrier's row.
 */
export class LalamoveNotDeliverable extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LalamoveNotDeliverable";
	}
}

/**
 * Our vehicle classes in Lalamove's words.
 *
 * ponytail: hardcoded for the MY market. Lalamove's own docs warn these keys
 * differ per city and that `GET /v3/cities` is the authority — worth calling
 * and caching if a second market is ever added, or if a quote starts coming
 * back ERR_INVALID_SERVICE_TYPE.
 */
export const SERVICE_TYPE: Record<VehicleClass, string> = {
	car: "CAR",
	van: "VAN",
	lorry_1t: "TRUCK330",
	lorry_3t: "TRUCK550",
};

/** For the note on the comparison row — "Van, MYR" reads better than "VAN". */
export const SERVICE_TYPE_LABEL: Record<string, string> = {
	CAR: "Car",
	VAN: "Van",
	TRUCK330: "1-tonne lorry",
	TRUCK550: "3-tonne lorry",
};

export const MARKET = "MY";
export const LANGUAGE = "en_MY";

/**
 * `HmacSHA256(<ts>CRLF<VERB>CRLF<path>CRLF CRLF<body>)`, hex.
 *
 * The blank line between the path and the body is part of the spec, not a
 * typo. `body` is the empty string for GET and DELETE, and must be
 * byte-identical to what goes on the wire — which is why `carrierFetch` takes
 * a pre-serialised string.
 */
export function signRequest(
	secret: string,
	timestamp: string,
	method: string,
	path: string,
	body: string,
): string {
	return createHmac("sha256", secret)
		.update(`${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`)
		.digest("hex");
}

/** The smallest Lalamove vehicle this job fits in. */
export function serviceTypeFor(job: DeliveryJob): string {
	const suggestion = suggestVehicle(job.items);
	if (suggestion.id === null) {
		throw new LalamoveNotDeliverable(
			`This job is ${suggestion.reason} — Lalamove books one vehicle at a time`,
		);
	}
	return SERVICE_TYPE[suggestion.id];
}

/** Lalamove takes coordinates as strings, and rejects a stop without one. */
function stop(
	lat: number | null,
	lng: number | null,
	address: string,
	which: string,
) {
	if (lat === null || lng === null) {
		throw new LalamoveNotDeliverable(
			`The ${which} address has no map location — edit it, or paste a pin`,
		);
	}
	return { coordinates: { lat: String(lat), lng: String(lng) }, address };
}

/**
 * The quotation payload.
 *
 * Two stops, pickup first: Lalamove reads stop order as route order, and the
 * cabinets are leaving the workshop.
 *
 * The optional `item` object is deliberately absent. Its `weight` field is a
 * per-city enum bucket the docs do not enumerate for MY, the catalogue carries
 * no weights anyway, and a guessed bucket would be rejected for no gain.
 */
export function quotationBody(job: DeliveryJob) {
	return {
		data: {
			serviceType: serviceTypeFor(job),
			language: LANGUAGE,
			stops: [
				stop(job.pickupLat, job.pickupLng, job.pickupAddress, "pickup"),
				stop(job.siteLat, job.siteLng, job.siteAddress, "site"),
			],
			// Lalamove wants UTC ISO 8601, and omitting it means "as soon as
			// possible" — which is not the same as sending a null.
			...(job.scheduledAt ? { scheduleAt: job.scheduledAt.toISOString() } : {}),
		},
	};
}

function phoneOrThrow(raw: string, whose: string): string {
	const e164 = toE164(raw);
	if (e164 === null) {
		throw new LalamoveNotDeliverable(
			`The ${whose} phone number (${raw}) is not a number Lalamove can call`,
		);
	}
	return e164;
}

/**
 * The order payload.
 *
 * `sender` is the workshop and `recipients[0]` is the customer, each pinned to
 * the `stopId` the quotation came back with — Lalamove matches them by id, not
 * by position, and a mismatch is a 422.
 *
 * `addressNotes` becomes the recipient's `remarks`: gate codes and unit numbers
 * are exactly what a driver at the boom gate needs, and they are kept out of
 * the address line precisely so they can go here.
 */
export function orderBody(
	job: DeliveryJob,
	quotationId: string,
	senderStopId: string,
	recipientStopId: string,
) {
	return {
		data: {
			quotationId,
			sender: {
				stopId: senderStopId,
				name: "Infinite Cabinet",
				// The workshop's own number. Emphatically not the customer's: this
				// is the contact a driver rings from the loading bay, and pointing
				// it at the customer means they get called to explain where their
				// own cabinets are.
				phone: phoneOrThrow(WORKSHOP_PHONE, "workshop's"),
			},
			recipients: [
				{
					stopId: recipientStopId,
					name: job.customerName,
					phone: phoneOrThrow(job.customerPhone, "customer's"),
					...(job.addressNotes ? { remarks: job.addressNotes } : {}),
				},
			],
			// Ours, echoed back on every webhook — the fastest way to tie a
			// Lalamove order in their dashboard to a job number staff say aloud.
			metadata: {
				deliveryId: job.id,
				deliveryNumber: String(job.number),
			},
		},
	};
}

/**
 * `book()` needs three strings from `quote()` and `CarrierQuote` gives it one.
 *
 * Joined rather than JSON so the value stays readable in the
 * `DeliveryEvent.raw` of the booking event, which is where anyone debugging a
 * 422 will look first.
 */
export function packQuoteRef(
	quotationId: string,
	senderStopId: string,
	recipientStopId: string,
): string {
	return [quotationId, senderStopId, recipientStopId].join("|");
}

export function unpackQuoteRef(ref: string | undefined) {
	const parts = (ref ?? "").split("|");
	if (parts.length !== 3 || parts.some((p) => p === "")) return null;
	return {
		quotationId: parts[0],
		senderStopId: parts[1],
		recipientStopId: parts[2],
	};
}
