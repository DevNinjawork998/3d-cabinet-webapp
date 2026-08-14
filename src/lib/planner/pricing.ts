import {
	doorPriceRm,
	doorStyle,
	type FinishId,
	sizePriceRm,
	WORKTOP_THICKNESS_MM,
} from "./catalogue";
import { type PlannerLayout, type Positioned, positionsOf } from "./layout";

/**
 * Indicative planner pricing.
 *
 * PLACEHOLDER — every figure is invented. They are plausible Malaysian market
 * numbers so the demo produces a believable total, and they are not Infinite
 * Cabinet's. A `.skp` job carries geometry, not money, so rates have to come
 * from their price list; replace the tables in `catalogue.ts` in a
 * catalogue-only commit before anyone quotes from this.
 *
 * The model is **per unit**, which is how they sell: each carcass size is its
 * own priced line, each door is priced by the width it covers, and the two are
 * separate because the customer chooses them separately. The worktop is the one
 * thing still charged by the running foot — a worktop genuinely is a length,
 * cut to the run underneath it.
 *
 * ponytail: client-side only, fine while this is a demo with no quote attached.
 * CLAUDE.md's "price is computed server-side" rule bites the moment it feeds a
 * lead — move it behind the API then and keep this as the instant-feedback copy.
 */

export const MM_PER_FT = 304.8;

/** PLACEHOLDER — RM per running foot of worktop. */
export const WORKTOP_RM_PER_FT = 200;

export type PriceLine = {
	/** The cabinet this line is for, on per-cabinet lines. */
	id?: string;
	label: string;
	detail: string;
	amountRm: number;
};

export type KitchenPrice = {
	/** One line per cabinet, carcass and door shown separately. */
	cabinets: Array<
		PriceLine & { carcassRm: number; doorRm: number; doorLabel: string | null }
	>;
	categories: PriceLine[];
	worktopFt: number;
	totalRm: number;
};

const ftOf = (mm: number) => mm / MM_PER_FT;

/** What one placed cabinet costs: its size, plus its door if it has one. */
export function cabinetPriceRm(placed: Positioned): {
	carcassRm: number;
	doorRm: number;
} {
	const carcassRm = sizePriceRm(placed.family.id, placed.widthMm);
	const doorRm = placed.placed.doorStyleId
		? doorPriceRm(placed.placed.doorStyleId, placed.widthMm)
		: 0;
	return { carcassRm, doorRm };
}

/**
 * Worktop is cut to the cabinets under it, not to the wall — the same rule the
 * 3D uses to decide where the slab stops. Only families that carry one count,
 * and gaps break it, so the customer is not charged for the breaks.
 */
export function worktopFt(layout: PlannerLayout): number {
	const mm = positionsOf(layout, "floor")
		.filter((position) => position.family.hasWorktop)
		.reduce((total, position) => total + position.widthMm, 0);
	return ftOf(mm);
}

export function computePlannerPrice(
	layout: PlannerLayout,
	_finish: FinishId,
): KitchenPrice {
	const placed: Positioned[] = [
		...positionsOf(layout, "floor"),
		...positionsOf(layout, "wall"),
	];

	const cabinets = placed.map((position) => {
		const { carcassRm, doorRm } = cabinetPriceRm(position);
		const door = position.placed.doorStyleId
			? doorStyle(position.placed.doorStyleId)
			: undefined;
		return {
			id: position.placed.id,
			label: `${position.family.label} ${position.widthMm}`,
			detail: door ? `carcass + ${door.label} door` : "carcass only",
			carcassRm,
			doorRm,
			doorLabel: door?.label ?? null,
			amountRm: carcassRm + doorRm,
		};
	});

	const carcassTotal = cabinets.reduce((sum, line) => sum + line.carcassRm, 0);
	const doorTotal = cabinets.reduce((sum, line) => sum + line.doorRm, 0);
	const doorCount = cabinets.filter((line) => line.doorRm > 0).length;
	const tops = worktopFt(layout);

	const categories: PriceLine[] = [
		{
			label: "Carcasses",
			detail: `${cabinets.length} ${cabinets.length === 1 ? "unit" : "units"}`,
			amountRm: carcassTotal,
		},
		{
			label: "Doors",
			detail:
				doorCount === 0
					? "none chosen yet"
					: `${doorCount} ${doorCount === 1 ? "door" : "doors"}`,
			amountRm: doorTotal,
		},
		{
			label: "Worktop",
			detail: `${tops.toFixed(2)} ft @ RM ${WORKTOP_RM_PER_FT}/ft`,
			amountRm: tops * WORKTOP_RM_PER_FT,
		},
	];

	return {
		cabinets,
		categories,
		worktopFt: tops,
		totalRm: categories.reduce((total, line) => total + line.amountRm, 0),
	};
}

/** Kept so the worktop's thickness stays a single source of truth. */
export { WORKTOP_THICKNESS_MM };
