import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/catalogue/db";
import { isForwardTransition } from "@/lib/logistics/status";
import {
	DELIVERY_STATUSES,
	type DeliveryStatusName,
} from "@/lib/logistics/types";

export const runtime = "nodejs";

const advanceSchema = z.object({
	status: z.enum(DELIVERY_STATUSES),
	actor: z.string().trim().min(1).max(120),
	note: z.string().trim().max(500).optional(),
});

/**
 * Move a job along by hand.
 *
 * This is how the `manual` partner works at all — nobody's own lorry posts a
 * webhook — and it is the escape hatch when a real carrier's callback never
 * arrives. It goes through the same forward-only rule as an automatic update,
 * with two deliberate exceptions: an admin may cancel or fail a job outright,
 * because those are decisions rather than observations.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const delivery = await prisma.delivery.findUnique({ where: { id } });
	if (!delivery) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	const parsed = advanceSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}
	const { status, actor, note } = parsed.data;

	const current = delivery.status as DeliveryStatusName;
	const isAbort = status === "CANCELLED" || status === "FAILED";
	if (!isAbort && !isForwardTransition(current, status)) {
		return NextResponse.json(
			{ error: "invalid_transition", from: current, to: status },
			{ status: 409 },
		);
	}

	const updated = await prisma.delivery.update({
		where: { id },
		data: {
			status,
			events: {
				create: {
					source: "ADMIN",
					status,
					actor,
					message: note ?? `Marked ${status} by hand`,
				},
			},
		},
	});

	return NextResponse.json({ delivery: updated });
}
