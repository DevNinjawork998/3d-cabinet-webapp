import { Edges } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import {
	CARCASS_COLOR,
	CARCASS_INTERIOR_COLOR,
	CONSTRUCTION,
	type DoorStyle,
	doorLeavesFor,
	type Family,
	GLASS_COLOR,
	HARDWARE_COLOR,
} from "@/lib/planner/catalogue";

/**
 * One cabinet, generated from its family and the size the customer chose.
 *
 * It is drawn in two halves, because that is how it is sold: the **carcass**
 * always, and a **door** only once one has been put on it. A doorless carcass
 * has to read as an open box — dark interior, a back panel and a shelf — or a
 * customer cannot tell the difference between "no door yet" and "a very plain
 * door".
 */

const m = (mm: number) => mm / 1000;

/**
 * A shaker's recessed centre panel needs to read as a step in depth against
 * its own frame — but "same colour, different roughness" is invisible once
 * the finish is dark (Strata Noir), so it has to be an actual colour step.
 * Step toward the *opposite* end of the scale from the finish itself: a dark
 * finish gets a lighter inset, a light finish gets a darker one. Stepping
 * the same direction on every finish would just push a near-black colour
 * closer to black, which stays invisible.
 */
function insetShade(hex: string): string {
	const n = Number.parseInt(hex.slice(1), 16);
	const r = (n >> 16) & 0xff;
	const g = (n >> 8) & 0xff;
	const b = n & 0xff;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	const amount = 0.3;
	const move = (c: number) =>
		Math.max(
			0,
			Math.min(
				255,
				Math.round(luminance < 0.5 ? c + (255 - c) * amount : c * (1 - amount)),
			),
		);
	return `#${((move(r) << 16) | (move(g) << 8) | move(b)).toString(16).padStart(6, "0")}`;
}

const EDGE_COLOR = "#3f3b36";
const EDGE_OPACITY = 0.55;

/** Gap around each door so a run reads as separate fronts, not one slab. */
const DOOR_GAP_MM = 4;
const FRONT_THICKNESS_MM = 18;
const HANDLE_LENGTH_MM = 128;
const HANDLE_THICKNESS_MM = 14;
/** Width of the stile/rail frame on a shaker or glazed front. */
const FRAME_MM = 60;

export function Cabinet({
	moduleId,
	family,
	widthMm,
	door,
	xMm,
	runWidthMm,
	floorHeightMm,
	finishHex,
	selected,
	highlighted,
	onPointerDown,
	onPointerMove,
	onPointerOut,
}: {
	/** Stamped onto the group so a raycast can name what it hit — that is how a
	 * door dropped from the HTML palette finds its carcass. */
	moduleId: string;
	family: Family;
	/** The chosen size — off the placed cabinet, not the family. */
	widthMm: number;
	/** `null` while it is still a bare carcass. */
	door: DoorStyle | null;
	/** Left edge along the run. */
	xMm: number;
	runWidthMm: number;
	/** Underside above the floor, so a whole wall row can be raised together. */
	floorHeightMm: number;
	finishHex: string;
	selected: boolean;
	/** A door is being dragged over this one right now, or the measuring tool
	 * is hovering it. */
	highlighted?: boolean;
	onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
	onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
	onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
}) {
	// The run is centred on the origin, so a cabinet's world x is its centre
	// measured from the middle of the wall.
	const centreX = m(xMm + widthMm / 2 - runWidthMm / 2);
	// Cabinets hang by their backs. The parent group sits on the wall plane and
	// each steps forward by half its own depth, so a 397-deep wall unit and a
	// 607-deep base unit share a back rather than a centre line.
	const backToCentre = m(family.depthMm) / 2;

	const w = m(widthMm);
	const d = m(family.depthMm);
	const h = m(family.heightMm);
	const t = m(CONSTRUCTION.panelThicknessMm);
	const plinth = family.kind === "wall" ? 0 : m(CONSTRUCTION.plinthHeightMm);
	const carcassH = h - plinth;
	const base = m(floorHeightMm);

	// What the design file said this cabinet holds. A family imported before
	// geometry was recorded — or a hand-written one — keeps the old look: one
	// shelf, leaves derived from width.
	const shelves = family.geometry
		? family.geometry.shelves + family.geometry.fixedShelves
		: 1;
	const drawers = family.geometry?.drawers ?? family.drawers;

	const frontZ = d / 2 + m(FRONT_THICKNESS_MM) / 2;
	const emphasis = highlighted ? 0.6 : selected ? 0.35 : 0;
	const emissive = highlighted ? "#15803d" : "#2b6cb0";

	return (
		<group
			position={[centreX, base, backToCentre]}
			userData={{ moduleId }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerOut={onPointerOut}
		>
			{/* Plinth: the recessed kick under a floor-standing unit. */}
			{plinth > 0 && (
				<mesh position={[0, plinth / 2, -m(30)]}>
					<boxGeometry args={[w - t, plinth, d - m(60)]} />
					<meshStandardMaterial color="#3a3835" roughness={0.9} />
				</mesh>
			)}

			{/* Carcass: five panels rather than one box, so the inside is visible
			    when there is no door on it yet. */}
			<Carcass
				width={w}
				depth={d}
				height={carcassH}
				thickness={t}
				y={plinth}
				shelves={shelves}
				hasBack={family.geometry?.hasBack ?? true}
				emissive={emissive}
				emphasis={emphasis}
			/>

			{door &&
				(drawers > 0 ? (
					<Drawers
						count={drawers}
						door={door}
						width={w}
						height={carcassH}
						y={plinth}
						z={frontZ}
						finishHex={finishHex}
						emissive={emissive}
						emphasis={emphasis}
					/>
				) : (
					<Doors
						count={family.geometry?.doorLeaves || doorLeavesFor(widthMm)}
						door={door}
						width={w}
						height={carcassH}
						y={plinth}
						z={frontZ}
						finishHex={finishHex}
						emissive={emissive}
						emphasis={emphasis}
					/>
				))}
		</group>
	);
}

/**
 * Sides, top, bottom, a back and however many shelves the design has — an open
 * box you can see into.
 *
 * The shelf count is the cheapest thing that makes two imported designs read as
 * different products: a tall unit with six shelves and a base unit with one are
 * the same six boxes otherwise.
 */
function Carcass({
	width,
	depth,
	height,
	thickness,
	y,
	shelves,
	hasBack,
	emissive,
	emphasis,
}: {
	width: number;
	depth: number;
	height: number;
	thickness: number;
	y: number;
	shelves: number;
	hasBack: boolean;
	emissive: string;
	emphasis: number;
}) {
	const panel = (
		key: string,
		args: [number, number, number],
		position: [number, number, number],
		interior = false,
	) => (
		<mesh key={key} position={position}>
			<boxGeometry args={args} />
			<meshStandardMaterial
				color={interior ? CARCASS_INTERIOR_COLOR : CARCASS_COLOR}
				roughness={0.85}
				emissive={emissive}
				emissiveIntensity={emphasis}
			/>
			<Edges
				threshold={15}
				color={EDGE_COLOR}
				transparent
				opacity={EDGE_OPACITY}
			/>
		</mesh>
	);

	const midY = y + height / 2;
	return (
		<>
			{panel(
				"left",
				[thickness, height, depth],
				[-width / 2 + thickness / 2, midY, 0],
			)}
			{panel(
				"right",
				[thickness, height, depth],
				[width / 2 - thickness / 2, midY, 0],
			)}
			{panel("bottom", [width, thickness, depth], [0, y + thickness / 2, 0])}
			{panel(
				"top",
				[width, thickness, depth],
				[0, y + height - thickness / 2, 0],
			)}
			{hasBack &&
				panel(
					"back",
					[width, height, thickness],
					[0, midY, -depth / 2 + thickness / 2],
					true,
				)}
			{shelfHeights(shelves, y, height, thickness).map((shelfY, i) =>
				panel(
					`shelf-${i}`,
					[width - thickness * 2, thickness, depth - thickness * 2],
					[0, shelfY, 0],
					true,
				),
			)}
		</>
	);
}

/**
 * Shelves split the opening into equal bays, which is how they are actually
 * set out — three shelves make four bays, not three shelves crowded at the
 * bottom. Returns nothing for a cabinet with no shelves, so a drawer bank does
 * not get a stray board through the middle of it.
 */
function shelfHeights(
	count: number,
	y: number,
	height: number,
	thickness: number,
): number[] {
	if (count <= 0) return [];
	const clear = height - thickness * 2;
	return Array.from(
		{ length: count },
		(_, i) => y + thickness + (clear * (i + 1)) / (count + 1),
	);
}

function Front({
	door,
	width,
	height,
	position,
	finishHex,
	emissive,
	emphasis,
}: {
	door: DoorStyle;
	width: number;
	height: number;
	position: [number, number, number];
	finishHex: string;
	emissive: string;
	emphasis: number;
}) {
	const frame = m(FRAME_MM);
	const panelW = Math.max(width - frame * 2, width * 0.2);
	const panelH = Math.max(height - frame * 2, height * 0.2);

	return (
		<group position={position}>
			<mesh>
				<boxGeometry args={[width, height, m(FRONT_THICKNESS_MM)]} />
				<meshStandardMaterial
					color={finishHex}
					roughness={0.5}
					emissive={emissive}
					emissiveIntensity={emphasis}
				/>
				<Edges
					threshold={15}
					color={EDGE_COLOR}
					transparent
					opacity={EDGE_OPACITY}
				/>
			</mesh>

			{/* A shaker's recessed centre panel, and a glazed one's pane. Both are
			    the same inset box; only the material differs. */}
			{door.look !== "slab" && (
				<mesh position={[0, 0, m(FRONT_THICKNESS_MM) / 2]}>
					<boxGeometry args={[panelW, panelH, m(4)]} />
					{door.look === "glass" ? (
						<meshStandardMaterial
							color={GLASS_COLOR}
							roughness={0.1}
							metalness={0.1}
							transparent
							opacity={0.55}
						/>
					) : (
						<meshStandardMaterial
							color={insetShade(finishHex)}
							roughness={0.6}
						/>
					)}
					<Edges
						threshold={15}
						color={EDGE_COLOR}
						transparent
						opacity={EDGE_OPACITY}
					/>
				</mesh>
			)}
		</group>
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
	door,
	width,
	height,
	y,
	z,
	finishHex,
	emissive,
	emphasis,
}: {
	count: number;
	door: DoorStyle;
	width: number;
	height: number;
	y: number;
	z: number;
	finishHex: string;
	emissive: string;
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
							door={door}
							width={doorW}
							height={height - gap * 2}
							position={[x, y + height / 2, z]}
							finishHex={finishHex}
							emissive={emissive}
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
	door,
	width,
	height,
	y,
	z,
	finishHex,
	emissive,
	emphasis,
}: {
	count: number;
	door: DoorStyle;
	width: number;
	height: number;
	y: number;
	z: number;
	finishHex: string;
	emissive: string;
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
							door={door}
							width={width - gap * 2}
							height={drawerH}
							position={[0, centreY, z]}
							finishHex={finishHex}
							emissive={emissive}
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
