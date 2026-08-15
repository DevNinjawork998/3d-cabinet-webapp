import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/catalogue/db";
import {
	deleteSkpFile,
	fetchSkpFile,
	sha256Hex,
} from "@/lib/catalogue/skpBlob";

export const runtime = "nodejs";

const createSchema = z.object({
	blobUrl: z.string().min(1),
	blobPathname: z.string().min(1),
	filename: z.string().min(1),
	name: z.string().min(1),
	category: z.enum([
		"BASE_CABINET",
		"WALL_CABINET",
		"TALL_CABINET",
		"DRAWER_BASE",
		"FRIDGE_HOUSING",
	]),
	room: z.enum(["KITCHEN", "LIVING_ROOM", "BEDROOM", "FOYER"]),
	widthMm: z.number().int().positive(),
	heightMm: z.number().int().positive(),
	depthMm: z.number().int().positive(),
	priceRm: z.number().min(0),
	sku: z.string().min(1),
	description: z.string().optional(),
	tags: z.string().optional(),
	finishes: z.array(z.string()).default([]),
	status: z.enum(["PUBLISHED", "ARCHIVED"]).default("PUBLISHED"),
});

export async function GET() {
	const designs = await prisma.cabinetDesign.findMany({
		orderBy: { updatedAt: "desc" },
	});
	return NextResponse.json({ designs });
}

/** Uploads store metadata only — no server-side .skp parsing here, unlike
 * catalogue/imports. This is a flat reference catalog, not the versioned
 * pricing catalogue. */
export async function POST(request: Request) {
	const body = await request.json();
	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}
	const { blobPathname, ...data } = parsed.data;

	const bytes = await fetchSkpFile(blobPathname);
	const sha256 = sha256Hex(bytes);

	const existing = await prisma.cabinetDesign.findUnique({ where: { sha256 } });
	if (existing) {
		await deleteSkpFile(blobPathname);
		return NextResponse.json(
			{ error: "duplicate", designId: existing.id },
			{ status: 409 },
		);
	}

	const skuTaken = await prisma.cabinetDesign.findUnique({
		where: { sku: data.sku },
	});
	if (skuTaken) {
		await deleteSkpFile(blobPathname);
		return NextResponse.json({ error: "sku_taken" }, { status: 409 });
	}

	const uploadedBy = "admin"; // ponytail: shared-secret auth, no per-user identity yet

	const created = await prisma.cabinetDesign.create({
		data: {
			...data,
			blobPathname,
			sizeBytes: bytes.byteLength,
			sha256,
			uploadedBy,
		},
	});

	return NextResponse.json({ design: created });
}
