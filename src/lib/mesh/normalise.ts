import type { MeshPart, Vec3 } from "./objRead";

/**
 * Turns whatever the exporter wrote into canonical millimetres, ordered
 * `[along the wall, depth, height]`.
 *
 * OBJ carries no units and no up-axis. Blender writes metres Y-up, SketchUp's
 * own exporter writes inches Z-up, and a drafter can override both. Assuming
 * one of them — which the first version of this did — means a file from any
 * other setup reads as a room-sized cabinet or none at all.
 *
 * Both are inferred from the geometry instead, using facts that hold for every
 * cabinet job regardless of who drew it.
 */

export type Normalised = {
	parts: MeshPart[];
	/** What raw coordinates were multiplied by to reach millimetres. */
	scaleFactor: number;
	/** Which raw axis turned out to be up: 0 = x, 1 = y, 2 = z. */
	upAxis: 0 | 1 | 2;
	/** The board thickness the scale was chosen to make sense of. */
	panelThicknessMm: number;
	notes: string[];
};

/** mm, cm, inch, metre. The only units anyone actually draws cabinets in. */
const CANDIDATE_SCALES = [1, 10, 25.4, 1000];

/** Sheet goods. 15, 16 and 18mm are the common boards; the range is generous. */
const BOARD_MIN_MM = 12;
const BOARD_MAX_MM = 25;

const smallest = (part: MeshPart) =>
	Math.min(...part.sizeMm.filter((d) => d > 0));

/**
 * The modal smallest-dimension across every part, in the units it would have
 * at this scale. That number is the board thickness, and board thickness is a
 * physical constant of the trade — which is what makes it a better detector
 * than the model's overall size. A single tall unit and a ten-metre kitchen
 * run differ by 4x; their board does not.
 */
function modalThickness(parts: MeshPart[], scale: number): number {
	const tally = new Map<number, number>();
	for (const part of parts) {
		const thin = smallest(part);
		if (!Number.isFinite(thin) || thin <= 0) continue;
		const mm = Math.round(thin * scale);
		tally.set(mm, (tally.get(mm) ?? 0) + 1);
	}
	let best = 0;
	let bestCount = 0;
	for (const [mm, count] of tally) {
		if (count > bestCount) {
			best = mm;
			bestCount = count;
		}
	}
	return best;
}

export function inferScale(parts: MeshPart[]): {
	scaleFactor: number;
	panelThicknessMm: number;
	confident: boolean;
} {
	for (const scale of CANDIDATE_SCALES) {
		const thickness = modalThickness(parts, scale);
		if (thickness >= BOARD_MIN_MM && thickness <= BOARD_MAX_MM) {
			return {
				scaleFactor: scale,
				panelThicknessMm: thickness,
				confident: true,
			};
		}
	}

	// Nothing landed on a plausible board. Fall back to millimetres and say so
	// rather than silently picking one — a wrong scale makes every dimension
	// and therefore every price wrong, so it has to reach the reviewer.
	return {
		scaleFactor: 1,
		panelThicknessMm: modalThickness(parts, 1),
		confident: false,
	};
}

const spanOf = (parts: MeshPart[], axis: 0 | 1 | 2) =>
	Math.max(...parts.map((p) => p.minMm[axis] + p.sizeMm[axis])) -
	Math.min(...parts.map((p) => p.minMm[axis]));

/** No kitchen is taller than this. A run can easily be wider. */
const CEILING_MM = 3000;

/**
 * Which axis points at the ceiling, in two steps that have to happen in this
 * order.
 *
 * **Depth first.** This product plans one wall, so depth is always the model's
 * smallest extent — a 600mm carcass against a 3.8m run 2.4m tall. Even a lone
 * tall cabinet is deeper-than-nothing but narrower in depth than in width or
 * height.
 *
 * **Then vote between the two that are left.** The up axis is the one most
 * panels are thin on: shelves, tops and bottoms are horizontal and outnumber
 * the sides. Doing this vote across all three axes — which an earlier version
 * did — gets the wrong answer on a real file, because doors and backs are thin
 * on *depth* and together outvote the shelves. Taking depth out of the running
 * first leaves only sides against horizontals, and horizontals always win.
 */
export function inferUpAxis(parts: MeshPart[]): {
	upAxis: 0 | 1 | 2;
	depthAxis: 0 | 1 | 2;
	confident: boolean;
} {
	const axes = [0, 1, 2] as const;
	const spans = axes.map((axis) => spanOf(parts, axis));
	const depthAxis = spans.indexOf(Math.min(...spans)) as 0 | 1 | 2;

	const votes = [0, 0, 0];
	for (const part of parts) {
		const thin = smallest(part);
		if (!Number.isFinite(thin)) continue;
		const axis = part.sizeMm.indexOf(thin);
		if (axis >= 0 && axis !== depthAxis) votes[axis] += 1;
	}

	const candidates = axes.filter((axis) => axis !== depthAxis);
	const [a, b] = candidates;
	const upAxis = votes[a] >= votes[b] ? a : b;
	const other = upAxis === a ? b : a;

	// Two corroborations, both of which have to hold before we stop asking the
	// reviewer to check: the vote was not a near-tie, and the height we picked
	// fits under a ceiling.
	const decisiveVote = votes[upAxis] >= Math.max(1, votes[other] * 1.5);
	const fitsARoom = spans[upAxis] <= CEILING_MM;

	return { upAxis, depthAxis, confident: decisiveVote && fitsARoom };
}

export function normalise(parts: MeshPart[]): Normalised {
	const notes: string[] = [];
	if (parts.length === 0) {
		return {
			parts,
			scaleFactor: 1,
			upAxis: 2,
			panelThicknessMm: 0,
			notes: ["No geometry found in the .obj."],
		};
	}

	const {
		scaleFactor,
		panelThicknessMm,
		confident: scaleOk,
	} = inferScale(parts);
	const { upAxis, depthAxis, confident: axisOk } = inferUpAxis(parts);

	if (!scaleOk) {
		notes.push(
			`Could not tell what units this file uses — no candidate scale put the board in ${BOARD_MIN_MM}-${BOARD_MAX_MM}mm. Assuming millimetres; check the sizes below.`,
		);
	}
	if (!axisOk) {
		notes.push(
			"Could not confidently tell which axis is up. Check that heights and depths below are not swapped.",
		);
	}

	const wallAxis = ([0, 1, 2] as const).find(
		(axis) => axis !== upAxis && axis !== depthAxis,
	) as 0 | 1 | 2;

	const order = [wallAxis, depthAxis, upAxis] as const;
	const round = (v: number) => Math.round(v * scaleFactor * 10) / 10;
	const permute = (v: Vec3): Vec3 => [
		round(v[order[0]]),
		round(v[order[1]]),
		round(v[order[2]]),
	];

	return {
		parts: parts.map((part) => ({
			name: part.name,
			minMm: permute(part.minMm),
			sizeMm: permute(part.sizeMm),
		})),
		scaleFactor,
		upAxis,
		panelThicknessMm,
		notes,
	};
}
