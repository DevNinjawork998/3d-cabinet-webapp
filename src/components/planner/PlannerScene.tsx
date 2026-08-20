"use client";

import { OrbitControls, Shadow } from "@react-three/drei";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	Object3D,
	PerspectiveCamera,
	Vector3 as Vector3Type,
} from "three";
import { Raycaster, Vector2, Vector3 } from "three";
import { Room } from "@/components/viewer/Room";
import {
	CONSTRUCTION,
	doorStyle,
	FINISHES,
	type FinishId,
	WALL_GAP_MM,
	WORKTOP_COLOR,
} from "@/lib/planner/catalogue";
import {
	allPositions,
	dropModule,
	moveModule,
	type PlannerLayout,
	positionsOf,
	rowEndMm,
} from "@/lib/planner/layout";
import { snapToCabinet, type Vec3Mm } from "@/lib/planner/measure";
import { Cabinet } from "./Cabinet";
import { MeasureOverlay } from "./MeasureOverlay";

const m = (mm: number) => mm / 1000;
const ROOM_HEIGHT_MM = 2700;

/** Looking into the corner, the angle a kitchen elevation is usually sold at. */
const VIEW_DIRECTION = new Vector3(0.25, 0.42, 1).normalize();

/**
 * Where this pointer ray crosses the vertical plane the cabinet stands in, in
 * run millimetres.
 *
 * The plane has to be the cabinet's own, not the floor. A wall unit hangs a
 * metre and a half up against the back wall, and the same ray reaches the floor
 * a long way in front of it — dragging against the floor plane therefore moves
 * the cabinet at a different rate from the cursor, and the further the camera
 * tilts the worse it gets.
 *
 * Read off the ray rather than `e.point`, which is wherever the ray happened to
 * strike a mesh and would offset the grab by the height of the door it hit.
 */
function runXFromRay(
	e: ThreeEvent<PointerEvent>,
	planeZ: number,
	runWidthMm: number,
): number {
	const { origin, direction } = e.ray;
	// Looking straight along the wall there is no crossing to find; the last
	// known x is better than a divide by zero.
	const worldX =
		Math.abs(direction.z) < 1e-6
			? origin.x
			: origin.x + direction.x * ((planeZ - origin.z) / direction.z);
	return worldX * 1000 + runWidthMm / 2;
}

function FitCamera({
	runWidthMm,
	roomDepthMm,
}: {
	runWidthMm: number;
	roomDepthMm: number;
}) {
	const camera = useThree((s) => s.camera) as PerspectiveCamera;
	const controls = useThree((s) => s.controls) as {
		target: Vector3Type;
		update: () => void;
	} | null;
	const aspect = useThree((s) => s.size.width / s.size.height);

	useEffect(() => {
		const width = m(runWidthMm);
		const height = m(ROOM_HEIGHT_MM);
		const centre = new Vector3(0, height / 2.2, 0);
		const halfFovV = (camera.fov * Math.PI) / 360;
		const halfFovH = Math.atan(Math.tan(halfFovV) * aspect);
		const radius = Math.hypot(width, height, m(roomDepthMm)) / 2;
		const distance = (radius / Math.sin(Math.min(halfFovV, halfFovH))) * 0.95;

		camera.position.copy(centre).addScaledVector(VIEW_DIRECTION, distance);
		camera.near = 0.1;
		camera.far = distance * 6;
		camera.updateProjectionMatrix();

		if (controls) {
			controls.target.copy(centre);
			controls.update();
		}
	}, [runWidthMm, roomDepthMm, aspect, camera, controls]);

	return null;
}

/**
 * Exposes a screen-to-run-position reading to the HTML around the canvas, so a
 * cabinet dragged out of the palette lands where it was dropped. The palette
 * uses HTML drag events, which never reach the canvas as pointer events — this
 * is the one bridge between the two.
 */
function DropPicker({
	runWidthMm,
	pickerRef,
}: {
	runWidthMm: number;
	pickerRef: React.RefObject<
		((clientX: number, clientY: number) => number) | null
	>;
}) {
	const camera = useThree((s) => s.camera);
	const gl = useThree((s) => s.gl);

	useEffect(() => {
		pickerRef.current = (clientX, clientY) => {
			const rect = gl.domElement.getBoundingClientRect();
			const ndc = new Vector3(
				((clientX - rect.left) / rect.width) * 2 - 1,
				-((clientY - rect.top) / rect.height) * 2 + 1,
				0.5,
			);
			const point = ndc.unproject(camera);
			const direction = point.sub(camera.position).normalize();
			// Read against the floor: only the horizontal position matters, and
			// which row the cabinet joins is decided by what was dragged.
			const t =
				Math.abs(direction.y) < 1e-6 ? 0 : -camera.position.y / direction.y;
			const worldX = camera.position.x + direction.x * t;
			return worldX * 1000 + runWidthMm / 2;
		};
		return () => {
			pickerRef.current = null;
		};
	}, [camera, gl, runWidthMm, pickerRef]);

	return null;
}

/**
 * Answers "which cabinet is under this screen point?" for the HTML layer.
 *
 * Dropping a door needs a real raycast, not the run-position maths `DropPicker`
 * does: a door lands on one specific carcass, and the cabinets are at different
 * depths and heights. Each cabinet group carries its id in `userData`, so the
 * first hit walks up to find whose it was.
 */
function CabinetHitTest({
	hitTestRef,
}: {
	hitTestRef: React.RefObject<
		((clientX: number, clientY: number) => string | null) | null
	>;
}) {
	const camera = useThree((s) => s.camera);
	const gl = useThree((s) => s.gl);
	const scene = useThree((s) => s.scene);

	useEffect(() => {
		const raycaster = new Raycaster();
		const ndc = new Vector2();

		hitTestRef.current = (clientX, clientY) => {
			const rect = gl.domElement.getBoundingClientRect();
			ndc.set(
				((clientX - rect.left) / rect.width) * 2 - 1,
				-((clientY - rect.top) / rect.height) * 2 + 1,
			);
			raycaster.setFromCamera(ndc, camera);

			for (const hit of raycaster.intersectObjects(scene.children, true)) {
				for (let node: Object3D | null = hit.object; node; node = node.parent) {
					const id = node.userData?.moduleId;
					if (typeof id === "string") return id;
				}
			}
			return null;
		};

		return () => {
			hitTestRef.current = null;
		};
	}, [camera, gl, scene, hitTestRef]);

	return null;
}

/**
 * The run itself, and the dragging of it.
 *
 * Two things here are deliberate and both were learned the hard way in
 * `PlacementControls`:
 *
 * - OrbitControls is disabled **synchronously** in the pointer-down handler.
 *   Doing it from an effect runs a frame too late, by which point the orbit
 *   gesture has already claimed the pointer and the camera swings instead of
 *   the cabinet.
 * - The drag plane is always mounted, and the dragged id lives in a ref.
 *   Mounting the plane in response to a state update puts it on screen a frame
 *   after the pointer went down, so the first moves land on nothing.
 */
function Run({
	layout,
	finishHex,
	selectedIds,
	doorTargetId,
	measureMode,
	onLayoutChange,
	onSelect,
	onMeasurePick,
	onMeasureHover,
}: {
	layout: PlannerLayout;
	finishHex: string;
	selectedIds: ReadonlySet<string>;
	/** The carcass a door is currently being dragged over, if any. */
	doorTargetId: string | null;
	/** While true, clicking a cabinet picks a measurement point instead of
	 * selecting or dragging it. */
	measureMode: boolean;
	onLayoutChange: (next: PlannerLayout) => void;
	/** `additive` comes from shift/ctrl/cmd: add to the selection rather than
	 * replace it. `null` clears. */
	onSelect: (id: string | null, additive: boolean) => void;
	onMeasurePick: (point: Vec3Mm) => void;
	/** The point the measuring tool would pick right now, so the overlay can
	 * show it before the click commits. `null` once the pointer leaves. */
	onMeasureHover: (point: Vec3Mm | null) => void;
}) {
	const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
	/**
	 * The live drag: which cabinet, and where on it the pointer took hold.
	 *
	 * The grab offset is what stops the cabinet snapping its left edge to the
	 * cursor the moment you touch it. It is re-anchored on every settled move
	 * for the reason written up in `lib/wardrobe/placement.ts` — push a cabinet
	 * into its neighbour and keep dragging, and without re-anchoring the pointer
	 * has to retrace every millimetre of that overshoot before the cabinet moves
	 * again, which reads as the cabinet sticking.
	 */
	const dragRef = useRef<{
		id: string;
		grabMm: number;
		/** World z of the plane this cabinet lives in — see runXFromRay. */
		planeZ: number;
	} | null>(null);
	const [dragging, setDragging] = useState(false);
	// Which cabinet the measuring tool is over right now, so it can glow the
	// same way a door-drag target does — the user needs to see which surface
	// a click is about to measure before committing to it.
	const [measureHoverId, setMeasureHoverId] = useState<string | null>(null);
	// Pointer moves outpace re-renders, so the handler reads the live layout
	// through a ref rather than a closed-over prop.
	const layoutRef = useRef(layout);
	layoutRef.current = layout;
	const runWidthMm = layout.wallWidthMm;

	const endDrag = useCallback(() => {
		const drag = dragRef.current;
		if (!drag) return;
		dragRef.current = null;
		setDragging(false);
		if (controls) controls.enabled = true;
		// Settle it: flush against a neighbour, a wall end, or the cabinet below.
		const current = [
			...layoutRef.current.floor,
			...layoutRef.current.wall,
		].find((placed) => placed.id === drag.id);
		if (!current) return;
		const next = dropModule(layoutRef.current, drag.id, current.xMm);
		if (next !== layoutRef.current) onLayoutChange(next);
	}, [controls, onLayoutChange]);

	// A drag can end anywhere — off the plane, outside the canvas, or with this
	// unmounting mid-gesture. All of them have to give orbiting back.
	useEffect(() => {
		window.addEventListener("pointerup", endDrag);
		window.addEventListener("pointercancel", endDrag);
		return () => {
			window.removeEventListener("pointerup", endDrag);
			window.removeEventListener("pointercancel", endDrag);
			if (controls) controls.enabled = true;
		};
	}, [endDrag, controls]);

	useEffect(() => {
		document.body.style.cursor = dragging ? "grabbing" : "auto";
		return () => {
			document.body.style.cursor = "auto";
		};
	}, [dragging]);

	useEffect(() => {
		if (measureMode) return;
		setMeasureHoverId(null);
		onMeasureHover(null);
	}, [measureMode, onMeasureHover]);

	// The group sits on the wall plane itself: everything in the run is placed
	// by its back face from here, with a scribe gap so the carcasses do not
	// z-fight with the wall they stand against.
	return (
		<group position={[0, 0, -m(layout.roomDepthMm) / 2 + m(WALL_GAP_MM)]}>
			{/* Always mounted: it catches the moves during a drag, and a press on
			    bare wall clears the selection.

			    It stands upright in the wall plane rather than lying on the floor.
			    A ray aimed at a wall cabinet is travelling downwards steeply, and
			    crosses the floor metres behind the room — a floor-level catcher is
			    simply not in its path, so the drag received no moves at all and the
			    cabinet sat still while the pointer went on without it. */}
			<mesh
				position={[0, m(ROOM_HEIGHT_MM) / 2, 0]}
				onPointerDown={() => onSelect(null, false)}
				onPointerMove={(e) => {
					const drag = dragRef.current;
					if (!drag) return;
					e.stopPropagation();

					const pointerMm = runXFromRay(e, drag.planeZ, runWidthMm);
					const next = moveModule(
						layoutRef.current,
						drag.id,
						pointerMm - drag.grabMm,
					);
					if (next === layoutRef.current) return;

					// Re-anchor to where the cabinet actually ended up, so a cabinet
					// held against its neighbour starts moving the instant you reverse.
					const settled = [...next.floor, ...next.wall].find(
						(placed) => placed.id === drag.id,
					);
					if (settled) drag.grabMm = pointerMm - settled.xMm;
					onLayoutChange(next);
				}}
			>
				<planeGeometry args={[m(runWidthMm) * 4, m(ROOM_HEIGHT_MM) * 3]} />
				<meshBasicMaterial transparent opacity={0} depthWrite={false} />
			</mesh>

			<ContactShadows layout={layout} runWidthMm={runWidthMm} />
			<Worktop layout={layout} runWidthMm={runWidthMm} />

			{allPositions(layout).map((position) => (
				<Cabinet
					key={position.placed.id}
					moduleId={position.placed.id}
					family={position.family}
					widthMm={position.widthMm}
					door={
						position.placed.doorStyleId
							? (doorStyle(position.placed.doorStyleId) ?? null)
							: null
					}
					xMm={position.xMm}
					runWidthMm={runWidthMm}
					floorHeightMm={
						position.family.kind === "wall"
							? layout.hangingHeightMm
							: position.family.floorHeightMm
					}
					finishHex={finishHex}
					selected={selectedIds.has(position.placed.id)}
					highlighted={
						position.placed.id === doorTargetId ||
						(measureMode && measureHoverId === position.placed.id)
					}
					onPointerMove={
						measureMode
							? (e) => {
									e.stopPropagation();
									const hitMm: Vec3Mm = {
										x: e.point.x * 1000,
										y: e.point.y * 1000,
										z: e.point.z * 1000,
									};
									setMeasureHoverId(position.placed.id);
									onMeasureHover(snapToCabinet(hitMm, position, layout));
								}
							: undefined
					}
					onPointerOut={
						measureMode
							? () => {
									setMeasureHoverId((current) =>
										current === position.placed.id ? null : current,
									);
									onMeasureHover(null);
								}
							: undefined
					}
					onPointerDown={(e) => {
						e.stopPropagation();

						if (measureMode) {
							// `e.point` is already in the scene's outer world space —
							// the same space the picked points are stored and rendered
							// in — so no group-offset math is needed here, only mm
							// conversion and the snap to this cabinet's own geometry.
							const hitMm: Vec3Mm = {
								x: e.point.x * 1000,
								y: e.point.y * 1000,
								z: e.point.z * 1000,
							};
							onMeasurePick(snapToCabinet(hitMm, position, layout));
							return;
						}

						const additive = e.shiftKey || e.metaKey || e.ctrlKey;
						// Pressing one that is already selected keeps the selection, so a
						// group stays picked while its members are still draggable.
						if (additive || !selectedIds.has(position.placed.id)) {
							onSelect(position.placed.id, additive);
						}
						// The group is on the wall plane, so the cabinet's own centre
						// plane is half its depth in front of it.
						const planeZ =
							-m(layout.roomDepthMm) / 2 +
							m(WALL_GAP_MM) +
							m(position.family.depthMm) / 2;
						dragRef.current = {
							id: position.placed.id,
							grabMm: runXFromRay(e, planeZ, runWidthMm) - position.xMm,
							planeZ,
						};
						setDragging(true);
						if (controls) controls.enabled = false;
					}}
				/>
			))}
		</group>
	);
}

/**
 * Fake contact shadows. No shadow maps — the mobile budget in CLAUDE.md rules
 * those out, and a cabinet only really needs to look *attached* to what it
 * meets.
 *
 * The pool is deliberately wider and deeper than the cabinet standing on it: a
 * blob the same size as the footprint is hidden underneath the very thing it is
 * meant to ground, which is worth less than nothing.
 */
function ContactShadows({
	layout,
	runWidthMm,
}: {
	layout: PlannerLayout;
	runWidthMm: number;
}) {
	return (
		<>
			{positionsOf(layout, "floor").map((position) => (
				<Shadow
					key={position.placed.id}
					position={[
						m(position.xMm + position.widthMm / 2 - runWidthMm / 2),
						0.004,
						m(position.family.depthMm * 0.62),
					]}
					rotation={[-Math.PI / 2, 0, 0]}
					scale={[
						m(position.widthMm) * 1.15,
						m(position.family.depthMm) * 1.7,
						1,
					]}
					opacity={0.5}
					color="#151311"
				/>
			))}

			{/* Wall units get a soft patch on the wall itself, offset down so it
			    peeks out below the carcass — the cue that says "hung on that wall"
			    rather than "floating in front of it". */}
			{positionsOf(layout, "wall").map((position) => (
				<Shadow
					key={position.placed.id}
					position={[
						m(position.xMm + position.widthMm / 2 - runWidthMm / 2),
						m(layout.hangingHeightMm + position.family.heightMm / 2) - 0.06,
						0.002,
					]}
					scale={[
						m(position.widthMm) * 1.2,
						m(position.family.heightMm) * 1.15,
						1,
					]}
					opacity={0.28}
					color="#151311"
				/>
			))}
		</>
	);
}

function Worktop({
	layout,
	runWidthMm,
}: {
	layout: PlannerLayout;
	runWidthMm: number;
}) {
	// One slab per unbroken stretch of units that carry one — a worktop is cut
	// to the cabinets under it, not to the wall, so a unit without a top, a
	// unit of a different height, or a deliberate gap splits it. Contiguity is
	// decided by where the cabinets actually are, not by their order in the
	// list, and `hasWorktop` is the same flag pricing charges against.
	const spans: Array<{
		startMm: number;
		endMm: number;
		depthMm: number;
		topMm: number;
	}> = [];
	for (const position of positionsOf(layout, "floor")) {
		if (!position.family.hasWorktop) continue;
		const topMm = position.family.floorHeightMm + position.family.heightMm;
		const previous = spans[spans.length - 1];
		if (
			previous &&
			previous.topMm === topMm &&
			Math.abs(previous.endMm - position.xMm) < 1
		) {
			previous.endMm = position.xMm + position.widthMm;
			previous.depthMm = Math.max(previous.depthMm, position.family.depthMm);
		} else {
			spans.push({
				startMm: position.xMm,
				endMm: position.xMm + position.widthMm,
				depthMm: position.family.depthMm,
				topMm,
			});
		}
	}

	return (
		<>
			{spans.map((span) => {
				const widthMm = span.endMm - span.startMm;
				const overhangMm = 20;
				return (
					<mesh
						key={span.startMm}
						position={[
							m(span.startMm + widthMm / 2 - runWidthMm / 2),
							m(span.topMm + CONSTRUCTION.worktopThicknessMm / 2),
							m((span.depthMm + overhangMm) / 2),
						]}
					>
						<boxGeometry
							args={[
								m(widthMm),
								m(CONSTRUCTION.worktopThicknessMm),
								m(span.depthMm + overhangMm),
							]}
						/>
						<meshStandardMaterial color={WORKTOP_COLOR} roughness={0.4} />
					</mesh>
				);
			})}
		</>
	);
}

export default function PlannerScene({
	layout,
	finish,
	selectedIds,
	doorTargetId,
	measureMode = false,
	measurePoints = [],
	onLayoutChangeAction,
	onSelectAction,
	onMeasurePickAction,
	pickerRef,
	hitTestRef,
}: {
	layout: PlannerLayout;
	finish: FinishId;
	selectedIds: ReadonlySet<string>;
	doorTargetId: string | null;
	/** While true, clicking a cabinet picks a measurement point instead of
	 * selecting or dragging it. */
	measureMode?: boolean;
	/** The points picked so far — 0, 1, or 2 of them. */
	measurePoints?: Vec3Mm[];
	onLayoutChangeAction: (next: PlannerLayout) => void;
	onSelectAction: (id: string | null, additive: boolean) => void;
	onMeasurePickAction?: (point: Vec3Mm) => void;
	pickerRef: React.RefObject<
		((clientX: number, clientY: number) => number) | null
	>;
	/** Filled in by the scene: which cabinet is under this screen point. */
	hitTestRef: React.RefObject<
		((clientX: number, clientY: number) => string | null) | null
	>;
}) {
	const runWidthMm = layout.wallWidthMm;
	const finishHex =
		FINISHES.find((f) => f.id === finish)?.hex ?? FINISHES[0].hex;
	const [hoverPoint, setHoverPoint] = useState<Vec3Mm | null>(null);

	return (
		<Canvas
			dpr={[1, 2]}
			// Required to read the canvas back as an image for the quote screenshot.
			gl={{ preserveDrawingBuffer: true }}
			camera={{ fov: 45 }}
			// Without this, dragging a cabinet scrolls the page on Android.
			style={{ touchAction: "none" }}
			onPointerMissed={() => onSelectAction(null, false)}
		>
			<color attach="background" args={["#f4f2ee"]} />
			<ambientLight intensity={1.5} />
			<directionalLight position={[4, 7, 6]} intensity={2} />

			<Room
				width={Math.max(m(runWidthMm) + 1.2, 4)}
				depth={m(layout.roomDepthMm)}
				height={m(ROOM_HEIGHT_MM)}
			/>

			<Run
				layout={layout}
				finishHex={finishHex}
				selectedIds={selectedIds}
				doorTargetId={doorTargetId}
				measureMode={measureMode}
				onLayoutChange={onLayoutChangeAction}
				onSelect={onSelectAction}
				onMeasurePick={onMeasurePickAction ?? (() => {})}
				onMeasureHover={setHoverPoint}
			/>
			<MeasureOverlay
				points={measurePoints}
				previewPoint={measureMode ? hoverPoint : null}
			/>

			<DropPicker runWidthMm={runWidthMm} pickerRef={pickerRef} />
			<CabinetHitTest hitTestRef={hitTestRef} />
			{/* `makeDefault` is what lets Run reach these through useThree and
			    switch orbiting off for the duration of a cabinet drag. */}
			<OrbitControls
				makeDefault
				enablePan={false}
				maxPolarAngle={Math.PI / 2 - 0.05}
			/>
			<FitCamera
				runWidthMm={Math.max(runWidthMm, rowEndMm(layout, "floor"))}
				roomDepthMm={layout.roomDepthMm}
			/>
		</Canvas>
	);
}
