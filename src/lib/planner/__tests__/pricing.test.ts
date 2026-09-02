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
import type { PlannerLayout } from "../layout";
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

/** These tests price against the bundled seed. Named so a reader can see at a
 * glance which catalogue a figure came from — the whole point of the
 * parameter. */
const price = (layout: PlannerLayout, finish = "white") =>
	computePlannerPrice(layout, finish, PLANNER_CATALOGUE);

describe("per-unit pricing", () => {
	it("prices an empty room at nothing", () => {
		const result = price(empty());
		expect(result.totalRm).toBe(0);
		expect(result.cabinets).toEqual([]);
	});

	it("charges each carcass its own size's price", () => {
		const result = price(run());
		const line = result.cabinets.find((l) => l.id === "b1");
		expect(line?.carcassRm).toBe(sizePriceRm("base-cabinet", 900));
	});

	it("re-prices when the size changes", () => {
		const before = price(run()).totalRm;
		const wider = setWidth(run(), "b1", 900);
		expect(price(wider).totalRm).toBe(before);

		const narrower = setWidth(run(), "b1", 600);
		expect(price(narrower).totalRm).toBeLessThan(before);
	});

	it("charges nothing for a door until one is chosen", () => {
		const bare = price(run());
		expect(bare.cabinets.every((line) => line.doorRm === 0)).toBe(true);
		expect(
			bare.categories.find((line) => line.label === "Doors")?.amountRm,
		).toBe(0);
	});

	it("adds the door's own price once it is put on", () => {
		const doored = setDoor(run(), "b1", "shaker");
		const result = price(doored);
		const line = result.cabinets.find((l) => l.id === "b1");

		expect(line?.doorRm).toBe(doorPriceRm("shaker", 900));
		expect(line?.doorLabel).toBe("Shaker");
		expect(line?.amountRm).toBe(
			sizePriceRm("base-cabinet", 900) + doorPriceRm("shaker", 900),
		);
	});

	it("prices a dearer door style above a plainer one", () => {
		const slab = price(setDoor(run(), "b1", "slab"));
		const glass = price(setDoor(run(), "b1", "glass"));
		expect(glass.totalRm).toBeGreaterThan(slab.totalRm);
	});

	it("totals the categories, and they total the lines", () => {
		const result = price(setDoor(run(), "b1", "slab"));
		const lines = result.cabinets.reduce((sum, l) => sum + l.amountRm, 0);
		const perCabinet = result.categories.filter(
			(c) => c.label === "Carcasses" || c.label === "Doors",
		);
		const byLength = result.categories.filter(
			(c) => c.label !== "Carcasses" && c.label !== "Doors",
		);
		const sum = (of: typeof result.categories) =>
			of.reduce((total, c) => total + c.amountRm, 0);

		// The two per-cabinet categories are exactly the cabinet lines split in
		// two, and the total is those plus everything charged by the foot. Stated
		// against the categories rather than naming each one, so adding a
		// length-priced piece does not silently stop being checked.
		expect(sum(perCabinet)).toBeCloseTo(lines, 6);
		expect(result.totalRm).toBeCloseTo(lines + sum(byLength), 6);
		expect(sum(byLength)).toBeGreaterThan(result.worktopFt * WORKTOP_RM_PER_FT);
	});

	it("drops when a cabinet is removed", () => {
		const before = price(run()).totalRm;
		const fewer = price(removeModule(run(), "b1"));
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
		const explicit = computePlannerPrice(run(), "white", PLANNER_CATALOGUE);
		expect(explicit.totalRm).toBe(price(run()).totalRm);
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
		).toBeGreaterThan(price(run()).totalRm);
	});

	it("the explicit-catalogue read agrees with the module-palette one", () => {
		expect(doorPriceRmIn(PLANNER_CATALOGUE, "shaker", 900)).toBe(
			doorPriceRm("shaker", 900),
		);
	});

	it("charges the catalogue's worktop rate, not the bundled one", () => {
		const priced = {
			...PLANNER_CATALOGUE,
			rates: { worktopRmPerFt: RATES.worktopRmPerFt * 2 },
		};
		const base = computePlannerPrice(run(), "white", PLANNER_CATALOGUE);
		const dear = computePlannerPrice(run(), "white", priced);

		const line = (p: typeof base) =>
			p.categories.find((c) => c.label === "Worktop");
		expect(line(dear)?.amountRm).toBeCloseTo(
			(line(base)?.amountRm ?? 0) * 2,
			6,
		);
		expect(line(dear)?.detail).toContain(String(RATES.worktopRmPerFt * 2));
	});

	it("charges the catalogue's end-panel rates", () => {
		const priced = {
			...PLANNER_CATALOGUE,
			rates: {
				worktopRmPerFt: RATES.worktopRmPerFt,
				endPanelBaseRm: 1,
				endPanelWallRm: 1,
				endPanelTallRm: 1,
			},
		};
		const panels = endPanelPriceRm(run(), priced);
		expect(panels.amountRm).toBe(panels.count);
	});

	it("charges the catalogue's skirting and ceiling-trim rates", () => {
		const priced = {
			...PLANNER_CATALOGUE,
			rates: {
				worktopRmPerFt: RATES.worktopRmPerFt,
				skirtingRmPerFt: RATES.skirtingRmPerFt * 3,
				ceilingTrimRmPerFt: RATES.ceilingTrimRmPerFt * 3,
			},
		};
		const flush = setWallToCeiling(run(), true);
		const base = computePlannerPrice(flush, "white", PLANNER_CATALOGUE);
		const dear = computePlannerPrice(flush, "white", priced);

		const amount = (p: typeof base, label: string) =>
			p.categories.find((c) => c.label === label)?.amountRm ?? 0;
		expect(amount(dear, "Skirting")).toBeCloseTo(
			amount(base, "Skirting") * 3,
			6,
		);
		expect(amount(dear, "Ceiling trim")).toBeCloseTo(
			amount(base, "Ceiling trim") * 3,
			6,
		);
	});
});

describe("every room prices", () => {
	it("gives each room's starter a believable, non-zero total", () => {
		for (const room of ROOM_TYPES) {
			const result = price(starterFor(room.id));
			expect(result.totalRm).toBeGreaterThan(0);
			// A single wall of cabinetry should not read as a car.
			expect(result.totalRm).toBeLessThan(30000);
		}
	});
});

describe("ceiling trim", () => {
	it("charges nothing while the run hangs", () => {
		const result = price(run());
		expect(ceilingTrimFt(run())).toBe(0);
		expect(result.ceilingTrimFt).toBe(0);
		expect(result.categories.some((c) => c.label === "Ceiling trim")).toBe(
			false,
		);
	});

	it("charges the wall run's length once it goes to the ceiling", () => {
		const flushed = setWallToCeiling(run(), true);
		// One 900mm wall unit is the whole hung row.
		expect(ceilingTrimFt(flushed)).toBeCloseTo(900 / MM_PER_FT, 6);
		expect(
			price(flushed).categories.some((c) => c.label === "Ceiling trim"),
		).toBe(true);
	});

	it("costs more than the same run hanging, by the strip and nothing else", () => {
		const hanging = price(run());
		const flushed = price(setWallToCeiling(run(), true));
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
		const result = price(run());
		// base 900 + drawers 400 + tall 600, all touching from 0.
		expect(skirtingFt(run())).toBeCloseTo(1900 / MM_PER_FT, 6);
		expect(result.categories.some((c) => c.label === "Skirting")).toBe(true);
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
		const bare = price(setBaseSkirting(run(), false));
		const skirted = price(run());

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
		expect(price(wallOnly).categories.some((c) => c.label === "Skirting")).toBe(
			false,
		);
	});

	it("adds exactly the board's own cost to the total", () => {
		const result = price(run());
		const line = result.categories.find((c) => c.label === "Skirting");
		expect(line?.amountRm).toBeCloseTo(
			result.skirtingFt * RATES.skirtingRmPerFt,
			6,
		);
	});
});

describe("end panels", () => {
	it("clads every exposed side, and says how many", () => {
		const result = price(run());
		const line = result.categories.find((c) => c.label === "End panels");

		// The run is base 900 + drawers 400 + tall 600 touching from 0, plus one
		// wall 900 on its own: 2 outer floor sides + 2 wall sides.
		expect(result.endPanelCount).toBe(4);
		expect(line?.detail).toContain("4 panels");
	});

	it("prices a tall end above a wall end — a bigger board is a bigger panel", () => {
		const tall = addModule(empty(), "tall-cabinet", 0, "t1", 600);
		const wall = addModule(empty(), "wall-cabinet", 0, "w1", 900);

		expect(endPanelPriceRm(tall, PLANNER_CATALOGUE).amountRm).toBeGreaterThan(
			endPanelPriceRm(wall, PLANNER_CATALOGUE).amountRm,
		);
		expect(endPanelPriceRm(tall, PLANNER_CATALOGUE).amountRm).toBe(
			RATES.endPanelTallRm * 2,
		);
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
		const enclosed = price(setWallToWall(run, true));

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
		const open = price(base);
		const shut = price(setWallToWall(base, true));

		expect(open.totalRm - shut.totalRm).toBeCloseTo(
			RATES.endPanelBaseRm * 2,
			6,
		);
	});
});
