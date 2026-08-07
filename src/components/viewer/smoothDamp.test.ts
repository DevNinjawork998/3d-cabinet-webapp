import { describe, expect, it } from "vitest";
import { smoothDamp } from "./smoothDamp";

const FRAME = 1 / 60;

/** Run the follower toward a fixed target, returning every position. */
function chase(target: number, smoothTime: number, frames: number, from = 0) {
	const path: number[] = [];
	let value = from;
	let velocity = 0;
	for (let i = 0; i < frames; i++) {
		({ value, velocity } = smoothDamp(
			value,
			target,
			velocity,
			smoothTime,
			FRAME,
		));
		path.push(value);
	}
	return path;
}

describe("smoothDamp", () => {
	it("converges on the target", () => {
		const path = chase(100, 0.08, 60);
		expect(path.at(-1)).toBeCloseTo(100, 3);
	});

	it("never overshoots, so it can never cross a wall the target respects", () => {
		// Sweep smoothTimes including ones far shorter than a frame, where a
		// naive spring blows past the target and rings.
		for (const smoothTime of [0.001, 0.01, 0.05, 0.08, 0.3]) {
			for (const value of chase(100, smoothTime, 120)) {
				expect(value).toBeLessThanOrEqual(100 + 1e-9);
				expect(value).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it("approaches monotonically — no oscillation", () => {
		const path = chase(100, 0.08, 120);
		for (let i = 1; i < path.length; i++) {
			expect(path[i]).toBeGreaterThanOrEqual(path[i - 1] - 1e-9);
		}
	});

	it("turns without chattering when the target sweeps back and forth", () => {
		// A real drag moves the target continuously, so this is the case that
		// matters — one lobe of a figure-8. The follower should reverse exactly
		// when the target does and no more: extra sign changes would be the
		// ticking, jittery quality that carrying velocity is meant to remove.
		let value = 0;
		let velocity = 0;
		let followerFlips = 0;
		let targetFlips = 0;
		let prevVelocity = 0;
		let prevTarget = 0;

		for (let i = 1; i <= 240; i++) {
			const target = 100 * Math.sin((i / 120) * Math.PI * 2);
			({ value, velocity } = smoothDamp(value, target, velocity, 0.08, FRAME));

			if (velocity * prevVelocity < 0) followerFlips++;
			if (
				target - prevTarget !== 0 &&
				(target - prevTarget) *
					(prevTarget - 100 * Math.sin(((i - 2) / 120) * Math.PI * 2)) <
					0
			) {
				targetFlips++;
			}
			prevVelocity = velocity;
			prevTarget = target;
		}

		expect(targetFlips).toBe(4); // two full cycles
		expect(followerFlips).toBe(targetFlips);
	});

	it("keeps acceleration bounded while chasing a moving target", () => {
		// Smoothness is bounded acceleration. A single violent frame is what
		// reads as a lurch, so compare the worst frame against the typical one.
		let value = 0;
		let velocity = 0;
		let prevVelocity = 0;
		const accelerations: number[] = [];

		for (let i = 1; i <= 240; i++) {
			const target = 100 * Math.sin((i / 120) * Math.PI * 2);
			({ value, velocity } = smoothDamp(value, target, velocity, 0.08, FRAME));
			// Skip the launch from rest — that transient is not what a drag in
			// progress feels like, and it alone would set the peak.
			if (i > 20) accelerations.push(Math.abs(velocity - prevVelocity) / FRAME);
			prevVelocity = velocity;
		}

		const sorted = [...accelerations].sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)];
		const peak = sorted.at(-1) as number;
		expect(peak / median).toBeLessThan(4);
	});

	it("is frame-rate independent", () => {
		// Same elapsed time at 30fps and 120fps should land in the same place.
		const run = (dt: number, steps: number) => {
			let value = 0;
			let velocity = 0;
			for (let i = 0; i < steps; i++) {
				({ value, velocity } = smoothDamp(value, 100, velocity, 0.1, dt));
			}
			return value;
		};
		expect(run(1 / 30, 15)).toBeCloseTo(run(1 / 120, 60), 0);
	});

	it("holds still when the delta time is zero", () => {
		const r = smoothDamp(5, 100, 3, 0.1, 0);
		expect(r).toEqual({ value: 5, velocity: 3 });
	});

	it("does not divide by zero on a zero smooth time", () => {
		const r = smoothDamp(0, 100, 0, 0, FRAME);
		expect(Number.isFinite(r.value)).toBe(true);
		// Effectively a snap — the clamped smoothTime leaves a rounding-scale
		// remainder, not a visible gap.
		expect(Math.abs(r.value - 100)).toBeLessThan(0.01);
	});
});
