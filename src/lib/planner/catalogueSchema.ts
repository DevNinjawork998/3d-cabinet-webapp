import { z } from "zod";

/**
 * The shape of the planner catalogue, split out from `catalogue.ts` so pure
 * functions can take a catalogue as a parameter instead of importing the
 * constants directly. `catalogue.ts` still owns the actual numbers — this
 * file only owns the shape, which is what a future DB-backed catalogue also
 * has to satisfy (see the DB-backed-catalogue plan).
 */

const sizeOptionSchema = z.object({
	widthMm: z.number().positive(),
	priceRm: z.number().min(0),
	/**
	 * The design this rung is drawn from, if one has been published for it.
	 *
	 * The planner fetches `/api/cabinet-mesh/<id>` and draws the model the
	 * drafter actually made. It hangs off the *rung* rather than the family
	 * because Infinite Cabinet draws one export per width — BC 800, BC 900,
	 * BC 1000 — so a ladder is a set of files, one each.
	 *
	 * Optional, and the planner falls back to procedural geometry without it:
	 * catalogues published before design intake carry none, and a design whose
	 * file will not parse must still be sellable.
	 */
	meshDesignId: z.string().optional(),
});
export type SizeOption = z.infer<typeof sizeOptionSchema>;

/**
 * What a cabinet is made of, as read off the design file it was imported from.
 * This is what lets two families of the same box look different in the scene:
 * a six-shelf tall unit draws six shelves.
 *
 * Optional, for the same reason `construction` is: catalogues published before
 * design intake existed have to keep validating. `Cabinet.tsx` falls back to
 * its own defaults when it is absent.
 */
const cabinetGeometrySchema = z.object({
	shelves: z.number().int().min(0),
	fixedShelves: z.number().int().min(0),
	doorLeaves: z.number().int().min(0),
	drawers: z.number().int().min(0),
	hasBack: z.boolean(),
	/** Adjustable feet, from the design. Zero draws the plinth the scene has
	 * always drawn. Defaulted rather than required so every catalogue published
	 * before designs could describe their feet still validates — the same
	 * reason `geometry` itself is optional. */
	legs: z.number().int().min(0).default(0),
	legHeightMm: z.number().min(0).default(0),
	/** How wide a foot is, and how far in from the carcass edge it stands.
	 *
	 * Zero means "not recorded", and `parts.ts` falls back to its own constant.
	 * Deliberately not defaulted to those constants here: a real 50mm foot and
	 * an unrecorded one would then be indistinguishable, and `mergeIntoCatalogue`
	 * decides whether to learn a field by whether it has ever been set. */
	legDiameterMm: z.number().min(0).default(0),
	legInsetMm: z.number().min(0).default(0),
});
export type CabinetGeometry = z.infer<typeof cabinetGeometrySchema>;

export const familySchema = z.object({
	id: z.string(),
	label: z.string(),
	kind: z.enum(["base", "wall", "tall"]),
	depthMm: z.number().positive(),
	heightMm: z.number().positive(),
	floorHeightMm: z.number().min(0),
	sizes: z.array(sizeOptionSchema).min(1),
	hasWorktop: z.boolean(),
	drawers: z.number().int().min(0),
	geometry: cabinetGeometrySchema.optional(),
	note: z.string().optional(),
});
export type Family = z.infer<typeof familySchema>;

const doorStyleSchema = z.object({
	id: z.string(),
	label: z.string(),
	look: z.enum(["slab", "shaker", "glass"]),
	/** Keyed by width in mm, as a string — JSON object keys always are. */
	priceRmBySizeMm: z.record(z.string(), z.number().min(0)),
	note: z.string().optional(),
});
export type DoorStyle = z.infer<typeof doorStyleSchema>;

const roomTypeSchema = z.object({
	id: z.enum(["kitchen", "living", "bedroom", "foyer"]),
	label: z.string(),
	familyIds: z.array(z.string()).min(1),
	starter: z.array(
		z.object({ familyId: z.string(), widthMm: z.number().positive() }),
	),
	defaultWallWidthMm: z.number().positive(),
});
export type RoomType = z.infer<typeof roomTypeSchema>;

const finishSchema = z.object({
	id: z.string(),
	label: z.string(),
	hex: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type Finish = z.infer<typeof finishSchema>;

/** Workshop build standards — board thickness, toe-kick and slab depth are
 * per-maker choices, not universals, so they belong in the catalogue rather
 * than in code. Optional so catalogues published before this existed keep
 * validating; `catalogue.ts`'s `CONSTRUCTION` holds the fallbacks. */
const constructionSchema = z.object({
	panelThicknessMm: z.number().positive(),
	plinthHeightMm: z.number().min(0),
	worktopThicknessMm: z.number().positive(),
	/** Above this carcass width a front is split into two leaves. */
	doorLeavesThresholdMm: z.number().positive(),
});
export type Construction = z.infer<typeof constructionSchema>;

const ratesSchema = z.object({
	worktopRmPerFt: z.number().min(0),
});
export type Rates = z.infer<typeof ratesSchema>;

export const plannerCatalogueSchema = z.object({
	families: z.array(familySchema).min(1),
	doorStyles: z.array(doorStyleSchema).min(1),
	/** The width ladder doors are priced against — was a private constant,
	 * now catalogue data so a new door size is actually priceable. */
	doorWidthLadderMm: z.array(z.number().int().positive()).min(1),
	roomTypes: z.array(roomTypeSchema).min(1),
	finishes: z.array(finishSchema).min(1),
	construction: constructionSchema.optional(),
	rates: ratesSchema.optional(),
});
export type PlannerCatalogue = z.infer<typeof plannerCatalogueSchema>;
