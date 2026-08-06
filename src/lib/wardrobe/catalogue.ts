import type { AccessoryId, DoorTypeId, FinishId } from "./schema";

// PLACEHOLDER — Phase 0 client catalogue/pricing spec not yet confirmed.
// All values below are generic Malaysian-market assumptions for engine
// development only. Replace with real numbers once Phase 0 closes.

export const BAY_WIDTHS_MM = [300, 450, 600, 900, 1200] as const;

export const OPENING_CONSTRAINTS = {
	minTotalWidthMm: 600,
	maxTotalWidthMm: 6000,
	minCeilingHeightMm: 2200,
	maxCeilingHeightMm: 3600,
	minBayWidthMm: 300,
	maxBayWidthMm: 1200,
} as const;

export const FINISHES: Record<
	FinishId,
	{ label: string; surchargeRmPerFt: number }
> = {
	"laminate-standard": { label: "Laminate — standard", surchargeRmPerFt: 0 },
	"laminate-premium": { label: "Laminate — premium", surchargeRmPerFt: 15 },
	veneer: { label: "Veneer", surchargeRmPerFt: 45 },
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
