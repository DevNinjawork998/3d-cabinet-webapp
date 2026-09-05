import type { HingeSide } from "./layout";
import type { Vec3Mm } from "./parts";

/**
 * Where a door leaf turns, worked out from the leaf and the carcass it hangs
 * on rather than from constants.
 *
 * This exists because the planner draws whatever the drafter drew. A cabinet
 * uploaded next month may put its doors at a different depth, sitting proud of
 * the carcass or recessed into it, and a pivot assembled from constants is
 * wrong the moment that happens. The two boxes carry everything needed to
 * decide, so the decision is made from them.
 *
 * The bug this replaces: the pivot used to sit at the carcass's depth *centre*,
 * ~290mm behind a door that lives at the front face. Rotating about an axis
 * that far behind a leaf is not a swing, it is an orbit — the leaf swept
 * backwards through the carcass and its hinge edge travelled 438mm instead of
 * staying still.
 *
 * Deliberately free of the catalogue, the layout and the room: it needs two
 * boxes and nothing else, which is what makes it checkable by reading the
 * arithmetic.
 */

/** An axis-aligned box in the cabinet's own frame, millimetres. */
export type BoxMm = { min: Vec3Mm; max: Vec3Mm };

/**
 * How the leaf sits against the carcass.
 *
 * `overlay` — the leaf is proud of the carcass front and covers it. Its back
 * face rests on that front, and a cup hinge turns on exactly that face.
 * `inset` — the leaf sits inside the opening, flush or recessed. It has to
 * turn about its outer *front* arris; hinged on its back face it would drive
 * its outer corner straight into the carcass side.
 */
export type DoorFit = "overlay" | "inset";

export type SwingSpec = {
	side: HingeSide;
	fit: DoorFit;
	/**
	 * The vertical line the leaf turns about, cabinet frame, millimetres.
	 *
	 * There is no y: rotation about a vertical axis leaves y untouched, so the
	 * height the pivot is quoted at cannot matter. A horizontal-axis flap would
	 * need one, which is exactly why `suspectFlap` refuses rather than guesses.
	 */
	pivotXMm: number;
	pivotZMm: number;
	/** How far it opens before it would foul the carcass. */
	maxRad: number;
	/**
	 * The leaf is shaped like a lift-up flap, not a side-hung door.
	 *
	 * Infinite Cabinet builds side-hung doors, so a flap in an upload is more
	 * likely a mis-drawn or mis-named panel than a product. Swinging it about a
	 * vertical stile would send it sideways through the neighbouring cabinet, so
	 * the renderer draws it shut and the admin review table shows it instead.
	 */
	suspectFlap: boolean;
};

/**
 * How far a leaf's back face may sit behind the carcass front and still count
 * as resting on it. `parts.ts` positions a procedural leaf so its back face
 * lands exactly on that plane, and floating point puts it a hair either side —
 * without this the fallback would classify inset and hinge on the wrong edge.
 */
const OVERLAY_TOL_MM = 2;

/** A real hinge goes to ~110°; a shade under keeps a leaf at the end of a run
 * from reading as detached from its carcass. */
export const OVERLAY_OPEN_RAD = (110 * Math.PI) / 180;

/** An inset leaf binds on the carcass sooner than an overlay one clears it. */
export const INSET_OPEN_RAD = (95 * Math.PI) / 180;

/**
 * As far as a leaf may open with a neighbour against its hinge stile.
 *
 * Exactly a right angle, and the reason is arithmetic rather than taste. A
 * leaf's free edge sits `width · cos(angle)` from its hinge along the wall, so
 * past 90° the cosine goes negative and the edge crosses back over its own
 * stile — a 600mm door at 110° ends up 205mm into the neighbour's frontage,
 * which is where the neighbour's own open leaf already is. At 90° the cosine
 * is zero: the leaf stands square to the wall, its free edge dead on the
 * stile, and two neighbouring leaves are parallel planes that cannot meet.
 */
export const BOXED_IN_OPEN_RAD = Math.PI / 2;

/** Wider than tall by this much reads as a flap rather than a door. A single
 * wide door is only slightly wider than tall; a flap is nothing like it. */
const FLAP_RATIO = 1.6;

/**
 * The one angle every leaf on a cabinet opens to: the tightest of them.
 *
 * The limit is a property of the cabinet, not of one leaf. A pair whose left
 * side is a run end and whose right side touches a neighbour would otherwise
 * open 110° and 90° — two halves of one door front at visibly different
 * angles, which reads worse than either angle does on its own.
 */
export function sharedMaxRad(specs: SwingSpec[]): number {
	return specs.length === 0
		? OVERLAY_OPEN_RAD
		: Math.min(...specs.map((spec) => spec.maxRad));
}

export function swingOf(
	leaf: BoxMm,
	carcass: BoxMm,
	side: HingeSide,
	/**
	 * Whether something sits against the stile this leaf hangs on — a
	 * neighbouring cabinet, or the wall at the end of a run.
	 *
	 * A boolean and not the layout: `swingOf` answers a question about two
	 * boxes, and the caller already knows what is beside the cabinet because
	 * `exposure.ts` computes exactly that for the end panels. Defaults to
	 * false so a caller that has not been threaded yet behaves as before.
	 */
	boxedIn = false,
): SwingSpec {
	const fit: DoorFit =
		leaf.min.z >= carcass.max.z - OVERLAY_TOL_MM ? "overlay" : "inset";

	const widthMm = leaf.max.x - leaf.min.x;
	const heightMm = leaf.max.y - leaf.min.y;

	return {
		side,
		fit,
		pivotXMm: side === "left" ? leaf.min.x : leaf.max.x,
		// Overlay turns on the face against the carcass; inset turns on the face
		// away from it. Same leaf, opposite edge, and the depths decide which.
		pivotZMm: fit === "overlay" ? leaf.min.z : leaf.max.z,
		// `min`, never a replacement: an inset leaf binds at 95° whether or not
		// anything is beside it, and being boxed in can only ever close a door
		// further, never swing it wider.
		maxRad: Math.min(
			fit === "overlay" ? OVERLAY_OPEN_RAD : INSET_OPEN_RAD,
			boxedIn ? BOXED_IN_OPEN_RAD : Number.POSITIVE_INFINITY,
		),
		suspectFlap: heightMm > 0 && widthMm / heightMm >= FLAP_RATIO,
	};
}
