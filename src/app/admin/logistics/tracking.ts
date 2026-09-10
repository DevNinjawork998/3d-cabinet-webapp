import { CARRIER_STATUS_MAPS } from "@/lib/logistics/status";
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
/**
 * The stops this carrier can actually reach.
 *
 * A parcel network reports where the parcel is and never who is holding it, so
 * a GDEX job can never be DRIVER_ASSIGNED — and a stop that can never be
 * reached reads as a stalled job rather than a fact about parcel networks.
 *
 * Derived from the carrier's own status table rather than hardcoded per
 * carrier: a partner that starts reporting drivers gets the stop back the day
 * its table gains an entry, with no change here. An unknown carrier keeps the
 * full journey — a draft has no carrier yet, and hiding a stop on a guess is
 * worse than showing one that may not apply.
 */
function journeyFor(carrierId: string | null): DeliveryStatusName[] {
	const table = carrierId === null ? null : CARRIER_STATUS_MAPS[carrierId];
	if (!table) return JOURNEY;
	const reported = new Set(Object.values(table));
	return JOURNEY.filter(
		(step) => step === "BOOKED" || step === "DELIVERED" || reported.has(step),
	);
}

/**
 * `events` is the structural minimum rather than `DeliveryEventRow` so the
 * public tracking page can pass its own narrower rows — it deliberately never
 * loads an event's message or actor.
 */
export function journeySteps(
	status: DeliveryStatusName,
	events: readonly Pick<DeliveryEventRow, "at" | "status">[],
	carrierId: string | null = null,
): JourneyStep[] {
	const journey = journeyFor(carrierId);
	const reached = journey.indexOf(status);
	return journey.map((step, i) => {
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

/**
 * A quote's ETA as an admin reads it.
 *
 * A parcel network answers in days and says so in minutes — "~4320 min" is a
 * number nobody converts in their head, and next to a Lalamove "~55 min" it
 * reads as the same order of magnitude.
 */
export function etaLabel(minutes: number | null): string | null {
	if (minutes === null) return null;
	if (minutes < 1440) return `~${minutes} min`;
	const days = Math.round(minutes / 1440);
	return `~${days} day${days === 1 ? "" : "s"}`;
}
