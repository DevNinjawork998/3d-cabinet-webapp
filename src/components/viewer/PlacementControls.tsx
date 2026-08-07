"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
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
	snapPlacement,
} from "@/lib/wardrobe/placement";
import type { RoomSize } from "@/lib/wardrobe/room";

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

	// Where the unit actually is right now. A drag writes here and straight to
	// the three.js transform, never through React state: pointermove outruns
	// rendering, and once a render misses the frame budget the browser coalesces
	// the queued moves, so the unit lurches between whichever positions survived
	// instead of following the pointer. State is committed once, on release.
	const groupRef = useRef<Group>(null);
	const liveRef = useRef<Placement>(placement);

	const apply = useCallback((next: Placement) => {
		liveRef.current = next;
		const group = groupRef.current;
		if (!group) return;
		group.position.set(next.xMm / 1000, 0, next.zMm / 1000);
		group.rotation.set(0, (next.rotationDeg * Math.PI) / 180, 0);
	}, []);

	// Props drive the transform whenever a drag isn't. Covers mount, "reset
	// placement", and the unit being re-seated when the room is resized.
	useLayoutEffect(() => {
		if (dragRef.current) return;
		apply(placement);
	}, [placement, apply]);

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
			grabXMm: floor.xMm - liveRef.current.xMm,
			grabZMm: floor.zMm - liveRef.current.zMm,
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
		const p = liveRef.current;
		const { xMm: pointerXMm, zMm: pointerZMm } = floorPointMm(e);

		if (drag.kind === "move") {
			const step = dragStep(pointerXMm, pointerZMm, drag, p, r, w, d);
			// Carry the re-anchored grab into the next move, so pushing the unit
			// into a wall doesn't leave a dead zone on the way back out.
			drag.grabXMm = step.grab.grabXMm;
			drag.grabZMm = step.grab.grabZMm;
			apply(step.placement);
			return;
		}

		apply(
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
		const settled = snapPlacement(liveRef.current, r, w, d, true);
		// Show it straight away, then hand the one and only state update of the
		// whole drag to React.
		apply(settled);
		onChange(settled);
	}, [onChange, controls, apply]);

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
			<group ref={groupRef}>
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
