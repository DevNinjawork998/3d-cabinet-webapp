"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PerspectiveCamera, Vector3 as Vector3Type } from "three";
import { Vector3 } from "three";
import { Room } from "@/components/viewer/Room";
import {
	KITCHEN_FINISHES,
	type KitchenFinishId,
	WORKTOP_COLOR,
	WORKTOP_THICKNESS_MM,
} from "@/lib/kitchen/catalogue";
import {
	allPositions,
	type KitchenLayout,
	moveModule,
	positionsOf,
	rowEndMm,
} from "@/lib/kitchen/layout";
import { Cabinet } from "./Cabinet";

const m = (mm: number) => mm / 1000;
const ROOM_DEPTH_MM = 3600;
const ROOM_HEIGHT_MM = 2700;

/** Looking into the corner, the angle a kitchen elevation is usually sold at. */
const VIEW_DIRECTION = new Vector3(0.25, 0.42, 1).normalize();

/**
 * Where this pointer ray crosses a horizontal plane, in run millimetres.
 * Read off the ray rather than the hit point: `e.point` is wherever the ray
 * struck the mesh, which on a tall door face is most of a metre from the floor
 * and drags the cabinet by that offset.
 */
function runXFromRay(
	e: ThreeEvent<PointerEvent>,
	planeY: number,
	runWidthMm: number,
): number {
	const { origin, direction } = e.ray;
	const worldX =
		Math.abs(direction.y) < 1e-6
			? origin.x
			: origin.x + direction.x * ((planeY - origin.y) / direction.y);
	return worldX * 1000 + runWidthMm / 2;
}

function FitCamera({ runWidthMm }: { runWidthMm: number }) {
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
		const radius = Math.hypot(width, height, m(ROOM_DEPTH_MM)) / 2;
		const distance = (radius / Math.sin(Math.min(halfFovV, halfFovH))) * 0.95;

		camera.position.copy(centre).addScaledVector(VIEW_DIRECTION, distance);
		camera.near = 0.1;
		camera.far = distance * 6;
		camera.updateProjectionMatrix();

		if (controls) {
			controls.target.copy(centre);
			controls.update();
		}
	}, [runWidthMm, aspect, camera, controls]);

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
	selectedId,
	onLayoutChange,
	onSelect,
}: {
	layout: KitchenLayout;
	finishHex: string;
	selectedId: string | null;
	onLayoutChange: (next: KitchenLayout) => void;
	onSelect: (id: string | null) => void;
}) {
	const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
	const dragRef = useRef<string | null>(null);
	const [dragging, setDragging] = useState(false);
	// Pointer moves outpace re-renders, so the handler reads the live layout
	// through a ref rather than a closed-over prop.
	const layoutRef = useRef(layout);
	layoutRef.current = layout;
	const runWidthMm = layout.wallWidthMm;

	const endDrag = useCallback(() => {
		if (!dragRef.current) return;
		dragRef.current = null;
		setDragging(false);
		if (controls) controls.enabled = true;
	}, [controls]);

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

	return (
		<group position={[0, 0, -m(ROOM_DEPTH_MM) / 2 + m(700)]}>
			{/* Always mounted: it catches the moves during a drag, and a press on
			    bare floor clears the selection. */}
			<mesh
				rotation={[-Math.PI / 2, 0, 0]}
				position={[0, 0.001, 0]}
				onPointerDown={() => onSelect(null)}
				onPointerMove={(e) => {
					const id = dragRef.current;
					if (!id) return;
					e.stopPropagation();
					const next = moveModule(
						layoutRef.current,
						id,
						runXFromRay(e, 0, runWidthMm),
					);
					if (next !== layoutRef.current) onLayoutChange(next);
				}}
			>
				<planeGeometry args={[m(runWidthMm) * 3, m(ROOM_DEPTH_MM) * 2]} />
				<meshBasicMaterial transparent opacity={0} depthWrite={false} />
			</mesh>

			<Worktop layout={layout} runWidthMm={runWidthMm} />

			{allPositions(layout).map((position) => (
				<Cabinet
					key={position.placed.id}
					type={position.type}
					xMm={position.xMm}
					runWidthMm={runWidthMm}
					finishHex={finishHex}
					selected={position.placed.id === selectedId}
					onPointerDown={(e) => {
						e.stopPropagation();
						onSelect(position.placed.id);
						dragRef.current = position.placed.id;
						setDragging(true);
						if (controls) controls.enabled = false;
					}}
				/>
			))}
		</group>
	);
}

function Worktop({
	layout,
	runWidthMm,
}: {
	layout: KitchenLayout;
	runWidthMm: number;
}) {
	// One slab over the base run, stopping at any tall unit — a worktop is cut
	// to the cabinets under it, not to the wall.
	const spans: Array<{ startMm: number; endMm: number; depthMm: number }> = [];
	for (const position of positionsOf(layout, "floor")) {
		if (position.type.kind === "tall") continue;
		const previous = spans[spans.length - 1];
		if (previous && previous.endMm === position.xMm) {
			previous.endMm += position.type.widthMm;
			previous.depthMm = Math.max(previous.depthMm, position.type.depthMm);
		} else {
			spans.push({
				startMm: position.xMm,
				endMm: position.xMm + position.type.widthMm,
				depthMm: position.type.depthMm,
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
							m(880 + WORKTOP_THICKNESS_MM / 2),
							m(overhangMm / 2),
						]}
					>
						<boxGeometry
							args={[
								m(widthMm),
								m(WORKTOP_THICKNESS_MM),
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

export default function KitchenScene({
	layout,
	finish,
	selectedId,
	onLayoutChangeAction,
	onSelectAction,
	pickerRef,
}: {
	layout: KitchenLayout;
	finish: KitchenFinishId;
	selectedId: string | null;
	onLayoutChangeAction: (next: KitchenLayout) => void;
	onSelectAction: (id: string | null) => void;
	pickerRef: React.RefObject<
		((clientX: number, clientY: number) => number) | null
	>;
}) {
	const runWidthMm = layout.wallWidthMm;
	const finishHex =
		KITCHEN_FINISHES.find((f) => f.id === finish)?.hex ??
		KITCHEN_FINISHES[0].hex;

	return (
		<Canvas
			dpr={[1, 2]}
			// Required to read the canvas back as an image for the quote screenshot.
			gl={{ preserveDrawingBuffer: true }}
			camera={{ fov: 45 }}
			// Without this, dragging a cabinet scrolls the page on Android.
			style={{ touchAction: "none" }}
			onPointerMissed={() => onSelectAction(null)}
		>
			<color attach="background" args={["#f4f2ee"]} />
			<ambientLight intensity={1.5} />
			<directionalLight position={[4, 7, 6]} intensity={2} />

			<Room
				width={Math.max(m(runWidthMm) + 1.2, 4)}
				depth={m(ROOM_DEPTH_MM)}
				height={m(ROOM_HEIGHT_MM)}
			/>

			<Run
				layout={layout}
				finishHex={finishHex}
				selectedId={selectedId}
				onLayoutChange={onLayoutChangeAction}
				onSelect={onSelectAction}
			/>

			<DropPicker runWidthMm={runWidthMm} pickerRef={pickerRef} />
			{/* `makeDefault` is what lets Run reach these through useThree and
			    switch orbiting off for the duration of a cabinet drag. */}
			<OrbitControls
				makeDefault
				enablePan={false}
				maxPolarAngle={Math.PI / 2 - 0.05}
			/>
			<FitCamera runWidthMm={Math.max(runWidthMm, rowEndMm(layout, "floor"))} />
		</Canvas>
	);
}
