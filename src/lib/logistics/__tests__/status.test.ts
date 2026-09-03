import { describe, expect, it } from "vitest";
import { CARRIER_IDS } from "../carriers";
import {
	CARRIER_STATUS_MAPS,
	isForwardTransition,
	mapCarrierStatus,
	normaliseStatusKey,
} from "../status";

describe("normaliseStatusKey", () => {
	it("folds case, spacing and hyphens into one key", () => {
		expect(normaliseStatusKey("  IN TRANSIT ")).toBe("in_transit");
		expect(normaliseStatusKey("In-Transit")).toBe("in_transit");
		expect(normaliseStatusKey("in_transit")).toBe("in_transit");
	});
});

describe("mapCarrierStatus", () => {
	it("translates a known status however the carrier spelled it", () => {
		expect(mapCarrierStatus("manual", "PICKED UP")).toBe("PICKED_UP");
		expect(mapCarrierStatus("manual", "picked-up")).toBe("PICKED_UP");
	});

	it("returns null for a status it does not recognise, rather than guessing", () => {
		expect(mapCarrierStatus("manual", "held_at_depot")).toBeNull();
	});

	it("returns null for a carrier with no table yet", () => {
		expect(mapCarrierStatus("lalamove", "COMPLETED")).toBeNull();
	});

	it("returns null for a carrier that does not exist", () => {
		expect(mapCarrierStatus("nonesuch", "delivered")).toBeNull();
	});

	it("has a table for every carrier in the vocabulary", () => {
		for (const id of CARRIER_IDS) {
			expect(CARRIER_STATUS_MAPS[id]).toBeDefined();
		}
	});
});

describe("isForwardTransition", () => {
	it("allows a move along the journey", () => {
		expect(isForwardTransition("BOOKED", "PICKED_UP")).toBe(true);
	});

	it("rejects a late update that would move the job backwards", () => {
		expect(isForwardTransition("IN_TRANSIT", "PICKED_UP")).toBe(false);
	});

	it("rejects a repeat of the current status", () => {
		expect(isForwardTransition("IN_TRANSIT", "IN_TRANSIT")).toBe(false);
	});

	it("treats delivered, cancelled and failed as final", () => {
		expect(isForwardTransition("DELIVERED", "IN_TRANSIT")).toBe(false);
		expect(isForwardTransition("CANCELLED", "DELIVERED")).toBe(false);
		expect(isForwardTransition("FAILED", "DELIVERED")).toBe(false);
	});
});
