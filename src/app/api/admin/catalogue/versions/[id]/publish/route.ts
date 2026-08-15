import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { catalogueSchemaByProduct } from "@/lib/catalogue/schemaByProduct";
import { CATALOGUE_CACHE_TAG } from "@/lib/catalogue/store";

export const runtime = "nodejs";

/**
 * Publishes a draft: supersedes whatever was PUBLISHED for this product,
 * flips this row live, revalidates the read-path cache. The partial unique
 * index (`CatalogueVersion_one_published_per_product`) backstops this at the
 * DB level — a second concurrent publish attempt fails there, not here.
 */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;

	const draft = await prisma.catalogueVersion.findUnique({ where: { id } });
	if (!draft) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	if (draft.status !== "DRAFT") {
		return NextResponse.json({ error: "not_a_draft" }, { status: 409 });
	}

	// Re-validate on the way out — the row was written by whatever code
	// existed when it was saved, and this is the last check before it feeds
	// live pricing.
	const parsed = catalogueSchemaByProduct[draft.product].safeParse(draft.data);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_catalogue", issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	const publishedBy = "admin"; // ponytail: see imports/route.ts

	try {
		await prisma.$transaction([
			prisma.catalogueVersion.updateMany({
				where: { product: draft.product, status: "PUBLISHED" },
				data: { status: "SUPERSEDED" },
			}),
			prisma.catalogueVersion.update({
				where: { id },
				data: { status: "PUBLISHED", publishedBy, publishedAt: new Date() },
			}),
		]);
	} catch {
		// The partial unique index rejecting a genuine race.
		return NextResponse.json({ error: "publish_conflict" }, { status: 409 });
	}

	// Next 16's revalidateTag wants a cache-life profile; { expire: 0 } is the
	// immediate-purge equivalent of the old single-arg call.
	revalidateTag(CATALOGUE_CACHE_TAG, { expire: 0 });

	return NextResponse.json({
		id,
		product: draft.product,
		version: draft.version,
	});
}
