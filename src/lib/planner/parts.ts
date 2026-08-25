import { CONSTRUCTION, doorLeavesFor, type Family } from "./catalogue";

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

/** How thick an adjustable foot is. The client's Häfele Axilo 48 measures 57mm
 * across; the design records how *tall* its feet are but not their diameter,
 * which nobody looks at closely enough to be worth another field. */
export const LEG_DIAMETER_MM = 50;

/** How far a foot sits in from the carcass edge, so it reads as tucked under
 * the cabinet rather than propping up its corners. */
const LEG_INSET_MM = 60;
/** A door or drawer front is thicker board than the carcass. */
export const FRONT_THICKNESS_MM = 18;

/** Interior faces render darker so an open carcass reads as a box you can see
 * into. Derived from the role rather than stored, so there is one fewer field
 * to keep true. */
export const isInteriorPart = (role: PartRole) =>
	role === "back" || role === "shelf";

/**
 * How far off the floor the carcass sits, and on what.
 *
 * A design that recorded feet stands on them; everything else keeps the
 * recessed plinth the scene has always drawn. Wall units sit on neither.
 */
export function standOf(family: Family) {
	if (family.kind === "wall") {
		return { heightMm: 0, legs: 0 };
	}
	const legs = family.geometry?.legs ?? 0;
	const legHeightMm = family.geometry?.legHeightMm ?? 0;
	return legs > 0 && legHeightMm > 0
		? { heightMm: legHeightMm, legs }
		: { heightMm: CONSTRUCTION.plinthHeightMm, legs: 0 };
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
export function fitOutOf(family: Family, widthMm: number) {
	return {
		shelves: family.geometry
			? family.geometry.shelves + family.geometry.fixedShelves
			: 1,
		drawers: family.geometry?.drawers ?? family.drawers,
		doorLeaves: family.geometry?.doorLeaves || doorLeavesFor(widthMm),
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
): PartBoxMm[] {
	const t = CONSTRUCTION.panelThicknessMm;
	// What the carcass stands on, and how tall it is. A design with feet floats
	// the box on them; otherwise it is the plinth, as before.
	const stand = standOf(family);
	const plinth = stand.heightMm;
	const w = widthMm;
	const d = family.depthMm;
	const carcassH = family.heightMm - plinth;
	const midY = plinth + carcassH / 2;

	const { shelves, drawers, doorLeaves, hasBack } = fitOutOf(family, widthMm);

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
		const pairs = Math.max(2, Math.ceil(stand.legs / 2));
		const usable = w - LEG_INSET_MM * 2;
		for (let i = 0; i < pairs; i++) {
			const x = pairs === 1 ? 0 : -usable / 2 + (usable * i) / (pairs - 1);
			for (const [j, z] of [
				d / 2 - LEG_INSET_MM,
				-d / 2 + LEG_INSET_MM,
			].entries()) {
				parts.push({
					role: "leg",
					index: i * 2 + j,
					centreMm: { x, y: stand.heightMm / 2, z },
					sizeMm: {
						x: LEG_DIAMETER_MM,
						y: stand.heightMm,
						z: LEG_DIAMETER_MM,
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
		for (let i = 0; i < drawers; i++) {
			parts.push({
				role: "drawerFront",
				index: i,
				centreMm: {
					x: 0,
					y: plinth + gap + drawerH / 2 + i * (drawerH + gap),
					z,
				},
				sizeMm: { x: w - gap * 2, y: drawerH, z: FRONT_THICKNESS_MM },
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
