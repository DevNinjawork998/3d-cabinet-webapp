import { describe, expect, it } from "vitest";
import { photoRepeat } from "../grain";

/**
 * The scan is a photograph, so its pixels are square and the two axes have to
 * come out at the same physical scale. Everything here is that one property.
 */

/** Max World MW 13526 NW, Alorra Palermo Walnut: 369 × 800. */
const ALORRA = 800 / 369;
const SHEET_M = 1.22;

/** Metres of real board the door shows, across and down. */
function shown(
	direction: "vertical" | "horizontal",
	width: number,
	height: number,
	aspect: number,
) {
	const { u, v } = photoRepeat(direction, width, height, aspect);
	const [across, along] =
		direction === "horizontal"
			? [v * SHEET_M * aspect, u * SHEET_M]
			: [u * SHEET_M, v * SHEET_M * aspect];
	return { across, along };
}

describe("photoRepeat", () => {
	it("shows exactly the door's own size of board, both ways", () => {
		const { across, along } = shown("vertical", 0.6, 0.72, ALORRA);
		expect(across).toBeCloseTo(0.6, 6);
		expect(along).toBeCloseTo(0.72, 6);
	});

	it("reads a tall scan as tall, not as square", () => {
		const tall = photoRepeat("vertical", 0.6, 0.72, ALORRA);
		const square = photoRepeat("vertical", 0.6, 0.72, 1);
		expect(tall.u).toBeCloseTo(square.u, 6);
		expect(square.v / tall.v).toBeCloseTo(ALORRA, 6);
	});

	it("measures a horizontal grain against the swapped axes", () => {
		const { across, along } = shown("horizontal", 0.6, 0.72, ALORRA);
		expect(across).toBeCloseTo(0.6, 6);
		expect(along).toBeCloseTo(0.72, 6);
	});

	it("never repeats, so no door shows the seam", () => {
		const { u, v } = photoRepeat("vertical", 4, 9, ALORRA);
		expect(u).toBe(1);
		expect(v).toBe(1);
	});

	it("falls back to square before the image has loaded", () => {
		expect(photoRepeat("vertical", 0.61, 0.61, 1)).toEqual({
			u: 0.5,
			v: 0.5,
		});
	});
});
