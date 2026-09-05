import { describe, expect, it } from "vitest";
import { subdivisionCode } from "../malaysia";

describe("subdivisionCode", () => {
	it("maps the states Google actually returns", () => {
		expect(subdivisionCode("Selangor")).toBe("MY-10");
		expect(subdivisionCode("Johor")).toBe("MY-01");
		expect(subdivisionCode("Sarawak")).toBe("MY-13");
	});

	it("is case and whitespace insensitive", () => {
		expect(subdivisionCode("  selangor ")).toBe("MY-10");
	});

	it("accepts the names Google and the post office disagree about", () => {
		// Google says "Penang"; EasyParcel's own examples say "Pulau Pinang".
		expect(subdivisionCode("Penang")).toBe("MY-07");
		expect(subdivisionCode("Pulau Pinang")).toBe("MY-07");
		expect(subdivisionCode("Malacca")).toBe("MY-04");
		expect(subdivisionCode("Melaka")).toBe("MY-04");
	});

	it("handles the federal territories, prefix and all", () => {
		expect(subdivisionCode("Kuala Lumpur")).toBe("MY-14");
		expect(subdivisionCode("Federal Territory of Kuala Lumpur")).toBe("MY-14");
		expect(subdivisionCode("Wilayah Persekutuan Kuala Lumpur")).toBe("MY-14");
		expect(subdivisionCode("Putrajaya")).toBe("MY-16");
		expect(subdivisionCode("Labuan")).toBe("MY-15");
	});

	it("passes an ISO code straight through", () => {
		expect(subdivisionCode("MY-10")).toBe("MY-10");
	});

	it("returns null for a name it does not know", () => {
		expect(subdivisionCode("Singapore")).toBeNull();
		expect(subdivisionCode("")).toBeNull();
	});
});
