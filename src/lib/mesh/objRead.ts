/**
 * Reads a Wavefront OBJ export of one of Infinite Cabinet's designs into
 * named, axis-aligned boxes.
 *
 * This replaced an `openskp` reader: a `.skp` is a SketchUp-proprietary
 * container that only SketchUp reads reliably, so the client exports OBJ
 * instead. Nothing else changed about intake — the file is still a reference
 * for design intent, never a runtime asset. The browser only ever sees the
 * published catalogue.
 *
 * We read `o` names and `v` positions and nothing else. Faces, normals and UVs
 * are the bulk of the file and none of them tell us anything a bounding box
 * doesn't: every cabinet part is a rectangular panel. Skipping them keeps a
 * 20 MB export as cheap as a 1 MB one.
 *
 * Coordinates come out exactly as the file wrote them — whatever units, whatever
 * axis is up. Guessing that here would bake one exporter's habits into the
 * parser; `normalise.ts` infers both from the geometry instead.
 */

export type Vec3 = [number, number, number];

/**
 * One named box: a panel, a door, a shelf, a drawer side, a knob.
 *
 * After `normalise`, bounds are millimetres ordered `[along the wall, depth,
 * height]`. Straight out of `readObj` they are still the file's own units and
 * axis order — the type is shared because nothing but `normalise` should ever
 * look at a part before it has been normalised.
 */
export type MeshPart = {
	name: string;
	minMm: Vec3;
	sizeMm: Vec3;
};

/** One cabinet: an interval between two end panels, and what sits inside it. */
export type MeshModule = {
	name: string;
	minMm: Vec3;
	sizeMm: Vec3;
	parts: MeshPart[];
};

export type ObjRead = {
	version: string;
	parts: MeshPart[];
	droppedCount: number;
};

/**
 * Blender's copy suffix (`G-Top.017`) and its wrapper for geometry that lost
 * its parent (`_G-Object.001_(Loose_Mesh)`). Neither is a variant, so both
 * collapse to the base name before anything counts parts.
 */
export function baseName(name: string): string {
	return name
		.replace(/^_/, "")
		.replace(/_\(Loose_Mesh\)$/, "")
		.replace(/\.\d{3}$/, "")
		.trim();
}

/**
 * `G-Object.041` is what the exporter calls geometry with no name of its own —
 * in the sample job, the adjustable feet. It carries no design intent we can
 * read, so it never reaches the catalogue.
 */
const isJunk = (name: string) => /^_?G-Object\b/.test(name);

export function readObj(text: string): ObjRead {
	const boxes: { name: string; lo: Vec3; hi: Vec3 }[] = [];
	let version = "unknown";
	let current: { name: string; lo: Vec3; hi: Vec3 } | null = null;

	for (const line of text.split("\n")) {
		if (line.startsWith("o ")) {
			current = {
				name: line.slice(2).trim(),
				lo: [Infinity, Infinity, Infinity],
				hi: [-Infinity, -Infinity, -Infinity],
			};
			boxes.push(current);
			continue;
		}
		if (line.startsWith("v ") && current) {
			const p = line.slice(2).trim().split(/\s+/).map(Number);
			for (let i = 0; i < 3; i++) {
				if (p[i] < current.lo[i]) current.lo[i] = p[i];
				if (p[i] > current.hi[i]) current.hi[i] = p[i];
			}
			continue;
		}
		if (version === "unknown" && line.startsWith("# ") && line.length > 3) {
			version = line.slice(2).trim();
		}
	}

	// Same base name at the same bounds is one panel the exporter split across
	// several `o` records, once per material. Counting those separately would
	// triple every shelf in the part list.
	const seen = new Set<string>();
	const parts: MeshPart[] = [];
	let droppedCount = 0;

	for (const box of boxes) {
		if (!Number.isFinite(box.lo[0])) continue; // no vertices
		const name = baseName(box.name);
		if (isJunk(name)) {
			droppedCount++;
			continue;
		}
		const minMm = box.lo as Vec3;
		const sizeMm = box.hi.map((v, i) => v - box.lo[i]) as Vec3;
		const key = `${name}|${minMm.map(key6).join(",")}|${sizeMm.map(key6).join(",")}`;
		if (seen.has(key)) continue;
		seen.add(key);
		parts.push({ name, minMm, sizeMm });
	}

	return { version, parts, droppedCount };
}

/** Dedupe key only. Units are still the file's here, so round fine, not to mm. */
const key6 = (v: number) => v.toFixed(6);
