import { describe, expect, it } from "vitest";
import { PLANNER_CATALOGUE } from "../catalogue";
import { emptyLayout, plannerEngine } from "../layout";

/**
 * Where a selected cabinet sits, as the numbers the callouts draw.
 *
 * The planner locks every cabinet to one wall, so its position is one figure
 * along that wall plus, for a hung unit, how high it is off the floor. These
 * are the gaps either side of it — to a neighbour if there is one, to the wall
 * if there is not.
 */

const engine = plannerEngine(PLANNER_CATALOGUE);

/** A layout with the given floor cabinets, placed exactly where asked. */
function withFloor(...at: { familyId: string; xMm: number }[]) {
	let layout = emptyLayout(4000);
	for (const { familyId, xMm } of at) {
		layout = engine.addModule(layout, familyId, xMm);
	}
	return layout;
}

const firstId = (layout: ReturnType<typeof withFloor>, row: "floor" | "wall") =>
	layout[row][0].id;

describe("offsetsOf", () => {
	it("measures both gaps to the walls when a cabinet stands alone", () => {
		const layout = withFloor({ familyId: "base-cabinet", xMm: 1000 });
		const id = firstId(layout, "floor");
		const width = layout.floor[0].widthMm;

		const offsets = engine.offsetsOf(layout, id);

		expect(offsets).not.toBeNull();
		expect(offsets?.leftMm).toBe(1000);
		expect(offsets?.rightMm).toBe(4000 - 1000 - width);
		expect(offsets?.leftAnchorMm).toBe(0);
		expect(offsets?.rightAnchorMm).toBe(4000);
	});

	it("measures to a neighbour's edge rather than past it to the wall", () => {
		const layout = withFloor(
			{ familyId: "base-cabinet", xMm: 0 },
			{ familyId: "base-cabinet", xMm: 1500 },
		);
		const [left, right] = [...layout.floor].sort((a, b) => a.xMm - b.xMm);

		const offsets = engine.offsetsOf(layout, right.id);

		expect(offsets?.leftAnchorMm).toBe(left.xMm + left.widthMm);
		expect(offsets?.leftMm).toBe(right.xMm - (left.xMm + left.widthMm));
	});

	it("reports zero on a side that is flush against a neighbour", () => {
		const layout = withFloor(
			{ familyId: "base-cabinet", xMm: 0 },
			{ familyId: "base-cabinet", xMm: 0 },
		);
		const [, right] = [...layout.floor].sort((a, b) => a.xMm - b.xMm);

		expect(engine.offsetsOf(layout, right.id)?.leftMm).toBe(0);
	});

	it("treats a tall unit in the floor row as a wall cabinet's neighbour", () => {
		let layout = emptyLayout(4000);
		layout = engine.addModule(layout, "tall-cabinet", 0);
		layout = engine.addModule(layout, "wall-cabinet", 2000);
		const tall = layout.floor[0];
		const hung = layout.wall[0];

		const offsets = engine.offsetsOf(layout, hung.id);

		expect(offsets?.leftAnchorMm).toBe(tall.xMm + tall.widthMm);
	});

	it("reports how high a wall cabinet hangs, and nothing for a floor one", () => {
		let layout = emptyLayout(4000);
		layout = engine.addModule(layout, "wall-cabinet", 0);
		layout = engine.addModule(layout, "base-cabinet", 2000);
		const hung = engine.offsetsOf(layout, layout.wall[0].id);
		const standing = engine.offsetsOf(layout, layout.floor[0].id);

		expect(hung?.floorMm).toBe(layout.hangingHeightMm);
		expect(standing?.floorMm).toBeNull();
	});

	it("is null for a cabinet that is not in the layout", () => {
		expect(engine.offsetsOf(emptyLayout(4000), "nope")).toBeNull();
	});
});
