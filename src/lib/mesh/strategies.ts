import type { MeshModule, MeshPart, Vec3 } from "./objRead";
import type { ClassifiedPart } from "./roles";
import { refineHorizontals } from "./roles";

/**
 * Finding the cabinets in a flat list of panels.
 *
 * A `.skp` gave this away for free — SketchUp component instances *are* the
 * cabinets. An OBJ is one namespace of a hundred-odd panels with no hierarchy
 * at all, so the grouping has to be rebuilt from the geometry.
 *
 * There is no single rule that works on every file, so there are three, tried
 * best-first. Each reports how much it should be trusted, and the review page
 * shows which one fired — a job read by adjacency deserves a closer look than
 * one read off clean end panels.
 */

export type StrategyName = "byEndPanels" | "byAdjacency" | "wholeFile";

export type Grouping = {
	modules: MeshModule[];
	strategy: StrategyName;
	confidence: "high" | "medium" | "low";
	note: string;
};

/** Two panels this far apart are the same edge; exporters round. */
const BAND_TOLERANCE_MM = 2;

/** Narrower than this is a filler strip, not a cabinet. */
const MIN_MODULE_WIDTH_MM = 150;

/** Wider than this is two end panels that were never neighbours. */
const MAX_MODULE_WIDTH_MM = 1500;

const top = (part: MeshPart) => part.minMm[2] + part.sizeMm[2];
const right = (part: MeshPart) => part.minMm[0] + part.sizeMm[0];
const back = (part: MeshPart) => part.minMm[1] + part.sizeMm[1];

// ---------------------------------------------------------------- strategy 1

type Candidate = {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	ends: MeshPart[];
};

/**
 * The good path. Every carcass is bounded left and right by an end panel, and
 * the ends of one run share a top and bottom edge — so a run's cabinets are the
 * gaps between its ends, in order along the wall.
 */
function byEndPanels(classified: ClassifiedPart[]): Grouping | null {
	const ends = classified.filter((c) => c.role === "end").map((c) => c.part);
	const inner = classified.filter((c) => c.role !== "end").map((c) => c.part);
	if (ends.length < 2) return null;

	const bands: { y0: number; y1: number; ends: MeshPart[] }[] = [];
	for (const end of ends) {
		const y0 = end.minMm[2];
		const y1 = top(end);
		const band = bands.find(
			(b) =>
				Math.abs(b.y0 - y0) <= BAND_TOLERANCE_MM &&
				Math.abs(b.y1 - y1) <= BAND_TOLERANCE_MM,
		);
		if (band) band.ends.push(end);
		else bands.push({ y0, y1, ends: [end] });
	}

	const candidates: Candidate[] = [];
	for (const band of bands) {
		// Several records can sit at the same x — one physical panel split by
		// material, or two cabinets sharing a divider. Collapse by left edge so
		// adjacency is between positions, not records.
		const columns = new Map<number, MeshPart[]>();
		for (const end of band.ends) {
			const key = Math.round(end.minMm[0] / BAND_TOLERANCE_MM);
			const found = columns.get(key);
			if (found) found.push(end);
			else columns.set(key, [end]);
		}
		const ordered = [...columns.values()].sort(
			(a, b) => a[0].minMm[0] - b[0].minMm[0],
		);

		for (let i = 0; i < ordered.length - 1; i++) {
			const x0 = ordered[i][0].minMm[0];
			const x1 = Math.max(...ordered[i + 1].map(right));
			const width = x1 - x0;
			if (width < MIN_MODULE_WIDTH_MM || width > MAX_MODULE_WIDTH_MM) continue;
			candidates.push({
				x0,
				x1,
				y0: band.y0,
				y1: band.y1,
				ends: [...ordered[i], ...ordered[i + 1]],
			});
		}
	}

	const kept = candidates.filter((c) => !containsAnother(c, candidates));
	if (kept.length === 0) return null;

	return {
		modules: kept
			.map((c) => fromCandidate(c, inner))
			.sort((a, b) => a.minMm[2] - b.minMm[2] || a.minMm[0] - b.minMm[0]),
		strategy: "byEndPanels",
		confidence: "high",
		note: `${kept.length} cabinets read from the gaps between end panels.`,
	};
}

/**
 * A full-height side panel runs floor to ceiling, so pairing it with its
 * neighbour produces a phantom cabinet wrapping a real one — a 0-2400 shell
 * around the 1780-2380 upper actually built there. The shell is a panel, not a
 * carcass, so whenever one candidate encloses another the outer one goes.
 */
function containsAnother(c: Candidate, all: Candidate[]): boolean {
	return all.some(
		(other) =>
			other !== c &&
			other.x0 >= c.x0 - BAND_TOLERANCE_MM &&
			other.x1 <= c.x1 + BAND_TOLERANCE_MM &&
			other.y0 >= c.y0 - BAND_TOLERANCE_MM &&
			other.y1 <= c.y1 + BAND_TOLERANCE_MM &&
			(other.y1 - other.y0 < c.y1 - c.y0 || other.x1 - other.x0 < c.x1 - c.x0),
	);
}

function fromCandidate(c: Candidate, inner: MeshPart[]): MeshModule {
	const contained = inner.filter((part) => {
		const cx = part.minMm[0] + part.sizeMm[0] / 2;
		const cy = part.minMm[2] + part.sizeMm[2] / 2;
		return cx > c.x0 && cx < c.x1 && cy > c.y0 - 1 && cy < c.y1 + 1;
	});
	return moduleOf([...c.ends, ...contained], {
		x0: c.x0,
		x1: c.x1,
		y0: c.y0,
		y1: c.y1,
	});
}

// ---------------------------------------------------------------- strategy 2

/**
 * The safety net. Panels that touch belong to the same carcass, so the cabinets
 * are the connected components of "these two boxes share a face". Needs no
 * naming and no drawing convention at all — which is exactly the point.
 *
 * Only runs when there were no end panels to work with, because it cannot tell
 * two cabinets sharing a divider apart: they touch, so they come back as one.
 */
function byAdjacency(
	classified: ClassifiedPart[],
	panelThicknessMm: number,
): Grouping | null {
	const parts = classified
		.filter((c) => c.role !== "hardware")
		.map((c) => c.part);
	if (parts.length === 0) return null;

	const gap = Math.max(4, panelThicknessMm * 2);
	const parent = parts.map((_, i) => i);
	const find = (i: number): number => {
		while (parent[i] !== i) {
			parent[i] = parent[parent[i]];
			i = parent[i];
		}
		return i;
	};
	const union = (a: number, b: number) => {
		const [ra, rb] = [find(a), find(b)];
		if (ra !== rb) parent[rb] = ra;
	};

	// ponytail: O(n^2) over parts. A design is a few hundred panels, so this is
	// microseconds; swap in a grid index if an export ever arrives with tens of
	// thousands.
	for (let i = 0; i < parts.length; i++) {
		for (let j = i + 1; j < parts.length; j++) {
			if (touching(parts[i], parts[j], gap)) union(i, j);
		}
	}

	const groups = new Map<number, MeshPart[]>();
	for (let i = 0; i < parts.length; i++) {
		const root = find(i);
		const found = groups.get(root);
		if (found) found.push(parts[i]);
		else groups.set(root, [parts[i]]);
	}

	const modules = [...groups.values()]
		.filter((group) => group.length >= 3)
		.map((group) => moduleOf(group))
		.sort((a, b) => a.minMm[2] - b.minMm[2] || a.minMm[0] - b.minMm[0]);
	if (modules.length === 0) return null;

	return {
		modules,
		strategy: "byAdjacency",
		confidence: "medium",
		note: `No end panels found. ${modules.length} cabinets read from panels that touch — check the splits, two cabinets sharing a divider read as one.`,
	};
}

const touching = (a: MeshPart, b: MeshPart, gap: number) =>
	([0, 1, 2] as const).every(
		(axis) =>
			a.minMm[axis] <= b.minMm[axis] + b.sizeMm[axis] + gap &&
			b.minMm[axis] <= a.minMm[axis] + a.sizeMm[axis] + gap,
	);

// ---------------------------------------------------------------- strategy 3

/** Always succeeds. Gives the reviewer a row to correct rather than a blank table. */
function wholeFile(classified: ClassifiedPart[]): Grouping {
	const parts = classified.map((c) => c.part);
	return {
		modules: parts.length ? [moduleOf(parts)] : [],
		strategy: "wholeFile",
		confidence: "low",
		note: "Could not tell the cabinets apart, so the whole design is one row. Correct its dimensions by hand, or ask for the export to name its end panels.",
	};
}

// ------------------------------------------------------------------- shared

function moduleOf(
	parts: MeshPart[],
	extent?: { x0: number; x1: number; y0: number; y1: number },
): MeshModule {
	const lo = (axis: 0 | 1 | 2) => Math.min(...parts.map((p) => p.minMm[axis]));
	const x0 = extent?.x0 ?? lo(0);
	const x1 = extent?.x1 ?? Math.max(...parts.map(right));
	const z0 = extent?.y0 ?? lo(2);
	const z1 = extent?.y1 ?? Math.max(...parts.map(top));
	const y0 = lo(1);
	const y1 = Math.max(...parts.map(back));

	const minMm: Vec3 = [x0, y0, z0];
	const sizeMm: Vec3 = [x1 - x0, y1 - y0, z1 - z0];
	return { name: "", minMm, sizeMm, parts };
}

/**
 * Runs the ladder and returns the first strategy that finds anything, plus the
 * roles refined against the cabinet each panel turned out to belong to.
 */
export function groupModules(
	classified: ClassifiedPart[],
	panelThicknessMm: number,
): Grouping & { rolesByModule: ClassifiedPart[][] } {
	const grouping =
		byEndPanels(classified) ??
		byAdjacency(classified, panelThicknessMm) ??
		wholeFile(classified);

	const roleOf = new Map(classified.map((c) => [c.part, c]));
	const rolesByModule = grouping.modules.map((module) =>
		refineHorizontals(
			module.parts.map(
				(part) =>
					roleOf.get(part) ?? {
						part,
						role: "unknown" as const,
						source: "geometry" as const,
					},
			),
			module.minMm[2],
			module.minMm[2] + module.sizeMm[2],
		),
	);

	return { ...grouping, rolesByModule };
}
