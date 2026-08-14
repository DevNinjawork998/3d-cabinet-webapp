import { describe, expect, it } from "vitest";
import { wardrobeCatalogueSchema } from "../catalogueSchema";
import { computePrice } from "../pricing";
import { designDocumentSchema } from "../schema";
import catalogueFixture from "./fixtures/catalogue.json";
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

	it("prices off a catalogue passed in explicitly, not just the repo default", () => {
		const design = designDocumentSchema.parse(validDesign);
		const catalogue = wardrobeCatalogueSchema.parse(catalogueFixture);

		// The fixture matches today's live catalogue, so the total agrees...
		expect(computePrice(design, catalogue).totalRm).toBeCloseTo(2160, 3);

		// ...and changing only the fixture — not catalogue.ts — changes the price,
		// proving computePrice actually reads the parameter rather than the
		// module-scope constant it defaults to.
		const doubledRate = {
			...catalogue,
			rates: {
				...catalogue.rates,
				baseRmPerFt: catalogue.rates.baseRmPerFt * 2,
			},
		};
		expect(computePrice(design, doubledRate).totalRm).toBeGreaterThan(
			computePrice(design, catalogue).totalRm,
		);
	});

	it("refuses to silently price a finish the catalogue doesn't have", () => {
		const design = designDocumentSchema.parse(validDesign);
		const catalogue = wardrobeCatalogueSchema.parse(catalogueFixture);
		const { "laminate-white": _dropped, ...finishes } = catalogue.finishes;
		expect(() => computePrice(design, { ...catalogue, finishes })).toThrow(
			/unknown finish/,
		);
	});
});
