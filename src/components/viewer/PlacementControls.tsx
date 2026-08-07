"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useFrame, useThree } from "@react-three/fiber";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { Group } from "three";
import {
	dragStep,
	type Placement,
	shortestAngleDeltaDeg,
	snapPlacement,
} from "@/lib/wardrobe/placement";
import type { RoomSize } from "@/lib/wardrobe/room";
import { smoothDamp } from "./smoothDamp";

type Drag =
	| { kind: "move"; grabXMm: number; grabZMm: number }
	| { kind: "rotate" };

/**
 * Where this pointer ray crosses the floor, in mm. Taken from the ray rather
 * than the intersection point: `e.point` is wherever the ray struck whichever
 * mesh was hit, and on the grab box that is a point partway up the cabinet
 * face — using it as the grab origin offsets the unit by its own height the
 * moment the drag starts.
 */
function floorPointMm(e: ThreeEvent<PointerEvent>): {
	xMm: number;
	zMm: number;
} {
	const { origin, direction } = e.ray;
	// maxPolarAngle keeps the camera above the floor, so this never divides by
	// zero in practice; the guard is for the degenerate frame during a resize.
	if (Math.abs(direction.y) < 1e-6) {
		return { xMm: origin.x * 1000, zMm: origin.z * 1000 };
	}
	const t = -origin.y / direction.y;
	return {
		xMm: (origin.x + direction.x * t) * 1000,
		zMm: (origin.z + direction.z * t) * 1000,
	};
}

/**
 * Roughly how long the unit takes to reach the pointer, in seconds. Lower is
 * tighter and more literal; higher is smoother and more floaty. This is the
 * single dial for that trade — no value is both perfectly locked and perfectly
 * smooth.
 */
const FOLLOW_SECONDS = 0.09;
/** Rotation catches up a little quicker; a turn that lags reads as sloppy. */
const TURN_SECONDS = 0.07;
/** Below these, stop easing and land exactly. */
const SETTLE_MM = 0.5;
const SETTLE_DEG = 0.05;
/** Below this the follower is effectively stopped, in mm/s and deg/s. */
const SETTLE_SPEED = 1;

/** Radius of the rotate puck, in metres. */
const HANDLE_RADIUS = 0.09;
/** How far in front of the unit the rotate puck sits, in metres. */
const HANDLE_OFFSET = 0.28;

/**
 * Drag-to-place. The move handler lives on an invisible floor plane rather than
 * on the wardrobe itself: R3F reports `e.point` as the world-space hit on
 * whatever mesh was struck, and a plane that doesn't move gives a stable
 * reading, where the wardrobe would chase the cursor and feed back on itself.
 *
 * Children are the wardrobe. They render inside the placed group so the whole
 * unit is the grab target.
 */
export function PlacementControls({
	room,
	placement,
	runWidthMm,
	depthMm,
	heightMm,
	onChange,
	children,
}: {
	room: RoomSize;
	placement: Placement;
	runWidthMm: number;
	depthMm: number;
	heightMm: number;
	onChange: (next: Placement) => void;
	children: React.ReactNode;
}) {
	// The drag lives in a ref, not state: pointermove fires far faster than
	// React re-renders, and a handler closed over stale state would drop every
	// move that lands before the re-render — which on a touch flick is all of
	// them. State mirrors it purely so the cursor and the puck can repaint.
	const dragRef = useRef<Drag | null>(null);
	const [dragging, setDragging] = useState<Drag["kind"] | null>(null);
	const [hovered, setHovered] = useState(false);
	const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

	// Two positions, deliberately. `target` is where the pointer is asking for
	// the unit to be; `live` is where it actually is, easing toward the target
	// every rendered frame. Hard-locking the transform to the pointer ties the
	// motion to the event rate, and the moment a frame runs long the browser
	// coalesces the queued pointermoves and the unit lurches between whichever
	// ones survived. Following a target instead means motion comes from the
	// frame loop, so a dropped event costs smoothness rather than showing as a
	// jump. It is how IKEA's planners feel the way they do.
	const groupRef = useRef<Group>(null);
	const targetRef = useRef<Placement>(placement);
	const liveRef = useRef<Placement>(placement);
	// Carried between frames. This is what makes turns smooth: the unit
	// decelerates and accelerates through a direction change instead of
	// adopting a new speed instantly, which is what made a figure-8 feel
	// like it was ticking.
	const speedRef = useRef({ x: 0, z: 0, r: 0 });

	/** Ask for a new position. The frame loop decides how fast to get there. */
	const aim = useCallback((next: Placement) => {
		targetRef.current = next;
	}, []);

	const writeTransform = useCallback((at: Placement) => {
		liveRef.current = at;
		const group = groupRef.current;
		if (!group) return;
		group.position.set(at.xMm / 1000, 0, at.zMm / 1000);
		group.rotation.set(0, (at.rotationDeg * Math.PI) / 180, 0);
	}, []);

	useFrame((_, dt) => {
		const target = targetRef.current;
		const live = liveRef.current;
		const speed = speedRef.current;

		const dx = target.xMm - live.xMm;
		const dz = target.zMm - live.zMm;
		// Along the shortest arc: 350° -> 10° must travel +20°, not unwind 340°.
		const dr = shortestAngleDeltaDeg(live.rotationDeg, target.rotationDeg);

		if (
			Math.abs(dx) < SETTLE_MM &&
			Math.abs(dz) < SETTLE_MM &&
			Math.abs(dr) < SETTLE_DEG &&
			Math.abs(speed.x) < SETTLE_SPEED &&
			Math.abs(speed.z) < SETTLE_SPEED &&
			Math.abs(speed.r) < SETTLE_SPEED
		) {
			// Arrived and stopped. Land exactly and go quiet, rather than
			// asymptoting forever and dirtying the transform every frame.
			if (dx || dz || dr) {
				speed.x = 0;
				speed.z = 0;
				speed.r = 0;
				writeTransform(target);
			}
			return;
		}

		const x = smoothDamp(live.xMm, target.xMm, speed.x, FOLLOW_SECONDS, dt);
		const z = smoothDamp(live.zMm, target.zMm, speed.z, FOLLOW_SECONDS, dt);
		// Chase the delta rather than the absolute angle, so the shortest arc
		// above is what actually gets followed.
		const r = smoothDamp(0, dr, speed.r, TURN_SECONDS, dt);

		speed.x = x.velocity;
		speed.z = z.velocity;
		speed.r = r.velocity;

		writeTransform({
			xMm: x.value,
			zMm: z.value,
			rotationDeg: live.rotationDeg + r.value,
		});
	});

	// Props aim the unit whenever a drag isn't. Covers mount, "reset placement",
	// and re-seating when the room is resized — all of which now glide.
	useLayoutEffect(() => {
		if (dragRef.current) return;
		aim(placement);
	}, [placement, aim]);

	// Seed the transform the moment the group exists. Needed because target and
	// live start equal, so the frame loop settles immediately and never writes —
	// without this the unit would sit at the origin instead of its start position.
	const attachGroup = useCallback(
		(group: Group | null) => {
			groupRef.current = group;
			if (group) writeTransform(liveRef.current);
		},
		[writeTransform],
	);

	// Latest values, so the pointer handlers don't need re-binding mid-drag.
	const latest = useRef({ room, runWidthMm, depthMm });
	latest.current = { room, runWidthMm, depthMm };

	// Restore orbiting if this unmounts mid-drag. Disabling happens
	// synchronously in begin() — an effect runs a frame too late, by which
	// point OrbitControls has already claimed the pointerdown and the camera
	// swings along with the cabinet.
	useEffect(
		() => () => {
			if (controls) controls.enabled = true;
		},
		[controls],
	);

	useEffect(() => {
		const cursor = dragging ? "grabbing" : hovered ? "grab" : "auto";
		document.body.style.cursor = cursor;
		return () => {
			document.body.style.cursor = "auto";
		};
	}, [dragging, hovered]);

	const begin = (drag: Drag) => {
		dragRef.current = drag;
		if (controls) controls.enabled = false;
		setDragging(drag.kind);
	};

	const beginMove = (e: ThreeEvent<PointerEvent>) => {
		e.stopPropagation();
		const floor = floorPointMm(e);
		begin({
			kind: "move",
			grabXMm: floor.xMm - targetRef.current.xMm,
			grabZMm: floor.zMm - targetRef.current.zMm,
		});
	};

	const beginRotate = (e: ThreeEvent<PointerEvent>) => {
		e.stopPropagation();
		begin({ kind: "rotate" });
	};

	const onFloorMove = (e: ThreeEvent<PointerEvent>) => {
		const drag = dragRef.current;
		if (!drag) return;
		e.stopPropagation();
		const { room: r, runWidthMm: w, depthMm: d } = latest.current;
		// The target, never the eased position: re-anchoring the grab against a
		// position that is still catching up would feed the easing back into the
		// grab offset and the unit would drift away from the cursor.
		const p = targetRef.current;
		const { xMm: pointerXMm, zMm: pointerZMm } = floorPointMm(e);

		if (drag.kind === "move") {
			const step = dragStep(pointerXMm, pointerZMm, drag, p, r, w, d);
			// Carry the re-anchored grab into the next move, so pushing the unit
			// into a wall doesn't leave a dead zone on the way back out.
			drag.grabXMm = step.grab.grabXMm;
			drag.grabZMm = step.grab.grabZMm;
			aim(step.placement);
			return;
		}

		aim(
			snapPlacement(
				{
					...p,
					// atan2(x, z) rather than the usual (z, x): the puck sits on
					// the door side (+Z at 0°), so this keeps 0° pointing where
					// the doors face.
					rotationDeg:
						(Math.atan2(pointerXMm - p.xMm, pointerZMm - p.zMm) * 180) /
						Math.PI,
				},
				r,
				w,
				d,
			),
		);
	};

	const endDrag = useCallback(() => {
		if (!dragRef.current) return;
		// Cleared before onChange: the layout effect below skips while a drag is
		// live, and the commit we are about to make is what it needs to act on.
		dragRef.current = null;
		if (controls) controls.enabled = true;
		setDragging(null);

		const { room: r, runWidthMm: w, depthMm: d } = latest.current;
		// exact: nothing pulls the unit onto a wall mid-drag, so letting go
		// within reach of one is what actually seats it flush.
		const settled = snapPlacement(targetRef.current, r, w, d, true);
		// Aim, don't teleport — the unit eases into its final seat. Then hand
		// React the one and only state update of the whole drag.
		aim(settled);
		onChange(settled);
	}, [onChange, controls, aim]);

	// Releasing outside the canvas must still end the drag, or the unit keeps
	// following the cursor after the button is up.
	useEffect(() => {
		window.addEventListener("pointerup", endDrag);
		window.addEventListener("pointercancel", endDrag);
		return () => {
			window.removeEventListener("pointerup", endDrag);
			window.removeEventListener("pointercancel", endDrag);
		};
	}, [endDrag]);

	return (
		<>
			{/* Transform is driven imperatively via groupRef — deliberately no
			    position/rotation props, or any unrelated re-render (hover, drag
			    start) would snap the unit back to a stale prop mid-drag. */}
			<group ref={attachGroup}>
				{children}

				{/*
				  The grab target. R3F only raycasts objects that carry handlers
				  themselves, so a handler on the parent <group> never fires when
				  the children are plain meshes — the drag falls through to
				  OrbitControls and orbits the camera instead. One invisible box
				  over the whole unit is cheaper than wiring handlers into every
				  carcass panel, shelf and door in Wardrobe.
				*/}
				<mesh
					position={[0, heightMm / 2000, 0]}
					onPointerDown={beginMove}
					onPointerOver={(e) => {
						e.stopPropagation();
						setHovered(true);
					}}
					onPointerOut={() => setHovered(false)}
				>
					<boxGeometry
						args={[runWidthMm / 1000, heightMm / 1000, depthMm / 1000]}
					/>
					<meshBasicMaterial
						transparent
						opacity={0}
						depthWrite={false}
						colorWrite={false}
					/>
				</mesh>

				{/* Rotate puck, flat on the floor just in front of the doors. */}
				<mesh
					position={[0, 0.005, depthMm / 2000 + HANDLE_OFFSET]}
					rotation={[-Math.PI / 2, 0, 0]}
					onPointerDown={beginRotate}
				>
					<circleGeometry args={[HANDLE_RADIUS, 24]} />
					<meshBasicMaterial
						color={dragging === "rotate" ? "#1f1d1b" : "#5b5754"}
						transparent
						opacity={hovered || dragging ? 0.9 : 0.35}
					/>
				</mesh>
			</group>

			{/*
			  The surface the pointer is actually tracked against. Always mounted,
			  with the handler guarding on `drag`: mounting it only once a drag
			  starts loses every pointermove that arrives before React has
			  re-rendered, which is most of them on a fast flick or a touch drag.

			  Transparent rather than visible={false} — three's raycaster skips
			  invisible objects outright, so an invisible plane receives nothing.
			*/}
			<mesh
				position={[0, 0.001, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
				onPointerMove={onFloorMove}
				onPointerUp={endDrag}
			>
				{/* Oversized: the pointer must keep tracking past the room edge,
				    where clampPlacement takes over. */}
				<planeGeometry args={[room.widthMm / 250, room.depthMm / 250]} />
				<meshBasicMaterial
					transparent
					opacity={0}
					depthWrite={false}
					colorWrite={false}
				/>
			</mesh>
		</>
	);
}
