import { describe, expect, it } from "vitest";
import {
	doorPriceRm,
	doorPriceRmIn,
	PLANNER_CATALOGUE,
	RATES,
	ROOM_TYPES,
	sizePriceRm,
} from "../catalogue";
import { plannerCatalogueSchema } from "../catalogueSchema";
import {
	addModule,
	emptyLayout,
	removeModule,
	setBaseSkirting,
	setDoor,
	setWallToCeiling,
	setWallToWall,
	setWallWidth,
	setWidth,
	starterFor,
} from "../layout";
import {
	ceilingTrimFt,
	computePlannerPrice,
	endPanelPriceRm,
	MM_PER_FT,
	skirtingFt,
	WORKTOP_RM_PER_FT,
	worktopFt,
} from "../pricing";

const WALL_MM = 6000;
const empty = () => emptyLayout(WALL_MM);

const run = () => {
	let next = empty();
	next = addModule(next, "base-cabinet", 0, "b1", 900);
	next = addModule(next, "base-drawers", 900, "b2", 400);
	next = addModule(next, "tall-cabinet", 1300, "t1", 600);
	next = addModule(next, "wall-cabinet", 0, "w1", 900);
	return next;
};

describe("per-unit pricing", () => {
	it("prices an empty room at nothing", () => {
		const price = computePlannerPrice(empty(), "white");
		expect(price.totalRm).toBe(0);
		expect(price.cabinets).toEqual([]);
	});

	it("charges each carcass its own size's price", () => {
		const price = computePlannerPrice(run(), "white");
		const line = price.cabinets.find((l) => l.id === "b1");
		expect(line?.carcassRm).toBe(sizePriceRm("base-cabinet", 900));
	});

	it("re-prices when the size changes", () => {
		const before = computePlannerPrice(run(), "white").totalRm;
		const wider = setWidth(run(), "b1", 900);
		expect(computePlannerPrice(wider, "white").totalRm).toBe(before);

		const narrower = setWidth(run(), "b1", 600);
		expect(computePlannerPrice(narrower, "white").totalRm).toBeLessThan(before);
	});

	it("charges nothing for a door until one is chosen", () => {
		const bare = computePlannerPrice(run(), "white");
		expect(bare.cabinets.every((line) => line.doorRm === 0)).toBe(true);
		expect(
			bare.categories.find((line) => line.label === "Doors")?.amountRm,
		).toBe(0);
	});

	it("adds the door's own price once it is put on", () => {
		const doored = setDoor(run(), "b1", "shaker");
		const price = computePlannerPrice(doored, "white");
		const line = price.cabinets.find((l) => l.id === "b1");

		expect(line?.doorRm).toBe(doorPriceRm("shaker", 900));
		expect(line?.doorLabel).toBe("Shaker");
		expect(line?.amountRm).toBe(
			sizePriceRm("base-cabinet", 900) + doorPriceRm("shaker", 900),
		);
	});

	it("prices a dearer door style above a plainer one", () => {
		const slab = computePlannerPrice(setDoor(run(), "b1", "slab"), "white");
		const glass = computePlannerPrice(setDoor(run(), "b1", "glass"), "white");
		expect(glass.totalRm).toBeGreaterThan(slab.totalRm);
	});

	it("totals the categories, and they total the lines", () => {
		const price = computePlannerPrice(setDoor(run(), "b1", "slab"), "white");
		const lines = price.cabinets.reduce((sum, l) => sum + l.amountRm, 0);
		const perCabinet = price.categories.filter(
			(c) => c.label === "Carcasses" || c.label === "Doors",
		);
		const byLength = price.categories.filter(
			(c) => c.label !== "Carcasses" && c.label !== "Doors",
		);
		const sum = (of: typeof price.categories) =>
			of.reduce((total, c) => total + c.amountRm, 0);

		// The two per-cabinet categories are exactly the cabinet lines split in
		// two, and the total is those plus everything charged by the foot. Stated
		// against the categories rather than naming each one, so adding a
		// length-priced piece does not silently stop being checked.
		expect(sum(perCabinet)).toBeCloseTo(lines, 6);
		expect(price.totalRm).toBeCloseTo(lines + sum(byLength), 6);
		expect(sum(byLength)).toBeGreaterThan(price.worktopFt * WORKTOP_RM_PER_FT);
	});

	it("drops when a cabinet is removed", () => {
		const before = computePlannerPrice(run(), "white").totalRm;
		const fewer = computePlannerPrice(removeModule(run(), "b1"), "white");
		expect(fewer.totalRm).toBeLessThan(before);
	});
});

describe("worktop", () => {
	it("measures only the families that carry one", () => {
		// 900 base + 400 drawer base carry a worktop; the tall unit and the wall
		// cabinet do not.
		expect(worktopFt(run())).toBeCloseTo(1300 / MM_PER_FT, 6);
	});

	it("is nothing in a room whose products have no worktop", () => {
		const bedroom = starterFor("bedroom");
		expect(worktopFt(bedroom)).toBe(0);
	});
});

describe("catalogue is a real parameter, not just an import default", () => {
	it("PLANNER_CATALOGUE satisfies its own schema", () => {
		expect(() => plannerCatalogueSchema.parse(PLANNER_CATALOGUE)).not.toThrow();
	});

	it("prices off a catalogue passed in explicitly", () => {
		const price = computePlannerPrice(run(), "white", PLANNER_CATALOGUE);
		expect(price.totalRm).toBe(computePlannerPrice(run(), "white").totalRm);
	});

	it("a different catalogue produces a different price", () => {
		const pricier = {
			...PLANNER_CATALOGUE,
			families: PLANNER_CATALOGUE.families.map((f) =>
				f.id === "base-cabinet"
					? {
							...f,
							sizes: f.sizes.map((s) => ({ ...s, priceRm: s.priceRm * 2 })),
						}
					: f,
			),
		};
		expect(
			computePlannerPrice(run(), "white", pricier).totalRm,
		).toBeGreaterThan(computePlannerPrice(run(), "white").totalRm);
	});

	it("the explicit-catalogue read agrees with the module-palette one", () => {
		expect(doorPriceRmIn(PLANNER_CATALOGUE, "shaker", 900)).toBe(
			doorPriceRm("shaker", 900),
		);
	});
});

describe("every room prices", () => {
	it("gives each room's starter a believable, non-zero total", () => {
		for (const room of ROOM_TYPES) {
			const price = computePlannerPrice(starterFor(room.id), "white");
			expect(price.totalRm).toBeGreaterThan(0);
			// A single wall of cabinetry should not read as a car.
			expect(price.totalRm).toBeLessThan(30000);
		}
	});
});

describe("ceiling trim", () => {
	it("charges nothing while the run hangs", () => {
		const price = computePlannerPrice(run(), "white");
		expect(ceilingTrimFt(run())).toBe(0);
		expect(price.ceilingTrimFt).toBe(0);
		expect(price.categories.some((c) => c.label === "Ceiling trim")).toBe(
			false,
		);
	});

	it("charges the wall run's length once it goes to the ceiling", () => {
		const flushed = setWallToCeiling(run(), true);
		// One 900mm wall unit is the whole hung row.
		expect(ceilingTrimFt(flushed)).toBeCloseTo(900 / MM_PER_FT, 6);
		expect(
			computePlannerPrice(flushed, "white").categories.some(
				(c) => c.label === "Ceiling trim",
			),
		).toBe(true);
	});

	it("costs more than the same run hanging, by the strip and nothing else", () => {
		const hanging = computePlannerPrice(run(), "white");
		const flushed = computePlannerPrice(setWallToCeiling(run(), true), "white");
		expect(flushed.totalRm).toBeGreaterThan(hanging.totalRm);
		expect(flushed.totalRm - hanging.totalRm).toBeCloseTo(
			flushed.ceilingTrimFt * RATES.ceilingTrimRmPerFt,
			6,
		);
	});

	it("charges nothing for a ceiling run with nothing hung on the wall", () => {
		let floorOnly = empty();
		floorOnly = addModule(floorOnly, "base-cabinet", 0, "b1", 900);
		expect(ceilingTrimFt(setWallToCeiling(floorOnly, true))).toBe(0);
	});
});

describe("skirting", () => {
	it("charges every base run, since the legs always need covering", () => {
		const price = computePlannerPrice(run(), "white");
		// base 900 + drawers 400 + tall 600, all touching from 0.
		expect(skirtingFt(run())).toBeCloseTo(1900 / MM_PER_FT, 6);
		expect(price.categories.some((c) => c.label === "Skirting")).toBe(true);
	});

	it("does not charge across a gap the board is not cut for", () => {
		let apart = empty();
		apart = addModule(apart, "base-cabinet", 0, "b1", 900);
		apart = addModule(apart, "base-cabinet", 1500, "b2", 900);

		let together = empty();
		together = addModule(together, "base-cabinet", 0, "b1", 900);
		together = addModule(together, "base-cabinet", 900, "b2", 900);

		// Same cabinets either way, so the same board length — the gap splits the
		// board in two, it does not add a third piece bridging it.
		expect(skirtingFt(apart)).toBeCloseTo(skirtingFt(together), 6);
		expect(skirtingFt(apart)).toBeCloseTo(1800 / MM_PER_FT, 6);
	});

	it("drops the line entirely when the customer turns the board off", () => {
		const bare = computePlannerPrice(setBaseSkirting(run(), false), "white");
		const skirted = computePlannerPrice(run(), "white");

		expect(bare.skirtingFt).toBe(0);
		expect(bare.categories.some((c) => c.label === "Skirting")).toBe(false);
		expect(skirted.totalRm - bare.totalRm).toBeCloseTo(
			skirted.skirtingFt * RATES.skirtingRmPerFt,
			6,
		);
	});

	it("charges nothing in a room with only wall units", () => {
		const wallOnly = addModule(empty(), "wall-cabinet", 0, "w", 900);
		expect(skirtingFt(wallOnly)).toBe(0);
		expect(
			computePlannerPrice(wallOnly, "white").categories.some(
				(c) => c.label === "Skirting",
			),
		).toBe(false);
	});

	it("adds exactly the board's own cost to the total", () => {
		const price = computePlannerPrice(run(), "white");
		const line = price.categories.find((c) => c.label === "Skirting");
		expect(line?.amountRm).toBeCloseTo(
			price.skirtingFt * RATES.skirtingRmPerFt,
			6,
		);
	});
});

describe("end panels", () => {
	it("clads every exposed side, and says how many", () => {
		const price = computePlannerPrice(run(), "white");
		const line = price.categories.find((c) => c.label === "End panels");

		// The run is base 900 + drawers 400 + tall 600 touching from 0, plus one
		// wall 900 on its own: 2 outer floor sides + 2 wall sides.
		expect(price.endPanelCount).toBe(4);
		expect(line?.detail).toContain("4 panels");
	});

	it("prices a tall end above a wall end — a bigger board is a bigger panel", () => {
		const tall = addModule(empty(), "tall-cabinet", 0, "t1", 600);
		const wall = addModule(empty(), "wall-cabinet", 0, "w1", 900);

		expect(endPanelPriceRm(tall).amountRm).toBeGreaterThan(
			endPanelPriceRm(wall).amountRm,
		);
		expect(endPanelPriceRm(tall).amountRm).toBe(RATES.endPanelTallRm * 2);
	});

	it("charges nothing once the run is enclosed and unbroken", () => {
		let run = addModule(
			setWallWidth(empty(), 1800),
			"base-cabinet",
			0,
			"b1",
			900,
		);
		run = addModule(run, "base-cabinet", 900, "b2", 900);
		const enclosed = computePlannerPrice(setWallToWall(run, true), "white");

		expect(enclosed.endPanelCount).toBe(0);
		expect(enclosed.categories.some((c) => c.label === "End panels")).toBe(
			false,
		);
	});

	it("costs less enclosed than open, by exactly the two buried ends", () => {
		let base = addModule(
			setWallWidth(empty(), 1800),
			"base-cabinet",
			0,
			"b1",
			900,
		);
		base = addModule(base, "base-cabinet", 900, "b2", 900);
		const open = computePlannerPrice(base, "white");
		const shut = computePlannerPrice(setWallToWall(base, true), "white");

		expect(open.totalRm - shut.totalRm).toBeCloseTo(
			RATES.endPanelBaseRm * 2,
			6,
		);
	});
});
