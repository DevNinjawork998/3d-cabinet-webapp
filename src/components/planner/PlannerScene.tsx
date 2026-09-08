"use client";

import { OrbitControls, Shadow } from "@react-three/drei";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	Object3D,
	PerspectiveCamera,
	Vector3 as Vector3Type,
} from "three";
import { Raycaster, Vector2, Vector3 } from "three";
import {
	CEILING_TRIM_MM,
	type Construction,
	constructionOf,
	doorStyleIn,
	type FinishId,
	WALL_GAP_MM,
	WORKTOP_COLOR,
} from "@/lib/planner/catalogue";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";
import {
	type ExposedSides,
	exposedSides,
	type SideGaps,
	sideGapsMm,
} from "@/lib/planner/exposure";
import type {
	PlannerEngine,
	PlannerLayout,
	Positioned,
} from "@/lib/planner/layout";
import {
	apertureMm,
	constrainToAxis,
	type MeasureAxis,
	type SnapPoint,
	snapToCabinet,
	type Vec3Mm,
} from "@/lib/planner/measure";
import { Cabinet } from "./Cabinet";
import { useCatalogue, useEngine } from "./CatalogueContext";
import { designPartBoxes, peekDesignMesh } from "./DesignedCabinet";
import { useFrontSurface, useGrain } from "./grain";
import { MeasureOverlay } from "./MeasureOverlay";
import { Room } from "./Room";

const m = (mm: number) => mm / 1000;

/**
 * The three ways to look at a run. `3d` is the selling angle; the other two
 * are the drawings a fitter actually works from, which is why the toggle
 * exists — a customer checking whether the run clears a window wants a
 * straight-on elevation, not a perspective view that foreshortens it.
 *
 * They are camera positions only. The geometry is identical in all three, so
 * nothing here can disagree with what gets quoted.
 */
export type PlannerView = "3d" | "elevation" | "plan";

/** Looking into the corner, the angle a kitchen elevation is usually sold at. */
const VIEW_DIRECTION: Record<PlannerView, Vector3> = {
	"3d": new Vector3(0.25, 0.42, 1).normalize(),
	elevation: new Vector3(0, 0, 1),
	// Not exactly straight down: OrbitControls gimbal-locks looking along its
	// own up axis, and a hair of tilt is cheaper than a custom controls rig.
	plan: new Vector3(0, 1, 0.02).normalize(),
};

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
	ceilingHeightMm,
	view,
}: {
	runWidthMm: number;
	roomDepthMm: number;
	ceilingHeightMm: number;
	view: PlannerView;
}) {
	const camera = useThree((s) => s.camera) as PerspectiveCamera;
	const controls = useThree((s) => s.controls) as {
		target: Vector3Type;
		update: () => void;
	} | null;
	const aspect = useThree((s) => s.size.width / s.size.height);

	useEffect(() => {
		const width = m(runWidthMm);
		const height = m(ceilingHeightMm);
		const depth = m(roomDepthMm);
		// Plan aims between the wall and the middle of the floor. Dead centre
		// pushes the run off the top edge — in a one-wall planner everything is
		// at the back — and aiming at the wall itself spends the frame on floor
		// nobody is looking at.
		const centre =
			view === "plan"
				? new Vector3(0, 0, -depth / 4)
				: new Vector3(0, height / 2.2, 0);
		const halfFovV = (camera.fov * Math.PI) / 360;
		const halfFovH = Math.atan(Math.tan(halfFovV) * aspect);
		// Only the axes actually facing the camera should decide the zoom.
		// Including all three in the flat views frames a diagonal nothing is
		// on, which reads as the drawing sitting in a corner of a mostly empty
		// canvas.
		const radius =
			view === "plan"
				? Math.hypot(width, depth) / 2
				: view === "elevation"
					? Math.hypot(width, height) / 2
					: Math.hypot(width, height, depth) / 2;
		const distance = (radius / Math.sin(Math.min(halfFovV, halfFovH))) * 0.95;

		camera.position
			.copy(centre)
			.addScaledVector(VIEW_DIRECTION[view], distance);
		camera.near = 0.1;
		camera.far = distance * 6;
		camera.updateProjectionMatrix();

		if (controls) {
			controls.target.copy(centre);
			controls.update();
		}
	}, [
		runWidthMm,
		roomDepthMm,
		ceilingHeightMm,
		view,
		aspect,
		camera,
		controls,
	]);

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
	catalogue,
	engine,
	finishHex,
	finishPhoto,
	selectedIds,
	openIds,
	doorsHidden,
	doorTargetId,
	measureMode,
	measureAxis,
	measureAnchor,
	onLayoutChange,
	onSelect,
	onMeasurePick,
	onMeasureHover,
	construction,
}: {
	layout: PlannerLayout;
	/** The published catalogue, resolved outside the canvas: `Run` renders
	 * inside `<Canvas>`, a separate reconciler root the outer React context
	 * does not reach. */
	catalogue: PlannerCatalogue;
	/** Likewise the engine built from it. */
	engine: PlannerEngine;
	finishHex: string;
	/** The uploaded decor photo for this finish, if the client has supplied one. */
	finishPhoto: string | null;
	selectedIds: ReadonlySet<string>;
	/** The cabinets whose doors are swung open. */
	openIds: ReadonlySet<string>;
	/** Take the fronts off entirely — the whole-run interior view. */
	doorsHidden: boolean;
	/** The carcass a door is currently being dragged over, if any. */
	doorTargetId: string | null;
	/** While true, clicking a cabinet picks a measurement point instead of
	 * selecting or dragging it. */
	measureMode: boolean;
	/** Which axis the second pick is constrained to. */
	measureAxis: MeasureAxis;
	/** The first picked point, once there is one — what the lock measures from.
	 * `null` while the first point is still being placed, since there is
	 * nothing to constrain against yet. */
	measureAnchor: Vec3Mm | null;
	onLayoutChange: (next: PlannerLayout) => void;
	/** `additive` comes from shift/ctrl/cmd: add to the selection rather than
	 * replace it. `null` clears. */
	onSelect: (id: string | null, additive: boolean) => void;
	onMeasurePick: (snap: SnapPoint) => void;
	/** What the measuring tool would pick right now, so the overlay can show it
	 * before the click commits. `null` once the pointer leaves. */
	onMeasureHover: (snap: SnapPoint | null) => void;
	/** Resolved outside the canvas and passed in: `Run` renders inside
	 * `<Canvas>`, which is its own reconciler root. */
	construction: Construction;
}) {
	const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
	const camera = useThree((s) => s.camera);
	const viewportHeightPx = useThree((s) => s.size.height);
	const {
		allPositions,
		dropModule,
		floorHeightMmOf,
		moveModule,
		overhangingIds,
		positionsOf,
	} = engine;

	/**
	 * The snap under this pointer event.
	 *
	 * `e.point` is already in the scene's outer world space — the same space the
	 * picked points are stored and rendered in — so no group-offset math is
	 * needed, only a millimetre conversion.
	 *
	 * The tolerance comes from `e.distance`, the camera's own distance to what
	 * the ray hit, so the aperture is a constant number of *pixels* rather than
	 * a constant number of millimetres. A fixed world tolerance is the reason
	 * picks used to land in odd places: too small to catch anything when the
	 * camera is pulled back over a full run, too coarse when zoomed into one
	 * carcass.
	 */
	const snapAt = (
		e: ThreeEvent<PointerEvent>,
		position: Positioned,
	): SnapPoint => {
		const hitMm: Vec3Mm = {
			x: e.point.x * 1000,
			y: e.point.y * 1000,
			z: e.point.z * 1000,
		};
		const fov = (camera as PerspectiveCamera).fov ?? 45;
		// Snap against the drafted mesh when the scene is drawing one, so a
		// dimension line lands on the real shelf and the real door edge rather
		// than an idealised box behind them. Read synchronously — a handler
		// cannot await, and a mesh that has not arrived means procedural boxes
		// are what is on screen and therefore what should be snapped to.
		const design = designPartBoxes(
			peekDesignMesh(
				position.family.sizes.find((size) => size.widthMm === position.widthMm)
					?.meshDesignId,
			),
		);

		const snap = snapToCabinet(
			hitMm,
			position,
			layout,
			engine,
			apertureMm(e.distance, fov, viewportHeightPx),
			design,
			construction,
		);

		// The lock is applied after the snap, not instead of it: you snap to the
		// corner you meant, then the constraint slides that point onto the axis
		// you are measuring along. Same order as picking a point with ORTHO on.
		return measureAnchor
			? {
					...snap,
					point: constrainToAxis(measureAnchor, snap.point, measureAxis),
				}
			: snap;
	};
	/**
	 * The live drag: which cabinet, and where on it the pointer took hold.
	 *
	 * The grab offset is what stops the cabinet snapping its left edge to the
	 * cursor the moment you touch it. It is re-anchored on every settled move
	 * for this reason: push a cabinet into its neighbour and keep dragging,
	 * and without re-anchoring the pointer
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
	}, [controls, onLayoutChange, dropModule]);

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

	// Which cabinets have an outer side on show, keyed by id.
	//
	// Computed per row, not across the whole run: `allPositions` concatenates
	// floor and wall, and judging them together would have a hung wall unit
	// cover a base unit's end panel — they are at different heights and hide
	// nothing of each other.
	const overhanging = useMemo(
		() => overhangingIds(layout),
		[layout, overhangingIds],
	);

	const { map: exposure, gaps: sideGaps } = useMemo(() => {
		// A return wall buries an end as surely as a neighbour does, so a run
		// built into an alcove must not veneer the two faces inside the walls.
		const walls = {
			wallWidthMm: layout.wallWidthMm,
			enclosed: layout.wallToWall,
		};
		const map = new Map<string, ExposedSides>();
		// The distance as well as the yes/no: an end panel only needs to know
		// whether a side is buried, but a door needs to know how far away the
		// neighbour is before it can decide how far to swing.
		const gaps = new Map<string, SideGaps>();
		for (const row of ["floor", "wall"] as const) {
			const positions = positionsOf(layout, row);
			positions.forEach((position, i) => {
				map.set(position.placed.id, exposedSides(positions, i, walls));
				gaps.set(position.placed.id, sideGapsMm(positions, i, walls));
			});
		}
		return { map, gaps };
	}, [layout, positionsOf]);

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
				position={[0, m(layout.ceilingHeightMm) / 2, 0]}
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
				<planeGeometry
					args={[m(runWidthMm) * 4, m(layout.ceilingHeightMm) * 3]}
				/>
				<meshBasicMaterial transparent opacity={0} depthWrite={false} />
			</mesh>

			<ContactShadows layout={layout} runWidthMm={runWidthMm} engine={engine} />
			<Worktop
				layout={layout}
				runWidthMm={runWidthMm}
				construction={construction}
				engine={engine}
			/>
			<CeilingTrim
				layout={layout}
				runWidthMm={runWidthMm}
				finishHex={finishHex}
				finishPhoto={finishPhoto}
				engine={engine}
			/>
			<Skirting layout={layout} runWidthMm={runWidthMm} engine={engine} />

			{allPositions(layout).map((position) => (
				<Cabinet
					key={position.placed.id}
					moduleId={position.placed.id}
					family={position.family}
					widthMm={position.widthMm}
					construction={construction}
					exposed={exposure.get(position.placed.id)}
					gaps={sideGaps.get(position.placed.id)}
					overhanging={overhanging.has(position.placed.id)}
					door={
						position.placed.doorStyleId
							? (doorStyleIn(catalogue, position.placed.doorStyleId) ?? null)
							: null
					}
					hinge={position.placed.hinge}
					doorsOpen={openIds.has(position.placed.id)}
					doorsHidden={doorsHidden}
					xMm={position.xMm}
					runWidthMm={runWidthMm}
					floorHeightMm={floorHeightMmOf(position, layout)}
					finishHex={finishHex}
					finishPhoto={finishPhoto}
					selected={selectedIds.has(position.placed.id)}
					highlighted={
						position.placed.id === doorTargetId ||
						(measureMode && measureHoverId === position.placed.id)
					}
					onPointerMove={
						measureMode
							? (e) => {
									e.stopPropagation();
									setMeasureHoverId(position.placed.id);
									onMeasureHover(snapAt(e, position));
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
							onMeasurePick(snapAt(e, position));
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
	engine,
}: {
	layout: PlannerLayout;
	runWidthMm: number;
	engine: PlannerEngine;
}) {
	const { positionsOf, hangingHeightMmOf } = engine;
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
						m(hangingHeightMmOf(layout) + position.family.heightMm / 2) - 0.06,
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
	construction,
	engine,
}: {
	layout: PlannerLayout;
	runWidthMm: number;
	construction: Construction;
	engine: PlannerEngine;
}) {
	const { positionsOf } = engine;
	// One slab per unbroken stretch of base units — a worktop is cut to the
	// cabinets under it, not to the wall, so a unit of another kind, a unit of a
	// different height, or a deliberate gap splits it. Contiguity is decided by
	// where the cabinets actually are, not by their order in the list, and
	// `kind === "base"` is the same test pricing charges against, which is what
	// keeps the drawn slab and the billed one the same slab.
	const spans: Array<{
		startMm: number;
		endMm: number;
		depthMm: number;
		topMm: number;
	}> = [];
	for (const position of positionsOf(layout, "floor")) {
		if (position.family.kind !== "base") continue;
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
							m(span.topMm + construction.worktopThicknessMm / 2),
							m((span.depthMm + overhangMm) / 2),
						]}
					>
						<boxGeometry
							args={[
								m(widthMm),
								m(construction.worktopThicknessMm),
								m(span.depthMm + overhangMm),
							]}
						/>
						<WorktopMaterial
							width={m(widthMm)}
							depth={m(span.depthMm + overhangMm)}
						/>
					</mesh>
				);
			})}
		</>
	);
}

/**
 * The kick board across the front of a floor run, hiding the legs.
 *
 * One board per unbroken stretch, from `skirtingSpans` — the engine decides
 * where the boards start and stop so the price and the geometry cannot drift
 * apart. It used to be one box per cabinet inside `Cabinet.tsx`, which showed
 * a seam at every junction and, worse, was drawn only by the procedural
 * fallback: a cabinet with a drafted mesh stood on bare legs.
 *
 * Left flat and dark rather than wearing the door finish. A kick board is
 * meant to recede into the shadow under the run — the opposite of what the
 * capping strip is doing at the top.
 */
function Skirting({
	layout,
	runWidthMm,
	engine,
}: {
	layout: PlannerLayout;
	runWidthMm: number;
	engine: PlannerEngine;
}) {
	return (
		<>
			{engine.skirtingSpans(layout).map((span) => {
				const widthMm = span.endMm - span.startMm;
				// From the wall out to just short of the carcass front. The span
				// carries the recess because only the engine knows how far in the
				// feet under this stretch stand.
				const depthMm = span.depthMm - span.recessMm;

				return (
					<mesh
						key={span.startMm}
						position={[
							m(span.startMm + widthMm / 2 - runWidthMm / 2),
							m(span.heightMm / 2),
							m(depthMm / 2),
						]}
					>
						<boxGeometry args={[m(widthMm), m(span.heightMm), m(depthMm)]} />
						<meshStandardMaterial color="#3a3835" roughness={0.9} />
					</mesh>
				);
			})}
		</>
	);
}

/**
 * The strip that caps a floor-to-ceiling run.
 *
 * One piece per unbroken stretch of wall units, the same rule the worktop
 * follows: it is scribed to the cabinets under it, so a gap in the run breaks
 * it rather than being paid for. It carries the door finish, because on a
 * flushed kitchen this is the topmost thing the eye reads as cabinetry — a
 * carcass-coloured band up there is the first thing that looks wrong.
 *
 * Drawn only in ceiling mode: a hanging run has no strip.
 */
function CeilingTrim({
	layout,
	runWidthMm,
	finishHex,
	finishPhoto,
	engine,
}: {
	layout: PlannerLayout;
	runWidthMm: number;
	finishHex: string;
	finishPhoto: string | null;
	engine: PlannerEngine;
}) {
	const spans: Array<{ startMm: number; endMm: number; depthMm: number }> = [];
	if (layout.wallToCeiling) {
		for (const position of engine.positionsOf(layout, "wall")) {
			const previous = spans[spans.length - 1];
			if (previous && Math.abs(previous.endMm - position.xMm) < 1) {
				previous.endMm = position.xMm + position.widthMm;
				previous.depthMm = Math.max(previous.depthMm, position.family.depthMm);
			} else {
				spans.push({
					startMm: position.xMm,
					endMm: position.xMm + position.widthMm,
					depthMm: position.family.depthMm,
				});
			}
		}
	}

	return (
		<>
			{spans.map((span) => (
				<TrimPiece
					key={span.startMm}
					widthMm={span.endMm - span.startMm}
					depthMm={span.depthMm}
					centreXMm={
						span.startMm + (span.endMm - span.startMm) / 2 - runWidthMm / 2
					}
					ceilingHeightMm={layout.ceilingHeightMm}
					finishHex={finishHex}
					finishPhoto={finishPhoto}
				/>
			))}
		</>
	);
}

/** Split out so the finish hook is called once per piece rather than in a
 *  loop, which the rules of hooks do not allow. */
function TrimPiece({
	widthMm,
	depthMm,
	centreXMm,
	ceilingHeightMm,
	finishHex,
	finishPhoto,
}: {
	widthMm: number;
	depthMm: number;
	centreXMm: number;
	ceilingHeightMm: number;
	finishHex: string;
	finishPhoto: string | null;
}) {
	const surface = useFrontSurface(
		finishPhoto,
		"horizontal",
		m(widthMm),
		m(CEILING_TRIM_MM),
		finishHex,
	);

	return (
		<mesh
			position={[
				m(centreXMm),
				m(ceilingHeightMm - CEILING_TRIM_MM / 2),
				m(depthMm / 2),
			]}
		>
			<boxGeometry args={[m(widthMm), m(CEILING_TRIM_MM), m(depthMm)]} />
			<meshStandardMaterial roughness={0.55} {...surface} />
		</mesh>
	);
}

/**
 * The slab's own surface. Same tile as everything else, but as sheen only —
 * with the figure on, a dark worktop reads as decking. What is left is an
 * uneven catch of light along the run, which is what honed stone does.
 */
function WorktopMaterial({ width, depth }: { width: number; depth: number }) {
	const figure = useGrain("horizontal", width, depth);
	return (
		<meshStandardMaterial color={WORKTOP_COLOR} roughness={0.4} {...figure} />
	);
}

/** Module-level so the default never changes identity between renders. */
const EMPTY_IDS: ReadonlySet<string> = new Set();

export default function PlannerScene({
	layout,
	finish,
	finishTextures = {},
	selectedIds,
	openIds = EMPTY_IDS,
	doorsHidden = false,
	doorTargetId,
	measureMode = false,
	measurePoints = [],
	measureAxis = "auto",
	view = "3d",
	onLayoutChangeAction,
	onSelectAction,
	onMeasurePickAction,
	pickerRef,
	hitTestRef,
}: {
	layout: PlannerLayout;
	finish: FinishId;
	/** Finish id → uploaded decor photo, for the finishes that have one.
	 *
	 * Optional and defaulted: a finish with no photo already falls back to the
	 * generated grain, so an absent map should mean "nobody has photographed
	 * these yet" and never a thrown render. This is a public page where a dead
	 * canvas is a lost lead — and it does go missing in practice, when HMR
	 * swaps this module into a tab whose parents are still the previous build.
	 */
	finishTextures?: Record<string, string>;
	selectedIds: ReadonlySet<string>;
	/** The cabinets whose doors are swung open. Optional and empty by default:
	 * the quote screen's preview draws the same scene with no controls on it,
	 * and a shut door is what a customer expects to be quoted. */
	openIds?: ReadonlySet<string>;
	doorsHidden?: boolean;
	doorTargetId: string | null;
	/** While true, clicking a cabinet picks a measurement point instead of
	 * selecting or dragging it. */
	measureMode?: boolean;
	/** Which of the three camera set-ups to frame with. Defaults to `3d` so
	 * the quote screen's little preview keeps the selling angle without
	 * having to know the toggle exists. */
	view?: PlannerView;
	/** The points picked so far — 0, 1, or 2 of them. */
	measurePoints?: SnapPoint[];
	/** Which axis the second pick is constrained to. Defaults to `auto`, which
	 * is what makes a roughly-vertical pick read as a clean height. */
	measureAxis?: MeasureAxis;
	onLayoutChangeAction: (next: PlannerLayout) => void;
	onSelectAction: (id: string | null, additive: boolean) => void;
	onMeasurePickAction?: (snap: SnapPoint) => void;
	pickerRef: React.RefObject<
		((clientX: number, clientY: number) => number) | null
	>;
	/** Filled in by the scene: which cabinet is under this screen point. */
	hitTestRef: React.RefObject<
		((clientX: number, clientY: number) => string | null) | null
	>;
}) {
	const catalogue = useCatalogue();
	const engine = useEngine();
	const construction = constructionOf(catalogue);
	const runWidthMm = layout.wallWidthMm;
	const finishHex =
		catalogue.finishes.find((f) => f.id === finish)?.hex ??
		catalogue.finishes[0].hex;
	const finishPhoto = finishTextures[finish] ?? null;
	const [hoverPoint, setHoverPoint] = useState<SnapPoint | null>(null);
	// Only the first point anchors the lock; with two down the next click starts
	// a fresh measurement, which has nothing to constrain against.
	const measureAnchor =
		measurePoints.length === 1 ? measurePoints[0].point : null;

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
			{/* Was 1.5 + 2.0, which clipped every mid-tone: Rhone Oak rendered
			    near-white and the grain with it. Dropped until the catalogue's
			    own finish colours survive to the screen, since that screenshot is
			    what goes out over WhatsApp. */}
			<ambientLight intensity={0.85} />
			<directionalLight position={[4, 7, 6]} intensity={1.35} />

			<Room
				width={m(layout.wallWidthMm)}
				depth={m(layout.roomDepthMm)}
				height={m(layout.ceilingHeightMm)}
				sideWalls={layout.wallToWall}
			/>

			<Run
				layout={layout}
				catalogue={catalogue}
				engine={engine}
				finishHex={finishHex}
				finishPhoto={finishPhoto}
				selectedIds={selectedIds}
				openIds={openIds}
				doorsHidden={doorsHidden}
				doorTargetId={doorTargetId}
				measureMode={measureMode}
				measureAxis={measureAxis}
				measureAnchor={measureAnchor}
				onLayoutChange={onLayoutChangeAction}
				onSelect={onSelectAction}
				onMeasurePick={onMeasurePickAction ?? (() => {})}
				onMeasureHover={setHoverPoint}
				construction={construction}
			/>
			<MeasureOverlay
				points={measurePoints}
				previewPoint={measureMode ? hoverPoint : null}
			/>

			<DropPicker runWidthMm={runWidthMm} pickerRef={pickerRef} />
			<CabinetHitTest hitTestRef={hitTestRef} />
			{/* `makeDefault` is what lets Run reach these through useThree and
			    switch orbiting off for the duration of a cabinet drag. */}
			{/* Orbiting is off in the flat views: the whole point of asking for
			    an elevation is that it stays square, and one stray drag that
			    left it at a slight angle would make it useless for eyeballing
			    whether a run clears a window. Zoom stays on. */}
			<OrbitControls
				makeDefault
				enablePan={false}
				enableRotate={view === "3d"}
				maxPolarAngle={Math.PI / 2 - 0.05}
			/>
			<FitCamera
				runWidthMm={Math.max(runWidthMm, engine.rowEndMm(layout, "floor"))}
				roomDepthMm={layout.roomDepthMm}
				ceilingHeightMm={layout.ceilingHeightMm}
				view={view}
			/>
		</Canvas>
	);
}
