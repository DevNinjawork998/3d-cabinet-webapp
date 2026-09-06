import { describe, expect, it } from "vitest";
import type { DeliveryEventRow, QuoteRow } from "../form";
import { defaultChoice, etaLabel, journeySteps, quoteTags } from "../tracking";

const event = (
	status: DeliveryEventRow["status"],
	at: string,
): DeliveryEventRow => ({
	id: `${status}-${at}`,
	at,
	source: "carrier",
	status,
	message: "",
	actor: null,
});

const quote = (
	carrierId: string,
	priceRm: number | null,
	etaMinutes: number | null,
	error?: string,
): QuoteRow => ({ carrierId, priceRm, etaMinutes, error });

describe("journeySteps", () => {
	it("marks everything before the current state done and the current one active", () => {
		const steps = journeySteps("PICKED_UP", []);
		expect(steps.map((s) => s.state)).toEqual([
			"done",
			"done",
			"active",
			"pending",
			"pending",
		]);
	});

	it("closes the last stop rather than leaving it active", () => {
		expect(journeySteps("DELIVERED", []).map((s) => s.state)).toEqual(
			Array(5).fill("done"),
		);
	});

	it("takes each stop's time from the timeline", () => {
		const steps = journeySteps("BOOKED", [
			event("BOOKED", "2026-09-05T10:00:00.000Z"),
		]);
		expect(steps[0].at).toBe("2026-09-05T10:00:00.000Z");
		expect(steps[1].at).toBeNull();
	});

	it("takes the latest time when a stop was reached twice", () => {
		const steps = journeySteps("BOOKED", [
			event("BOOKED", "2026-09-05T12:00:00.000Z"),
			event("BOOKED", "2026-09-05T10:00:00.000Z"),
		]);
		expect(steps[0].at).toBe("2026-09-05T12:00:00.000Z");
	});

	it("shows a cancelled job as only what actually happened, with nothing active", () => {
		const steps = journeySteps("CANCELLED", [
			event("BOOKED", "2026-09-05T10:00:00.000Z"),
		]);
		expect(steps.map((s) => s.state)).toEqual([
			"done",
			"pending",
			"pending",
			"pending",
			"pending",
		]);
	});
});

describe("quoteTags", () => {
	it("badges the cheapest and the fastest separately", () => {
		expect(
			quoteTags([
				quote("lalamove", 65, 40),
				quote("gdex", 38, 2880),
				quote("citylink", 29, 4320),
			]),
		).toEqual({ citylink: "Cheapest", lalamove: "Fastest" });
	});

	it("never badges one carrier twice", () => {
		expect(quoteTags([quote("a", 10, 30), quote("b", 20, 60)])).toEqual({
			a: "Cheapest",
		});
	});

	it("says nothing on a tie", () => {
		expect(quoteTags([quote("a", 10, 30), quote("b", 10, 30)])).toEqual({});
	});

	it("says nothing about a single comparable quote", () => {
		expect(quoteTags([quote("a", 10, 30), quote("b", null, null)])).toEqual({});
	});

	it("ignores a carrier that failed", () => {
		expect(
			quoteTags([
				quote("a", 10, 30),
				quote("b", 5, 10, "timed out"),
				quote("c", 20, 60),
			]),
		).toEqual({ a: "Cheapest" });
	});
});

describe("defaultChoice", () => {
	it("points at the cheapest priced quote", () => {
		expect(defaultChoice([quote("a", 65, 40), quote("b", 38, 90)])).toBe("b");
	});

	it("falls back to the first usable quote when nothing carries a price", () => {
		expect(
			defaultChoice([
				quote("a", null, null, "no credentials"),
				quote("b", null, null),
			]),
		).toBe("b");
	});

	it("chooses nothing when every partner failed", () => {
		expect(defaultChoice([quote("a", 10, 30, "timed out")])).toBeNull();
	});
});

describe("journeySteps for a carrier that never names a driver", () => {
	it("drops the driver stop for a parcel carrier", () => {
		// GDEX reports where the parcel is, never who is holding it — its
		// status table has no entry mapping to DRIVER_ASSIGNED. Showing the
		// stop anyway leaves one that can never be reached.
		const steps = journeySteps("BOOKED", [], "gdex");
		expect(steps.map((s) => s.status)).toEqual([
			"BOOKED",
			"PICKED_UP",
			"IN_TRANSIT",
			"DELIVERED",
		]);
	});

	it("keeps it for a carrier that does report one", () => {
		const steps = journeySteps("BOOKED", [], "lalamove");
		expect(steps.map((s) => s.status)).toContain("DRIVER_ASSIGNED");
	});

	it("drops in-transit for Lalamove, which never reports it either", () => {
		// The rule is not "parcel carriers lose the driver stop" — it is that a
		// carrier only shows the stops its own status table can reach. A
		// Lalamove driver who has collected stays PICKED_UP until COMPLETED, so
		// IN_TRANSIT is a stop that carrier can never occupy. See status.ts.
		expect(journeySteps("BOOKED", [], "lalamove").map((s) => s.status)).toEqual(
			["BOOKED", "DRIVER_ASSIGNED", "PICKED_UP", "DELIVERED"],
		);
	});

	it("keeps the full journey when the carrier is not known yet", () => {
		// A draft has no carrier. Hiding a stop on a guess would be worse than
		// showing one that may not apply.
		expect(journeySteps("DRAFT", [], null)).toHaveLength(5);
	});

	it("still marks progress correctly on the shortened journey", () => {
		const steps = journeySteps("IN_TRANSIT", [], "gdex");
		expect(steps.map((s) => s.state)).toEqual([
			"done",
			"done",
			"active",
			"pending",
		]);
	});
});

describe("etaLabel", () => {
	it("keeps a vehicle partner's answer in minutes", () => {
		expect(etaLabel(55)).toBe("~55 min");
	});

	// A parcel network answers in days and says so in minutes; 4320 read as
	// minutes sits next to "~55 min" as if the two were comparable.
	it("says a parcel partner's answer in days", () => {
		expect(etaLabel(1440)).toBe("~1 day");
		expect(etaLabel(4320)).toBe("~3 days");
	});

	it("has nothing to say when the partner gave no ETA", () => {
		expect(etaLabel(null)).toBeNull();
	});
});
