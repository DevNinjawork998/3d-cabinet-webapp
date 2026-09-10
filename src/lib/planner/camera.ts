import type { Vec3Mm } from "./parts";

/**
 * Where the camera is allowed to look.
 *
 * The planner's world is centred on the run: x runs along the wall from the
 * middle, y up from the floor, z out of the back wall into the room. So the
 * box is the room itself, and clamping to it is what stops a customer panning
 * until nothing is on screen but grey.
 */

export type RoomBoundsMm = {
	/** Along the wall. The *run's* width, not the wall's — a run built past
	 * the end of the wall still has to be reachable. */
	runWidthMm: number;
	roomDepthMm: number;
	ceilingHeightMm: number;
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

/**
 * The nearest point inside the room to the one asked for.
 *
 * Only the orbit *target* is clamped. The camera keeps its angle and distance
 * and is moved by the same correction, so a clamp reads as the pan running out
 * of room rather than as the view lurching.
 */
export function clampPanTarget(
	target: Vec3Mm,
	{ runWidthMm, roomDepthMm, ceilingHeightMm }: RoomBoundsMm,
): Vec3Mm {
	return {
		x: clamp(target.x, -runWidthMm / 2, runWidthMm / 2),
		y: clamp(target.y, 0, ceilingHeightMm),
		z: clamp(target.z, -roomDepthMm / 2, roomDepthMm / 2),
	};
}
