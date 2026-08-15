import type { PlannerCatalogue } from "./catalogueSchema";

/**
 * The room planner's product catalogue.
 *
 * A **family** is what the customer picks — "base cabinet", "shoe cabinet" —
 * and a **size** is a priced option on it. Width therefore belongs to the
 * cabinet the customer placed, not to the product, which is what lets them
 * drop one in and then change its size.
 *
 * PROVENANCE, and it matters:
 * - **Kitchen dimensions are real.** 16mm board, 880mm base carcasses on 607mm
 *   depth, wall units 397mm deep hung at 1500mm, 2380mm tall units — all read
 *   out of Infinite Cabinet's own Mozaik export by `lib/skp`.
 * - **Living room, bedroom and foyer dimensions are invented.** Plausible, but
 *   ours. Get a `.skp` job for each from the client and `lib/skp` turns them
 *   into real numbers in minutes.
 * - **Every price here is invented.** A job file contains geometry, not money.
 *   Phase 0 has not closed; these come from their price list, in a
 *   catalogue-only commit.
 */

/** Decides which row a cabinet stands in, and how it is drawn. */
export type ModuleKind = "base" | "wall" | "tall";

export type RoomTypeId = "kitchen" | "living" | "bedroom" | "foyer";

export type SizeOption = {
	widthMm: number;
	/** PLACEHOLDER — RM for this carcass at this width. */
	priceRm: number;
};

export type Family = {
	id: string;
	label: string;
	kind: ModuleKind;
	depthMm: number;
	heightMm: number;
	/** Underside above the floor. Wall units hang; everything else stands. */
	floorHeightMm: number;
	/** The size ladder, each rung priced on its own. */
	sizes: SizeOption[];
	/** Does a worktop run over it? Base runs and TV ledges yes, shoe racks no. */
	hasWorktop: boolean;
	/** Drawer fronts instead of doors, when this family is a drawer stack. */
	drawers: number;
	/** A one-line note for the palette card. */
	note?: string;
};

/** Straight from the extracted job. */
export const PANEL_THICKNESS_MM = 16;
export const PLINTH_HEIGHT_MM = 100;
export const WORKTOP_THICKNESS_MM = 40;
/** Underside of the wall cabinets — the sample job's own hanging height. */
export const WALL_CABINET_FLOOR_MM = 1500;
/** How far the hang slider lets the customer move that underside. */
export const WALL_HANG_LIMITS = { minMm: 1200, maxMm: 1800 } as const;
/** Scribe gap between the carcass backs and the wall, as a real fit has.
 * Shared by the scene (`PlannerScene.tsx`) and the measuring tool
 * (`measure.ts`) — both need to agree on exactly where a cabinet's back
 * face sits, so this lives here rather than duplicated in either. */
export const WALL_GAP_MM = 5;

/**
 * Front-to-back room depth is the room's, not the catalogue's — see the
 * design rule in CLAUDE.md. This is only the starting figure a fresh layout
 * opens with; `setRoomDepth` is what lets the customer measure their own.
 */
export const DEFAULT_ROOM_DEPTH_MM = 3600;
export const ROOM_DEPTH_LIMITS = { minMm: 2000, maxMm: 8000 } as const;

// ---------------------------------------------------------------- kitchen --
// Real dimensions, invented prices.

const BASE: Pick<Family, "kind" | "depthMm" | "heightMm" | "floorHeightMm"> = {
	kind: "base",
	depthMm: 607,
	heightMm: 880,
	floorHeightMm: 0,
};

const WALL: Pick<Family, "kind" | "depthMm" | "heightMm" | "floorHeightMm"> = {
	kind: "wall",
	depthMm: 397,
	heightMm: 880,
	floorHeightMm: WALL_CABINET_FLOOR_MM,
};

export const FAMILIES: Family[] = [
	{
		...BASE,
		id: "base-cabinet",
		label: "Base cabinet",
		hasWorktop: true,
		drawers: 0,
		note: "Standard 880mm carcass, 600mm deep",
		sizes: [
			{ widthMm: 300, priceRm: 320 },
			{ widthMm: 400, priceRm: 380 },
			{ widthMm: 600, priceRm: 520 },
			{ widthMm: 800, priceRm: 660 },
			{ widthMm: 900, priceRm: 720 },
		],
	},
	{
		...BASE,
		id: "base-drawers",
		label: "Drawer base",
		hasWorktop: true,
		drawers: 3,
		note: "Three drawers",
		sizes: [
			{ widthMm: 400, priceRm: 620 },
			{ widthMm: 600, priceRm: 820 },
			{ widthMm: 800, priceRm: 980 },
		],
	},
	{
		...WALL,
		id: "wall-cabinet",
		label: "Wall cabinet",
		hasWorktop: false,
		drawers: 0,
		note: "Hung at 1500mm, 397mm deep",
		sizes: [
			{ widthMm: 400, priceRm: 300 },
			{ widthMm: 600, priceRm: 420 },
			{ widthMm: 800, priceRm: 540 },
			{ widthMm: 900, priceRm: 600 },
		],
	},
	{
		id: "tall-cabinet",
		label: "Tall cabinet",
		kind: "tall",
		depthMm: 607,
		heightMm: 2380,
		floorHeightMm: 0,
		hasWorktop: false,
		drawers: 0,
		note: "Full height, 2380mm",
		sizes: [
			{ widthMm: 600, priceRm: 1450 },
			{ widthMm: 800, priceRm: 1780 },
		],
	},
	{
		id: "fridge-housing",
		label: "Fridge housing",
		kind: "tall",
		// PLACEHOLDER — not in the client's .skp job. Deeper than a base run so
		// the fridge door clears the worktop; carcass only, no front sold on it.
		depthMm: 650,
		heightMm: 2380,
		floorHeightMm: 0,
		hasWorktop: false,
		drawers: 0,
		note: "Houses the fridge — carcass only, dimensions not yet from a job file",
		sizes: [
			{ widthMm: 600, priceRm: 980 },
			{ widthMm: 900, priceRm: 1240 },
		],
	},

	// ------------------------------------------------------- other rooms --
	// PLACEHOLDER dimensions — no .skp job for these yet.
	{
		id: "tv-ledge",
		label: "TV ledge",
		kind: "base",
		depthMm: 400,
		heightMm: 400,
		floorHeightMm: 0,
		hasWorktop: true,
		drawers: 2,
		note: "Low media unit — dimensions not yet from a job file",
		sizes: [
			{ widthMm: 900, priceRm: 680 },
			{ widthMm: 1200, priceRm: 860 },
			{ widthMm: 1500, priceRm: 1040 },
			{ widthMm: 1800, priceRm: 1220 },
		],
	},
	{
		id: "tv-tall",
		label: "Display cabinet",
		kind: "tall",
		depthMm: 400,
		heightMm: 2100,
		floorHeightMm: 0,
		hasWorktop: false,
		drawers: 0,
		note: "Dimensions not yet from a job file",
		sizes: [
			{ widthMm: 600, priceRm: 1180 },
			{ widthMm: 800, priceRm: 1420 },
		],
	},
	{
		id: "wardrobe",
		label: "Wardrobe",
		kind: "tall",
		depthMm: 600,
		heightMm: 2400,
		floorHeightMm: 0,
		hasWorktop: false,
		drawers: 0,
		note: "Simple box — the detailed wardrobe tool lives at /viewer",
		sizes: [
			{ widthMm: 600, priceRm: 1350 },
			{ widthMm: 900, priceRm: 1850 },
			{ widthMm: 1200, priceRm: 2350 },
		],
	},
	{
		id: "shoe-cabinet",
		label: "Shoe cabinet",
		kind: "base",
		depthMm: 350,
		heightMm: 1000,
		floorHeightMm: 0,
		hasWorktop: true,
		drawers: 0,
		note: "Dimensions not yet from a job file",
		sizes: [
			{ widthMm: 600, priceRm: 520 },
			{ widthMm: 800, priceRm: 640 },
			{ widthMm: 900, priceRm: 700 },
		],
	},
	{
		id: "shoe-bench",
		label: "Shoe bench",
		kind: "base",
		depthMm: 350,
		heightMm: 450,
		floorHeightMm: 0,
		hasWorktop: true,
		drawers: 1,
		note: "Seat height, dimensions not yet from a job file",
		sizes: [
			{ widthMm: 600, priceRm: 380 },
			{ widthMm: 900, priceRm: 480 },
		],
	},
];

export const FAMILY_BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));

export function family(familyId: string): Family | undefined {
	return FAMILY_BY_ID.get(familyId);
}

/** The size ladder for a family, cheapest first. */
export function sizesOf(familyId: string): SizeOption[] {
	return family(familyId)?.sizes ?? [];
}

export function sizePriceRm(familyId: string, widthMm: number): number {
	return (
		sizesOf(familyId).find((size) => size.widthMm === widthMm)?.priceRm ?? 0
	);
}

/** The size a freshly placed cabinet takes: the middle of its ladder. */
export function defaultWidthMm(familyId: string): number {
	const sizes = sizesOf(familyId);
	return sizes[Math.floor(sizes.length / 2)]?.widthMm ?? 600;
}

// ------------------------------------------------------------------ doors --

export type DoorStyle = {
	id: string;
	label: string;
	/** How it is drawn: a flat slab, a framed shaker, or a glazed frame. */
	look: "slab" | "shaker" | "glass";
	/** PLACEHOLDER — RM per door, by the carcass width it covers. */
	priceRmBySizeMm: Record<number, number>;
	note?: string;
};

/** The width ladder doors are priced against — the union of the families'. */
const DOOR_WIDTHS = [300, 400, 600, 800, 900, 1200, 1500, 1800];

const doorPrices = (rmPer100Mm: number): Record<number, number> =>
	Object.fromEntries(
		DOOR_WIDTHS.map((mm) => [mm, Math.round((mm / 100) * rmPer100Mm)]),
	);

export const DOOR_STYLES: DoorStyle[] = [
	{
		id: "slab",
		label: "Slab",
		look: "slab",
		note: "Flat front",
		priceRmBySizeMm: doorPrices(22),
	},
	{
		id: "shaker",
		label: "Shaker",
		look: "shaker",
		note: "Framed front",
		priceRmBySizeMm: doorPrices(34),
	},
	{
		id: "glass",
		label: "Glass",
		look: "glass",
		note: "Glazed frame",
		priceRmBySizeMm: doorPrices(46),
	},
];

export const DOOR_BY_ID = new Map(DOOR_STYLES.map((d) => [d.id, d]));

export function doorStyle(doorStyleId: string): DoorStyle | undefined {
	return DOOR_BY_ID.get(doorStyleId);
}

/**
 * What a door costs on a carcass of this width. Widths between rungs are
 * charged at the next rung up — you cannot buy half a door.
 */
export function doorPriceRm(doorStyleId: string, widthMm: number): number {
	const style = doorStyle(doorStyleId);
	if (!style) return 0;
	const exact = style.priceRmBySizeMm[widthMm];
	if (exact !== undefined) return exact;

	const rung = DOOR_WIDTHS.find((mm) => mm >= widthMm) ?? DOOR_WIDTHS.at(-1);
	return rung === undefined ? 0 : (style.priceRmBySizeMm[rung] ?? 0);
}

/** How many door leaves a carcass of this width carries. */
export const doorLeavesFor = (widthMm: number) => (widthMm > 650 ? 2 : 1);

// ------------------------------------------------------------------ rooms --

export type RoomType = {
	id: RoomTypeId;
	label: string;
	/** Families offered, in palette order. */
	familyIds: string[];
	/** What the room opens on, so it is never a blank wall. */
	starter: Array<{ familyId: string; widthMm: number }>;
	defaultWallWidthMm: number;
};

export const ROOM_TYPES: RoomType[] = [
	{
		id: "kitchen",
		label: "Kitchen",
		familyIds: [
			"base-cabinet",
			"base-drawers",
			"wall-cabinet",
			"tall-cabinet",
			"fridge-housing",
		],
		defaultWallWidthMm: 4200,
		starter: [
			{ familyId: "base-cabinet", widthMm: 900 },
			{ familyId: "base-drawers", widthMm: 400 },
			{ familyId: "base-cabinet", widthMm: 900 },
			{ familyId: "tall-cabinet", widthMm: 600 },
			{ familyId: "wall-cabinet", widthMm: 900 },
			{ familyId: "wall-cabinet", widthMm: 400 },
			{ familyId: "wall-cabinet", widthMm: 900 },
		],
	},
	{
		id: "living",
		label: "Living room",
		familyIds: ["tv-ledge", "tv-tall", "wall-cabinet"],
		defaultWallWidthMm: 4800,
		starter: [
			{ familyId: "tv-ledge", widthMm: 1800 },
			{ familyId: "tv-ledge", widthMm: 1200 },
			{ familyId: "tv-tall", widthMm: 600 },
		],
	},
	{
		id: "bedroom",
		label: "Bedroom",
		familyIds: ["wardrobe"],
		defaultWallWidthMm: 3600,
		starter: [
			{ familyId: "wardrobe", widthMm: 1200 },
			{ familyId: "wardrobe", widthMm: 900 },
			{ familyId: "wardrobe", widthMm: 900 },
		],
	},
	{
		id: "foyer",
		label: "Foyer",
		familyIds: ["shoe-cabinet", "shoe-bench"],
		defaultWallWidthMm: 2400,
		starter: [
			{ familyId: "shoe-cabinet", widthMm: 900 },
			{ familyId: "shoe-cabinet", widthMm: 600 },
			{ familyId: "shoe-bench", widthMm: 600 },
		],
	},
];

export const ROOM_BY_ID = new Map(ROOM_TYPES.map((room) => [room.id, room]));

export function roomType(id: RoomTypeId): RoomType {
	const found = ROOM_BY_ID.get(id);
	if (!found) throw new Error(`unknown room type ${id}`);
	return found;
}

// --------------------------------------------------------------- finishes --

/**
 * Door finishes, with the colours read out of the client's own job file — the
 * names their sales team already says out loud. One colour applies to the
 * whole room, which is how they sell it.
 */
export const FINISHES = [
	{ id: "strata-noir", label: "Strata Noir", hex: "#393939" },
	{ id: "rhone-oak", label: "Rhone Oak", hex: "#d1af81" },
	{ id: "white", label: "White", hex: "#ffffff" },
	{ id: "dulux-tapestry-beige", label: "Tapestry Beige", hex: "#b7ab9e" },
	{ id: "color-soft-gray", label: "Soft Gray", hex: "#a1abb4" },
	{ id: "color-knoxville-green", label: "Knoxville Green", hex: "#606d6c" },
] as const;

export type FinishId = (typeof FINISHES)[number]["id"];

/** Deliberately a few shades off the room's wall (#edebe7): the 16mm carcass
 * reveal around a light door is the only thing separating it from the wall
 * behind, and any closer the two read as one surface. */
export const CARCASS_COLOR = "#d5cec2";
/** Inside a doorless carcass — darker, so an open box reads as open. */
export const CARCASS_INTERIOR_COLOR = "#b3aa9c";
export const WORKTOP_COLOR = "#4a4744";
export const HARDWARE_COLOR = "#9aa0a6";
export const GLASS_COLOR = "#dfe9ec";

// -------------------------------------------------------- bundled shape --

/**
 * The catalogue bundled into the shape `catalogueSchema.ts` describes, so
 * money-path functions (`pricing.ts`) can take it as a parameter instead of
 * importing the individual constants above. This is today's — and, until
 * the DB-backed catalogue lands, the only — catalogue.
 */
export const PLANNER_CATALOGUE: PlannerCatalogue = {
	families: FAMILIES,
	doorStyles: DOOR_STYLES.map((style) => ({
		...style,
		priceRmBySizeMm: Object.fromEntries(
			Object.entries(style.priceRmBySizeMm).map(([mm, rm]) => [String(mm), rm]),
		),
	})),
	doorWidthLadderMm: DOOR_WIDTHS,
	roomTypes: ROOM_TYPES,
	finishes: [...FINISHES],
};
