import { OPENING_CONSTRAINTS } from "./catalogue";
import type { Bay, DesignDocument } from "./schema";

export type BaySuggestion = Pick<Bay, "width" | "order">;

/**
 * Split the opening into the fewest equal bays that each stay within the
 * catalogue's max bay width. Equal bays keep the elevation symmetrical, and
 * deriving the count from the max guarantees the result always satisfies
 * validateDesign — a greedy standard-width fill leaves a remainder that has
 * to be dumped somewhere, which can push a bay past the max.
 * The customer can still fine-tune individual bays in step 2.
 */
export function splitIntoBays(openingWidthMm: number): BaySuggestion[] {
	if (openingWidthMm <= 0) return [];

	const count = Math.max(
		1,
		Math.ceil(openingWidthMm / OPENING_CONSTRAINTS.maxBayWidthMm),
	);
	const width = openingWidthMm / count;

	return Array.from({ length: count }, (_, order) => ({ width, order }));
}

export type ValidationIssue = { path: string; message: string };
export type ValidationResult = { valid: boolean; issues: ValidationIssue[] };

export function validateDesign(design: DesignDocument): ValidationResult {
	const issues: ValidationIssue[] = [];
	const { opening, bays } = design;

	if (opening.width < OPENING_CONSTRAINTS.minTotalWidthMm) {
		issues.push({
			path: "opening.width",
			message: `Opening width must be at least ${OPENING_CONSTRAINTS.minTotalWidthMm}mm`,
		});
	}
	if (opening.width > OPENING_CONSTRAINTS.maxTotalWidthMm) {
		issues.push({
			path: "opening.width",
			message: `Opening width must be at most ${OPENING_CONSTRAINTS.maxTotalWidthMm}mm`,
		});
	}
	if (opening.ceilingHeight < OPENING_CONSTRAINTS.minCeilingHeightMm) {
		issues.push({
			path: "opening.ceilingHeight",
			message: `Ceiling height must be at least ${OPENING_CONSTRAINTS.minCeilingHeightMm}mm`,
		});
	}
	if (opening.ceilingHeight > OPENING_CONSTRAINTS.maxCeilingHeightMm) {
		issues.push({
			path: "opening.ceilingHeight",
			message: `Ceiling height must be at most ${OPENING_CONSTRAINTS.maxCeilingHeightMm}mm`,
		});
	}

	bays.forEach((bay, i) => {
		if (
			bay.width < OPENING_CONSTRAINTS.minBayWidthMm ||
			bay.width > OPENING_CONSTRAINTS.maxBayWidthMm
		) {
			issues.push({
				path: `bays[${i}].width`,
				message: `Bay width must be between ${OPENING_CONSTRAINTS.minBayWidthMm} and ${OPENING_CONSTRAINTS.maxBayWidthMm}mm`,
			});
		}
	});

	const bayWidthSum = bays.reduce((sum, bay) => sum + bay.width, 0);
	if (bays.length > 0 && Math.abs(bayWidthSum - opening.width) > 1) {
		issues.push({
			path: "bays",
			message: `Bay widths (${bayWidthSum}mm) must sum to the opening width (${opening.width}mm)`,
		});
	}

	return { valid: issues.length === 0, issues };
}
