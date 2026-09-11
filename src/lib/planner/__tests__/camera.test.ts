import { describe, expect, it } from "vitest";
import { clampPanTarget, type RoomBoundsMm } from "../camera";

/** A 4.2m wall, a 3m deep room, a standard 2.7m ceiling, and a bare wall so
 * the whole floor is in bounds. */
const ROOM: RoomBoundsMm = {
	runWidthMm: 4200,
	roomDepthMm: 3000,
	ceilingHeightMm: 2700,
	runDepthMm: 0,
};

describe("clampPanTarget", () => {
	it("leaves a target already inside the room alone", () => {
		const inside = { x: 500, y: 1200, z: -400 };
		expect(clampPanTarget(inside, ROOM)).toEqual(inside);
	});

	it("clamps past either end of the run", () => {
		expect(clampPanTarget({ x: 9000, y: 0, z: 0 }, ROOM).x).toBe(2100);
		expect(clampPanTarget({ x: -9000, y: 0, z: 0 }, ROOM).x).toBe(-2100);
	});

	it("clamps below the floor and above the ceiling", () => {
		expect(clampPanTarget({ x: 0, y: -500, z: 0 }, ROOM).y).toBe(0);
		expect(clampPanTarget({ x: 0, y: 9000, z: 0 }, ROOM).y).toBe(2700);
	});

	it("clamps through the back wall and out of the open side", () => {
		// Not quite the wall itself: even a bare wall keeps the cabinets' gap.
		expect(clampPanTarget({ x: 0, y: 0, z: -9000 }, ROOM).z).toBe(-1495);
		expect(clampPanTarget({ x: 0, y: 0, z: 9000 }, ROOM).z).toBe(1500);
	});

	it("clamps every axis at once", () => {
		expect(clampPanTarget({ x: 9000, y: 9000, z: 9000 }, ROOM)).toEqual({
			x: 2100,
			y: 2700,
			z: 1500,
		});
	});

	// A run wider than the wall it stands against is what a customer building
	// past the end produces, and the clamp has to follow the run rather than
	// pin them to a wall they have already outgrown.
	it("follows the run width it is given", () => {
		const wide = { ...ROOM, runWidthMm: 8000 };
		expect(clampPanTarget({ x: 9000, y: 0, z: 0 }, wide).x).toBe(4000);
	});

	// The puck lies on the floor, and the floor under the cabinets is not floor
	// it can be dropped on: it would sit beneath a carcass that then takes the
	// pointer.
	it("keeps clear of the run's own footprint", () => {
		const withRun = { ...ROOM, runDepthMm: 600 };
		// Back wall at -1500, the 5mm wall gap, 600 of cabinet.
		expect(clampPanTarget({ x: 0, y: 0, z: -9000 }, withRun).z).toBe(-895);
		// The open side is unaffected.
		expect(clampPanTarget({ x: 0, y: 0, z: 9000 }, withRun).z).toBe(1500);
	});

	// A clamp whose minimum exceeds its maximum pins the pan to a single point,
	// which reads as the gizmo being broken rather than the layout being absurd.
	it("lets the room win when the run is deeper than the room", () => {
		const silly = { ...ROOM, roomDepthMm: 1000, runDepthMm: 4000 };
		expect(clampPanTarget({ x: 0, y: 0, z: -9000 }, silly).z).toBe(500);
		expect(clampPanTarget({ x: 0, y: 0, z: 9000 }, silly).z).toBe(500);
	});
});
