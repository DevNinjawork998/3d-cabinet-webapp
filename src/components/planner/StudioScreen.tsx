"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { splitDoorLeaves } from "@/lib/mesh/renderMesh";
import {
	CEILING_LIMITS,
	DOOR_STYLES,
	FINISHES,
	type FinishId,
	family,
	ROOM_DEPTH_LIMITS,
	ROOM_TYPES,
	type RoomTypeId,
	roomType,
	WALL_HANG_LIMITS,
} from "@/lib/planner/catalogue";
import {
	addModule,
	allPositions,
	closeGaps,
	duplicateModule,
	fits,
	flushWallToTallTops,
	freeSpans,
	type HingeSide,
	hangingHeightMmOf,
	minWallWidthMm,
	overhangMm,
	type PlannerLayout,
	type Positioned,
	removeModules,
	rowEndMm,
	setBaseSkirting,
	setCeilingHeight,
	setDoors,
	setHangingHeight,
	setHinge,
	setRoomDepth,
	setWallToCeiling,
	setWallToWall,
	setWallWidth,
	setWidth,
	starterFor,
	WALL_LIMITS,
	widthOptionsFor,
} from "@/lib/planner/layout";
import {
	AXIS_COLOR,
	AXIS_LABEL,
	isAxisSignificant,
	MEASURE_AXES,
	type MeasureAxis,
	measure,
	SNAP_LABEL,
	type SnapPoint,
} from "@/lib/planner/measure";
import { fitOutOf } from "@/lib/planner/parts";
import { computePlannerPrice } from "@/lib/planner/pricing";
import { useCatalogue } from "./CatalogueContext";
import { peekDesignMesh } from "./DesignedCabinet";
import { DimensionField } from "./DimensionField";
import { AdminLink, PlannerHeader } from "./PlannerHeader";
import type { PlannerView } from "./PlannerScene";
import { FamilyThumb } from "./thumbs";

const PlannerScene = dynamic(() => import("./PlannerScene"), {
	ssr: false,
	loading: () => (
		<div className="flex h-full items-center justify-center text-neutral-500 text-sm">
			Loading 3D view…
		</div>
	),
});

/** Labels for the view toggle, in the order a fitter reads them. */
const VIEWS: { id: PlannerView; label: string }[] = [
	{ id: "3d", label: "3D" },
	{ id: "elevation", label: "Elevation" },
	{ id: "plan", label: "Plan" },
];

/** Hung at a set height, or run up to the ceiling. The stored hang height
 *  survives the switch, so this is a mode and not a destructive edit. */
const WALL_MODES: { toCeiling: boolean; label: string }[] = [
	{ toCeiling: false, label: "Hanging" },
	{ toCeiling: true, label: "To ceiling" },
];

/** Kick board over the legs, or the levellers left on show. Most people want
 *  the board; a few like the furniture look of the feet. */
const BASE_MODES: { skirted: boolean; label: string }[] = [
	{ skirted: true, label: "Skirted" },
	{ skirted: false, label: "Legs shown" },
];

/** Built into the alcove, or standing clear of the side walls. */
const RUN_MODES: { toWall: boolean; label: string }[] = [
	{ toWall: false, label: "Open ends" },
	{ toWall: true, label: "To walls" },
];

/** Doors shut, or swung open so the customer can see the inside they are
 *  buying. View state, never on the layout — see `openIds`. */
const DOOR_MODES: { open: boolean; label: string }[] = [
	{ open: false, label: "Doors closed" },
	{ open: true, label: "Doors open" },
];

/** Which stile a lone door hangs on, named the way a fitter says it. */
const HINGE_SIDES: { side: HingeSide; label: string }[] = [
	{ side: "left", label: "Hinge left" },
	{ side: "right", label: "Hinge right" },
];

/**
 * How many leaves this cabinet's front is split into — one gets a hinge choice,
 * a pair does not.
 *
 * Read off the *drawn* geometry wherever there is any. The drafted mesh is the
 * primary path and it disagrees with `fitOutOf` in practice: the client's own
 * base-cabinet family carries `geometry.doorLeaves: 2` learned from one design,
 * so every rung claims a pair, while their drawn 600 and 800 are single doors.
 * Trusting the family there would deny a hinge choice to exactly the cabinets
 * that need one.
 *
 * `peekDesignMesh` is null until the bytes land, and the fallback is then both
 * the right answer and the geometry actually on screen.
 */
const leavesOn = (position: Positioned) => {
	const groups = peekDesignMesh(
		position.family.sizes.find((size) => size.widthMm === position.widthMm)
			?.meshDesignId,
	);
	const door = groups?.find((group) => group.role === "door");
	return door
		? splitDoorLeaves(door).length
		: fitOutOf(position.family, position.widthMm).doorLeaves;
};

const rm = (amount: number) =>
	amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

/** A single W/H/D value, colour-matched to its dashed leg in the 3D overlay
 * (`AXIS_COLOR`) — the pairing a floating in-scene label used to try to make
 * and failed at once the leg got too short on screen to hold text. */
function DimChip({
	axis,
	valueMm,
	maxAxisMm,
}: {
	axis: "x" | "y" | "z";
	valueMm: number;
	/** Largest of the measurement's three axis deltas — a chip only shows if
	 * its own value is significant relative to this, not just nonzero. */
	maxAxisMm: number;
}) {
	// Not a dimension the user meant to read — a width pick shouldn't also
	// report a stray few cm of "depth" from an imprecise click.
	if (!isAxisSignificant(valueMm, maxAxisMm)) return null;

	const letter = axis === "x" ? "W" : axis === "y" ? "H" : "D";
	return (
		<span
			className="rounded px-1.5 py-0.5 font-medium text-[11px] text-white"
			style={{ backgroundColor: AXIS_COLOR[axis] }}
		>
			{letter} {Math.round(valueMm)}
		</span>
	);
}

export function StudioScreen({
	roomId,
	onChangeRoomAction,
	layout,
	setLayoutAction,
	finish,
	finishTextures,
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
	/** Finish id → uploaded decor photo. Passed straight through to the scene. */
	finishTextures: Record<string, string>;
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
	const [view, setView] = useState<PlannerView>("3d");
	// Which cabinets are standing open. Deliberately *not* on the layout: it is
	// not something the customer buys, so it must not ride along in a share link
	// or a quote. One set drives both the global toggle and the per-cabinet
	// button, so the two can never disagree about what is open.
	const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
	const [measureMode, setMeasureMode] = useState(false);
	const [measurePoints, setMeasurePoints] = useState<SnapPoint[]>([]);
	// Which axis the second pick is pulled onto. `auto` infers it from the
	// direction of the pick, which is what turns a roughly-vertical pair of
	// clicks into a clean height instead of three numbers to squint at.
	const [measureAxis, setMeasureAxis] = useState<MeasureAxis>("auto");

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
	// Only a cabinet with a front on it has anything to swing.
	const withDoors = placed.filter(
		(position) => position.placed.doorStyleId !== null,
	);
	const anyOpen = openIds.size > 0;
	const selection = placed.filter((position) =>
		selectedSet.has(position.placed.id),
	);
	const selected: Positioned | undefined =
		selection.length === 1 ? selection[0] : undefined;

	const floorEnd = rowEndMm(layout, "floor");
	const overhang = overhangMm(layout);
	// Usually the run rather than the catalogue floor — worth naming which,
	// because a slider that stops for no visible reason reads as broken.
	const minWallMm = minWallWidthMm(layout);
	const catalogue = useCatalogue();
	const price = computePlannerPrice(layout, finish, catalogue);
	// Named so the customer knows what the extra lines are for. Both are added
	// for them rather than chosen, so the total moving without explanation is
	// the thing to avoid.
	const coverPieces = [
		price.ceilingTrimFt > 0 && "a trim strip capping the run at the ceiling",
		price.skirtingFt > 0 && "a skirting board over the legs",
		price.endPanelCount > 0 &&
			"a finished panel over each cabinet side left in the open",
	].filter((piece): piece is string => typeof piece === "string");

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

	// A third click starts a fresh measurement rather than adding a third
	// point — two points is the whole tool, like a real CAD measuring
	// command: pick, pick, read the result, pick again to start over.
	const onMeasurePick = (snap: SnapPoint) => {
		setMeasurePoints((prev) => (prev.length >= 2 ? [snap] : [...prev, snap]));
	};
	const measurement =
		measurePoints.length === 2
			? measure(measurePoints[0].point, measurePoints[1].point)
			: null;
	const maxMeasuredAxisMm = measurement
		? Math.max(measurement.widthMm, measurement.heightMm, measurement.depthMm)
		: 0;

	return (
		<main className="flex h-screen flex-col bg-[#e9e7e3] text-neutral-900">
			<PlannerHeader
				trail={[
					{ label: "Infinite Cabinet", href: "/" },
					{ label: "Room planner", onClick: onBackToStartAction },
					{ label: "Studio" },
				]}
				center={
					<fieldset
						aria-label="View"
						className="hidden min-w-0 items-center gap-1 rounded-full border-0 bg-neutral-100 p-0.5 lg:flex"
					>
						{VIEWS.map((option) => (
							<button
								key={option.id}
								type="button"
								onClick={() => setView(option.id)}
								aria-pressed={view === option.id}
								className={`rounded-full px-3.5 py-1 text-[13px] transition ${
									view === option.id
										? "bg-white font-medium shadow-sm"
										: "text-neutral-600 hover:text-neutral-900"
								}`}
							>
								{option.label}
							</button>
						))}
					</fieldset>
				}
			>
				<button
					type="button"
					onClick={() => {
						setMeasureMode((on) => !on);
						setMeasurePoints([]);
						// A dimension line taken to a door drawn open is a wrong number
						// shown to a customer: `snapToCabinet` snaps against the closed
						// geometry either way. Shut them rather than measure a lie.
						setOpenIds(new Set());
					}}
					aria-pressed={measureMode}
					title="Click two points on a cabinet — a corner, an edge midpoint, or the surface — to measure between them"
					className={`rounded-full px-3 py-1 text-[12px] transition ${
						measureMode
							? "bg-neutral-900 text-white"
							: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
					}`}
				>
					{measureMode ? "Measuring…" : "Measure"}
				</button>
				<button
					type="button"
					onClick={onBackToStartAction}
					className="text-[13px] text-neutral-500 hover:text-neutral-900"
				>
					Change room
				</button>
				<Link
					href="/tutorials"
					target="_blank"
					className="hidden items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-900 sm:flex"
				>
					{/* A play triangle, drawn rather than installed: this is the only
					    icon on the screen and a library for one glyph is not worth the
					    bytes on the mobile budget. */}
					<svg
						viewBox="0 0 24 24"
						aria-hidden
						className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]"
					>
						<path d="M6 4l14 8-14 8V4z" />
					</svg>
					DIY tutorials
				</Link>
				<AdminLink />
			</PlannerHeader>

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
							<DimensionField
								label="Wall length"
								valueMm={layout.wallWidthMm}
								minMm={minWallMm}
								maxMm={WALL_LIMITS.maxMm}
								stepMm={50}
								onChangeAction={(mm) =>
									setLayoutAction((prev) => setWallWidth(prev, mm))
								}
							/>

							{minWallMm > WALL_LIMITS.minMm &&
								layout.wallWidthMm === minWallMm && (
									<p className="-mt-1 text-[11px] text-neutral-500 leading-4">
										Your {minWallMm}mm run sets the shortest wall it fits on.
										Remove or resize a cabinet to go narrower.
									</p>
								)}

							<DimensionField
								label="Ceiling"
								valueMm={layout.ceilingHeightMm}
								minMm={CEILING_LIMITS.minMm}
								maxMm={CEILING_LIMITS.maxMm}
								stepMm={50}
								onChangeAction={(mm) =>
									setLayoutAction((prev) => setCeilingHeight(prev, mm))
								}
							/>

							<DimensionField
								label="Room depth"
								valueMm={layout.roomDepthMm}
								minMm={ROOM_DEPTH_LIMITS.minMm}
								maxMm={ROOM_DEPTH_LIMITS.maxMm}
								stepMm={50}
								onChangeAction={(mm) =>
									setLayoutAction((prev) => setRoomDepth(prev, mm))
								}
							/>

							{room.familyIds.some((id) => family(id)?.kind === "wall") && (
								<div>
									<fieldset
										aria-label="Wall units"
										className="flex items-center gap-1 rounded-full border-0 bg-neutral-100 p-0.5"
									>
										{WALL_MODES.map((option) => (
											<button
												key={String(option.toCeiling)}
												type="button"
												onClick={() =>
													setLayoutAction((prev) =>
														setWallToCeiling(prev, option.toCeiling),
													)
												}
												aria-pressed={layout.wallToCeiling === option.toCeiling}
												className={`flex-1 rounded-full px-3 py-1 text-[12px] transition ${
													layout.wallToCeiling === option.toCeiling
														? "bg-white font-medium shadow-sm"
														: "text-neutral-600 hover:text-neutral-900"
												}`}
											>
												{option.label}
											</button>
										))}
									</fieldset>

									{layout.wallToCeiling ? (
										<p className="mt-2 text-[11px] text-neutral-500 leading-4">
											Undersides at {hangingHeightMmOf(layout)}mm — the tops run
											to the ceiling, capped by a trim strip.
										</p>
									) : (
										<>
											<div className="mt-2.5">
												<DimensionField
													label="Wall units hang at"
													valueMm={layout.hangingHeightMm}
													minMm={WALL_HANG_LIMITS.minMm}
													maxMm={WALL_HANG_LIMITS.maxMm}
													stepMm={10}
													onChangeAction={(mm) =>
														setLayoutAction((prev) =>
															setHangingHeight(prev, mm),
														)
													}
												/>
											</div>
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
										</>
									)}
								</div>
							)}

							{placed.some((p) => p.family.kind !== "wall") && (
								<div>
									<fieldset
										aria-label="Base units"
										className="flex items-center gap-1 rounded-full border-0 bg-neutral-100 p-0.5"
									>
										{BASE_MODES.map((option) => (
											<button
												key={String(option.skirted)}
												type="button"
												onClick={() =>
													setLayoutAction((prev) =>
														setBaseSkirting(prev, option.skirted),
													)
												}
												aria-pressed={layout.baseSkirting === option.skirted}
												className={`flex-1 rounded-full px-3 py-1 text-[12px] transition ${
													layout.baseSkirting === option.skirted
														? "bg-white font-medium shadow-sm"
														: "text-neutral-600 hover:text-neutral-900"
												}`}
											>
												{option.label}
											</button>
										))}
									</fieldset>

									<p className="mt-2 text-[11px] text-neutral-500 leading-4">
										{layout.baseSkirting
											? "A kick board runs along the floor, hiding the levellers."
											: "The adjustable levellers stay on show under the run."}
									</p>
								</div>
							)}

							{placed.length > 0 && (
								<div>
									<fieldset
										aria-label="Run"
										className="flex items-center gap-1 rounded-full border-0 bg-neutral-100 p-0.5"
									>
										{RUN_MODES.map((option) => (
											<button
												key={String(option.toWall)}
												type="button"
												onClick={() =>
													setLayoutAction((prev) =>
														setWallToWall(prev, option.toWall),
													)
												}
												aria-pressed={layout.wallToWall === option.toWall}
												className={`flex-1 rounded-full px-3 py-1 text-[12px] transition ${
													layout.wallToWall === option.toWall
														? "bg-white font-medium shadow-sm"
														: "text-neutral-600 hover:text-neutral-900"
												}`}
											>
												{option.label}
											</button>
										))}
									</fieldset>

									<p className="mt-2 text-[11px] text-neutral-500 leading-4">
										{layout.wallToWall
											? "An end that butts into a side wall needs no finished panel."
											: "Each open end is finished with a panel over the carcass side."}
									</p>
								</div>
							)}

							{withDoors.length > 0 && (
								<div>
									<fieldset
										aria-label="Doors"
										className="flex items-center gap-1 rounded-full border-0 bg-neutral-100 p-0.5"
									>
										{DOOR_MODES.map((option) => (
											<button
												key={String(option.open)}
												type="button"
												onClick={() =>
													setOpenIds(
														option.open
															? new Set(withDoors.map((p) => p.placed.id))
															: new Set(),
													)
												}
												aria-pressed={anyOpen === option.open}
												className={`flex-1 rounded-full px-3 py-1 text-[12px] transition ${
													anyOpen === option.open
														? "bg-white font-medium shadow-sm"
														: "text-neutral-600 hover:text-neutral-900"
												}`}
											>
												{option.label}
											</button>
										))}
									</fieldset>

									<p className="mt-2 text-[11px] text-neutral-500 leading-4">
										{anyOpen
											? "Shelves and interiors are on show. Measuring closes them again."
											: "Open the doors to see the inside of the run."}
									</p>
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
						finishTextures={finishTextures}
						selectedIds={selectedSet}
						openIds={openIds}
						doorTargetId={null}
						measureMode={measureMode}
						measurePoints={measurePoints}
						measureAxis={measureAxis}
						view={view}
						onLayoutChangeAction={setLayoutAction}
						onSelectAction={select}
						onMeasurePickAction={onMeasurePick}
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

					{measureMode && (
						<div className="absolute top-3.5 right-3.5 flex flex-col items-end gap-1.5 rounded-lg bg-white/92 px-2.5 py-2 shadow-sm backdrop-blur">
							<fieldset className="flex items-center gap-0.5">
								<legend className="sr-only">Constrain the measurement</legend>
								{MEASURE_AXES.map((axis) => (
									<button
										key={axis}
										type="button"
										onClick={() => setMeasureAxis(axis)}
										aria-pressed={measureAxis === axis}
										className={`rounded px-1.5 py-0.5 text-[11px] transition ${
											measureAxis === axis
												? "bg-neutral-900 text-white"
												: "text-neutral-500 hover:bg-neutral-100"
										}`}
									>
										{AXIS_LABEL[axis]}
									</button>
								))}
							</fieldset>

							<div className="flex items-center gap-2">
								{measurement ? (
									<span className="flex items-center gap-2 text-[12px] text-neutral-800">
										<span>{Math.round(measurement.distanceMm)}mm</span>
										<DimChip
											axis="x"
											valueMm={measurement.widthMm}
											maxAxisMm={maxMeasuredAxisMm}
										/>
										<DimChip
											axis="y"
											valueMm={measurement.heightMm}
											maxAxisMm={maxMeasuredAxisMm}
										/>
										<DimChip
											axis="z"
											valueMm={measurement.depthMm}
											maxAxisMm={maxMeasuredAxisMm}
										/>
									</span>
								) : (
									<span className="text-[12px] text-neutral-500">
										{measurePoints.length === 0
											? "Click a point to start measuring"
											: "Click a second point"}
									</span>
								)}
								{measurePoints.length > 0 && (
									<button
										type="button"
										onClick={() => setMeasurePoints([])}
										className="text-[12px] text-[#2b6cb0] hover:underline"
									>
										Clear
									</button>
								)}
							</div>

							{/* What each end actually landed on. The glyph in the scene
							    says the same thing, but a marker seen edge-on is easy to
							    misread and a wrong snap is a wrong number. */}
							{measurePoints.length > 0 && (
								<p className="text-[11px] text-neutral-400">
									{measurePoints
										.map((snap) => SNAP_LABEL[snap.kind])
										.join(" → ")}
								</p>
							)}
						</div>
					)}

					<p className="absolute right-3.5 bottom-3.5 hidden max-w-[260px] text-right text-[12px] text-[#8a8580] leading-4 lg:block">
						{measureMode
							? "Click two points on a cabinet — a corner, an edge midpoint or the surface. Auto locks the second point to the axis you are measuring along; Free reads all three at once."
							: "Click a cabinet to change its size or front. Drag it along the wall to move it."}
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

									{selected.placed.doorStyleId && (
										<div>
											<p className="mb-1.5 font-medium text-[11px] text-neutral-600">
												Swing
											</p>
											<div className="flex flex-wrap gap-1.5">
												<button
													type="button"
													onClick={() =>
														setOpenIds((prev) => {
															const next = new Set(prev);
															if (!next.delete(selected.placed.id)) {
																next.add(selected.placed.id);
															}
															return next;
														})
													}
													aria-pressed={openIds.has(selected.placed.id)}
													className={`rounded-md px-2.5 py-1 text-[12px] transition ${
														openIds.has(selected.placed.id)
															? "bg-neutral-900 font-medium text-white"
															: "bg-white text-neutral-700 shadow-[inset_0_0_0_1px_#d4d4d4] hover:shadow-[inset_0_0_0_1px_#a3a3a3]"
													}`}
												>
													{openIds.has(selected.placed.id)
														? "Close door"
														: "Open door"}
												</button>

												{/* Only a lone leaf gets a choice: a pair always hinges
											    outward from the middle, which is the only way a pair
											    is hung. */}
												{leavesOn(selected) === 1 &&
													HINGE_SIDES.map((option) => (
														<button
															key={option.side}
															type="button"
															onClick={() =>
																setLayoutAction((prev) =>
																	setHinge(
																		prev,
																		selected.placed.id,
																		option.side,
																	),
																)
															}
															aria-pressed={
																selected.placed.hinge === option.side
															}
															className={`rounded-md px-2.5 py-1 text-[12px] transition ${
																selected.placed.hinge === option.side
																	? "bg-neutral-900 font-medium text-white"
																	: "bg-white text-neutral-700 shadow-[inset_0_0_0_1px_#d4d4d4] hover:shadow-[inset_0_0_0_1px_#a3a3a3]"
															}`}
														>
															{option.label}
														</button>
													))}
											</div>
										</div>
									)}
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
						<ul className="flex flex-col gap-1">
							{price.categories.map((line) => (
								<li
									key={line.label}
									className="flex items-baseline justify-between gap-2 text-[12px]"
								>
									<span className="min-w-0 text-neutral-600">
										{line.label}{" "}
										<span className="text-[11px] text-neutral-400">
											{line.detail}
										</span>
									</span>
									<span className="shrink-0 tabular-nums">
										{rm(line.amountRm)}
									</span>
								</li>
							))}
						</ul>

						{coverPieces.length > 0 && (
							<p className="text-[11px] text-neutral-500 leading-4">
								{coverPieces.join(" and ")}{" "}
								{coverPieces.length === 1 ? "is" : "are"} included above.
							</p>
						)}

						<div className="flex items-baseline justify-between border-neutral-200 border-t pt-2.5">
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
