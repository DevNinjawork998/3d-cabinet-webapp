import { describe, expect, it } from "vitest";
import { fill } from "../fill";

describe("fill", () => {
	it("substitutes a token", () => {
		expect(fill("{count} cabinets", { count: 3 })).toBe("3 cabinets");
	});

	it("substitutes every occurrence", () => {
		expect(fill("{a} and {a}", { a: "x" })).toBe("x and x");
	});

	it("leaves an unknown token visible rather than printing undefined", () => {
		// A visible {missing} is a bug report; "undefined" on a quote is a lost sale.
		expect(fill("{missing} here", {})).toBe("{missing} here");
	});

	it("returns a template with no tokens unchanged", () => {
		expect(fill("Add cabinets", { n: 1 })).toBe("Add cabinets");
	});
});
