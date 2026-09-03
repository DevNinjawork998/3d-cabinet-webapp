import { useFrame } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useRef } from "react";
import type { Group } from "three";
import { MathUtils } from "three";
import type { HingeSide } from "@/lib/planner/layout";

/**
 * A door leaf that swings on its stile.
 *
 * Shared by both render paths — `Cabinet.tsx` draws procedural leaves and
 * `DesignedCabinet.tsx` draws the drafted mesh, and `Cabinet.tsx` already
 * imports from `DesignedCabinet.tsx`, so this cannot live in either without a
 * cycle.
 *
 * Children stay in the cabinet's own frame: the outer group pivots at the
 * hinge, the inner one undoes that offset. So a caller passes the same
 * absolutely-positioned mesh it drew before and nothing about its coordinates
 * changes.
 *
 * The angle is damped rather than sprung. One eased number does not justify
 * `@react-spring/three` as a dependency, and `MathUtils.damp` is framerate
 * independent — which matters on the mid-range Android this is built for, where
 * a fixed per-frame lerp would swing visibly slower than on a desktop.
 */

/** How far a door stands open. A real hinge goes to ~110°; a shade under that
 * keeps a leaf at the end of a run from reading as detached from its carcass. */
const OPEN_RAD = MathUtils.degToRad(100);

/** Close enough to stop writing to the transform. */
const SETTLED_RAD = 0.001;

/** Which stile each leaf hangs on. A lone leaf takes the customer's choice; a
 * pair always hinges outward from the middle, so their handles meet — which is
 * both how a pair is really hung and where the handles already sat. */
export const hingeOf = (
	index: number,
	leaves: number,
	chosen: HingeSide,
): HingeSide => (leaves === 1 ? chosen : index === 0 ? "left" : "right");

export function Hinge({
	/** Where the stile is, in the cabinet's own frame, in metres. */
	x,
	/**
	 * How far forward the leaf sits, in the cabinet's own frame, in metres.
	 *
	 * Load-bearing, and it was the bug: the pivot used to be `[x, 0, 0]`, which
	 * put the axis at the carcass's depth CENTRE while the leaf lives at its
	 * front face. A door ~290mm in front of its own hinge line does not swing,
	 * it orbits — the leaf swept backwards through the carcass and sideways out
	 * of the cabinet, and its hinge edge travelled 438mm instead of staying put.
	 */
	z,
	side,
	open,
	children,
}: {
	x: number;
	z: number;
	side: HingeSide;
	open: boolean;
	children: ReactNode;
}) {
	const pivot = useRef<Group>(null);

	// Hinged left, the leaf extends toward +x, and a *negative* rotation about y
	// is what brings its free edge forward to the customer. Hinged right it
	// extends toward -x and the sign flips with it.
	const target = open ? OPEN_RAD * (side === "left" ? -1 : 1) : 0;

	useFrame((_, delta) => {
		const group = pivot.current;
		if (!group) return;
		const current = group.rotation.y;
		if (Math.abs(current - target) < SETTLED_RAD) {
			// Land exactly on the target once rather than easing at it forever.
			if (current !== target) group.rotation.y = target;
			return;
		}
		group.rotation.y = MathUtils.damp(current, target, 8, delta);
	});

	return (
		<group ref={pivot} position={[x, 0, z]}>
			<group position={[-x, 0, -z]}>{children}</group>
		</group>
	);
}
