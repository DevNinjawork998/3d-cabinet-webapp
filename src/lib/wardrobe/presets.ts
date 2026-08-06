import { splitIntoBays } from "./rules";
import type { DesignDocument, DoorTypeId, FinishId } from "./schema";

export const DEFAULT_HEIGHT_MM = 2400;
export const DEFAULT_DEPTH_MM = 600;
export const DEFAULT_CEILING_MM = 2700;

export type DesignOptions = {
	widthMm: number;
	finish: FinishId;
	doorType: DoorTypeId;
};

/** Single place both the scene and the catalogue cards build a design from. */
export function buildDesign({
	widthMm,
	finish,
	doorType,
}: DesignOptions): DesignDocument {
	const bays = splitIntoBays(widthMm).map((bay) => ({
		...bay,
		id: `bay-${bay.order + 1}`,
	}));

	return {
		schemaVersion: 1,
		opening: {
			width: widthMm,
			height: DEFAULT_HEIGHT_MM,
			depth: DEFAULT_DEPTH_MM,
			ceilingHeight: DEFAULT_CEILING_MM,
		},
		bays,
		interiors: bays.map((bay) => ({
			bayId: bay.id,
			items: [
				{ kind: "shelf" as const, heightFromFloor: 1850 },
				{ kind: "rail" as const, heightFromFloor: 1750 },
				{ kind: "drawer" as const, heightFromFloor: 60, count: 2 },
			],
			accessories: ["soft-close-hinge" as const],
		})),
		doors: bays.map((bay) => ({
			bayId: bay.id,
			type: doorType,
			finish,
			handle: "profile" as const,
		})),
	};
}

// ponytail: plain const until presets need their own SEO routes, then this
// becomes the route manifest rather than a second source of truth.
export const PRESETS: Array<DesignOptions & { id: string; label: string }> = [
	{
		id: "compact-2-door",
		label: "Compact 2-door",
		widthMm: 1800,
		finish: "laminate-standard",
		doorType: "hinged",
	},
	{
		id: "classic-2-door",
		label: "Classic 2-door",
		widthMm: 2400,
		finish: "laminate-premium",
		doorType: "hinged",
	},
	{
		id: "sliding-3-door",
		label: "Sliding 3-door",
		widthMm: 3000,
		finish: "laminate-premium",
		doorType: "sliding",
	},
	{
		id: "veneer-sliding",
		label: "Veneer sliding",
		widthMm: 3600,
		finish: "veneer",
		doorType: "sliding",
	},
	{
		id: "wide-4-door",
		label: "Wide 4-door",
		widthMm: 4200,
		finish: "laminate-standard",
		doorType: "hinged",
	},
	{
		id: "full-wall",
		label: "Full wall",
		widthMm: 4800,
		finish: "veneer",
		doorType: "sliding",
	},
];
