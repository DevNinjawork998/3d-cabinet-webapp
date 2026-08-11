import { RoomFields } from "@/components/viewer/RoomFields";
import { OPENING_CONSTRAINTS } from "@/lib/wardrobe/catalogue";
import { resizeOpening, roomLimits } from "@/lib/wardrobe/edits";
import type { StepProps } from "./Stepper";

export function StepMeasure({ design, room, onDesign, onRoom }: StepProps) {
	const { maxWidthMm, maxHeightMm } = roomLimits(room);
	const { width, height } = design.opening;

	return (
		<>
			<div className="space-y-2">
				<h2 className="font-medium text-sm">Your room</h2>
				<RoomFields room={room} onChange={onRoom} />
				<p className="text-neutral-500 text-xs">
					You can also drag these on the floor plan.
				</p>
			</div>

			<label className="block space-y-2">
				<span className="font-medium text-sm">
					Opening width — {Math.round(width)}mm
					{width >= maxWidthMm && (
						<span className="ml-1 font-normal text-neutral-500 text-xs">
							(as wide as the wall allows)
						</span>
					)}
				</span>
				<input
					type="range"
					className="w-full"
					min={OPENING_CONSTRAINTS.minTotalWidthMm}
					max={maxWidthMm}
					step={50}
					value={Math.min(width, maxWidthMm)}
					onChange={(e) =>
						onDesign(resizeOpening(design, { widthMm: Number(e.target.value) }))
					}
				/>
			</label>

			<label className="block space-y-2">
				<span className="font-medium text-sm">
					Height — {Math.round(height)}mm
					{height >= maxHeightMm && (
						<span className="ml-1 font-normal text-neutral-500 text-xs">
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
					value={Math.min(height, maxHeightMm)}
					onChange={(e) =>
						onDesign(
							resizeOpening(design, { heightMm: Number(e.target.value) }),
						)
					}
				/>
			</label>

			<p className="text-neutral-500 text-xs">
				Depth is {design.opening.depth}mm — the standard carcass.
			</p>
		</>
	);
}
