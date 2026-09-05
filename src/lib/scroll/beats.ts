/**
 * The scroll maths behind the landing page's choreography, as pure functions.
 *
 * Framework-free on purpose, the same way `lib/planner` is: the client island
 * that calls these is a thin shell around them, so the arithmetic that decides
 * where a beat lands is testable without a DOM.
 *
 * The model: a **track** is a tall element containing a sticky stage. Its
 * progress is one number, 0 the moment its top reaches the viewport top and 1
 * once the runway underneath the sticky stage has been scrolled away. Every
 * animated property on the page is a function of that single number — which is
 * how Apple's product pages are built, where one `--vo-scroll-*` custom
 * property feeds dozens of elements.
 */

/** The unit interval, defended. */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v + 0);

/**
 * How far through a track the page has scrolled, 0..1.
 *
 * `rectTop` is the track's `getBoundingClientRect().top` — negative once its
 * top has passed above the viewport. The runway is everything the track has
 * beyond one viewport, since the sticky stage occupies that last viewport.
 */
export function trackProgress(
	rectTop: number,
	trackHeight: number,
	viewportHeight: number,
): number {
	const runway = trackHeight - viewportHeight;
	// A track no taller than the viewport never pins, so it has no runway to
	// divide by. Treat it as a switch at the moment its top passes.
	if (runway <= 0) return rectTop <= 0 ? 1 : 0;
	return clamp01(-rectTop / runway);
}

/**
 * Whether scroll choreography may run at all.
 *
 * Two gates, both refusals rather than degradations. Reduced motion means the
 * page stays where it is; a narrow viewport means the same, because the target
 * device is a mid-range Android phone in Klang Valley and it gets the
 * composition rather than the choreography.
 */
export function beatsEnabled(env: {
	reducedMotion: boolean;
	wideEnough: boolean;
}): boolean {
	return !env.reducedMotion && env.wideEnough;
}
