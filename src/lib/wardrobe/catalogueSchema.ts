import { z } from "zod";

/**
 * The shape of the wardrobe catalogue, split out from `catalogue.ts` so pure
 * functions can take a catalogue as a parameter instead of importing the
 * constants directly. `catalogue.ts` still owns the actual numbers — this
 * file only owns the shape, which is what a future DB-backed catalogue also
 * has to satisfy (see the DB-backed-catalogue plan).
 */

export const openingConstraintsSchema = z.object({
	minTotalWidthMm: z.number().positive(),
	maxTotalWidthMm: z.number().positive(),
	minHeightMm: z.number().positive(),
	maxHeightMm: z.number().positive(),
	/** Gap left between the top of the unit and the ceiling. */
	ceilingClearanceMm: z.number().min(0),
	minBayWidthMm: z.number().positive(),
	maxBayWidthMm: z.number().positive(),
});
export type OpeningConstraints = z.infer<typeof openingConstraintsSchema>;

const finishEntrySchema = z.object({
	label: z.string(),
	group: z.enum(["Laminate", "Veneer"]),
	swatch: z.string().regex(/^#[0-9a-f]{6}$/i),
	surchargeRmPerFt: z.number().min(0),
});

const doorTypeEntrySchema = z.object({
	label: z.string(),
	surchargeRmPerFt: z.number().min(0),
});

const accessoryEntrySchema = z.object({
	label: z.string(),
	rateRm: z.number().min(0),
});

export const wardrobeCatalogueSchema = z.object({
	bayWidthsMm: z.array(z.number().int().positive()).min(1),
	openingConstraints: openingConstraintsSchema,
	finishes: z.record(z.string(), finishEntrySchema),
	doorTypes: z.record(z.string(), doorTypeEntrySchema),
	accessories: z.record(z.string(), accessoryEntrySchema),
	rates: z.object({
		baseRmPerFt: z.number().positive(),
		mmPerFt: z.number().positive(),
	}),
});
export type WardrobeCatalogue = z.infer<typeof wardrobeCatalogueSchema>;
