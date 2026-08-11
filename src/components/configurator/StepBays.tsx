import { FINISHES, OPENING_CONSTRAINTS } from "@/lib/wardrobe/catalogue";
import {
	bayCountRange,
	resizeBay,
	setAllDoors,
	setBayCount,
} from "@/lib/wardrobe/edits";
import { PRESETS } from "@/lib/wardrobe/presets";
import { splitIntoBays } from "@/lib/wardrobe/rules";
import { Elevation } from "./Elevation";
import type { StepProps } from "./Stepper";

/**
 * How many bays each preset's own width falls into — the shape of the design,
 * separated from the width the customer measured. Applying a preset must not
 * silently undo their measurement, so it carries the look across, not the size.
 */
const PRESET_CARDS = PRESETS.map((preset) => ({
	preset,
	bays: splitIntoBays(preset.widthMm).length,
}));

export function StepBays({ design, onDesign }: StepProps) {
	const [minCount, maxCount] = bayCountRange(design.opening.width);
	const count = design.bays.length;
	const doorType = design.doors[0]?.type ?? "hinged";
	const finish = design.doors[0]?.finish;

	return (
		<>
			<div className="space-y-2">
				<h2 className="font-medium text-sm">Start from a design</h2>
				<div className="grid grid-cols-2 gap-3">
					{PRESET_CARDS.map(({ preset, bays }) => {
						const selected =
							bays === count &&
							preset.finish === finish &&
							preset.doorType === doorType;
						return (
							<button
								key={preset.id}
								type="button"
								onClick={() =>
									onDesign(
										setBayCount(
											setAllDoors(design, {
												finish: preset.finish,
												type: preset.doorType,
											}),
											bays,
										),
									)
								}
								className={`rounded-lg border p-2 text-left transition ${
									selected
										? "border-neutral-900 bg-neutral-50"
										: "border-neutral-200 hover:border-neutral-400"
								}`}
							>
								<Elevation bays={bays} doorType={preset.doorType} />
								<p className="mt-2 font-medium text-sm">{preset.label}</p>
								<p className="text-neutral-500 text-xs">
									{FINISHES[preset.finish].label}, {bays}{" "}
									{bays === 1 ? "bay" : "bays"}
								</p>
							</button>
						);
					})}
				</div>
				<p className="text-neutral-500 text-xs">
					Presets set the look and the bay count — your measured width stays.
				</p>
			</div>

			<div className="space-y-2">
				<h2 className="font-medium text-sm">How many bays?</h2>
				<Elevation bays={count} doorType={doorType} />
				<div className="flex items-center gap-2">
					<button
						type="button"
						disabled={count <= minCount}
						onClick={() => onDesign(setBayCount(design, count - 1))}
						className="h-9 w-9 rounded-full border border-neutral-300 text-lg disabled:opacity-40"
						aria-label="One bay fewer"
					>
						−
					</button>
					<span className="min-w-16 text-center text-sm tabular-nums">
						{count} {count === 1 ? "bay" : "bays"}
					</span>
					<button
						type="button"
						disabled={count >= maxCount}
						onClick={() => onDesign(setBayCount(design, count + 1))}
						className="h-9 w-9 rounded-full border border-neutral-300 text-lg disabled:opacity-40"
						aria-label="One bay more"
					>
						+
					</button>
					<span className="text-neutral-500 text-xs">
						{minCount}–{maxCount} fit this opening
					</span>
				</div>
			</div>

			<div className="space-y-3">
				<h2 className="font-medium text-sm">Fine-tune each bay</h2>
				{count < 2 && (
					<p className="text-neutral-500 text-xs">
						Add a second bay to move width between them.
					</p>
				)}
				{design.bays.map((bay, i) => (
					<label key={bay.id} className="block space-y-1">
						<span className="text-neutral-600 text-xs">
							Bay {i + 1} — {Math.round(bay.width)}mm
						</span>
						<input
							type="range"
							className="w-full"
							min={OPENING_CONSTRAINTS.minBayWidthMm}
							max={OPENING_CONSTRAINTS.maxBayWidthMm}
							step={10}
							value={Math.round(bay.width)}
							disabled={count < 2}
							onChange={(e) =>
								onDesign(resizeBay(design, bay.id, Number(e.target.value)))
							}
						/>
					</label>
				))}
				<p className="text-neutral-500 text-xs">
					Widening a bay takes the difference from the one beside it, so the run
					always fills the opening.
				</p>
			</div>
		</>
	);
}
