import {
	type ModuleKind,
	type ModuleType,
	moduleType,
	WALL_CABINET_FLOOR_MM,
} from "./catalogue";

/**
 * A kitchen is a run along one wall, in two rows: things standing on the floor
 * and things hanging above them.
 *
 * Every cabinet stores **where it is**, not just what order it is in. An
 * earlier version derived each position by packing the row left to right, and
 * the result was a planner you could reorder but never actually arrange: a
 * wall cabinet could not be put in the gap above the base run, because packing
 * decided where it went. Position is the thing the customer is choosing, so it
 * is the thing the document stores.
 *
 * What the layout still guarantees is that a position is *buildable*:
 * `clampX` stops a cabinet against its neighbours and the wall, so overlap is
 * unrepresentable. Gaps are allowed — a kitchen has appliances and windows —
 * and `closeGaps` packs the run again on request.
 *
 * Pure: the UI holds a `KitchenLayout` and calls these.
 */

export type PlacedModule = {
	id: string;
	typeId: string;
	/** Left edge of the carcass, from the left end of the run. */
	xMm: number;
};

export type KitchenLayout = {
	wallWidthMm: number;
	/** Underside of the wall cabinets. They line up, as a real kitchen does. */
	hangingHeightMm: number;
	/** Floor row: base and tall units. */
	floor: PlacedModule[];
	/** Hung row. */
	wall: PlacedModule[];
};

export type Row = "floor" | "wall";

export type Span = { startMm: number; endMm: number };

/** Land exactly on an edge within this of it, when a drag is released. */
export const SNAP_MM = 60;

/** Tall units stand floor-to-ceiling, so they live in the floor row. */
export const rowFor = (kind: ModuleKind): Row =>
	kind === "wall" ? "wall" : "floor";

export const emptyLayout = (wallWidthMm: number): KitchenLayout => ({
	wallWidthMm,
	hangingHeightMm: WALL_CABINET_FLOOR_MM,
	floor: [],
	wall: [],
});

export type Positioned = {
	placed: PlacedModule;
	type: ModuleType;
	xMm: number;
};

const positioned = (placed: PlacedModule): Positioned | null => {
	const type = moduleType(placed.typeId);
	return type ? { placed, type, xMm: placed.xMm } : null;
};

const isPositioned = (p: Positioned | null): p is Positioned => p !== null;

/** One row, left to right. Order comes from position, not from the array. */
export function positionsOf(layout: KitchenLayout, row: Row): Positioned[] {
	return layout[row]
		.map(positioned)
		.filter(isPositioned)
		.sort((a, b) => a.xMm - b.xMm);
}

/** Every cabinet in the run, both rows. For the 3D scene. */
export function allPositions(layout: KitchenLayout): Positioned[] {
	return [...positionsOf(layout, "floor"), ...positionsOf(layout, "wall")];
}

/** How far along the wall the run reaches — its rightmost edge. */
export function rowEndMm(layout: KitchenLayout, row: Row): number {
	return positionsOf(layout, row).reduce(
		(end, position) => Math.max(end, position.xMm + position.type.widthMm),
		0,
	);
}

/**
 * The spans a cabinet in this row cannot occupy.
 *
 * A tall unit is floor-to-ceiling, so it blocks the hung row as well as its
 * own. That is the only place the two rows have to agree, and putting it here
 * means every move, drop and add gets it for free.
 */
export function occupiedSpans(
	layout: KitchenLayout,
	row: Row,
	ignoreId?: string,
): Span[] {
	const own = positionsOf(layout, row);
	const talls =
		row === "wall"
			? positionsOf(layout, "floor").filter(
					(position) => position.type.kind === "tall",
				)
			: [];

	return [...own, ...talls]
		.filter((position) => position.placed.id !== ignoreId)
		.map((position) => ({
			startMm: position.xMm,
			endMm: position.xMm + position.type.widthMm,
		}))
		.sort((a, b) => a.startMm - b.startMm);
}

/** The clear stretches of wall in a row, in order. */
export function freeSpans(
	layout: KitchenLayout,
	row: Row,
	ignoreId?: string,
): Span[] {
	const gaps: Span[] = [];
	let cursor = 0;

	for (const span of occupiedSpans(layout, row, ignoreId)) {
		if (span.startMm > cursor)
			gaps.push({ startMm: cursor, endMm: span.startMm });
		cursor = Math.max(cursor, span.endMm);
	}
	if (cursor < layout.wallWidthMm) {
		gaps.push({ startMm: cursor, endMm: layout.wallWidthMm });
	}

	return gaps;
}

const clampToWall = (xMm: number, widthMm: number, wallWidthMm: number) =>
	Math.min(Math.max(0, xMm), Math.max(0, wallWidthMm - widthMm));

/**
 * Settle a cabinet at the position it is being asked for.
 *
 * It cannot leave the wall, and it cannot pass through anything: a cabinet
 * pushed into its neighbour stops flush against it, exactly like pushing a
 * real carcass down a wall. `fromMm` is where the cabinet currently is, which
 * is what decides *which side* of an obstacle it stops on — without it, a
 * cabinet dragged fast enough to jump clean over a neighbour in one frame
 * would pop out on the far side.
 */
export function clampX(
	layout: KitchenLayout,
	row: Row,
	type: ModuleType,
	xMm: number,
	ignoreId?: string,
	fromMm?: number,
): number {
	const wanted = clampToWall(xMm, type.widthMm, layout.wallWidthMm);
	const spans = occupiedSpans(layout, row, ignoreId);
	const origin = fromMm ?? wanted;

	let settled = wanted;
	// One pass per obstacle, repeated until nothing moves: stopping against one
	// neighbour can push the cabinet into the next one along.
	for (let pass = 0; pass < spans.length + 1; pass++) {
		let moved = false;

		for (const span of spans) {
			const left = settled;
			const right = settled + type.widthMm;
			if (right <= span.startMm || left >= span.endMm) continue;

			// Approaching from the left means stopping before the obstacle.
			const approachingFromLeft = origin + type.widthMm / 2 < span.startMm;
			settled = approachingFromLeft ? span.startMm - type.widthMm : span.endMm;
			settled = clampToWall(settled, type.widthMm, layout.wallWidthMm);
			moved = true;
		}

		if (!moved) break;
	}

	// If it still overlaps, every direction is blocked — leave it where it was.
	return overlapsAnything(settled, type.widthMm, spans)
		? clampToWall(origin, type.widthMm, layout.wallWidthMm)
		: settled;
}

function overlapsAnything(
	xMm: number,
	widthMm: number,
	spans: Span[],
): boolean {
	return spans.some((span) => xMm < span.endMm && xMm + widthMm > span.startMm);
}

/**
 * The edges worth landing on: the neighbours in this row, the ends of the
 * wall, and — the one that makes a kitchen look designed rather than dragged —
 * the edges of the cabinets in the *other* row, so a wall unit lines up with
 * the base cabinet under it.
 */
function snapTargets(
	layout: KitchenLayout,
	row: Row,
	ignoreId?: string,
): number[] {
	const other: Row = row === "floor" ? "wall" : "floor";
	const edges = [0, layout.wallWidthMm];

	for (const r of [row, other]) {
		for (const position of positionsOf(layout, r)) {
			if (position.placed.id === ignoreId) continue;
			edges.push(position.xMm, position.xMm + position.type.widthMm);
		}
	}

	return edges;
}

/**
 * Tidy up a released drag: if either edge of the cabinet is within `SNAP_MM`
 * of something worth aligning to, land on it exactly. Deliberately only on
 * release — a snap that fires mid-drag makes the cabinet stick and jump.
 */
export function snapX(
	layout: KitchenLayout,
	row: Row,
	type: ModuleType,
	xMm: number,
	ignoreId?: string,
): number {
	const targets = snapTargets(layout, row, ignoreId);

	let best = xMm;
	let bestDistance = SNAP_MM;

	for (const target of targets) {
		// Either the left edge or the right edge can be the one that lands.
		for (const candidate of [target, target - type.widthMm]) {
			const distance = Math.abs(candidate - xMm);
			if (distance < bestDistance) {
				best = candidate;
				bestDistance = distance;
			}
		}
	}

	return clampX(layout, row, type, best, ignoreId, xMm);
}

let counter = 0;
/** ponytail: a counter is enough for a client-side planner; swap for nanoid
 * when layouts start being saved and merged. */
export const newId = () => `m${++counter}`;

const find = (
	layout: KitchenLayout,
	id: string,
): { row: Row; placed: PlacedModule; type: ModuleType } | null => {
	for (const row of ["floor", "wall"] as const) {
		const placed = layout[row].find((module) => module.id === id);
		const type = placed && moduleType(placed.typeId);
		if (placed && type) return { row, placed, type };
	}
	return null;
};

const withX = (
	layout: KitchenLayout,
	row: Row,
	id: string,
	xMm: number,
): KitchenLayout => ({
	...layout,
	[row]: layout[row].map((module) =>
		module.id === id ? { ...module, xMm } : module,
	),
});

/** Mid-drag: follow the pointer as far as the neighbours allow. */
export function moveModule(
	layout: KitchenLayout,
	id: string,
	xMm: number,
): KitchenLayout {
	const found = find(layout, id);
	if (!found) return layout;

	const settled = clampX(
		layout,
		found.row,
		found.type,
		xMm,
		id,
		found.placed.xMm,
	);
	return settled === found.placed.xMm
		? layout
		: withX(layout, found.row, id, settled);
}

/** Drag released: settle, then snap flush if it is close to an edge. */
export function dropModule(
	layout: KitchenLayout,
	id: string,
	xMm: number,
): KitchenLayout {
	const found = find(layout, id);
	if (!found) return layout;

	const settled = clampX(
		layout,
		found.row,
		found.type,
		xMm,
		id,
		found.placed.xMm,
	);
	const snapped = snapX(layout, found.row, found.type, settled, id);
	return snapped === found.placed.xMm
		? layout
		: withX(layout, found.row, id, snapped);
}

/** The leftmost clear position a cabinet of this width could take. */
export function firstFreeXMm(
	layout: KitchenLayout,
	row: Row,
	widthMm: number,
): number | null {
	for (const gap of freeSpans(layout, row)) {
		if (gap.endMm - gap.startMm >= widthMm) return gap.startMm;
	}
	return null;
}

/**
 * The position a cabinet dropped at `xMm` should actually take: where it was
 * dropped if that is clear, otherwise the nearest gap that will hold it. A
 * drop onto an occupied stretch is a near miss, not a mistake.
 */
export function placementFor(
	layout: KitchenLayout,
	row: Row,
	type: ModuleType,
	xMm: number,
): number | null {
	const wanted = clampToWall(xMm, type.widthMm, layout.wallWidthMm);

	let best: number | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const gap of freeSpans(layout, row)) {
		if (gap.endMm - gap.startMm < type.widthMm) continue;
		// Nearest spot inside this gap to where the pointer let go.
		const candidate = Math.min(
			Math.max(wanted, gap.startMm),
			gap.endMm - type.widthMm,
		);
		const distance = Math.abs(candidate - wanted);
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}

	return best;
}

/** Is there anywhere left on this wall for one of these? */
export function fits(layout: KitchenLayout, typeId: string): boolean {
	const type = moduleType(typeId);
	if (!type) return false;
	return firstFreeXMm(layout, rowFor(type.kind), type.widthMm) !== null;
}

export function addModule(
	layout: KitchenLayout,
	typeId: string,
	xMm: number,
	id: string = newId(),
): KitchenLayout {
	const type = moduleType(typeId);
	if (!type) return layout;

	const row = rowFor(type.kind);
	const at = placementFor(layout, row, type, xMm);
	if (at === null) return layout;

	const placed: PlacedModule = { id, typeId, xMm: at };
	const next = { ...layout, [row]: [...layout[row], placed] };
	// A tall unit lands in the floor row but takes the hung row with it, so
	// anything already hanging there has to give way.
	return type.kind === "tall"
		? evictBlockedWallUnits(next, placed, type)
		: next;
}

/**
 * A tall unit dropped under existing wall cabinets: slide them clear if there
 * is room, and drop the ones there is no room for. Better than refusing the
 * drop — the customer asked for the tall unit, and a planner that silently
 * does nothing reads as broken.
 */
function evictBlockedWallUnits(
	layout: KitchenLayout,
	tall: PlacedModule,
	type: ModuleType,
): KitchenLayout {
	const blocked: Span = {
		startMm: tall.xMm,
		endMm: tall.xMm + type.widthMm,
	};

	let next = layout;
	for (const position of positionsOf(layout, "wall")) {
		const left = position.xMm;
		const right = position.xMm + position.type.widthMm;
		if (right <= blocked.startMm || left >= blocked.endMm) continue;

		const moved = placementFor(
			removeModule(next, position.placed.id),
			"wall",
			position.type,
			position.xMm,
		);
		next =
			moved === null
				? removeModule(next, position.placed.id)
				: withX(next, "wall", position.placed.id, moved);
	}
	return next;
}

export function removeModule(layout: KitchenLayout, id: string): KitchenLayout {
	return {
		...layout,
		floor: layout.floor.filter((placed) => placed.id !== id),
		wall: layout.wall.filter((placed) => placed.id !== id),
	};
}

export function setHangingHeight(
	layout: KitchenLayout,
	hangingHeightMm: number,
): KitchenLayout {
	return { ...layout, hangingHeightMm };
}

/**
 * Pack both rows left, edge to edge, keeping the order the customer arranged.
 * This is the old always-on behaviour, demoted to one deliberate action: the
 * customer arranges freely and tidies up when they want a clean elevation.
 */
export function closeGaps(layout: KitchenLayout): KitchenLayout {
	const floor: PlacedModule[] = [];
	let cursor = 0;
	for (const position of positionsOf(layout, "floor")) {
		floor.push({ ...position.placed, xMm: cursor });
		cursor += position.type.widthMm;
	}

	const packed: KitchenLayout = { ...layout, floor, wall: [] };
	const talls = floor
		.map((placed) => ({ placed, type: moduleType(placed.typeId) }))
		.filter((entry) => entry.type?.kind === "tall");

	const wall: PlacedModule[] = [];
	cursor = 0;
	for (const position of positionsOf(layout, "wall")) {
		// Step past any tall unit, which owns the full height of its span.
		let moved = true;
		while (moved) {
			moved = false;
			for (const { placed, type } of talls) {
				if (!type) continue;
				const start = placed.xMm;
				const end = placed.xMm + type.widthMm;
				if (cursor < end && cursor + position.type.widthMm > start) {
					cursor = end;
					moved = true;
				}
			}
		}

		wall.push({ ...position.placed, xMm: cursor });
		cursor += position.type.widthMm;
	}

	return { ...packed, wall };
}

/**
 * A starter kitchen so the demo never opens on an empty wall — the same
 * blank-canvas rule the wardrobe configurator follows.
 */
export function starterKitchen(wallWidthMm: number): KitchenLayout {
	let layout = emptyLayout(wallWidthMm);
	// Dropped at 0 each time, so each one takes the leftmost gap that holds it
	// and the run comes out packed from the left without a tidy-up pass.
	for (const typeId of [
		"base-900",
		"base-400-drawers",
		"base-900",
		"tall-600",
	]) {
		layout = addModule(layout, typeId, 0);
	}
	for (const typeId of ["wall-900", "wall-400", "wall-900"]) {
		layout = addModule(layout, typeId, 0);
	}
	return layout;
}
