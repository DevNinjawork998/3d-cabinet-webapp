"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DimInput } from "@/components/viewer/RoomFields";
import {
	KITCHEN_FINISHES,
	type KitchenFinishId,
	MODULE_TYPES,
	type ModuleType,
} from "@/lib/kitchen/catalogue";
import {
	addModule,
	allPositions,
	closeGaps,
	fits,
	freeSpans,
	type KitchenLayout,
	overhangMm,
	removeModules,
	rowEndMm,
	setHangingHeight,
	setWallWidth,
	starterKitchen,
	WALL_LIMITS,
} from "@/lib/kitchen/layout";

const KitchenScene = dynamic(
	() => import("@/components/kitchen/KitchenScene"),
	{
		ssr: false,
		loading: () => (
			<div className="flex h-full items-center justify-center text-neutral-500 text-sm">
				Loading 3D view…
			</div>
		),
	},
);

const KIND_LABELS: Record<ModuleType["kind"], string> = {
	base: "Base units",
	wall: "Wall units",
	tall: "Tall units",
};

export default function KitchenPage() {
	const [layout, setLayout] = useState<KitchenLayout>(() =>
		starterKitchen(4200),
	);
	const [finish, setFinish] = useState<KitchenFinishId>("strata-noir");
	const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	// Filled in by the scene: turns a screen point into a position along the run.
	const pickerRef = useRef<((x: number, y: number) => number) | null>(null);
	const [dragTypeId, setDragTypeId] = useState<string | null>(null);

	const changeWallWidth = (wallWidthMm: number) =>
		setLayout((prev) => setWallWidth(prev, wallWidthMm));

	const drop = (typeId: string, clientX: number, clientY: number) => {
		// If the scene has not registered its picker yet, the cabinet still lands
		// — just in the first free space rather than under the cursor.
		const runXMm = pickerRef.current?.(clientX, clientY) ?? 0;
		setLayout((prev) => addModule(prev, typeId, runXMm));
	};

	/**
	 * Clicking picks one cabinet; shift, ctrl or cmd adds to the selection so a
	 * customer can clear a whole stretch of wall in one go.
	 */
	const select = useCallback((id: string | null, additive: boolean) => {
		setSelectedIds((prev) => {
			if (id === null) return prev.length === 0 ? prev : [];
			if (!additive) return [id];
			return prev.includes(id)
				? prev.filter((current) => current !== id)
				: [...prev, id];
		});
	}, []);

	const removeSelected = useCallback(() => {
		setLayout((prev) => removeModules(prev, selectedIds));
		setSelectedIds([]);
	}, [selectedIds]);

	// Delete clears the selection the way it does everywhere else. Ignored while
	// a slider or a field has focus, so the range inputs keep their own keys.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Delete" && e.key !== "Backspace") return;
			const target = e.target as HTMLElement | null;
			if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
			if (selectedIds.length === 0) return;
			e.preventDefault();
			removeSelected();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [selectedIds, removeSelected]);

	const placed = allPositions(layout);
	const selection = placed.filter((position) =>
		selectedSet.has(position.placed.id),
	);
	const selected = selection.length === 1 ? selection[0] : undefined;

	const floorEnd = rowEndMm(layout, "floor");
	const overhang = overhangMm(layout);

	// Gaps *inside* the run — the stretch of bare wall past the last cabinet is
	// not a gap, it is just the rest of the wall.
	const gapCount = (["floor", "wall"] as const).reduce(
		(total, row) =>
			total +
			freeSpans(layout, row).filter(
				(gap) => gap.endMm < rowEndMm(layout, row) && gap.startMm > 0,
			).length,
		0,
	);

	return (
		<main className="flex h-screen flex-col bg-neutral-100 text-neutral-900 lg:flex-row">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the drop target is
			    the 3D canvas; the palette buttons below are the keyboard path. */}
			<section
				className="relative h-[55vh] w-full min-w-0 overflow-hidden lg:h-screen lg:flex-1"
				onDragOver={(e) => {
					// Without this the browser refuses the drop.
					e.preventDefault();
					e.dataTransfer.dropEffect = "copy";
				}}
				onDrop={(e) => {
					e.preventDefault();
					const typeId =
						e.dataTransfer.getData("text/plain") || dragTypeId || "";
					if (typeId) drop(typeId, e.clientX, e.clientY);
					setDragTypeId(null);
				}}
			>
				<KitchenScene
					layout={layout}
					finish={finish}
					selectedIds={selectedSet}
					onLayoutChangeAction={setLayout}
					onSelectAction={select}
					pickerRef={pickerRef}
				/>

				<div className="absolute top-4 left-4 rounded-lg bg-white/90 p-3 shadow-sm backdrop-blur">
					<p className="text-neutral-500 text-xs">Run along the wall</p>
					<p className="font-semibold text-xl">
						{(floorEnd / 1000).toFixed(2)} m
					</p>
					<p className="text-neutral-500 text-xs">
						{layout.floor.length} floor · {layout.wall.length} wall{" "}
						{layout.wall.length === 1 ? "unit" : "units"}
					</p>
				</div>

				{selection.length > 0 && (
					<div className="-translate-x-1/2 absolute bottom-4 left-1/2 flex items-center gap-3 rounded-full bg-white px-4 py-2 shadow">
						{selected ? (
							<>
								<span className="text-sm">{selected.type.label}</span>
								<span className="text-neutral-500 text-xs">
									{selected.type.widthMm} × {selected.type.depthMm} ×{" "}
									{selected.type.heightMm} mm
								</span>
							</>
						) : (
							<span className="text-sm">
								{selection.length} cabinets selected
							</span>
						)}
						<button
							type="button"
							onClick={removeSelected}
							className="rounded-full bg-neutral-900 px-3 py-1 text-white text-xs"
						>
							Remove{selection.length > 1 ? ` all ${selection.length}` : ""}
						</button>
						{selection.length > 1 && (
							<button
								type="button"
								onClick={() => setSelectedIds([])}
								className="text-neutral-500 text-xs hover:text-neutral-900"
							>
								Clear
							</button>
						)}
					</div>
				)}

				<p className="absolute right-4 bottom-4 hidden text-neutral-500 text-xs lg:block">
					Drag a cabinet in from the right — drag one in the room to move it.
					Shift-click to pick several, then remove them together.
				</p>
			</section>

			<aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-neutral-200 border-t bg-white p-5 lg:h-full lg:w-96 lg:border-t-0 lg:border-l">
				<div>
					<h1 className="font-semibold text-lg">Plan your kitchen</h1>
					<p className="text-neutral-500 text-sm">
						Drag cabinets onto the wall. Base units take the floor, wall units
						hang above them.
					</p>
				</div>

				<fieldset className="block space-y-2">
					<legend className="font-medium text-sm">Your wall</legend>
					<div className="flex items-center gap-3">
						<div className="w-32">
							<DimInput
								showLabel
								label="Wall length"
								value={layout.wallWidthMm}
								min={WALL_LIMITS.minMm}
								max={WALL_LIMITS.maxMm}
								onCommit={changeWallWidth}
							/>
						</div>
						<span className="pt-4 text-neutral-500 text-xs">
							{(layout.wallWidthMm / 1000).toFixed(2)}m — measure the wall the
							kitchen goes against
						</span>
					</div>
					<input
						type="range"
						className="w-full"
						aria-label="Wall length"
						min={WALL_LIMITS.minMm}
						max={WALL_LIMITS.maxMm}
						step={50}
						value={layout.wallWidthMm}
						onChange={(e) => changeWallWidth(Number(e.target.value))}
					/>
					{overhang > 0 && (
						<p className="text-amber-700 text-xs">
							The run overhangs this wall by {overhang}mm — close the gaps
							below, or remove a cabinet.
						</p>
					)}
				</fieldset>

				<label className="block space-y-1">
					<span className="font-medium text-sm">
						Wall units hang at {layout.hangingHeightMm}mm
					</span>
					<input
						type="range"
						className="w-full"
						min={1200}
						max={1800}
						step={10}
						value={layout.hangingHeightMm}
						onChange={(e) =>
							setLayout((prev) =>
								setHangingHeight(prev, Number(e.target.value)),
							)
						}
					/>
					<span className="text-neutral-500 text-xs">
						They move together — a fitted kitchen lines its wall units up.
					</span>
				</label>

				<div className="space-y-3">
					<h2 className="font-medium text-sm">Cabinets</h2>
					{(["base", "wall", "tall"] as const).map((kind) => (
						<div key={kind} className="space-y-1">
							<p className="text-neutral-500 text-xs">{KIND_LABELS[kind]}</p>
							<div className="grid grid-cols-2 gap-2">
								{MODULE_TYPES.filter((type) => type.kind === kind).map(
									(type) => {
										const room = fits(layout, type.id);
										return (
											<button
												key={type.id}
												type="button"
												draggable={room}
												onDragStart={(e) => {
													e.dataTransfer.setData("text/plain", type.id);
													e.dataTransfer.effectAllowed = "copy";
													setDragTypeId(type.id);
												}}
												onDragEnd={() => setDragTypeId(null)}
												// Click adds at the end of the run: the keyboard and
												// touch path to the same result as a drag.
												onClick={() =>
													setLayout((prev) => addModule(prev, type.id, 0))
												}
												disabled={!room}
												className={`rounded-lg border p-2 text-left transition ${
													room
														? "cursor-grab border-neutral-200 hover:border-neutral-500 active:cursor-grabbing"
														: "cursor-not-allowed border-neutral-100 opacity-40"
												}`}
											>
												<Thumbnail type={type} />
												<p className="mt-1 font-medium text-xs">{type.label}</p>
												<p className="text-[10px] text-neutral-500">
													{type.widthMm} × {type.depthMm} × {type.heightMm}
												</p>
											</button>
										);
									},
								)}
							</div>
						</div>
					))}
				</div>

				<fieldset className="space-y-2">
					<legend className="font-medium text-sm">Door finish</legend>
					<div className="grid grid-cols-3 gap-2">
						{KITCHEN_FINISHES.map((option) => (
							<button
								key={option.id}
								type="button"
								onClick={() => setFinish(option.id)}
								aria-pressed={option.id === finish}
								className={`rounded-md border p-1 text-center ${
									option.id === finish
										? "border-neutral-900 ring-1 ring-neutral-900"
										: "border-neutral-200 hover:border-neutral-400"
								}`}
							>
								<span
									className="block h-8 w-full rounded"
									style={{ backgroundColor: option.hex }}
								/>
								<span className="mt-1 block truncate text-[10px] leading-tight">
									{option.label}
								</span>
							</button>
						))}
					</div>
					<p className="text-neutral-500 text-xs">
						Finish names and colours read from Infinite Cabinet's own SketchUp
						job.
					</p>
				</fieldset>

				<div className="space-y-2">
					<div className="flex items-baseline justify-between gap-2">
						<h2 className="font-medium text-sm">In this kitchen</h2>
						{selection.length > 0 && (
							<button
								type="button"
								onClick={removeSelected}
								className="text-neutral-500 text-xs underline hover:text-neutral-900"
							>
								Remove {selection.length} selected
							</button>
						)}
					</div>
					<ul className="space-y-1">
						{placed.map((position) => {
							const isSelected = selectedSet.has(position.placed.id);
							return (
								<li
									key={position.placed.id}
									className={`flex items-center justify-between gap-2 border-neutral-100 border-t py-1 text-sm ${
										isSelected ? "bg-neutral-100" : ""
									}`}
								>
									{/* The checkbox is the multi-select path that needs no
									    modifier key — the same thing shift-clicking in the room
									    does, for anyone who does not think to try it. */}
									<input
										type="checkbox"
										checked={isSelected}
										aria-label={`Select ${position.type.label}`}
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
										className={`flex-1 text-left ${
											isSelected ? "font-medium" : ""
										}`}
									>
										{position.type.label}
										<span className="ml-2 text-neutral-500 text-xs">
											at {(position.xMm / 1000).toFixed(2)}m
										</span>
									</button>
									<button
										type="button"
										onClick={() =>
											setLayout((prev) =>
												removeModules(prev, [position.placed.id]),
											)
										}
										className="text-neutral-500 text-xs hover:text-neutral-900"
									>
										Remove
									</button>
								</li>
							);
						})}
					</ul>
					{allPositions(layout).length === 0 && (
						<p className="text-neutral-500 text-xs">
							Nothing placed yet — drag a cabinet onto the wall.
						</p>
					)}
					<div className="flex flex-wrap items-center gap-3 pt-1">
						<button
							type="button"
							onClick={() => setLayout(closeGaps(layout))}
							disabled={gapCount === 0}
							className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:border-neutral-500 disabled:opacity-40"
						>
							Close gaps
							{gapCount > 0 && (
								<span className="ml-1 text-neutral-500">({gapCount})</span>
							)}
						</button>
						<button
							type="button"
							onClick={() => setLayout(starterKitchen(layout.wallWidthMm))}
							className="text-neutral-500 text-xs underline hover:text-neutral-900"
						>
							Reset to the example kitchen
						</button>
					</div>
				</div>

				<p className="text-neutral-500 text-xs">
					Demo — module sizes are Infinite Cabinet's own (16mm board, 880mm base
					carcasses, wall units hung at 1500mm). Pricing is not wired up.
				</p>
			</aside>
		</main>
	);
}

/** Tiny elevation of the module, drawn from its own dimensions. */
function Thumbnail({ type }: { type: ModuleType }) {
	const ratio = type.widthMm / type.heightMm;
	const w = Math.min(100, 46 * ratio * (type.kind === "tall" ? 0.5 : 1.2));
	const fronts = type.drawers > 0 ? type.drawers : Math.max(1, type.doors);
	const horizontal = type.drawers > 0;

	return (
		<svg
			viewBox="0 0 100 50"
			className="h-10 w-full text-neutral-400"
			role="img"
			aria-label={`${type.label} elevation`}
		>
			<title>{`${type.label} elevation`}</title>
			<rect
				x={(100 - w) / 2}
				y={2}
				width={w}
				height={46}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={0.8}
			/>
			{Array.from({ length: fronts }, (_, i) => {
				const step = (horizontal ? 46 : w) / fronts;
				const offset = step * (i + 1);
				return horizontal ? (
					<line
						key={`h${offset}`}
						x1={(100 - w) / 2}
						y1={2 + offset}
						x2={(100 + w) / 2}
						y2={2 + offset}
						stroke="currentColor"
						strokeWidth={0.6}
					/>
				) : (
					<line
						key={`v${offset}`}
						x1={(100 - w) / 2 + offset}
						y1={2}
						x2={(100 - w) / 2 + offset}
						y2={48}
						stroke="currentColor"
						strokeWidth={0.6}
					/>
				);
			})}
		</svg>
	);
}
