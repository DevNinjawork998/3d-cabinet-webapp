import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractCatalogue, slugify } from "../extract";
import { toCataloguePatch } from "../patch";
import { readSkp } from "../read";

/**
 * The fixture is the client's own Mozaik export (`Room1_Wall1`, a kitchen),
 * so these numbers are the real module standard, not invented ones. The
 * expected part counts were taken from an independent raw string scan of the
 * file, which is why they are worth asserting: they catch the parser silently
 * dropping or duplicating entities.
 */
function loadFixture() {
	const bytes = readFileSync(
		new URL("../__fixtures__/flat-pack.skp", import.meta.url),
	);
	const buffer = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	return readSkp(buffer);
}

const read = loadFixture();
const draft = extractCatalogue(read);
const moduleNamed = (name: string) =>
	draft.modules.filter((module) => module.name === name);

describe("readSkp", () => {
	it("reads the VFF container the client's SketchUp writes", () => {
		expect(read.version).toContain("26.");
		expect(read.layers).toContain("Cabinets");
		expect(read.modules.length).toBeGreaterThan(0);
	});

	it("names every module the way the factory does", () => {
		const names = new Set(read.modules.map((module) => module.name));
		expect(names).toContain("Base Cabinet");
		expect(names).toContain("Base Cabinet 3 Drawers");
		expect(names).toContain("Wall Cabinet");
		expect(names).toContain("Tall Cabinet 2 Doors");
		expect(names).toContain("Base Right End Panel 16mm");
	});

	it("places base units on the floor and wall units above them", () => {
		const base = read.modules.find((m) => m.name === "Base Cabinet");
		const wall = read.modules.find((m) => m.name === "Wall Cabinet");
		expect(base?.minMm[2]).toBe(0);
		expect(wall?.minMm[2]).toBeGreaterThan(1000);
	});

	it("recovers finish names from Mozaik's texture paths", () => {
		const labels = read.materials.map((material) => material.label);
		expect(labels).toContain("Strata Noir");
		expect(labels).toContain("Rhone Oak");
	});
});

describe("extractCatalogue", () => {
	it("finds the 16mm board the job is built from", () => {
		expect(draft.panelThicknessMm).toBe(16);
	});

	it("sizes a base cabinet the way a cabinet maker would quote it", () => {
		const [base] = moduleNamed("Base Cabinet");
		expect(base.widthMm).toBe(900);
		expect(base.heightMm).toBe(880);
		expect(base.depthMm).toBeGreaterThanOrEqual(600);
		expect(base.depthMm).toBeLessThanOrEqual(610);
		// The job used two identical ones.
		expect(base.count).toBe(2);
	});

	it("sizes the tall unit and the end panels", () => {
		const [tall] = moduleNamed("Tall Cabinet 2 Doors");
		expect(tall.heightMm).toBe(2380);
		expect(tall.floorHeightMm).toBe(0);

		const [endPanel] = moduleNamed("Base Right End Panel 16mm");
		expect(endPanel.widthMm).toBe(16);
		expect(endPanel.heightMm).toBe(2400);
		expect(endPanel.count).toBe(3);
	});

	it("hangs wall units at a consistent height", () => {
		const wallUnits = draft.modules.filter((module) =>
			module.name.toLowerCase().startsWith("wall cabinet"),
		);
		expect(wallUnits.length).toBeGreaterThan(0);
		for (const unit of wallUnits) {
			expect(unit.floorHeightMm).toBeGreaterThanOrEqual(1500);
		}
	});

	it("gives every module a cut list of solid parts", () => {
		const [base] = moduleNamed("Base Cabinet");
		const names = base.parts.map((part) => part.name);
		expect(names).toContain("Door(L)");
		expect(names).toContain("Door(R)");
		expect(names).toContain("Adjustable Shelf");
		expect(names).toContain("Bottom");
		expect(names).toContain("Top");

		// No degenerate twins survive: every part has three real dimensions.
		for (const module of draft.modules) {
			for (const part of module.parts) {
				expect(Math.min(...part.sizeMm)).toBeGreaterThan(0);
			}
		}
	});

	it("keeps door sizes consistent with the carcass", () => {
		const [base] = moduleNamed("Base Cabinet");
		const door = base.parts.find((part) => part.name === "Door(L)");
		expect(door).toBeDefined();
		// Two doors across a 900 carcass, on 16mm board.
		expect(Math.min(...(door?.sizeMm ?? []))).toBe(16);
		expect(Math.max(...(door?.sizeMm ?? []))).toBeLessThan(base.heightMm);
	});

	it("proposes finishes with ids catalogue.ts can use", () => {
		const labels = draft.finishes.map((finish) => finish.label);
		expect(labels).toContain("Strata Noir");
		expect(labels).toContain("Rhone Oak");

		const strataNoir = draft.finishes.find((f) => f.label === "Strata Noir");
		expect(strataNoir?.id).toBe("strata-noir");
		expect(strataNoir?.hex).toMatch(/^#[0-9a-f]{6}$/);

		// Mozaik's internal ids and per-layer pseudo-materials stay out.
		for (const finish of draft.finishes) {
			expect(finish.label).not.toMatch(/^\d+#/);
			expect(finish.label).not.toMatch(/^Layer_/);
			expect(finish.label).not.toMatch(/^RotText/);
		}
	});

	it("lists the bought-in hardware", () => {
		const names = draft.hardware.map((item) => item.name);
		expect(names).toContain("Knob 01");
		expect(names.some((name) => name.includes("Hafele Axilo 48"))).toBe(true);
		// Copy suffixes are collapsed, so `Knob #3` does not become its own line.
		for (const name of names) expect(name).not.toMatch(/#\d+$/);
	});

	it("drops annotations and says so", () => {
		expect(draft.modules.map((module) => module.name)).not.toContain("Label");
		expect(draft.warnings.join(" ")).toMatch(/annotation-only/);
	});
});

describe("slugify", () => {
	it("makes catalogue-shaped ids", () => {
		expect(slugify("Strata Noir")).toBe("strata-noir");
		expect(slugify("Color_Soft Gray")).toBe("color-soft-gray");
	});
});

describe("toCataloguePatch", () => {
	it("emits reviewable TypeScript with rates left blank", () => {
		const patch = toCataloguePatch(draft, "flat-pack.skp");
		expect(patch).toContain("export const PANEL_THICKNESS_MM = 16;");
		expect(patch).toContain('name: "Base Cabinet"');
		expect(patch).toContain('"strata-noir"');
		// Money never comes out of geometry.
		expect(patch).toContain("surchargeRmPerFt: 0");
		expect(patch).toContain("GENERATED DRAFT");
	});
});
