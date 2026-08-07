import { describe, expect, it } from "vitest";
import { computePrice } from "../pricing";
import { designDocumentSchema } from "../schema";
import validDesign from "./fixtures/valid-design.json";

describe("computePrice", () => {
	it("matches a hand-computed total for the fixture design", () => {
		const design = designDocumentSchema.parse(validDesign);
		const breakdown = computePrice(design);

		// 1800mm run = 5.905511... ft; base = 280 RM/ft
		expect(breakdown.runFt).toBeCloseTo(5.9055, 3);
		expect(breakdown.base.amountRm).toBeCloseTo(1653.5433, 3);

		// bay-1 door: laminate-white + hinged => no surcharge
		// bay-2 door: veneer-walnut (+55 RM/ft) + sliding (+20 RM/ft) over 900mm
		expect(
			breakdown.finishSurcharges.reduce((s, i) => s + i.amountRm, 0),
		).toBeCloseTo(162.4016, 3);
		expect(
			breakdown.doorTypeSurcharges.reduce((s, i) => s + i.amountRm, 0),
		).toBeCloseTo(59.0551, 3);

		// accessories: soft-close-hinge (15) + drawer-unit (180) + led-strip (90)
		expect(breakdown.accessories.reduce((s, i) => s + i.amountRm, 0)).toBe(285);

		expect(breakdown.totalRm).toBeCloseTo(2160, 3);
	});
});
