import { describe, expect, it } from "vitest";
import type { DeliveryEventRow, QuoteRow } from "../form";
import { defaultChoice, journeySteps, quoteTags } from "../tracking";

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
