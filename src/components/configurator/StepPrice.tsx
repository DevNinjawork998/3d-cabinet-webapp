import { computePrice, type PriceLineItem } from "@/lib/wardrobe/pricing";
import type { StepProps } from "./Stepper";

const rm = (amount: number) =>
	amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

function Lines({ title, items }: { title: string; items: PriceLineItem[] }) {
	const shown = items.filter((item) => item.amountRm > 0);
	if (shown.length === 0) return null;
	return (
		<div className="space-y-1">
			<p className="text-neutral-500 text-xs">{title}</p>
			{shown.map((item) => (
				<div key={item.label} className="flex justify-between gap-2 text-sm">
					<span className="text-neutral-700">{item.label}</span>
					<span className="tabular-nums">{rm(item.amountRm)}</span>
				</div>
			))}
		</div>
	);
}

export function StepPrice({ design }: StepProps) {
	const price = computePrice(design);

	return (
		<>
			<div className="space-y-3">
				<h2 className="font-medium text-sm">Your price</h2>

				<div className="flex justify-between gap-2 text-sm">
					<span className="text-neutral-700">{price.base.label}</span>
					<span className="tabular-nums">{rm(price.base.amountRm)}</span>
				</div>

				<Lines title="Finish" items={price.finishSurcharges} />
				<Lines title="Doors" items={price.doorTypeSurcharges} />
				<Lines title="Extras" items={price.accessories} />

				<div className="flex justify-between gap-2 border-neutral-200 border-t pt-2 font-semibold">
					<span>Total</span>
					<span className="tabular-nums">RM {rm(price.totalRm)}</span>
				</div>

				<p className="text-neutral-500 text-xs">
					Indicative only. Infinite Cabinet confirms the final price after a
					site measure.
				</p>
			</div>

			<button
				type="button"
				disabled
				className="w-full rounded-full bg-neutral-900 px-4 py-3 text-sm text-white disabled:opacity-40"
			>
				Request a quote — coming soon
			</button>
			<p className="text-neutral-500 text-xs">
				Saving, sharing and quote requests arrive in Phase 3.
			</p>
		</>
	);
}
