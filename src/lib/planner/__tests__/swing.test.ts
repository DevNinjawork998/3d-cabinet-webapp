import { describe, expect, it } from "vitest";
import {
	type BoxMm,
	INSET_OPEN_RAD,
	OVERLAY_OPEN_RAD,
	sharedMaxRad,
	swingOf,
} from "../swing";

/**
 * The client's own 900mm base-cabinet design, in the cabinet's own frame.
 * Real numbers, read off the drafted mesh: the carcass front face is at
 * z = 276.1 and the door spans 278 → 294, so the door's back face rests on
 * the carcass front. That is an overlay door, and its back face is the
 * hinge line.
 */
const carcass: BoxMm = {
	min: { x: -450.1, y: 100, z: -294 },
	max: { x: 450.1, y: 870, z: 276.1 },
};

/** The left leaf of that design's pair. */
const overlayLeaf: BoxMm = {
	min: { x: -448.3, y: 101.5, z: 278 },
	max: { x: -1.6, y: 868.6, z: 294 },
};

describe("overlay doors hinge on their back face", () => {
	it("turns about the face that rests on the carcass front", () => {
		expect(swingOf(overlayLeaf, carcass, "left").pivotZMm).toBe(278);
	});

	it("does not turn about the leaf's mid-thickness", () => {
		// The bug this function exists to prevent: a pivot at the leaf centre
		// puts the axis half a board behind the hinge, so the leaf orbits.
		const midThickness = (overlayLeaf.min.z + overlayLeaf.max.z) / 2;
		expect(swingOf(overlayLeaf, carcass, "left").pivotZMm).not.toBe(
			midThickness,
		);
	});

	it("classifies it overlay", () => {
		expect(swingOf(overlayLeaf, carcass, "left").fit).toBe("overlay");
	});

	it("hinges a left leaf on its left edge", () => {
		expect(swingOf(overlayLeaf, carcass, "left").pivotXMm).toBe(-448.3);
	});

	it("hinges a right leaf on its right edge", () => {
		expect(swingOf(overlayLeaf, carcass, "right").pivotXMm).toBe(-1.6);
	});
});

describe("the procedural fallback is an overlay too", () => {
	/**
	 * `parts.ts` puts a leaf's centre at `depthMm / 2 + FRONT_THICKNESS_MM / 2`,
	 * so its back face lands exactly on the carcass front. Floating point makes
	 * that a hair either side of exact, which is what `OVERLAY_TOL_MM` absorbs —
	 * without it the fallback would classify inset and hinge on the wrong edge.
	 */
	it("classifies a leaf whose back face sits exactly on the carcass front", () => {
		const depth = 607;
		const front = depth / 2;
		const box: BoxMm = {
			min: { x: -300, y: 100, z: front },
			max: { x: 300, y: 880, z: front + 18 },
		};
		const proceduralCarcass: BoxMm = {
			min: { x: -300, y: 0, z: -front },
			max: { x: 300, y: 880, z: front },
		};
		expect(swingOf(box, proceduralCarcass, "left").fit).toBe("overlay");
	});
});

describe("inset doors hinge on their outer front arris", () => {
	/** Sitting inside the opening rather than proud of it. */
	const insetLeaf: BoxMm = {
		min: { x: -280, y: 110, z: 240 },
		max: { x: -10, y: 860, z: 258 },
	};

	it("classifies it inset", () => {
		expect(swingOf(insetLeaf, carcass, "left").fit).toBe("inset");
	});

	it("turns about the front face, not the back one", () => {
		// An inset leaf hinged on its back face drives its outer corner straight
		// into the carcass side. The front arris is the only edge it can clear.
		expect(swingOf(insetLeaf, carcass, "left").pivotZMm).toBe(258);
	});

	it("opens less far than an overlay, because it binds sooner", () => {
		expect(swingOf(insetLeaf, carcass, "left").maxRad).toBeLessThan(
			swingOf(overlayLeaf, carcass, "left").maxRad,
		);
		expect(swingOf(insetLeaf, carcass, "left").maxRad).toBe(INSET_OPEN_RAD);
		expect(swingOf(overlayLeaf, carcass, "left").maxRad).toBe(OVERLAY_OPEN_RAD);
	});
});

describe("a leaf shaped like a flap is flagged, not animated", () => {
	it("flags a leaf much wider than it is tall", () => {
		const flap: BoxMm = {
			min: { x: -450, y: 600, z: 278 },
			max: { x: 450, y: 950, z: 294 },
		};
		expect(swingOf(flap, carcass, "left").suspectFlap).toBe(true);
	});

	it("leaves an ordinary taller-than-wide door alone", () => {
		expect(swingOf(overlayLeaf, carcass, "left").suspectFlap).toBe(false);
	});

	it("leaves a single wide-ish door alone below the ratio", () => {
		// 800 wide x 767 tall — wider than tall, but nothing like a flap.
		const wide: BoxMm = {
			min: { x: -400, y: 101.5, z: 278 },
			max: { x: 400, y: 868.6, z: 294 },
		};
		expect(swingOf(wide, carcass, "left").suspectFlap).toBe(false);
	});
});

describe("a leaf with a neighbour on its hinge side", () => {
	/**
	 * How far the free edge lands from the hinge stile, along the wall.
	 *
	 * This is the number the bug was made of. Past 90° a leaf swings forward
	 * and then back toward its own hinge, so its free edge crosses the stile
	 * and ends up over the neighbour's frontage — where the neighbour's own
	 * open leaf already is.
	 */
	const overhangMm = (widthMm: number, maxRad: number) =>
		-widthMm * Math.cos(maxRad);

	it("stops at 90 degrees so the leaf never crosses its own stile", () => {
		expect(swingOf(overlayLeaf, carcass, "left", true).maxRad).toBeCloseTo(
			Math.PI / 2,
		);
	});

	it("keeps the full swing when nothing is beside it", () => {
		expect(swingOf(overlayLeaf, carcass, "left", false).maxRad).toBe(
			OVERLAY_OPEN_RAD,
		);
	});

	it("defaults to the full swing, so an un-threaded caller is unchanged", () => {
		expect(swingOf(overlayLeaf, carcass, "left").maxRad).toBe(OVERLAY_OPEN_RAD);
	});

	it("never widens a swing — an inset door still binds at its own limit", () => {
		/** Sitting inside the opening, as in the inset block above. */
		const inset: BoxMm = {
			min: { x: -280, y: 110, z: 240 },
			max: { x: -10, y: 860, z: 258 },
		};
		const spec = swingOf(inset, carcass, "left", true);
		expect(spec.maxRad).toBeLessThanOrEqual(INSET_OPEN_RAD);
		expect(spec.maxRad).toBeCloseTo(Math.PI / 2);
	});

	it("boxed in, the free edge lands on the stile rather than past it", () => {
		const widthMm = overlayLeaf.max.x - overlayLeaf.min.x;
		const spec = swingOf(overlayLeaf, carcass, "left", true);
		expect(overhangMm(widthMm, spec.maxRad)).toBeCloseTo(0);
	});

	it("free, the 600mm leaf overhangs by the 205mm that caused this", () => {
		const spec = swingOf(overlayLeaf, carcass, "left", false);
		expect(overhangMm(600, spec.maxRad)).toBeCloseTo(205, 0);
	});
});

describe("every leaf on one cabinet opens the same amount", () => {
	const boxed = swingOf(overlayLeaf, carcass, "left", true);
	const free = swingOf(overlayLeaf, carcass, "left", false);

	it("takes the tightest limit across the leaves", () => {
		// The pair that made the first attempt at this look wrong: one half at
		// 110° because its side is a run end, the other at 90° because it
		// touches a neighbour.
		expect(sharedMaxRad([free, boxed])).toBe(boxed.maxRad);
		expect(sharedMaxRad([boxed, free])).toBe(boxed.maxRad);
	});

	it("leaves a cabinet with nothing beside it alone", () => {
		expect(sharedMaxRad([free, free])).toBe(OVERLAY_OPEN_RAD);
	});

	it("falls back to the full swing when there are no leaves", () => {
		expect(sharedMaxRad([])).toBe(OVERLAY_OPEN_RAD);
	});
});
