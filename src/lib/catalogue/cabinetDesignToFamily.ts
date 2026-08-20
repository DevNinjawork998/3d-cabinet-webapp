import {
	type Category,
	ROOM_TO_PLANNER,
	type Room,
} from "@/lib/catalogue/cabinetDesignLabels";
import type { RoomTypeId } from "@/lib/planner/catalogue";
import { WALL_CABINET_FLOOR_MM } from "@/lib/planner/catalogue";
import {
	type Family,
	familySchema,
	type PlannerCatalogue,
} from "@/lib/planner/catalogueSchema";

/** Only the `CabinetDesign` fields the mapping actually reads — deliberately
 * not the full Prisma model, so this stays usable client-side (the admin
 * page runs this in the browser) without pulling in generated Prisma types. */
type DesignForFamily = {
	id: string;
	name: string;
	category: Category;
	room: Room;
	widthMm: number;
	heightMm: number;
	depthMm: number;
	priceRm: number;
	description: string | null;
};

/**
 * Maps a `CabinetDesign` upload into a `Family` the planner's procedural
 * engine can actually place and render. `CabinetDesign` has no equivalent
 * for several `Family` fields — `kind`/`hasWorktop`/`drawers` are inferred
 * from `category` below, `floorHeightMm` from `kind`, and `sizes` is always
 * a single-rung ladder (one upload = one width/price, no resize dropdown).
 * `familySchema.parse` at the end is the safety net: fail loudly if a future
 * `CabinetCategory` value is added here without updating the mapping.
 */
const CATEGORY_TO_FAMILY_SHAPE: Record<
	Category,
	Pick<Family, "kind" | "hasWorktop" | "drawers">
> = {
	BASE_CABINET: { kind: "base", hasWorktop: true, drawers: 0 },
	WALL_CABINET: { kind: "wall", hasWorktop: false, drawers: 0 },
	TALL_CABINET: { kind: "tall", hasWorktop: false, drawers: 0 },
	// No drawer-count column on CabinetDesign — 3 matches the existing
	// "base-drawers" family; revisit if/when a real count field is added.
	DRAWER_BASE: { kind: "base", hasWorktop: true, drawers: 3 },
	FRIDGE_HOUSING: { kind: "tall", hasWorktop: false, drawers: 0 },
};

export function toFamily(design: DesignForFamily): Family {
	const shape = CATEGORY_TO_FAMILY_SHAPE[design.category];
	const family: Family = {
		id: design.id,
		label: design.name,
		kind: shape.kind,
		depthMm: design.depthMm,
		heightMm: design.heightMm,
		floorHeightMm: shape.kind === "wall" ? WALL_CABINET_FLOOR_MM : 0,
		sizes: [{ widthMm: design.widthMm, priceRm: design.priceRm }],
		hasWorktop: shape.hasWorktop,
		drawers: shape.drawers,
		note: design.description ?? undefined,
	};
	return familySchema.parse(family);
}

/** Upsert `family` into the catalogue (replace by id, else append), and
 * make sure it's offered in its room's palette. */
export function mergeFamilyIntoCatalogue(
	catalogue: PlannerCatalogue,
	family: Family,
	roomId: RoomTypeId,
): PlannerCatalogue {
	const families = catalogue.families.some((f) => f.id === family.id)
		? catalogue.families.map((f) => (f.id === family.id ? family : f))
		: [...catalogue.families, family];

	const roomTypes = catalogue.roomTypes.map((room) =>
		room.id === roomId && !room.familyIds.includes(family.id)
			? { ...room, familyIds: [...room.familyIds, family.id] }
			: room,
	);

	return { ...catalogue, families, roomTypes };
}

/** `CabinetDesign.room` → `RoomTypeId`, one merge call. */
export function toRoomTypeId(room: Room): RoomTypeId {
	return ROOM_TO_PLANNER[room];
}
