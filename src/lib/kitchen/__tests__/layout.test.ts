import { beforeEach, describe, expect, it } from "vitest";
import { MODULE_TYPES, moduleType } from "../catalogue";
import {
	addModule,
	closeGaps,
	dropModule,
	emptyLayout,
	firstFreeXMm,
	fits,
	freeSpans,
	type KitchenLayout,
	moveModule,
	occupiedSpans,
	overhangMm,
	positionsOf,
	type Row,
	removeModule,
	removeModules,
	rowEndMm,
	rowFor,
	SNAP_MM,
	setHangingHeight,
	setWallWidth,
	starterKitchen,
	WALL_LIMITS,
} from "../layout";

const WALL_MM = 4000;

let layout: KitchenLayout;
beforeEach(() => {
	layout = emptyLayout(WALL_MM);
});

const xs = (l: KitchenLayout, row: Row) =>
	positionsOf(l, row).map((position) => position.xMm);

const at = (l: KitchenLayout, id: string) => {
	const all = [...l.floor, ...l.wall].find((placed) => placed.id === id);
	if (!all) throw new Error(`no module ${id}`);
	return all.xMm;
};

/** The invariant the whole engine exists to protect. */
function expectNoOverlaps(l: KitchenLayout) {
	for (const row of ["floor", "wall"] as const) {
		const spans = occupiedSpans(l, row);
		for (let i = 1; i < spans.length; i++) {
			expect(spans[i].startMm).toBeGreaterThanOrEqual(spans[i - 1].endMm);
		}
		for (const position of positionsOf(l, row)) {
			expect(position.xMm).toBeGreaterThanOrEqual(0);
			expect(position.xMm + position.type.widthMm).toBeLessThanOrEqual(
				l.wallWidthMm,
			);
		}
	}
}

describe("placing a cabinet", () => {
	it("puts it where it was dropped", () => {
		const next = addModule(layout, "base-900", 1500, "a");
		expect(at(next, "a")).toBe(1500);
		expectNoOverlaps(next);
	});

	it("keeps a gap the customer left on purpose", () => {
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-600", 2000, "b");
		// Nothing slides back to close the space between them.
		expect(xs(next, "floor")).toEqual([0, 2000]);
	});

	it("slides to the nearest free space when dropped on an occupant", () => {
		// A 900 sits across 1000–1900, so a 600 dropped on it has to go either
		// side. It goes to whichever side the pointer was nearest.
		const occupied = addModule(layout, "base-900", 1000, "a");

		const right = addModule(occupied, "base-600", 1800, "b");
		expect(at(right, "b")).toBe(1900);
		expectNoOverlaps(right);

		const left = addModule(occupied, "base-600", 1050, "c");
		expect(at(left, "c")).toBe(400);
		expectNoOverlaps(left);
	});

	it("refuses only when the wall is genuinely full", () => {
		let small = emptyLayout(1000);
		small = addModule(small, "base-900", 0, "a");
		expect(fits(small, "base-600")).toBe(false);
		expect(addModule(small, "base-600", 0)).toBe(small);
		// A 400 does not fit the 100mm left either.
		expect(firstFreeXMm(small, "floor", 400)).toBeNull();
	});

	it("keeps the two rows independent", () => {
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "wall-400", 2000, "b");
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
		next = addModule(next, "base-900", 0, "base1");
		next = addModule(next, "base-900", 900, "base2");
		next = addModule(next, "tall-600", 1800, "tall");
		next = addModule(next, "wall-900", 2400, "hung");
		return next;
	};

	it("drops a wall cabinet into the gap and leaves it there", () => {
		const next = addModule(demoRun(), "wall-800", 600, "infill");
		expect(at(next, "infill")).toBe(600);
		expectNoOverlaps(next);
	});

	it("lets that cabinet be dragged along the gap afterwards", () => {
		let next = addModule(demoRun(), "wall-800", 600, "infill");
		next = moveModule(next, "infill", 200);
		expect(at(next, "infill")).toBe(200);
		next = moveModule(next, "infill", 900);
		expect(at(next, "infill")).toBe(900);
		expectNoOverlaps(next);
	});

	it("stops it at the tall unit rather than hanging it in front", () => {
		let next = addModule(demoRun(), "wall-800", 600, "infill");
		next = moveModule(next, "infill", 1700);
		// The tall unit owns 1800–2400, so an 800 wall cabinet stops at 1000.
		expect(at(next, "infill")).toBe(1000);
		expectNoOverlaps(next);
	});
});

describe("dragging into a neighbour", () => {
	const pair = () => {
		let next = emptyLayout(WALL_MM);
		next = addModule(next, "base-900", 0, "left");
		next = addModule(next, "base-900", 2000, "right");
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
		addModule(emptyLayout(WALL_MM), "base-900", 0, "a");

	it("lands flush against a neighbour when released close to it", () => {
		let next = addModule(withNeighbour(), "base-600", 2000, "b");
		next = dropModule(next, "b", 900 + SNAP_MM - 10);
		expect(at(next, "b")).toBe(900);
	});

	it("leaves a deliberate gap alone", () => {
		let next = addModule(withNeighbour(), "base-600", 2000, "b");
		const far = 900 + SNAP_MM + 100;
		next = dropModule(next, "b", far);
		expect(at(next, "b")).toBe(far);
	});

	it("lands flush on the end of the wall", () => {
		let next = addModule(emptyLayout(WALL_MM), "base-600", 2000, "b");
		next = dropModule(next, "b", WALL_MM - 600 - 20);
		expect(at(next, "b")).toBe(WALL_MM - 600);
	});

	it("lines a wall unit up with the base cabinet below it", () => {
		let next = addModule(emptyLayout(WALL_MM), "base-900", 900, "base");
		next = addModule(next, "wall-800", 2500, "hung");
		// Released a few centimetres off the base cabinet's left edge.
		next = dropModule(next, "hung", 900 + 25);
		expect(at(next, "hung")).toBe(900);
		expectNoOverlaps(next);
	});
});

describe("tall units", () => {
	it("block the hung row across their own span only", () => {
		let next = addModule(layout, "base-900", 0, "base");
		next = addModule(next, "tall-600", 900, "tall");

		const spans = occupiedSpans(next, "wall");
		expect(spans).toEqual([{ startMm: 900, endMm: 1500 }]);
		// A wall cabinet fits either side of it.
		expect(firstFreeXMm(next, "wall", 800)).toBe(0);
	});

	it("push wall cabinets clear when dropped underneath them", () => {
		let next = addModule(layout, "wall-900", 0, "hung");
		next = addModule(next, "tall-600", 300, "tall");

		expectNoOverlaps(next);
		// The wall unit moved out of the tall unit's span rather than vanishing.
		expect(next.wall).toHaveLength(1);
		expect(at(next, "hung")).toBeGreaterThanOrEqual(900);
	});
});

describe("freeSpans", () => {
	it("reports the clear stretches in order", () => {
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-900", 2000, "b");
		expect(freeSpans(next, "floor")).toEqual([
			{ startMm: 900, endMm: 2000 },
			{ startMm: 2900, endMm: WALL_MM },
		]);
	});
});

describe("closeGaps", () => {
	it("packs both rows left and keeps the order", () => {
		let next = addModule(layout, "base-900", 1500, "a");
		next = addModule(next, "base-600", 3000, "b");
		next = addModule(next, "wall-800", 2200, "c");

		const packed = closeGaps(next);
		expect(xs(packed, "floor")).toEqual([0, 900]);
		expect(at(packed, "a")).toBe(0);
		expect(at(packed, "b")).toBe(900);
		expect(at(packed, "c")).toBe(0);
		expectNoOverlaps(packed);
	});

	it("steps the hung row over a tall unit", () => {
		let next = addModule(layout, "base-900", 0, "base");
		next = addModule(next, "tall-600", 900, "tall");
		next = addModule(next, "wall-800", 2500, "hung");

		const packed = closeGaps(next);
		// Base at 0–900, tall at 900–1500: an 800 wall unit fits at 0.
		expect(at(packed, "hung")).toBe(0);
		expectNoOverlaps(packed);
	});
});

describe("removeModules", () => {
	const three = () => {
		let next = addModule(emptyLayout(WALL_MM), "base-900", 0, "a");
		next = addModule(next, "base-600", 900, "b");
		next = addModule(next, "wall-400", 1500, "c");
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
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-600", 900, "b");
		next = addModule(next, "base-400", 1500, "c");

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
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-900", 900, "b");
		expect(overhangMm(next)).toBe(0);

		const shorter = setWallWidth(next, 1500);
		expect(shorter.floor).toHaveLength(2);
		expect(at(shorter, "b")).toBe(900);
		expect(overhangMm(shorter)).toBe(300);
	});

	it("closing the gaps can recover a run that overhangs", () => {
		let next = addModule(layout, "base-900", 0, "a");
		next = addModule(next, "base-600", 2000, "b");
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

describe("starterKitchen", () => {
	it("opens on a packed run that fits the wall", () => {
		const next = starterKitchen(WALL_MM);
		expect(next.floor.length).toBeGreaterThan(0);
		expect(next.wall.length).toBeGreaterThan(0);
		expect(xs(next, "floor")[0]).toBe(0);
		expect(rowEndMm(next, "floor")).toBeLessThanOrEqual(WALL_MM);
		expectNoOverlaps(next);
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

	it("hangs wall units and stands everything else on the floor", () => {
		expect(rowFor("wall")).toBe("wall");
		expect(rowFor("base")).toBe("floor");
		expect(rowFor("tall")).toBe("floor");
	});
});
