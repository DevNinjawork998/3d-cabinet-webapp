import { parseSkp } from "openskp";

/**
 * The only file in the codebase that touches openskp. Everything downstream
 * works off the plain types below, so swapping the parser — or falling back to
 * a SketchUp-side Ruby export — touches this module and nothing else.
 *
 * SketchUp stores everything in inches; we speak millimetres everywhere else.
 */

export type Vec3 = [number, number, number];

/** One named entity inside a module: a panel, a door, a shelf, a drawer. */
export type SkpPart = {
	name: string;
	/** Axis-aligned world bounds, millimetres. */
	minMm: Vec3;
	sizeMm: Vec3;
};

/** One top-level named instance — a cabinet, an end panel, a filler. */
export type SkpModule = {
	name: string;
	minMm: Vec3;
	sizeMm: Vec3;
	parts: SkpPart[];
};

export type SkpMaterial = {
	/** Mozaik's internal id, e.g. `3#396#6`. Kept for traceability. */
	name: string;
	/** Human-readable name recovered from the texture path, e.g. `Strata Noir`. */
	label: string;
	hex: string;
	texture: string | null;
	transparency: number;
};

export type SkpRead = {
	version: string;
	layers: string[];
	modules: SkpModule[];
	materials: SkpMaterial[];
};

const IN_TO_MM = 25.4;

/**
 * SketchUp's transform, as openskp hands it over: a row-major 3x3 rotation,
 * a translation, and a homogeneous divisor — 13 numbers.
 */
type Transform = number[];

const IDENTITY: Transform = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

function apply(t: Transform, x: number, y: number, z: number): Vec3 {
	const w = t[12] || 1;
	return [
		(t[0] * x + t[1] * y + t[2] * z + t[9]) / w,
		(t[3] * x + t[4] * y + t[5] * z + t[10]) / w,
		(t[6] * x + t[7] * y + t[8] * z + t[11]) / w,
	];
}

/**
 * `parent` applied to `child`: rotate by the child, then by the parent.
 * R = Rp·Rc and t = Rp·tc + tp — done explicitly rather than by transforming
 * basis vectors, because that shortcut silently assumes a column-major layout
 * and mirrors every rotated panel to the wrong side of its carcass.
 */
function compose(parent: Transform, child: Transform): Transform {
	const r: number[] = [];
	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			r.push(
				parent[row * 3] * child[col] +
					parent[row * 3 + 1] * child[3 + col] +
					parent[row * 3 + 2] * child[6 + col],
			);
		}
	}
	const t = apply(parent, child[9], child[10], child[11]);
	// ponytail: apply() has already divided out both w's, so the composed
	// transform carries none. Fine while w is SketchUp's uniform-scale divisor
	// and equals 1, which holds for Mozaik exports; a scaled instance would
	// need the divisor folded into `r` as well.
	return [...r, ...t, 1];
}

/** Running axis-aligned bounds, in inches, grown one vertex at a time. */
class Bounds {
	min: Vec3 = [
		Number.POSITIVE_INFINITY,
		Number.POSITIVE_INFINITY,
		Number.POSITIVE_INFINITY,
	];
	max: Vec3 = [
		Number.NEGATIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	];

	add(p: Vec3) {
		for (let i = 0; i < 3; i++) {
			if (p[i] < this.min[i]) this.min[i] = p[i];
			if (p[i] > this.max[i]) this.max[i] = p[i];
		}
	}

	merge(other: Bounds) {
		if (other.empty) return;
		this.add(other.min);
		this.add(other.max);
	}

	get empty() {
		return this.min[0] === Number.POSITIVE_INFINITY;
	}
}

const roundMm = (inches: number) => Math.round(inches * IN_TO_MM * 10) / 10;
const toMm = (v: Vec3): Vec3 => [roundMm(v[0]), roundMm(v[1]), roundMm(v[2])];
const sizeOf = (b: Bounds): Vec3 => [
	roundMm(b.max[0] - b.min[0]),
	roundMm(b.max[1] - b.min[1]),
	roundMm(b.max[2] - b.min[2]),
];

const hex = (c: { r: number; g: number; b: number }) =>
	`#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

/**
 * Mozaik names its materials `3#396#6` and hides the readable name in the
 * texture path (`C:\Mozaik\Textures\Colors\Strata Noir.jpg`). Its own rotated
 * copies land in `temp\RotText1.jpg`, which carries no meaning — those keep
 * the raw id so nobody mistakes `RotText4` for a finish name.
 */
function materialLabel(name: string, texture: string | null): string {
	if (!texture) return name;
	const file = texture.split(/[\\/]/).pop() ?? "";
	const stem = file.replace(/\.[^.]+$/, "");
	if (!stem || /^RotText/i.test(stem)) return name;
	return stem;
}

/** SketchUp's own auto-names for unnamed groups and components. */
const AUTO_NAME = /^(Group|Component)[#_\d]/;

/**
 * Mozaik names the things a cabinet maker would name — `Door(L)`,
 * `Adjustable Shelf`, `UEnd (L)` — on the *instance*. Bought-in hardware comes
 * in as an anonymous instance of a named definition instead (`Knob 01`,
 * `Hafele Axilo 48 …`), so fall back to the definition's name, but only when
 * it is not one of SketchUp's `Group17` auto-names — those are scaffolding.
 */
function partName(
	instanceName: string,
	definitionName?: string,
): string | null {
	if (instanceName) return instanceName;
	if (definitionName && !AUTO_NAME.test(definitionName)) return definitionName;
	return null;
}

export function readSkp(buffer: ArrayBuffer): SkpRead {
	const model = parseSkp(buffer);

	/**
	 * Walk a definition's subtree, accumulating world bounds and collecting a
	 * part for every *named* instance below it. Mozaik names the things a
	 * cabinet maker would name — `Door(L)`, `Adjustable Shelf`, `UEnd (L)` —
	 * and leaves the scaffolding groups anonymous, so the names alone separate
	 * parts from structure.
	 */
	function walk(
		defId: number,
		world: Transform,
		parts: SkpPart[],
		depth: number,
	): Bounds {
		const bounds = new Bounds();
		const def = model.definitions.get(defId);
		if (!def || depth > 16) return bounds;

		for (const v of def.vertices) bounds.add(apply(world, v.x, v.y, v.z));

		for (const inst of def.instances) {
			const child = compose(world, inst.matrix);
			const childBounds = walk(inst.refIdx, child, parts, depth + 1);
			bounds.merge(childBounds);

			const name = partName(
				inst.name,
				model.definitions.get(inst.refIdx)?.name,
			);
			if (name && !childBounds.empty) {
				parts.push({
					name,
					minMm: toMm(childBounds.min),
					sizeMm: sizeOf(childBounds),
				});
			}
		}

		return bounds;
	}

	const modules: SkpModule[] = [];
	for (const inst of model.root.instances) {
		const world = compose(IDENTITY, inst.matrix);
		const parts: SkpPart[] = [];
		const bounds = walk(inst.refIdx, world, parts, 0);
		if (bounds.empty) continue;

		modules.push({
			name: inst.name || "(unnamed)",
			minMm: toMm(bounds.min),
			sizeMm: sizeOf(bounds),
			parts,
		});
	}

	return {
		version: model.version,
		layers: model.layers.map((l) => l.name),
		modules,
		materials: model.materials.map((m) => ({
			name: m.name,
			label: materialLabel(m.name, m.texture?.filename ?? null),
			hex: hex(m.color),
			texture: m.texture?.filename ?? null,
			transparency: m.transparency,
		})),
	};
}
