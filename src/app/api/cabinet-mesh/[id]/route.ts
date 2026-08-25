import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { fetchRenderMeshFile } from "@/lib/catalogue/meshBlob";

export const runtime = "nodejs";

/**
 * Serves one cabinet's render mesh to the planner.
 *
 * Public on purpose — it sits outside `/api/admin`, so `proxy.ts`'s gate does
 * not apply, and it has to be: this is the geometry a customer's browser draws.
 * The same narrow-hole shape as `/api/site-images/[key]`, and for the same
 * reason: the Blob store is private-access, so the bytes cannot be linked to
 * directly.
 *
 * What stays private is the *source* export. That file carries the client's
 * part naming, layer structure and module standard, and never leaves
 * `/api/admin`. What leaves here is the derived mesh — triangles, classified by
 * role, with the drafter's materials and every name stripped out.
 *
 * Only designs that have been pushed into the planner resolve, so this cannot
 * be used to preview a library row a customer was never meant to see.
 */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;

	const design = await prisma.cabinetDesign.findUnique({
		where: { id },
		select: { meshPathname: true, familyId: true, status: true },
	});
	if (
		!design?.meshPathname ||
		!design.familyId ||
		design.status !== "PUBLISHED"
	) {
		return NextResponse.json({ error: "not found" }, { status: 404 });
	}

	const bytes = await fetchRenderMeshFile(design.meshPathname);

	return new Response(new Uint8Array(bytes), {
		headers: {
			"Content-Type": "application/octet-stream",
			// The pathname carries the source file's sha256, so a given design's
			// bytes never change under the same URL — a re-upload writes a new
			// pathname. Safe to cache for a year.
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
