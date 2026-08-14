"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { FinishId, RoomTypeId } from "@/lib/planner/catalogue";
import { doorStyle, FINISHES, roomType } from "@/lib/planner/catalogue";
import { allPositions, type PlannerLayout } from "@/lib/planner/layout";
import { computePlannerPrice } from "@/lib/planner/pricing";

const PlannerScene = dynamic(() => import("./PlannerScene"), {
	ssr: false,
	loading: () => (
		<div className="flex h-full items-center justify-center text-neutral-500 text-sm">
			Loading…
		</div>
	),
});

/**
 * Lead capture UI only — there is no `/api/quote` yet (that's Phase 3, see
 * CLAUDE.md). Submitting shows a local confirmation rather than pretending to
 * send anything, so the demo doesn't claim a capability the backend doesn't
 * have.
 */
export function QuoteScreen({
	roomId,
	layout,
	finish,
	onBackToStudioAction,
}: {
	roomId: RoomTypeId;
	layout: PlannerLayout;
	finish: FinishId;
	onBackToStudioAction: () => void;
}) {
	const room = roomType(roomId);
	const price = computePlannerPrice(layout, finish);
	const placed = allPositions(layout);
	const finishLabel = FINISHES.find((f) => f.id === finish)?.label;

	const doorStyleIds = new Set(
		placed.map((p) => p.placed.doorStyleId).filter((id) => id !== null),
	);
	const frontLabel =
		doorStyleIds.size === 0
			? "no fronts chosen yet"
			: doorStyleIds.size === 1
				? `${doorStyle([...doorStyleIds][0])?.label} fronts`
				: "mixed fronts";

	const pickerRef = useRef<((x: number, y: number) => number) | null>(null);
	const hitTestRef = useRef<((x: number, y: number) => string | null) | null>(
		null,
	);
	const [submitted, setSubmitted] = useState(false);

	return (
		<main className="flex h-screen flex-col bg-[#e9e7e3] text-neutral-900">
			<div className="flex h-14 shrink-0 items-center justify-between gap-6 border-neutral-200 border-b bg-white px-5">
				<span className="font-semibold text-sm">
					Infinite Cabinet · {room.label} planner
				</span>
				<button
					type="button"
					onClick={onBackToStudioAction}
					className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-[12px] hover:border-neutral-400"
				>
					Back to editing
				</button>
			</div>

			<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
				<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-8">
					{submitted ? (
						<div className="max-w-[420px] rounded-lg border border-emerald-200 bg-emerald-50 p-4">
							<p className="font-semibold text-emerald-900 text-sm">
								Saved — for this demo only
							</p>
							<p className="mt-1 text-[13px] text-emerald-800 leading-5">
								Lead capture isn't wired to Infinite Cabinet yet (that's a later
								phase of this build). Nothing was sent anywhere.
							</p>
						</div>
					) : (
						<div>
							<h2 className="mb-1 font-semibold text-[22px]">
								Get a real quote on this {room.label.toLowerCase()}
							</h2>
							<p className="max-w-[480px] text-[14px] text-neutral-500 leading-5">
								A designer at Infinite Cabinet checks your layout and
								measurements, then calls you with a firm price — usually within
								one business day.
							</p>
						</div>
					)}

					<form
						className="flex max-w-[420px] flex-col gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							setSubmitted(true);
						}}
					>
						<label className="flex flex-col gap-1.5">
							<span className="font-medium text-[12px] text-neutral-700">
								Full name
							</span>
							<input
								type="text"
								required
								disabled={submitted}
								className="rounded-lg border border-neutral-300 px-3 py-2.5 text-[14px] disabled:bg-neutral-50"
								placeholder="Nur Aisyah binti Kamal"
							/>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className="font-medium text-[12px] text-neutral-700">
								Phone (WhatsApp)
							</span>
							<input
								type="text"
								required
								disabled={submitted}
								className="rounded-lg border border-neutral-300 px-3 py-2.5 text-[14px] disabled:bg-neutral-50"
								placeholder="+60 12-345 6789"
							/>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className="font-medium text-[12px] text-neutral-700">
								Email
							</span>
							<input
								type="email"
								disabled={submitted}
								className="rounded-lg border border-neutral-300 px-3 py-2.5 text-[14px] disabled:bg-neutral-50"
								placeholder="you@example.com"
							/>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className="font-medium text-[12px] text-neutral-700">
								Area
							</span>
							<input
								type="text"
								disabled={submitted}
								className="rounded-lg border border-neutral-300 px-3 py-2.5 text-[14px] disabled:bg-neutral-50"
								placeholder="Petaling Jaya, Selangor"
							/>
						</label>
						<label className="mt-1 flex items-start gap-2">
							<input
								type="checkbox"
								required
								disabled={submitted}
								className="mt-0.5"
							/>
							<span className="text-[12px] text-neutral-500 leading-4">
								A designer may re-measure on site — final price can change from
								this estimate.
							</span>
						</label>
						<button
							type="submit"
							disabled={submitted}
							className="mt-1 rounded-lg bg-neutral-900 px-3 py-3 font-medium text-[14px] text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{submitted ? "Saved" : "Send my design for a quote"}
						</button>
					</form>
				</div>

				<aside className="flex w-full shrink-0 flex-col gap-4 border-neutral-200 border-t bg-[#f7f6f4] p-6 lg:h-full lg:w-[360px] lg:border-t-0 lg:border-l">
					<div className="relative h-[180px] overflow-hidden rounded-lg border border-neutral-200">
						<PlannerScene
							layout={layout}
							finish={finish}
							selectedIds={new Set()}
							doorTargetId={null}
							onLayoutChangeAction={() => {}}
							onSelectAction={() => {}}
							pickerRef={pickerRef}
							hitTestRef={hitTestRef}
						/>
					</div>
					<div>
						<p className="font-semibold text-[13px]">
							{room.label} · {(layout.wallWidthMm / 1000).toFixed(2)} m wall ·{" "}
							{placed.length} {placed.length === 1 ? "unit" : "units"}
						</p>
						<p className="mt-0.5 text-[12px] text-neutral-500">
							{finishLabel} · {frontLabel}
						</p>
					</div>
					<div className="flex items-baseline justify-between border-neutral-200 border-t pt-3">
						<span className="text-[13px] text-neutral-500">
							Estimated total
						</span>
						<span className="font-semibold text-xl">
							RM{" "}
							{price.totalRm.toLocaleString("en-MY", {
								maximumFractionDigits: 0,
							})}
						</span>
					</div>
					<p className="flex items-center gap-1.5 text-[#b45309] text-[11px] leading-4">
						<span className="rounded border border-[#b45309] px-1 py-0.5 font-semibold">
							ESTIMATE
						</span>{" "}
						Not a quote until confirmed on site.
					</p>
				</aside>
			</div>
		</main>
	);
}
