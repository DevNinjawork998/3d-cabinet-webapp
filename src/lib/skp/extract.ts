import type { SkpModule, SkpPart, SkpRead, Vec3 } from "./read";

/**
 * Turns a parsed .skp into a draft catalogue: the module standard, the panel
 * spec, the finish list and the hardware list, as the client actually builds
 * them. Deliberately product-agnostic — the sample job is a kitchen and
 * wardrobes come later, so nothing here knows about bays.
 *
 * The output is a *draft*. A human reads it, edits it and commits it into
 * `lib/planner/catalogue.ts`; nothing is priced or persisted from here.
 */

export type PartSpec = {
	name: string;
	/** How many of this part in one module. */
	count: number;
	sizeMm: Vec3;
};

export type ModuleSpec = {
	name: string;
	/** How many identical modules the job used — a weak popularity signal. */
	count: number;
	widthMm: number;
	depthMm: number;
	heightMm: number;
	/** Height of the module's underside above the floor: 0 for base units,
	 * ~1500 for wall units. This is what separates the module classes. */
	floorHeightMm: number;
	parts: PartSpec[];
};

export type FinishCandidate = {
	/** Slug in the shape `lib/planner/catalogue.ts` uses for finish ids. */
	id: string;
	label: string;
	hex: string;
	texture: string | null;
};

export type HardwareCandidate = { name: string; count: number };

export type CatalogueDraft = {
	sourceVersion: string;
	/** The panel thickness the job is built from — 16mm in the sample. */
	panelThicknessMm: number;
	modules: ModuleSpec[];
	finishes: FinishCandidate[];
	hardware: HardwareCandidate[];
	/** Anything a human should look at before trusting the draft. */
	warnings: string[];
};

const HARDWARE =
	/knob|handle|pull|hinge|leveller|leveler|\bleg\b|runner|slide/i;

/** `Knob #3`, `Hafele Axilo 48 …#11` — SketchUp's copy suffix, not a variant. */
const stripCopySuffix = (name: string) => name.replace(/\s*#\d+$/, "").trim();

export function slugify(label: string): string {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * Mozaik emits some panels twice: once as a solid box and once as a flat face
 * with no thickness. Dropping the degenerate twin keeps a part from being
 * counted double, and a zero dimension out of the cut list.
 */
const isSolid = (part: SkpPart) => part.sizeMm.every((d) => d > 0);

function partsOf(module: SkpModule): PartSpec[] {
	const byKey = new Map<string, PartSpec>();

	for (const part of module.parts) {
		if (!isSolid(part)) continue;
		const name = stripCopySuffix(part.name);
		// Same name and same size is the same part; same name at a different
		// size is a genuinely different part (a 400 door is not an 800 door).
		const key = `${name}|${part.sizeMm.join("x")}`;
		const found = byKey.get(key);
		if (found) {
			found.count += 1;
		} else {
			byKey.set(key, { name, count: 1, sizeMm: part.sizeMm });
		}
	}

	return [...byKey.values()].sort(
		(a, b) =>
			volume(b.sizeMm) - volume(a.sizeMm) || a.name.localeCompare(b.name),
	);
}

const volume = (size: Vec3) => size[0] * size[1] * size[2];

/**
 * The most common smallest-dimension across every solid part. Cabinet parts
 * are sheet goods, so their thinnest axis *is* the board thickness, and the
 * mode shrugs off the odd door or drawer box built from something else.
 */
function panelThickness(modules: SkpModule[]): number {
	const tally = new Map<number, number>();
	for (const module of modules) {
		for (const part of module.parts) {
			if (!isSolid(part)) continue;
			const thin = Math.round(Math.min(...part.sizeMm));
			tally.set(thin, (tally.get(thin) ?? 0) + 1);
		}
	}
	let best = 0;
	let bestCount = 0;
	for (const [thickness, count] of tally) {
		if (count > bestCount) {
			best = thickness;
			bestCount = count;
		}
	}
	return best;
}

/**
 * Mozaik's material ids (`3#396#6`) only become names via their texture path,
 * and it also ships per-layer pseudo-materials and its own rotated texture
 * copies. `readSkp` leaves an unresolved label equal to the raw id, which is
 * exactly the test for "this is not a finish a customer would pick".
 */
function finishesOf(read: SkpRead): FinishCandidate[] {
	const byLabel = new Map<string, FinishCandidate>();

	for (const material of read.materials) {
		if (material.label === material.name) continue;
		if (material.label.startsWith("Layer_")) continue;
		if (byLabel.has(material.label)) continue;
		byLabel.set(material.label, {
			id: slugify(material.label),
			label: material.label,
			hex: material.hex,
			texture: material.texture,
		});
	}

	return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function hardwareOf(modules: SkpModule[]): HardwareCandidate[] {
	const tally = new Map<string, number>();
	for (const module of modules) {
		for (const part of module.parts) {
			const name = stripCopySuffix(part.name);
			if (!HARDWARE.test(name)) continue;
			tally.set(name, (tally.get(name) ?? 0) + 1);
		}
	}
	return [...tally.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);
}

export function extractCatalogue(read: SkpRead): CatalogueDraft {
	// A module with no parts is a label, a dimension or an annotation, not
	// something the factory builds.
	const built = read.modules.filter((module) => module.parts.length > 0);

	const specs = new Map<string, ModuleSpec>();
	for (const module of built) {
		const [widthMm, depthMm, heightMm] = module.sizeMm.map(Math.round);
		const key = `${module.name}|${widthMm}x${depthMm}x${heightMm}`;
		const found = specs.get(key);
		if (found) {
			found.count += 1;
			continue;
		}
		specs.set(key, {
			name: module.name,
			count: 1,
			widthMm,
			depthMm,
			heightMm,
			floorHeightMm: Math.round(module.minMm[2]),
			parts: partsOf(module),
		});
	}

	const modules = [...specs.values()].sort(
		(a, b) => a.floorHeightMm - b.floorHeightMm || b.widthMm - a.widthMm,
	);

	const warnings: string[] = [];
	const skipped = read.modules.length - built.length;
	if (skipped > 0) {
		warnings.push(
			`${skipped} annotation-only entities skipped (labels, dimensions).`,
		);
	}
	const unresolved = read.materials.length - finishesOf(read).length;
	if (unresolved > 0) {
		warnings.push(
			`${unresolved} materials had no readable name (Mozaik ids or per-layer pseudo-materials) and were left out.`,
		);
	}

	return {
		sourceVersion: read.version,
		panelThicknessMm: panelThickness(built),
		modules,
		finishes: finishesOf(read),
		hardware: hardwareOf(built),
		warnings,
	};
}
