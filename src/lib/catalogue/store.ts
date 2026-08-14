import "server-only";
import { unstable_cache } from "next/cache";
import { plannerCatalogueSchema } from "@/lib/planner/catalogueSchema";
import { wardrobeCatalogueSchema } from "@/lib/wardrobe/catalogueSchema";
import { prisma } from "./db";

/**
 * The published-catalogue read path — the only place server code should
 * reach for catalogue data going forward. Pure engine functions
 * (`lib/wardrobe`, `lib/planner`) never import this; they take a catalogue
 * as a parameter, and this is what supplies it at the request boundary.
 *
 * Cached and tag-revalidated so a published catalogue is read from Postgres
 * roughly once per revalidation window, not once per request — the DB-op
 * cost CLAUDE.md's original "catalogue in the repo" rule was protecting
 * against stays protected even though the catalogue moved.
 */

export const CATALOGUE_CACHE_TAG = "catalogue";

async function fetchPublishedWardrobeCatalogue() {
	const row = await prisma.catalogueVersion.findFirstOrThrow({
		where: { product: "WARDROBE", status: "PUBLISHED" },
		orderBy: { version: "desc" },
		select: { id: true, version: true, data: true },
	});
	return {
		id: row.id,
		version: row.version,
		data: wardrobeCatalogueSchema.parse(row.data),
	};
}

async function fetchPublishedPlannerCatalogue() {
	const row = await prisma.catalogueVersion.findFirstOrThrow({
		where: { product: "PLANNER", status: "PUBLISHED" },
		orderBy: { version: "desc" },
		select: { id: true, version: true, data: true },
	});
	return {
		id: row.id,
		version: row.version,
		data: plannerCatalogueSchema.parse(row.data),
	};
}

export const getPublishedWardrobeCatalogue = unstable_cache(
	fetchPublishedWardrobeCatalogue,
	["catalogue-wardrobe"],
	{ tags: [CATALOGUE_CACHE_TAG] },
);

export const getPublishedPlannerCatalogue = unstable_cache(
	fetchPublishedPlannerCatalogue,
	["catalogue-planner"],
	{ tags: [CATALOGUE_CACHE_TAG] },
);
