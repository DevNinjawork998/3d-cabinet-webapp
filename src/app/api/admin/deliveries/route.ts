import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { WORKSHOP_ADDRESS } from "@/lib/logistics/carriers";
import {
	suggestVehicle,
	totalVolumeM3,
	totalWeightKg,
} from "@/lib/logistics/measure";
import { deliveryInputSchema } from "@/lib/logistics/types";

export const runtime = "nodejs";

/** Every delivery for the admin list, newest job number first. */
export async function GET() {
	const deliveries = await prisma.delivery.findMany({
		orderBy: { number: "desc" },
	});
	return NextResponse.json({ deliveries, workshopAddress: WORKSHOP_ADDRESS });
}

export async function POST(request: Request) {
	const parsed = deliveryInputSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	const { items, scheduledAt, ...rest } = parsed.data;

	const delivery = await prisma.delivery.create({
		data: {
			...rest,
			items,
			scheduledAt: scheduledAt === null ? null : new Date(scheduledAt),
			// Derived on write so the carrier payload builders and the list can
			// read them without recomputing, and so a later change to the maths
			// is visible as a migration rather than a silently different quote.
			totalVolumeM3: totalVolumeM3(items),
			totalWeightKg: totalWeightKg(items),
			events: {
				create: {
					source: "ADMIN",
					message: `Delivery created — ${suggestVehicle(items).label}`,
				},
			},
		},
	});

	return NextResponse.json({ delivery }, { status: 201 });
}
