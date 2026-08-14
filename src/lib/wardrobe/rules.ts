import { WARDROBE_CATALOGUE } from "./catalogue";
import type { OpeningConstraints } from "./catalogueSchema";
import { ROOM_LIMITS } from "./room";
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
export function splitIntoBays(
	openingWidthMm: number,
	constraints: OpeningConstraints = WARDROBE_CATALOGUE.openingConstraints,
): BaySuggestion[] {
	if (openingWidthMm <= 0) return [];

	const count = Math.max(
		1,
		Math.ceil(openingWidthMm / constraints.maxBayWidthMm),
	);
	const width = openingWidthMm / count;

	return Array.from({ length: count }, (_, order) => ({ width, order }));
}

export type ValidationIssue = { path: string; message: string };
export type ValidationResult = { valid: boolean; issues: ValidationIssue[] };

export function validateDesign(
	design: DesignDocument,
	constraints: OpeningConstraints = WARDROBE_CATALOGUE.openingConstraints,
): ValidationResult {
	const issues: ValidationIssue[] = [];
	const { opening, bays } = design;

	if (opening.width < constraints.minTotalWidthMm) {
		issues.push({
			path: "opening.width",
			message: `Opening width must be at least ${constraints.minTotalWidthMm}mm`,
		});
	}
	if (opening.width > constraints.maxTotalWidthMm) {
		issues.push({
			path: "opening.width",
			message: `Opening width must be at most ${constraints.maxTotalWidthMm}mm`,
		});
	}
	if (opening.height < constraints.minHeightMm) {
		issues.push({
			path: "opening.height",
			message: `Wardrobe height must be at least ${constraints.minHeightMm}mm`,
		});
	}
	if (opening.height > constraints.maxHeightMm) {
		issues.push({
			path: "opening.height",
			message: `Wardrobe height must be at most ${constraints.maxHeightMm}mm`,
		});
	}
	if (opening.height > opening.ceilingHeight - constraints.ceilingClearanceMm) {
		issues.push({
			path: "opening.height",
			message: `Wardrobe must leave ${constraints.ceilingClearanceMm}mm below the ${opening.ceilingHeight}mm ceiling`,
		});
	}

	if (opening.ceilingHeight < ROOM_LIMITS.minHeightMm) {
		issues.push({
			path: "opening.ceilingHeight",
			message: `Ceiling height must be at least ${ROOM_LIMITS.minHeightMm}mm`,
		});
	}
	if (opening.ceilingHeight > ROOM_LIMITS.maxHeightMm) {
		issues.push({
			path: "opening.ceilingHeight",
			message: `Ceiling height must be at most ${ROOM_LIMITS.maxHeightMm}mm`,
		});
	}

	bays.forEach((bay, i) => {
		if (
			bay.width < constraints.minBayWidthMm ||
			bay.width > constraints.maxBayWidthMm
		) {
			issues.push({
				path: `bays[${i}].width`,
				message: `Bay width must be between ${constraints.minBayWidthMm} and ${constraints.maxBayWidthMm}mm`,
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
