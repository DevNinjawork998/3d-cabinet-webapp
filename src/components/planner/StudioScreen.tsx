"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import {
	DOOR_STYLES,
	FINISHES,
	type FinishId,
	family,
	ROOM_TYPES,
	type RoomTypeId,
	roomType,
} from "@/lib/planner/catalogue";
import {
	addModule,
	allPositions,
	closeGaps,
	duplicateModule,
	fits,
	flushWallToTallTops,
	freeSpans,
	overhangMm,
	type PlannerLayout,
	type Positioned,
	removeModules,
	rowEndMm,
	setDoors,
	setHangingHeight,
	setWallWidth,
	setWidth,
	starterFor,
	WALL_LIMITS,
	widthOptionsFor,
} from "@/lib/planner/layout";
import { computePlannerPrice } from "@/lib/planner/pricing";
import { FamilyThumb } from "./thumbs";

const PlannerScene = dynamic(() => import("./PlannerScene"), {
	ssr: false,
	loading: () => (
		<div className="flex h-full items-center justify-center text-neutral-500 text-sm">
			Loading 3D view…
		</div>
	),
});

const rm = (amount: number) =>
	amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

export function StudioScreen({
	roomId,
	onChangeRoomAction,
	layout,
	setLayoutAction,
	finish,
	setFinishAction,
	selectedIds,
	setSelectedIdsAction,
	onGoToQuoteAction,
	onBackToStartAction,
}: {
	roomId: RoomTypeId;
	onChangeRoomAction: (id: RoomTypeId) => void;
	layout: PlannerLayout;
	setLayoutAction: (
		next: PlannerLayout | ((prev: PlannerLayout) => PlannerLayout),
	) => void;
	finish: FinishId;
	setFinishAction: (id: FinishId) => void;
	selectedIds: readonly string[];
	setSelectedIdsAction: (ids: readonly string[]) => void;
	onGoToQuoteAction: () => void;
	onBackToStartAction: () => void;
}) {
	const room = roomType(roomId);
	const selectedSet = new Set(selectedIds);

	// Filled in by the scene: screen-point → run position / cabinet under it.
	const pickerRef = useRef<((x: number, y: number) => number) | null>(null);
	const hitTestRef = useRef<((x: number, y: number) => string | null) | null>(
		null,
	);
	const [dragFamilyId, setDragFamilyId] = useState<string | null>(null);

	const select = (id: string | null, additive: boolean) => {
		if (id === null) return setSelectedIdsAction([]);
		if (!additive) return setSelectedIdsAction([id]);
		setSelectedIdsAction(
			selectedIds.includes(id)
				? selectedIds.filter((current) => current !== id)
				: [...selectedIds, id],
		);
	};

	const removeSelected = () => {
		setLayoutAction((prev) => removeModules(prev, selectedIds));
		setSelectedIdsAction([]);
	};

	const placed = allPositions(layout);
	const selection = placed.filter((position) =>
		selectedSet.has(position.placed.id),
	);
	const selected: Positioned | undefined =
		selection.length === 1 ? selection[0] : undefined;

	const floorEnd = rowEndMm(layout, "floor");
	const overhang = overhangMm(layout);
	const price = computePlannerPrice(layout, finish);

	const gapCount = (["floor", "wall"] as const).reduce(
		(total, row) =>
			total +
			freeSpans(layout, row).filter(
				(gap) => gap.endMm < rowEndMm(layout, row) && gap.startMm > 0,
			).length,
		0,
	);

	const dropCarcass = (familyId: string, clientX: number, clientY: number) => {
		const runXMm = pickerRef.current?.(clientX, clientY) ?? 0;
		setLayoutAction((prev) => addModule(prev, familyId, runXMm));
	};

	return (
		<main className="flex h-screen flex-col bg-[#e9e7e3] text-neutral-900">
			<div className="flex h-14 shrink-0 items-center justify-between gap-6 border-neutral-200 border-b bg-white px-5">
				<span className="font-semibold text-sm">
					Infinite Cabinet · {room.label} planner
				</span>
				<button
					type="button"
					onClick={onBackToStartAction}
					className="text-neutral-500 text-xs hover:text-neutral-900"
				>
					Change room
				</button>
			</div>

			<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
				<aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-neutral-200 border-b bg-white p-4 lg:h-full lg:w-[268px] lg:border-r lg:border-b-0">
					<div className="rounded-lg border border-neutral-200 bg-[#f7f6f4] p-3">
						<p className="font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
							The room
						</p>
						<p className="mt-0.5 mb-3 text-[12px] text-neutral-500 leading-4">
							Sets the space every cabinet has to fit in.
						</p>
						<div className="mb-3 flex flex-wrap gap-1">
							{ROOM_TYPES.map((option) => (
								<button
									key={option.id}
									type="button"
									onClick={() => onChangeRoomAction(option.id)}
									aria-current={option.id === roomId ? "true" : undefined}
									className={`rounded-full px-2.5 py-1 text-[12px] transition ${
										option.id === roomId
											? "bg-neutral-900 text-white"
											: "bg-white text-neutral-600 shadow-[inset_0_0_0_1px_#e5e5e5] hover:shadow-[inset_0_0_0_1px_#a3a3a3]"
									}`}
								>
									{option.label}
								</button>
							))}
						</div>

						<div className="flex flex-col gap-2.5">
							<div>
								<div className="flex items-baseline justify-between">
									<span className="text-[12px] text-neutral-600">
										Wall length
									</span>
									<span className="tabular-nums text-[12px]">
										{layout.wallWidthMm.toLocaleString("en-MY")} mm
									</span>
								</div>
								<input
									type="range"
									className="mt-1 w-full"
									aria-label="Wall length"
									min={WALL_LIMITS.minMm}
									max={WALL_LIMITS.maxMm}
									step={50}
									value={layout.wallWidthMm}
									onChange={(e) =>
										setLayoutAction((prev) =>
											setWallWidth(prev, Number(e.target.value)),
										)
									}
								/>
							</div>

							{room.familyIds.some((id) => family(id)?.kind === "wall") && (
								<div>
									<div className="flex items-baseline justify-between">
										<span className="text-[12px] text-neutral-600">
											Wall units hang at
										</span>
										<span className="tabular-nums text-[12px]">
											{layout.hangingHeightMm.toLocaleString("en-MY")} mm
										</span>
									</div>
									<input
										type="range"
										className="mt-1 w-full"
										min={1200}
										max={1800}
										step={10}
										value={layout.hangingHeightMm}
										onChange={(e) =>
											setLayoutAction((prev) =>
												setHangingHeight(prev, Number(e.target.value)),
											)
										}
									/>
									<button
										type="button"
										onClick={() =>
											setLayoutAction((prev) => flushWallToTallTops(prev))
										}
										disabled={!placed.some((p) => p.family.kind === "tall")}
										title={
											placed.some((p) => p.family.kind === "tall")
												? undefined
												: "Add a tall cabinet or fridge housing first"
										}
										className="mt-2 rounded-full border border-neutral-300 px-3 py-1 text-[11px] transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
									>
										Flush wall-unit tops to tall units
									</button>
								</div>
							)}
						</div>

						{overhang > 0 && (
							<p className="mt-2 text-[11px] text-amber-700 leading-4">
								The run overhangs this wall by {overhang}mm — close the gaps
								below, or remove a cabinet.
							</p>
						)}
					</div>

					<div>
						<p className="font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
							Add cabinets
						</p>
						<p className="mt-0.5 mb-2.5 text-[12px] text-neutral-500 leading-4">
							Drag onto the wall. Size and front come after.
						</p>
						<div className="grid grid-cols-2 gap-2">
							{room.familyIds.map((familyId) => {
								const option = family(familyId);
								if (!option) return null;
								const canFit = fits(layout, familyId);
								return (
									<button
										key={familyId}
										type="button"
										draggable={canFit}
										onDragStart={(e) => {
											e.dataTransfer.setData(
												"text/plain",
												`family:${familyId}`,
											);
											e.dataTransfer.effectAllowed = "copy";
											setDragFamilyId(familyId);
										}}
										onDragEnd={() => setDragFamilyId(null)}
										onClick={() =>
											setLayoutAction((prev) => addModule(prev, familyId, 0))
										}
										disabled={!canFit}
										className={`rounded-lg border p-2 text-left transition ${
											canFit
												? "cursor-grab border-neutral-200 hover:border-neutral-500 active:cursor-grabbing"
												: "cursor-not-allowed border-neutral-100 opacity-40"
										}`}
									>
										<FamilyThumb family={option} />
										<p className="mt-1.5 font-medium text-[12px]">
											{option.label}
										</p>
										<p className="text-[11px] text-neutral-500">
											{option.sizes[0].widthMm}–
											{option.sizes[option.sizes.length - 1].widthMm}mm · from
											RM {option.sizes[0].priceRm}
										</p>
									</button>
								);
							})}
						</div>
					</div>
				</aside>

				{/* biome-ignore lint/a11y/noStaticElementInteractions: the drop
				    target is the 3D canvas; the palette buttons are the keyboard
				    path. */}
				<div
					className="relative min-h-[45vh] flex-1"
					onDragOver={(e) => {
						e.preventDefault();
						e.dataTransfer.dropEffect = "copy";
					}}
					onDrop={(e) => {
						e.preventDefault();
						const payload = e.dataTransfer.getData("text/plain");
						const [kind, id] = payload.split(":");
						if (kind === "family" && (id || dragFamilyId)) {
							dropCarcass(id || dragFamilyId || "", e.clientX, e.clientY);
						}
						setDragFamilyId(null);
					}}
				>
					<PlannerScene
						layout={layout}
						finish={finish}
						selectedIds={selectedSet}
						doorTargetId={null}
						onLayoutChangeAction={setLayoutAction}
						onSelectAction={select}
						pickerRef={pickerRef}
						hitTestRef={hitTestRef}
					/>

					<div className="absolute top-3.5 left-3.5 flex items-center gap-2 rounded-lg bg-white/92 px-2.5 py-2 shadow-sm backdrop-blur">
						<span className="text-[12px] text-neutral-600">
							{(floorEnd / 1000).toFixed(2)} m run of{" "}
							{(layout.wallWidthMm / 1000).toFixed(2)} m wall
						</span>
						<span className="h-3.5 w-px bg-neutral-200" />
						<span className="text-[12px] text-neutral-600">
							{placed.length} {placed.length === 1 ? "unit" : "units"}
						</span>
					</div>

					<p className="absolute right-3.5 bottom-3.5 hidden max-w-[260px] text-right text-[12px] text-[#8a8580] leading-4 lg:block">
						Click a cabinet to change its size or front. Drag it along the wall
						to move it.
					</p>
				</div>

				<aside className="flex w-full shrink-0 flex-col border-neutral-200 border-t bg-white lg:h-full lg:w-[312px] lg:border-t-0 lg:border-l">
					<div className="border-neutral-200 border-b bg-[#f2f6fb] p-3.5">
						{selection.length === 0 ? (
							<>
								<p className="font-semibold text-[11px] text-[#2b6cb0] uppercase tracking-wide">
									Selected cabinet
								</p>
								<p className="mt-1 text-[13px] text-neutral-500">
									Click a cabinet in the room to size it or change its front.
								</p>
							</>
						) : selected ? (
							<>
								<p className="font-semibold text-[11px] text-[#2b6cb0] uppercase tracking-wide">
									Selected cabinet
								</p>
								<p className="mt-0.5 font-semibold text-[15px]">
									{selected.family.label} · {selected.widthMm} mm
								</p>
								<div className="mt-3 flex flex-col gap-2.5">
									<div>
										<p className="mb-1.5 font-medium text-[11px] text-neutral-600">
											Width
										</p>
										<div className="flex flex-wrap gap-1.5">
											{widthOptionsFor(layout, selected.placed.id).map(
												(option) => (
													<button
														key={option.widthMm}
														type="button"
														disabled={!option.fits}
														onClick={() =>
															setLayoutAction((prev) =>
																setWidth(
																	prev,
																	selected.placed.id,
																	option.widthMm,
																),
															)
														}
														className={`rounded-md px-2.5 py-1 text-[12px] transition ${
															option.widthMm === selected.widthMm
																? "bg-neutral-900 font-medium text-white"
																: option.fits
																	? "bg-white text-neutral-700 shadow-[inset_0_0_0_1px_#d4d4d4] hover:shadow-[inset_0_0_0_1px_#a3a3a3]"
																	: "cursor-not-allowed bg-white text-neutral-300 shadow-[inset_0_0_0_1px_#e5e5e5]"
														}`}
													>
														{option.widthMm}
														{!option.fits && " · no room"}
													</button>
												),
											)}
										</div>
									</div>

									<div>
										<p className="mb-1.5 font-medium text-[11px] text-neutral-600">
											Front
										</p>
										<div className="flex flex-wrap gap-1.5">
											{DOOR_STYLES.map((style) => (
												<button
													key={style.id}
													type="button"
													onClick={() =>
														setLayoutAction((prev) =>
															setDoors(prev, [selected.placed.id], style.id),
														)
													}
													className={`rounded-md px-2.5 py-1 text-[12px] transition ${
														selected.placed.doorStyleId === style.id
															? "bg-neutral-900 font-medium text-white"
															: "bg-white text-neutral-700 shadow-[inset_0_0_0_1px_#d4d4d4] hover:shadow-[inset_0_0_0_1px_#a3a3a3]"
													}`}
												>
													{style.label}
												</button>
											))}
											{selected.placed.doorStyleId && (
												<button
													type="button"
													onClick={() =>
														setLayoutAction((prev) =>
															setDoors(prev, [selected.placed.id], null),
														)
													}
													className="rounded-md px-2.5 py-1 text-[12px] text-neutral-500 underline hover:text-neutral-900"
												>
													No door
												</button>
											)}
										</div>
									</div>

									<div className="flex items-center justify-between">
										<span className="tabular-nums text-[13px]">
											RM{" "}
											{rm(
												price.cabinets.find((l) => l.id === selected.placed.id)
													?.amountRm ?? 0,
											)}
										</span>
										<span className="flex gap-3">
											<button
												type="button"
												onClick={() =>
													setLayoutAction((prev) =>
														duplicateModule(prev, selected.placed.id),
													)
												}
												className="text-[12px] text-neutral-500 underline hover:text-neutral-900"
											>
												Duplicate
											</button>
											<button
												type="button"
												onClick={removeSelected}
												className="text-[12px] text-[#b45309] underline hover:text-[#92400e]"
											>
												Remove
											</button>
										</span>
									</div>
								</div>
							</>
						) : (
							<>
								<p className="font-semibold text-[11px] text-[#2b6cb0] uppercase tracking-wide">
									{selection.length} cabinets selected
								</p>
								<div className="mt-3 flex flex-col gap-2.5">
									<div>
										<p className="mb-1.5 font-medium text-[11px] text-neutral-600">
											Front
										</p>
										<div className="flex flex-wrap gap-1.5">
											{DOOR_STYLES.map((style) => (
												<button
													key={style.id}
													type="button"
													onClick={() =>
														setLayoutAction((prev) =>
															setDoors(prev, selectedIds, style.id),
														)
													}
													className="rounded-md bg-white px-2.5 py-1 text-[12px] text-neutral-700 shadow-[inset_0_0_0_1px_#d4d4d4] transition hover:shadow-[inset_0_0_0_1px_#a3a3a3]"
												>
													{style.label}
												</button>
											))}
											<button
												type="button"
												onClick={() =>
													setLayoutAction((prev) =>
														setDoors(prev, selectedIds, null),
													)
												}
												className="rounded-md px-2.5 py-1 text-[12px] text-neutral-500 underline hover:text-neutral-900"
											>
												No door
											</button>
										</div>
									</div>

									<div className="flex gap-3">
										<button
											type="button"
											onClick={removeSelected}
											className="rounded-full bg-neutral-900 px-3 py-1 text-[12px] text-white"
										>
											Remove all {selection.length}
										</button>
										<button
											type="button"
											onClick={() => setSelectedIdsAction([])}
											className="text-[12px] text-neutral-500 hover:text-neutral-900"
										>
											Clear
										</button>
									</div>
								</div>
							</>
						)}
					</div>

					<div className="border-neutral-200 border-b p-3.5">
						<p className="mb-2 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
							Front finish · whole run
						</p>
						<div className="flex gap-1.5">
							{FINISHES.map((option) => (
								<button
									key={option.id}
									type="button"
									onClick={() => setFinishAction(option.id)}
									aria-pressed={option.id === finish}
									title={option.label}
									className="h-[26px] w-[26px] rounded-md"
									style={{
										backgroundColor: option.hex,
										boxShadow:
											option.id === finish
												? "0 0 0 2px #171717, 0 0 0 3px #fff"
												: option.hex === "#ffffff"
													? "inset 0 0 0 1px #d4d4d4"
													: "none",
									}}
								/>
							))}
						</div>
						<p className="mt-2 text-[12px] text-neutral-500">
							{FINISHES.find((f) => f.id === finish)?.label} · one colour for
							the whole room
						</p>
					</div>

					<div className="flex-1 overflow-y-auto p-3.5">
						<div className="mb-2 flex items-baseline justify-between gap-2">
							<p className="font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
								Your run · {placed.length}{" "}
								{placed.length === 1 ? "unit" : "units"}
							</p>
							<button
								type="button"
								onClick={() => setLayoutAction(closeGaps(layout))}
								disabled={gapCount === 0}
								className="text-[11px] text-neutral-500 hover:text-neutral-900 disabled:opacity-40"
							>
								Close gaps{gapCount > 0 && ` (${gapCount})`}
							</button>
						</div>
						<div className="flex flex-col">
							{placed.map((position) => {
								const isSelected = selectedSet.has(position.placed.id);
								const line = price.cabinets.find(
									(l) => l.id === position.placed.id,
								);
								return (
									<div
										key={position.placed.id}
										className={`flex items-center gap-2 border-neutral-100 border-t py-1.5 text-[13px] ${
											isSelected ? "bg-[#f2f6fb]" : ""
										}`}
									>
										<input
											type="checkbox"
											checked={isSelected}
											aria-label={`Select ${position.family.label}`}
											onChange={() => select(position.placed.id, true)}
										/>
										<button
											type="button"
											onClick={(e) =>
												select(
													position.placed.id,
													e.shiftKey || e.metaKey || e.ctrlKey,
												)
											}
											className="flex-1 text-left"
										>
											{position.family.label} {position.widthMm}{" "}
											<span className="text-[11px] text-neutral-400">
												{position.placed.doorStyleId ?? "no door"}
											</span>
										</button>
										<span className="tabular-nums text-[13px] text-neutral-600">
											{line ? Math.round(line.amountRm) : 0}
										</span>
									</div>
								);
							})}
						</div>
						{placed.length === 0 && (
							<p className="text-[12px] text-neutral-500">
								Nothing placed yet — drag a carcass onto the wall.
							</p>
						)}
						<button
							type="button"
							onClick={() => {
								setLayoutAction(starterFor(roomId));
								setSelectedIdsAction([]);
							}}
							className="mt-2 text-[11px] text-neutral-500 underline hover:text-neutral-900"
						>
							Reset this room
						</button>
					</div>

					<div className="flex flex-col gap-2.5 border-neutral-200 border-t p-3.5">
						<div className="flex items-baseline justify-between">
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
							Placeholder rates — not a quote until Infinite Cabinet confirms.
						</p>
						<button
							type="button"
							onClick={onGoToQuoteAction}
							disabled={placed.length === 0}
							className="rounded-lg bg-neutral-900 px-3 py-2.5 font-medium text-[14px] text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Get a quote for this design
						</button>
					</div>
				</aside>
			</div>
		</main>
	);
}
