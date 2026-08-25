import type { Positioned } from "./layout";

/**
 * Which outer sides of a cabinet nothing sits against.
 *
 * A real run is finished where it can be seen: the cabinet at the end of a
 * row gets a veneered end panel matching the doors, while the sides buried
 * between neighbours stay plain carcass board nobody will ever look at. The
 * scene drew every side as melamine, which made the most camera-facing surface
 * in the default 3/4 view the one wrong material in the picture.
 *
 * Pure, and framework-free per `lib/planner`: it reads a row the way
 * `positionsOf` already hands it over — sorted left to right — and answers a
 * question about neighbours, not about geometry.
 */

/**
 * Positions are computed from widths and drag offsets, so two cabinets that
 * are touching can differ by a fraction of a millimetre. Anything under this
 * is the same edge.
 */
const TOUCHING_MM = 1;

export type ExposedSides = { left: boolean; right: boolean };

/** Both sides — what a cabinet standing on its own wears. */
export const FULLY_EXPOSED: ExposedSides = { left: true, right: true };

/**
 * `positions` must be one row, sorted left to right — which is exactly what
 * `positionsOf` returns. Passing both rows mixed together would have a wall
 * unit hide a base unit's end panel, and they are at different heights.
 */
export function exposedSides(
	positions: Positioned[],
	index: number,
): ExposedSides {
	const self = positions[index];
	if (!self) return FULLY_EXPOSED;

	const selfEnd = self.xMm + self.widthMm;

	// Every other cabinet in the row is a candidate, not just index ± 1: a row
	// is sorted by `xMm`, but a zero-width gap is not guaranteed to be with the
	// immediate neighbour once cabinets have been dragged around.
	let left = true;
	let right = true;
	for (let i = 0; i < positions.length; i++) {
		if (i === index) continue;
		const other = positions[i];
		const otherEnd = other.xMm + other.widthMm;
		if (Math.abs(otherEnd - self.xMm) <= TOUCHING_MM) left = false;
		if (Math.abs(other.xMm - selfEnd) <= TOUCHING_MM) right = false;
	}

	return { left, right };
}
