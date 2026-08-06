"use client";

import { ROOM_LIMITS, type RoomSize } from "@/lib/wardrobe/room";

export function DimInput({
	value,
	onCommit,
	min,
	max,
	label,
	showLabel = false,
}: {
	value: number;
	onCommit: (mm: number) => void;
	min: number;
	max: number;
	label: string;
	showLabel?: boolean;
}) {
	return (
		<label className="block">
			{showLabel ? (
				<span className="mb-1 block text-neutral-500 text-xs">{label}</span>
			) : (
				<span className="sr-only">{label}</span>
			)}
			<span className="flex cursor-text items-center gap-1 rounded border border-neutral-300 bg-white/95 px-2 py-1 shadow-sm">
				<input
					type="number"
					className="w-full min-w-0 bg-transparent text-right text-neutral-900 text-xs tabular-nums outline-none"
					value={value}
					min={min}
					max={max}
					step={50}
					onChange={(e) => {
						const next = Number(e.target.value);
						if (Number.isFinite(next)) {
							onCommit(Math.min(max, Math.max(min, next)));
						}
					}}
				/>
				<span className="text-neutral-500 text-xs">mm</span>
			</span>
		</label>
	);
}

/** The three room fields, for the side panel. */
export function RoomFields({
	room,
	onChange,
}: {
	room: RoomSize;
	onChange: (next: Partial<RoomSize>) => void;
}) {
	return (
		<div className="grid grid-cols-3 gap-2">
			<DimInput
				showLabel
				label="Width"
				value={room.widthMm}
				min={ROOM_LIMITS.minWidthMm}
				max={ROOM_LIMITS.maxWidthMm}
				onCommit={(widthMm) => onChange({ widthMm })}
			/>
			<DimInput
				showLabel
				label="Depth"
				value={room.depthMm}
				min={ROOM_LIMITS.minDepthMm}
				max={ROOM_LIMITS.maxDepthMm}
				onCommit={(depthMm) => onChange({ depthMm })}
			/>
			<DimInput
				showLabel
				label="Ceiling"
				value={room.heightMm}
				min={ROOM_LIMITS.minHeightMm}
				max={ROOM_LIMITS.maxHeightMm}
				onCommit={(heightMm) => onChange({ heightMm })}
			/>
		</div>
	);
}
