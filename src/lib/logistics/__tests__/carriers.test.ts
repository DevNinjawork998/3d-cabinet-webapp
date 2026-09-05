import { describe, expect, it } from "vitest";
import {
	pickupPin,
	pickupPlace,
	WORKSHOP_ADDRESS,
	WORKSHOP_CITY,
	WORKSHOP_PIN,
	WORKSHOP_POSTCODE,
	WORKSHOP_STATE,
} from "../carriers";

describe("pickupPin", () => {
	it("uses the workshop's own pin when the job leaves from the workshop", () => {
		// Without this the pickup is geocoded, `WORKSHOP_ADDRESS` is too vague to
		// place, and Lalamove refuses a stop with no coordinates — so every job
		// was unquotable.
		expect(pickupPin(WORKSHOP_ADDRESS, null, null)).toEqual(WORKSHOP_PIN);
	});

	it("lets an admin's typed pin win over the workshop default", () => {
		expect(pickupPin(WORKSHOP_ADDRESS, 3.15, 101.59)).toEqual({
			lat: 3.15,
			lng: 101.59,
		});
	});

	it("sends no pin for a pickup somewhere else, so it gets geocoded", () => {
		expect(pickupPin("12 Jalan Setia, Shah Alam", null, null)).toBeNull();
	});

	it("does not attach the workshop pin to a half-given coordinate", () => {
		expect(pickupPin("12 Jalan Setia, Shah Alam", 3.15, null)).toBeNull();
	});

	it("is in Selangor, so a swapped pair would be caught", () => {
		expect(WORKSHOP_PIN.lat).toBeGreaterThan(2);
		expect(WORKSHOP_PIN.lat).toBeLessThan(4);
		expect(WORKSHOP_PIN.lng).toBeGreaterThan(100);
		expect(WORKSHOP_PIN.lng).toBeLessThan(103);
	});
});

describe("pickupPlace", () => {
	it("keeps a stored place over the workshop default", () => {
		const stored = { postcode: "40170", city: "Shah Alam", state: "MY-10" };
		expect(pickupPlace(WORKSHOP_ADDRESS, stored)).toEqual(stored);
	});

	it("uses the workshop's own place when the job leaves from the workshop and none is stored", () => {
		expect(
			pickupPlace(WORKSHOP_ADDRESS, {
				postcode: null,
				city: null,
				state: null,
			}),
		).toEqual({
			postcode: WORKSHOP_POSTCODE,
			city: WORKSHOP_CITY,
			state: WORKSHOP_STATE,
		});
	});

	it("sends no place for a pickup somewhere else with nothing stored", () => {
		expect(
			pickupPlace("12 Jalan Setia, Shah Alam", {
				postcode: null,
				city: null,
				state: null,
			}),
		).toBeNull();
	});
});
