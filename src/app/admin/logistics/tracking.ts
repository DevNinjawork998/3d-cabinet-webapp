import type { DeliveryStatusName } from "@/lib/logistics/types";
import type { DeliveryEventRow, QuoteRow } from "./form";

/**
 * The two derivations the delivery panel draws from data it already has: where
 * a booked job has got to, and which quote is worth pointing at.
 *
 * Pure and here rather than in the component for the usual reason — a step
 * shown as reached when it has not been, or a "Cheapest" badge on the dearer
 * partner, is a wrong answer an admin acts on, and neither needs React to
 * prove.
 */

export const STATUS_LABEL: Record<DeliveryStatusName, string> = {
	DRAFT: "Draft",
	QUOTED: "Quoted",
	BOOKED: "Booked",
	DRIVER_ASSIGNED: "Driver assigned",
	PICKED_UP: "Picked up",
	IN_TRANSIT: "In transit",
	DELIVERED: "Delivered",
	CANCELLED: "Cancelled",
	FAILED: "Failed",
};

/** The states a job passes through, in the order the tracker shows them. */
export const JOURNEY: DeliveryStatusName[] = [
	"BOOKED",
	"DRIVER_ASSIGNED",
	"PICKED_UP",
	"IN_TRANSIT",
	"DELIVERED",
];

export type JourneyStep = {
	status: DeliveryStatusName;
	label: string;
	/** When the job entered this state, from the timeline. */
	at: string | null;
	state: "done" | "active" | "pending";
};

/**
 * The five-stop tracker.
 *
 * A cancelled or failed job is off the journey entirely, so there is no "here"
 * to mark — those fall back to the timeline, showing as reached exactly the
 * stops that actually happened before it stopped.
 */
export function journeySteps(
	status: DeliveryStatusName,
	events: DeliveryEventRow[],
): JourneyStep[] {
	const reached = JOURNEY.indexOf(status);
	return JOURNEY.map((step, i) => {
		// Events arrive newest first, so the first match is the latest time the
		// job entered this state — the one worth showing after a re-book.
		const at = events.find((event) => event.status === step)?.at ?? null;
		const state: JourneyStep["state"] =
			reached === -1
				? at === null
					? "pending"
					: "done"
				: i < reached || status === "DELIVERED"
					? "done"
					: i === reached
						? "active"
						: "pending";
		return { status: step, label: STATUS_LABEL[step], at, state };
	});
}

/**
 * "Cheapest" and "Fastest", but only where they mean something: a tie is not a
 * winner, a single quote is not a comparison, and a carrier that already wears
 * the price badge does not get a second one.
 */
export function quoteTags(quotes: QuoteRow[]): Record<string, string> {
	const usable = quotes.filter((quote) => quote.error === undefined);
	const tags: Record<string, string> = {};
	if (usable.length < 2) return tags;

	const best = <K extends "priceRm" | "etaMinutes">(field: K) => {
		const known = usable.filter((quote) => quote[field] !== null);
		if (known.length < 2) return null;
		const low = Math.min(...known.map((quote) => quote[field] as number));
		const winners = known.filter((quote) => quote[field] === low);
		return winners.length === 1 ? winners[0].carrierId : null;
	};

	const cheapest = best("priceRm");
	if (cheapest !== null) tags[cheapest] = "Cheapest";
	const fastest = best("etaMinutes");
	if (fastest !== null && tags[fastest] === undefined)
		tags[fastest] = "Fastest";
	return tags;
}

/** The quote the panel points at when a comparison lands: the cheapest one. */
export function defaultChoice(quotes: QuoteRow[]): string | null {
	const usable = quotes.filter((quote) => quote.error === undefined);
	const priced = usable.filter((quote) => quote.priceRm !== null);
	if (priced.length > 0) {
		return priced.reduce((a, b) =>
			(b.priceRm as number) < (a.priceRm as number) ? b : a,
		).carrierId;
	}
	return usable[0]?.carrierId ?? null;
}
