"use client";

import { useTexture } from "@react-three/drei";
import { memo, useMemo } from "react";
import { RepeatWrapping, type Texture } from "three";
import type {
	Bay,
	BayInterior,
	DesignDocument,
	Door,
	InteriorItem,
} from "@/lib/wardrobe/schema";
import {
	CARCASS_COLOR,
	finishAppearance,
	GRAIN_TEXTURE_URL,
	RAIL_COLOR,
} from "./finishMaterials";

const PANEL_MM = 18;
const DOOR_GAP_MM = 4;
const RAIL_RADIUS_MM = 15;
const DRAWER_FRONT_MM = 180;
const DRAWER_GAP_MM = 12;

/** Slim vertical bar down the door's leading edge. */
const PROFILE_W_MM = 22;
const PROFILE_PROUD_MM = 16;
/** Gap left at the top and bottom of the door, so the bar reads as fitted. */
const PROFILE_INSET_MM = 140;
/** How far the bar's centre sits in from the door edge. */
const HANDLE_EDGE_MM = 45;
const KNOB_RADIUS_MM = 16;
/** Roughly where a hand falls on a full-height wardrobe door. */
const KNOB_HEIGHT_MM = 1000;
const PULL_W_MM = 120;
const PULL_H_MM = 16;

const m = (mm: number) => mm / 1000;

type PanelProps = {
	size: [number, number, number];
	position: [number, number, number];
	color: string;
	roughness?: number;
	map: Texture;
};

function Panel({ size, position, color, roughness = 0.7, map }: PanelProps) {
	return (
		<mesh position={position}>
			<boxGeometry args={size} />
			<meshStandardMaterial map={map} color={color} roughness={roughness} />
		</mesh>
	);
}

/**
 * The one metal in the scene — rail, door handles, drawer pulls. Defined once
 * so hardware cannot drift apart from itself finish by finish.
 */
function Hardware({
	position,
	rotation,
	children,
}: {
	position: [number, number, number];
	rotation?: [number, number, number];
	children: React.ReactNode;
}) {
	return (
		<mesh position={position} rotation={rotation}>
			{children}
			<meshStandardMaterial
				color={RAIL_COLOR}
				roughness={0.3}
				metalness={0.6}
			/>
		</mesh>
	);
}

function Carcass({
	widthMm,
	heightMm,
	depthMm,
	map,
}: {
	widthMm: number;
	heightMm: number;
	depthMm: number;
	map: Texture;
}) {
	const w = m(widthMm);
	const h = m(heightMm);
	const d = m(depthMm);
	const t = m(PANEL_MM);

	return (
		<>
			<Panel
				size={[t, h, d]}
				position={[-w / 2 + t / 2, h / 2, 0]}
				color={CARCASS_COLOR}
				map={map}
			/>
			<Panel
				size={[t, h, d]}
				position={[w / 2 - t / 2, h / 2, 0]}
				color={CARCASS_COLOR}
				map={map}
			/>
			<Panel
				size={[w, t, d]}
				position={[0, h - t / 2, 0]}
				color={CARCASS_COLOR}
				map={map}
			/>
			<Panel
				size={[w, t, d]}
				position={[0, t / 2, 0]}
				color={CARCASS_COLOR}
				map={map}
			/>
			<Panel
				size={[w, h, t]}
				position={[0, h / 2, -d / 2 + t / 2]}
				color={CARCASS_COLOR}
				map={map}
			/>
		</>
	);
}

function InteriorPiece({
	item,
	widthMm,
	depthMm,
	map,
}: {
	item: InteriorItem;
	widthMm: number;
	depthMm: number;
	map: Texture;
}) {
	const innerW = m(widthMm - 2 * PANEL_MM);
	const d = m(depthMm);
	const t = m(PANEL_MM);
	const y = m(item.heightFromFloor);

	if (item.kind === "shelf") {
		return (
			<Panel
				size={[innerW, t, d - t]}
				position={[0, y, t / 2]}
				color={CARCASS_COLOR}
				map={map}
			/>
		);
	}

	if (item.kind === "rail") {
		return (
			<Hardware position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]}>
				<cylinderGeometry
					args={[m(RAIL_RADIUS_MM), m(RAIL_RADIUS_MM), innerW, 12]}
				/>
			</Hardware>
		);
	}

	return (
		<>
			{Array.from({ length: item.count }, (_, i) => {
				const bottom =
					item.heightFromFloor + i * (DRAWER_FRONT_MM + DRAWER_GAP_MM);
				const centreY = m(bottom + DRAWER_FRONT_MM / 2);
				return (
					<group key={bottom}>
						<Panel
							size={[innerW, m(DRAWER_FRONT_MM), t]}
							position={[0, centreY, d / 2 - t]}
							color={CARCASS_COLOR}
							map={map}
						/>
						{/* Pull, proud of the front. Only ever seen with the doors
						    hidden — which is the view that sells the interior. */}
						<Hardware position={[0, centreY, d / 2 - t / 2 + m(PULL_H_MM) / 2]}>
							<boxGeometry args={[m(PULL_W_MM), m(PULL_H_MM), m(PULL_H_MM)]} />
						</Hardware>
					</group>
				);
			})}
		</>
	);
}

function DoorPanel({
	door,
	widthMm,
	heightMm,
	depthMm,
	/** -1 puts the handle on the door's left edge, +1 on its right. */
	handleSide,
	map,
}: {
	door: Door;
	widthMm: number;
	heightMm: number;
	depthMm: number;
	handleSide: number;
	map: Texture;
}) {
	const appearance = finishAppearance(door.finish);
	const t = m(PANEL_MM);
	const d = m(depthMm);
	// Sliding doors ride on a track in front of the carcass; hinged doors sit
	// flush against its front edge.
	const z = door.type === "sliding" ? d / 2 + t * 1.5 : d / 2 + t / 2;

	const handleX = handleSide * (m(widthMm) / 2 - m(HANDLE_EDGE_MM));
	// Handles stand proud of whichever face the door presents.
	const handleZ = z + t / 2;

	return (
		<>
			<Panel
				size={[m(widthMm - DOOR_GAP_MM), m(heightMm), t]}
				position={[0, m(heightMm) / 2, z]}
				color={appearance.color}
				roughness={appearance.roughness}
				map={map}
			/>

			{door.handle === "profile" && (
				<Hardware
					position={[
						handleX,
						m(heightMm) / 2,
						handleZ + m(PROFILE_PROUD_MM) / 2,
					]}
				>
					<boxGeometry
						args={[
							m(PROFILE_W_MM),
							// Inset top and bottom so it reads as fitted rather than
							// running off the ends of the door.
							Math.max(m(200), m(heightMm - 2 * PROFILE_INSET_MM)),
							m(PROFILE_PROUD_MM),
						]}
					/>
				</Hardware>
			)}

			{door.handle === "knob" && (
				<Hardware
					position={[handleX, m(KNOB_HEIGHT_MM), handleZ + m(KNOB_RADIUS_MM)]}
				>
					{/* Low segment count on purpose — mobile budget, and at this
					    size the facets are invisible. */}
					<sphereGeometry args={[m(KNOB_RADIUS_MM), 12, 8]} />
				</Hardware>
			)}
		</>
	);
}

/**
 * memo: dragging the unit re-renders Scene on every pointermove, but none of
 * the carcass, shelves or doors depend on where it stands — only the parent
 * group's transform does. Without this the whole fit-out reconciles per move.
 */
export const Wardrobe = memo(function Wardrobe({
	design,
	doorsVisible,
}: {
	design: DesignDocument;
	doorsVisible: boolean;
}) {
	const grain = useTexture(GRAIN_TEXTURE_URL);

	const map = useMemo(() => {
		grain.wrapS = RepeatWrapping;
		grain.wrapT = RepeatWrapping;
		grain.repeat.set(2, 2);
		return grain;
	}, [grain]);

	const interiorByBay = useMemo(
		() =>
			new Map<string, BayInterior>(design.interiors.map((i) => [i.bayId, i])),
		[design.interiors],
	);
	const doorByBay = useMemo(
		() => new Map<string, Door>(design.doors.map((d) => [d.bayId, d])),
		[design.doors],
	);

	const orderedBays = useMemo(
		() => [...design.bays].sort((a, b) => a.order - b.order),
		[design.bays],
	);

	const totalWidthMm = orderedBays.reduce((sum, bay) => sum + bay.width, 0);

	let cursorMm = -totalWidthMm / 2;
	const placed: Array<{ bay: Bay; centerMm: number }> = orderedBays.map(
		(bay) => {
			const centerMm = cursorMm + bay.width / 2;
			cursorMm += bay.width;
			return { bay, centerMm };
		},
	);

	return (
		<group>
			{placed.map(({ bay, centerMm }) => {
				const interior = interiorByBay.get(bay.id);
				const door = doorByBay.get(bay.id);
				return (
					<group key={bay.id} position={[m(centerMm), 0, 0]}>
						<Carcass
							widthMm={bay.width}
							heightMm={design.opening.height}
							depthMm={design.opening.depth}
							map={map}
						/>
						{interior?.items.map((item) => (
							<InteriorPiece
								key={`${item.kind}-${item.heightFromFloor}`}
								item={item}
								widthMm={bay.width}
								depthMm={design.opening.depth}
								map={map}
							/>
						))}
						{door && doorsVisible && (
							<DoorPanel
								door={door}
								widthMm={bay.width}
								heightMm={design.opening.height}
								depthMm={design.opening.depth}
								// Handles face the middle of the run, so a two-door
								// wardrobe reads as a facing pair rather than both
								// pointing the same way. The centre bay of an odd run
								// picks a side consistently.
								handleSide={centerMm <= 0 ? 1 : -1}
								map={map}
							/>
						)}
					</group>
				);
			})}
		</group>
	);
});
