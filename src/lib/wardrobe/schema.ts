import { z } from "zod";

export const FINISH_IDS = [
	"laminate-standard",
	"laminate-premium",
	"veneer",
] as const;
export const finishIdSchema = z.enum(FINISH_IDS);
export type FinishId = z.infer<typeof finishIdSchema>;

export const DOOR_TYPE_IDS = ["hinged", "sliding"] as const;
export const doorTypeIdSchema = z.enum(DOOR_TYPE_IDS);
export type DoorTypeId = z.infer<typeof doorTypeIdSchema>;

export const HANDLE_IDS = ["none", "profile", "knob"] as const;
export const handleIdSchema = z.enum(HANDLE_IDS);
export type HandleId = z.infer<typeof handleIdSchema>;

export const ACCESSORY_IDS = [
	"soft-close-hinge",
	"drawer-unit",
	"led-strip",
	"mirror-door",
] as const;
export const accessoryIdSchema = z.enum(ACCESSORY_IDS);
export type AccessoryId = z.infer<typeof accessoryIdSchema>;

const openingSchema = z.object({
	width: z.number().positive(),
	height: z.number().positive(),
	depth: z.number().positive(),
	ceilingHeight: z.number().positive(),
});
export type Opening = z.infer<typeof openingSchema>;

const baySchema = z.object({
	id: z.string(),
	width: z.number().positive(),
	order: z.number().int().nonnegative(),
});
export type Bay = z.infer<typeof baySchema>;

const shelfItemSchema = z.object({
	kind: z.literal("shelf"),
	heightFromFloor: z.number().nonnegative(),
});

const railItemSchema = z.object({
	kind: z.literal("rail"),
	heightFromFloor: z.number().nonnegative(),
});

const drawerItemSchema = z.object({
	kind: z.literal("drawer"),
	heightFromFloor: z.number().nonnegative(),
	count: z.number().int().positive(),
});

const interiorItemSchema = z.discriminatedUnion("kind", [
	shelfItemSchema,
	railItemSchema,
	drawerItemSchema,
]);
export type InteriorItem = z.infer<typeof interiorItemSchema>;

const bayInteriorSchema = z.object({
	bayId: z.string(),
	items: z.array(interiorItemSchema),
	accessories: z.array(accessoryIdSchema),
});
export type BayInterior = z.infer<typeof bayInteriorSchema>;

const doorSchema = z.object({
	bayId: z.string(),
	type: doorTypeIdSchema,
	finish: finishIdSchema,
	handle: handleIdSchema,
});
export type Door = z.infer<typeof doorSchema>;

export const designDocumentSchema = z.object({
	schemaVersion: z.literal(1),
	opening: openingSchema,
	bays: z.array(baySchema),
	interiors: z.array(bayInteriorSchema),
	doors: z.array(doorSchema),
});
export type DesignDocument = z.infer<typeof designDocumentSchema>;
