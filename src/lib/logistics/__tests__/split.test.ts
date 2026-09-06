import { describe, expect, it } from "vitest";
import {
	canGoByParcel,
	parcelCandidates,
	splitItems,
} from "@/lib/logistics/split";
import type { DeliveryItem } from "@/lib/logistics/types";

const item = (label: string, longest: number): DeliveryItem => ({
	label,
	qty: 1,
	widthMm: longest,
	heightMm: 200,
	depthMm: 200,
	weightKg: null,
});

const CARCASS = item("Base cabinet — 900 mm", 900);
const TALL = item("Fridge housing — 700 mm", 2100);
const RUNNERS = item("Soft-close runners, boxed", 700);
const HANDLES = item("Brushed brass handles, boxed", 200);

describe("parcelCandidates", () => {
	it("picks only the pieces inside the parcel girth cap", () => {
		expect(parcelCandidates([CARCASS, TALL, RUNNERS, HANDLES])).toEqual([
			0, 2, 3,
		]);
	});

	it("is empty when nothing fits", () => {
		expect(parcelCandidates([TALL])).toEqual([]);
	});

	// A 900mm carcass clears the girth rule and weighs 42 kg. Girth alone would
	// propose sending a lorry's worth of cabinets by parcel.
	it("refuses a piece that is short enough but too heavy", () => {
		expect(parcelCandidates([{ ...RUNNERS, weightKg: 42 }])).toEqual([]);
	});

	// Weight is optional on a line item; refusing what we have no figure for
	// would propose an empty split on most real jobs.
	it("lets an unweighed piece through", () => {
		expect(parcelCandidates([{ ...RUNNERS, weightKg: null }])).toEqual([0]);
	});
});

describe("canGoByParcel", () => {
	it("is true only when every piece is inside the cap", () => {
		expect(canGoByParcel([RUNNERS, HANDLES])).toBe(true);
		expect(canGoByParcel([RUNNERS, TALL])).toBe(false);
	});

	// A parcel network has nothing to price, so "yes" would be a wrong answer
	// the split preview would then offer as a bookable half.
	it("is false for an empty half", () => {
		expect(canGoByParcel([])).toBe(false);
	});
});

describe("splitItems", () => {
	it("moves the ticked pieces and keeps the rest, in their original order", () => {
		const { moved, kept } = splitItems(
			[CARCASS, TALL, RUNNERS, HANDLES],
			[3, 2],
		);
		expect(moved).toEqual([RUNNERS, HANDLES]);
		expect(kept).toEqual([CARCASS, TALL]);
	});

	// Out-of-range and repeated indexes come from a stale panel, not a typo —
	// dropping them silently would move an item nobody ticked.
	it("ignores repeats and indexes that are not there", () => {
		const { moved, kept } = splitItems([CARCASS, RUNNERS], [1, 1, 7, -1]);
		expect(moved).toEqual([RUNNERS]);
		expect(kept).toEqual([CARCASS]);
	});
});
