import { describe, expect, it } from "vitest";
import { OPENING_CONSTRAINTS } from "../catalogue";
import { buildDesign, PRESETS } from "../presets";
import { validateDesign } from "../rules";
import { designDocumentSchema } from "../schema";

describe("buildDesign", () => {
	it("keeps the fit-out inside the carcass at any height", () => {
		for (
			let heightMm = OPENING_CONSTRAINTS.minHeightMm;
			heightMm <= OPENING_CONSTRAINTS.maxHeightMm;
			heightMm += 100
		) {
			const design = buildDesign({
				widthMm: 2400,
				heightMm,
				finish: "laminate-oak",
				doorType: "hinged",
			});

			for (const item of design.interiors[0].items) {
				expect(item.heightFromFloor).toBeGreaterThan(0);
				expect(item.heightFromFloor).toBeLessThan(heightMm);
			}
		}
	});

	it("uses the ceiling height it is given, not a hardcoded one", () => {
		const design = buildDesign(
			{
				widthMm: 2400,
				heightMm: 2100,
				finish: "laminate-oak",
				doorType: "hinged",
			},
			2450,
		);
		expect(design.opening.ceilingHeight).toBe(2450);
	});
});

describe("PRESETS", () => {
	it("every preset is a schema-valid, rule-valid design", () => {
		for (const preset of PRESETS) {
			const design = buildDesign(preset);
			expect(designDocumentSchema.safeParse(design).success).toBe(true);
			expect(validateDesign(design)).toEqual({ valid: true, issues: [] });
		}
	});
});
