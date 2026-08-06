import { describe, expect, it } from "vitest";
import { OPENING_CONSTRAINTS } from "../catalogue";
import { splitIntoBays, validateDesign } from "../rules";
import { designDocumentSchema } from "../schema";
import validDesign from "./fixtures/valid-design.json";

describe("splitIntoBays", () => {
	it("fills the opening exactly with standard widths when possible", () => {
		const bays = splitIntoBays(1800);
		expect(bays.reduce((sum, b) => sum + b.width, 0)).toBe(1800);
	});

	it("absorbs a remainder smaller than the smallest standard width into the last bay", () => {
		const bays = splitIntoBays(1250);
		expect(bays.reduce((sum, b) => sum + b.width, 0)).toBe(1250);
	});

	it("returns an empty array for a non-positive width", () => {
		expect(splitIntoBays(0)).toEqual([]);
	});

	it("never produces a bay outside the catalogue's bay width limits", () => {
		for (
			let width = OPENING_CONSTRAINTS.minTotalWidthMm;
			width <= OPENING_CONSTRAINTS.maxTotalWidthMm;
			width += 50
		) {
			for (const bay of splitIntoBays(width)) {
				expect(bay.width).toBeLessThanOrEqual(
					OPENING_CONSTRAINTS.maxBayWidthMm,
				);
				expect(bay.width).toBeGreaterThanOrEqual(
					OPENING_CONSTRAINTS.minBayWidthMm,
				);
			}
		}
	});
});

describe("validateDesign", () => {
	it("accepts the valid fixture", () => {
		const design = designDocumentSchema.parse(validDesign);
		const result = validateDesign(design);
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it("flags an opening narrower than the minimum", () => {
		const design = designDocumentSchema.parse(validDesign);
		design.opening.width = 200;
		const result = validateDesign(design);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.path === "opening.width")).toBe(true);
	});

	it("flags bay widths that don't sum to the opening width", () => {
		const design = designDocumentSchema.parse(validDesign);
		design.bays[0].width = 300;
		const result = validateDesign(design);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.path === "bays")).toBe(true);
	});
});
