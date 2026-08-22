/** One vocabulary for the `CabinetDesign` table's enums, so the admin upload
 * form and its table read the same labels rather than each spelling them
 * out. */

export type Category =
	| "BASE_CABINET"
	| "WALL_CABINET"
	| "TALL_CABINET"
	| "DRAWER_BASE"
	| "FRIDGE_HOUSING";

export type Room = "KITCHEN" | "LIVING_ROOM" | "BEDROOM" | "FOYER";

export const CATEGORIES: Category[] = [
	"BASE_CABINET",
	"WALL_CABINET",
	"TALL_CABINET",
	"DRAWER_BASE",
	"FRIDGE_HOUSING",
];

export const CATEGORY_LABELS: Record<Category, string> = {
	BASE_CABINET: "Base cabinet",
	WALL_CABINET: "Wall cabinet",
	TALL_CABINET: "Tall cabinet",
	DRAWER_BASE: "Drawer base",
	FRIDGE_HOUSING: "Fridge housing",
};

/** No render/thumbnail exists for an uploaded `.skp` (never parsed
 * client-side) — this colour stands in as the gallery card's placeholder
 * art instead of a new required-upload field. */
export const CATEGORY_SWATCH: Record<Category, string> = {
	BASE_CABINET: "#c9c2b5",
	WALL_CABINET: "#a1abb4",
	TALL_CABINET: "#b7ab9e",
	DRAWER_BASE: "#d1af81",
	FRIDGE_HOUSING: "#8a8580",
};

export const ROOMS: Room[] = ["KITCHEN", "LIVING_ROOM", "BEDROOM", "FOYER"];

export const ROOM_LABELS: Record<Room, string> = {
	KITCHEN: "Kitchen",
	LIVING_ROOM: "Living room",
	BEDROOM: "Bedroom",
	FOYER: "Foyer",
};
