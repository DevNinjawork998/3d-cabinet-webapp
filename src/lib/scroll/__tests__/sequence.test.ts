import { describe, expect, it } from "vitest";
import {
	frameIndexAt,
	HERO_FRAME_COUNT,
	heroBackingScale,
	heroFrameSrc,
	nearestLoaded,
} from "../sequence";

describe("frameIndexAt", () => {
	it("opens on the first frame and closes on the last", () => {
		expect(frameIndexAt(0)).toBe(0);
		expect(frameIndexAt(1)).toBe(HERO_FRAME_COUNT - 1);
	});

	it("spreads the frames evenly across the track", () => {
		expect(frameIndexAt(0.5, 10)).toBe(5);
		expect(frameIndexAt(0.99, 10)).toBe(9);
	});

	it("clamps progress that has left the unit interval", () => {
		expect(frameIndexAt(-3, 10)).toBe(0);
		expect(frameIndexAt(4, 10)).toBe(9);
	});

	it("never returns a frame that does not exist", () => {
		expect(frameIndexAt(0.5, 0)).toBe(0);
	});
});

describe("heroFrameSrc", () => {
	it("zero-pads to the filenames the build script writes", () => {
		expect(heroFrameSrc(0)).toBe("/hero-frames/000.jpg");
		expect(heroFrameSrc(71)).toBe("/hero-frames/071.jpg");
	});
});

describe("nearestLoaded", () => {
	it("takes the frame itself when it has decoded", () => {
		expect(nearestLoaded(2, [true, true, true, false])).toBe(2);
	});

	it("falls back behind the playhead before ahead of it", () => {
		expect(nearestLoaded(3, [true, false, false, false, true])).toBe(0);
	});

	it("looks ahead only when nothing behind has decoded", () => {
		expect(nearestLoaded(1, [false, false, true])).toBe(2);
	});

	it("reports nothing to draw while no frame has decoded", () => {
		expect(nearestLoaded(1, [false, false, false])).toBeNull();
	});
});

describe("heroBackingScale", () => {
	it("gives a plain display one backing pixel per CSS pixel", () => {
		expect(heroBackingScale(800, 1, 2)).toBe(1);
	});

	it("gives a retina display two, while the source can feed them", () => {
		expect(heroBackingScale(400, 2, 2)).toBe(2);
	});

	it("stops where the source runs out rather than interpolating", () => {
		// 960px of JPEG across a 960px stage: a second backing pixel would be
		// invented, at four times the fill cost.
		expect(heroBackingScale(960, 2, 2)).toBe(1);
		expect(heroBackingScale(640, 2, 2)).toBe(1.5);
	});

	it("never drops below 1, however wide the stage", () => {
		expect(heroBackingScale(3000, 2, 2)).toBe(1);
	});

	it("survives a stage that has not been laid out yet", () => {
		expect(heroBackingScale(0, 2, 2)).toBe(1);
	});
});
