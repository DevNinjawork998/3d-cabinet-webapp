import type { DeliveryItem } from "./types";

/**
 * What the job weighs and how much space it takes, from its line items.
 *
 * Pure and framework-free — every carrier quote wants these two numbers, and
 * the admin form shows them live as items are typed.
 */

/**
 * Loose volume of the cabinets themselves, before anything is stacked.
 *
 * Real lorry space is not the sum of the boxes: carcasses travel blanketed and
 * upright, and nothing packs at 100%. The suggestion below applies a load
 * factor to account for that — this figure stays honest so it can be sent to a
 * carrier that asks for consignment volume.
 */
export function totalVolumeM3(items: DeliveryItem[]): number {
	const mm3 = items.reduce(
		(sum, i) => sum + i.qty * i.widthMm * i.heightMm * i.depthMm,
		0,
	);
	// 1 m³ = 1e9 mm³. Rounded to litres — a carrier form has never wanted more.
	return Math.round(mm3 / 1e6) / 1000;
}

/** Null when no item carries a weight, so "unknown" never reads as "zero". */
export function totalWeightKg(items: DeliveryItem[]): number | null {
	const weighed = items.filter((i) => i.weightKg !== null);
	if (weighed.length === 0) return null;
	const kg = weighed.reduce((sum, i) => sum + i.qty * (i.weightKg ?? 0), 0);
	return Math.round(kg * 10) / 10;
}

/** The longest single edge across all items — what decides if it fits at all. */
export function longestEdgeMm(items: DeliveryItem[]): number {
	return items.reduce(
		(max, i) => Math.max(max, i.widthMm, i.heightMm, i.depthMm),
		0,
	);
}

export type VehicleClass = "car" | "van" | "lorry_1t" | "lorry_3t";

/**
 * Load deck limits, smallest first. The first class every item and every total
 * fits inside is the suggestion.
 *
 * These are approximate Klang Valley deck sizes, not any one carrier's spec
 * sheet, and they are the knob to turn when a booking comes back "vehicle too
 * small". Capacities are the honest cargo figures; the packing slack lives in
 * LOAD_FACTOR below rather than being baked in here, so a corrected deck size
 * stays a corrected deck size.
 */
export const VEHICLE_LIMITS: {
	id: VehicleClass;
	label: string;
	maxVolumeM3: number;
	maxWeightKg: number;
	maxEdgeMm: number;
}[] = [
	{
		id: "car",
		label: "Car",
		maxVolumeM3: 0.5,
		maxWeightKg: 70,
		maxEdgeMm: 1200,
	},
	{
		id: "van",
		label: "Van",
		maxVolumeM3: 3,
		maxWeightKg: 600,
		maxEdgeMm: 2000,
	},
	{
		id: "lorry_1t",
		label: "1-tonne lorry",
		maxVolumeM3: 6,
		maxWeightKg: 1000,
		maxEdgeMm: 2400,
	},
	{
		id: "lorry_3t",
		label: "3-tonne lorry",
		maxVolumeM3: 16,
		maxWeightKg: 3000,
		maxEdgeMm: 4200,
	},
];

/**
 * How much of a deck's rated volume a real cabinet load actually uses. Panels
 * travel upright with blankets between them and nothing tessellates, so 0.7 is
 * the working assumption until someone loads a lorry and tells us otherwise.
 */
export const LOAD_FACTOR = 0.7;

export type VehicleSuggestion = {
	/** Null when the job exceeds even the largest class — it needs splitting. */
	id: VehicleClass | null;
	label: string;
	reason: string;
};

/**
 * The smallest vehicle the job plausibly fits. Advisory: it pre-selects a class
 * in the booking form, and the carrier's own quote is the authority.
 *
 * Weight is only tested when we have one. An unweighed job is sized on volume
 * and longest edge alone, which is the common case while the catalogue carries
 * no weights.
 */
export function suggestVehicle(items: DeliveryItem[]): VehicleSuggestion {
	if (items.length === 0) {
		return { id: null, label: "—", reason: "No items yet" };
	}

	const volume = totalVolumeM3(items);
	const weight = totalWeightKg(items);
	const edge = longestEdgeMm(items);

	for (const v of VEHICLE_LIMITS) {
		if (volume > v.maxVolumeM3 * LOAD_FACTOR) continue;
		if (weight !== null && weight > v.maxWeightKg) continue;
		if (edge > v.maxEdgeMm) continue;
		return {
			id: v.id,
			label: v.label,
			reason: `${volume} m³${weight === null ? "" : `, ${weight} kg`}, longest edge ${edge} mm`,
		};
	}

	return {
		id: null,
		label: "More than one lorry",
		reason: `${volume} m³${weight === null ? "" : `, ${weight} kg`}, longest edge ${edge} mm — split this across trips`,
	};
}
