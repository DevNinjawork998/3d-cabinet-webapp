import { z } from "zod";
import { plannerCatalogueSchema } from "@/lib/planner/catalogueSchema";

/**
 * The planner is the only product with an engine behind it. The `Product`
 * column stays because `CatalogueVersion` is keyed and indexed on it, but
 * there is exactly one valid value — a second one only earns its place when
 * a second engine does.
 */
export const productSchema = z.enum(["PLANNER"]);
export type Product = z.infer<typeof productSchema>;

export const catalogueSchemaByProduct = {
	PLANNER: plannerCatalogueSchema,
} as const;
