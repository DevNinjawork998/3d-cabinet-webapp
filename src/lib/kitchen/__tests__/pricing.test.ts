import { describe, expect, it } from "vitest";
import { moduleType } from "../catalogue";
import { addModule, emptyLayout, removeModule } from "../layout";
import {
	cabinetPriceRm,
	computeKitchenPrice,
	FINISH_SURCHARGE_RM_PER_FT,
	MM_PER_FT,
	RATES,
	worktopFt,
} from "../pricing";

const WALL_MM = 6000;
const empty = () => emptyLayout(WALL_MM);

/** The sample job's own run: two 900 bases, a 400 drawer base, a 600 tall. */
const kitchen = () => {
	let next = empty();
	next = addModule(next, "base-900", 0, "b1");
	next = addModule(next, "base-400-drawers", 900, "b2");
	next = addModule(next, "base-900", 1300, "b3");
	next = addModule(next, "tall-600", 2200, "t1");
	next = addModule(next, "wall-900", 0, "w1");
	return next;
};

describe("cabinetPriceRm", () => {
	it("charges a cabinet by its own width at its kind's rate", () => {
		const base = moduleType("base-900");
		if (!base) throw new Error("missing module");
		// 900mm = 2.953ft at RM 350/ft, white adding nothing.
		expect(cabinetPriceRm(base, "white")).toBeCloseTo(
			(900 / MM_PER_FT) * RATES.baseRmPerFt,
			6,
		);
	});

	it("adds the finish surcharge per foot", () => {
		const base = moduleType("base-900");
		if (!base) throw new Error("missing module");
		const plain = cabinetPriceRm(base, "white");
		const noir = cabinetPriceRm(base, "strata-noir");
		expect(noir - plain).toBeCloseTo(
			(900 / MM_PER_FT) * FINISH_SURCHARGE_RM_PER_FT["strata-noir"],
			6,
		);
	});

	it("prices a tall unit above a base unit of the same width", () => {
		const tall = moduleType("tall-600");
		const base = moduleType("base-600");
		if (!tall || !base) throw new Error("missing module");
		expect(cabinetPriceRm(tall, "white")).toBeGreaterThan(
			cabinetPriceRm(base, "white"),
		);
	});
});

describe("worktopFt", () => {
	it("measures the base run only — not the wall, not the tall units", () => {
		// 900 + 400 + 900 of base; the 600 tall gets no worktop.
		expect(worktopFt(kitchen())).toBeCloseTo(2200 / MM_PER_FT, 6);
	});

	it("is nothing when there is no base run", () => {
		const wallOnly = addModule(empty(), "wall-900", 0, "w");
		expect(worktopFt(wallOnly)).toBe(0);
	});
});

describe("computeKitchenPrice", () => {
	it("prices an empty kitchen at nothing", () => {
		const price = computeKitchenPrice(empty(), "white");
		expect(price.totalRm).toBe(0);
		expect(price.cabinets).toEqual([]);
	});

	it("totals the categories, and the categories total the cabinets", () => {
		const price = computeKitchenPrice(kitchen(), "white");
		const cabinetSum = price.cabinets.reduce(
			(total, line) => total + line.amountRm,
			0,
		);
		const worktop = price.worktopFt * RATES.worktopRmPerFt;
		expect(price.totalRm).toBeCloseTo(cabinetSum + worktop, 6);
	});

	it("matches a hand-computed figure for the sample run", () => {
		const price = computeKitchenPrice(kitchen(), "white");
		const ft = (mm: number) => mm / MM_PER_FT;
		const expected =
			ft(2200) * RATES.baseRmPerFt +
			ft(900) * RATES.wallRmPerFt +
			ft(600) * RATES.tallRmPerFt +
			ft(2200) * RATES.worktopRmPerFt;
		expect(price.totalRm).toBeCloseTo(expected, 6);
	});

	it("gives one line per cabinet", () => {
		const price = computeKitchenPrice(kitchen(), "white");
		expect(price.cabinets).toHaveLength(5);
		expect(price.cabinets.map((line) => line.label)).toContain("Tall 600");
	});

	it("goes up with a dearer finish and down when a cabinet is removed", () => {
		const plain = computeKitchenPrice(kitchen(), "white").totalRm;
		const noir = computeKitchenPrice(kitchen(), "strata-noir").totalRm;
		expect(noir).toBeGreaterThan(plain);

		const fewer = computeKitchenPrice(
			removeModule(kitchen(), "b1"),
			"white",
		).totalRm;
		expect(fewer).toBeLessThan(plain);
	});

	it("charges nothing for a gap — only for cabinets that exist", () => {
		const packed = addModule(empty(), "base-900", 0, "a");
		const spaced = addModule(empty(), "base-900", 3000, "a");
		expect(computeKitchenPrice(spaced, "white").totalRm).toBeCloseTo(
			computeKitchenPrice(packed, "white").totalRm,
			6,
		);
	});
});
