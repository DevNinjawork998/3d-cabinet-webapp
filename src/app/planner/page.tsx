"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DimInput } from "@/components/viewer/RoomFields";
import {
	DOOR_STYLES,
	type DoorStyle,
	doorPriceRm,
	type Family,
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
	fits,
	freeSpans,
	overhangMm,
	type PlannerLayout,
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

const PlannerScene = dynamic(
	() => import("@/components/planner/PlannerScene"),
	{
		ssr: false,
		loading: () => (
			<div className="flex h-full items-center justify-center text-neutral-500 text-sm">
				Loading 3D view…
			</div>
		),
	},
);

const rm = (amount: number) =>
	amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

/** Every room starts from its own preset, and keeps its own work. */
const initialRooms = (): Record<RoomTypeId, PlannerLayout> =>
	Object.fromEntries(
		ROOM_TYPES.map((room) => [room.id, starterFor(room.id)]),
	) as Record<RoomTypeId, PlannerLayout>;

export default function PlannerPage() {
	const [roomId, setRoomId] = useState<RoomTypeId>("kitchen");
	// One layout per room, so switching to the foyer and back does not throw
	// away the kitchen the customer just arranged.
	const [rooms, setRooms] =
		useState<Record<RoomTypeId, PlannerLayout>>(initialRooms);
	const [finish, setFinish] = useState<FinishId>("strata-noir");
	const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

	// Filled in by the scene.
	const pickerRef = useRef<((x: number, y: number) => number) | null>(null);
	const hitTestRef = useRef<((x: number, y: number) => string | null) | null>(
		null,
	);
	const [dragFamilyId, setDragFamilyId] = useState<string | null>(null);
	const [dragDoorId, setDragDoorId] = useState<string | null>(null);
	const [doorTargetId, setDoorTargetId] = useState<string | null>(null);

	const room = roomType(roomId);
	const layout = rooms[roomId];
	const setLayout = useCallback(
		(next: PlannerLayout | ((prev: PlannerLayout) => PlannerLayout)) =>
			setRooms((prev) => ({
				...prev,
				[roomId]:
					typeof next === "function"
						? (next as (p: PlannerLayout) => PlannerLayout)(prev[roomId])
						: next,
			})),
		[roomId],
	);

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
	}, [selectedIds, setLayout]);

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
		setLayout((prev) => addModule(prev, familyId, runXMm));
	};

	/** A door lands on whatever carcass is under the cursor. */
	const dropDoor = (doorStyleId: string, clientX: number, clientY: number) => {
		const target = hitTestRef.current?.(clientX, clientY) ?? null;
		if (!target) return;
		setLayout((prev) => setDoors(prev, [target], doorStyleId));
		select(target, false);
	};

	const applyDoorToSelection = (doorStyleId: string | null) => {
		if (selection.length === 0) return;
		setLayout((prev) => setDoors(prev, selectedIds, doorStyleId));
	};

	return (
		<main className="flex h-screen flex-col bg-neutral-100 text-neutral-900 lg:flex-row">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the drop target is
			    the 3D canvas; the palette buttons are the keyboard path. */}
			<section
				className="relative h-[55vh] w-full min-w-0 overflow-hidden lg:h-screen lg:flex-1"
				onDragOver={(e) => {
					e.preventDefault();
					e.dataTransfer.dropEffect = "copy";
					// Light up the carcass a door would land on, before it is released.
					if (dragDoorId) {
						setDoorTargetId(hitTestRef.current?.(e.clientX, e.clientY) ?? null);
					}
				}}
				onDragLeave={() => setDoorTargetId(null)}
				onDrop={(e) => {
					e.preventDefault();
					const payload = e.dataTransfer.getData("text/plain");
					const [kind, id] = payload.split(":");

					if (kind === "door" || dragDoorId) {
						dropDoor(id || dragDoorId || "", e.clientX, e.clientY);
					} else if (id || dragFamilyId) {
						dropCarcass(id || dragFamilyId || "", e.clientX, e.clientY);
					}
					setDragFamilyId(null);
					setDragDoorId(null);
					setDoorTargetId(null);
				}}
			>
				<PlannerScene
					layout={layout}
					finish={finish}
					selectedIds={selectedSet}
					doorTargetId={doorTargetId}
					onLayoutChangeAction={setLayout}
					onSelectAction={select}
					pickerRef={pickerRef}
					hitTestRef={hitTestRef}
				/>

				<div className="absolute top-4 left-4 rounded-lg bg-white/90 p-3 shadow-sm backdrop-blur">
					<p className="text-neutral-500 text-xs">Estimated price</p>
					<p className="font-semibold text-xl">
						RM{" "}
						{price.totalRm.toLocaleString("en-MY", {
							maximumFractionDigits: 0,
						})}
					</p>
					<p className="text-neutral-500 text-xs">
						{room.label} · {(floorEnd / 1000).toFixed(2)}m run · {placed.length}{" "}
						{placed.length === 1 ? "unit" : "units"}
					</p>
					<p className="mt-1 text-[10px] text-amber-700">
						Indicative only — not a quote
					</p>
				</div>

				{selection.length > 0 && (
					<div className="-translate-x-1/2 absolute bottom-4 left-1/2 flex flex-wrap items-center justify-center gap-3 rounded-full bg-white px-4 py-2 shadow">
						{selected ? (
							<>
								<span className="text-sm">{selected.family.label}</span>
								<SizePicker
									layout={layout}
									id={selected.placed.id}
									onPick={(widthMm) =>
										setLayout((prev) =>
											setWidth(prev, selected.placed.id, widthMm),
										)
									}
								/>
								<span className="text-neutral-500 text-xs">
									{selected.placed.doorStyleId
										? "door on"
										: "carcass only — drag a door on"}
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

				<p className="absolute right-4 bottom-4 hidden max-w-xs text-right text-neutral-500 text-xs lg:block">
					Drag a carcass in, size it, then drag a door onto it. Shift-click to
					pick several.
				</p>
			</section>

			<aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-neutral-200 border-t bg-white p-5 lg:h-full lg:w-96 lg:border-t-0 lg:border-l">
				<div>
					<h1 className="font-semibold text-lg">Plan your room</h1>
					<p className="text-neutral-500 text-sm">
						Pick the room, drop in carcasses, then choose their doors.
					</p>
				</div>

				<div className="flex flex-wrap gap-1">
					{ROOM_TYPES.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => {
								setRoomId(option.id);
								setSelectedIds([]);
							}}
							aria-current={option.id === roomId ? "true" : undefined}
							className={`rounded-full px-3 py-1 text-xs transition ${
								option.id === roomId
									? "bg-neutral-900 text-white"
									: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
							}`}
						>
							{option.label}
						</button>
					))}
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
								onCommit={(mm) => setLayout((prev) => setWallWidth(prev, mm))}
							/>
						</div>
						<span className="pt-4 text-neutral-500 text-xs">
							{(layout.wallWidthMm / 1000).toFixed(2)}m — measure the wall this
							run goes against
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
						onChange={(e) =>
							setLayout((prev) => setWallWidth(prev, Number(e.target.value)))
						}
					/>
					{overhang > 0 && (
						<p className="text-amber-700 text-xs">
							The run overhangs this wall by {overhang}mm — close the gaps
							below, or remove a cabinet.
						</p>
					)}
				</fieldset>

				{room.familyIds.some((id) => family(id)?.kind === "wall") && (
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
					</label>
				)}

				<div className="space-y-2">
					<h2 className="font-medium text-sm">Carcasses</h2>
					<p className="text-neutral-500 text-xs">
						Drop one in, then set its size. Doors come after.
					</p>
					<div className="grid grid-cols-2 gap-2">
						{room.familyIds.map((familyId) => {
							const option = family(familyId);
							if (!option) return null;
							const room2 = fits(layout, familyId);
							return (
								<button
									key={familyId}
									type="button"
									draggable={room2}
									onDragStart={(e) => {
										e.dataTransfer.setData("text/plain", `family:${familyId}`);
										e.dataTransfer.effectAllowed = "copy";
										setDragFamilyId(familyId);
									}}
									onDragEnd={() => setDragFamilyId(null)}
									onClick={() =>
										setLayout((prev) => addModule(prev, familyId, 0))
									}
									disabled={!room2}
									className={`rounded-lg border p-2 text-left transition ${
										room2
											? "cursor-grab border-neutral-200 hover:border-neutral-500 active:cursor-grabbing"
											: "cursor-not-allowed border-neutral-100 opacity-40"
									}`}
								>
									<FamilyThumb family={option} />
									<p className="mt-1 font-medium text-xs">{option.label}</p>
									<p className="text-[10px] text-neutral-500">
										{option.sizes[0].widthMm}–
										{option.sizes[option.sizes.length - 1].widthMm}mm · from RM{" "}
										{option.sizes[0].priceRm}
									</p>
								</button>
							);
						})}
					</div>
				</div>

				<div className="space-y-2">
					<h2 className="font-medium text-sm">Doors</h2>
					<p className="text-neutral-500 text-xs">
						Drag one onto a carcass — or select carcasses and click.
					</p>
					<div className="grid grid-cols-3 gap-2">
						{DOOR_STYLES.map((style) => (
							<button
								key={style.id}
								type="button"
								draggable
								onDragStart={(e) => {
									e.dataTransfer.setData("text/plain", `door:${style.id}`);
									e.dataTransfer.effectAllowed = "copy";
									setDragDoorId(style.id);
								}}
								onDragEnd={() => {
									setDragDoorId(null);
									setDoorTargetId(null);
								}}
								onClick={() => applyDoorToSelection(style.id)}
								className="cursor-grab rounded-lg border border-neutral-200 p-2 text-left transition hover:border-neutral-500 active:cursor-grabbing"
							>
								<DoorThumb style={style} finish={finish} />
								<p className="mt-1 font-medium text-xs">{style.label}</p>
								<p className="text-[10px] text-neutral-500">
									from RM {doorPriceRm(style.id, 400)}
								</p>
							</button>
						))}
					</div>
					{selection.length > 0 && (
						<button
							type="button"
							onClick={() => applyDoorToSelection(null)}
							className="text-neutral-500 text-xs underline hover:text-neutral-900"
						>
							Take the door off the selection
						</button>
					)}
				</div>

				<fieldset className="space-y-2">
					<legend className="font-medium text-sm">Door finish</legend>
					<div className="grid grid-cols-3 gap-2">
						{FINISHES.map((option) => (
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
						One colour for the whole room. Names and colours read from Infinite
						Cabinet's own SketchUp job.
					</p>
				</fieldset>

				<div className="space-y-2">
					<div className="flex items-baseline justify-between gap-2">
						<h2 className="font-medium text-sm">In this room</h2>
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
										className={`flex-1 text-left ${
											isSelected ? "font-medium" : ""
										}`}
									>
										{position.family.label} {position.widthMm}
										<span className="ml-2 text-neutral-500 text-xs">
											{position.placed.doorStyleId ?? "no door"}
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
					{placed.length === 0 && (
						<p className="text-neutral-500 text-xs">
							Nothing placed yet — drag a carcass onto the wall.
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
							onClick={() => {
								setLayout(starterFor(roomId));
								setSelectedIds([]);
							}}
							className="text-neutral-500 text-xs underline hover:text-neutral-900"
						>
							Reset this room
						</button>
					</div>
				</div>

				<div className="space-y-2 rounded-lg border border-neutral-200 p-3">
					<div className="flex items-baseline justify-between">
						<h2 className="font-medium text-sm">Estimated price</h2>
						<span className="font-semibold">RM {rm(price.totalRm)}</span>
					</div>

					{price.categories
						.filter((line) => line.amountRm > 0 || line.label === "Doors")
						.map((line) => (
							<div
								key={line.label}
								className="flex items-baseline justify-between gap-2 text-sm"
							>
								<span className="text-neutral-700">
									{line.label}
									<span className="ml-1 text-neutral-500 text-xs">
										{line.detail}
									</span>
								</span>
								<span className="tabular-nums">{rm(line.amountRm)}</span>
							</div>
						))}

					{price.totalRm === 0 && (
						<p className="text-neutral-500 text-xs">
							Add a carcass to see a price.
						</p>
					)}

					<details className="pt-1">
						<summary className="cursor-pointer text-neutral-500 text-xs">
							Itemised by cabinet
						</summary>
						<ul className="mt-1 space-y-1">
							{price.cabinets.map((line) => (
								<li
									key={line.id}
									className="flex items-baseline justify-between gap-2 text-xs"
								>
									<span className="text-neutral-600">
										{line.label}
										<span className="ml-1 text-neutral-400">{line.detail}</span>
									</span>
									<span className="tabular-nums text-neutral-600">
										{line.amountRm.toFixed(2)}
									</span>
								</li>
							))}
						</ul>
					</details>

					<p className="border-neutral-200 border-t pt-2 text-amber-700 text-xs">
						<strong>Indicative only, not a quote.</strong> Every price here is a
						placeholder for this demo — Infinite Cabinet's own price list has
						not been loaded. Installation, appliances, sinks and taps are not
						included.
					</p>
				</div>

				<p className="text-neutral-500 text-xs">
					Demo. Kitchen module sizes are Infinite Cabinet's own, read from their
					SketchUp job (16mm board, 880mm base carcasses, wall units at 1500mm).
					The other rooms' sizes — and all prices — are ours until they send a
					job file for each.
				</p>
			</aside>
		</main>
	);
}

/** The size dropdown: every rung on the family's ladder, with its price. */
function SizePicker({
	layout,
	id,
	onPick,
}: {
	layout: PlannerLayout;
	id: string;
	onPick: (widthMm: number) => void;
}) {
	const options = widthOptionsFor(layout, id);
	const current = [...layout.floor, ...layout.wall].find(
		(placed) => placed.id === id,
	);

	return (
		<select
			className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
			aria-label="Size"
			value={current?.widthMm ?? ""}
			onChange={(e) => onPick(Number(e.target.value))}
		>
			{options.map((option) => (
				<option
					key={option.widthMm}
					value={option.widthMm}
					// A size the neighbour leaves no room for is offered but not
					// selectable, so the customer can see it exists.
					disabled={!option.fits}
				>
					{option.widthMm}mm — RM {option.priceRm}
					{option.fits ? "" : " (no room)"}
				</option>
			))}
		</select>
	);
}

/** Tiny elevation of a family, drawn from its own proportions. */
function FamilyThumb({ family: option }: { family: Family }) {
	const widest = option.sizes[option.sizes.length - 1].widthMm;
	const ratio = widest / option.heightMm;
	const w = Math.max(18, Math.min(92, 46 * ratio));
	const fronts = option.drawers > 0 ? option.drawers : widest > 650 ? 2 : 1;
	const horizontal = option.drawers > 0;

	return (
		<svg
			viewBox="0 0 100 50"
			className="h-10 w-full text-neutral-400"
			role="img"
			aria-label={`${option.label} elevation`}
		>
			<title>{`${option.label} elevation`}</title>
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
			{Array.from({ length: fronts - 1 }, (_, i) => {
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

/** A door style swatch, in the room's chosen colour. */
function DoorThumb({ style, finish }: { style: DoorStyle; finish: FinishId }) {
	const hex = FINISHES.find((f) => f.id === finish)?.hex ?? "#ffffff";
	return (
		<svg
			viewBox="0 0 60 50"
			className="h-10 w-full"
			role="img"
			aria-label={`${style.label} door`}
		>
			<title>{`${style.label} door`}</title>
			<rect
				x={8}
				y={2}
				width={44}
				height={46}
				fill={hex}
				stroke="#3f3b36"
				strokeWidth={1}
			/>
			{style.look !== "slab" && (
				<rect
					x={15}
					y={9}
					width={30}
					height={32}
					fill={style.look === "glass" ? "#dfe9ec" : hex}
					fillOpacity={style.look === "glass" ? 0.8 : 1}
					stroke="#3f3b36"
					strokeWidth={0.8}
				/>
			)}
		</svg>
	);
}
