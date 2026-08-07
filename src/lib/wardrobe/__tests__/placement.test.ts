import { describe, expect, it } from "vitest";
import {
	backWallPlacement,
	clampPlacement,
	dragStep,
	footprintAabbMm,
	snapAngleDeg,
	snapPlacement,
	WALL_SNAP_MM,
} from "../placement";
import { DEFAULT_ROOM, ROOM_LIMITS, type RoomSize } from "../room";

const RUN_MM = 2400;
const DEPTH_MM = 600;

describe("footprintAabbMm", () => {
	it("is the raw footprint when square", () => {
		expect(footprintAabbMm(RUN_MM, DEPTH_MM, 0)).toEqual({
			widthMm: RUN_MM,
			depthMm: DEPTH_MM,
		});
	});

	it("swaps the axes at 90 degrees", () => {
		const aabb = footprintAabbMm(RUN_MM, DEPTH_MM, 90);
		expect(aabb.widthMm).toBeCloseTo(DEPTH_MM, 6);
		expect(aabb.depthMm).toBeCloseTo(RUN_MM, 6);
	});

	it("is square at 45 degrees, deeper but no wider than the run", () => {
		const aabb = footprintAabbMm(RUN_MM, DEPTH_MM, 45);
		const expected = (RUN_MM + DEPTH_MM) / Math.SQRT2;
		expect(aabb.widthMm).toBeCloseTo(expected, 6);
		expect(aabb.depthMm).toBeCloseTo(expected, 6);
		// A long thin run turned diagonally needs far more depth than it did
		// flat, but actually less width than its own length.
		expect(aabb.depthMm).toBeGreaterThan(DEPTH_MM);
		expect(aabb.widthMm).toBeLessThan(RUN_MM);
	});
});

describe("clampPlacement", () => {
	it("keeps the footprint inside the room at any angle or room size", () => {
		for (const rotationDeg of [0, 45, 90, 137, 270]) {
			for (
				let widthMm = ROOM_LIMITS.minWidthMm;
				widthMm <= ROOM_LIMITS.maxWidthMm;
				widthMm += 1000
			) {
				const room: RoomSize = { ...DEFAULT_ROOM, widthMm, depthMm: widthMm };
				const aabb = footprintAabbMm(RUN_MM, DEPTH_MM, rotationDeg);
				// Shove it far outside on both axes, then clamp.
				const placed = clampPlacement(
					{ xMm: 99_999, zMm: -99_999, rotationDeg },
					room,
					RUN_MM,
					DEPTH_MM,
				);

				// A footprint bigger than the room can't fit; it centres instead.
				const fitsX = aabb.widthMm <= room.widthMm;
				const fitsZ = aabb.depthMm <= room.depthMm;

				if (fitsX) {
					expect(placed.xMm + aabb.widthMm / 2).toBeLessThanOrEqual(
						room.widthMm / 2 + 1e-6,
					);
					expect(placed.xMm - aabb.widthMm / 2).toBeGreaterThanOrEqual(
						-room.widthMm / 2 - 1e-6,
					);
				} else {
					expect(placed.xMm).toBe(0);
				}

				if (fitsZ) {
					expect(placed.zMm + aabb.depthMm / 2).toBeLessThanOrEqual(
						room.depthMm / 2 + 1e-6,
					);
				} else {
					expect(placed.zMm).toBe(0);
				}
			}
		}
	});

	it("centres a run wider than the room rather than inverting the range", () => {
		const room: RoomSize = { ...DEFAULT_ROOM, widthMm: 1000 };
		const placed = clampPlacement(
			{ xMm: 400, zMm: 0, rotationDeg: 0 },
			room,
			RUN_MM,
			DEPTH_MM,
		);
		expect(placed.xMm).toBe(0);
		expect(Number.isNaN(placed.xMm)).toBe(false);
	});

	it("leaves rotation untouched", () => {
		expect(
			clampPlacement(
				{ xMm: 0, zMm: 0, rotationDeg: 137 },
				DEFAULT_ROOM,
				RUN_MM,
				DEPTH_MM,
			).rotationDeg,
		).toBe(137);
	});
});

describe("dragStep", () => {
	const room = DEFAULT_ROOM;
	// x is free over ±(4400 - 2400)/2 = ±1000mm.
	const leftWallX = -(room.widthMm - RUN_MM) / 2;

	/** Run a pointer path through the drag, returning the unit's x at each step. */
	const run = (path: number[], startXMm = 0) => {
		let placement = { xMm: startXMm, zMm: 0, rotationDeg: 0 };
		let grab = { grabXMm: path[0] - startXMm, grabZMm: 0 };
		return path.map((pointerXMm) => {
			const step = dragStep(
				pointerXMm,
				0,
				grab,
				placement,
				room,
				RUN_MM,
				DEPTH_MM,
			);
			placement = step.placement;
			grab = step.grab;
			return placement.xMm;
		});
	};

	it("tracks the pointer one-for-one away from the walls", () => {
		const xs = run([0, -100, -200, -300]);
		expect(xs).toEqual([0, -100, -200, -300]);
	});

	it("stops at the wall instead of passing through it", () => {
		const xs = run([0, -800, -1600, -2400]);
		expect(Math.min(...xs)).toBeCloseTo(leftWallX, 6);
	});

	it("moves the moment the pointer reverses, however far it overshot", () => {
		// Shove 1400mm past the left wall, then come back 50mm. Without the grab
		// re-anchoring the unit would sit dead for the whole 1400mm of overshoot.
		let placement = { xMm: 0, zMm: 0, rotationDeg: 0 };
		let grab = { grabXMm: 0, grabZMm: 0 };
		for (const pointerXMm of [0, -1000, -2000, -2400]) {
			const step = dragStep(
				pointerXMm,
				0,
				grab,
				placement,
				room,
				RUN_MM,
				DEPTH_MM,
			);
			placement = step.placement;
			grab = step.grab;
		}
		expect(placement.xMm).toBeCloseTo(leftWallX, 6);

		const back = dragStep(-2350, 0, grab, placement, room, RUN_MM, DEPTH_MM);
		expect(back.placement.xMm).toBeCloseTo(leftWallX + 50, 6);
	});

	it("absorbs the overshoot rather than replaying it", () => {
		const xs = run([0, -1500, -3000, -1500, 0]);
		// Re-anchoring makes the drag follow pointer *deltas*, so the round trip
		// deliberately does not land back at 0: the 2000mm pushed into the wall
		// is discarded, not stored up to be replayed on the way out. That is the
		// trade for having no dead zone, and it keeps the cursor on the spot of
		// the cabinet it grabbed.
		expect(xs[2]).toBeCloseTo(leftWallX, 6); // pinned at the wall
		expect(xs[3]).toBeCloseTo(leftWallX + 1500, 6); // moves at once on reversal
		expect(xs[4]).toBeCloseTo(1000, 6); // and on to the far limit
	});
});

describe("snapAngleDeg", () => {
	it("pulls near-square angles all the way to square", () => {
		expect(snapAngleDeg(7)).toBe(0);
		expect(snapAngleDeg(-7)).toBe(0);
		expect(snapAngleDeg(83)).toBe(90);
		expect(snapAngleDeg(275)).toBe(270);
	});

	it("falls back to the 15 degree step away from square", () => {
		expect(snapAngleDeg(44)).toBe(45);
		expect(snapAngleDeg(52)).toBe(45);
		expect(snapAngleDeg(38)).toBe(45);
	});

	it("wraps into [0, 360)", () => {
		expect(snapAngleDeg(360)).toBe(0);
		expect(snapAngleDeg(-90)).toBe(270);
	});
});

describe("backWallPlacement", () => {
	it("seats flush against the back wall, centred, unrotated", () => {
		const placed = backWallPlacement(DEFAULT_ROOM, DEPTH_MM);
		expect(placed).toEqual({
			xMm: 0,
			zMm: -DEFAULT_ROOM.depthMm / 2 + DEPTH_MM / 2,
			rotationDeg: 0,
		});
	});

	it("is already snapped — snapPlacement is a no-op on it", () => {
		const placed = backWallPlacement(DEFAULT_ROOM, DEPTH_MM);
		expect(snapPlacement(placed, DEFAULT_ROOM, RUN_MM, DEPTH_MM)).toEqual(
			placed,
		);
	});

	it("tracks the wall as the room grows", () => {
		const deep = { ...DEFAULT_ROOM, depthMm: DEFAULT_ROOM.depthMm + 2000 };
		expect(backWallPlacement(deep, DEPTH_MM).zMm).toBeLessThan(
			backWallPlacement(DEFAULT_ROOM, DEPTH_MM).zMm,
		);
	});
});

describe("snapPlacement", () => {
	const room = DEFAULT_ROOM;
	const backWallZ = -room.depthMm / 2 + DEPTH_MM / 2;

	it("seats exactly flush on release", () => {
		const placed = snapPlacement(
			{ xMm: 0, zMm: backWallZ + 100, rotationDeg: 0 },
			room,
			RUN_MM,
			DEPTH_MM,
			true,
		);
		expect(placed.zMm).toBeCloseTo(backWallZ, 6);
	});

	it("tracks the pointer exactly during a drag, including inside the zone", () => {
		// Gain of 1 everywhere is the whole point: the moment the unit travels
		// at a different rate to the pointer, it reads as sticking. Both the
		// hard snap and the eased pull failed here.
		for (const gap of [0, 5, 40, WALL_SNAP_MM - 1, WALL_SNAP_MM + 1, 800]) {
			const zMm = backWallZ + gap;
			const placed = snapPlacement(
				{ xMm: 0, zMm, rotationDeg: 0 },
				room,
				RUN_MM,
				DEPTH_MM,
			);
			expect(placed.zMm).toBeCloseTo(zMm, 6);
		}
	});

	it("moves the unit exactly as far as the pointer moved", () => {
		const at = (gap: number) =>
			snapPlacement(
				{ xMm: 0, zMm: backWallZ + gap, rotationDeg: 0 },
				room,
				RUN_MM,
				DEPTH_MM,
			).zMm;
		for (let gap = 400; gap > 0; gap -= 5) {
			expect(at(gap) - at(gap - 5)).toBeCloseTo(5, 6);
		}
	});

	it("stops at the wall rather than passing through it", () => {
		const placed = snapPlacement(
			{ xMm: 0, zMm: backWallZ - 300, rotationDeg: 0 },
			room,
			RUN_MM,
			DEPTH_MM,
		);
		expect(placed.zMm).toBeCloseTo(backWallZ, 6);
	});

	it("leaves a unit well clear of the wall where it is", () => {
		const zMm = backWallZ + WALL_SNAP_MM + 250;
		const placed = snapPlacement(
			{ xMm: 0, zMm, rotationDeg: 0 },
			room,
			RUN_MM,
			DEPTH_MM,
		);
		expect(placed.zMm).toBeCloseTo(zMm, 6);
	});

	it("seats against the side wall once turned 90 degrees", () => {
		// At 90° the back faces +X, so it seats against the right-hand wall.
		const placed = snapPlacement(
			{ xMm: room.widthMm / 2 - DEPTH_MM / 2 - 80, zMm: 0, rotationDeg: 88 },
			room,
			RUN_MM,
			DEPTH_MM,
			true,
		);
		expect(placed.rotationDeg).toBe(90);
		expect(placed.xMm).toBeCloseTo(room.widthMm / 2 - DEPTH_MM / 2, 6);
	});

	it("never snaps to a wall while off-square", () => {
		const placed = snapPlacement(
			{ xMm: 0, zMm: backWallZ + 50, rotationDeg: 45 },
			room,
			RUN_MM,
			DEPTH_MM,
		);
		expect(placed.rotationDeg).toBe(45);
		// Clamped inside, but not pulled flush.
		expect(placed.zMm).not.toBeCloseTo(backWallZ, 3);
	});

	it("keeps the result inside the room", () => {
		const placed = snapPlacement(
			{ xMm: 0, zMm: -99_999, rotationDeg: 0 },
			room,
			RUN_MM,
			DEPTH_MM,
		);
		expect(placed.zMm).toBeGreaterThanOrEqual(-room.depthMm / 2);
	});
});
