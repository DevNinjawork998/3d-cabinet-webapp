"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { RoomFields } from "@/components/viewer/RoomFields";
import {
	DOOR_TYPES,
	FINISHES,
	OPENING_CONSTRAINTS,
} from "@/lib/wardrobe/catalogue";
import {
	buildDesign,
	DEFAULT_DEPTH_MM,
	type DesignOptions,
	PRESETS,
} from "@/lib/wardrobe/presets";
import { computePrice } from "@/lib/wardrobe/pricing";
import {
	DEFAULT_ROOM,
	maxRunWidthMm,
	type RoomSize,
} from "@/lib/wardrobe/room";
import { validateDesign } from "@/lib/wardrobe/rules";
import {
	DOOR_TYPE_IDS,
	type DoorTypeId,
	FINISH_IDS,
} from "@/lib/wardrobe/schema";

const Scene = dynamic(() => import("@/components/viewer/Scene"), {
	ssr: false,
	loading: () => (
		<div className="flex h-full items-center justify-center text-sm text-neutral-500">
			Loading 3D view…
		</div>
	),
});

/** Finish ids bucketed by their catalogue group, for the swatch picker. */
const FINISH_GROUPS = (["Laminate", "Veneer"] as const).map(
	(group) =>
		[group, FINISH_IDS.filter((id) => FINISHES[id].group === group)] as const,
);

/** Flat elevation of the run — cheap stand-in for a rendered thumbnail. */
function Elevation({ bays, doorType }: { bays: number; doorType: DoorTypeId }) {
	const gap = 1.5;
	const bayW = (100 - gap * (bays + 1)) / bays;
	return (
		<svg
			viewBox="0 0 100 70"
			className="h-20 w-full text-neutral-400"
			role="img"
			aria-label={`${bays}-door elevation`}
		>
			<title>{`${bays}-door elevation`}</title>
			<rect
				x="0.5"
				y="0.5"
				width="99"
				height="69"
				fill="none"
				stroke="currentColor"
			/>
			{Array.from({ length: bays }, (_, i) => {
				const x = gap + i * (bayW + gap);
				return (
					<g key={x}>
						<rect
							x={x}
							y={gap}
							width={bayW}
							height={70 - gap * 2}
							fill="currentColor"
							fillOpacity={0.12}
							stroke="currentColor"
							strokeWidth={0.7}
						/>
						{doorType === "sliding" ? (
							<line
								x1={x + bayW / 2}
								y1={gap}
								x2={x + bayW / 2}
								y2={70 - gap}
								stroke="currentColor"
								strokeWidth={0.4}
								strokeDasharray="2 2"
							/>
						) : (
							<circle cx={x + bayW - 3} cy={35} r={1.2} fill="currentColor" />
						)}
					</g>
				);
			})}
		</svg>
	);
}

export default function ViewerPage() {
	const [options, setOptions] = useState<DesignOptions>({
		widthMm: 2400,
		heightMm: 2400,
		finish: "laminate-oak",
		doorType: "hinged",
	});
	const [doorsVisible, setDoorsVisible] = useState(true);
	const [room, setRoom] = useState<RoomSize>(DEFAULT_ROOM);
	const [roomOpen, setRoomOpen] = useState(false);

	const updateRoom = (next: Partial<RoomSize>) =>
		setRoom((prev) => ({ ...prev, ...next }));

	// The run can never be wider than the wall it stands against.
	const maxWidthMm = Math.min(
		OPENING_CONSTRAINTS.maxTotalWidthMm,
		maxRunWidthMm(room),
	);
	const widthMm = Math.min(options.widthMm, maxWidthMm);

	// The unit has to fit under the ceiling with clearance to install it.
	const maxHeightMm = Math.min(
		OPENING_CONSTRAINTS.maxHeightMm,
		room.heightMm - OPENING_CONSTRAINTS.ceilingClearanceMm,
	);
	const heightMm = Math.min(options.heightMm, maxHeightMm);

	const design = useMemo(
		() => buildDesign({ ...options, widthMm, heightMm }, room.heightMm),
		[options, widthMm, heightMm, room.heightMm],
	);
	const validation = useMemo(() => validateDesign(design), [design]);
	const price = useMemo(() => computePrice(design), [design]);

	const set = <K extends keyof DesignOptions>(
		key: K,
		value: DesignOptions[K],
	) => setOptions((prev) => ({ ...prev, [key]: value }));

	return (
		<main className="flex h-screen flex-col bg-neutral-100 text-neutral-900 lg:flex-row">
			{/* min-w-0/min-h-0: without them the canvas sizes its own flex parent
			    and the two grow off each other every frame. */}
			<section className="relative h-[55vh] w-full min-w-0 overflow-hidden lg:h-screen lg:flex-1">
				<Scene
					design={design}
					room={room}
					doorsVisible={doorsVisible}
					showDimensions={roomOpen}
					onRoomChangeAction={updateRoom}
				/>

				<div className="absolute left-4 top-4 rounded-lg bg-white/90 p-3 shadow-sm backdrop-blur">
					<p className="text-xs text-neutral-500">Indicative price</p>
					<p className="text-xl font-semibold">RM {price.totalRm.toFixed(2)}</p>
				</div>

				<button
					type="button"
					className="absolute bottom-4 left-4 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow"
					onClick={() => setDoorsVisible((visible) => !visible)}
				>
					{doorsVisible ? "Hide doors" : "Show doors"}
				</button>
			</section>

			<aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-neutral-200 border-t bg-white p-5 lg:h-full lg:w-96 lg:border-t-0 lg:border-l">
				<div>
					<h1 className="text-lg font-semibold">Wardrobes</h1>
					<p className="text-sm text-neutral-500">
						{PRESETS.length} designs — pick one, then adjust it.
					</p>
				</div>

				<div className="rounded-lg border border-neutral-200">
					<button
						type="button"
						className="flex w-full items-center justify-between p-3 text-left"
						onClick={() => setRoomOpen((open) => !open)}
						aria-expanded={roomOpen}
					>
						<span className="font-medium text-sm">
							{roomOpen ? "Done" : "Customise room"}
						</span>
						<span className="text-neutral-500 text-xs">
							{room.widthMm} × {room.depthMm} × {room.heightMm} mm
						</span>
					</button>
					{roomOpen && (
						<div className="border-neutral-200 border-t p-3">
							<RoomFields room={room} onChange={updateRoom} />
							<p className="mt-2 text-neutral-500 text-xs">
								You can also edit these on the floor plan.
							</p>
						</div>
					)}
				</div>

				<div className="grid grid-cols-2 gap-3">
					{PRESETS.map((preset) => {
						const presetDesign = buildDesign(preset);
						const presetPrice = computePrice(presetDesign);
						const selected =
							preset.widthMm === options.widthMm &&
							preset.heightMm === options.heightMm &&
							preset.finish === options.finish &&
							preset.doorType === options.doorType;

						return (
							<button
								key={preset.id}
								type="button"
								onClick={() => setOptions(preset)}
								className={`rounded-lg border p-2 text-left transition ${
									selected
										? "border-neutral-900 bg-neutral-50"
										: "border-neutral-200 hover:border-neutral-400"
								}`}
							>
								<Elevation
									bays={presetDesign.bays.length}
									doorType={preset.doorType}
								/>
								<p className="mt-2 font-medium text-sm">{preset.label}</p>
								<p className="text-neutral-500 text-xs">
									{FINISHES[preset.finish].label}, {preset.widthMm}×
									{preset.heightMm}×{DEFAULT_DEPTH_MM} mm
								</p>
								<p className="mt-1 text-sm">
									<span className="text-neutral-500 text-xs">RM </span>
									<span className="font-semibold">
										{presetPrice.totalRm.toFixed(0)}
									</span>
								</p>
							</button>
						);
					})}
				</div>

				<hr className="border-neutral-200" />

				<label className="block space-y-2">
					<span className="font-medium text-sm">
						Opening width — {widthMm}mm ({design.bays.length}{" "}
						{design.bays.length === 1 ? "bay" : "bays"})
					</span>
					<input
						type="range"
						className="w-full"
						min={OPENING_CONSTRAINTS.minTotalWidthMm}
						max={maxWidthMm}
						step={50}
						value={widthMm}
						onChange={(e) => set("widthMm", Number(e.target.value))}
					/>
				</label>

				<label className="block space-y-2">
					<span className="font-medium text-sm">
						Height — {heightMm}mm
						{heightMm === maxHeightMm && (
							<span className="ml-1 text-neutral-500 text-xs">
								(max under a {room.heightMm}mm ceiling)
							</span>
						)}
					</span>
					<input
						type="range"
						className="w-full"
						min={OPENING_CONSTRAINTS.minHeightMm}
						max={maxHeightMm}
						step={50}
						value={heightMm}
						onChange={(e) => set("heightMm", Number(e.target.value))}
					/>
				</label>

				<fieldset className="space-y-2">
					<legend className="font-medium text-sm">
						Finish — {FINISHES[options.finish].label}
						<span className="ml-1 font-normal text-neutral-500 text-xs">
							{FINISHES[options.finish].group}
						</span>
					</legend>
					{FINISH_GROUPS.map(([group, ids]) => (
						<div key={group}>
							<p className="mb-1 text-neutral-500 text-xs">{group}</p>
							<div className="grid grid-cols-4 gap-2">
								{ids.map((id) => {
									const finish = FINISHES[id];
									const selected = id === options.finish;
									return (
										<button
											key={id}
											type="button"
											onClick={() => set("finish", id)}
											aria-pressed={selected}
											title={`${finish.label} — ${
												finish.surchargeRmPerFt === 0
													? "included"
													: `+RM ${finish.surchargeRmPerFt}/ft`
											}`}
											className={`rounded-md border p-1 text-center ${
												selected
													? "border-neutral-900 ring-1 ring-neutral-900"
													: "border-neutral-200 hover:border-neutral-400"
											}`}
										>
											<span
												className="block h-9 w-full rounded"
												style={{ backgroundColor: finish.swatch }}
											/>
											<span className="mt-1 block truncate text-[11px] leading-tight">
												{finish.label}
											</span>
											<span className="block text-[10px] text-neutral-500">
												{finish.surchargeRmPerFt === 0
													? "included"
													: `+${finish.surchargeRmPerFt}/ft`}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					))}
				</fieldset>

				<label className="block space-y-2">
					<span className="font-medium text-sm">Door type</span>
					<select
						className="w-full rounded border border-neutral-300 bg-white p-2 text-sm"
						value={options.doorType}
						onChange={(e) => set("doorType", e.target.value as DoorTypeId)}
					>
						{DOOR_TYPE_IDS.map((id) => (
							<option key={id} value={id}>
								{DOOR_TYPES[id].label}
							</option>
						))}
					</select>
				</label>

				{!validation.valid && (
					<ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
						{validation.issues.map((issue) => (
							<li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
						))}
					</ul>
				)}
			</aside>
		</main>
	);
}
