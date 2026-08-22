import { readFileSync } from "node:fs";
import { extractCatalogue } from "../extract";
import { normalise } from "../normalise";
import { readObj } from "../objRead";
import { boundsOf, classify } from "../roles";
import { groupModules } from "../strategies";

/**
 * The fixture is the client's own `FLAT PACK` export, reduced to each entity's
 * two bounding corners — the reader only ever looks at `o` and `v`, so nothing
 * it reads was lost. The numbers the tests assert are therefore the real module
 * standard, not invented ones.
 *
 * The variants below are that same file rewritten the way a different exporter
 * or a different drafter would have written it. Generating them here rather
 * than committing four more fixtures keeps the transform visible: the test says
 * exactly what "the same design in millimetres" means.
 */

export const fixtureText = () =>
	readFileSync(
		new URL("../__fixtures__/flat-pack.obj", import.meta.url),
		"utf8",
	);

/** Rewrites every `v` line through `f`. */
function mapVertices(text: string, f: (xyz: number[]) => number[]): string {
	return text
		.split("\n")
		.map((line) => {
			if (!line.startsWith("v ")) return line;
			const out = f(line.slice(2).trim().split(/\s+/).map(Number));
			return `v ${out.map((n) => n.toFixed(6)).join(" ")}`;
		})
		.join("\n");
}

/** The same design drawn in millimetres instead of metres. */
export const inMillimetres = (text: string) =>
	mapVertices(text, ([x, y, z]) => [x * 1000, y * 1000, z * 1000]);

/** The same design Z-up, the way SketchUp's own exporter writes it. */
export const zUp = (text: string) =>
	mapVertices(text, ([x, y, z]) => [x, -z, y]);

/** The same design with every panel name replaced by a meaningless one. */
export function anonymised(text: string): string {
	let n = 0;
	return text
		.split("\n")
		.map((line) =>
			line.startsWith("o ") ? `o Panel_${String(n++).padStart(3, "0")}` : line,
		)
		.join("\n");
}

/** The whole read → normalise → classify → group → extract chain. */
export function pipeline(text: string, imageNames: string[] = []) {
	const obj = readObj(text);
	const { parts, scaleFactor, upAxis, panelThicknessMm, notes } = normalise(
		obj.parts,
	);
	const classified = classify(parts, boundsOf(parts, panelThicknessMm));
	const grouping = groupModules(classified, panelThicknessMm);
	const draft = extractCatalogue({
		sourceVersion: obj.version,
		grouping,
		imageNames,
		droppedCount: obj.droppedCount,
		notes,
	});
	return { obj, parts, scaleFactor, upAxis, classified, grouping, draft };
}

/** The texture folder that ships alongside the `.obj`. */
export const IMAGE_NAMES = [
	"Rhone Oak.jpg",
	"Strata Noir.jpg",
	"MDF.jpg",
	"Glass.jpg",
	"White.jpg",
	"Dulux Tapestry Beige.png",
	"Color Knoxville Green.png",
	"Color_Soft Gray.png",
	"RotText9.jpg",
	"RotText12.jpg",
];

/** Cabinets as `{width, height, floor}`, the shape most assertions compare. */
export const shapes = (draft: {
	modules: { widthMm: number; heightMm: number; floorHeightMm: number }[];
}) =>
	draft.modules
		.map((m) => ({
			width: m.widthMm,
			height: m.heightMm,
			floor: m.floorHeightMm,
		}))
		.sort((a, b) => a.floor - b.floor || a.width - b.width);
