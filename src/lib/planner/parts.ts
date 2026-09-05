import {
	CONSTRUCTION,
	type Construction,
	doorLeavesFor,
	type Family,
} from "./catalogue";

/**
 * Every box a cabinet is drawn from, as numbers.
 *
 * This exists because two things need the same geometry and used to compute it
 * separately. `Cabinet.tsx` drew the shelves, leaves and drawer fronts inline;
 * `measure.ts` knew only the cabinet's outer bounding box, so the measuring
 * tool could not snap to a shelf, a door edge or a board face — the things a
 * customer actually wants a number for. Deriving the interior a second time
 * inside `measure.ts` would have put shelf spacing in two places, and the first
 * change to either would have made the dimension line disagree with the cabinet
 * it was drawn against.
 *
 * So the numbers live here and the renderer reads them, rather than the other
 * way round. Pure TypeScript, no React and no three.js, per `lib/planner`.
 *
 * Handles and rails are deliberately absent. They are hardware, not carcass,
 * and a cylinder is not a snap target anyone wants — snapping to a knob instead
 * of the door behind it is exactly the "the dot went somewhere odd" failure
 * this is meant to remove.
 */

export type Vec3Mm = { x: number; y: number; z: number };

export type PartRole =
	| "side"
	| "top"
	| "bottom"
	| "back"
	| "shelf"
	| "doorLeaf"
	| "drawerFront"
	/** A side, bottom or back of the box behind a drawer front. `index` is the
	 * drawer it belongs to, so all four travel with their own front. */
	| "drawerBox"
	| "leg";

export type PartBoxMm = {
	role: PartRole;
	/** Position within its role, left-to-right or bottom-to-top. `Cabinet.tsx`
	 * needs it to decide which side of a leaf the handle goes on. */
	index: number;
	/**
	 * Millimetres in the cabinet's **own** frame, which is the frame
	 * `Cabinet.tsx` renders in: x centred on the carcass width, y measured up
	 * from the floor (so a plinth is already accounted for), z centred on the
	 * carcass depth. `measure.ts` maps this into world space; the renderer
	 * divides by 1000 and is done.
	 */
	centreMm: Vec3Mm;
	sizeMm: Vec3Mm;
};

/** The reveal between two leaves, and between a leaf and the carcass edge. */
export const DOOR_GAP_MM = 4;

/** How wide a foot is, when the design did not say. The client's Häfele Axilo
 * 48 measures 57mm across, so this guess is 7mm light — which is why a design
 * that records its own `legDiameterMm` overrides it. */
export const LEG_DIAMETER_MM = 50;

/**
 * The gap between the carcass edge and the *outer edge* of a foot, when the
 * design did not say — so it reads as tucked under the cabinet rather than
 * propping up its corners.
 *
 * 35 rather than the 60 this used to be because the number changed meaning, not
 * position: it was the inset to the foot's *centre*, and 35 + half of the 50mm
 * fallback diameter is the same 60. Edge-to-edge is what `geometryOf` can
 * actually measure off a design, and both have to mean the same thing for one
 * to substitute for the other. The client's own file measures 17.
 */
const LEG_INSET_MM = 35;

/** How far a plinth is set back from the carcass front when there are no feet
 * to clip to — the toe recess the scene has always drawn. */
export const PLINTH_RECESS_MM = 30;
/** A door or drawer front is thicker board than the carcass. */
export const FRONT_THICKNESS_MM = 18;

/** Runner gap each side, between the carcass inner face and the box side. */
const DRAWER_RUNNER_MM = 13;

/** How far the box stops short of the back panel, for the runner's fixings. */
const DRAWER_BACK_CLEARANCE_MM = 30;

/** How much lower the box sides are than the front, top and bottom. A drawer
 * front overlaps its box; sides level with it would read as a solid block. */
const DRAWER_SIDE_DROP_MM = 20;

/**
 * How far a drawer runs out of its carcass when the cabinet is opened.
 *
 * Full-extension runners pull the box clear of the carcass front, and a little
 * short of that is what keeps the front from reading as detached from the unit
 * it belongs to. A fraction of the depth rather than a constant because a
 * 300mm-deep wall drawer and a 600mm base drawer should not travel the same.
 */
const DRAWER_TRAVEL_FRACTION = 0.75;

export function drawerTravelMm(depthMm: number): number {
	return Math.round(Math.max(0, depthMm) * DRAWER_TRAVEL_FRACTION);
}

/** Interior faces render darker so an open carcass reads as a box you can see
 * into. Derived from the role rather than stored, so there is one fewer field
 * to keep true. */
export const isInteriorPart = (role: PartRole) =>
	role === "back" || role === "shelf" || role === "drawerBox";

/**
 * How far off the floor the carcass sits, on what, and how far that is tucked
 * back from the front.
 *
 * A design that recorded feet stands on them; everything else keeps the
 * recessed plinth the scene has always drawn. Wall units sit on neither.
 *
 * `insetMm` is what a kick board has to respect. On feet it is the leg inset,
 * because a real kick clips to the front of the legs — set the board back any
 * further and the feet it exists to hide are still showing. The client's own
 * file measures 17mm, so this cannot be a fixed guess.
 */
export function standOf(
	family: Family,
	construction: Construction = CONSTRUCTION,
) {
	if (family.kind === "wall") {
		return { heightMm: 0, legs: 0, insetMm: 0 };
	}
	const legs = family.geometry?.legs ?? 0;
	const legHeightMm = family.geometry?.legHeightMm ?? 0;
	return legs > 0 && legHeightMm > 0
		? {
				heightMm: legHeightMm,
				legs,
				insetMm: family.geometry?.legInsetMm || LEG_INSET_MM,
			}
		: {
				heightMm: construction.plinthHeightMm,
				legs: 0,
				insetMm: PLINTH_RECESS_MM,
			};
}

/**
 * Shelves split the opening into equal bays, which is how they are actually
 * set out — three shelves make four bays, not three shelves crowded at the
 * bottom. Nothing for a cabinet with no shelves, so a drawer bank does not get
 * a stray board through the middle of it.
 */
export function shelfHeightsMm(
	count: number,
	floorMm: number,
	heightMm: number,
	thicknessMm: number,
): number[] {
	if (count <= 0) return [];
	const clear = heightMm - thicknessMm * 2;
	return Array.from(
		{ length: count },
		(_, i) => floorMm + thicknessMm + (clear * (i + 1)) / (count + 1),
	);
}

/** How many shelves and drawers this family holds, and whether it is backed.
 *
 * A family imported before design intake recorded `geometry` — or a
 * hand-written one — keeps the old look: one shelf, leaves derived from width,
 * a back. Same fallbacks `Cabinet.tsx` applied inline before this module. */
export function fitOutOf(
	family: Family,
	widthMm: number,
	construction: Construction,
) {
	const drawers = family.geometry?.drawers ?? family.drawers;

	return {
		// A drawer bank's volume *is* its drawers, so it carries no shelf. The
		// default of 1 used to apply to every family, which put a board through
		// the middle drawer of every drawer unit. Invisible while the fronts sat
		// flush; a shelf through an open drawer box the moment one runs out.
		shelves:
			drawers > 0
				? 0
				: family.geometry
					? family.geometry.shelves + family.geometry.fixedShelves
					: 1,
		drawers,
		// Leaf count is a property of the width, not of the family: `geometry`
		// is learned from one design at one width, so a family that learned "2"
		// from its 900 must not draw a pair on its 400. The design only tells
		// us whether this family has fronts at all.
		doorLeaves:
			family.geometry?.doorLeaves === 0
				? 0
				: doorLeavesFor(widthMm, construction.doorLeavesThresholdMm),
		hasBack: family.geometry?.hasBack ?? true,
	};
}

/** Where the front of a door or drawer sits: clear of the carcass, standing
 * proud of it by half its own thickness. */
export const frontZMm = (depthMm: number) =>
	depthMm / 2 + FRONT_THICKNESS_MM / 2;

/**
 * Every box in one cabinet, in its own frame.
 *
 * `hasDoor` because a doorless carcass is a real state in the planner — the
 * customer has placed a unit but not chosen a front yet — and it must not
 * report leaves that are not drawn.
 */
export function cabinetPartsMm(
	family: Family,
	widthMm: number,
	hasDoor: boolean,
	construction: Construction = CONSTRUCTION,
): PartBoxMm[] {
	const t = construction.panelThicknessMm;
	// What the carcass stands on, and how tall it is. A design with feet floats
	// the box on them; otherwise it is the plinth, as before.
	const stand = standOf(family, construction);
	const plinth = stand.heightMm;
	const w = widthMm;
	const d = family.depthMm;
	const carcassH = family.heightMm - plinth;
	const midY = plinth + carcassH / 2;

	const { shelves, drawers, doorLeaves, hasBack } = fitOutOf(
		family,
		widthMm,
		construction,
	);

	const parts: PartBoxMm[] = [
		{
			role: "side",
			index: 0,
			centreMm: { x: -w / 2 + t / 2, y: midY, z: 0 },
			sizeMm: { x: t, y: carcassH, z: d },
		},
		{
			role: "side",
			index: 1,
			centreMm: { x: w / 2 - t / 2, y: midY, z: 0 },
			sizeMm: { x: t, y: carcassH, z: d },
		},
		{
			role: "bottom",
			index: 0,
			centreMm: { x: 0, y: plinth + t / 2, z: 0 },
			sizeMm: { x: w, y: t, z: d },
		},
		{
			role: "top",
			index: 0,
			centreMm: { x: 0, y: plinth + carcassH - t / 2, z: 0 },
			sizeMm: { x: w, y: t, z: d },
		},
	];

	if (hasBack) {
		parts.push({
			role: "back",
			index: 0,
			centreMm: { x: 0, y: midY, z: -d / 2 + t / 2 },
			sizeMm: { x: w, y: carcassH, z: t },
		});
	}

	// Feet, in pairs front-to-back across the width. Emitted before the fit-out
	// so a caller reading in order gets the cabinet bottom-up.
	if (stand.legs > 0) {
		// The design's own foot, when it recorded one. Zero means it did not, so
		// the constants above stand in — see `cabinetGeometrySchema`.
		const legDiameter = family.geometry?.legDiameterMm || LEG_DIAMETER_MM;
		const legInset = family.geometry?.legInsetMm || LEG_INSET_MM;
		const pairs = Math.max(2, Math.ceil(stand.legs / 2));
		const usable = w - (legInset + legDiameter / 2) * 2;
		for (let i = 0; i < pairs; i++) {
			const x = pairs === 1 ? 0 : -usable / 2 + (usable * i) / (pairs - 1);
			for (const [j, z] of [
				d / 2 - (legInset + legDiameter / 2),
				-d / 2 + (legInset + legDiameter / 2),
			].entries()) {
				parts.push({
					role: "leg",
					index: i * 2 + j,
					centreMm: { x, y: stand.heightMm / 2, z },
					sizeMm: {
						x: legDiameter,
						y: stand.heightMm,
						z: legDiameter,
					},
				});
			}
		}
	}

	for (const [i, y] of shelfHeightsMm(shelves, plinth, carcassH, t).entries()) {
		parts.push({
			role: "shelf",
			index: i,
			centreMm: { x: 0, y, z: 0 },
			sizeMm: { x: w - t * 2, y: t, z: d - t * 2 },
		});
	}

	if (!hasDoor) return parts;

	const gap = DOOR_GAP_MM;
	const z = frontZMm(d);

	if (drawers > 0) {
		const drawerH = (carcassH - gap * (drawers + 1)) / drawers;
		// The box behind the front. Its outer width clears the carcass sides by
		// the runner gap, it stops short of the back panel, and it is lower than
		// its own front — which is how a real drawer is built and what makes an
		// open one read as something you could put a pan in.
		const boxW = w - t * 2 - DRAWER_RUNNER_MM * 2;
		const boxD = d - t - DRAWER_BACK_CLEARANCE_MM;
		const boxH = Math.max(t * 2, drawerH - DRAWER_SIDE_DROP_MM * 2);

		for (let i = 0; i < drawers; i++) {
			const frontY = plinth + gap + drawerH / 2 + i * (drawerH + gap);
			parts.push({
				role: "drawerFront",
				index: i,
				centreMm: { x: 0, y: frontY, z },
				sizeMm: { x: w - gap * 2, y: drawerH, z: FRONT_THICKNESS_MM },
			});

			// Measured from the front's own back face, so the box hangs off the
			// front rather than off the carcass — the two travel together.
			const backOfFront = z - FRONT_THICKNESS_MM / 2;
			const boxZ = backOfFront - boxD / 2;
			const boxY = frontY - drawerH / 2 + DRAWER_SIDE_DROP_MM + boxH / 2;

			for (const sign of [-1, 1]) {
				parts.push({
					role: "drawerBox",
					index: i,
					centreMm: { x: sign * (boxW / 2 - t / 2), y: boxY, z: boxZ },
					sizeMm: { x: t, y: boxH, z: boxD },
				});
			}
			parts.push({
				role: "drawerBox",
				index: i,
				centreMm: { x: 0, y: boxY - boxH / 2 + t / 2, z: boxZ },
				sizeMm: { x: boxW - t * 2, y: t, z: boxD },
			});
			parts.push({
				role: "drawerBox",
				index: i,
				centreMm: { x: 0, y: boxY, z: boxZ - boxD / 2 + t / 2 },
				sizeMm: { x: boxW - t * 2, y: boxH, z: t },
			});
		}
		return parts;
	}

	const doorW = (w - gap * (doorLeaves + 1)) / doorLeaves;
	for (let i = 0; i < doorLeaves; i++) {
		parts.push({
			role: "doorLeaf",
			index: i,
			centreMm: {
				x: -w / 2 + gap + doorW / 2 + i * (doorW + gap),
				y: midY,
				z,
			},
			sizeMm: { x: doorW, y: carcassH - gap * 2, z: FRONT_THICKNESS_MM },
		});
	}

	return parts;
}
