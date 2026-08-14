import { beforeEach, describe, expect, it } from "vitest";
import { FAMILIES, family, ROOM_TYPES } from "../catalogue";
import {
	addModule,
	closeGaps,
	dropModule,
	emptyLayout,
	firstFreeXMm,
	fits,
	freeSpans,
	moveModule,
	occupiedSpans,
	overhangMm,
	type PlannerLayout,
	positionsOf,
	type Row,
	removeModule,
	removeModules,
	rowEndMm,
	rowFor,
	SNAP_MM,
	setDoor,
	setDoors,
	setHangingHeight,
	setWallWidth,
	setWidth,
	starterFor,
	WALL_LIMITS,
	widthOptionsFor,
} from "../layout";

const WALL_MM = 4000;

let layout: PlannerLayout;
beforeEach(() => {
	layout = emptyLayout(WALL_MM);
});

const xs = (l: PlannerLayout, row: Row) =>
	positionsOf(l, row).map((position) => position.xMm);

const at = (l: PlannerLayout, id: string) => {
	const all = [...l.floor, ...l.wall].find((placed) => placed.id === id);
	if (!all) throw new Error(`no module ${id}`);
	return all.xMm;
};

/** The invariant the whole engine exists to protect. */
function expectNoOverlaps(l: PlannerLayout) {
	for (const row of ["floor", "wall"] as const) {
		const spans = occupiedSpans(l, row);
		for (let i = 1; i < spans.length; i++) {
			expect(spans[i].startMm).toBeGreaterThanOrEqual(spans[i - 1].endMm);
		}
		for (const position of positionsOf(l, row)) {
			expect(position.xMm).toBeGreaterThanOrEqual(0);
			expect(position.xMm + position.widthMm).toBeLessThanOrEqual(
				l.wallWidthMm,
			);
		}
	}
}

describe("placing a cabinet", () => {
	it("puts it where it was dropped", () => {
		const next = addModule(layout, "base-cabinet", 1500, "a", 900);
		expect(at(next, "a")).toBe(1500);
		expectNoOverlaps(next);
	});

	it("keeps a gap the customer left on purpose", () => {
		let next = addModule(layout, "base-cabinet", 0, "a", 900);
		next = addModule(next, "base-cabinet", 2000, "b", 600);
		// Nothing slides back to close the space between them.
		expect(xs(next, "floor")).toEqual([0, 2000]);
	});

	it("slides to the nearest free space when dropped on an occupant", () => {
		// A 900 sits across 1000–1900, so a 600 dropped on it has to go either
		// side. It goes to whichever side the pointer was nearest.
		const occupied = addModule(layout, "base-cabinet", 1000, "a", 900);

		const right = addModule(occupied, "base-cabinet", 1800, "b", 600);
		expect(at(right, "b")).toBe(1900);
		expectNoOverlaps(right);

		const left = addModule(occupied, "base-cabinet", 1050, "c", 600);
		expect(at(left, "c")).toBe(400);
		expectNoOverlaps(left);
	});

	it("refuses only when the wall is genuinely full", () => {
		let small = emptyLayout(1000);
		small = addModule(small, "base-cabinet", 0, "a", 900);
		expect(fits(small, "base-cabinet", 600)).toBe(false);
		expect(addModule(small, "base-cabinet", 0, undefined, 600)).toBe(small);
		// A 400 does not fit the 100mm left either.
		expect(firstFreeXMm(small, "floor", 400)).toBeNull();
	});

	it("keeps the two rows independent", () => {
		let next = addModule(layout, "base-cabinet", 0, "a", 900);
		next = addModule(next, "wall-cabinet", 2000, "b", 400);
		expect(xs(next, "floor")).toEqual([0]);
		expect(xs(next, "wall")).toEqual([2000]);
	});
});

describe("the bug this fixes: a wall cabinet in the gap over the base run", () => {
	/**
	 * The layout from the client demo: a tall unit in the run, base cabinets
	 * beside it, and a stretch of wall above the base run with nothing on it.
	 * The old engine derived wall positions by packing, so a wall cabinet could
	 * not be put in that stretch — it was pushed past the tall unit instead.
	 */
	const demoRun = () => {
		let next = emptyLayout(WALL_MM);
		next = addModule(next, "base-cabinet", 0, "base1", 900);
		next = addModule(next, "base-cabinet", 900, "base2", 900);
		next = addModule(next, "tall-cabinet", 1800, "tall", 600);
		next = addModule(next, "wall-cabinet", 2400, "hung", 900);
		return next;
	};

	it("drops a wall cabinet into the gap and leaves it there", () => {
		const next = addModule(demoRun(), "wall-cabinet", 600, "infill", 800);
		expect(at(next, "infill")).toBe(600);
		expectNoOverlaps(next);
	});

	it("lets that cabinet be dragged along the gap afterwards", () => {
		let next = addModule(demoRun(), "wall-cabinet", 600, "infill", 800);
		next = moveModule(next, "infill", 200);
		expect(at(next, "infill")).toBe(200);
		next = moveModule(next, "infill", 900);
		expect(at(next, "infill")).toBe(900);
		expectNoOverlaps(next);
	});

	it("stops it at the tall unit rather than hanging it in front", () => {
		let next = addModule(demoRun(), "wall-cabinet", 600, "infill", 800);
		next = moveModule(next, "infill", 1700);
		// The tall unit owns 1800–2400, so an 800 wall cabinet stops at 1000.
		expect(at(next, "infill")).toBe(1000);
		expectNoOverlaps(next);
	});
});

describe("dragging into a neighbour", () => {
	const pair = () => {
		let next = emptyLayout(WALL_MM);
		next = addModule(next, "base-cabinet", 0, "left", 900);
		next = addModule(next, "base-cabinet", 2000, "right", 900);
		return next;
	};

	it("butts up against it and stops", () => {
		const next = moveModule(pair(), "left", 1800);
		expect(at(next, "left")).toBe(1100);
		expectNoOverlaps(next);
	});

	it("never overlaps, wherever the pointer goes", () => {
		let next = pair();
		for (let x = -500; x <= WALL_MM + 500; x += 37) {
			next = moveModule(next, "left", x);
			expectNoOverlaps(next);
		}
	});

	it("moves again the instant the drag reverses", () => {
		let next = moveModule(pair(), "left", 1800);
		expect(at(next, "left")).toBe(1100);
		next = moveModule(next, "left", 1000);
		expect(at(next, "left")).toBe(1000);
	});

	it("stays on the wall at both ends", () => {
		let next = moveModule(pair(), "left", -900);
		expect(at(next, "left")).toBe(0);
		next = moveModule(next, "right", 99999);
		expect(at(next, "right")).toBe(WALL_MM - 900);
	});
});

describe("snapping on release", () => {
	const withNeighbour = () =>
		addModule(emptyLayout(WALL_MM), "base-cabinet", 0, "a", 900);

	it("lands flush against a neighbour when released close to it", () => {
		let next = addModule(withNeighbour(), "base-cabinet", 2000, "b", 600);
		next = dropModule(next, "b", 900 + SNAP_MM - 10);
		expect(at(next, "b")).toBe(900);
	});

	it("leaves a deliberate gap alone", () => {
		let next = addModule(withNeighbour(), "base-cabinet", 2000, "b", 600);
		const far = 900 + SNAP_MM + 100;
		next = dropModule(next, "b", far);
		expect(at(next, "b")).toBe(far);
	});

	it("lands flush on the end of the wall", () => {
		let next = addModule(emptyLayout(WALL_MM), "base-cabinet", 2000, "b", 600);
		next = dropModule(next, "b", WALL_MM - 600 - 20);
		expect(at(next, "b")).toBe(WALL_MM - 600);
	});

	it("lines a wall unit up with the base cabinet below it", () => {
		let next = addModule(
			emptyLayout(WALL_MM),
			"base-cabinet",
			900,
			"base",
			900,
		);
		next = addModule(next, "wall-cabinet", 2500, "hung", 800);
		// Released a few centimetres off the base cabinet's left edge.
		next = dropModule(next, "hung", 900 + 25);
		expect(at(next, "hung")).toBe(900);
		expectNoOverlaps(next);
	});
});

describe("tall units", () => {
	it("block the hung row across their own span only", () => {
		let next = addModule(layout, "base-cabinet", 0, "base", 900);
		next = addModule(next, "tall-cabinet", 900, "tall", 600);

		const spans = occupiedSpans(next, "wall");
		expect(spans).toEqual([{ startMm: 900, endMm: 1500 }]);
		// A wall cabinet fits either side of it.
		expect(firstFreeXMm(next, "wall", 800)).toBe(0);
	});

	it("push wall cabinets clear when dropped underneath them", () => {
		let next = addModule(layout, "wall-cabinet", 0, "hung", 900);
		next = addModule(next, "tall-cabinet", 300, "tall", 600);

		expectNoOverlaps(next);
		// The wall unit moved out of the tall unit's span rather than vanishing.
		expect(next.wall).toHaveLength(1);
		expect(at(next, "hung")).toBeGreaterThanOrEqual(900);
	});
});

describe("freeSpans", () => {
	it("reports the clear stretches in order", () => {
		let next = addModule(layout, "base-cabinet", 0, "a", 900);
		next = addModule(next, "base-cabinet", 2000, "b", 900);
		expect(freeSpans(next, "floor")).toEqual([
			{ startMm: 900, endMm: 2000 },
			{ startMm: 2900, endMm: WALL_MM },
		]);
	});
});

describe("closeGaps", () => {
	it("packs both rows left and keeps the order", () => {
		let next = addModule(layout, "base-cabinet", 1500, "a", 900);
		next = addModule(next, "base-cabinet", 3000, "b", 600);
		next = addModule(next, "wall-cabinet", 2200, "c", 800);

		const packed = closeGaps(next);
		expect(xs(packed, "floor")).toEqual([0, 900]);
		expect(at(packed, "a")).toBe(0);
		expect(at(packed, "b")).toBe(900);
		expect(at(packed, "c")).toBe(0);
		expectNoOverlaps(packed);
	});

	it("steps the hung row over a tall unit", () => {
		let next = addModule(layout, "base-cabinet", 0, "base", 900);
		next = addModule(next, "tall-cabinet", 900, "tall", 600);
		next = addModule(next, "wall-cabinet", 2500, "hung", 800);

		const packed = closeGaps(next);
		// Base at 0–900, tall at 900–1500: an 800 wall unit fits at 0.
		expect(at(packed, "hung")).toBe(0);
		expectNoOverlaps(packed);
	});
});

describe("removeModules", () => {
	const three = () => {
		let next = addModule(emptyLayout(WALL_MM), "base-cabinet", 0, "a", 900);
		next = addModule(next, "base-cabinet", 900, "b", 600);
		next = addModule(next, "wall-cabinet", 1500, "c", 400);
		return next;
	};

	it("takes out several at once, across both rows", () => {
		const gone = removeModules(three(), ["a", "c"]);
		expect(gone.floor.map((placed) => placed.id)).toEqual(["b"]);
		expect(gone.wall).toEqual([]);
	});

	it("leaves the survivors exactly where they were", () => {
		const gone = removeModules(three(), ["a"]);
		expect(at(gone, "b")).toBe(900);
		expect(at(gone, "c")).toBe(1500);
	});

	it("ignores ids that are not there, and does nothing for none", () => {
		const before = three();
		expect(removeModules(before, [])).toBe(before);
		expect(removeModules(before, ["nope"]).floor).toHaveLength(2);
	});
});

describe("removeModule", () => {
	it("takes one out and leaves the others where they are", () => {
		let next = addModule(layout, "base-cabinet", 0, "a", 900);
		next = addModule(next, "base-cabinet", 900, "b", 600);
		next = addModule(next, "base-cabinet", 1500, "c", 400);

		const gone = removeModule(next, "b");
		expect(at(gone, "a")).toBe(0);
		expect(at(gone, "c")).toBe(1500);
	});
});

describe("wall length", () => {
	it("takes any measured length inside the limits", () => {
		expect(setWallWidth(layout, 3750).wallWidthMm).toBe(3750);
		expect(setWallWidth(layout, 5280).wallWidthMm).toBe(5280);
	});

	it("clamps a mistyped figure rather than making an unusable room", () => {
		expect(setWallWidth(layout, 10).wallWidthMm).toBe(WALL_LIMITS.minMm);
		expect(setWallWidth(layout, 999999).wallWidthMm).toBe(WALL_LIMITS.maxMm);
	});

	it("keeps the cabinets where they are when the wall shrinks, and says how much overhangs", () => {
		let next = addModule(layout, "base-cabinet", 0, "a", 900);
		next = addModule(next, "base-cabinet", 900, "b", 900);
		expect(overhangMm(next)).toBe(0);

		const shorter = setWallWidth(next, 1500);
		expect(shorter.floor).toHaveLength(2);
		expect(at(shorter, "b")).toBe(900);
		expect(overhangMm(shorter)).toBe(300);
	});

	it("closing the gaps can recover a run that overhangs", () => {
		let next = addModule(layout, "base-cabinet", 0, "a", 900);
		next = addModule(next, "base-cabinet", 2000, "b", 600);
		const shorter = setWallWidth(next, 1600);
		expect(overhangMm(shorter)).toBeGreaterThan(0);
		expect(overhangMm(closeGaps(shorter))).toBe(0);
	});
});

describe("hanging height", () => {
	it("starts at the height the client hangs them and can be changed", () => {
		expect(layout.hangingHeightMm).toBe(1500);
		expect(setHangingHeight(layout, 1400).hangingHeightMm).toBe(1400);
	});
});

describe("sizing a placed cabinet", () => {
	const roomy = () =>
		addModule(emptyLayout(WALL_MM), "base-cabinet", 0, "a", 400);

	it("grows to the right, keeping the left edge where it was", () => {
		const next = setWidth(roomy(), "a", 900);
		expect(at(next, "a")).toBe(0);
		expect(next.floor[0].widthMm).toBe(900);
		expectNoOverlaps(next);
	});

	it("refuses a size the neighbour leaves no room for", () => {
		let next = roomy();
		next = addModule(next, "base-cabinet", 600, "b", 600);
		// a is 0–400 with b at 600: 900 would run straight through it.
		expect(setWidth(next, "a", 900)).toBe(next);
		// 600 exactly meets b, which is allowed.
		expect(setWidth(next, "a", 600).floor[0].widthMm).toBe(600);
	});

	it("refuses a size that would hang off the end of the wall", () => {
		let small = emptyLayout(1000);
		small = addModule(small, "base-cabinet", 400, "a", 400);
		expect(setWidth(small, "a", 900)).toBe(small);
	});

	it("flags which sizes fit, for the dropdown", () => {
		let next = roomy();
		next = addModule(next, "base-cabinet", 600, "b", 600);

		const options = widthOptionsFor(next, "a");
		const fitsAt = (mm: number) =>
			options.find((option) => option.widthMm === mm)?.fits;
		expect(fitsAt(400)).toBe(true);
		expect(fitsAt(600)).toBe(true);
		expect(fitsAt(800)).toBe(false);
		expect(fitsAt(900)).toBe(false);
		// Every option carries its own price for the dropdown to show.
		for (const option of options) expect(option.priceRm).toBeGreaterThan(0);
	});
});

describe("doors", () => {
	const one = () =>
		addModule(emptyLayout(WALL_MM), "base-cabinet", 0, "a", 600);

	it("arrives as a bare carcass", () => {
		expect(one().floor[0].doorStyleId).toBeNull();
	});

	it("takes a door and gives it back", () => {
		const doored = setDoor(one(), "a", "shaker");
		expect(doored.floor[0].doorStyleId).toBe("shaker");
		expect(setDoor(doored, "a", null).floor[0].doorStyleId).toBeNull();
	});

	it("puts one style on a whole selection", () => {
		let next = one();
		next = addModule(next, "base-cabinet", 600, "b", 600);
		next = setDoors(next, ["a", "b"], "slab");
		expect(next.floor.map((placed) => placed.doorStyleId)).toEqual([
			"slab",
			"slab",
		]);
	});

	it("does not move anything when a door is applied", () => {
		const before = one();
		const after = setDoor(before, "a", "glass");
		expect(at(after, "a")).toBe(at(before, "a"));
	});
});

describe("rooms", () => {
	it("opens every room on a run that fits its wall", () => {
		for (const room of ROOM_TYPES) {
			const layout = starterFor(room.id);
			expect(layout.floor.length + layout.wall.length).toBeGreaterThan(0);
			expect(overhangMm(layout)).toBe(0);
			expectNoOverlaps(layout);
		}
	});

	it("only offers families the room actually sells", () => {
		for (const room of ROOM_TYPES) {
			for (const familyId of room.familyIds) {
				expect(family(familyId)).toBeDefined();
			}
			for (const item of room.starter) {
				expect(room.familyIds).toContain(item.familyId);
			}
		}
	});
});

describe("catalogue integrity", () => {
	it("gives every family a unique, resolvable id", () => {
		const ids = FAMILIES.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(family(id)?.id).toBe(id);
	});

	it("gives every family at least one priced size", () => {
		for (const f of FAMILIES) {
			expect(f.sizes.length).toBeGreaterThan(0);
			for (const size of f.sizes) {
				expect(size.widthMm).toBeGreaterThan(0);
				expect(size.priceRm).toBeGreaterThan(0);
			}
		}
	});

	it("hangs wall units and stands everything else on the floor", () => {
		expect(rowFor("wall")).toBe("wall");
		expect(rowFor("base")).toBe("floor");
		expect(rowFor("tall")).toBe("floor");
	});
});
