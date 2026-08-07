import type { RoomSize } from "./room";

/** Where the unit stands on the floor. Presentation only — placement is not
 * part of the design document, is not priced, and does not reach the BOM.
 * Origin is the room centre; `rotationDeg` 0 means the run is parallel to the
 * back wall with its doors facing into the room. */
export type Placement = {
	xMm: number;
	zMm: number;
	rotationDeg: number;
};

/** Where a wardrobe goes until the customer says otherwise: centred and flush
 * against the back wall. Derived from the room rather than a constant, so it
 * stays against the wall as the room is resized. */
export function backWallPlacement(room: RoomSize, depthMm: number): Placement {
	return { xMm: 0, zMm: -room.depthMm / 2 + depthMm / 2, rotationDeg: 0 };
}

/** Free rotation lands on these steps, so a dragged angle still reads as
 * deliberate rather than 43.7°. */
export const ANGLE_STEP_DEG = 15;
/** Within this of a right angle, go all the way — wardrobes sit square. */
export const SQUARE_SNAP_DEG = 8;
/** How close the back face has to be, when the drag ends, to seat flush. */
export const WALL_SNAP_MM = 150;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Axis-aligned bounding box of the rotated footprint. */
export function footprintAabbMm(
	runWidthMm: number,
	depthMm: number,
	rotationDeg: number,
): { widthMm: number; depthMm: number } {
	const cos = Math.abs(Math.cos(toRad(rotationDeg)));
	const sin = Math.abs(Math.sin(toRad(rotationDeg)));
	return {
		widthMm: runWidthMm * cos + depthMm * sin,
		depthMm: runWidthMm * sin + depthMm * cos,
	};
}

/** Clamp one axis so the footprint stays inside the room. A footprint larger
 * than the room centres on that axis rather than yielding an inverted range. */
function clampAxis(value: number, roomMm: number, footprintMm: number): number {
	const slack = (roomMm - footprintMm) / 2;
	if (slack <= 0) return 0;
	return Math.min(slack, Math.max(-slack, value));
}

export function clampPlacement(
	placement: Placement,
	room: RoomSize,
	runWidthMm: number,
	depthMm: number,
): Placement {
	const aabb = footprintAabbMm(runWidthMm, depthMm, placement.rotationDeg);
	return {
		...placement,
		xMm: clampAxis(placement.xMm, room.widthMm, aabb.widthMm),
		zMm: clampAxis(placement.zMm, room.depthMm, aabb.depthMm),
	};
}

/** The pointer's hold on the unit: where it grabbed, relative to the centre. */
export type Grab = { grabXMm: number; grabZMm: number };

/**
 * One step of a move drag.
 *
 * The returned grab is re-anchored to wherever the unit actually ended up,
 * which is the whole point. Push the unit into a wall and it stops while the
 * pointer keeps travelling; with a fixed grab, the pointer then has to retrace
 * every millimetre of that overshoot before the unit moves again — a dead zone
 * exactly as long as you pushed, which feels like the unit sticking to the
 * wall. Re-anchoring means it starts moving the instant you reverse.
 */
export function dragStep(
	pointerXMm: number,
	pointerZMm: number,
	grab: Grab,
	placement: Placement,
	room: RoomSize,
	runWidthMm: number,
	depthMm: number,
): { placement: Placement; grab: Grab } {
	const settled = clampPlacement(
		{
			...placement,
			xMm: pointerXMm - grab.grabXMm,
			zMm: pointerZMm - grab.grabZMm,
		},
		room,
		runWidthMm,
		depthMm,
	);
	return {
		placement: settled,
		grab: {
			grabXMm: pointerXMm - settled.xMm,
			grabZMm: pointerZMm - settled.zMm,
		},
	};
}

/** Normalise to [0, 360). */
function wrapDeg(deg: number): number {
	return ((deg % 360) + 360) % 360;
}

export function snapAngleDeg(rotationDeg: number): number {
	const wrapped = wrapDeg(rotationDeg);
	const nearestSquare = Math.round(wrapped / 90) * 90;
	if (Math.abs(wrapped - nearestSquare) <= SQUARE_SNAP_DEG) {
		return wrapDeg(nearestSquare);
	}
	return wrapDeg(Math.round(wrapped / ANGLE_STEP_DEG) * ANGLE_STEP_DEG);
}

/**
 * Snap a dragged placement: angle first, then — only once the unit is square
 * and only when `exact` is set — seat it flush against the wall its back is
 * nearest.
 *
 * There is deliberately no wall attraction *during* a drag. Moving the unit
 * somewhere the pointer isn't means the two travel at different speeds, and
 * whatever curve that ratio follows, it has to fall to zero wherever the unit
 * ends up parked — which is the freeze, just relocated. A hard snap freezes
 * across the whole zone and then jumps on the way out; easing the pull in
 * moves the freeze onto the wall itself. So the unit tracks the pointer 1:1
 * and clampPlacement stops it at the wall, exactly like pushing a real
 * wardrobe into a corner. `exact` then tidies up on release.
 *
 * At a square angle the footprint AABB *is* the footprint, so "flush" is just
 * pushing the AABB edge onto the room edge.
 */
export function snapPlacement(
	placement: Placement,
	room: RoomSize,
	runWidthMm: number,
	depthMm: number,
	exact = false,
): Placement {
	const rotationDeg = snapAngleDeg(placement.rotationDeg);
	const snapped = { ...placement, rotationDeg };

	if (!exact || rotationDeg % 90 !== 0)
		return clampPlacement(snapped, room, runWidthMm, depthMm);

	const aabb = footprintAabbMm(runWidthMm, depthMm, rotationDeg);

	// The back face is whichever side the unit is turned away from. At 0° the
	// doors face +Z, so the back is at -Z.
	const back = { 0: "-z", 90: "+x", 180: "+z", 270: "-x" }[rotationDeg] as
		| "-z"
		| "+x"
		| "+z"
		| "-x";

	const gapToWall = {
		"-z": placement.zMm - aabb.depthMm / 2 + room.depthMm / 2,
		"+z": room.depthMm / 2 - (placement.zMm + aabb.depthMm / 2),
		"-x": placement.xMm - aabb.widthMm / 2 + room.widthMm / 2,
		"+x": room.widthMm / 2 - (placement.xMm + aabb.widthMm / 2),
	}[back];

	// Close enough on release: seat it. Outside the zone this is a no-op.
	if (gapToWall >= 0 && gapToWall <= WALL_SNAP_MM) {
		if (back === "-z") snapped.zMm -= gapToWall;
		if (back === "+z") snapped.zMm += gapToWall;
		if (back === "-x") snapped.xMm -= gapToWall;
		if (back === "+x") snapped.xMm += gapToWall;
	}

	return clampPlacement(snapped, room, runWidthMm, depthMm);
}
