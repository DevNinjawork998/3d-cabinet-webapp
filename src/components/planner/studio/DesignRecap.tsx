"use client";

import { fill } from "@/lib/copy/fill";
import type { Positioned } from "@/lib/planner/layout";
import { useCopy } from "../CopyContext";

/**
 * What the right panel says when nothing is selected.
 *
 * The recap answers "what have I got" without making the customer read the
 * 3D view, and the run list under it is still the only place a cabinet can be
 * picked by name — which is what makes multi-select reachable without hunting
 * for a small carcass behind a tall one.
 */
export function DesignRecap({
	rows,
	placed,
	selectedIds,
	gapCount,
	prices,
	onSelectAction,
	onAddAction,
	onCloseGapsAction,
	onResetAction,
}: {
	/** Label/value pairs, already formatted by the caller. */
	rows: { label: string; value: string }[];
	placed: Positioned[];
	selectedIds: ReadonlySet<string>;
	gapCount: number;
	/** Cabinet id → its line on the price, already computed by the caller. A
	 * map rather than a lookup function: a "use client" boundary only takes
	 * serialisable props. */
	prices: Record<string, number>;
	onSelectAction: (id: string, additive: boolean) => void;
	onAddAction: () => void;
	onCloseGapsAction: () => void;
	onResetAction: () => void;
}) {
	const t = useCopy();

	return (
		<div className="p-4">
			<h2 className="font-semibold text-[11px] text-neutral-600 uppercase tracking-[0.06em]">
				{t.planner.design.heading}
			</h2>
			<p className="mt-1.5 mb-3.5 text-[13px] text-neutral-700 leading-[19px]">
				{t.planner.design.hint}
			</p>

			<dl className="m-0 flex flex-col">
				{rows.map((row) => (
					<div
						key={row.label}
						className="flex items-baseline justify-between gap-3 border-[#f4f3f1] border-t py-2"
					>
						<dt className="text-[12px] text-neutral-500">{row.label}</dt>
						<dd className="m-0 text-right font-medium text-[13px]">
							{row.value}
						</dd>
					</div>
				))}
			</dl>

			<button
				type="button"
				onClick={onAddAction}
				className="mt-3.5 min-h-9 w-full rounded-[9px] border border-neutral-900 bg-white px-3.5 py-2.5 font-semibold text-[13px] hover:bg-[#f4f3f1]"
			>
				{t.planner.design.addCabinet}
			</button>

			<div className="mt-4">
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
		</div>
	);
}
