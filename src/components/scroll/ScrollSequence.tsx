"use client";

import { useEffect, useRef } from "react";
import { beatsEnabled, trackProgress } from "@/lib/scroll/beats";
import {
	frameIndexAt,
	HERO_FRAME_COUNT,
	heroBackingScale,
	heroFrameSrc,
	nearestLoaded,
} from "@/lib/scroll/sequence";

/** Same threshold as `ScrollTrack` — under it the page is composition only. */
const MIN_WIDTH_PX = 900;

/**
 * How many frames are fetched at once. Not all of them: the whole set is ~1.7 MB
 * and firing it as one burst competes with everything else the landing page
 * still needs. A small window keeps the sequence usable early — `nearestLoaded`
 * covers the gap — without owning the connection.
 */
const CONCURRENCY = 4;

/** Retina, capped. Beyond 2 the backing store costs more than it shows. */
const MAX_DPR = 2;

/**
 * Scrubs a frame sequence against the enclosing `ScrollTrack`'s progress.
 *
 * Sits inside the track and finds it by ancestor rather than by prop, so the
 * hero markup stays a plain nesting. It computes progress itself with the same
 * pure `trackProgress` the track uses, rather than reading back the `--p` the
 * track writes: two rAF listeners have no ordering guarantee between them, and
 * a frame of lag on the thing that IS the motion is the one place it shows.
 *
 * The same three safeties as `ScrollTrack`, for the same reasons:
 *
 *  - The canvas is transparent until `data-seq="on"`, which only this effect
 *    sets. With no JavaScript, reduced motion or a phone, the poster image
 *    underneath is the hero and nothing here has any cost.
 *  - The scroll listener exists only while the track is near the viewport, and
 *    is passive and rAF-throttled.
 *  - Decoded frames are dropped on unmount. Seventy-two decoded 960px bitmaps
 *    are tens of megabytes resident — far more than the 1.7 MB on the wire —
 *    and holding them after the visitor has scrolled past is the kind of cost
 *    that only shows up on the mid-range Android this app is built for.
 */
export default function ScrollSequence() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const track = canvas?.closest<HTMLElement>("[data-track]");
		if (!canvas || !track) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const frames: (HTMLImageElement | null)[] = new Array(
			HERO_FRAME_COUNT,
		).fill(null);
		const loaded: boolean[] = new Array(HERO_FRAME_COUNT).fill(false);

		let cancelled = false;
		let ticking = false;
		let listening = false;
		let observer: IntersectionObserver | null = null;
		let drawn = -1;
		let width = 0;
		let height = 0;

		const paint = (index: number) => {
			const frame = frames[index];
			if (!frame || width === 0 || height === 0) return;
			// Contain, not cover: the cabinet reaching its full width is the
			// whole point of the sequence, and cover would crop the outermost
			// doors off at exactly the moment they arrive. The stage this draws
			// into is 16:9 like the frames, so in practice contain fills it and
			// the margins below are a rounding error — but they are what keeps
			// the drawing correct at any other stage shape.
			const scale = Math.min(width / frame.width, height / frame.height);
			const w = frame.width * scale;
			const h = frame.height * scale;
			// Contain leaves margins, so the previous frame would show through
			// them — and a frame mid-explosion is wider than the one before it.
			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(frame, (width - w) / 2, (height - h) / 2, w, h);
			drawn = index;
		};

		const render = () => {
			ticking = false;
			const p = trackProgress(
				track.getBoundingClientRect().top,
				track.offsetHeight,
				innerHeight,
			);
			const wanted = nearestLoaded(frameIndexAt(p), loaded);
			if (wanted !== null && wanted !== drawn) paint(wanted);
		};

		const schedule = () => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(render);
		};

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;
			const dpr = heroBackingScale(rect.width, devicePixelRatio, MAX_DPR);
			width = rect.width;
			height = rect.height;
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			// The backing store was just reallocated, so whatever was on it is
			// gone. Re-paint the same frame rather than waiting for a scroll.
			const again = drawn;
			drawn = -1;
			if (again >= 0) paint(again);
			else render();
		};

		// Frames are pulled in order off a shared cursor, so the earliest gaps
		// close first — which is where the visitor is, since a track only
		// starts at progress 0.
		let cursor = 0;
		let fetching = false;
		const pull = (): Promise<void> => {
			if (cancelled || cursor >= HERO_FRAME_COUNT) return Promise.resolve();
			const index = cursor++;
			return new Promise<void>((resolve) => {
				const img = new Image();
				// A frame that 404s or decodes badly is simply never marked
				// loaded; `nearestLoaded` steps over it and the loader carries
				// on. One missing file must not stop the other seventy-one.
				img.onload = () => {
					if (cancelled) return resolve();
					frames[index] = img;
					loaded[index] = true;
					if (index >= drawn) schedule();
					resolve();
				};
				img.onerror = () => resolve();
				img.src = heroFrameSrc(index);
			}).then(pull);
		};

		const start = () => {
			if (listening) return;
			listening = true;
			canvas.dataset.seq = "on";
			addEventListener("scroll", schedule, { passive: true });
			render();
		};

		const stop = () => {
			if (!listening) return;
			listening = false;
			removeEventListener("scroll", schedule);
			// Unlike `ScrollTrack`, the attribute stays: removing it would fade
			// the canvas out and expose the poster's frame 0 under a hero the
			// visitor may have scrolled halfway through. The canvas holds its
			// last frame; only the listener goes.
		};

		const arm = () => {
			if (observer) return;
			// Fetching starts here rather than at mount, so it happens only once
			// something has decided the sequence may run at all. On a phone that
			// is the difference between 1.7 MB and nothing. Once, not per arm:
			// a viewport crossing the width threshold twice must not put a
			// second set of workers on the same cursor.
			if (!fetching) {
				fetching = true;
				for (let i = 0; i < CONCURRENCY; i++) pull();
			}
			observer = new IntersectionObserver(
				([entry]) => {
					if (entry.isIntersecting) start();
					else stop();
				},
				{ rootMargin: "100% 0px" },
			);
			observer.observe(track);
		};

		const disarm = () => {
			if (!observer) return;
			observer.disconnect();
			observer = null;
			stop();
			delete canvas.dataset.seq;
		};

		// Live gates, matching `ScrollTrack`: an OS setting flipped mid-session
		// or a tablet rotating across the width threshold takes effect at once.
		const mqReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
		const mqWideEnough = matchMedia(`(min-width: ${MIN_WIDTH_PX}px)`);

		const evaluate = () => {
			if (
				beatsEnabled({
					reducedMotion: mqReducedMotion.matches,
					wideEnough: mqWideEnough.matches,
				})
			)
				arm();
			else disarm();
		};

		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(canvas);

		evaluate();
		mqReducedMotion.addEventListener("change", evaluate);
		mqWideEnough.addEventListener("change", evaluate);

		return () => {
			cancelled = true;
			mqReducedMotion.removeEventListener("change", evaluate);
			mqWideEnough.removeEventListener("change", evaluate);
			resizeObserver.disconnect();
			disarm();
			frames.fill(null);
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			// The poster image underneath carries the alt text and is never
			// removed, so to assistive technology this is the same picture and
			// announcing it twice would be noise.
			aria-hidden
			className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500 data-[seq=on]:opacity-100"
		/>
	);
}
