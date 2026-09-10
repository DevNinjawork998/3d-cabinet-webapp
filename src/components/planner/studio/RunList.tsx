"use client";

import { fill } from "@/lib/copy/fill";
import type { Positioned } from "@/lib/planner/layout";
import { useCopy } from "../CopyContext";

/**
 * Every cabinet in the run, by name.
 *
 * Shown in every state of the right panel, not just the empty one. Its
 * checkboxes are how a multi-selection is built, so hiding it as soon as one
 * cabinet is selected made multi-select unreachable — you could only ever get
 * back to it by clearing what you had.
 */
export function RunList({
	placed,
	selectedIds,
	gapCount,
	prices,
	onSelectAction,
	onCloseGapsAction,
	onResetAction,
}: {
	placed: Positioned[];
	selectedIds: ReadonlySet<string>;
	gapCount: number;
	/** Cabinet id → its line on the price, already computed by the caller. A
	 * map rather than a lookup function: a "use client" boundary only takes
	 * serialisable props. */
	prices: Record<string, number>;
	onSelectAction: (id: string, additive: boolean) => void;
	onCloseGapsAction: () => void;
	onResetAction: () => void;
}) {
	const t = useCopy();

	return (
		<div className="border-[#f0efec] border-t px-4 py-3.5">
			<div className="mb-1.5 flex items-baseline justify-between gap-2">
				<p className="font-semibold text-[11px] text-neutral-600 uppercase tracking-[0.06em]">
					{fill(t.planner.run.heading, {
						count: placed.length,
						unit: placed.length === 1 ? t.planner.unit : t.planner.units,
					})}
				</p>
				<button
					type="button"
					onClick={onCloseGapsAction}
					disabled={gapCount === 0}
					className="text-[11px] text-neutral-500 hover:text-neutral-900 disabled:opacity-40"
				>
					{gapCount > 0
						? fill(t.planner.run.closeGapsCount, { n: gapCount })
						: t.planner.run.closeGaps}
				</button>
			</div>

			{placed.length === 0 ? (
				<p className="text-[12px] text-neutral-500">
					{t.planner.run.emptyHint}
				</p>
			) : (
				<div className="flex flex-col">
					{placed.map((position) => (
						<div
							key={position.placed.id}
							className={`flex items-center gap-2 border-neutral-100 border-t py-1.5 text-[13px] ${
								selectedIds.has(position.placed.id) ? "bg-[#f2f7f4]" : ""
							}`}
						>
							<input
								type="checkbox"
								checked={selectedIds.has(position.placed.id)}
								aria-label={fill(t.planner.run.selectAria, {
									name: position.family.label,
								})}
								onChange={() => onSelectAction(position.placed.id, true)}
							/>
							<button
								type="button"
								onClick={(e) =>
									onSelectAction(
										position.placed.id,
										e.shiftKey || e.metaKey || e.ctrlKey,
									)
								}
								className="flex-1 text-left"
							>
								{position.family.label} {position.widthMm}{" "}
								<span className="text-[11px] text-neutral-400">
									{position.placed.doorStyleId ?? t.planner.run.noDoorInline}
								</span>
							</button>
							<span className="tabular-nums text-[13px] text-neutral-600">
								{Math.round(prices[position.placed.id] ?? 0)}
							</span>
						</div>
					))}
				</div>
			)}

			<button
				type="button"
				onClick={onResetAction}
				className="mt-2 text-[11px] text-neutral-500 underline hover:text-neutral-900"
			>
				{t.planner.run.reset}
			</button>
		</div>
	);
}
