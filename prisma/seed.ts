import "dotenv/config";
import { prisma } from "@/lib/catalogue/db";
import { PLANNER_CATALOGUE } from "@/lib/planner/catalogue";
import { plannerCatalogueSchema } from "@/lib/planner/catalogueSchema";
import { WARDROBE_CATALOGUE } from "@/lib/wardrobe/catalogue";
import { wardrobeCatalogueSchema } from "@/lib/wardrobe/catalogueSchema";

/**
 * Seeds each product's catalogue as version 1, PUBLISHED, sourced from the
 * constants that still live in the repo — so a freshly seeded DB behaves
 * byte-identically to the pre-DB catalogue. This is also the
 * disaster-recovery seed: if the DB is ever lost, this reproduces exactly
 * what shipped in this commit.
 *
 * Idempotent: safe to re-run against a DB that already has these rows.
 */
async function main() {
	const seededBy = "seed";

	const wardrobeData = wardrobeCatalogueSchema.parse(WARDROBE_CATALOGUE);
	await prisma.catalogueVersion.upsert({
		where: { product_version: { product: "WARDROBE", version: 1 } },
		update: {},
		create: {
			product: "WARDROBE",
			version: 1,
			status: "PUBLISHED",
			data: wardrobeData,
			note: "Seeded from lib/wardrobe/catalogue.ts",
			createdBy: seededBy,
			publishedBy: seededBy,
			publishedAt: new Date(),
		},
	});

	const plannerData = plannerCatalogueSchema.parse(PLANNER_CATALOGUE);
	await prisma.catalogueVersion.upsert({
		where: { product_version: { product: "PLANNER", version: 1 } },
		update: {},
		create: {
			product: "PLANNER",
			version: 1,
			status: "PUBLISHED",
			data: plannerData,
			note: "Seeded from lib/planner/catalogue.ts",
			createdBy: seededBy,
			publishedBy: seededBy,
			publishedAt: new Date(),
		},
	});

	console.log("Seeded WARDROBE v1 and PLANNER v1 (PUBLISHED).");
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
