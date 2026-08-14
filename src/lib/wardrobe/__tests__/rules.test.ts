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

	it("takes an explicit constraints override instead of always reading the catalogue default", () => {
		const narrow = { ...OPENING_CONSTRAINTS, maxBayWidthMm: 400 };
		const bays = splitIntoBays(1800, narrow);
		for (const bay of bays) expect(bay.width).toBeLessThanOrEqual(400);
		// The default (1200mm max) would have split 1800mm into 2 bays; the
		// override forces more, proving the parameter is what's read.
		expect(bays.length).toBeGreaterThan(splitIntoBays(1800).length);
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

	it("flags a wardrobe taller than the ceiling allows", () => {
		const design = designDocumentSchema.parse(validDesign);
		design.opening.ceilingHeight = 2500;
		design.opening.height = 2500;
		const result = validateDesign(design);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.path === "opening.height")).toBe(true);
	});

	it("flags a wardrobe below the minimum height", () => {
		const design = designDocumentSchema.parse(validDesign);
		design.opening.height = 1200;
		const result = validateDesign(design);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.path === "opening.height")).toBe(true);
	});

	it("flags bay widths that don't sum to the opening width", () => {
		const design = designDocumentSchema.parse(validDesign);
		design.bays[0].width = 300;
		const result = validateDesign(design);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.path === "bays")).toBe(true);
	});
});
