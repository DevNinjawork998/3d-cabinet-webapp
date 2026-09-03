import { describe, expect, it } from "vitest";
import { PLANNER_CATALOGUE } from "../catalogue";
import { exposedSides, FULLY_EXPOSED } from "../exposure";
import { emptyLayout, plannerEngine } from "../layout";

const { addModule, positionsOf } = plannerEngine(PLANNER_CATALOGUE);

const WALL_MM = 4200;

/** A floor row built by dropping cabinets at the given x positions. */
const floorRow = (drops: { familyId: string; xMm: number }[]) => {
	let layout = emptyLayout(WALL_MM);
	for (const { familyId, xMm } of drops) {
		layout = addModule(layout, familyId, xMm);
	}
	return positionsOf(layout, "floor");
};

/** `count` cabinets butted against each other from the left wall. Each drop
 * lands at the running end rather than a guessed x, because a family's default
 * width is catalogue data — assuming 900 here put 300mm gaps in the row. */
const continuousRow = (count: number, familyId = "base-cabinet") => {
	let layout = emptyLayout(WALL_MM);
	let xMm = 0;
	for (let i = 0; i < count; i++) {
		layout = addModule(layout, familyId, xMm);
		const row = positionsOf(layout, "floor");
		const last = row[row.length - 1];
		xMm = last.xMm + last.widthMm;
	}
	return positionsOf(layout, "floor");
};

describe("exposedSides", () => {
	it("finishes both ends of a cabinet standing on its own", () => {
		const row = floorRow([{ familyId: "base-cabinet", xMm: 0 }]);
		expect(row).toHaveLength(1);
		expect(exposedSides(row, 0)).toEqual(FULLY_EXPOSED);
	});

	// The whole point: the middle of a run is buried and must stay plain board,
	// while the two ends are what a fitter actually veneers.
	it("exposes only the outer sides of a continuous run", () => {
		const row = continuousRow(3);
		expect(row).toHaveLength(3);
		// Placement snaps against neighbours, so assert on the real geometry
		// rather than assuming the drops landed where they were asked to.
		for (let i = 1; i < row.length; i++) {
			expect(row[i].xMm).toBeCloseTo(row[i - 1].xMm + row[i - 1].widthMm);
		}

		expect(exposedSides(row, 0)).toEqual({ left: true, right: false });
		expect(exposedSides(row, 1)).toEqual({ left: false, right: false });
		expect(exposedSides(row, 2)).toEqual({ left: false, right: true });
	});

	it("finishes the sides that face a gap", () => {
		const row = floorRow([
			{ familyId: "base-cabinet", xMm: 0 },
			{ familyId: "base-cabinet", xMm: 2400 },
		]);
		expect(row).toHaveLength(2);
		expect(row[1].xMm).toBeGreaterThan(row[0].xMm + row[0].widthMm);

		expect(exposedSides(row, 0)).toEqual(FULLY_EXPOSED);
		expect(exposedSides(row, 1)).toEqual(FULLY_EXPOSED);
	});

	// A wall unit hangs above a base unit and hides nothing, so the rows have to
	// be judged separately or every base cabinet under a wall run loses its end.
	it("judges the two rows independently", () => {
		let layout = emptyLayout(WALL_MM);
		layout = addModule(layout, "base-cabinet", 0);
		layout = addModule(layout, "wall-cabinet", 0);

		const floor = positionsOf(layout, "floor");
		const wall = positionsOf(layout, "wall");
		expect(floor).toHaveLength(1);
		expect(wall).toHaveLength(1);

		expect(exposedSides(floor, 0)).toEqual(FULLY_EXPOSED);
		expect(exposedSides(wall, 0)).toEqual(FULLY_EXPOSED);
	});

	it("treats a sub-millimetre join as touching", () => {
		const row = continuousRow(2);
		// Nudge the second one by a fraction, the way a computed drag position
		// can differ from an integer width.
		const nudged = [row[0], { ...row[1], xMm: row[1].xMm + 0.4 }];
		expect(exposedSides(nudged, 0).right).toBe(false);
		expect(exposedSides(nudged, 1).left).toBe(false);
	});

	it("is safe on an index that is not in the row", () => {
		expect(exposedSides([], 0)).toEqual(FULLY_EXPOSED);
	});
});

describe("walls bury a side the way a neighbour does", () => {
	const enclosed = { wallWidthMm: WALL_MM, enclosed: true };
	const open = { wallWidthMm: WALL_MM, enclosed: false };

	/** One 900 cabinet hard against the left wall, and one hard against the
	 *  right, on a 4200 wall. */
	const bothEnds = () => {
		let layout = emptyLayout(WALL_MM);
		layout = addModule(layout, "base-cabinet", 0, "left", 900);
		layout = addModule(layout, "base-cabinet", WALL_MM - 900, "right", 900);
		return positionsOf(layout, "floor");
	};

	it("leaves the run's ends exposed when the wall just carries on", () => {
		const row = bothEnds();
		expect(exposedSides(row, 0, open).left).toBe(true);
		expect(exposedSides(row, 1, open).right).toBe(true);
	});

	it("buries the end sitting on the left wall", () => {
		expect(exposedSides(bothEnds(), 0, enclosed)).toEqual({
			left: false,
			right: true,
		});
	});

	it("buries the end sitting on the right wall", () => {
		expect(exposedSides(bothEnds(), 1, enclosed)).toEqual({
			left: true,
			right: false,
		});
	});

	it("says nothing about a cabinet away from either wall", () => {
		const row = floorRow([{ familyId: "base-cabinet", xMm: 1500 }]);
		expect(exposedSides(row, 0, enclosed)).toEqual(FULLY_EXPOSED);
	});

	it("behaves exactly as before when no walls are passed", () => {
		const row = bothEnds();
		expect(exposedSides(row, 0)).toEqual(exposedSides(row, 0, open));
		expect(exposedSides(row, 1)).toEqual(exposedSides(row, 1, open));
	});
});
