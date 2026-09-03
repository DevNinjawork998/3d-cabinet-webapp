import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { enabledCarriers } from "@/lib/logistics/registry";
import { toJob } from "@/lib/logistics/store";
import type { CarrierQuote } from "@/lib/logistics/types";

export const runtime = "nodejs";

type QuoteRow = CarrierQuote & { error?: string };

/**
 * Ask every partner we can reach what this job costs.
 *
 * `allSettled`, not `all`: one carrier being down must not blank the whole
 * comparison. A partner that fails comes back as a row carrying its error, so
 * the admin sees "GDEX: timed out" next to the prices that did arrive and can
 * still book one of them.
 */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const delivery = await prisma.delivery.findUnique({ where: { id } });
	if (!delivery) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	const job = toJob(delivery);
	const adapters = enabledCarriers();

	const settled = await Promise.allSettled(
		adapters.map((adapter) => adapter.quote(job)),
	);

	const quotes: QuoteRow[] = settled.map((result, i) =>
		result.status === "fulfilled"
			? result.value
			: {
					carrierId: adapters[i].id,
					priceRm: null,
					etaMinutes: null,
					error: (result.reason as Error).message,
				},
	);

	// QUOTED only ever moves a DRAFT forward — re-comparing a booked job is a
	// legitimate thing to do and must not rewrite its status.
	if (delivery.status === "DRAFT") {
		await prisma.delivery.update({
			where: { id },
			data: {
				status: "QUOTED",
				events: {
					create: {
						source: "ADMIN",
						status: "QUOTED",
						message: `Compared ${quotes.length} partner${quotes.length === 1 ? "" : "s"}`,
						raw: quotes as never,
					},
				},
			},
		});
	}

	return NextResponse.json({ quotes });
}
