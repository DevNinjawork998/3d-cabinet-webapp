/**
 * The scroll-scrubbed hero sequence, as pure functions.
 *
 * The hero draws a frame of a rendered exploded-view animation rather than a
 * still photograph: the cabinet comes apart as the visitor scrolls, which is
 * the one thing this product does that a photograph cannot show. The frames are
 * a fixed set of JPEGs in `/public/hero-frames`, built by
 * `scripts/build-hero-frames.sh` from the client's export.
 *
 * Framework-free, like `beats.ts` next to it, so the arithmetic that decides
 * which frame a scroll position lands on is testable without a DOM or a canvas.
 */

import { clamp01 } from "./beats";

/** How many frames `scripts/build-hero-frames.sh` writes. */
export const HERO_FRAME_COUNT = 72;

/** The width it writes them at. See `heroBackingScale` for why this is here. */
export const HERO_FRAME_WIDTH = 960;

/**
 * The frame the page opens on, and the one a visitor sees if the sequence
 * never runs — no JavaScript, reduced motion, or a phone. Frame 0 is the
 * cabinet assembled, which is the honest still: a finished product, not a
 * pile of parts mid-flight.
 */
export const HERO_POSTER_FRAME = 0;

/**
 * The last frame — the cabinet fully apart, every door, hinge and drawer box
 * hanging in the air. It is the still the admin surface signs in against,
 * because a catalogue of parts is exactly what is behind that door.
 */
export const HERO_EXPLODED_FRAME = HERO_FRAME_COUNT - 1;

export const heroFrameSrc = (index: number): string =>
	`/hero-frames/${String(index).padStart(3, "0")}.jpg`;

/**
 * Which frame a track progress lands on.
 *
 * `p` of exactly 1 must not fall off the end, so the last frame owns the whole
 * closing slice rather than a single unreachable point.
 */
export function frameIndexAt(p: number, count = HERO_FRAME_COUNT): number {
	if (count <= 0) return 0;
	const i = Math.floor(clamp01(p) * count);
	return i >= count ? count - 1 : i;
}

/**
 * The nearest frame that has actually decoded, or null while none has.
 *
 * Frames load in order over the network, so a fast scroll outruns them. Drawing
 * the nearest loaded frame keeps the cabinet on screen and merely coarse for a
 * moment; skipping the draw would blank the hero mid-scroll, which is far
 * worse. Backwards is searched first — behind the playhead is where the loader
 * has already been, so the answer is usually one step away.
 */
export function nearestLoaded(
	index: number,
	loaded: readonly boolean[],
): number | null {
	for (let i = index; i >= 0; i--) if (loaded[i]) return i;
	for (let i = index + 1; i < loaded.length; i++) if (loaded[i]) return i;
	return null;
}

/**
 * The device pixel ratio worth allocating a canvas backing store at.
 *
 * A retina display asks for two backing pixels per CSS pixel, but the frames
 * are only 960 wide: past 1:1 with the source, every extra backing pixel is
 * the browser interpolating pixels that were never in the JPEG. It is the
 * same picture at four times the fill cost and four times the memory, which on
 * the target device is the whole argument. So the ratio is capped where the
 * source runs out, and the browser's own upscale does the rest.
 *
 * Frames narrower than the stage — a wide desktop — still get the full ratio
 * they can use, which is what makes this a cap rather than a constant.
 */
export function heroBackingScale(
	cssWidth: number,
	devicePixelRatio: number,
	max: number,
	frameWidth = HERO_FRAME_WIDTH,
): number {
	if (cssWidth <= 0) return 1;
	const useful = frameWidth / cssWidth;
	return Math.max(1, Math.min(devicePixelRatio || 1, max, useful));
}
