"use client";

import { fill } from "@/lib/copy/fill";
import {
	CEILING_LIMITS,
	ROOM_DEPTH_LIMITS,
	type RoomTypeId,
} from "@/lib/planner/catalogue";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";
import { type PlannerLayout, WALL_LIMITS } from "@/lib/planner/layout";
import { useCopy } from "../CopyContext";
import { DimensionField } from "../DimensionField";
import { chip } from "./chrome";

/**
 * The room column: which room, how big, and whether the run fits in it.
 *
 * Everything else that used to live here — the base, run, wall-unit and door
 * modes — is behind the Defaults panel now. What is left is the one question
 * this column exists to answer, which is what the cabinets have to fit inside.
 */
export function RoomPanel({
	catalogue,
	roomId,
	layout,
	minWallMm,
	freeMm,
	overhangMm,
	onChangeRoomAction,
	onWallWidthAction,
	onCeilingAction,
	onDepthAction,
	onOpenDefaultsAction,
}: {
	catalogue: PlannerCatalogue;
	roomId: RoomTypeId;
	layout: PlannerLayout;
	/** The shortest wall the placed run fits on — the slider's real floor. */
	minWallMm: number;
	/** Wall left over, negative when the run is longer than the wall. */
	freeMm: number;
	overhangMm: number;
	onChangeRoomAction: (id: RoomTypeId) => void;
	onWallWidthAction: (mm: number) => void;
	onCeilingAction: (mm: number) => void;
	onDepthAction: (mm: number) => void;
	onOpenDefaultsAction: () => void;
}) {
	const t = useCopy();

	return (
		<aside
			aria-label={t.planner.room.heading}
			className="flex w-full shrink-0 flex-col gap-3.5 overflow-y-auto border-neutral-200 border-b bg-white p-4 lg:h-full lg:w-[236px] lg:border-r lg:border-b-0"
		>
			<div>
				<h2 className="font-semibold text-[11px] text-neutral-600 uppercase tracking-[0.06em]">
					{t.planner.room.heading}
				</h2>
				<p className="mt-[3px] text-[12px] text-neutral-500 leading-4">
					{t.planner.room.subtitle}
				</p>
			</div>

			<div className="flex flex-wrap gap-1">
				{catalogue.roomTypes.map((option) => (
					<button
						key={option.id}
						type="button"
						onClick={() => onChangeRoomAction(option.id)}
						aria-pressed={option.id === roomId}
						className={chip(option.id === roomId)}
					>
						{option.label}
					</button>
				))}
			</div>

			<DimensionField
				label={t.planner.room.wallLength}
				valueMm={layout.wallWidthMm}
				minMm={minWallMm}
				maxMm={WALL_LIMITS.maxMm}
				stepMm={50}
				onChangeAction={onWallWidthAction}
			/>
			{minWallMm > WALL_LIMITS.minMm && layout.wallWidthMm === minWallMm && (
				<p className="-mt-1 text-[11px] text-neutral-500 leading-4">
					{fill(t.planner.room.narrowWallNote, { min: minWallMm })}
				</p>
			)}

			<DimensionField
				label={t.planner.room.ceiling}
				valueMm={layout.ceilingHeightMm}
				minMm={CEILING_LIMITS.minMm}
				maxMm={CEILING_LIMITS.maxMm}
				stepMm={50}
				onChangeAction={onCeilingAction}
			/>

			<DimensionField
				label={t.planner.room.roomDepth}
				valueMm={layout.roomDepthMm}
				minMm={ROOM_DEPTH_LIMITS.minMm}
				maxMm={ROOM_DEPTH_LIMITS.maxMm}
				stepMm={50}
				onChangeAction={onDepthAction}
			/>

			<div className="mt-0.5 flex flex-col gap-1.5 border-[#f0efec] border-t pt-3">
				<p className="text-[12px] text-neutral-500 leading-[17px]">
					{/* Rounded here, not upstream: `freeMm` is a subtraction of two
					    derived figures and arrives with a float's tail on it — the
					    panel read "3043.156625058453 mm of wall still free". A
					    millimetre is the smallest thing this room is specified in, so
					    anything past the point is noise whatever the arithmetic says. */}
					{freeMm < 0
						? fill(t.planner.room.fitOver, { mm: Math.round(-freeMm) })
						: fill(t.planner.room.fitFree, { mm: Math.round(freeMm) })}
				</p>

				{/* The run overhanging the wall and the run being longer than the
				    wall are two different sentences: one is about the cabinets
				    hanging past the end, the other about the wall being too short
				    to hold them. */}
				{overhangMm > 0 && (
					<p className="text-[11px] text-amber-700 leading-4">
						{fill(t.planner.room.overhangWarning, { overhang: overhangMm })}
					</p>
				)}

				<button
					type="button"
					onClick={onOpenDefaultsAction}
					className="min-h-9 self-start rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[12px] text-neutral-700 hover:bg-[#faf9f7] hover:text-neutral-900"
				>
					{t.planner.room.moreSettings}
				</button>
			</div>
		</aside>
	);
}
