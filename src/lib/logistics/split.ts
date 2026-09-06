import { longestEdgeMm } from "./measure";
import type { DeliveryItem } from "./types";

/**
 * Cutting one job in two, as numbers.
 *
 * A finished kitchen is not one kind of freight. The carcasses need a lorry
 * and the boxed hardware would ride a parcel network for a tenth of the price,
 * but a delivery is quoted whole — so a job carrying both gets refused by
 * every parcel partner on size and priced by the vehicle partners as if the
 * handles needed a lorry of their own. Splitting it is the admin's move, and
 * this is the arithmetic behind it.
 *
 * Pure and framework-free, like the rest of `lib/logistics`: the panel draws
 * the preview from these functions and the split endpoint writes the two rows
 * from the same ones, so what the admin was shown is what gets created.
 */

/**
 * The longest edge a parcel network will take on a single piece.
 *
 * ponytail: one number for every parcel partner. GDEX and EasyParcel publish
 * slightly different caps; split this per carrier the first time one of them
 * refuses a piece this lets through.
 */
export const PARCEL_MAX_EDGE_MM = 1200;

/**
 * The most one piece can weigh and still be a parcel — GDEX's published cap,
 * and the one that actually bites here. A 900mm carcass clears the girth rule
 * above and weighs 42 kg, so girth alone would offer a lorry's worth of
 * cabinets to a parcel network.
 *
 * An unweighed piece passes: weight is optional on a line item, and refusing
 * everything the catalogue has no figure for would propose an empty split on
 * most real jobs. The partner's own quote is the authority either way.
 */
export const PARCEL_MAX_PIECE_KG = 30;

/** The pieces a parcel network could actually take, by index. */
export function parcelCandidates(items: DeliveryItem[]): number[] {
	return items.flatMap((item, i) =>
		longestEdgeMm([item]) <= PARCEL_MAX_EDGE_MM &&
		(item.weightKg === null || item.weightKg <= PARCEL_MAX_PIECE_KG)
			? [i]
			: [],
	);
}

/**
 * Whether this set of items could go as a parcel consignment at all.
 *
 * Empty is false rather than vacuously true: a half with nothing on it is not
 * a parcel job, and calling it one would offer it for booking.
 */
export function canGoByParcel(items: DeliveryItem[]): boolean {
	return items.length > 0 && parcelCandidates(items).length === items.length;
}

/**
 * The two halves, from the ticked rows.
 *
 * Indexes are filtered against the list rather than trusted: they come from a
 * panel that may have been open while someone else edited the job, and an
 * index past the end would otherwise move `undefined` onto a lorry.
 */
export function splitItems(
	items: DeliveryItem[],
	indexes: number[],
): { moved: DeliveryItem[]; kept: DeliveryItem[] } {
	const ticked = new Set(indexes.filter((i) => i >= 0 && i < items.length));
	return {
		moved: items.filter((_, i) => ticked.has(i)),
		kept: items.filter((_, i) => !ticked.has(i)),
	};
}
