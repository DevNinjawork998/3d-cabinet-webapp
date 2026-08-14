import {
	DEFAULT_ROOM_DEPTH_MM,
	defaultWidthMm,
	type Family,
	family,
	type ModuleKind,
	ROOM_DEPTH_LIMITS,
	type RoomTypeId,
	roomType,
	WALL_CABINET_FLOOR_MM,
	WALL_HANG_LIMITS,
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
 * Pure: the UI holds a `PlannerLayout` and calls these.
 */

export type PlacedModule = {
	id: string;
	familyId: string;
	/**
	 * The size the customer chose, from the family's ladder. Width lives on the
	 * cabinet rather than on the product so one can be dropped in and then
	 * resized — which is the whole point of the size dropdown.
	 */
	widthMm: number;
	/** The door on it, or `null` for a bare carcass, which is how it starts. */
	doorStyleId: string | null;
	/** Left edge of the carcass, from the left end of the run. */
	xMm: number;
};

export type PlannerLayout = {
	wallWidthMm: number;
	/** Front-to-back room depth — the customer's, not a catalogue figure. */
	roomDepthMm: number;
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

export const emptyLayout = (
	wallWidthMm: number,
	roomDepthMm: number = DEFAULT_ROOM_DEPTH_MM,
): PlannerLayout => ({
	wallWidthMm,
	roomDepthMm,
	hangingHeightMm: WALL_CABINET_FLOOR_MM,
	floor: [],
	wall: [],
});

export type Positioned = {
	placed: PlacedModule;
	family: Family;
	/** Copied off the instance, so callers never reach for a type's width. */
	widthMm: number;
	xMm: number;
};

const positioned = (placed: PlacedModule): Positioned | null => {
	const found = family(placed.familyId);
	return found
		? { placed, family: found, widthMm: placed.widthMm, xMm: placed.xMm }
		: null;
};

const isPositioned = (p: Positioned | null): p is Positioned => p !== null;

/** One row, left to right. Order comes from position, not from the array. */
export function positionsOf(layout: PlannerLayout, row: Row): Positioned[] {
	return layout[row]
		.map(positioned)
		.filter(isPositioned)
		.sort((a, b) => a.xMm - b.xMm);
}

/** Every cabinet in the run, both rows. For the 3D scene. */
export function allPositions(layout: PlannerLayout): Positioned[] {
	return [...positionsOf(layout, "floor"), ...positionsOf(layout, "wall")];
}

/** How far along the wall the run reaches — its rightmost edge. */
export function rowEndMm(layout: PlannerLayout, row: Row): number {
	return positionsOf(layout, row).reduce(
		(end, position) => Math.max(end, position.xMm + position.widthMm),
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
	layout: PlannerLayout,
	row: Row,
	ignoreId?: string,
): Span[] {
	const own = positionsOf(layout, row);
	const talls =
		row === "wall"
			? positionsOf(layout, "floor").filter(
					(position) => position.family.kind === "tall",
				)
			: [];

	return [...own, ...talls]
		.filter((position) => position.placed.id !== ignoreId)
		.map((position) => ({
			startMm: position.xMm,
			endMm: position.xMm + position.widthMm,
		}))
		.sort((a, b) => a.startMm - b.startMm);
}

/** The clear stretches of wall in a row, in order. */
export function freeSpans(
	layout: PlannerLayout,
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
	layout: PlannerLayout,
	row: Row,
	widthMm: number,
	xMm: number,
	ignoreId?: string,
	fromMm?: number,
): number {
	const wanted = clampToWall(xMm, widthMm, layout.wallWidthMm);
	const spans = occupiedSpans(layout, row, ignoreId);
	const origin = fromMm ?? wanted;

	let settled = wanted;
	// One pass per obstacle, repeated until nothing moves: stopping against one
	// neighbour can push the cabinet into the next one along.
	for (let pass = 0; pass < spans.length + 1; pass++) {
		let moved = false;

		for (const span of spans) {
			const left = settled;
			const right = settled + widthMm;
			if (right <= span.startMm || left >= span.endMm) continue;

			// Approaching from the left means stopping before the obstacle.
			const approachingFromLeft = origin + widthMm / 2 < span.startMm;
			settled = approachingFromLeft ? span.startMm - widthMm : span.endMm;
			settled = clampToWall(settled, widthMm, layout.wallWidthMm);
			moved = true;
		}

		if (!moved) break;
	}

	// If it still overlaps, every direction is blocked — leave it where it was.
	return overlapsAnything(settled, widthMm, spans)
		? clampToWall(origin, widthMm, layout.wallWidthMm)
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
	layout: PlannerLayout,
	row: Row,
	ignoreId?: string,
): number[] {
	const other: Row = row === "floor" ? "wall" : "floor";
	const edges = [0, layout.wallWidthMm];

	for (const r of [row, other]) {
		for (const position of positionsOf(layout, r)) {
			if (position.placed.id === ignoreId) continue;
			edges.push(position.xMm, position.xMm + position.widthMm);
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
	layout: PlannerLayout,
	row: Row,
	widthMm: number,
	xMm: number,
	ignoreId?: string,
): number {
	const targets = snapTargets(layout, row, ignoreId);

	let best = xMm;
	let bestDistance = SNAP_MM;

	for (const target of targets) {
		// Either the left edge or the right edge can be the one that lands.
		for (const candidate of [target, target - widthMm]) {
			const distance = Math.abs(candidate - xMm);
			if (distance < bestDistance) {
				best = candidate;
				bestDistance = distance;
			}
		}
	}

	return clampX(layout, row, widthMm, best, ignoreId, xMm);
}

let counter = 0;
/** ponytail: a counter is enough for a client-side planner; swap for nanoid
 * when layouts start being saved and merged. */
export const newId = () => `m${++counter}`;

const find = (
	layout: PlannerLayout,
	id: string,
): { row: Row; placed: PlacedModule; family: Family } | null => {
	for (const row of ["floor", "wall"] as const) {
		const placed = layout[row].find((module) => module.id === id);
		const found = placed && family(placed.familyId);
		if (placed && found) return { row, placed, family: found };
	}
	return null;
};

const withX = (
	layout: PlannerLayout,
	row: Row,
	id: string,
	xMm: number,
): PlannerLayout => ({
	...layout,
	[row]: layout[row].map((module) =>
		module.id === id ? { ...module, xMm } : module,
	),
});

/** Mid-drag: follow the pointer as far as the neighbours allow. */
export function moveModule(
	layout: PlannerLayout,
	id: string,
	xMm: number,
): PlannerLayout {
	const found = find(layout, id);
	if (!found) return layout;

	const settled = clampX(
		layout,
		found.row,
		found.placed.widthMm,
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
	layout: PlannerLayout,
	id: string,
	xMm: number,
): PlannerLayout {
	const found = find(layout, id);
	if (!found) return layout;

	const settled = clampX(
		layout,
		found.row,
		found.placed.widthMm,
		xMm,
		id,
		found.placed.xMm,
	);
	const snapped = snapX(layout, found.row, found.placed.widthMm, settled, id);
	return snapped === found.placed.xMm
		? layout
		: withX(layout, found.row, id, snapped);
}

/** The leftmost clear position a cabinet of this width could take. */
export function firstFreeXMm(
	layout: PlannerLayout,
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
	layout: PlannerLayout,
	row: Row,
	widthMm: number,
	xMm: number,
): number | null {
	const wanted = clampToWall(xMm, widthMm, layout.wallWidthMm);

	let best: number | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const gap of freeSpans(layout, row)) {
		if (gap.endMm - gap.startMm < widthMm) continue;
		// Nearest spot inside this gap to where the pointer let go.
		const candidate = Math.min(
			Math.max(wanted, gap.startMm),
			gap.endMm - widthMm,
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
export function fits(
	layout: PlannerLayout,
	familyId: string,
	widthMm = defaultWidthMm(familyId),
): boolean {
	const found = family(familyId);
	if (!found) return false;
	return firstFreeXMm(layout, rowFor(found.kind), widthMm) !== null;
}

/**
 * Place a cabinet. It arrives as a **bare carcass** — the door is a separate
 * choice the customer drags on afterwards, which is the order they are sold in.
 */
export function addModule(
	layout: PlannerLayout,
	familyId: string,
	xMm: number,
	id: string = newId(),
	widthMm: number = defaultWidthMm(familyId),
): PlannerLayout {
	const found = family(familyId);
	if (!found) return layout;

	const row = rowFor(found.kind);
	const at = placementFor(layout, row, widthMm, xMm);
	if (at === null) return layout;

	const placed: PlacedModule = {
		id,
		familyId,
		widthMm,
		doorStyleId: null,
		xMm: at,
	};
	const next = { ...layout, [row]: [...layout[row], placed] };
	// A tall unit lands in the floor row but takes the hung row with it, so
	// anything already hanging there has to give way.
	return found.kind === "tall" ? evictBlockedWallUnits(next, placed) : next;
}

/**
 * A tall unit dropped under existing wall cabinets: slide them clear if there
 * is room, and drop the ones there is no room for. Better than refusing the
 * drop — the customer asked for the tall unit, and a planner that silently
 * does nothing reads as broken.
 */
function evictBlockedWallUnits(
	layout: PlannerLayout,
	tall: PlacedModule,
): PlannerLayout {
	const blocked: Span = {
		startMm: tall.xMm,
		endMm: tall.xMm + tall.widthMm,
	};

	let next = layout;
	for (const position of positionsOf(layout, "wall")) {
		const left = position.xMm;
		const right = position.xMm + position.widthMm;
		if (right <= blocked.startMm || left >= blocked.endMm) continue;

		const moved = placementFor(
			removeModule(next, position.placed.id),
			"wall",
			position.widthMm,
			position.xMm,
		);
		next =
			moved === null
				? removeModule(next, position.placed.id)
				: withX(next, "wall", position.placed.id, moved);
	}
	return next;
}

/**
 * Take several cabinets out at once. Everything left stays exactly where it
 * is — clearing a stretch of wall is usually the first step in rearranging it,
 * so closing the gap automatically would undo what the customer just asked for.
 */
export function removeModules(
	layout: PlannerLayout,
	ids: Iterable<string>,
): PlannerLayout {
	const gone = new Set(ids);
	if (gone.size === 0) return layout;
	return {
		...layout,
		floor: layout.floor.filter((placed) => !gone.has(placed.id)),
		wall: layout.wall.filter((placed) => !gone.has(placed.id)),
	};
}

export function removeModule(layout: PlannerLayout, id: string): PlannerLayout {
	return removeModules(layout, [id]);
}

/**
 * A copy of one cabinet — same family, size and door — placed as close to the
 * original as there is room for. Returns `layout` unchanged if `id` is not
 * placed or nothing on the wall will hold a second one.
 */
export function duplicateModule(
	layout: PlannerLayout,
	id: string,
	newIdValue: string = newId(),
): PlannerLayout {
	const source = [...layout.floor, ...layout.wall].find((m) => m.id === id);
	if (!source) return layout;

	const added = addModule(
		layout,
		source.familyId,
		source.xMm + source.widthMm,
		newIdValue,
		source.widthMm,
	);
	if (added === layout) return layout;

	return source.doorStyleId
		? setDoor(added, newIdValue, source.doorStyleId)
		: added;
}

export function setHangingHeight(
	layout: PlannerLayout,
	hangingHeightMm: number,
): PlannerLayout {
	return { ...layout, hangingHeightMm };
}

/**
 * Line the wall cabinets' tops up with the tallest floor unit next to them —
 * a fridge housing or tall cabinet, whose top is fixed by its own height, not
 * by the hang slider. Moving that slider off the catalogue's default breaks
 * this alignment; this is the one-click way back. Does nothing if the room
 * has no tall unit or no wall cabinet to line up against, and clamps to the
 * same range the hang slider itself allows.
 */
export function flushWallToTallTops(layout: PlannerLayout): PlannerLayout {
	const tallTopMm = Math.max(
		0,
		...positionsOf(layout, "floor")
			.filter((p) => p.family.kind === "tall")
			.map((p) => p.family.floorHeightMm + p.family.heightMm),
	);
	if (tallTopMm === 0) return layout;

	const wallHeightMm = Math.max(
		0,
		...positionsOf(layout, "wall").map((p) => p.family.heightMm),
	);
	if (wallHeightMm === 0) return layout;

	const hangingHeightMm = Math.min(
		WALL_HANG_LIMITS.maxMm,
		Math.max(WALL_HANG_LIMITS.minMm, tallTopMm - wallHeightMm),
	);
	return setHangingHeight(layout, hangingHeightMm);
}

/**
 * How long a wall the planner will accept. Wide enough for a real kitchen wall,
 * narrow enough that a mistyped figure does not produce a room you cannot see.
 */
export const WALL_LIMITS = { minMm: 1000, maxMm: 12000 } as const;

/**
 * Set the wall to what the customer measured.
 *
 * Cabinets are left exactly where they are, even if the new wall is shorter
 * than the run: someone typing their real wall length is telling us a fact
 * about their house, not asking us to throw away the cabinets they placed. The
 * UI shows what overhangs, and `closeGaps` usually recovers it.
 */
export function setWallWidth(
	layout: PlannerLayout,
	wallWidthMm: number,
): PlannerLayout {
	const clamped = Math.min(
		WALL_LIMITS.maxMm,
		Math.max(WALL_LIMITS.minMm, Math.round(wallWidthMm)),
	);
	return clamped === layout.wallWidthMm
		? layout
		: { ...layout, wallWidthMm: clamped };
}

/**
 * Set the room's front-to-back depth to what the customer measured. This is
 * a 3D-scene dimension only — cabinet depths are fixed per family — but the
 * room box, camera framing and drag planes all read it, so a shallow galley
 * kitchen and a deep open one no longer render at the same fixed depth.
 */
export function setRoomDepth(
	layout: PlannerLayout,
	roomDepthMm: number,
): PlannerLayout {
	const clamped = Math.min(
		ROOM_DEPTH_LIMITS.maxMm,
		Math.max(ROOM_DEPTH_LIMITS.minMm, Math.round(roomDepthMm)),
	);
	return clamped === layout.roomDepthMm
		? layout
		: { ...layout, roomDepthMm: clamped };
}

/** How far the run overhangs the wall, if at all. */
export function overhangMm(layout: PlannerLayout): number {
	const end = Math.max(rowEndMm(layout, "floor"), rowEndMm(layout, "wall"));
	return Math.max(0, end - layout.wallWidthMm);
}

/**
 * Pack both rows left, edge to edge, keeping the order the customer arranged.
 * This is the old always-on behaviour, demoted to one deliberate action: the
 * customer arranges freely and tidies up when they want a clean elevation.
 */
export function closeGaps(layout: PlannerLayout): PlannerLayout {
	const floor: PlacedModule[] = [];
	let cursor = 0;
	for (const position of positionsOf(layout, "floor")) {
		floor.push({ ...position.placed, xMm: cursor });
		cursor += position.widthMm;
	}

	const packed: PlannerLayout = { ...layout, floor, wall: [] };
	const talls = floor
		.map((placed) => ({ placed, family: family(placed.familyId) }))
		.filter((entry) => entry.family?.kind === "tall");

	const wall: PlacedModule[] = [];
	cursor = 0;
	for (const position of positionsOf(layout, "wall")) {
		// Step past any tall unit, which owns the full height of its span.
		let moved = true;
		while (moved) {
			moved = false;
			for (const { placed, family: tall } of talls) {
				if (!tall) continue;
				const start = placed.xMm;
				const end = placed.xMm + placed.widthMm;
				if (cursor < end && cursor + position.widthMm > start) {
					cursor = end;
					moved = true;
				}
			}
		}

		wall.push({ ...position.placed, xMm: cursor });
		cursor += position.widthMm;
	}

	return { ...packed, wall };
}

/**
 * Resize a cabinet in place.
 *
 * The **left edge stays put** and it grows to the right, because that is what
 * the customer means by "make this one wider" — a cabinet that also slid
 * sideways would move the run under them. If the neighbour is in the way the
 * resize is refused outright rather than half-applied; `widthOptionsFor` is
 * what the UI uses to grey those sizes out before they are even offered.
 */
export function setWidth(
	layout: PlannerLayout,
	id: string,
	widthMm: number,
): PlannerLayout {
	const found = find(layout, id);
	if (!found || widthMm === found.placed.widthMm) return layout;

	const spans = occupiedSpans(layout, found.row, id);
	const wall = layout.wallWidthMm;
	if (found.placed.xMm + widthMm > wall) return layout;
	if (overlapsAnything(found.placed.xMm, widthMm, spans)) return layout;

	return {
		...layout,
		[found.row]: layout[found.row].map((module) =>
			module.id === id ? { ...module, widthMm } : module,
		),
	};
}

/** Every size on this cabinet's ladder, flagged with whether it would fit. */
export function widthOptionsFor(
	layout: PlannerLayout,
	id: string,
): Array<{ widthMm: number; priceRm: number; fits: boolean }> {
	const found = find(layout, id);
	if (!found) return [];

	const spans = occupiedSpans(layout, found.row, id);
	return found.family.sizes.map((size) => ({
		widthMm: size.widthMm,
		priceRm: size.priceRm,
		fits:
			found.placed.xMm + size.widthMm <= layout.wallWidthMm &&
			!overlapsAnything(found.placed.xMm, size.widthMm, spans),
	}));
}

/** Put a door on a carcass, or take it off again with `null`. */
export function setDoor(
	layout: PlannerLayout,
	id: string,
	doorStyleId: string | null,
): PlannerLayout {
	const found = find(layout, id);
	if (!found) return layout;

	return {
		...layout,
		[found.row]: layout[found.row].map((module) =>
			module.id === id ? { ...module, doorStyleId } : module,
		),
	};
}

/** Put the same door on several at once — what the palette does to a selection. */
export function setDoors(
	layout: PlannerLayout,
	ids: Iterable<string>,
	doorStyleId: string | null,
): PlannerLayout {
	let next = layout;
	for (const id of ids) next = setDoor(next, id, doorStyleId);
	return next;
}

/**
 * The room's own starter, so no room ever opens on a blank wall — the same
 * rule the wardrobe configurator follows. Dropped at 0 each time, so each one
 * takes the leftmost gap that holds it and the run comes out packed from the
 * left without a tidy-up pass.
 */
export function starterFor(roomId: RoomTypeId): PlannerLayout {
	const room = roomType(roomId);
	let layout = emptyLayout(room.defaultWallWidthMm);
	for (const item of room.starter) {
		layout = addModule(layout, item.familyId, 0, newId(), item.widthMm);
	}
	return layout;
}
