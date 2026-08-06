"use client";

import { Html } from "@react-three/drei";
import { ROOM_LIMITS, type RoomSize } from "@/lib/wardrobe/room";
import { DimInput } from "./RoomFields";

/** Editable dimension labels pinned to the floor edges, like a plan view. */
export function RoomDimensions({
	room,
	onChange,
}: {
	room: RoomSize;
	onChange: (next: Partial<RoomSize>) => void;
}) {
	const width = room.widthMm / 1000;
	const depth = room.depthMm / 1000;

	return (
		<>
			<Html position={[0, 0, depth / 2 + 0.25]} center distanceFactor={7}>
				<div className="w-24">
					<DimInput
						label="Room width"
						value={room.widthMm}
						min={ROOM_LIMITS.minWidthMm}
						max={ROOM_LIMITS.maxWidthMm}
						onCommit={(widthMm) => onChange({ widthMm })}
					/>
				</div>
			</Html>

			<Html position={[width / 2 + 0.25, 0, 0]} center distanceFactor={7}>
				<div className="w-24">
					<DimInput
						label="Room depth"
						value={room.depthMm}
						min={ROOM_LIMITS.minDepthMm}
						max={ROOM_LIMITS.maxDepthMm}
						onCommit={(depthMm) => onChange({ depthMm })}
					/>
				</div>
			</Html>

			<Html
				position={[-width / 2 - 0.25, room.heightMm / 2000, -depth / 2]}
				center
				distanceFactor={7}
			>
				<div className="w-24">
					<DimInput
						label="Ceiling height"
						value={room.heightMm}
						min={ROOM_LIMITS.minHeightMm}
						max={ROOM_LIMITS.maxHeightMm}
						onCommit={(heightMm) => onChange({ heightMm })}
					/>
				</div>
			</Html>
		</>
	);
}
