import { kindOf } from "./extract";
import { normalise } from "./normalise";
import { readObj } from "./objRead";
import { boundsOf, classify } from "./roles";

/**
 * Measures a single-cabinet design file, for the cabinet-design library's
 * upload form.
 *
 * This is deliberately *not* the catalogue-import pipeline. That one reads a
 * whole wall of cabinets and has to work out where one ends and the next
 * begins; here the file is one product, which the admin is about to name and
 * price, so there is nothing to separate. Running the run-grouping over a lone
 * cabinet actively gets it wrong: `byEndPanels` measures the opening *between*
 * the two end panels, so an 800 carcass reports 768 — its clear width, minus
 * two 16mm boards.
 *
 * What the form wants is the size of the thing on the invoice, which is the
 * bounding box of the whole file. For the client's `BC 800mm.obj` that is
 * 800 × 870 × 588, and the 800 agrees with the name the drafter gave it.
 *
 * Everything else the pipeline does still applies, and matters: the units and
 * the up-axis are inferred, not assumed. That file is a SketchUp export in
 * inches, and the last one was a Blender export in metres.
 */

export type DesignCategory =
	| "BASE_CABINET"
	| "WALL_CABINET"
	| "TALL_CABINET"
	| "DRAWER_BASE"
	| "FRIDGE_HOUSING";

export type DesignMeasurement = {
	widthMm: number;
	heightMm: number;
	depthMm: number;
	/** Underside above the floor. A wall unit's is what makes it a wall unit. */
	floorHeightMm: number;
	category: DesignCategory;
	drawers: number;
	doors: number;
	/** Named parts found. Zero means we read nothing and the numbers are junk. */
	partCount: number;
	/** Anything the admin should check before trusting the fields. */
	notes: string[];
};

/** Read every dimension as a whole millimetre; nobody orders a 799.6 carcass. */
const mm = (v: number) => Math.round(v);

export function measureDesign(objText: string): DesignMeasurement | null {
	const obj = readObj(objText);
	if (obj.parts.length === 0) return null;

	const { parts, panelThicknessMm, notes } = normalise(obj.parts);
	const classified = classify(parts, boundsOf(parts, panelThicknessMm));

	const axis = (i: 0 | 1 | 2) => {
		const lo = Math.min(...parts.map((p) => p.minMm[i]));
		const hi = Math.max(...parts.map((p) => p.minMm[i] + p.sizeMm[i]));
		return { lo, size: hi - lo };
	};
	const x = axis(0);
	const depth = axis(1);
	const height = axis(2);

	const count = (role: string) =>
		classified.filter(
			(c) => c.role === role && c.part.sizeMm.every((d) => d > 0),
		).length;
	const drawers = count("drawerFront");
	const doors = count("door");

	const kind = kindOf(mm(height.lo), mm(height.size));
	const category: DesignCategory =
		kind === "wall"
			? "WALL_CABINET"
			: kind === "tall"
				? "TALL_CABINET"
				: drawers > 0
					? "DRAWER_BASE"
					: "BASE_CABINET";

	const warnings = [...notes];
	if (classified.every((c) => c.source === "geometry")) {
		warnings.push(
			"No part name in this file was recognisable, so everything was worked out from shape alone. Check the dimensions against the drawing.",
		);
	}

	return {
		widthMm: mm(x.size),
		heightMm: mm(height.size),
		depthMm: mm(depth.size),
		floorHeightMm: mm(height.lo),
		category,
		drawers,
		doors,
		partCount: parts.length,
		notes: warnings,
	};
}
