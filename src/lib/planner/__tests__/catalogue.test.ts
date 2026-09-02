import { describe, expect, it } from "vitest";
import {
	CONSTRUCTION,
	constructionOf,
	defaultWidthMmIn,
	familyIn,
	PLANNER_CATALOGUE,
	RATES,
	ratesOf,
	roomTypeIn,
} from "../catalogue";

describe("familyIn", () => {
	it("finds a family in the catalogue passed in", () => {
		expect(familyIn(PLANNER_CATALOGUE, "base-cabinet")?.kind).toBe("base");
	});

	it("is undefined for a family the catalogue does not carry", () => {
		expect(familyIn(PLANNER_CATALOGUE, "no-such-family")).toBeUndefined();
	});

	it("reads the catalogue given, not the seed", () => {
		const trimmed = {
			...PLANNER_CATALOGUE,
			families: PLANNER_CATALOGUE.families.filter(
				(f) => f.id !== "base-cabinet",
			),
		};
		expect(familyIn(trimmed, "base-cabinet")).toBeUndefined();
	});
});

describe("roomTypeIn", () => {
	it("finds a room", () => {
		expect(roomTypeIn(PLANNER_CATALOGUE, "kitchen").label).toBe("Kitchen");
	});

	it("throws on a room the catalogue does not carry", () => {
		const trimmed = {
			...PLANNER_CATALOGUE,
			roomTypes: PLANNER_CATALOGUE.roomTypes.filter((r) => r.id !== "foyer"),
		};
		expect(() => roomTypeIn(trimmed, "foyer")).toThrow(/foyer/);
	});
});

describe("defaultWidthMmIn", () => {
	it("takes the middle rung of the ladder", () => {
		const sizes = familyIn(PLANNER_CATALOGUE, "base-cabinet")?.sizes ?? [];
		expect(defaultWidthMmIn(PLANNER_CATALOGUE, "base-cabinet")).toBe(
			sizes[Math.floor(sizes.length / 2)].widthMm,
		);
	});

	it("falls back to 600 for an unknown family", () => {
		expect(defaultWidthMmIn(PLANNER_CATALOGUE, "no-such-family")).toBe(600);
	});
});

describe("constructionOf", () => {
	it("is the seed when the catalogue overrides nothing", () => {
		expect(constructionOf(PLANNER_CATALOGUE)).toEqual(CONSTRUCTION);
	});

	it("takes the catalogue's own board thickness", () => {
		const thick = {
			...PLANNER_CATALOGUE,
			construction: { ...CONSTRUCTION, panelThicknessMm: 18 },
		};
		expect(constructionOf(thick).panelThicknessMm).toBe(18);
	});

	it("does not mutate the seed", () => {
		constructionOf({
			...PLANNER_CATALOGUE,
			construction: { ...CONSTRUCTION, panelThicknessMm: 18 },
		});
		expect(CONSTRUCTION.panelThicknessMm).toBe(16);
	});
});

describe("ratesOf", () => {
	it("is the seed when the catalogue carries no rates", () => {
		expect(ratesOf(PLANNER_CATALOGUE)).toEqual(RATES);
	});

	it("takes the catalogue's worktop rate", () => {
		const priced = {
			...PLANNER_CATALOGUE,
			rates: { worktopRmPerFt: 275 },
		};
		expect(ratesOf(priced).worktopRmPerFt).toBe(275);
	});

	/** `rates` has one required key and five optional ones, so a real published
	 * catalogue routinely omits some. Absent must mean "keep the fallback",
	 * never "undefined". */
	it("keeps the fallback for the rates a catalogue omits", () => {
		const partial = {
			...PLANNER_CATALOGUE,
			rates: { worktopRmPerFt: 275 },
		};
		expect(ratesOf(partial).skirtingRmPerFt).toBe(RATES.skirtingRmPerFt);
		expect(ratesOf(partial).endPanelTallRm).toBe(RATES.endPanelTallRm);
	});

	it("does not mutate the seed", () => {
		ratesOf({ ...PLANNER_CATALOGUE, rates: { worktopRmPerFt: 275 } });
		expect(RATES.worktopRmPerFt).toBe(200);
	});
});
