import type { KitchenFinishId, ModuleType } from "./catalogue";
import { type KitchenLayout, type Positioned, positionsOf } from "./layout";

/**
 * Indicative kitchen pricing.
 *
 * PLACEHOLDER — every rate below is invented. They are plausible Malaysian
 * market figures so the demo produces a believable number, and they are not
 * Infinite Cabinet's. Phase 0 has not closed: the `.skp` import gives us their
 * module standard but a job file contains no money, so rates have to come from
 * their price list. Replace this whole table in a catalogue-only commit before
 * anyone quotes from it.
 *
 * The model is the Malaysian norm — **per running foot** of cabinetry, priced
 * separately for base, wall and tall runs, plus the worktop by the foot, plus a
 * per-foot adder for the door finish. Itemising per cabinet as well as per
 * category costs nothing here and makes the number checkable on screen.
 *
 * ponytail: client-side only, which is fine while this is a demo with no quote
 * attached. CLAUDE.md's "price is computed server-side" rule bites the moment
 * this feeds a lead — move it behind the API then, and keep this as the
 * instant-feedback copy.
 */

export const MM_PER_FT = 304.8;

/** PLACEHOLDER rates — see the note above. RM per running foot. */
export const RATES = {
	baseRmPerFt: 350,
	wallRmPerFt: 280,
	tallRmPerFt: 620,
	/** Worktop runs over the base cabinets only. */
	worktopRmPerFt: 200,
} as const;

/** PLACEHOLDER finish adders, RM per running foot of door. */
export const FINISH_SURCHARGE_RM_PER_FT: Record<KitchenFinishId, number> = {
	white: 0,
	"color-soft-gray": 15,
	"dulux-tapestry-beige": 15,
	"color-knoxville-green": 25,
	"rhone-oak": 30,
	"strata-noir": 35,
};

export type PriceLine = {
	/** The cabinet this line is for, on per-cabinet lines. Category subtotals
	 * have none. Lets the UI tie a line back to the thing in the room. */
	id?: string;
	label: string;
	detail: string;
	amountRm: number;
};

export type KitchenPrice = {
	/** One line per cabinet, in run order. */
	cabinets: PriceLine[];
	/** Category subtotals, for the summary. */
	categories: PriceLine[];
	worktopFt: number;
	totalRm: number;
};

const ftOf = (mm: number) => mm / MM_PER_FT;

const rateFor = (type: ModuleType) =>
	type.kind === "base"
		? RATES.baseRmPerFt
		: type.kind === "wall"
			? RATES.wallRmPerFt
			: RATES.tallRmPerFt;

/** What one cabinet costs: its own width in feet, at its kind's rate. */
export function cabinetPriceRm(
	type: ModuleType,
	finish: KitchenFinishId,
): number {
	const ft = ftOf(type.widthMm);
	return ft * (rateFor(type) + FINISH_SURCHARGE_RM_PER_FT[finish]);
}

/**
 * Worktop is cut to the base cabinets under it, not to the wall — the same
 * rule the 3D uses to decide where the slab stops. Tall units and gaps break
 * it, and the customer is not charged for the breaks.
 */
export function worktopFt(layout: KitchenLayout): number {
	const mm = positionsOf(layout, "floor")
		.filter((position) => position.type.kind === "base")
		.reduce((total, position) => total + position.type.widthMm, 0);
	return ftOf(mm);
}

export function computeKitchenPrice(
	layout: KitchenLayout,
	finish: KitchenFinishId,
): KitchenPrice {
	const placed: Positioned[] = [
		...positionsOf(layout, "floor"),
		...positionsOf(layout, "wall"),
	];

	const cabinets: PriceLine[] = placed.map((position) => ({
		id: position.placed.id,
		label: position.type.label,
		detail: `${ftOf(position.type.widthMm).toFixed(2)} ft @ RM ${
			rateFor(position.type) + FINISH_SURCHARGE_RM_PER_FT[finish]
		}/ft`,
		amountRm: cabinetPriceRm(position.type, finish),
	}));

	const byKind = (kind: ModuleType["kind"]) =>
		placed.filter((position) => position.type.kind === kind);

	const subtotal = (kind: ModuleType["kind"]) =>
		byKind(kind).reduce(
			(total, position) => total + cabinetPriceRm(position.type, finish),
			0,
		);

	const runFt = (kind: ModuleType["kind"]) =>
		ftOf(
			byKind(kind).reduce(
				(total, position) => total + position.type.widthMm,
				0,
			),
		);

	const tops = worktopFt(layout);
	const categories: PriceLine[] = [
		{
			label: "Base units",
			detail: `${runFt("base").toFixed(2)} ft run`,
			amountRm: subtotal("base"),
		},
		{
			label: "Wall units",
			detail: `${runFt("wall").toFixed(2)} ft run`,
			amountRm: subtotal("wall"),
		},
		{
			label: "Tall units",
			detail: `${runFt("tall").toFixed(2)} ft run`,
			amountRm: subtotal("tall"),
		},
		{
			label: "Worktop",
			detail: `${tops.toFixed(2)} ft @ RM ${RATES.worktopRmPerFt}/ft`,
			amountRm: tops * RATES.worktopRmPerFt,
		},
	];

	return {
		cabinets,
		categories,
		worktopFt: tops,
		totalRm: categories.reduce((total, line) => total + line.amountRm, 0),
	};
}
