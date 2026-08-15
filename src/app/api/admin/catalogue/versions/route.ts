import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import {
	catalogueSchemaByProduct,
	productSchema,
} from "@/lib/catalogue/schemaByProduct";

export const runtime = "nodejs";

export async function GET(request: Request) {
	const product = productSchema.safeParse(
		new URL(request.url).searchParams.get("product"),
	);
	if (!product.success) {
		return NextResponse.json({ error: "invalid product" }, { status: 400 });
	}

	const includeData =
		new URL(request.url).searchParams.get("include") === "data";

	const versions = await prisma.catalogueVersion.findMany({
		where: { product: product.data },
		orderBy: { version: "desc" },
		select: {
			id: true,
			product: true,
			version: true,
			status: true,
			note: true,
			createdBy: true,
			createdAt: true,
			publishedAt: true,
			data: includeData,
			import: { select: { filename: true } },
		},
	});
	return NextResponse.json({ versions });
}

/** Create a DRAFT row from reviewed data. Never live — publish is separate. */
export async function POST(request: Request) {
	const body = (await request.json()) as {
		product?: string;
		data?: unknown;
		note?: string;
		importId?: string;
	};

	const product = productSchema.safeParse(body.product);
	if (!product.success) {
		return NextResponse.json({ error: "invalid product" }, { status: 400 });
	}

	const parsed = catalogueSchemaByProduct[product.data].safeParse(body.data);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_catalogue", issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	const createdBy = "admin"; // ponytail: see imports/route.ts

	// Version numbers are assigned at creation, not at publish — a draft that
	// never gets published just leaves a gap, which is fine; what matters is
	// they're monotonic and unique per product, which @@unique([product,
	// version]) backstops. ponytail: read-then-write, not a transaction — a
	// genuine race needs two people creating a draft for the same product in
	// the same instant, and the unique constraint turns that into a clean
	// 500 instead of silent corruption. Wrap in $transaction if this tool
	// ever gets more than a couple of concurrent admins.
	const { _max } = await prisma.catalogueVersion.aggregate({
		where: { product: product.data },
		_max: { version: true },
	});

	const draft = await prisma.catalogueVersion.create({
		data: {
			product: product.data,
			version: (_max.version ?? 0) + 1,
			status: "DRAFT",
			data: parsed.data,
			note: body.note,
			importId: body.importId,
			createdBy,
		},
	});

	return NextResponse.json({ id: draft.id, status: draft.status });
}
