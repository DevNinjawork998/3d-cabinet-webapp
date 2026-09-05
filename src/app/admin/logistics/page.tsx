import { AdminHeader } from "@/components/admin/AdminHeader";
import { prisma } from "@/lib/catalogue/db";
import { WORKSHOP_ADDRESS } from "@/lib/logistics/carriers";
import { isGeocodingConfigured } from "@/lib/logistics/geocode";
import { LogisticsManager } from "./LogisticsManager";

/**
 * Deliveries: getting finished cabinets from the workshop to a customer's site.
 *
 * The job is typed in here rather than arriving from an order, because there is
 * no order table yet — lead capture is Phase 3. When it lands, it pre-fills
 * this same form instead of replacing it.
 */
export default async function LogisticsAdminPage() {
	const deliveries = await prisma.delivery.findMany({
		orderBy: { number: "desc" },
	});

	return (
		<div className="flex min-h-screen flex-col bg-[#f4f3f1] text-neutral-900">
			<AdminHeader />
			<main className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-7 pt-8 pb-16">
				<div>
					<h1 className="mb-1 font-semibold text-[22px]">Deliveries</h1>
					<p className="text-neutral-500 text-[13px]">
						Book a pickup with a logistics partner and follow it to site.
						Compare partners before booking — the price you confirm is the one
						recorded against the job.
					</p>
				</div>
				<LogisticsManager
					initial={JSON.parse(JSON.stringify(deliveries))}
					workshopAddress={WORKSHOP_ADDRESS}
					geocodingConfigured={isGeocodingConfigured()}
				/>
			</main>
		</div>
	);
}
