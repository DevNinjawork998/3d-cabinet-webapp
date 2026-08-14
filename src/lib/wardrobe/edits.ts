import { WARDROBE_CATALOGUE } from "./catalogue";
import type { OpeningConstraints } from "./catalogueSchema";
import { maxRunWidthMm, type RoomSize } from "./room";
import { splitIntoBays } from "./rules";
import type {
	AccessoryId,
	BayInterior,
	DesignDocument,
	Door,
	InteriorItem,
} from "./schema";

/**
 * Every edit the configurator can make to a design document, as pure
 * `(design, …) => design` functions. The UI holds the document and calls
 * these; it never reaches into `bays` or `doors` itself.
 *
 * All of them return a new document and leave the input untouched, so the
 * caller can keep the previous one around (for an undo stack, or just for
 * React to notice the change).
 */

const TOP_SHELF_DROP_MM = 550;
const RAIL_DROP_MM = 650;
const DRAWER_BASE_MM = 60;
/** A shelf or rail this close to the top has nowhere useful to go. */
const MIN_CLEARANCE_MM = 100;

/**
 * Default fit-out for a bay, positioned relative to the carcass height so a
 * short unit doesn't leave its shelf and rail hanging outside the box.
 * Lives here rather than in `presets.ts` because re-seating on a height
 * change has to agree with it exactly.
 */
export function defaultItems(heightMm: number): InteriorItem[] {
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

/**
 * Move items to suit a new carcass height. Anything in the top half hangs off
 * the top — a rail 650mm below the lid stays 650mm below the lid — while
 * anything low is standing on the floor and stays put.
 */
function refit(
	items: InteriorItem[],
	oldHeightMm: number,
	newHeightMm: number,
): InteriorItem[] {
	if (oldHeightMm === newHeightMm) return items;
	const delta = newHeightMm - oldHeightMm;

	return items.map((item) => {
		const topAnchored = item.heightFromFloor > oldHeightMm / 2;
		const moved = topAnchored
			? item.heightFromFloor + delta
			: item.heightFromFloor;
		return {
			...item,
			heightFromFloor: Math.max(
				0,
				Math.min(moved, newHeightMm - MIN_CLEARANCE_MM),
			),
		};
	});
}

/**
 * Re-split an opening and carry the old fit-out onto the new bays by order:
 * bay 1 keeps bay 1's shelves and door, and any bay the split adds copies the
 * last one the customer actually set up rather than reverting to a default
 * they never chose.
 */
function respan(
	design: DesignDocument,
	widthMm: number,
	heightMm: number,
	count?: number,
): DesignDocument {
	const split =
		count === undefined
			? splitIntoBays(widthMm)
			: Array.from({ length: count }, (_, order) => ({
					width: widthMm / count,
					order,
				}));

	const bays = split.map((bay) => ({ ...bay, id: `bay-${bay.order + 1}` }));

	const oldInteriors = design.interiors;
	const oldDoors = design.doors;
	const lastInterior = oldInteriors[oldInteriors.length - 1];
	const lastDoor = oldDoors[oldDoors.length - 1];

	const interiors: BayInterior[] = bays.map((bay, i) => {
		const source = oldInteriors[i] ?? lastInterior;
		return {
			bayId: bay.id,
			items: refit(
				source?.items ?? defaultItems(heightMm),
				design.opening.height,
				heightMm,
			),
			accessories: [...(source?.accessories ?? [])],
		};
	});

	const doors: Door[] = bays.map((bay, i) => {
		const source = oldDoors[i] ?? lastDoor;
		return { ...source, bayId: bay.id };
	});

	return { ...design, bays, interiors, doors };
}

export type OpeningPatch = {
	widthMm?: number;
	heightMm?: number;
	ceilingHeightMm?: number;
};

export function resizeOpening(
	design: DesignDocument,
	patch: OpeningPatch,
): DesignDocument {
	const widthMm = patch.widthMm ?? design.opening.width;
	const heightMm = patch.heightMm ?? design.opening.height;
	const ceilingHeight = patch.ceilingHeightMm ?? design.opening.ceilingHeight;

	// Only a width change re-splits; a taller unit keeps the bays it has.
	const next =
		widthMm === design.opening.width
			? {
					...design,
					interiors: design.interiors.map((interior) => ({
						...interior,
						items: refit(interior.items, design.opening.height, heightMm),
					})),
				}
			: respan(design, widthMm, heightMm);

	return {
		...next,
		opening: {
			...design.opening,
			width: widthMm,
			height: heightMm,
			ceilingHeight,
		},
	};
}

/** The widest run and tallest unit this room can actually hold. */
export function roomLimits(
	room: RoomSize,
	constraints: OpeningConstraints = WARDROBE_CATALOGUE.openingConstraints,
): {
	maxWidthMm: number;
	maxHeightMm: number;
} {
	return {
		maxWidthMm: Math.min(constraints.maxTotalWidthMm, maxRunWidthMm(room)),
		maxHeightMm: Math.min(
			constraints.maxHeightMm,
			room.heightMm - constraints.ceilingClearanceMm,
		),
	};
}

/**
 * Bring a design back inside a room that just changed: a unit cannot be longer
 * than the longest wall or taller than the ceiling it stands under, and its
 * recorded ceiling has to be the room's. Shrinking a room therefore shrinks
 * the wardrobe rather than leaving an invalid document on screen.
 */
export function fitToRoom(
	design: DesignDocument,
	room: RoomSize,
	constraints: OpeningConstraints = WARDROBE_CATALOGUE.openingConstraints,
): DesignDocument {
	const { maxWidthMm, maxHeightMm } = roomLimits(room, constraints);
	const widthMm = Math.min(design.opening.width, maxWidthMm);
	const heightMm = Math.min(design.opening.height, maxHeightMm);

	if (
		widthMm === design.opening.width &&
		heightMm === design.opening.height &&
		room.heightMm === design.opening.ceilingHeight
	) {
		return design;
	}

	return resizeOpening(design, {
		widthMm,
		heightMm,
		ceilingHeightMm: room.heightMm,
	});
}

/**
 * The number of bays the customer can ask for is bounded at both ends: too few
 * and each bay is wider than the catalogue's widest carcass, too many and each
 * is narrower than the narrowest.
 */
export function bayCountRange(
	openingWidthMm: number,
	constraints: OpeningConstraints = WARDROBE_CATALOGUE.openingConstraints,
): [number, number] {
	const min = Math.max(
		1,
		Math.ceil(openingWidthMm / constraints.maxBayWidthMm),
	);
	const max = Math.max(
		min,
		Math.floor(openingWidthMm / constraints.minBayWidthMm),
	);
	return [min, max];
}

export function setBayCount(
	design: DesignDocument,
	count: number,
	constraints: OpeningConstraints = WARDROBE_CATALOGUE.openingConstraints,
): DesignDocument {
	const [min, max] = bayCountRange(design.opening.width, constraints);
	const clamped = Math.min(max, Math.max(min, Math.round(count)));
	return respan(design, design.opening.width, design.opening.height, clamped);
}

/**
 * Widen or narrow one bay, taking the difference out of its neighbour so the
 * run still fills the opening. The neighbour's own limits bound the move, so a
 * fully packed run simply refuses to budge.
 */
export function resizeBay(
	design: DesignDocument,
	bayId: string,
	widthMm: number,
	constraints: OpeningConstraints = WARDROBE_CATALOGUE.openingConstraints,
): DesignDocument {
	const index = design.bays.findIndex((bay) => bay.id === bayId);
	if (index === -1 || design.bays.length < 2) return design;

	const neighbour = index === design.bays.length - 1 ? index - 1 : index + 1;
	const { minBayWidthMm, maxBayWidthMm } = constraints;
	const pair = design.bays[index].width + design.bays[neighbour].width;

	const width = Math.min(
		maxBayWidthMm,
		Math.max(minBayWidthMm, widthMm, pair - maxBayWidthMm),
		pair - minBayWidthMm,
	);

	const bays = design.bays.map((bay, i) => {
		if (i === index) return { ...bay, width };
		if (i === neighbour) return { ...bay, width: pair - width };
		return bay;
	});

	return { ...design, bays };
}

export function setInterior(
	design: DesignDocument,
	bayId: string,
	items: InteriorItem[],
): DesignDocument {
	return {
		...design,
		interiors: design.interiors.map((interior) =>
			interior.bayId === bayId ? { ...interior, items } : interior,
		),
	};
}

export function toggleAccessory(
	design: DesignDocument,
	bayId: string,
	accessoryId: AccessoryId,
): DesignDocument {
	return {
		...design,
		interiors: design.interiors.map((interior) => {
			if (interior.bayId !== bayId) return interior;
			const has = interior.accessories.includes(accessoryId);
			return {
				...interior,
				accessories: has
					? interior.accessories.filter((id) => id !== accessoryId)
					: [...interior.accessories, accessoryId],
			};
		}),
	};
}

export type DoorPatch = Partial<Omit<Door, "bayId">>;

export function setDoor(
	design: DesignDocument,
	bayId: string,
	patch: DoorPatch,
): DesignDocument {
	return {
		...design,
		doors: design.doors.map((door) =>
			door.bayId === bayId ? { ...door, ...patch } : door,
		),
	};
}

export function setAllDoors(
	design: DesignDocument,
	patch: DoorPatch,
): DesignDocument {
	return {
		...design,
		doors: design.doors.map((door) => ({ ...door, ...patch })),
	};
}
