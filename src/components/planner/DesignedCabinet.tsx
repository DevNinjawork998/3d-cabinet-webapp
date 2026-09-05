import { useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import {
	decodeRenderMesh,
	type MeshGroup,
	type MeshGroupRole,
	splitDoorLeaves,
} from "@/lib/mesh/renderMesh";
import {
	CARCASS_COLOR,
	CARCASS_INTERIOR_COLOR,
	type DoorStyle,
	HARDWARE_COLOR,
} from "@/lib/planner/catalogue";
import type { ExposedSides } from "@/lib/planner/exposure";
import type { HingeSide } from "@/lib/planner/layout";
import type { DesignPartBox } from "@/lib/planner/measure";
import { drawerTravelMm } from "@/lib/planner/parts";
import { type BoxMm, swingOf } from "@/lib/planner/swing";
import { useFrontSurface, useGrain } from "./grain";
import { Hinge, hingeOf } from "./Hinge";
import { Slide } from "./Slide";

/**
 * A cabinet drawn from the model the drafter actually made.
 *
 * This is the planner's primary path. `Cabinet.tsx` — six procedural boxes
 * rebuilt from a count of shelves — is the fallback for a family with no
 * published design, which means every catalogue published before design intake
 * and any design whose file would not convert.
 *
 * The geometry arrives as classified groups, not one lump, and that is what
 * keeps the two features that carry the sale:
 *
 * - **The finish picker** works because the `door` and `drawerFront` groups are
 *   known, so the customer's finish is painted onto exactly the surfaces a
 *   sprayer would paint. The drafter's own materials are dropped at intake.
 * - **The doors-open toggle** works because those same groups can be hidden
 *   without touching the carcass.
 *
 * No loader ships to the customer. The bytes are positions and indices, and
 * `BufferGeometry` takes them directly.
 */

const m = (mm: number) => mm / 1000;

/** The mesh carries a bbox as two triples; `swingOf` works in `{x,y,z}`. */
const boxOf = (bbox: MeshGroup["bboxMm"]): BoxMm => ({
	min: { x: bbox.min[0], y: bbox.min[1], z: bbox.min[2] },
	max: { x: bbox.max[0], y: bbox.max[1], z: bbox.max[2] },
});

/**
 * One fetch per design, shared by every placement of it.
 *
 * A run of four identical base units is one request, and the promise is cached
 * rather than the result so four cabinets mounting in the same frame do not
 * each start their own. Same lazy-singleton shape as `grain.ts`, and for the
 * same reason: this module is imported by a client component that Next also
 * renders on the server, where there is no `fetch` worth starting.
 */
const meshes = new Map<string, Promise<MeshGroup[]>>();

/**
 * What has actually arrived, readable without awaiting.
 *
 * The measuring tool needs the drawn geometry from inside a click handler,
 * where it cannot await anything — see `peekDesignMesh`.
 */
const resolved = new Map<string, MeshGroup[]>();

function loadMesh(designId: string): Promise<MeshGroup[]> {
	let pending = meshes.get(designId);
	if (!pending) {
		pending = fetch(`/api/cabinet-mesh/${designId}`)
			.then(async (res) => {
				if (!res.ok) throw new Error(`mesh ${designId}: ${res.status}`);
				return decodeRenderMesh(new Uint8Array(await res.arrayBuffer()));
			})
			.then((mesh) => {
				resolved.set(designId, mesh.groups);
				return mesh.groups;
			});
		meshes.set(designId, pending);
	}
	return pending;
}

/**
 * The loaded mesh, or null if it has not arrived — never a promise.
 *
 * For the measuring tool, which snaps inside a pointer handler and cannot wait.
 * Null is not a race to paper over: if the bytes are not here the scene is
 * drawing procedural boxes, so `measure.ts` snapping to procedural boxes is the
 * *correct* answer at that instant. By the time a customer can see a cabinet
 * well enough to measure it, this returns.
 */
export function peekDesignMesh(
	designId: string | undefined,
): MeshGroup[] | null {
	return designId ? (resolved.get(designId) ?? null) : null;
}

/** The drafted group boxes in the shape `lib/planner/measure.ts` takes — plain
 * numbers, so the pure engine keeps no dependency on this folder or on three. */
export function designPartBoxes(
	groups: MeshGroup[] | null,
): DesignPartBox[] | null {
	if (!groups) return null;
	return groups.map((group) => ({
		role: group.role,
		minMm: {
			x: group.bboxMm.min[0],
			y: group.bboxMm.min[1],
			z: group.bboxMm.min[2],
		},
		maxMm: {
			x: group.bboxMm.max[0],
			y: group.bboxMm.max[1],
			z: group.bboxMm.max[2],
		},
	}));
}

/**
 * Null until the bytes land, and null forever if they do not.
 *
 * A failed fetch is not an error state the customer should see — it is a
 * cabinet that falls back to procedural geometry, which is a cabinet that still
 * looks like a cabinet and can still be bought.
 */
export function useDesignMesh(
	designId: string | undefined,
): MeshGroup[] | null {
	const [groups, setGroups] = useState<MeshGroup[] | null>(null);

	useEffect(() => {
		if (!designId) {
			setGroups(null);
			return;
		}
		let cancelled = false;
		loadMesh(designId)
			.then((loaded) => {
				if (!cancelled) setGroups(loaded);
			})
			.catch(() => {
				if (!cancelled) setGroups(null);
			});
		return () => {
			cancelled = true;
		};
	}, [designId]);

	return groups;
}

/** Millimetres in, metres out — the scene's unit — and normals computed here
 * because the format carries none. Without `computeVertexNormals` every
 * surface renders unlit black. */
function geometryOf(group: MeshGroup): BufferGeometry {
	const geometry = new BufferGeometry();
	const scaled = new Float32Array(group.positions.length);
	for (let i = 0; i < group.positions.length; i++) {
		scaled[i] = group.positions[i] / 1000;
	}
	geometry.setAttribute("position", new BufferAttribute(scaled, 3));
	geometry.setIndex(new BufferAttribute(group.indices, 1));
	geometry.computeVertexNormals();
	return geometry;
}

const isFront = (role: MeshGroupRole) =>
	role === "door" || role === "drawerFront";

function Group({
	group,
	geometry,
	door,
	finishHex,
	finishPhoto,
	sheetOffset,
	emissive,
	emphasis,
}: {
	group: MeshGroup;
	geometry: BufferGeometry;
	door: DoorStyle | null;
	finishHex: string;
	finishPhoto: string | null;
	sheetOffset: number;
	emissive: string;
	emphasis: number;
}) {
	const sizeMm = {
		x: group.bboxMm.max[0] - group.bboxMm.min[0],
		y: group.bboxMm.max[1] - group.bboxMm.min[1],
	};

	// Grain runs up a door and across a drawer front, which is how they are
	// really veneered, and getting it backwards looks wrong to someone who
	// could not say why.
	const front = useFrontSurface(
		finishPhoto,
		group.role === "drawerFront" ? "horizontal" : "vertical",
		m(sizeMm.x),
		m(sizeMm.y),
		finishHex,
		sheetOffset,
	);
	// Melamine board takes the grain as sheen only. With the figure on, a
	// carcass reads as timber, which is exactly the wrong answer.
	const carcass = useGrain("vertical", m(sizeMm.x), m(sizeMm.y), "sheen");

	const material =
		isFront(group.role) && door
			? { ...front, roughness: door.look === "glass" ? 0.1 : 0.45 }
			: group.role === "hardware"
				? { color: HARDWARE_COLOR, roughness: 0.5, metalness: 0.35 }
				: group.role === "shelf"
					? { color: CARCASS_INTERIOR_COLOR, roughness: 0.85, ...carcass }
					: group.role === "other"
						? { color: CARCASS_INTERIOR_COLOR, roughness: 0.8 }
						: { color: CARCASS_COLOR, roughness: 0.8, ...carcass };

	return (
		<mesh geometry={geometry}>
			<meshStandardMaterial
				{...material}
				emissive={emissive}
				emissiveIntensity={emphasis}
			/>
		</mesh>
	);
}

export function DesignedCabinet({
	groups,
	door,
	hinge,
	exposed,
	open,
	finishHex,
	finishPhoto,
	sheetOffset,
	selected,
	highlighted,
}: {
	groups: MeshGroup[];
	/** `null` while it is still a bare carcass — the fronts are not drawn. */
	door: DoorStyle | null;
	/** Which stile a lone leaf hangs on. */
	hinge: HingeSide;
	/** Which outer sides nothing sits against. A leaf hangs on the cabinet's
	 * outer stile, so this is what decides whether it may take the full swing
	 * or has to stop square to the wall. */
	exposed: ExposedSides;
	/** Swing the doors open. */
	open: boolean;
	finishHex: string;
	finishPhoto: string | null;
	/** Where in the decor sheet this cabinet's fronts are cut from, so two
	 * neighbours are not the same photograph twice. */
	sheetOffset: number;
	selected: boolean;
	highlighted?: boolean;
}) {
	// The doors arrive as one merged group — triangles are bucketed by role at
	// intake — so a pair has to be cut back into leaves before either of them can
	// swing on its own. Left to right, so leaf 0 is the left-hand door.
	//
	// ponytail: handles classified `hardware` sit in their own group and stay put
	// while the door moves. Invisible on the client's own export, whose only
	// hardware is four levellers. If a design lands with handles on it, move this
	// split up into `buildRenderMesh`, where the drafter's own names
	// (`Door_L_`, `G-Door(R)`) are still there to group against.
	const drawn = useMemo(
		() =>
			groups.flatMap((group) =>
				group.role === "door" ? splitDoorLeaves(group) : [group],
			),
		[groups],
	);

	// Keyed on the array identity, which is stable per design because the
	// loader caches the promise — so placing a fifth copy of a cabinet uploads
	// nothing new to the GPU.
	const geometries = useMemo(() => drawn.map(geometryOf), [drawn]);

	const leaves = drawn.filter((group) => group.role === "door").length;

	// The box the doors hang on. `swingOf` compares a leaf's back face against
	// this front face to tell an overlay door from an inset one; without a
	// carcass group there is nothing to compare against, so fall back to
	// treating the leaf as an overlay — which is what every design the client
	// has sent so far actually is.
	const carcassMm = useMemo((): BoxMm | null => {
		const carcass = groups.find((group) => group.role === "carcass");
		return carcass ? boxOf(carcass.bboxMm) : null;
	}, [groups]);

	const emphasis = highlighted ? 0.6 : selected ? 0.35 : 0;
	const emissive = highlighted ? "#15803d" : "#2b6cb0";

	let leafIndex = 0;

	return (
		<>
			{drawn.map((group, i) => {
				// A doorless carcass is a real state — the customer has placed a
				// unit but not chosen a front — and it has to read as an open box.
				if (isFront(group.role) && !door) return null;

				// Role plus left edge, because `door` now repeats: two leaves of one
				// pair are the same role and only their position tells them apart.
				const key = `${group.role}-${Math.round(group.bboxMm.min[0])}`;

				const rendered = (
					<Group
						key={key}
						group={group}
						geometry={geometries[i]}
						door={door}
						finishHex={finishHex}
						finishPhoto={finishPhoto}
						sheetOffset={sheetOffset}
						emissive={emissive}
						emphasis={emphasis}
					/>
				);
				// A drafted drawer runs out on the same toggle that swings the doors.
				// Without this a design's drawer bank sits frozen beside its own
				// opening doors, which is what reads as broken.
				if (group.role === "drawerFront") {
					const depthMm = carcassMm
						? carcassMm.max.z - carcassMm.min.z
						: group.bboxMm.max[2] - group.bboxMm.min[2];
					return (
						<Slide
							key={key}
							travel={drawerTravelMm(depthMm) / 1000}
							open={open}
						>
							{rendered}
						</Slide>
					);
				}

				if (group.role !== "door") return rendered;

				const side = hingeOf(leafIndex++, leaves, hinge);
				const leafMm = boxOf(group.bboxMm);
				// No carcass to measure against means no way to tell overlay from
				// inset, so assume the leaf sits proud of a front at its own back
				// face — the overlay case, and the only one drawn so far.
				const spec = swingOf(
					leafMm,
					carcassMm ?? { ...leafMm, max: { ...leafMm.max, z: leafMm.min.z } },
					side,
					!exposed[side],
				);
				return (
					<Hinge key={key} spec={spec} open={open}>
						{rendered}
					</Hinge>
				);
			})}
		</>
	);
}
