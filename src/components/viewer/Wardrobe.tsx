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
			<mesh position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]}>
				<cylinderGeometry
					args={[m(RAIL_RADIUS_MM), m(RAIL_RADIUS_MM), innerW, 12]}
				/>
				<meshStandardMaterial
					color={RAIL_COLOR}
					roughness={0.3}
					metalness={0.6}
				/>
			</mesh>
		);
	}

	return (
		<>
			{Array.from({ length: item.count }, (_, i) => {
				const bottom =
					item.heightFromFloor + i * (DRAWER_FRONT_MM + DRAWER_GAP_MM);
				return (
					<Panel
						key={bottom}
						size={[innerW, m(DRAWER_FRONT_MM), t]}
						position={[0, m(bottom + DRAWER_FRONT_MM / 2), d / 2 - t]}
						color={CARCASS_COLOR}
						map={map}
					/>
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
	map,
}: {
	door: Door;
	widthMm: number;
	heightMm: number;
	depthMm: number;
	map: Texture;
}) {
	const appearance = finishAppearance(door.finish);
	const t = m(PANEL_MM);
	const d = m(depthMm);
	// Sliding doors ride on a track in front of the carcass; hinged doors sit
	// flush against its front edge.
	const z = door.type === "sliding" ? d / 2 + t * 1.5 : d / 2 + t / 2;

	return (
		<Panel
			size={[m(widthMm - DOOR_GAP_MM), m(heightMm), t]}
			position={[0, m(heightMm) / 2, z]}
			color={appearance.color}
			roughness={appearance.roughness}
			map={map}
		/>
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
								map={map}
							/>
						)}
					</group>
				);
			})}
		</group>
	);
});
