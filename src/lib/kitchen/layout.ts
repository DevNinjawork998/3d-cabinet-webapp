import { type ModuleKind, type ModuleType, moduleType } from "./catalogue";

/**
 * A kitchen is a run along one wall, in two rows: things standing on the floor
 * and things hanging above them. Both rows pack edge to edge from the left,
 * which is how a fitted kitchen is actually built — there are no gaps between
 * carcasses — and it means the customer can only ever produce a buildable
 * layout by dragging. No overlaps to detect, no gaps to close.
 *
 * Pure: the UI holds a `KitchenLayout` and calls these.
 */

export type PlacedModule = { id: string; typeId: string };

export type KitchenLayout = {
	wallWidthMm: number;
	/** Floor row, left to right: base and tall units. */
	floor: PlacedModule[];
	/** Hung row, left to right. */
	wall: PlacedModule[];
};

export type Row = "floor" | "wall";

/** Tall units stand floor-to-ceiling, so they live in the floor row. */
export const rowFor = (kind: ModuleKind): Row =>
	kind === "wall" ? "wall" : "floor";

export const emptyLayout = (wallWidthMm: number): KitchenLayout => ({
	wallWidthMm,
	floor: [],
	wall: [],
});

const typesOf = (modules: PlacedModule[]): ModuleType[] =>
	modules
		.map((placed) => moduleType(placed.typeId))
		.filter((type): type is ModuleType => type !== undefined);

export const rowWidthMm = (modules: PlacedModule[]): number =>
	typesOf(modules).reduce((total, type) => total + type.widthMm, 0);

/** Where a tall unit blocks the hung row: nothing can be hung in front of it. */
function blockedSpans(floor: PlacedModule[]): Array<[number, number]> {
	const spans: Array<[number, number]> = [];
	let cursor = 0;
	for (const type of typesOf(floor)) {
		if (type.kind === "tall") spans.push([cursor, cursor + type.widthMm]);
		cursor += type.widthMm;
	}
	return spans;
}

export type Positioned = {
	placed: PlacedModule;
	type: ModuleType;
	/** Left edge of the carcass, measured from the left end of the run. */
	xMm: number;
};

/**
 * Lay a row out left to right. The hung row steps over any tall unit rather
 * than intersecting it, which is the one place the two rows have to agree.
 */
export function positionsOf(layout: KitchenLayout, row: Row): Positioned[] {
	const modules = layout[row];
	const blocked = row === "wall" ? blockedSpans(layout.floor) : [];
	const out: Positioned[] = [];
	let cursor = 0;

	for (const placed of modules) {
		const type = moduleType(placed.typeId);
		if (!type) continue;

		// Step past any tall unit this cabinet would otherwise run into.
		let moved = true;
		while (moved) {
			moved = false;
			for (const [start, end] of blocked) {
				if (cursor < end && cursor + type.widthMm > start) {
					cursor = end;
					moved = true;
				}
			}
		}

		out.push({ placed, type, xMm: cursor });
		cursor += type.widthMm;
	}

	return out;
}

/** How far along the wall a row currently reaches. */
export function rowEndMm(layout: KitchenLayout, row: Row): number {
	const positions = positionsOf(layout, row);
	const last = positions[positions.length - 1];
	return last ? last.xMm + last.type.widthMm : 0;
}

/**
 * The index a cabinet dropped at `xMm` should take. Measured against the
 * midpoint of each existing cabinet, so the drop lands on the side the pointer
 * is actually nearest — dropping just left of a cabinet's centre puts you
 * before it.
 */
export function indexAt(
	layout: KitchenLayout,
	row: Row,
	xMm: number,
	ignoreId?: string,
): number {
	const positions = positionsOf(layout, row).filter(
		(position) => position.placed.id !== ignoreId,
	);

	let index = 0;
	for (const position of positions) {
		if (xMm < position.xMm + position.type.widthMm / 2) break;
		index += 1;
	}
	return index;
}

/** Would this fit in the run alongside what is already there? */
export function fits(
	layout: KitchenLayout,
	typeId: string,
	ignoreId?: string,
): boolean {
	const type = moduleType(typeId);
	if (!type) return false;
	const row = rowFor(type.kind);
	const existing = layout[row].filter((placed) => placed.id !== ignoreId);
	// A tall unit costs the hung row its span as well, so measure the row that
	// ends up longest.
	const after: KitchenLayout = {
		...layout,
		[row]: [...existing, { id: "__probe", typeId }],
	};
	return (
		rowEndMm(after, "floor") <= layout.wallWidthMm &&
		rowEndMm(after, "wall") <= layout.wallWidthMm
	);
}

let counter = 0;
/** ponytail: a counter is enough for a client-side planner; swap for nanoid
 * when layouts start being saved and merged. */
export const newId = () => `m${++counter}`;

export function addModule(
	layout: KitchenLayout,
	typeId: string,
	xMm: number,
	id: string = newId(),
): KitchenLayout {
	const type = moduleType(typeId);
	if (!type || !fits(layout, typeId)) return layout;

	const row = rowFor(type.kind);
	const next = [...layout[row]];
	next.splice(indexAt(layout, row, xMm), 0, { id, typeId });
	return { ...layout, [row]: next };
}

/** Drag an existing cabinet along its row; it takes the slot it is dropped in. */
export function moveModule(
	layout: KitchenLayout,
	id: string,
	xMm: number,
): KitchenLayout {
	for (const row of ["floor", "wall"] as const) {
		const current = layout[row].find((placed) => placed.id === id);
		if (!current) continue;

		const without = layout[row].filter((placed) => placed.id !== id);
		const index = indexAt(layout, row, xMm, id);
		const next = [...without];
		next.splice(index, 0, current);
		return { ...layout, [row]: next };
	}
	return layout;
}

export function removeModule(layout: KitchenLayout, id: string): KitchenLayout {
	return {
		...layout,
		floor: layout.floor.filter((placed) => placed.id !== id),
		wall: layout.wall.filter((placed) => placed.id !== id),
	};
}

/** Every cabinet in the run, both rows, with its position. For the 3D scene. */
export function allPositions(layout: KitchenLayout): Positioned[] {
	return [...positionsOf(layout, "floor"), ...positionsOf(layout, "wall")];
}

/**
 * A starter kitchen so the demo never opens on an empty wall — the same
 * blank-canvas rule the wardrobe configurator follows.
 */
export function starterKitchen(wallWidthMm: number): KitchenLayout {
	let layout = emptyLayout(wallWidthMm);
	for (const typeId of ["base-900", "base-400", "base-900", "tall-600"]) {
		layout = addModule(layout, typeId, Number.POSITIVE_INFINITY);
	}
	for (const typeId of ["wall-900", "wall-400", "wall-900"]) {
		layout = addModule(layout, typeId, Number.POSITIVE_INFINITY);
	}
	return layout;
}
