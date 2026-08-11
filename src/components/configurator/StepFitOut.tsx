import { ACCESSORIES } from "@/lib/wardrobe/catalogue";
import { setInterior, toggleAccessory } from "@/lib/wardrobe/edits";
import { ACCESSORY_IDS, type InteriorItem } from "@/lib/wardrobe/schema";
import { BayPicker } from "./BayPicker";
import type { StepProps } from "./Stepper";

const LABELS: Record<InteriorItem["kind"], string> = {
	shelf: "Shelf",
	rail: "Hanging rail",
	drawer: "Drawers",
};

/** Keeps a new item clear of the floor and the lid. */
const MIN_GAP_MM = 100;

/** What an item is, independent of where it sits in the list. */
const keyOf = (item: InteriorItem) => `${item.kind}-${item.heightFromFloor}`;

export function StepFitOut({
	design,
	onDesign,
	selectedBayId,
	onSelectBay,
}: StepProps & {
	selectedBayId: string;
	onSelectBay: (bayId: string) => void;
}) {
	const interior =
		design.interiors.find((i) => i.bayId === selectedBayId) ??
		design.interiors[0];
	if (!interior) return null;

	const carcassMm = design.opening.height;
	const items = interior.items;

	/**
	 * Two items of the same kind at the same height are the same item — there
	 * is nothing to build twice — so dragging one onto another collapses them.
	 * That also makes `keyOf` unique, which is what lets the list key on what an
	 * item *is* rather than where it sits: the list re-sorts as items move, and
	 * an index key would hand a dragged slider to its neighbour mid-drag.
	 */
	const replace = (next: InteriorItem[]) => {
		const unique = new Map(next.map((item) => [keyOf(item), item]));
		onDesign(
			setInterior(
				design,
				interior.bayId,
				[...unique.values()].sort(
					(a, b) => a.heightFromFloor - b.heightFromFloor,
				),
			),
		);
	};

	const add = (kind: InteriorItem["kind"]) => {
		// Drop it in the largest gap left, so a second shelf doesn't land on top
		// of the first.
		const used = items
			.map((item) => item.heightFromFloor)
			.sort((a, b) => a - b);
		const edges = [0, ...used, carcassMm];
		let best = carcassMm / 2;
		let bestGap = 0;
		for (let i = 0; i < edges.length - 1; i++) {
			const gap = edges[i + 1] - edges[i];
			if (gap > bestGap) {
				bestGap = gap;
				best = edges[i] + gap / 2;
			}
		}
		const heightFromFloor =
			kind === "drawer"
				? 60
				: Math.round(Math.min(best, carcassMm - MIN_GAP_MM));

		replace([
			...items,
			kind === "drawer"
				? { kind, heightFromFloor, count: 2 }
				: { kind, heightFromFloor },
		]);
	};

	return (
		<>
			<div className="space-y-2">
				<h2 className="font-medium text-sm">Which bay?</h2>
				<BayPicker
					design={design}
					selected={interior.bayId}
					onSelect={onSelectBay}
				/>
			</div>

			<div className="space-y-2">
				<div className="flex flex-wrap gap-2">
					{(["shelf", "rail", "drawer"] as const).map((kind) => (
						<button
							key={kind}
							type="button"
							onClick={() => add(kind)}
							className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:border-neutral-500"
						>
							Add {LABELS[kind].toLowerCase()}
						</button>
					))}
				</div>

				{items.length === 0 && (
					<p className="text-neutral-500 text-xs">
						This bay is empty — add a shelf or a rail.
					</p>
				)}

				<ul className="space-y-3">
					{items.map((item, index) => (
						<li
							key={keyOf(item)}
							className="space-y-1 rounded border border-neutral-200 p-2"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="font-medium text-xs">
									{LABELS[item.kind]}
									{item.kind === "drawer" && ` × ${item.count}`}
								</span>
								<button
									type="button"
									onClick={() => replace(items.filter((_, i) => i !== index))}
									className="text-neutral-500 text-xs hover:text-neutral-900"
								>
									Remove
								</button>
							</div>

							<input
								type="range"
								className="w-full"
								min={0}
								max={carcassMm - MIN_GAP_MM}
								step={10}
								value={item.heightFromFloor}
								aria-label={`${LABELS[item.kind]} height`}
								onChange={(e) =>
									replace(
										items.map((current, i) =>
											i === index
												? {
														...current,
														heightFromFloor: Number(e.target.value),
													}
												: current,
										),
									)
								}
							/>
							<span className="text-neutral-500 text-xs">
								{item.heightFromFloor}mm off the floor
							</span>

							{item.kind === "drawer" && (
								<div className="flex items-center gap-2 pt-1">
									<span className="text-neutral-500 text-xs">How many</span>
									{[1, 2, 3, 4].map((count) => (
										<button
											key={count}
											type="button"
											aria-pressed={item.count === count}
											onClick={() =>
												replace(
													items.map((current, i) =>
														i === index && current.kind === "drawer"
															? { ...current, count }
															: current,
													),
												)
											}
											className={`h-7 w-7 rounded-full text-xs ${
												item.count === count
													? "bg-neutral-900 text-white"
													: "bg-neutral-100 hover:bg-neutral-200"
											}`}
										>
											{count}
										</button>
									))}
								</div>
							)}
						</li>
					))}
				</ul>
			</div>

			<fieldset className="space-y-2">
				<legend className="font-medium text-sm">Extras for this bay</legend>
				{ACCESSORY_IDS.map((id) => (
					<label key={id} className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={interior.accessories.includes(id)}
							onChange={() =>
								onDesign(toggleAccessory(design, interior.bayId, id))
							}
						/>
						<span>{ACCESSORIES[id].label}</span>
						<span className="text-neutral-500 text-xs">
							+RM {ACCESSORIES[id].rateRm}
						</span>
					</label>
				))}
			</fieldset>
		</>
	);
}
