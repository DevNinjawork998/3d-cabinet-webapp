import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { catalogueSchemaByProduct } from "@/lib/catalogue/schemaByProduct";

export const runtime = "nodejs";

/** Edit a draft's reviewed data before publishing. Frozen once published. */
export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const body = (await request.json()) as { data?: unknown; note?: string };

	const existing = await prisma.catalogueVersion.findUnique({ where: { id } });
	if (!existing) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	if (existing.status !== "DRAFT") {
		return NextResponse.json({ error: "not_a_draft" }, { status: 409 });
	}

	let data: object | undefined;
	if (body.data !== undefined) {
		const parsed = catalogueSchemaByProduct[existing.product].safeParse(
			body.data,
		);
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "invalid_catalogue", issues: parsed.error.issues },
				{ status: 400 },
			);
		}
		data = parsed.data;
	}

	const updated = await prisma.catalogueVersion.update({
		where: { id },
		data: { data, note: body.note ?? existing.note },
	});

	return NextResponse.json({ id: updated.id, status: updated.status });
}
