import { z } from "zod";
import { plannerCatalogueSchema } from "@/lib/planner/catalogueSchema";
import { wardrobeCatalogueSchema } from "@/lib/wardrobe/catalogueSchema";

export const productSchema = z.enum(["WARDROBE", "PLANNER"]);
export type Product = z.infer<typeof productSchema>;

export const catalogueSchemaByProduct = {
	WARDROBE: wardrobeCatalogueSchema,
	PLANNER: plannerCatalogueSchema,
} as const;
