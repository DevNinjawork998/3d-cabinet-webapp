import { describe, expect, it } from "vitest";
import {
	doorPriceRm,
	PLANNER_CATALOGUE,
	ROOM_TYPES,
	sizePriceRm,
} from "../catalogue";
import { plannerCatalogueSchema } from "../catalogueSchema";
import {
	addModule,
	emptyLayout,
	removeModule,
	setDoor,
	setWidth,
	starterFor,
} from "../layout";
import { doorPriceRm as doorPriceRmIn } from "../lookup";
import {
	computePlannerPrice,
	MM_PER_FT,
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
		expect(price.totalRm).toBeCloseTo(
			lines + price.worktopFt * WORKTOP_RM_PER_FT,
			6,
		);
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

	it("lookup.ts's doorPriceRm agrees with catalogue.ts's for the shipped catalogue", () => {
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
