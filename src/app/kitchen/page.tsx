"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
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
	removeModule,
	rowEndMm,
	setHangingHeight,
	starterKitchen,
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

const WALL_WIDTHS_MM = [3000, 3600, 4200, 4800, 6000];

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
	const [selectedId, setSelectedId] = useState<string | null>(null);
	// Filled in by the scene: turns a screen point into a position along the run.
	const pickerRef = useRef<((x: number, y: number) => number) | null>(null);
	const [dragTypeId, setDragTypeId] = useState<string | null>(null);

	const setWallWidth = (wallWidthMm: number) =>
		setLayout((prev) => ({ ...prev, wallWidthMm }));

	const drop = (typeId: string, clientX: number, clientY: number) => {
		// If the scene has not registered its picker yet, the cabinet still lands
		// — just in the first free space rather than under the cursor.
		const runXMm = pickerRef.current?.(clientX, clientY) ?? 0;
		setLayout((prev) => addModule(prev, typeId, runXMm));
	};

	const selected = selectedId
		? allPositions(layout).find((p) => p.placed.id === selectedId)
		: undefined;

	const floorEnd = rowEndMm(layout, "floor");
	const wallEnd = rowEndMm(layout, "wall");

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
					selectedId={selectedId}
					onLayoutChangeAction={setLayout}
					onSelectAction={setSelectedId}
					pickerRef={pickerRef}
				/>

				<div className="absolute top-4 left-4 rounded-lg bg-white/90 p-3 shadow-sm backdrop-blur">
					<p className="text-neutral-500 text-xs">Run along the wall</p>
					<p className="font-semibold text-xl">
						{(floorEnd / 1000).toFixed(2)} m
					</p>
					<p className="text-neutral-500 text-xs">
						{layout.floor.length} floor · {layout.wall.length} wall units
					</p>
				</div>

				{selected && (
					<div className="-translate-x-1/2 absolute bottom-4 left-1/2 flex items-center gap-3 rounded-full bg-white px-4 py-2 shadow">
						<span className="text-sm">{selected.type.label}</span>
						<span className="text-neutral-500 text-xs">
							{selected.type.widthMm} × {selected.type.depthMm} ×{" "}
							{selected.type.heightMm} mm
						</span>
						<button
							type="button"
							onClick={() => {
								setLayout((prev) => removeModule(prev, selected.placed.id));
								setSelectedId(null);
							}}
							className="rounded-full bg-neutral-900 px-3 py-1 text-white text-xs"
						>
							Remove
						</button>
					</div>
				)}

				<p className="absolute right-4 bottom-4 hidden text-neutral-500 text-xs lg:block">
					Drag a cabinet in from the right — drag one in the room to move it
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
					<legend className="font-medium text-sm">Wall length</legend>
					<div className="flex flex-wrap gap-2">
						{WALL_WIDTHS_MM.map((width) => (
							<button
								key={width}
								type="button"
								onClick={() => setWallWidth(width)}
								aria-pressed={layout.wallWidthMm === width}
								className={`rounded-full px-3 py-1 text-xs transition ${
									layout.wallWidthMm === width
										? "bg-neutral-900 text-white"
										: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
								}`}
							>
								{(width / 1000).toFixed(1)}m
							</button>
						))}
					</div>
					{(floorEnd > layout.wallWidthMm || wallEnd > layout.wallWidthMm) && (
						<p className="text-amber-700 text-xs">
							The run is longer than this wall — remove a cabinet or pick a
							longer wall.
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
					<h2 className="font-medium text-sm">In this kitchen</h2>
					<ul className="space-y-1">
						{allPositions(layout).map((position) => (
							<li
								key={position.placed.id}
								className="flex items-center justify-between gap-2 border-neutral-100 border-t py-1 text-sm"
							>
								<button
									type="button"
									onClick={() => setSelectedId(position.placed.id)}
									className={`flex-1 text-left ${
										position.placed.id === selectedId ? "font-medium" : ""
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
										setLayout((prev) => removeModule(prev, position.placed.id))
									}
									className="text-neutral-500 text-xs hover:text-neutral-900"
								>
									Remove
								</button>
							</li>
						))}
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
