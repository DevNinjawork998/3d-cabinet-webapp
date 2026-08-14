import type {
	DoorStyle,
	Family,
	PlannerCatalogue,
	RoomType,
	SizeOption,
} from "./catalogueSchema";

/**
 * Catalogue-parameterised versions of `catalogue.ts`'s lookup helpers.
 *
 * `catalogue.ts` builds its `FAMILY_BY_ID`/`DOOR_BY_ID` maps once at module
 * load, against the one catalogue that exists today. These do the same
 * lookup against whichever catalogue is passed in — the money-path
 * (`pricing.ts`) uses these; `layout.ts`'s placement/collision logic still
 * reads `catalogue.ts` directly for now, since it isn't the server-priced
 * surface CLAUDE.md's "price is computed server-side" rule is about.
 *
 * The per-catalogue index is memoised on the catalogue object's identity —
 * cheap while there is only ever one live catalogue, and free once a
 * published `CatalogueVersion` row is itself a stable, cached object.
 */

type Index = {
	familyById: Map<string, Family>;
	doorById: Map<string, DoorStyle>;
	roomById: Map<string, RoomType>;
};

const indexCache = new WeakMap<PlannerCatalogue, Index>();

function indexOf(catalogue: PlannerCatalogue): Index {
	const cached = indexCache.get(catalogue);
	if (cached) return cached;
	const index: Index = {
		familyById: new Map(catalogue.families.map((f) => [f.id, f])),
		doorById: new Map(catalogue.doorStyles.map((d) => [d.id, d])),
		roomById: new Map(catalogue.roomTypes.map((r) => [r.id, r])),
	};
	indexCache.set(catalogue, index);
	return index;
}

export function family(
	catalogue: PlannerCatalogue,
	familyId: string,
): Family | undefined {
	return indexOf(catalogue).familyById.get(familyId);
}

/** The size ladder for a family, cheapest first. */
export function sizesOf(
	catalogue: PlannerCatalogue,
	familyId: string,
): SizeOption[] {
	return family(catalogue, familyId)?.sizes ?? [];
}

export function sizePriceRm(
	catalogue: PlannerCatalogue,
	familyId: string,
	widthMm: number,
): number {
	return (
		sizesOf(catalogue, familyId).find((size) => size.widthMm === widthMm)
			?.priceRm ?? 0
	);
}

/** The size a freshly placed cabinet takes: the middle of its ladder. */
export function defaultWidthMm(
	catalogue: PlannerCatalogue,
	familyId: string,
): number {
	const sizes = sizesOf(catalogue, familyId);
	return sizes[Math.floor(sizes.length / 2)]?.widthMm ?? 600;
}

export function doorStyle(
	catalogue: PlannerCatalogue,
	doorStyleId: string,
): DoorStyle | undefined {
	return indexOf(catalogue).doorById.get(doorStyleId);
}

/**
 * What a door costs on a carcass of this width. Widths between rungs are
 * charged at the next rung up — you cannot buy half a door.
 */
export function doorPriceRm(
	catalogue: PlannerCatalogue,
	doorStyleId: string,
	widthMm: number,
): number {
	const style = doorStyle(catalogue, doorStyleId);
	if (!style) return 0;
	const exact = style.priceRmBySizeMm[String(widthMm)];
	if (exact !== undefined) return exact;

	const ladder = catalogue.doorWidthLadderMm;
	const rung = ladder.find((mm) => mm >= widthMm) ?? ladder.at(-1);
	return rung === undefined ? 0 : (style.priceRmBySizeMm[String(rung)] ?? 0);
}

export function roomType(catalogue: PlannerCatalogue, id: string): RoomType {
	const found = indexOf(catalogue).roomById.get(id);
	if (!found) throw new Error(`unknown room type ${id}`);
	return found;
}
