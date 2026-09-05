"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { beatsEnabled, trackProgress } from "@/lib/scroll/beats";

/** Below this width the page is composition only — no scroll choreography. */
const MIN_WIDTH_PX = 900;

/**
 * A tall track with a pinned stage, publishing its scroll progress as `--p`.
 *
 * Everything inside reads that one custom property through inheritance, so the
 * children stay server-rendered markup with no client cost of their own. The
 * island writes; CSS does the animating.
 *
 * Three things make this safe on a public marketing page:
 *
 *  - `data-beats` is absent until the effect runs, and every motion rule in
 *    `globals.css` is scoped under `[data-beats="on"]`. With no JavaScript, a
 *    slow hydration, reduced motion or a narrow screen, the page renders in its
 *    finished state rather than an invisible one.
 *  - The scroll listener exists only while the track is actually on screen, and
 *    is passive and rAF-throttled, so it never blocks a scroll.
 *  - `will-change` is granted on activation and taken back on deactivation.
 *    Left permanently in a stylesheet it is a memory cost on exactly the
 *    mid-range Android this app is built for.
 */
export default function ScrollTrack({
	viewports,
	className,
	children,
}: {
	viewports: number;
	className?: string;
	children: ReactNode;
}) {
	const trackRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const track = trackRef.current;
		if (!track) return;

		const enabled = beatsEnabled({
			reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
			wideEnough: matchMedia(`(min-width: ${MIN_WIDTH_PX}px)`).matches,
		});
		if (!enabled) return;

		let ticking = false;
		let listening = false;

		const write = () => {
			ticking = false;
			const p = trackProgress(
				track.getBoundingClientRect().top,
				track.offsetHeight,
				innerHeight,
			);
			track.style.setProperty("--p", p.toFixed(4));
		};

		const onScroll = () => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(write);
		};

		const start = () => {
			if (listening) return;
			listening = true;
			track.dataset.beats = "on";
			addEventListener("scroll", onScroll, { passive: true });
			write();
		};

		const stop = () => {
			if (!listening) return;
			listening = false;
			removeEventListener("scroll", onScroll);
			// Hold the last published value so the track keeps its end state,
			// but hand the compositor layers back.
			delete track.dataset.beats;
		};

		// Only listen while the track is anywhere near the viewport.
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) start();
				else stop();
			},
			{ rootMargin: "100% 0px" },
		);
		observer.observe(track);

		return () => {
			observer.disconnect();
			stop();
		};
	}, []);

	return (
		<div
			ref={trackRef}
			className={className}
			style={{ height: `${viewports * 100}svh` }}
		>
			<div className="sticky top-0 h-svh overflow-hidden">{children}</div>
		</div>
	);
}
