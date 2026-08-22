import { describe, expect, it } from "vitest";
import { inferScale, inferUpAxis, normalise } from "../normalise";
import type { MeshPart } from "../objRead";
import { NAMING_RULES, roleFromName } from "../roles";
import {
	anonymised,
	fixtureText,
	IMAGE_NAMES,
	inMillimetres,
	pipeline,
	shapes,
	zUp,
} from "./fixture";

const text = fixtureText();
const { obj, draft, grouping } = pipeline(text, IMAGE_NAMES);

/** The design as drawn: three base, three wall, one shallow upper, one tall. */
const EXPECTED = [
	{ width: 400, height: 780, floor: 100 },
	{ width: 800, height: 2280, floor: 100 },
	{ width: 900, height: 780, floor: 100 },
	{ width: 900, height: 780, floor: 100 },
	{ width: 400, height: 880, floor: 1500 },
	{ width: 900, height: 880, floor: 1500 },
	{ width: 900, height: 880, floor: 1500 },
	{ width: 800, height: 600, floor: 1780 },
];

/** Deduped the way `extractCatalogue` dedupes: identical cabinets collapse. */
const EXPECTED_UNIQUE = [
	{ width: 400, height: 780, floor: 100 },
	{ width: 800, height: 2280, floor: 100 },
	{ width: 900, height: 780, floor: 100 },
	{ width: 400, height: 880, floor: 1500 },
	{ width: 900, height: 880, floor: 1500 },
	{ width: 800, height: 600, floor: 1780 },
];

describe("readObj", () => {
	it("reads the exporter banner", () => {
		expect(obj.version).toBe("Blender 4.2.0");
	});

	it("collapses the exporter's per-material splits into one part each", () => {
		// 286 `o` records in the file; 32 are the exporter's unnamed geometry,
		// and the rest collapse to 154 distinct name+bounds panels.
		expect(obj.droppedCount).toBe(32);
		expect(obj.parts).toHaveLength(154);
	});

	it("leaves coordinates in the file's own units", () => {
		// Metres here. Assuming otherwise is `normalise`'s job, not the parser's.
		const spread = Math.max(...obj.parts.map((p) => p.sizeMm[0]));
		expect(spread).toBeLessThan(10);
	});
});

describe("normalise", () => {
	it("finds the scale by looking for a plausible board thickness", () => {
		const { scaleFactor, panelThicknessMm } = inferScale(obj.parts);
		expect(scaleFactor).toBe(1000);
		expect(panelThicknessMm).toBe(16);
	});

	it("takes depth out of the running before voting on the up axis", () => {
		// Blender writes this file Y-up with depth on Z. Voting across all three
		// axes gets it wrong — doors and backs are thin on depth and outvote the
		// shelves — so depth is settled first, by extent.
		expect(inferUpAxis(obj.parts)).toEqual({
			upAxis: 1,
			depthAxis: 2,
			confident: true,
		});
	});

	it("puts width, depth and height on a known axis order", () => {
		const { parts } = normalise(obj.parts);
		const shelf = parts.find(
			(p) => p.name === "G-Adjustable_Shelf" && p.sizeMm.every((d) => d > 0),
		);
		// A shelf is a 16mm board: thin on height, deep on the middle axis.
		expect(Math.round(shelf?.sizeMm[2] ?? 0)).toBe(16);
		expect(Math.round(shelf?.sizeMm[1] ?? 0)).toBeGreaterThan(300);
	});

	it("says so rather than guessing when no scale fits", () => {
		// A "design" of one huge slab: no candidate scale yields a board.
		const slab: MeshPart[] = [
			{ name: "x", minMm: [0, 0, 0], sizeMm: [900, 600, 780] },
		];
		const result = normalise(slab);
		expect(result.notes.join(" ")).toMatch(/units/i);
	});

	it("reads the same design written in millimetres", () => {
		const mm = pipeline(inMillimetres(text));
		expect(mm.scaleFactor).toBe(1);
		expect(shapes(mm.draft)).toEqual(EXPECTED_UNIQUE);
	});

	it("reads the same design written Z-up", () => {
		const z = pipeline(zUp(text));
		expect(z.upAxis).toBe(2);
		expect(shapes(z.draft)).toEqual(EXPECTED_UNIQUE);
	});
});

describe("roles", () => {
	it("puts the specific rule before the general one", () => {
		// `Drw_Front` must not be read as a door, and a fixed shelf must not be
		// read as an adjustable one.
		expect(roleFromName("G-Drw_Front")).toBe("drawerFront");
		expect(roleFromName("G-Fixed_Shelf")).toBe("shelfFixed");
		expect(roleFromName("G-Adjustable_Shelf")).toBe("shelfAdjustable");
		expect(roleFromName("G-Door(L)")).toBe("door");
		expect(roleFromName("G-UEnd_(R)")).toBe("end");
		expect(roleFromName("C-Knob_#3")).toBe("hardware");
	});

	it("returns null rather than a wrong guess for an unknown name", () => {
		expect(roleFromName("Panel_017")).toBeNull();
	});

	it("keeps every rule anchored to something a drafter would write", () => {
		expect(NAMING_RULES.length).toBeGreaterThan(5);
		for (const rule of NAMING_RULES) expect(rule.pattern.flags).toContain("i");
	});

	it("falls back to shape when the names say nothing", () => {
		const blind = pipeline(anonymised(text));
		// Same cabinets, same widths — read entirely off geometry.
		expect(shapes(blind.draft)).toEqual(EXPECTED_UNIQUE);
		expect(blind.classified.every((c) => c.source === "geometry")).toBe(true);
		expect(blind.draft.modules.every((m) => m.inferred)).toBe(true);
		expect(blind.draft.warnings.join(" ")).toMatch(/guessed from shape/);
	});
});

describe("grouping", () => {
	it("reads clean end panels with high confidence", () => {
		expect(grouping.strategy).toBe("byEndPanels");
		expect(grouping.confidence).toBe("high");
		expect(shapes({ modules: grouping.modules.map(toShape) })).toEqual(
			EXPECTED,
		);
	});

	it("drops the full-height side panel's phantom cabinet", () => {
		// `G-FEnd_(R)` runs floor to ceiling, so pairing it with its neighbour
		// yields a 0-2400 shell wrapping a real cabinet. It is a panel, not a
		// carcass, and must never reach the catalogue.
		expect(grouping.modules.some((m) => Math.round(m.sizeMm[2]) === 2400)).toBe(
			false,
		);
	});

	it("falls back to adjacency when there are no end panels at all", () => {
		// Open shelving: a back and three shelves, no sides anywhere.
		const shelfUnit = `# test
o Back
v 0 0 0
v 1.0 0.016 2.0
o Shelf_A
v 0 0 0.5
v 1.0 0.4 0.516
o Shelf_B
v 0 0 1.0
v 1.0 0.4 1.016
o Shelf_C
v 0 0 1.5
v 1.0 0.4 1.516
`;
		const result = pipeline(shelfUnit);
		expect(result.grouping.strategy).toBe("byAdjacency");
		expect(result.grouping.confidence).toBe("medium");
		expect(result.draft.modules).toHaveLength(1);
	});

	it("never returns an empty table when it cannot tell cabinets apart", () => {
		const twoLooseBoards = `# test
o A
v 0 0 0
v 0.9 0.6 0.016
o B
v 5 0 0
v 5.9 0.6 0.016
`;
		const result = pipeline(twoLooseBoards);
		expect(result.grouping.strategy).toBe("wholeFile");
		expect(result.grouping.confidence).toBe("low");
		expect(result.draft.modules).toHaveLength(1);
		expect(result.draft.warnings.join(" ")).toMatch(/one row/);
	});
});

const toShape = (m: { sizeMm: number[]; minMm: number[] }) => ({
	widthMm: Math.round(m.sizeMm[0]),
	heightMm: Math.round(m.sizeMm[2]),
	floorHeightMm: Math.round(m.minMm[2]),
});

describe("extractCatalogue", () => {
	it("collapses identical cabinets into one spec with a count", () => {
		const base900 = draft.modules.filter(
			(m) => m.kind === "base" && m.widthMm === 900,
		);
		expect(base900).toHaveLength(1);
		expect(base900[0].count).toBe(2);
	});

	it("records what each cabinet is made of, so the scene can draw it", () => {
		const tall = draft.modules.find((m) => m.kind === "tall");
		// Solid panels only: the exporter's zero-thickness twins are not shelves.
		expect(tall?.geometry).toEqual({
			shelves: 3,
			fixedShelves: 1,
			doorLeaves: 2,
			drawers: 0,
			hasBack: true,
		});

		const drawerUnit = draft.modules.find((m) => m.geometry.drawers > 0);
		expect(drawerUnit?.widthMm).toBe(400);
		expect(drawerUnit?.geometry.drawers).toBe(3);
		expect(drawerUnit?.geometry.doorLeaves).toBe(0);
	});

	it("classifies each cabinet into a planner family kind", () => {
		const kinds = draft.modules.map((m) => `${m.kind}${m.widthMm}`);
		expect(kinds).toContain("base900");
		expect(kinds).toContain("wall400");
		expect(kinds).toContain("tall800");
	});

	it("reads the build standard off the panels", () => {
		expect(draft.panelThicknessMm).toBe(16);
		expect(draft.plinthHeightMm).toBe(100);
	});

	it("takes finish names from the texture filenames, never the materials", () => {
		const labels = draft.finishes.map((f) => f.label);
		expect(labels).toContain("Rhone Oak");
		expect(labels).toContain("Strata Noir");
		// `Color_Soft Gray.png` is a paint chip, not a colour called "Color".
		expect(labels).toContain("Soft Gray");
		// The exporter's own rotated copies are not finishes.
		expect(labels.some((l) => l.startsWith("RotText"))).toBe(false);
		expect(draft.finishes.every((f) => f.needsReview)).toBe(true);
	});

	it("warns that finishes were guessed", () => {
		expect(draft.warnings.join(" ")).toMatch(/no readable names/);
	});

	it("does not nag about confidence when the read was clean", () => {
		expect(draft.warnings.join(" ")).not.toMatch(/guessed from shape/);
	});

	it("tallies hardware separately from panels", () => {
		// `C-Knob_01` plus `C-Knob_#1`…`#15` — one type, sixteen placements.
		expect(draft.hardware.find((h) => h.name === "C-Knob")?.count).toBe(16);
	});
});
