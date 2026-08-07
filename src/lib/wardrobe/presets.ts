import { splitIntoBays } from "./rules";
import type {
	DesignDocument,
	DoorTypeId,
	FinishId,
	InteriorItem,
} from "./schema";

export const DEFAULT_HEIGHT_MM = 2400;
export const DEFAULT_DEPTH_MM = 600;
export const DEFAULT_CEILING_MM = 2700;

export type DesignOptions = {
	widthMm: number;
	heightMm: number;
	finish: FinishId;
	doorType: DoorTypeId;
};

const TOP_SHELF_DROP_MM = 550;
const RAIL_DROP_MM = 650;
const DRAWER_BASE_MM = 60;

/**
 * Default fit-out for a bay, positioned relative to the carcass height so a
 * short unit doesn't leave its shelf and rail hanging outside the box.
 */
function defaultItems(heightMm: number) {
	const items: InteriorItem[] = [
		{ kind: "shelf", heightFromFloor: heightMm - TOP_SHELF_DROP_MM },
		{ kind: "rail", heightFromFloor: heightMm - RAIL_DROP_MM },
	];
	// Two drawers need roughly 400mm; below that the hanging space is worth
	// more to the customer than the drawers.
	if (heightMm - RAIL_DROP_MM > 900) {
		items.push({ kind: "drawer", heightFromFloor: DRAWER_BASE_MM, count: 2 });
	}
	return items;
}

/** Single place both the scene and the catalogue cards build a design from. */
export function buildDesign(
	{ widthMm, heightMm, finish, doorType }: DesignOptions,
	ceilingHeightMm: number = DEFAULT_CEILING_MM,
): DesignDocument {
	const bays = splitIntoBays(widthMm).map((bay) => ({
		...bay,
		id: `bay-${bay.order + 1}`,
	}));

	return {
		schemaVersion: 1,
		opening: {
			width: widthMm,
			height: heightMm,
			depth: DEFAULT_DEPTH_MM,
			ceilingHeight: ceilingHeightMm,
		},
		bays,
		interiors: bays.map((bay) => ({
			bayId: bay.id,
			items: defaultItems(heightMm),
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
		heightMm: 2100,
		finish: "laminate-white",
		doorType: "hinged",
	},
	{
		id: "classic-2-door",
		label: "Classic 2-door",
		widthMm: 2400,
		heightMm: 2400,
		finish: "laminate-oak",
		doorType: "hinged",
	},
	{
		id: "sliding-3-door",
		label: "Sliding 3-door",
		widthMm: 3000,
		heightMm: 2400,
		finish: "laminate-ash",
		doorType: "sliding",
	},
	{
		id: "veneer-sliding",
		label: "Veneer sliding",
		widthMm: 3600,
		heightMm: 2400,
		finish: "veneer-teak",
		doorType: "sliding",
	},
	{
		id: "wide-4-door",
		label: "Wide 4-door",
		widthMm: 4200,
		heightMm: 2400,
		finish: "laminate-walnut",
		doorType: "hinged",
	},
	{
		id: "full-wall",
		label: "Full wall",
		widthMm: 4800,
		heightMm: 2600,
		finish: "veneer-walnut",
		doorType: "sliding",
	},
];
