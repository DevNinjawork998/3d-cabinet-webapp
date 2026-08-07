"use client";

import { OrbitControls, Shadow } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import type { PerspectiveCamera, Vector3 as Vector3Type } from "three";
import { Vector3 } from "three";
import type { Placement } from "@/lib/wardrobe/placement";
import type { RoomSize } from "@/lib/wardrobe/room";
import type { DesignDocument } from "@/lib/wardrobe/schema";
import { PlacementControls } from "./PlacementControls";
import { Room } from "./Room";
import { RoomDimensions } from "./RoomDimensions";
import { Wardrobe } from "./Wardrobe";

/** Looking down into the open corner, like a cutaway floor plan. */
const VIEW_DIRECTION = new Vector3(0.55, 0.6, 0.85).normalize();

/**
 * Frames the whole room. Explicit trig rather than drei's <Bounds> because the
 * room's bounding box includes the two walls we deliberately can't see, and
 * Bounds kept fitting the camera to a box it was standing inside.
 */
function FitCamera({
	width,
	height,
	depth,
}: {
	width: number;
	height: number;
	depth: number;
}) {
	const camera = useThree((s) => s.camera) as PerspectiveCamera;
	const controls = useThree((s) => s.controls) as {
		target: Vector3Type;
		update: () => void;
	} | null;
	const aspect = useThree((s) => s.size.width / s.size.height);

	useEffect(() => {
		const center = new Vector3(0, height / 2, 0);
		const halfFovV = (camera.fov * Math.PI) / 360;
		const halfFovH = Math.atan(Math.tan(halfFovV) * aspect);
		// Bounding sphere, so the fit holds at any orbit angle rather than only
		// when the camera is square-on to the back wall.
		const radius = Math.hypot(width, height, depth) / 2;
		// Extra slack so the dimension labels sitting outside the walls stay in shot.
		const distance = (radius / Math.sin(Math.min(halfFovV, halfFovH))) * 1.15;

		camera.position.copy(center).addScaledVector(VIEW_DIRECTION, distance);
		camera.near = 0.1;
		camera.far = distance * 6;
		camera.updateProjectionMatrix();

		if (controls) {
			controls.target.copy(center);
			controls.update();
		}
	}, [width, height, depth, aspect, camera, controls]);

	return null;
}

export default function Scene({
	design,
	room,
	placement,
	doorsVisible,
	showDimensions,
	onRoomChangeAction,
	onPlacementChangeAction,
}: {
	design: DesignDocument;
	room: RoomSize;
	placement: Placement;
	doorsVisible: boolean;
	showDimensions: boolean;
	onRoomChangeAction: (next: Partial<RoomSize>) => void;
	onPlacementChangeAction: (next: Placement) => void;
}) {
	const runWidth =
		design.bays.reduce((sum, bay) => sum + bay.width, 0) / 1000 || 1;
	const unitDepth = design.opening.depth / 1000;
	const roomWidth = room.widthMm / 1000;
	const roomDepth = room.depthMm / 1000;
	const roomHeight = room.heightMm / 1000;

	return (
		<Canvas
			dpr={[1, 2]}
			// Required to read the canvas back as an image for the quote screenshot.
			gl={{ preserveDrawingBuffer: true }}
			camera={{ fov: 45 }}
			// Without this, dragging the unit scrolls the page on Android.
			style={{ touchAction: "none" }}
		>
			<color attach="background" args={["#f4f2ee"]} />
			<ambientLight intensity={1.5} />
			<directionalLight position={[4, 7, 6]} intensity={2} />

			<Room width={roomWidth} depth={roomDepth} height={roomHeight} />
			{showDimensions && (
				<RoomDimensions room={room} onChange={onRoomChangeAction} />
			)}

			{/* Drag the unit anywhere on the floor; it seats flush near a wall. */}
			<PlacementControls
				room={room}
				placement={placement}
				runWidthMm={runWidth * 1000}
				depthMm={design.opening.depth}
				heightMm={design.opening.height}
				onChange={onPlacementChangeAction}
			>
				<Suspense fallback={null}>
					<Wardrobe design={design} doorsVisible={doorsVisible} />
				</Suspense>
				{/* Fake contact shadow — no shadow maps, per the mobile budget. */}
				<Shadow
					position={[0, 0.004, 0.08]}
					rotation={[-Math.PI / 2, 0, 0]}
					scale={[runWidth * 0.75, unitDepth, 1]}
					opacity={0.4}
					color="#22201d"
				/>
			</PlacementControls>

			<OrbitControls
				makeDefault
				enablePan={false}
				maxPolarAngle={Math.PI / 2 - 0.05}
			/>
			<FitCamera width={roomWidth} height={roomHeight} depth={roomDepth} />
		</Canvas>
	);
}
