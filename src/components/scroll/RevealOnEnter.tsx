"use client";

import { useEffect } from "react";
import { beatsEnabled } from "@/lib/scroll/beats";

/**
 * Arms the page's `[data-reveal]` elements and reveals each one once.
 *
 * Renders nothing. It arms by setting `data-reveal-armed` on `<body>`, which is
 * what the hidden-state rule in `globals.css` is scoped to — so the elements are
 * only ever hidden while something is guaranteed to be able to show them again.
 * With no JavaScript the attribute never appears and every section is simply
 * visible.
 *
 * Reduced motion is handled in CSS rather than here: the elements still reveal,
 * they just do it without travel. Skipping the observer entirely would leave
 * them armed and hidden.
 *
 * Elements already inside the viewport when this mounts are revealed before the
 * page is armed at all, so nothing the visitor can already see ever animates.
 */
export default function RevealOnEnter() {
	useEffect(() => {
		// Same gate as ScrollTrack, read once. A reveal is a one-shot entrance —
		// unlike ScrollTrack there is no `change` listener here, because re-arming
		// mid-session would animate sections the visitor has already read, which
		// is worse than leaving them plainly visible.
		const enabled = beatsEnabled({
			reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
			wideEnough: matchMedia("(min-width: 900px)").matches,
		});
		if (!enabled) return;

		const targets = Array.from(
			document.querySelectorAll<HTMLElement>("[data-reveal]"),
		);
		if (targets.length === 0) return;

		// Anything already on screen is revealed before the page is armed.
		// Arming first would hide it for the frame or two before
		// IntersectionObserver's first asynchronous callback lands — a flash on
		// exactly the content the visitor was already looking at. Nothing
		// already visible should animate in.
		const pending: HTMLElement[] = [];
		for (const target of targets) {
			const { top, bottom } = target.getBoundingClientRect();
			if (top < innerHeight && bottom > 0) target.dataset.revealed = "";
			else pending.push(target);
		}

		if (pending.length === 0) {
			document.body.dataset.revealArmed = "";
			return () => {
				delete document.body.dataset.revealArmed;
			};
		}

		// Construct and start observing BEFORE arming: if the constructor were
		// ever to throw, the page must not be left armed (content hidden) with
		// nothing able to reveal it.
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const el = entry.target as HTMLElement;
					el.dataset.revealed = "";
					observer.unobserve(el);
				}
			},
			{ rootMargin: "0px 0px -12% 0px" },
		);

		for (const target of pending) observer.observe(target);

		document.body.dataset.revealArmed = "";

		return () => {
			observer.disconnect();
			delete document.body.dataset.revealArmed;
		};
	}, []);

	return null;
}
