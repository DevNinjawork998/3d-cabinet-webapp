import { Edges } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import {
	CARCASS_COLOR,
	CARCASS_INTERIOR_COLOR,
	CONSTRUCTION,
	type DoorStyle,
	type Family,
	GLASS_COLOR,
	HARDWARE_COLOR,
} from "@/lib/planner/catalogue";
import type { ExposedSides } from "@/lib/planner/exposure";
import { FULLY_EXPOSED } from "@/lib/planner/exposure";
import {
	cabinetPartsMm,
	FRONT_THICKNESS_MM,
	isInteriorPart,
	type PartBoxMm,
	standOf,
} from "@/lib/planner/parts";
import { DesignedCabinet, useDesignMesh } from "./DesignedCabinet";
import { type GrainDirection, useFrontSurface, useGrain } from "./grain";

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
	finishPhoto,
	selected,
	highlighted,
	exposed = FULLY_EXPOSED,
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
	/** The uploaded decor photo for this finish. When present it *is* the
	 * front's surface — the real scan of the board — and `finishHex` only
	 * still drives the shaker inset. */
	finishPhoto: string | null;
	selected: boolean;
	/** A door is being dragged over this one right now, or the measuring tool
	 * is hovering it. */
	highlighted?: boolean;
	/** Which of this cabinet's outer sides nothing sits against, so the end of
	 * a run can be veneered the way a fitter really finishes it. Defaults to
	 * both, which is what a cabinet drawn on its own wears. */
	exposed?: ExposedSides;
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

	// Every box this cabinet is drawn from, in millimetres. The same call the
	// measuring tool makes, so a dimension line can never disagree with the
	// cabinet it is drawn against — see `lib/planner/parts.ts`.
	const parts = cabinetPartsMm(family, widthMm, door !== null);
	const stand = standOf(family);
	const carcassParts = parts.filter(
		(part) =>
			part.role !== "doorLeaf" &&
			part.role !== "drawerFront" &&
			part.role !== "leg",
	);
	const legParts = parts.filter((part) => part.role === "leg");
	const leaves = parts.filter((part) => part.role === "doorLeaf");
	const drawerFronts = parts.filter((part) => part.role === "drawerFront");

	const emphasis = highlighted ? 0.6 : selected ? 0.35 : 0;
	const emissive = highlighted ? "#15803d" : "#2b6cb0";

	// Same trick the doors use: a fraction derived from where the cabinet sits,
	// so two end panels in one room are cut from different parts of the sheet
	// rather than being the same photograph twice.
	const sheetOffset = Math.abs(centreX * 1.37) % 1;

	// The model the drafter drew, if this rung has one published. It hangs off
	// the size rather than the family because the client draws one export per
	// width — BC 800, BC 900, BC 1000 — so the ladder is a set of files.
	//
	// Null covers three cases, all of which fall through to the procedural
	// boxes below: a catalogue published before design intake, a design whose
	// file would not convert, and the frame or two before the bytes land.
	const designGroups = useDesignMesh(
		family.sizes.find((size) => size.widthMm === widthMm)?.meshDesignId,
	);

	return (
		<group
			position={[centreX, base, backToCentre]}
			userData={{ moduleId }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerOut={onPointerOut}
		>
			{designGroups ? (
				<DesignedCabinet
					groups={designGroups}
					door={door}
					finishHex={finishHex}
					finishPhoto={finishPhoto}
					sheetOffset={sheetOffset}
					selected={selected}
					highlighted={highlighted}
				/>
			) : (
				<>
					{/* Plinth: the recessed kick under a floor-standing unit. A design
			    that recorded its own feet stands on those instead — they come
			    through `cabinetPartsMm` as `leg` parts. */}
					{stand.legs === 0 && plinth > 0 && (
						<mesh position={[0, plinth / 2, -m(30)]}>
							<boxGeometry args={[w - t, plinth, d - m(60)]} />
							<meshStandardMaterial color="#3a3835" roughness={0.9} />
						</mesh>
					)}

					{/* The feet the design was drawn with. Cylinders, because a leveller
			    is round and a box here reads as a stubby plinth leg. */}
					{legParts.map((leg) => (
						<mesh
							key={`leg-${leg.index}`}
							position={[
								m(leg.centreMm.x),
								m(leg.centreMm.y),
								m(leg.centreMm.z),
							]}
						>
							<cylinderGeometry
								args={[
									m(leg.sizeMm.x) / 2,
									m(leg.sizeMm.x) / 2,
									m(leg.sizeMm.y),
									12,
								]}
							/>
							<meshStandardMaterial
								color={HARDWARE_COLOR}
								roughness={0.5}
								metalness={0.35}
							/>
						</mesh>
					))}

					{/* Carcass: separate panels rather than one box, so the inside is
			    visible when there is no door on it yet. */}
					<Carcass
						parts={carcassParts}
						width={w}
						depth={d}
						height={carcassH}
						exposed={exposed}
						finishHex={finishHex}
						finishPhoto={finishPhoto}
						sheetOffset={sheetOffset}
						emissive={emissive}
						emphasis={emphasis}
					/>

					{door &&
						(drawerFronts.length > 0 ? (
							<Drawers
								parts={drawerFronts}
								finishPhoto={finishPhoto}
								door={door}
								finishHex={finishHex}
								emissive={emissive}
								emphasis={emphasis}
							/>
						) : (
							<Doors
								parts={leaves}
								finishPhoto={finishPhoto}
								door={door}
								finishHex={finishHex}
								emissive={emissive}
								emphasis={emphasis}
							/>
						))}
				</>
			)}
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
	parts,
	width,
	depth,
	height,
	exposed,
	finishHex,
	finishPhoto,
	sheetOffset,
	emissive,
	emphasis,
}: {
	parts: PartBoxMm[];
	/** Only the grain needs these — the panels carry their own sizes. */
	width: number;
	depth: number;
	height: number;
	/** Which outer sides nothing sits against, from `exposedSides`. */
	exposed: ExposedSides;
	finishHex: string;
	finishPhoto: string | null;
	/** Where in the decor sheet this cabinet's end panel is cut from. */
	sheetOffset: number;
	emissive: string;
	emphasis: number;
}) {
	// Melamine board takes the grain as sheen only. With the figure on, the
	// inside of an open carcass reads as slatted timber, which is both wrong and
	// louder than the doors it sits behind.
	const figure = useGrain("vertical", width, height, "sheen");

	// The end of a run is veneered to match the doors — it is the one carcass
	// panel anyone ever sees, and in the default 3/4 view it faces the camera.
	// The panel is seen across its depth and up its height, so those are the
	// dimensions the sheet is cut to, not the carcass width.
	const veneer = useFrontSurface(
		finishPhoto,
		"vertical",
		depth,
		height,
		finishHex,
		sheetOffset,
	);

	/** A side panel with nothing against it, on a finish we have a board for.
	 * Without a photo there is nothing to veneer with, and the melamine look
	 * is what the scene has always had. */
	const isVeneered = (part: PartBoxMm) =>
		finishPhoto !== null &&
		part.role === "side" &&
		(part.index === 0 ? exposed.left : exposed.right);

	return (
		<>
			{parts.map((part) => (
				<mesh
					key={`${part.role}-${part.index}`}
					position={[
						m(part.centreMm.x),
						m(part.centreMm.y),
						m(part.centreMm.z),
					]}
				>
					<boxGeometry
						args={[m(part.sizeMm.x), m(part.sizeMm.y), m(part.sizeMm.z)]}
					/>
					<meshStandardMaterial
						color={
							isInteriorPart(part.role) ? CARCASS_INTERIOR_COLOR : CARCASS_COLOR
						}
						roughness={0.85}
						{...(isVeneered(part) ? veneer : figure)}
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
			))}
		</>
	);
}

function Front({
	door,
	width,
	height,
	position,
	finishHex,
	finishPhoto,
	grain,
	emissive,
	emphasis,
}: {
	door: DoorStyle;
	width: number;
	height: number;
	position: [number, number, number];
	finishHex: string;
	finishPhoto: string | null;
	/** Up a door, across a drawer front — the way the veneer is actually cut. */
	grain: GrainDirection;
	emissive: string;
	emphasis: number;
}) {
	const surface = useFrontSurface(
		finishPhoto,
		grain,
		width,
		height,
		finishHex,
		// Fractional part of the door's own x, so two doors side by side are cut
		// from different parts of the sheet and a run stops looking cloned.
		Math.abs(position[0] * 1.37) % 1,
	);
	const frame = m(FRAME_MM);
	const panelW = Math.max(width - frame * 2, width * 0.2);
	const panelH = Math.max(height - frame * 2, height * 0.2);

	return (
		<group position={position}>
			<mesh>
				<boxGeometry args={[width, height, m(FRONT_THICKNESS_MM)]} />
				<meshStandardMaterial
					roughness={0.5}
					{...surface}
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
							roughnessMap={surface.roughnessMap}
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
	parts,
	door,
	finishHex,
	finishPhoto,
	emissive,
	emphasis,
}: {
	parts: PartBoxMm[];
	door: DoorStyle;
	finishHex: string;
	finishPhoto: string | null;
	emissive: string;
	emphasis: number;
}) {
	return (
		<>
			{parts.map((leaf) => {
				// Handles meet in the middle on a pair, like a real hinged run.
				const side = parts.length === 1 || leaf.index === 0 ? 1 : -1;
				const x = m(leaf.centreMm.x);
				const y = m(leaf.centreMm.y);
				const z = m(leaf.centreMm.z);
				const leafW = m(leaf.sizeMm.x);

				return (
					<group key={leaf.index}>
						<Front
							door={door}
							width={leafW}
							height={m(leaf.sizeMm.y)}
							position={[x, y, z]}
							finishHex={finishHex}
							finishPhoto={finishPhoto}
							grain="vertical"
							emissive={emissive}
							emphasis={emphasis}
						/>
						<Handle
							position={[
								x + side * (leafW / 2 - m(45)),
								y,
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
	parts,
	door,
	finishHex,
	finishPhoto,
	emissive,
	emphasis,
}: {
	parts: PartBoxMm[];
	door: DoorStyle;
	finishHex: string;
	finishPhoto: string | null;
	emissive: string;
	emphasis: number;
}) {
	return (
		<>
			{parts.map((front) => {
				const x = m(front.centreMm.x);
				const y = m(front.centreMm.y);
				const z = m(front.centreMm.z);

				return (
					<group key={front.index}>
						<Front
							door={door}
							width={m(front.sizeMm.x)}
							height={m(front.sizeMm.y)}
							position={[x, y, z]}
							finishHex={finishHex}
							finishPhoto={finishPhoto}
							grain="horizontal"
							emissive={emissive}
							emphasis={emphasis}
						/>
						<Handle
							position={[x, y, z + m(FRONT_THICKNESS_MM)]}
							vertical={false}
						/>
					</group>
				);
			})}
		</>
	);
}
