/**
 * Critically damped spring — the standard SmoothDamp (Game Programming Gems 4;
 * the same one Unity ships).
 *
 * Exponential damping is continuous in position but not in velocity: the
 * instant the target changes direction, the speed jumps. Dragging a figure-8
 * changes direction constantly, so that shows up as a rough, ticking quality.
 * Carrying velocity between frames fixes it at the source — the unit
 * decelerates and accelerates through a turn instead of snapping to a new
 * speed — which buys smoothness without simply adding lag.
 *
 * Critically damped means it converges as fast as possible *without
 * oscillating*, and the guard below stops it passing the target. That matters
 * here: the target is already wall-clamped, so a follower that never overshoots
 * its target can never be animated through a wall.
 *
 * Pure maths — no React, no three.js.
 */
export type Damped = { value: number; velocity: number };

export function smoothDamp(
	current: number,
	target: number,
	velocity: number,
	/** Roughly the time to reach the target, in seconds. */
	smoothTime: number,
	deltaTime: number,
): Damped {
	if (deltaTime <= 0) return { value: current, velocity };

	// A zero smoothTime would divide by zero; treat it as "snap".
	const time = Math.max(0.0001, smoothTime);
	const omega = 2 / time;
	const x = omega * deltaTime;
	// Padé approximation of e^-x — cheaper than Math.exp and accurate over the
	// range a frame delta can produce.
	const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

	const change = current - target;
	const temp = (velocity + omega * change) * deltaTime;

	let nextVelocity = (velocity - omega * temp) * exp;
	let value = target + (change + temp) * exp;

	// Never pass the target: without this a fast approach can tip just beyond
	// it, which for us would mean a hair inside a wall.
	if (target - current > 0 === value > target) {
		value = target;
		nextVelocity = (value - target) / deltaTime;
	}

	return { value, velocity: nextVelocity };
}
