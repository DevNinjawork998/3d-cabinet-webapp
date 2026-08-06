/** The customer's space. Not part of the design document — the wardrobe is
 * priced off its own opening, the room is only what it stands in. */
export type RoomSize = {
	widthMm: number;
	depthMm: number;
	heightMm: number;
};

export const ROOM_LIMITS = {
	minWidthMm: 1000,
	maxWidthMm: 12000,
	minDepthMm: 1000,
	maxDepthMm: 12000,
	minHeightMm: 2200,
	maxHeightMm: 3600,
} as const;

export const DEFAULT_ROOM: RoomSize = {
	widthMm: 4400,
	depthMm: 3200,
	heightMm: 2700,
};

/** A wardrobe can never be wider than the wall it stands against. */
export function maxRunWidthMm(room: RoomSize): number {
	return room.widthMm;
}
