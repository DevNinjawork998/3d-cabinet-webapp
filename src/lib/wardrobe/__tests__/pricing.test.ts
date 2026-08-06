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

		// bay-1 door: laminate-standard + hinged => no surcharge
		// bay-2 door: veneer (+45 RM/ft) + sliding (+20 RM/ft) over 900mm (2.9528ft)
		expect(
			breakdown.finishSurcharges.reduce((s, i) => s + i.amountRm, 0),
		).toBeCloseTo(132.874, 2);
		expect(
			breakdown.doorTypeSurcharges.reduce((s, i) => s + i.amountRm, 0),
		).toBeCloseTo(59.0551, 3);

		// accessories: soft-close-hinge (15) + drawer-unit (180) + led-strip (90)
		expect(breakdown.accessories.reduce((s, i) => s + i.amountRm, 0)).toBe(285);

		expect(breakdown.totalRm).toBeCloseTo(2130.4724, 3);
	});
});
