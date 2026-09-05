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
/** Hard against the neighbour, and out in open space — the two ends of the
 * clearance range `swingOf` now takes. */
const TOUCHING = 0;
const CLEAR = Number.POSITIVE_INFINITY;

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
		expect(swingOf(overlayLeaf, carcass, "left", TOUCHING).maxRad).toBeCloseTo(
			Math.PI / 2,
		);
	});

	it("keeps the full swing when nothing is beside it", () => {
		expect(swingOf(overlayLeaf, carcass, "left", CLEAR).maxRad).toBe(
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
		const spec = swingOf(inset, carcass, "left", TOUCHING);
		expect(spec.maxRad).toBeLessThanOrEqual(INSET_OPEN_RAD);
		// And it keeps its full 95° even hard against a neighbour: this leaf is
		// set 170mm back inside its own opening, so it has that much room before
		// it reaches the carcass edge at all. The boolean this replaced could
		// not see the reveal and clamped every touching leaf to 90°.
		expect(carcass.min.x).toBeLessThan(inset.min.x - 150);
		expect(spec.maxRad).toBe(INSET_OPEN_RAD);
		expect(spec.clearMm).toBe(0);
	});

	it("boxed in, the free edge lands on the stile rather than past it", () => {
		const widthMm = overlayLeaf.max.x - overlayLeaf.min.x;
		const spec = swingOf(overlayLeaf, carcass, "left", TOUCHING);
		expect(overhangMm(widthMm, spec.maxRad)).toBeCloseTo(0);
	});

	it("free, the 600mm leaf overhangs by the 205mm that caused this", () => {
		const spec = swingOf(overlayLeaf, carcass, "left", CLEAR);
		expect(overhangMm(600, spec.maxRad)).toBeCloseTo(205, 0);
	});
});

describe("every leaf on one cabinet opens the same amount", () => {
	const boxed = swingOf(overlayLeaf, carcass, "left", TOUCHING);
	const free = swingOf(overlayLeaf, carcass, "left", CLEAR);

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

describe("a boxed-in leaf slides clear of its neighbour as it opens", () => {
	it("measures the shift off the design, not off our constants", () => {
		// The client's own 900mm design: a 16mm front with a 1.8mm reveal, not
		// the fallback's 18 and 4. An uploaded cabinet has to get its own number
		// or the cheat is wrong for every design but ours.
		const thickness = overlayLeaf.max.z - overlayLeaf.min.z;
		const reveal = overlayLeaf.min.x - carcass.min.x;
		expect(swingOf(overlayLeaf, carcass, "left", TOUCHING).clearMm).toBeCloseTo(
			thickness - reveal,
		);
		expect(thickness).toBe(16);
		expect(reveal).toBeCloseTo(1.8);
	});

	it("matches the procedural fallback's own thickness and gap", () => {
		const depth = 607;
		const front = depth / 2;
		// Exactly what `parts.ts` builds: an 18mm front inset by DOOR_GAP_MM.
		const leaf: BoxMm = {
			min: { x: -300 + 4, y: 100, z: front },
			max: { x: 300 - 4, y: 880, z: front + 18 },
		};
		const box: BoxMm = {
			min: { x: -300, y: 0, z: -front },
			max: { x: 300, y: 880, z: front },
		};
		expect(swingOf(leaf, box, "left", TOUCHING).clearMm).toBeCloseTo(18 - 4);
		expect(swingOf(leaf, box, "right", TOUCHING).clearMm).toBeCloseTo(18 - 4);
	});

	it("asks for nothing when there is no neighbour to clear", () => {
		expect(swingOf(overlayLeaf, carcass, "left", CLEAR).clearMm).toBe(0);
		expect(swingOf(overlayLeaf, carcass, "right", CLEAR).clearMm).toBe(0);
	});

	it("reads the reveal on whichever stile the leaf hangs on", () => {
		expect(swingOf(overlayLeaf, carcass, "left", TOUCHING).clearMm).toBeCloseTo(
			16 - (overlayLeaf.min.x - carcass.min.x),
		);
	});

	it("asks for nothing when the hinge stile is nowhere near the carcass edge", () => {
		// This is the left leaf of a pair, so its *right* stile is the middle of
		// the cabinet with 451mm of carcass beyond it. Nothing can be fouled
		// there, and a negative shift would drag the leaf the wrong way.
		expect(carcass.max.x - overlayLeaf.max.x).toBeGreaterThan(400);
		expect(swingOf(overlayLeaf, carcass, "right", TOUCHING).clearMm).toBe(0);
	});
});

describe("the swing answers to how much room there actually is", () => {
	/** A 444mm leaf on a 900 carcass, the fallback's 18mm front and 4mm reveal. */
	const box: BoxMm = {
		min: { x: -450, y: 0, z: -303.5 },
		max: { x: 450, y: 880, z: 303.5 },
	};
	const leaf: BoxMm = {
		min: { x: -446, y: 100, z: 303.5 },
		max: { x: -4, y: 870, z: 321.5 },
	};
	const deg = (rad: number) => (rad * 180) / Math.PI;

	it("opens fully with nothing beside it", () => {
		const spec = swingOf(leaf, box, "left", Number.POSITIVE_INFINITY);
		expect(deg(spec.maxRad)).toBeCloseTo(110);
		expect(spec.clearMm).toBe(0);
	});

	it("opens fully once the gap is wide enough to swallow the swing", () => {
		const spec = swingOf(leaf, box, "left", 400);
		expect(deg(spec.maxRad)).toBeCloseTo(110);
		expect(spec.clearMm).toBe(0);
	});

	it("stops short when the neighbour is close, rather than reaching past it", () => {
		// The case a boolean could not see: 100mm of gap is not touching, but a
		// 444mm leaf still reaches 152mm past its own stile at 110°.
		const spec = swingOf(leaf, box, "left", 100);
		expect(deg(spec.maxRad)).toBeGreaterThan(90);
		expect(deg(spec.maxRad)).toBeLessThan(110);
		expect(spec.clearMm).toBe(0);
	});

	it("opens further as the cabinet is slid clear", () => {
		const angles = [0, 50, 150, 300, 600].map(
			(gap) => swingOf(leaf, box, "left", gap).maxRad,
		);
		for (let i = 1; i < angles.length; i++) {
			expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1]);
		}
	});

	it("never folds below a right angle, and slides clear instead", () => {
		// Touching. Fitting the leaf inside the reveal alone would need 12.8°,
		// which is a door barely ajar, so it holds at 90° and takes the shift.
		const spec = swingOf(leaf, box, "left", 0);
		expect(deg(spec.maxRad)).toBeCloseTo(90);
		expect(spec.clearMm).toBeCloseTo(14);
	});

	it("needs no shift the moment the gap covers the thickness", () => {
		const spec = swingOf(leaf, box, "left", 40);
		expect(spec.clearMm).toBe(0);
	});
});
