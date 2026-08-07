import type { AccessoryId, DoorTypeId, FinishId } from "./schema";

// PLACEHOLDER — Phase 0 client catalogue/pricing spec not yet confirmed.
// All values below are generic Malaysian-market assumptions for engine
// development only. Replace with real numbers once Phase 0 closes.

export const BAY_WIDTHS_MM = [300, 450, 600, 900, 1200] as const;

export const OPENING_CONSTRAINTS = {
	minTotalWidthMm: 600,
	maxTotalWidthMm: 6000,
	minHeightMm: 1800,
	maxHeightMm: 3000,
	/** Gap left between the top of the unit and the ceiling. */
	ceilingClearanceMm: 50,
	// Ceiling height bounds live in ROOM_LIMITS (room.ts) — the ceiling belongs
	// to the customer's room, not to our catalogue.
	minBayWidthMm: 300,
	maxBayWidthMm: 1200,
} as const;

/** `swatch` is the base colour the shared grain map is tinted with. */
export const FINISHES: Record<
	FinishId,
	{
		label: string;
		group: "Laminate" | "Veneer";
		swatch: string;
		surchargeRmPerFt: number;
	}
> = {
	"laminate-white": {
		label: "White",
		group: "Laminate",
		swatch: "#ece7df",
		surchargeRmPerFt: 0,
	},
	"laminate-oak": {
		label: "Natural oak",
		group: "Laminate",
		swatch: "#c49a6a",
		surchargeRmPerFt: 10,
	},
	"laminate-ash": {
		label: "Grey ash",
		group: "Laminate",
		swatch: "#9c968d",
		surchargeRmPerFt: 10,
	},
	"laminate-walnut": {
		label: "Walnut",
		group: "Laminate",
		swatch: "#7b5233",
		surchargeRmPerFt: 15,
	},
	"veneer-oak": {
		label: "Oak",
		group: "Veneer",
		swatch: "#b88750",
		surchargeRmPerFt: 40,
	},
	"veneer-teak": {
		label: "Teak",
		group: "Veneer",
		swatch: "#9c6b3f",
		surchargeRmPerFt: 45,
	},
	"veneer-walnut": {
		label: "Walnut",
		group: "Veneer",
		swatch: "#5b3d28",
		surchargeRmPerFt: 55,
	},
	"veneer-blackwood": {
		label: "Blackwood",
		group: "Veneer",
		swatch: "#3b2a20",
		surchargeRmPerFt: 65,
	},
};

export const DOOR_TYPES: Record<
	DoorTypeId,
	{ label: string; surchargeRmPerFt: number }
> = {
	hinged: { label: "Hinged", surchargeRmPerFt: 0 },
	sliding: { label: "Sliding", surchargeRmPerFt: 20 },
};

export const ACCESSORIES: Record<
	AccessoryId,
	{ label: string; rateRm: number }
> = {
	"soft-close-hinge": { label: "Soft-close hinge", rateRm: 15 },
	"drawer-unit": { label: "Drawer unit", rateRm: 180 },
	"led-strip": { label: "LED strip", rateRm: 90 },
	"mirror-door": { label: "Mirror door upgrade", rateRm: 220 },
};

export const RATES = {
	baseRmPerFt: 280,
	mmPerFt: 304.8,
} as const;
