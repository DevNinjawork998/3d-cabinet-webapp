import "server-only";
import { z } from "zod";
import { pickupPlace } from "../carriers";
import { carrierFetch } from "../http";
import { easyparcelAppConfigured } from "../oauth";
import { accessTokenFor } from "../tokens";
import { trace } from "../trace";
import type { CarrierAdapter, CarrierQuote, DeliveryJob } from "../types";

/**
 * EasyParcel — the parcel partner, and the one that fronts every Malaysian
 * courier at once.
 *
 * Shaped like `lalamove.ts` because the differences are all at the edges: pure
 * payload builders, a thin signed `call()`, and every reply parsed with Zod
 * rather than cast. The three differences that matter:
 *
 * - **OAuth, not a key.** `accessTokenFor` holds the token pair in a DB row and
 *   refreshes it — see `lib/logistics/tokens.ts`.
 * - **Postcodes, not coordinates.** A parcel network prices zone to zone and
 *   has no use for a pin, which is the opposite of what Lalamove wants.
 * - **One quote is a whole marketplace.** `POST /shipment/quotations` comes back
 *   with a rate per courier service. `CarrierQuote` is one row, so `cheapest`
 *   picks one — and `quoteRef` carries its `service_id` to the booking.
 */

const VERSION = "2026-06";
const BASE = `https://api.easyparcel.com/open_api/${VERSION}`;
const COUNTRY = "MY";

/**
 * A job EasyParcel cannot be asked about — unweighed, unplaced, or simply too
 * big for a parcel network.
 *
 * Same role as `LalamoveNotDeliverable`: the cause is the job, not the
 * environment, and `quotes/route.ts` puts the message straight onto that
 * carrier's comparison row where the admin can act on it.
 */
export class EasyParcelNotDeliverable extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EasyParcelNotDeliverable";
	}
}

/**
 * The point past which a consignment stops being a parcel.
 *
 * `carriers.ts` already draws this line — the `vehicle` partners move finished
 * carcasses and the `parcel` ones carry hardware, samples and spare doors. These
 * are the caps that make that comment enforceable rather than advisory: an
 * 800mm base unit fails the girth and weight limits of every courier on the
 * platform, and asking anyway returns a price nobody will honour at the counter.
 *
 * ponytail: one conservative pair of numbers across all couriers rather than
 * per-courier limits from `courier/list`. Raise them if a real consignment is
 * refused that a courier would have taken.
 */
export const MAX_EDGE_MM = 1_500;
export const MAX_WEIGHT_KG = 30;

/** Millimetres to centimetres, never rounding a real dimension down to zero. */
export function mmToCm(mm: number): number {
	return Math.max(0.1, Math.round(mm) / 10);
}

export type Parcel = {
	weight: number;
	length: number;
	width: number;
	height: number;
};

/**
 * The job as one parcel.
 *
 * EasyParcel books a consignment, and a consignment has one box. The weight is
 * the whole job's; the box is the largest item's, because that is what has to
 * fit through the courier's gauge.
 *
 * ponytail: a job of several bulky lines is quoted as its biggest box at the
 * full weight, which under-states volumetric charge. It holds for what this
 * partner is actually for — a couple of doors, a box of hinges. If invoices
 * start disagreeing, the fix is one shipment per line item, which the
 * `shipment[]` array already supports and `carrierOrderId` does not.
 */
export function parcelOf(job: DeliveryJob): Parcel {
	if (job.items.length === 0) {
		throw new EasyParcelNotDeliverable("This job has no items to price");
	}
	if (job.totalWeightKg === null) {
		throw new EasyParcelNotDeliverable(
			"EasyParcel prices by weight and nothing on this job is weighed — add a weight to each line",
		);
	}
	if (job.totalWeightKg > MAX_WEIGHT_KG) {
		throw new EasyParcelNotDeliverable(
			`${job.totalWeightKg} kg is past what a courier will take — this is a lorry job`,
		);
	}

	// The biggest box on the job, by its own volume.
	const largest = job.items.reduce((a, b) =>
		a.widthMm * a.heightMm * a.depthMm >= b.widthMm * b.heightMm * b.depthMm
			? a
			: b,
	);
	const edges = [largest.widthMm, largest.heightMm, largest.depthMm].sort(
		(a, b) => b - a,
	);
	if (edges[0] > MAX_EDGE_MM) {
		throw new EasyParcelNotDeliverable(
			`${edges[0]} mm on its longest edge is past what a courier will take — this is a lorry job`,
		);
	}

	return {
		weight: job.totalWeightKg,
		length: mmToCm(edges[0]),
		width: mmToCm(edges[1]),
		height: mmToCm(edges[2]),
	};
}

type Endpoint = { postcode: string; subdivision_code: string; country: string };

function endpoint(
	postcode: string | null,
	state: string | null,
	which: string,
): Endpoint {
	if (postcode === null || state === null) {
		trace("easyparcel.refused", { why: "no place", end: which });
		throw new EasyParcelNotDeliverable(
			`The ${which} address has no postcode we could read — edit it and save again`,
		);
	}
	return { postcode, subdivision_code: state, country: COUNTRY };
}

/** The workshop's own place when the job leaves from the workshop. */
function senderPlace(job: DeliveryJob) {
	return (
		pickupPlace(job.pickupAddress, {
			postcode: job.pickupPostcode,
			city: job.pickupCity,
			state: job.pickupState,
		}) ?? { postcode: null, city: null, state: null }
	);
}

export function quotationBody(job: DeliveryJob) {
	const parcel = parcelOf(job);
	const sender = senderPlace(job);
	return {
		shipment: [
			{
				sender: endpoint(sender.postcode, sender.state, "pickup"),
				receiver: endpoint(job.sitePostcode, job.siteState, "site"),
				weight: parcel.weight,
				length: parcel.length,
				width: parcel.width,
				height: parcel.height,
				// Declared value. Zero would waive every courier's liability, and we
				// do not know what the cabinets are worth from the layout — one
				// ringgit says "declared, not insured" without inventing a figure.
				parcel_value: 1,
			},
		],
	};
}

const quotationSchema = z.object({
	status_code: z.number().optional(),
	data: z.array(
		z.object({
			status: z.string(),
			quotations: z
				.array(
					z.object({
						courier: z.object({
							service_id: z.string(),
							service_name: z.string().nullish(),
							courier_id: z.string().nullish(),
							courier_name: z.string().nullish(),
							delivery_duration: z.string().nullish(),
							is_pickup: z.boolean().nullish(),
							is_dropoff: z.boolean().nullish(),
						}),
						pricing: z.object({
							currency: z.string().nullish(),
							total_amount: z.string().nullish(),
						}),
					}),
				)
				.default([]),
			errors: z.array(z.string()).default([]),
		}),
	),
});

export type Quotation = z.infer<
	typeof quotationSchema
>["data"][number]["quotations"][number];

/** `"9.80"` -> `9.8`; anything unreadable -> null rather than NaN. */
function num(value: string | null | undefined): number | null {
	if (value === null || value === undefined || value === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

/**
 * The rate to put on the comparison row.
 *
 * Cheapest wins, and a pickup service breaks a tie — a drop-off rate is only
 * cheaper because somebody has to drive the box to a counter, which is a cost
 * this screen cannot show.
 *
 * ponytail: one rate per partner, because `CarrierQuote` is one row. Showing
 * the whole marketplace would be the better screen and is a bigger change than
 * this adapter — the quote route, the row component and the booking payload all
 * assume one price per carrier.
 *
 * ponytail: `book/route.ts` re-quotes before booking and uses the fresh
 * `quoteRef`, which Lalamove requires — its quotationId expires in five
 * minutes. Here it means a rate change between comparing and booking can swap
 * the courier under the admin without tripping the route's 10% price guard.
 * Deterministic on unchanged rates, and the confirmation names what was
 * actually booked, so it is left alone. Upgrade path is threading the admin's
 * chosen ref through `bookInputSchema` — which has to be conditional per
 * carrier, because Lalamove must not honour a stale one.
 */
export function cheapest(quotations: Quotation[]): Quotation | null {
	const priced = quotations
		.map((q) => ({ q, price: num(q.pricing.total_amount) }))
		.filter(
			(row): row is { q: Quotation; price: number } => row.price !== null,
		);
	if (priced.length === 0) return null;

	priced.sort((a, b) => {
		if (a.price !== b.price) return a.price - b.price;
		return (
			Number(b.q.courier.is_pickup ?? false) -
			Number(a.q.courier.is_pickup ?? false)
		);
	});
	return priced[0].q;
}

/** Every EasyParcel call. Bearer token, JSON in, JSON out. */
async function call<T>(
	path: string,
	body: unknown,
	idempotent = false,
): Promise<T> {
	const token = await accessTokenFor("easyparcel");
	return carrierFetch<T>(`${BASE}${path}`, {
		carrierId: "easyparcel",
		method: "POST",
		headers: { authorization: `Bearer ${token}` },
		body,
		idempotent,
	});
}

/**
 * A reply, or a message naming what arrived instead. Same reasoning as
 * `readReply` in `lalamove.ts`: a ZodError's path list is useless on a
 * comparison row, and the payload is the only thing that explains it.
 */
function readReply<T>(schema: z.ZodType<T>, payload: unknown, what: string): T {
	const parsed = schema.safeParse(payload);
	if (parsed.success) return parsed.data;
	const seen = JSON.stringify(payload) ?? String(payload);
	trace("easyparcel.unreadable", { what, payload: seen });
	throw new Error(
		`EasyParcel's ${what} reply was not the shape we expect: ${seen.slice(0, 200)}`,
	);
}

export const easyparcelAdapter: CarrierAdapter = {
	id: "easyparcel",

	// The app's credentials being present is what this can answer synchronously.
	// Whether an account is actually linked is a DB read, and a quote that finds
	// no connection throws `CarrierNotConfigured`, which the routes already
	// report — see `hasConnection` for the admin page's own check.
	isConfigured: () => easyparcelAppConfigured(),

	async quote(job): Promise<CarrierQuote> {
		trace("easyparcel.quote", {
			deliveryId: job.id,
			site: { postcode: job.sitePostcode, state: job.siteState },
			weightKg: job.totalWeightKg,
		});

		const parsed = readReply(
			quotationSchema,
			await call("/shipment/quotations", quotationBody(job), true),
			"quotation",
		);

		const first = parsed.data[0];
		if (first?.status !== "success") {
			throw new EasyParcelNotDeliverable(
				first?.errors.join("; ") || "EasyParcel returned no rate for this job",
			);
		}

		const best = cheapest(first.quotations);
		if (!best) {
			throw new EasyParcelNotDeliverable(
				"No courier on EasyParcel serves this route at this size",
			);
		}

		return {
			carrierId: "easyparcel",
			priceRm: num(best.pricing.total_amount),
			// `delivery_duration` is prose ("1-3 working days"), not minutes, and
			// converting it would put a made-up number on the screen.
			etaMinutes: null,
			quoteRef: best.courier.service_id,
			notes: `${best.courier.courier_name ?? "Courier"} — ${best.courier.service_name ?? best.courier.service_id}${
				best.courier.delivery_duration
					? `, ${best.courier.delivery_duration}`
					: ""
			}`,
		};
	},

	async book(): Promise<never> {
		throw new Error("not implemented until Task 5");
	},

	async track(): Promise<never> {
		throw new Error("not implemented until Task 5");
	},
};
