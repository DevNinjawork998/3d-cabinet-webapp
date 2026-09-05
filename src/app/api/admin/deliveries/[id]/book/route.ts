import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { getAdapter } from "@/lib/logistics/registry";
import { toJob } from "@/lib/logistics/store";
import { bookInputSchema, CarrierNotConfigured } from "@/lib/logistics/types";

export const runtime = "nodejs";

/**
 * Book the pickup. The only call in the app that spends money.
 *
 * Three guards, in order of how much they cost to get wrong:
 *
 * 1. Already booked → return what exists. A double-submitted form, a retried
 *    request or an impatient second click must not buy a second lorry. The
 *    unique index on `carrierOrderId` is the backstop; this is the polite path.
 * 2. The booking call is never retried. `carrierFetch` only retries calls the
 *    adapter marks idempotent, and booking is not one of them.
 * 3. `bookedBy` is required. Admin auth is a single shared password, so the
 *    name typed on the confirm step plus the event row is the entire record of
 *    who committed the spend.
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

	if (delivery.carrierOrderId) {
		return NextResponse.json({ delivery, alreadyBooked: true });
	}

	const parsed = bookInputSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}
	const { carrierId, bookedBy, quotedPriceRm } = parsed.data;

	const job = toJob(delivery);

	try {
		const adapter = getAdapter(carrierId);
		// Re-quote immediately before booking rather than trusting the figure the
		// page has been holding: a quote goes stale, and the price we record must
		// be the one the carrier just agreed to.
		const quote = await adapter.quote(job);

		// If the carrier now wants materially more than the admin confirmed, stop
		// and make them look again. Not a rounding guard — a 10% move on a lorry
		// is a different decision.
		if (
			quotedPriceRm !== null &&
			quote.priceRm !== null &&
			quote.priceRm > quotedPriceRm * 1.1
		) {
			return NextResponse.json(
				{ error: "price_moved", quotedPriceRm, currentPriceRm: quote.priceRm },
				{ status: 409 },
			);
		}

		const booking = await adapter.book(job, quote);

		const booked = await prisma.delivery.update({
			where: { id },
			data: {
				carrierId,
				bookedBy,
				status: "BOOKED",
				quotedPriceRm: quote.priceRm ?? quotedPriceRm,
				carrierOrderId: booking.carrierOrderId,
				trackingUrl: booking.trackingUrl,
				labelUrl: booking.labelUrl ?? null,
				events: {
					create: {
						source: "ADMIN",
						status: "BOOKED",
						actor: bookedBy,
						message: `Booked with ${carrierId}${
							quote.priceRm === null ? "" : ` for RM ${quote.priceRm}`
						}`,
						raw: { booking, quote } as never,
					},
				},
			},
		});

		return NextResponse.json({ delivery: booked }, { status: 201 });
	} catch (error) {
		if (error instanceof CarrierNotConfigured) {
			return NextResponse.json(
				{ error: "carrier_not_configured" },
				{
					status: 409,
				},
			);
		}
		// The booking may or may not have landed at the carrier — record the
		// attempt either way, so a lorry that turns up unexplained has a trail.
		await prisma.deliveryEvent.create({
			data: {
				deliveryId: id,
				source: "ADMIN",
				actor: bookedBy,
				message: `Booking with ${carrierId} failed: ${(error as Error).message}`,
			},
		});
		return NextResponse.json(
			{ error: `booking failed: ${(error as Error).message}` },
			{ status: 502 },
		);
	}
}
