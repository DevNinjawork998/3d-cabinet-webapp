import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/catalogue/db";
import {
	deleteMeshFile,
	fetchMeshFile,
	sha256Hex,
} from "@/lib/catalogue/meshBlob";

export const runtime = "nodejs";

const patchSchema = z.object({
	blobUrl: z.string().min(1).optional(),
	blobPathname: z.string().min(1).optional(),
	filename: z.string().min(1).optional(),
	name: z.string().min(1).optional(),
	category: z
		.enum([
			"BASE_CABINET",
			"WALL_CABINET",
			"TALL_CABINET",
			"DRAWER_BASE",
			"FRIDGE_HOUSING",
		])
		.optional(),
	room: z.enum(["KITCHEN", "LIVING_ROOM", "BEDROOM", "FOYER"]).optional(),
	widthMm: z.number().int().positive().optional(),
	heightMm: z.number().int().positive().optional(),
	depthMm: z.number().int().positive().optional(),
	priceRm: z.number().min(0).optional(),
	sku: z.string().min(1).optional(),
	description: z.string().optional(),
	tags: z.string().optional(),
	finishes: z.array(z.string()).optional(),
	status: z.enum(["PUBLISHED", "ARCHIVED"]).optional(),
});

/** No immutability/versioning here — unlike CatalogueVersion, edits are
 * always allowed regardless of current status. This is also how the
 * Archive/Publish toggle works: PATCH with just { status }. */
export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const existing = await prisma.cabinetDesign.findUnique({ where: { id } });
	if (!existing) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	const body = await request.json();
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}
	const { blobPathname, sku, ...rest } = parsed.data;

	if (sku && sku !== existing.sku) {
		const skuTaken = await prisma.cabinetDesign.findFirst({
			where: { sku, id: { not: id } },
		});
		if (skuTaken) {
			return NextResponse.json({ error: "sku_taken" }, { status: 409 });
		}
	}

	let sha256: string | undefined;
	let sizeBytes: number | undefined;
	if (blobPathname && blobPathname !== existing.blobPathname) {
		const bytes = await fetchMeshFile(blobPathname);
		sha256 = sha256Hex(bytes);
		sizeBytes = bytes.byteLength;

		const dupe = await prisma.cabinetDesign.findFirst({
			where: { sha256, id: { not: id } },
		});
		if (dupe) {
			await deleteMeshFile(blobPathname);
			return NextResponse.json(
				{ error: "duplicate", designId: dupe.id },
				{ status: 409 },
			);
		}
		// Replacing the file — the old blob is no longer referenced by any row.
		await deleteMeshFile(existing.blobPathname);
	}

	const updated = await prisma.cabinetDesign.update({
		where: { id },
		data: {
			...rest,
			...(sku ? { sku } : {}),
			...(blobPathname ? { blobPathname, sha256, sizeBytes } : {}),
		},
	});

	return NextResponse.json({ design: updated });
}
