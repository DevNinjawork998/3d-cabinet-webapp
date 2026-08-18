import { WALL_GAP_MM } from "./catalogue";
import type { PlannerLayout, Positioned } from "./layout";

/**
 * The CAD-style measuring tool: click two points on the cabinets — a
 * corner, a point along an edge, or a bare surface point — and read off the
 * width/height/depth between them plus the straight-line distance.
 *
 * The bounding box below is **not** read from the mesh. It's the exact same
 * placement math `Cabinet.tsx`/`Run` use to position a cabinet in the
 * scene, computed here in millimetres instead of Three.js objects, so a
 * snap point is guaranteed to sit exactly on the cabinet that's actually
 * drawn. Duplicating the transform is deliberate — pure geometry stays
 * testable against JSON fixtures without touching react-three-fiber, per
 * `lib/planner` being framework-free.
 */

export type Vec3Mm = { x: number; y: number; z: number };

export type CabinetBoundsMm = {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ: number;
	maxZ: number;
};

/** World-space bounding box of a placed cabinet, in millimetres, in the same
 * coordinate system the scene renders in (metres = mm / 1000). */
export function cabinetBoundsMm(
	position: Positioned,
	layout: PlannerLayout,
): CabinetBoundsMm {
	const runWidthMm = layout.wallWidthMm;
	const floorHeightMm =
		position.family.kind === "wall"
			? layout.hangingHeightMm
			: position.family.floorHeightMm;

	const minX = position.xMm - runWidthMm / 2;
	const maxX = minX + position.widthMm;

	const minY = floorHeightMm;
	const maxY = floorHeightMm + position.family.heightMm;

	// Run's outer group sits the whole scene back by this much so cabinets'
	// backs meet the wall rather than the room's own back plane.
	const wallOffsetZ = -layout.roomDepthMm / 2 + WALL_GAP_MM;
	const minZ = wallOffsetZ;
	const maxZ = wallOffsetZ + position.family.depthMm;

	return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** The 8 corners of the box, x/y/z each low-then-high — index bit order
 * matches `EDGE_INDEX_PAIRS` below (bit 2 = x, bit 1 = y, bit 0 = z). */
export function cabinetCornersMm(
	position: Positioned,
	layout: PlannerLayout,
): Vec3Mm[] {
	const { minX, maxX, minY, maxY, minZ, maxZ } = cabinetBoundsMm(
		position,
		layout,
	);
	const corners: Vec3Mm[] = [];
	for (const x of [minX, maxX]) {
		for (const y of [minY, maxY]) {
			for (const z of [minZ, maxZ]) {
				corners.push({ x, y, z });
			}
		}
	}
	return corners;
}

/** The 12 edges, as index pairs into `cabinetCornersMm`'s 8-corner list. */
const EDGE_INDEX_PAIRS: ReadonlyArray<readonly [number, number]> = [
	[0, 1],
	[2, 3],
	[4, 5],
	[6, 7], // along z
	[0, 2],
	[1, 3],
	[4, 6],
	[5, 7], // along y
	[0, 4],
	[1, 5],
	[2, 6],
	[3, 7], // along x
];

export function distanceMm(a: Vec3Mm, b: Vec3Mm): number {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function nearestPointOnSegment(p: Vec3Mm, a: Vec3Mm, b: Vec3Mm): Vec3Mm {
	const abx = b.x - a.x;
	const aby = b.y - a.y;
	const abz = b.z - a.z;
	const lenSq = abx * abx + aby * aby + abz * abz;
	if (lenSq === 0) return a;
	const t = Math.max(
		0,
		Math.min(
			1,
			((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lenSq,
		),
	);
	return { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t };
}

/** How close a click has to land to a corner or edge to snap to it, rather
 * than keeping the raw surface point the ray actually hit. */
export const SNAP_TOLERANCE_MM = 40;

/** Below this, an axis delta is stray noise (unsnapped surface points never
 * land on exactly the same x/y/z), not a dimension the user meant to read —
 * a pure-height pick shouldn't also report a 3mm "width". Shared by the 3D
 * dashed leg (`MeasureOverlay`) and the W/H/D chips (`StudioScreen`) so both
 * agree on what counts as "no dimension on this axis". */
export const AXIS_NOISE_TOLERANCE_MM = 5;

/** An axis also doesn't count as a dimension if it's small *relative to the
 * measurement's biggest axis* — a width pick with a few stray cm of depth
 * from an imprecise click on an adjoining face is still "a width", not a
 * width-and-depth. Two opposite corners of a cabinet (genuinely comparable
 * W/H/D) clear this; a single mostly-one-axis pick doesn't. */
export const AXIS_RELATIVE_NOISE_FRACTION = 0.15;

/** Whether `valueMm` is a real dimension of this measurement, given the
 * largest of the three axis deltas — combines the absolute and relative
 * noise floors above. */
export function isAxisSignificant(valueMm: number, maxAxisMm: number): boolean {
	if (maxAxisMm <= 0) return false;
	return (
		valueMm >= AXIS_NOISE_TOLERANCE_MM &&
		valueMm >= maxAxisMm * AXIS_RELATIVE_NOISE_FRACTION
	);
}

/**
 * Snaps a raw surface hit to the nearest vertex or edge of the cabinet it
 * landed on, within `snapMm`. A corner wins over an edge through it — a
 * vertex is never farther from the hit than the edges meeting there — so
 * edges are only checked once no corner is already close enough.
 */
export function snapToCabinet(
	hit: Vec3Mm,
	position: Positioned,
	layout: PlannerLayout,
	snapMm: number = SNAP_TOLERANCE_MM,
): Vec3Mm {
	const corners = cabinetCornersMm(position, layout);

	let best = hit;
	let bestDist = snapMm;

	for (const corner of corners) {
		const d = distanceMm(hit, corner);
		if (d < bestDist) {
			bestDist = d;
			best = corner;
		}
	}

	if (best === hit) {
		for (const [ai, bi] of EDGE_INDEX_PAIRS) {
			const p = nearestPointOnSegment(hit, corners[ai], corners[bi]);
			const d = distanceMm(hit, p);
			if (d < bestDist) {
				bestDist = d;
				best = p;
			}
		}
	}

	return best;
}

/** One colour per axis — shared between the 3D dashed legs (`MeasureOverlay`)
 * and the W/H/D readout chips (`StudioScreen`) so a line and its number stay
 * visually paired even when a leg is too short on screen to carry its own
 * floating label. */
export const AXIS_COLOR = {
	x: "#b45309",
	y: "#047857",
	z: "#4338ca",
} as const;

export type Measurement = {
	a: Vec3Mm;
	b: Vec3Mm;
	/** |Δx| — width between the two points. */
	widthMm: number;
	/** |Δy| — height between the two points. */
	heightMm: number;
	/** |Δz| — depth between the two points. */
	depthMm: number;
	/** Straight-line distance, not the sum of the axis deltas. */
	distanceMm: number;
};

/** Two opposite corners of a cabinet give exactly its W×D×H — that's the
 * whole trick, not a separate "bounding box mode": pick two points, read
 * the axis deltas as the box those two points define. */
export function measure(a: Vec3Mm, b: Vec3Mm): Measurement {
	return {
		a,
		b,
		widthMm: Math.abs(a.x - b.x),
		heightMm: Math.abs(a.y - b.y),
		depthMm: Math.abs(a.z - b.z),
		distanceMm: distanceMm(a, b),
	};
}
