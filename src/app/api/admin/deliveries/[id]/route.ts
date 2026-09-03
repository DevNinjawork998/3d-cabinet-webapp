import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { totalVolumeM3, totalWeightKg } from "@/lib/logistics/measure";
import { deliveryInputSchema } from "@/lib/logistics/types";

export const runtime = "nodejs";

/** One delivery plus its timeline — what the detail panel renders. */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const delivery = await prisma.delivery.findUnique({
		where: { id },
		include: { events: { orderBy: { at: "desc" } } },
	});
	if (!delivery) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	return NextResponse.json({ delivery });
}

/**
 * Edits are allowed only before the job is booked. Once a carrier holds the
 * details, changing the address here would leave the page disagreeing with the
 * lorry — that correction goes through the carrier, or through a cancel and a
 * fresh booking.
 */
export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const existing = await prisma.delivery.findUnique({ where: { id } });
	if (!existing) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	if (existing.status !== "DRAFT" && existing.status !== "QUOTED") {
		return NextResponse.json({ error: "already_booked" }, { status: 409 });
	}

	const parsed = deliveryInputSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	const { items, scheduledAt, ...rest } = parsed.data;

	const delivery = await prisma.delivery.update({
		where: { id },
		data: {
			...rest,
			items,
			scheduledAt: scheduledAt === null ? null : new Date(scheduledAt),
			totalVolumeM3: totalVolumeM3(items),
			totalWeightKg: totalWeightKg(items),
			events: { create: { source: "ADMIN", message: "Delivery edited" } },
		},
	});

	return NextResponse.json({ delivery });
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const existing = await prisma.delivery.findUnique({ where: { id } });
	if (!existing) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	// A booked job is a lorry someone is paying for. Cancel it with the carrier
	// first; deleting the row here would only lose the record of it.
	if (existing.carrierOrderId) {
		return NextResponse.json({ error: "already_booked" }, { status: 409 });
	}

	await prisma.delivery.delete({ where: { id } });
	return NextResponse.json({ ok: true });
}
