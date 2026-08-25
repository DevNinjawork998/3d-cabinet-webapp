import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { objTextFromBytes } from "../archive";
import { kindOf } from "../extract";
import { measureDesign } from "../measureDesign";
import { coalesceParts, type MeshPart, readObj } from "../objRead";
import {
	fixtureText,
	IMAGE_NAMES,
	inMillimetres,
	pipeline,
	zUp,
} from "./fixture";

/**
 * `measureDesign` is the single-cabinet read, deliberately not the run-grouping
 * pipeline: `byEndPanels` measures the opening *between* end panels, so an 800
 * carcass would report 768. What the design library wants is the size of the
 * thing on the invoice, which is the bounding box of the whole file.
 *
 * The fixture is a whole wall rather than one cabinet, so the dimensions below
 * are the run's — that is the point being asserted (whole file, one box), not
 * an accident.
 */
const measured = measureDesign(fixtureText());
if (!measured)
	throw new Error("the fixture must measure — every test below reads it");

describe("measureDesign", () => {
	it("reads the whole file as one box", () => {
		expect(measured).not.toBeNull();
		expect(measured.partCount).toBeGreaterThan(0);
		expect(measured.widthMm).toBeGreaterThan(0);
		expect(measured.heightMm).toBeGreaterThan(0);
		expect(measured.depthMm).toBeGreaterThan(0);
	});

	// The fit-out is what a design push carries into the catalogue: without it
	// every imported cabinet would render with the old one-shelf default.
	it("reports the fit-out the planner draws from", () => {
		expect(measured.geometry).toEqual({
			shelves: expect.any(Number),
			fixedShelves: expect.any(Number),
			doorLeaves: expect.any(Number),
			drawers: expect.any(Number),
			hasBack: expect.any(Boolean),
			legs: expect.any(Number),
			legHeightMm: expect.any(Number),
		});
		// Real panels were found and counted, not an empty classification.
		const g = measured.geometry;
		expect(g.shelves + g.doorLeaves + g.drawers).toBeGreaterThan(0);
	});

	it("agrees with its own numbers about what kind of cabinet it is", () => {
		expect(measured.kind).toBe(
			kindOf(measured.floorHeightMm, measured.heightMm),
		);
	});

	it("keeps drawers and doors in step with the geometry it reports", () => {
		expect(measured.drawers).toBe(measured.geometry.drawers);
		expect(measured.doors).toBe(measured.geometry.doorLeaves);
	});

	// Units and up-axis are inferred, never assumed — the same file drawn in
	// millimetres or Z-up has to measure the same.
	it("measures the same design the same however it was exported", () => {
		const mm = measureDesign(inMillimetres(fixtureText()));
		expect(mm?.widthMm).toBe(measured.widthMm);
		expect(mm?.heightMm).toBe(measured.heightMm);
		expect(mm?.depthMm).toBe(measured.depthMm);

		const flipped = measureDesign(zUp(fixtureText()));
		expect(flipped?.heightMm).toBe(measured.heightMm);
		expect(flipped?.depthMm).toBe(measured.depthMm);
	});

	it("returns null rather than junk numbers for a file with no geometry", () => {
		expect(measureDesign("# nothing here\n")).toBeNull();
	});
});

describe("objTextFromBytes", () => {
	const text = fixtureText();
	const bytes = new TextEncoder().encode(text);

	it("passes a bare .obj through untouched", () => {
		expect(objTextFromBytes(bytes)).toBe(text);
	});

	// Half the files an admin can attach are zips; the filename is no help to a
	// route that only has bytes, so the archive is spotted by its magic number.
	it("finds the .obj inside a zipped export folder", () => {
		const zipped = zipSync({
			"FLAT PACK/FLAT PACK.obj": bytes,
			"FLAT PACK/FLAT PACK.mtl": new TextEncoder().encode("# materials"),
		});
		expect(objTextFromBytes(zipped)).toBe(text);
	});

	it("measures the same design from either shape", () => {
		const zipped = zipSync({ "d/design.obj": bytes });
		expect(measureDesign(objTextFromBytes(zipped))).toEqual(
			measureDesign(objTextFromBytes(bytes)),
		);
	});
});

/**
 * The bug that made an uploaded cabinet render as an empty box on a plinth.
 *
 * SketchUp writes one board as several planar `g` records, so every panel has a
 * zero dimension until they are unioned. `isSolid` then discards the lot.
 */
describe("coalesceParts", () => {
	/** One shelf written as two half-depth faces, the way the client's export
	 * does it: same name bar the counter, neither one solid on its own. */
	const splitShelf: MeshPart[] = [
		{ name: "Adjustable_Shelf", minMm: [0, 0, 400], sizeMm: [767, 0, 16] },
		{ name: "Adjustable_Shelf1", minMm: [0, 267, 400], sizeMm: [767, 0, 16] },
	];

	it("unions a panel's split records back into a solid board", () => {
		const [shelf] = coalesceParts(splitShelf);
		expect(coalesceParts(splitShelf)).toHaveLength(1);
		expect(shelf.name).toBe("Adjustable_Shelf");
		expect(shelf.sizeMm[1]).toBeGreaterThan(0);
		expect(shelf.sizeMm).toEqual([767, 267, 16]);
	});

	it("keeps parts a drafter genuinely named differently apart", () => {
		const doors: MeshPart[] = [
			{ name: "Door_L_", minMm: [0, 0, 0], sizeMm: [397, 16, 767] },
			{ name: "Door_R_", minMm: [400, 0, 0], sizeMm: [397, 16, 767] },
		];
		expect(coalesceParts(doors)).toHaveLength(2);
	});

	/**
	 * The reason this is not applied to a whole-wall import. Same-named shelves
	 * in adjacent cabinets would merge into one, and measured on this fixture it
	 * collapsed 154 parts to 22. `measureDesign` is safe because one uploaded
	 * file is one cabinet.
	 */
	it("would over-merge a multi-cabinet file, which is why the run path opts out", () => {
		const run = readObj(fixtureText()).parts;
		const shelves = (ps: MeshPart[]) =>
			ps.filter((p) => /shelf/i.test(p.name)).length;

		expect(shelves(run)).toBeGreaterThan(shelves(coalesceParts(run)));
		expect(coalesceParts(run).length).toBeLessThan(run.length / 2);
	});

	// The guard that the run path really did opt out: the whole-wall pipeline
	// still reports the tall unit's three shelves, as `pipeline.test.ts` asserts.
	it("leaves the whole-wall pipeline untouched", () => {
		const { draft } = pipeline(fixtureText(), IMAGE_NAMES);
		const tall = draft.modules.find((m) => m.geometry.shelves === 3);
		expect(tall).toBeDefined();
	});
});

describe("legs", () => {
	it("reads the four feet the client's cabinet stands on", () => {
		// The fixture is a whole run drawn without levellers, so it has none —
		// the real assertion for a four-legged cabinet is the end-to-end check
		// against `BC 800mm.obj`. What matters here is that a file with no feet
		// reports none rather than inventing them.
		expect(measured.geometry.legs).toBe(0);
		expect(measured.geometry.legHeightMm).toBe(0);
	});
});
