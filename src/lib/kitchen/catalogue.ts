/**
 * Kitchen module standard.
 *
 * These are Infinite Cabinet's own numbers, read out of their Mozaik export
 * (`src/lib/skp/__fixtures__/flat-pack.skp`) by `lib/skp` — 16mm board, 880mm
 * base carcasses on 607mm depth, wall units hung at 1500mm, a 2380mm tall
 * unit. The extra widths per type are the standard sizes around the ones the
 * sample job happened to use, so the demo has a range to drag from.
 *
 * PLACEHOLDER, like `lib/wardrobe/catalogue.ts`: dimensions are real, prices
 * are not here at all. Rates arrive from the client's price list.
 */

export type ModuleKind = "base" | "wall" | "tall";

export type ModuleType = {
	id: string;
	label: string;
	kind: ModuleKind;
	widthMm: number;
	depthMm: number;
	heightMm: number;
	/** Underside above the floor. Base units sit on a plinth, wall units hang. */
	floorHeightMm: number;
	doors: number;
	drawers: number;
};

/** Straight from the extracted job. */
export const PANEL_THICKNESS_MM = 16;
export const PLINTH_HEIGHT_MM = 100;
export const WORKTOP_THICKNESS_MM = 40;
/** Underside of the wall cabinets — the sample job's own hanging height. */
export const WALL_CABINET_FLOOR_MM = 1500;

const BASE_DEPTH_MM = 607;
const BASE_HEIGHT_MM = 880;
const WALL_DEPTH_MM = 397;
const WALL_HEIGHT_MM = 880;
const TALL_DEPTH_MM = 607;
const TALL_HEIGHT_MM = 2380;

// Ids are catalogue keys, written out rather than derived: a computed id is
// one conditional away from silently not matching what places it.

const base = (
	id: string,
	label: string,
	widthMm: number,
	doors: number,
	drawers: number,
): ModuleType => ({
	id,
	label,
	kind: "base",
	widthMm,
	depthMm: BASE_DEPTH_MM,
	heightMm: BASE_HEIGHT_MM,
	floorHeightMm: 0,
	doors,
	drawers,
});

const wall = (id: string, widthMm: number, doors: number): ModuleType => ({
	id,
	label: `Wall ${widthMm}`,
	kind: "wall",
	widthMm,
	depthMm: WALL_DEPTH_MM,
	heightMm: WALL_HEIGHT_MM,
	floorHeightMm: WALL_CABINET_FLOOR_MM,
	doors,
	drawers: 0,
});

const tall = (id: string, widthMm: number, doors: number): ModuleType => ({
	id,
	label: `Tall ${widthMm}`,
	kind: "tall",
	widthMm,
	depthMm: TALL_DEPTH_MM,
	heightMm: TALL_HEIGHT_MM,
	floorHeightMm: 0,
	doors,
	drawers: 0,
});

export const MODULE_TYPES: ModuleType[] = [
	// The sample job's own 3-drawer base.
	base("base-400-drawers", "Base 400 · 3 drawers", 400, 0, 3),
	base("base-400", "Base 400", 400, 1, 0),
	base("base-600", "Base 600", 600, 1, 0),
	base("base-800", "Base 800", 800, 2, 0),
	// The sample job's own base cabinet.
	base("base-900", "Base 900", 900, 2, 0),
	wall("wall-400", 400, 1),
	wall("wall-600", 600, 1),
	wall("wall-800", 800, 2),
	// The sample job's own wall cabinet.
	wall("wall-900", 900, 2),
	// The sample job's own tall unit.
	tall("tall-600", 600, 2),
	tall("tall-800", 800, 2),
];

export const MODULE_BY_ID = new Map(
	MODULE_TYPES.map((type) => [type.id, type]),
);

/**
 * Door finishes, with the colours read out of the client's own job file — these
 * are the names their sales team already says out loud. No rates: Phase 0.
 */
export const KITCHEN_FINISHES = [
	{ id: "strata-noir", label: "Strata Noir", hex: "#393939" },
	{ id: "rhone-oak", label: "Rhone Oak", hex: "#d1af81" },
	{ id: "white", label: "White", hex: "#ffffff" },
	{ id: "dulux-tapestry-beige", label: "Tapestry Beige", hex: "#b7ab9e" },
	{ id: "color-soft-gray", label: "Soft Gray", hex: "#a1abb4" },
	{ id: "color-knoxville-green", label: "Knoxville Green", hex: "#606d6c" },
] as const;

export type KitchenFinishId = (typeof KITCHEN_FINISHES)[number]["id"];

export const CARCASS_COLOR = "#e8e3da";
export const WORKTOP_COLOR = "#4a4744";
export const HARDWARE_COLOR = "#9aa0a6";

export function moduleType(typeId: string): ModuleType | undefined {
	return MODULE_BY_ID.get(typeId);
}
