import { beforeEach, describe, expect, it } from "vitest";
import { MODULE_TYPES, moduleType } from "../catalogue";
import {
	addModule,
	emptyLayout,
	fits,
	indexAt,
	type KitchenLayout,
	moveModule,
	positionsOf,
	removeModule,
	rowEndMm,
	rowFor,
	starterKitchen,
} from "../layout";

const WALL_MM = 4000;

let layout: KitchenLayout;
beforeEach(() => {
	layout = emptyLayout(WALL_MM);
});

const ids = (l: KitchenLayout, row: "floor" | "wall") =>
	l[row].map((placed) => placed.typeId);

describe("rowFor", () => {
	it("hangs wall units and stands everything else on the floor", () => {
		expect(rowFor("wall")).toBe("wall");
		expect(rowFor("base")).toBe("floor");
		expect(rowFor("tall")).toBe("floor");
	});
});

describe("addModule", () => {
	it("packs the floor row edge to edge with no gaps", () => {
		let next = addModule(layout, "base-900", 0);
		next = addModule(next, "base-600", 9999);
		next = addModule(next, "base-400", 9999);

		const positions = positionsOf(next, "floor");
		expect(positions.map((p) => p.xMm)).toEqual([0, 900, 1500]);
		expect(rowEndMm(next, "floor")).toBe(1900);
	});

	it("drops a cabinet where the pointer is, not just at the end", () => {
		let next = addModule(layout, "base-900", 0);
		next = addModule(next, "base-600", 9999);
		// Dropped left of the first cabinet's midpoint: it goes first.
		next = addModule(next, "base-400", 100);
		expect(ids(next, "floor")).toEqual(["base-400", "base-900", "base-600"]);
	});

	it("refuses a cabinet that will not fit the wall", () => {
		let next = emptyLayout(1000);
		next = addModule(next, "base-900", 0);
		const full = addModule(next, "base-600", 9999);
		expect(full).toBe(next);
		expect(ids(full, "floor")).toEqual(["base-900"]);
	});

	it("keeps the two rows independent", () => {
		let next = addModule(layout, "base-900", 0);
		next = addModule(next, "wall-400", 0);
		expect(ids(next, "floor")).toEqual(["base-900"]);
		expect(ids(next, "wall")).toEqual(["wall-400"]);
	});
});

describe("tall units", () => {
	it("stops a wall cabinet being hung in front of one", () => {
		let next = addModule(layout, "tall-600", 0);
		next = addModule(next, "base-900", 9999);
		next = addModule(next, "wall-400", 0);

		// The tall unit owns 0–600, so the wall cabinet starts after it.
		const [hung] = positionsOf(next, "wall");
		expect(hung.xMm).toBe(600);
	});

	it("only steps over the span the tall unit actually occupies", () => {
		let next = addModule(layout, "base-900", 0);
		next = addModule(next, "tall-600", 9999);
		next = addModule(next, "wall-800", 0);

		// The tall unit is at 900–1500, and an 800 wall cabinet fits before it.
		const [hung] = positionsOf(next, "wall");
		expect(hung.xMm).toBe(0);
	});

	it("counts the blocked span against the wall's capacity", () => {
		let next = emptyLayout(1400);
		next = addModule(next, "tall-600", 0);
		next = addModule(next, "wall-900", 0);
		// 600 blocked + 900 hung = 1500, past the 1400 wall.
		expect(ids(next, "wall")).toEqual([]);
		expect(fits(next, "wall-800")).toBe(true);
	});
});

describe("moveModule", () => {
	it("reorders within a row", () => {
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-600", 9999, "b");
		next = addModule(next, "base-400", 9999, "c");

		// Drag the last one to the very start.
		const moved = moveModule(next, "c", 0);
		expect(ids(moved, "floor")).toEqual(["base-400", "base-900", "base-600"]);
	});

	it("leaves the run alone when dropped back where it was", () => {
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-600", 9999, "b");
		const moved = moveModule(next, "b", 1200);
		expect(ids(moved, "floor")).toEqual(["base-900", "base-600"]);
	});

	it("never loses a cabinet", () => {
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-600", 9999, "b");
		for (const x of [0, 500, 1500, 9999, -500]) {
			const moved = moveModule(next, "a", x);
			expect(moved.floor).toHaveLength(2);
		}
	});
});

describe("removeModule", () => {
	it("takes a cabinet out and closes the gap", () => {
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-600", 9999, "b");
		next = addModule(next, "base-400", 9999, "c");

		const gone = removeModule(next, "b");
		expect(ids(gone, "floor")).toEqual(["base-900", "base-400"]);
		expect(positionsOf(gone, "floor").map((p) => p.xMm)).toEqual([0, 900]);
	});
});

describe("indexAt", () => {
	it("puts the drop before or after a cabinet by its midpoint", () => {
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-600", 9999, "b");

		expect(indexAt(next, "floor", 0)).toBe(0);
		expect(indexAt(next, "floor", 449)).toBe(0);
		expect(indexAt(next, "floor", 451)).toBe(1);
		expect(indexAt(next, "floor", 9999)).toBe(2);
	});
});

describe("starterKitchen", () => {
	it("opens on a kitchen that already fits the wall", () => {
		const next = starterKitchen(WALL_MM);
		expect(next.floor.length).toBeGreaterThan(0);
		expect(next.wall.length).toBeGreaterThan(0);
		expect(rowEndMm(next, "floor")).toBeLessThanOrEqual(WALL_MM);
		expect(rowEndMm(next, "wall")).toBeLessThanOrEqual(WALL_MM);
	});

	it("uses only real catalogue modules", () => {
		const next = starterKitchen(WALL_MM);
		for (const placed of [...next.floor, ...next.wall]) {
			expect(moduleType(placed.typeId)).toBeDefined();
		}
	});
});

describe("catalogue integrity", () => {
	it("gives every module type a unique, resolvable id", () => {
		const ids = MODULE_TYPES.map((type) => type.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(moduleType(id)?.id).toBe(id);
	});
});
