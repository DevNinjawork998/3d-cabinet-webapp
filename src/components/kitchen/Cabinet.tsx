import type { ThreeEvent } from "@react-three/fiber";
import {
	CARCASS_COLOR,
	HARDWARE_COLOR,
	type ModuleType,
	PANEL_THICKNESS_MM,
	PLINTH_HEIGHT_MM,
} from "@/lib/kitchen/catalogue";

/**
 * One cabinet, generated from its module type — carcass, fronts, handles.
 * Same rule as the wardrobe: every shape is a box or a cylinder computed from
 * the catalogue, so a 400 and a 900 are the same code and a resize is free.
 */

const m = (mm: number) => mm / 1000;

/** Gap around each door so the run reads as separate fronts, not one slab. */
const DOOR_GAP_MM = 4;
const FRONT_THICKNESS_MM = 18;
const HANDLE_LENGTH_MM = 128;
const HANDLE_THICKNESS_MM = 14;

export function Cabinet({
	type,
	xMm,
	runWidthMm,
	floorHeightMm,
	finishHex,
	selected,
	onPointerDown,
}: {
	type: ModuleType;
	/** Left edge along the run. */
	xMm: number;
	runWidthMm: number;
	/** Underside above the floor. Passed in rather than read off the type, so
	 * the whole wall row can be raised or lowered together. */
	floorHeightMm: number;
	finishHex: string;
	selected: boolean;
	onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
	// The run is centred on the origin, so a cabinet's world x is its centre
	// measured from the middle of the wall.
	const centreX = m(xMm + type.widthMm / 2 - runWidthMm / 2);
	// Cabinets hang by their backs. The parent group sits on the wall plane and
	// each cabinet steps forward by half its own depth, so a 397-deep wall unit
	// and a 607-deep base unit share a back rather than a centre line — which is
	// what makes a run look fitted instead of floating in front of the wall.
	const backToCentre = m(type.depthMm) / 2;
	const w = m(type.widthMm);
	const d = m(type.depthMm);
	const h = m(type.heightMm);
	const t = m(PANEL_THICKNESS_MM);
	const plinth = type.kind === "wall" ? 0 : m(PLINTH_HEIGHT_MM);
	const carcassH = h - plinth;
	const base = m(floorHeightMm);

	const frontZ = d / 2 + m(FRONT_THICKNESS_MM) / 2;
	const emphasis = selected ? 0.35 : 0;

	return (
		<group
			position={[centreX, base, backToCentre]}
			onPointerDown={onPointerDown}
		>
			{/* Plinth: the recessed kick under a floor-standing unit. */}
			{plinth > 0 && (
				<mesh position={[0, plinth / 2, -m(30)]}>
					<boxGeometry args={[w - t, plinth, d - m(60)]} />
					<meshStandardMaterial color="#3a3835" roughness={0.9} />
				</mesh>
			)}

			{/* Carcass. */}
			<mesh position={[0, plinth + carcassH / 2, 0]}>
				<boxGeometry args={[w - m(2), carcassH, d]} />
				<meshStandardMaterial
					color={CARCASS_COLOR}
					roughness={0.85}
					emissive="#2b6cb0"
					emissiveIntensity={emphasis}
				/>
			</mesh>

			{type.drawers > 0 ? (
				<Drawers
					count={type.drawers}
					width={w}
					height={carcassH}
					y={plinth}
					z={frontZ}
					finishHex={finishHex}
					emphasis={emphasis}
				/>
			) : (
				<Doors
					count={Math.max(1, type.doors)}
					width={w}
					height={carcassH}
					y={plinth}
					z={frontZ}
					finishHex={finishHex}
					emphasis={emphasis}
				/>
			)}
		</group>
	);
}

function Front({
	width,
	height,
	position,
	finishHex,
	emphasis,
}: {
	width: number;
	height: number;
	position: [number, number, number];
	finishHex: string;
	emphasis: number;
}) {
	return (
		<mesh position={position}>
			<boxGeometry args={[width, height, m(FRONT_THICKNESS_MM)]} />
			<meshStandardMaterial
				color={finishHex}
				roughness={0.5}
				emissive="#2b6cb0"
				emissiveIntensity={emphasis}
			/>
		</mesh>
	);
}

function Handle({
	position,
	vertical,
}: {
	position: [number, number, number];
	vertical: boolean;
}) {
	const length = m(HANDLE_LENGTH_MM);
	const thickness = m(HANDLE_THICKNESS_MM);
	return (
		<mesh position={position}>
			<boxGeometry
				args={
					vertical
						? [thickness, length, thickness]
						: [length, thickness, thickness]
				}
			/>
			<meshStandardMaterial
				color={HARDWARE_COLOR}
				roughness={0.3}
				metalness={0.6}
			/>
		</mesh>
	);
}

function Doors({
	count,
	width,
	height,
	y,
	z,
	finishHex,
	emphasis,
}: {
	count: number;
	width: number;
	height: number;
	y: number;
	z: number;
	finishHex: string;
	emphasis: number;
}) {
	const gap = m(DOOR_GAP_MM);
	const doorW = (width - gap * (count + 1)) / count;

	return (
		<>
			{Array.from({ length: count }, (_, i) => {
				const x = -width / 2 + gap + doorW / 2 + i * (doorW + gap);
				// Handles meet in the middle on a pair, like a real hinged run.
				const side = count === 1 ? 1 : i === 0 ? 1 : -1;
				return (
					<group key={x}>
						<Front
							width={doorW}
							height={height - gap * 2}
							position={[x, y + height / 2, z]}
							finishHex={finishHex}
							emphasis={emphasis}
						/>
						<Handle
							position={[
								x + side * (doorW / 2 - m(45)),
								y + height / 2,
								z + m(FRONT_THICKNESS_MM),
							]}
							vertical
						/>
					</group>
				);
			})}
		</>
	);
}

function Drawers({
	count,
	width,
	height,
	y,
	z,
	finishHex,
	emphasis,
}: {
	count: number;
	width: number;
	height: number;
	y: number;
	z: number;
	finishHex: string;
	emphasis: number;
}) {
	const gap = m(DOOR_GAP_MM);
	const drawerH = (height - gap * (count + 1)) / count;

	return (
		<>
			{Array.from({ length: count }, (_, i) => {
				const centreY = y + gap + drawerH / 2 + i * (drawerH + gap);
				return (
					<group key={centreY}>
						<Front
							width={width - gap * 2}
							height={drawerH}
							position={[0, centreY, z]}
							finishHex={finishHex}
							emphasis={emphasis}
						/>
						<Handle
							position={[0, centreY, z + m(FRONT_THICKNESS_MM)]}
							vertical={false}
						/>
					</group>
				);
			})}
		</>
	);
}
