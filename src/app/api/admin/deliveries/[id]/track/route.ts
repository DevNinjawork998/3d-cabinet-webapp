import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { getAdapter } from "@/lib/logistics/registry";
import { applyTrackingUpdate } from "@/lib/logistics/store";
import { CarrierNotConfigured } from "@/lib/logistics/types";

export const runtime = "nodejs";

/** The Refresh button: pull this one job's status now rather than waiting. */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const delivery = await prisma.delivery.findUnique({ where: { id } });
	if (!delivery) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	if (!delivery.carrierId || !delivery.carrierOrderId) {
		return NextResponse.json({ error: "not_booked" }, { status: 409 });
	}

	try {
		const update = await getAdapter(delivery.carrierId).track(
			delivery.carrierOrderId,
		);
		const updated = await applyTrackingUpdate(id, update, "POLL");
		return NextResponse.json({ delivery: updated });
	} catch (error) {
		if (error instanceof CarrierNotConfigured) {
			return NextResponse.json(
				{ error: "carrier_not_configured" },
				{ status: 409 },
			);
		}
		return NextResponse.json(
			{ error: `tracking failed: ${(error as Error).message}` },
			{ status: 502 },
		);
	}
}
