import { z } from "zod";

/**
 * The shape of the planner catalogue, split out from `catalogue.ts` so pure
 * functions can take a catalogue as a parameter instead of importing the
 * constants directly. `catalogue.ts` still owns the actual numbers — this
 * file only owns the shape, which is what a future DB-backed catalogue also
 * has to satisfy (see the DB-backed-catalogue plan).
 */

export const sizeOptionSchema = z.object({
	widthMm: z.number().positive(),
	priceRm: z.number().min(0),
});
export type SizeOption = z.infer<typeof sizeOptionSchema>;

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
	note: z.string().optional(),
});
export type Family = z.infer<typeof familySchema>;

export const doorStyleSchema = z.object({
	id: z.string(),
	label: z.string(),
	look: z.enum(["slab", "shaker", "glass"]),
	/** Keyed by width in mm, as a string — JSON object keys always are. */
	priceRmBySizeMm: z.record(z.string(), z.number().min(0)),
	note: z.string().optional(),
});
export type DoorStyle = z.infer<typeof doorStyleSchema>;

export const roomTypeSchema = z.object({
	id: z.enum(["kitchen", "living", "bedroom", "foyer"]),
	label: z.string(),
	familyIds: z.array(z.string()).min(1),
	starter: z.array(
		z.object({ familyId: z.string(), widthMm: z.number().positive() }),
	),
	defaultWallWidthMm: z.number().positive(),
});
export type RoomType = z.infer<typeof roomTypeSchema>;

export const finishSchema = z.object({
	id: z.string(),
	label: z.string(),
	hex: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type Finish = z.infer<typeof finishSchema>;

export const plannerCatalogueSchema = z.object({
	families: z.array(familySchema).min(1),
	doorStyles: z.array(doorStyleSchema).min(1),
	/** The width ladder doors are priced against — was a private constant,
	 * now catalogue data so a new door size is actually priceable. */
	doorWidthLadderMm: z.array(z.number().int().positive()).min(1),
	roomTypes: z.array(roomTypeSchema).min(1),
	finishes: z.array(finishSchema).min(1),
});
export type PlannerCatalogue = z.infer<typeof plannerCatalogueSchema>;
