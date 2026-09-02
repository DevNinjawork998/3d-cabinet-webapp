import { CONSTRUCTION, type Construction, WALL_GAP_MM } from "./catalogue";
import { floorHeightMmOf, type PlannerLayout, type Positioned } from "./layout";
import { cabinetPartsMm, type PartRole, type Vec3Mm } from "./parts";

/**
 * The CAD-style measuring tool: click two points on the cabinets and read off
 * the distance between them.
 *
 * It follows AutoCAD's object-snap model rather than inventing one, because the
 * people checking these numbers already know that model:
 *
 * - **Snap targets come from the parts, not the box.** An earlier version knew
 *   only a cabinet's outer bounding box, so a shelf gap, a door reveal and a
 *   board thickness were all unmeasurable. `parts.ts` now describes every box a
 *   cabinet is drawn from and this snaps against all of them.
 * - **Typed snaps, ranked.** A corner outranks an edge midpoint, which outranks
 *   the bare surface point the ray actually hit — the same priority OSNAP uses,
 *   and the reason a `SnapKind` is returned rather than a lone point: the
 *   overlay draws a different glyph for each, so the user sees *what* they
 *   grabbed before committing to it.
 * - **A screen-space aperture.** See `apertureMm`.
 * - **An axis lock.** See `constrainToAxis`.
 *
 * The bounding box below is **not** read from the mesh. It's the exact same
 * placement math `Cabinet.tsx`/`Run` use to position a cabinet in the
 * scene, computed here in millimetres instead of Three.js objects, so a
 * snap point is guaranteed to sit exactly on the cabinet that's actually
 * drawn. Duplicating the transform is deliberate — pure geometry stays
 * testable against JSON fixtures without touching react-three-fiber, per
 * `lib/planner` being framework-free. The one part that is *not* duplicated
 * is how high a cabinet sits: `floorHeightMmOf` is shared with the scene,
 * because that rule now has a mode in it and a second copy would be a
 * measuring tool quoting a number the customer cannot see on screen. The cabinet's *interior* is not
 * duplicated: that comes from `parts.ts`, which the renderer reads too.
 */

export type { Vec3Mm };

type CabinetBoundsMm = {
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
	const floorHeightMm = floorHeightMmOf(position, layout);

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

/** The 8 corners of a box, x/y/z each low-then-high — index bit order
 * matches `EDGE_INDEX_PAIRS` below (bit 2 = x, bit 1 = y, bit 0 = z). */
function cornersOfBox(box: CabinetBoundsMm): Vec3Mm[] {
	const corners: Vec3Mm[] = [];
	for (const x of [box.minX, box.maxX]) {
		for (const y of [box.minY, box.maxY]) {
			for (const z of [box.minZ, box.maxZ]) {
				corners.push({ x, y, z });
			}
		}
	}
	return corners;
}

export function cabinetCornersMm(
	position: Positioned,
	layout: PlannerLayout,
): Vec3Mm[] {
	return cornersOfBox(cabinetBoundsMm(position, layout));
}

/** The 12 edges, as index pairs into an 8-corner list. */
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

// ------------------------------------------------------------ snap targets --

/** What a snapped point turned out to be. Ranked in this order. */
export type SnapKind = "corner" | "midpoint" | "surface";

/**
 * What the drafted mesh calls its groups.
 *
 * Mirrors `MeshGroupRole` in `lib/mesh/renderMesh.ts`, duplicated rather than
 * imported: `lib/planner` is framework-free and depends on nothing, and the
 * dependency between these two folders already runs the other way
 * (`lib/mesh/extract.ts` imports `catalogueSchema`). Six string literals are a
 * cheaper coupling than a cycle.
 */
export type DesignPartRole =
	| "carcass"
	| "door"
	| "drawerFront"
	| "shelf"
	| "hardware"
	| "other";

/**
 * One box of a cabinet drawn from its design file, in the cabinet's own frame:
 * x centred on the width, y up from the underside, z centred on the depth. The
 * same frame `cabinetPartsMm` reports in, so both go through one mapping.
 */
export type DesignPartBox = {
	role: DesignPartRole;
	minMm: Vec3Mm;
	maxMm: Vec3Mm;
};

export type SnapPoint = {
	point: Vec3Mm;
	kind: SnapKind;
	/** Which part it belongs to, or the carcass as a whole. `"carcass"` is also
	 * what an unsnapped surface point reports — the ray hit the cabinet, we just
	 * can't say which board without another intersection test. */
	role: PartRole | DesignPartRole;
};

export const SNAP_LABEL: Record<SnapKind, string> = {
	corner: "Corner",
	midpoint: "Midpoint",
	surface: "Face",
};

type WorldPartBox = { role: PartRole | DesignPartRole; box: CabinetBoundsMm };

/**
 * Every box of this cabinet in world millimetres — the carcass outline plus
 * each part that is actually drawn.
 *
 * The outer carcass box stays in the list even though its sides are also parts:
 * two of its opposite corners give exactly the cabinet's W×D×H, which is the
 * measurement customers take most and the one `measure()` is built around.
 *
 * `design` is the drafted mesh's own group boxes, when one has loaded. It has
 * to win over `cabinetPartsMm`, because the scene is drawing the design and a
 * dimension line must never be taken against a shelf that is not the shelf on
 * screen. Absent it — a family with no published mesh, or the frame or two
 * before the bytes land — the procedural boxes are exactly right, because that
 * is what is being drawn at that moment.
 */
function worldPartBoxes(
	position: Positioned,
	layout: PlannerLayout,
	design?: DesignPartBox[] | null,
	construction: Construction = CONSTRUCTION,
): WorldPartBox[] {
	const carcass = cabinetBoundsMm(position, layout);
	const centreX = (carcass.minX + carcass.maxX) / 2;
	const floorY = carcass.minY;
	const centreZ = (carcass.minZ + carcass.maxZ) / 2;

	// One mapping from the cabinet's own frame into world millimetres, shared by
	// both sources so they can never drift apart.
	const toWorld = (min: Vec3Mm, max: Vec3Mm): CabinetBoundsMm => ({
		minX: centreX + min.x,
		maxX: centreX + max.x,
		minY: floorY + min.y,
		maxY: floorY + max.y,
		minZ: centreZ + min.z,
		maxZ: centreZ + max.z,
	});

	if (design && design.length > 0) {
		return [
			{ role: "carcass", box: carcass },
			...design.map(({ role, minMm, maxMm }) => ({
				role,
				box: toWorld(minMm, maxMm),
			})),
		];
	}

	const parts = cabinetPartsMm(
		position.family,
		position.widthMm,
		position.placed.doorStyleId !== null,
		construction,
	);

	return [
		{ role: "carcass", box: carcass },
		...parts.map(({ role, centreMm, sizeMm }) => ({
			role,
			box: toWorld(
				{
					x: centreMm.x - sizeMm.x / 2,
					y: centreMm.y - sizeMm.y / 2,
					z: centreMm.z - sizeMm.z / 2,
				},
				{
					x: centreMm.x + sizeMm.x / 2,
					y: centreMm.y + sizeMm.y / 2,
					z: centreMm.z + sizeMm.z / 2,
				},
			),
		})),
	];
}

const midpoint = (a: Vec3Mm, b: Vec3Mm): Vec3Mm => ({
	x: (a.x + b.x) / 2,
	y: (a.y + b.y) / 2,
	z: (a.z + b.z) / 2,
});

/**
 * How close a click has to land to a snap target, when no aperture is supplied.
 *
 * Only a fallback for callers with no camera — the scene passes `apertureMm()`
 * instead, and should.
 */
export const DEFAULT_SNAP_MM = 40;

/**
 * Snaps a raw surface hit to the nearest corner, then the nearest edge
 * midpoint, of any part of the cabinet it landed on.
 *
 * Ranked, not nearest-wins: a corner 30mm away beats a midpoint 2mm away,
 * because that is what OSNAP does and because a corner is the point a
 * dimension is almost always taken from. Within a rank, closest wins.
 *
 * There is deliberately no "nearest point along an edge" rank. The previous
 * version had one, and it was a quiet source of wrong numbers: the marker for a
 * point 90mm along a shelf's front edge looked exactly like the marker for that
 * shelf's corner. With every part's corners and midpoints now reachable, an
 * arbitrary edge point buys nothing that the surface fallback does not.
 */
export function snapToCabinet(
	hit: Vec3Mm,
	position: Positioned,
	layout: PlannerLayout,
	snapMm: number = DEFAULT_SNAP_MM,
	/** The drafted mesh's group boxes, when the scene is drawing one. */
	design?: DesignPartBox[] | null,
	construction: Construction = CONSTRUCTION,
): SnapPoint {
	const boxes = worldPartBoxes(position, layout, design, construction);

	for (const kind of ["corner", "midpoint"] as const) {
		let best: SnapPoint | null = null;
		let bestDist = snapMm;

		for (const { role, box } of boxes) {
			const corners = cornersOfBox(box);
			const candidates =
				kind === "corner"
					? corners
					: EDGE_INDEX_PAIRS.map(([a, b]) => midpoint(corners[a], corners[b]));

			for (const point of candidates) {
				const d = distanceMm(hit, point);
				if (d < bestDist) {
					bestDist = d;
					best = { point, kind, role };
				}
			}
		}

		if (best) return best;
	}

	return { point: hit, kind: "surface", role: "carcass" };
}

// ---------------------------------------------------------- screen aperture --

/** Roughly AutoCAD's default OSNAP aperture, in CSS pixels. */
export const APERTURE_PX = 12;

/**
 * How many world millimetres `aperturePx` screen pixels cover, at a point
 * `distanceM` from a perspective camera.
 *
 * The snap tolerance has to be a screen distance, not a world one. A fixed
 * 40mm — which this used to be — is sub-pixel when the camera is pulled back to
 * frame a 4m run, so nothing snaps and every pick is a raw surface point; and
 * it is enormous when zoomed into one carcass, so a click near a shelf grabs a
 * corner 39mm away instead. That is the whole "the two dots landed somewhere
 * odd" complaint, and it is why CAD measures the aperture in pixels.
 *
 * Perspective only. Every planner view — 3D, elevation and plan — frames with
 * the same `PerspectiveCamera` at a different radius, so one formula covers all
 * three; an orthographic view would need its own.
 */
export function apertureMm(
	distanceM: number,
	fovDeg: number,
	viewportHeightPx: number,
	aperturePx: number = APERTURE_PX,
): number {
	if (viewportHeightPx <= 0) return DEFAULT_SNAP_MM;
	const visibleHeightM = 2 * distanceM * Math.tan((fovDeg * Math.PI) / 360);
	return aperturePx * (visibleHeightM / viewportHeightPx) * 1000;
}

// ---------------------------------------------------------------- axis lock --

/**
 * Which axis a measurement is constrained to.
 *
 * `"auto"` is the default and does what SketchUp's inference does: once the
 * first point is down, the second is pulled onto whichever axis dominates, so
 * a roughly-vertical pick becomes exactly a height. Without it the two points
 * sit on different planes, the readout reports three numbers, and the user is
 * left doing the constraining by hand.
 *
 * `"free"` is the escape hatch and has to stay: two opposite corners of a
 * cabinet give its W×D×H in one measurement, and that needs all three axes.
 */
export type MeasureAxis = "auto" | "free" | "x" | "y" | "z";

export const MEASURE_AXES: readonly MeasureAxis[] = [
	"auto",
	"x",
	"y",
	"z",
	"free",
];

export const AXIS_LABEL: Record<MeasureAxis, string> = {
	auto: "Auto",
	free: "Free",
	x: "Width",
	y: "Height",
	z: "Depth",
};

/** Whichever of x/y/z the step from `from` to `to` is mostly along. Ties go to
 * the earlier axis, which only happens on an exact diagonal. */
export function dominantAxis(from: Vec3Mm, to: Vec3Mm): "x" | "y" | "z" {
	const dx = Math.abs(to.x - from.x);
	const dy = Math.abs(to.y - from.y);
	const dz = Math.abs(to.z - from.z);
	if (dx >= dy && dx >= dz) return "x";
	return dy >= dz ? "y" : "z";
}

/**
 * `to`, moved onto the axis lock: the locked axis keeps its value and the other
 * two are taken from `from`, so the two deltas are exactly zero rather than
 * nearly zero.
 */
export function constrainToAxis(
	from: Vec3Mm,
	to: Vec3Mm,
	axis: MeasureAxis,
): Vec3Mm {
	if (axis === "free") return to;
	const locked = axis === "auto" ? dominantAxis(from, to) : axis;
	return {
		x: locked === "x" ? to.x : from.x,
		y: locked === "y" ? to.y : from.y,
		z: locked === "z" ? to.z : from.z,
	};
}

// ------------------------------------------------------------- the readout --

/** Below this, an axis delta is stray noise (unsnapped surface points never
 * land on exactly the same x/y/z), not a dimension the user meant to read —
 * a pure-height pick shouldn't also report a 3mm "width". Shared by the 3D
 * dashed leg (`MeasureOverlay`) and the W/H/D chips (`StudioScreen`) so both
 * agree on what counts as "no dimension on this axis".
 *
 * Only reachable in `"free"` mode now: under a lock the other two deltas are
 * exactly zero and there is nothing to filter. It stays because free mode is
 * where two surface points can still land a few millimetres apart. */
const AXIS_NOISE_TOLERANCE_MM = 5;

/** An axis also doesn't count as a dimension if it's small *relative to the
 * measurement's biggest axis* — a width pick with a few stray cm of depth
 * from an imprecise click on an adjoining face is still "a width", not a
 * width-and-depth. Two opposite corners of a cabinet (genuinely comparable
 * W/H/D) clear this; a single mostly-one-axis pick doesn't. */
const AXIS_RELATIVE_NOISE_FRACTION = 0.15;

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

/** One colour per axis — shared between the 3D dashed legs (`MeasureOverlay`)
 * and the W/H/D readout chips (`StudioScreen`) so a line and its number stay
 * visually paired even when a leg is too short on screen to carry its own
 * floating label. */
export const AXIS_COLOR = {
	x: "#b45309",
	y: "#047857",
	z: "#4338ca",
} as const;

type Measurement = {
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
