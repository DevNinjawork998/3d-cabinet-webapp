import { describe, expect, it } from "vitest";
import { CONSTRUCTION, PLANNER_CATALOGUE } from "@/lib/planner/catalogue";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";
import type { CatalogueDraft } from "../extract";
import {
	type ConfirmedImport,
	mergeIntoCatalogue,
} from "../mergeIntoCatalogue";
import { fixtureText, IMAGE_NAMES, pipeline } from "./fixture";

const { draft } = pipeline(fixtureText(), IMAGE_NAMES);

/** What the confirm table posts when the reviewer changes nothing. */
const confirmedFrom = (source: CatalogueDraft): ConfirmedImport => ({
	modules: source.modules.map((module) => ({
		label: module.name,
		kind: module.kind,
		widthMm: module.widthMm,
		heightMm: module.heightMm,
		depthMm: module.depthMm,
		floorHeightMm: module.floorHeightMm,
		geometry: module.geometry,
	})),
	finishes: source.finishes.map((finish) => ({
		label: finish.label,
		hex: "#8a6a45",
	})),
	panelThicknessMm: source.panelThicknessMm,
	plinthHeightMm: source.plinthHeightMm,
});

const confirmed = confirmedFrom(draft);
const first = mergeIntoCatalogue(confirmed, PLANNER_CATALOGUE);

describe("mergeIntoCatalogue — first import", () => {
	it("adds the design's cabinets without removing what was there", () => {
		for (const existing of PLANNER_CATALOGUE.families) {
			expect(first.catalogue.families.map((f) => f.id)).toContain(existing.id);
		}
		expect(first.catalogue.families.length).toBeGreaterThan(
			PLANNER_CATALOGUE.families.length,
		);
	});

	it("never derives a price from geometry", () => {
		const added = first.catalogue.families.filter(
			(f) => !PLANNER_CATALOGUE.families.some((old) => old.id === f.id),
		);
		expect(added.length).toBeGreaterThan(0);
		for (const family of added) {
			for (const size of family.sizes) expect(size.priceRm).toBe(0);
		}
	});

	it("carries the fit-out through so the scene can draw it", () => {
		const tall = first.catalogue.families.find(
			(f) => f.geometry?.shelves === 3,
		);
		expect(tall?.geometry).toEqual({
			shelves: 3,
			fixedShelves: 1,
			doorLeaves: 2,
			drawers: 0,
			hasBack: true,
			legs: 0,
			legHeightMm: 0,
		});
	});

	it("keeps a drawer unit as its own family, not a rung", () => {
		const drawers = first.catalogue.families.filter(
			(f) => f.geometry && f.geometry.drawers > 0,
		);
		expect(drawers).toHaveLength(1);
		expect(drawers[0].sizes.map((s) => s.widthMm)).toEqual([400]);
	});

	it("takes the build standard from the design", () => {
		expect(first.catalogue.construction?.panelThicknessMm).toBe(16);
		expect(first.catalogue.construction?.plinthHeightMm).toBe(100);
	});

	it("carries door styles and the door ladder over untouched", () => {
		expect(first.catalogue.doorStyles).toEqual(PLANNER_CATALOGUE.doorStyles);
		expect(first.catalogue.doorWidthLadderMm).toEqual(
			PLANNER_CATALOGUE.doorWidthLadderMm,
		);
	});

	it("leaves every room pointing at families that exist", () => {
		const ids = new Set(first.catalogue.families.map((f) => f.id));
		for (const room of first.catalogue.roomTypes) {
			expect(room.familyIds.every((id) => ids.has(id))).toBe(true);
			expect(room.starter.every((item) => ids.has(item.familyId))).toBe(true);
		}
	});

	it("does not mutate the catalogue it was handed", () => {
		expect(PLANNER_CATALOGUE.families.some((f) => f.geometry)).toBe(false);
	});
});

describe("mergeIntoCatalogue — importing again", () => {
	it("is a no-op when the same design is imported twice", () => {
		const second = mergeIntoCatalogue(confirmed, first.catalogue);
		expect(second.report.newFamilies).toEqual([]);
		expect(second.report.newSizes).toEqual([]);
		expect(second.catalogue.families).toHaveLength(
			first.catalogue.families.length,
		);
	});

	it("never overwrites a price someone already agreed", () => {
		// The admin priced the imported 900 base at RM 450 and published it.
		const priced: PlannerCatalogue = JSON.parse(
			JSON.stringify(first.catalogue),
		);
		for (const family of priced.families) {
			for (const size of family.sizes) size.priceRm = 450;
		}

		const again = mergeIntoCatalogue(confirmed, priced);
		for (const family of again.catalogue.families) {
			for (const size of family.sizes) expect(size.priceRm).toBe(450);
		}
	});

	it("extends the ladder when a known cabinet arrives at a new width", () => {
		const base = first.catalogue.families.find(
			(f) => f.kind === "base" && f.geometry?.drawers === 0,
		);
		expect(base).toBeDefined();
		const before = base?.sizes.map((s) => s.widthMm);

		const wider = mergeIntoCatalogue(
			{
				...confirmed,
				modules: confirmed.modules
					.filter((m) => m.kind === "base" && m.geometry.drawers === 0)
					.map((m) => ({ ...m, widthMm: 600 })),
			},
			first.catalogue,
		);

		expect(wider.report.newFamilies).toEqual([]);
		expect(wider.report.newSizes).toHaveLength(1);
		const after = wider.catalogue.families.find((f) => f.id === base?.id);
		expect(after?.sizes.map((s) => s.widthMm)).toEqual(
			[...(before ?? []), 600].sort((a, b) => a - b),
		);
		expect(after?.sizes.find((s) => s.widthMm === 600)?.priceRm).toBe(0);
	});

	it("treats a different fit-out at the same size as a different cabinet", () => {
		const base = confirmed.modules.find(
			(m) => m.kind === "base" && m.geometry.drawers === 0,
		);
		if (!base) throw new Error("fixture changed");

		const shelvier = mergeIntoCatalogue(
			{
				...confirmed,
				modules: [
					{
						...base,
						geometry: { ...base.geometry, shelves: base.geometry.shelves + 2 },
					},
				],
			},
			first.catalogue,
		);
		expect(shelvier.report.newFamilies).toHaveLength(1);
	});

	it("tolerates a millimetre or two of drift between reads of one carcass", () => {
		const drifted = mergeIntoCatalogue(
			{
				...confirmed,
				modules: confirmed.modules.map((m) => ({
					...m,
					depthMm: m.depthMm - 7,
					heightMm: m.heightMm + 3,
				})),
			},
			first.catalogue,
		);
		expect(drifted.report.newFamilies).toEqual([]);
	});

	it("keeps a finish colour a human already picked", () => {
		const recoloured: PlannerCatalogue = JSON.parse(
			JSON.stringify(first.catalogue),
		);
		const target = recoloured.finishes.find((f) => f.label === "Rhone Oak");
		if (!target) throw new Error("fixture changed");
		target.hex = "#123456";

		const again = mergeIntoCatalogue(confirmed, recoloured);
		expect(
			again.catalogue.finishes.find((f) => f.label === "Rhone Oak")?.hex,
		).toBe("#123456");
	});
});

/**
 * The cabinet-design library's shape of a merge: one cabinet, a price a human
 * typed, and the one room the admin filed it under. Everything a mesh import
 * cannot know and this caller can.
 *
 * Deliberately a shape no seed family is within `DIMENSION_TOLERANCE_MM` of, so
 * these assertions are about a *new* family. A design that does match an
 * existing one extends its ladder instead — which is the right behaviour and is
 * covered separately below.
 */
const oneModule = (
	overrides: Partial<ConfirmedImport["modules"][number]> = {},
): ConfirmedImport => ({
	modules: [
		{
			label: "Utility 500mm",
			kind: "base",
			widthMm: 500,
			heightMm: 700,
			depthMm: 300,
			floorHeightMm: 0,
			geometry: {
				shelves: 1,
				fixedShelves: 0,
				doorLeaves: 2,
				drawers: 0,
				hasBack: true,
				legs: 0,
				legHeightMm: 0,
			},
			...overrides,
		},
	],
	finishes: [],
	panelThicknessMm: PLANNER_CATALOGUE.construction?.panelThicknessMm ?? 18,
	plinthHeightMm: PLANNER_CATALOGUE.construction?.plinthHeightMm ?? 100,
});

/** Fails the test rather than the assertion when a lookup misses — a `!` here
 * would report "cannot read property of undefined" instead of what went wrong. */
function must<T>(value: T | undefined, what: string): T {
	if (value === undefined) throw new Error(`expected to find ${what}`);
	return value;
}

/** The family this merge added, whatever `stripWidth` decided to call it. */
const addedFamily = (catalogue: PlannerCatalogue) =>
	catalogue.families.find(
		(f) => !PLANNER_CATALOGUE.families.some((old) => old.id === f.id),
	);

const familyFor = (catalogue: PlannerCatalogue, label: string) =>
	catalogue.families.find((f) => f.label === label);

describe("mergeIntoCatalogue — a priced design from the library", () => {
	it("puts the admin's price on the new rung", () => {
		const { catalogue } = mergeIntoCatalogue(
			oneModule({ priceRm: 450 }),
			PLANNER_CATALOGUE,
		);
		expect(addedFamily(catalogue)?.sizes).toEqual([
			{ widthMm: 500, priceRm: 450 },
		]);
	});

	it("still writes zero when no price is offered", () => {
		const { catalogue } = mergeIntoCatalogue(oneModule(), PLANNER_CATALOGUE);
		expect(addedFamily(catalogue)?.sizes[0].priceRm).toBe(0);
	});

	// The rule that survived an earlier version destroying priced imports: a
	// number already on the ladder is never replaced, whatever the caller sends.
	it("never overwrites a price the catalogue already carries", () => {
		const base = must(
			familyFor(PLANNER_CATALOGUE, "Base cabinet"),
			"the seed base cabinet",
		);
		const existing = must(
			base.sizes.find((s) => s.widthMm === 800),
			"an 800mm rung on the base cabinet",
		);
		expect(existing.priceRm).toBeGreaterThan(0);

		const { catalogue, report } = mergeIntoCatalogue(
			oneModule({
				label: "Base cabinet",
				kind: base.kind,
				widthMm: 800,
				heightMm: base.heightMm,
				depthMm: base.depthMm,
				floorHeightMm: base.floorHeightMm,
				geometry: {
					shelves: 1,
					fixedShelves: 0,
					doorLeaves: 2,
					drawers: base.drawers,
					hasBack: true,
					legs: 0,
					legHeightMm: 0,
				},
				priceRm: 1,
			}),
			PLANNER_CATALOGUE,
		);

		const after = familyFor(catalogue, "Base cabinet")?.sizes.find(
			(s) => s.widthMm === 800,
		);
		expect(after?.priceRm).toBe(existing.priceRm);
		expect(report.unchanged.length).toBe(1);
	});
});

describe("mergeIntoCatalogue — room curation", () => {
	const roomsHolding = (catalogue: PlannerCatalogue, familyId: string) =>
		catalogue.roomTypes
			.filter((room) => room.familyIds.includes(familyId))
			.map((room) => room.id)
			.sort();

	it("pins a module to the one room it named", () => {
		const { catalogue } = mergeIntoCatalogue(
			oneModule({ roomId: "kitchen", priceRm: 450 }),
			PLANNER_CATALOGUE,
		);
		const family = must(addedFamily(catalogue), "the family this merge added");
		expect(roomsHolding(catalogue, family.id)).toEqual(["kitchen"]);
	});

	/** The reason `roomId` exists: every room carries a `base` family, so
	 * kind-based curation puts a kitchen cabinet in the foyer. */
	it("without a room, spreads to every room carrying that kind", () => {
		const { catalogue } = mergeIntoCatalogue(oneModule(), PLANNER_CATALOGUE);
		const family = must(addedFamily(catalogue), "the family this merge added");
		expect(roomsHolding(catalogue, family.id).length).toBeGreaterThan(1);
	});

	it("leaves rooms it was not pinned to exactly as they were", () => {
		const { catalogue } = mergeIntoCatalogue(
			oneModule({ roomId: "kitchen" }),
			PLANNER_CATALOGUE,
		);
		for (const before of PLANNER_CATALOGUE.roomTypes) {
			if (before.id === "kitchen") continue;
			const after = catalogue.roomTypes.find((r) => r.id === before.id);
			expect(after?.familyIds).toEqual(before.familyIds);
		}
	});

	it("falls back to kind rather than orphaning on an unknown room", () => {
		const { catalogue } = mergeIntoCatalogue(
			oneModule({ roomId: "garage" }),
			PLANNER_CATALOGUE,
		);
		const family = must(addedFamily(catalogue), "the family this merge added");
		expect(roomsHolding(catalogue, family.id).length).toBeGreaterThan(0);
	});
});

/**
 * The real `BC 800mm` upload, which is *not* a new family: 800×870×588 sits
 * within `DIMENSION_TOLERANCE_MM` of the seed `base-cabinet` (880 tall, 607
 * deep) on every axis, and 800 is already a rung on its ladder. This is the
 * tolerance doing its job — 607 and 588 are the same carcass measured with and
 * without its door — and it means pushing that design reports "already in the
 * catalogue" rather than forking a near-duplicate.
 */
describe("mergeIntoCatalogue — a design that matches an existing family", () => {
	const bc800 = mergeIntoCatalogue(
		oneModule({
			label: "BC 800mm",
			widthMm: 800,
			heightMm: 870,
			depthMm: 588,
			priceRm: 450,
			roomId: "kitchen",
		}),
		PLANNER_CATALOGUE,
	);

	it("extends the existing family rather than forking one", () => {
		expect(bc800.catalogue.families.length).toBe(
			PLANNER_CATALOGUE.families.length,
		);
		expect(bc800.report.newFamilies).toEqual([]);
	});

	it("leaves the agreed price on the rung it already had", () => {
		const before = familyFor(PLANNER_CATALOGUE, "Base cabinet")?.sizes.find(
			(s) => s.widthMm === 800,
		);
		const after = familyFor(bc800.catalogue, "Base cabinet")?.sizes.find(
			(s) => s.widthMm === 800,
		);
		expect(after?.priceRm).toBe(before?.priceRm);
		expect(bc800.report.unchanged).toEqual(["Base cabinet 800mm"]);
	});
});

/**
 * A catalogue with no `construction` block is not a catalogue with no
 * construction — the planner falls back to the seed `CONSTRUCTION` when the
 * field is absent, and every catalogue published so far is exactly that case.
 *
 * This used to fabricate its own defaults, drifted from the seed on three of
 * four fields, so merging anything into a live catalogue silently moved board
 * thickness, worktop thickness and the two-leaf threshold. The last of those
 * changes how many doors a 600mm cabinet is drawn with.
 */
describe("mergeIntoCatalogue — workshop constants", () => {
	it("never invents constants that contradict the planner's own", () => {
		expect(PLANNER_CATALOGUE.construction).toBeUndefined();

		const { catalogue } = mergeIntoCatalogue(
			{
				modules: oneModule().modules,
				finishes: [],
				panelThicknessMm: 0, // nothing measured
				plinthHeightMm: 0,
			},
			PLANNER_CATALOGUE,
		);

		expect(catalogue.construction).toEqual(CONSTRUCTION);
	});

	it("records the thickness an import actually measured", () => {
		const { catalogue } = mergeIntoCatalogue(
			{ ...oneModule(), panelThicknessMm: 18, plinthHeightMm: 120 },
			PLANNER_CATALOGUE,
		);
		expect(catalogue.construction?.panelThicknessMm).toBe(18);
		expect(catalogue.construction?.plinthHeightMm).toBe(120);
		// The two it never measures are left exactly as they were.
		expect(catalogue.construction?.worktopThicknessMm).toBe(
			CONSTRUCTION.worktopThicknessMm,
		);
		expect(catalogue.construction?.doorLeavesThresholdMm).toBe(
			CONSTRUCTION.doorLeavesThresholdMm,
		);
	});
});

describe("stripWidth, through the label a family ends up with", () => {
	// `BC 800mm` used to become `BC mm`: the digits matched the width pattern
	// and the unit did not.
	it("takes the unit with the number", () => {
		const { catalogue } = mergeIntoCatalogue(
			oneModule({ label: "BC 800mm" }),
			PLANNER_CATALOGUE,
		);
		expect(addedFamily(catalogue)?.label).toBe("BC");
	});

	it("still strips a bare width the import path produces", () => {
		const { catalogue } = mergeIntoCatalogue(
			oneModule({ label: "Base 900 · 2 door" }),
			PLANNER_CATALOGUE,
		);
		expect(addedFamily(catalogue)?.label).toBe("Base 2 door");
	});
});

/**
 * A seeded family carries no `geometry` at all, so a design that matches one
 * used to add its width and nothing else — the cabinet kept rendering the
 * one-shelf default and its four feet never arrived. That is what made an
 * uploaded design look nothing like its drawing.
 */
describe("mergeIntoCatalogue — teaching a family its fit-out", () => {
	const fitOut = {
		shelves: 1,
		fixedShelves: 0,
		doorLeaves: 2,
		drawers: 0,
		hasBack: true,
		legs: 4,
		legHeightMm: 100,
	};

	it("fills in the fit-out of a family that has none", () => {
		const base = must(
			familyFor(PLANNER_CATALOGUE, "Base cabinet"),
			"the seed base cabinet",
		);
		expect(base.geometry).toBeUndefined();

		const { catalogue } = mergeIntoCatalogue(
			oneModule({
				label: "BC 800mm",
				widthMm: 800,
				heightMm: base.heightMm,
				depthMm: base.depthMm,
				geometry: fitOut,
			}),
			PLANNER_CATALOGUE,
		);

		expect(familyFor(catalogue, "Base cabinet")?.geometry).toEqual(fitOut);
	});

	it("never overwrites a fit-out someone already set", () => {
		const corrected = { ...fitOut, shelves: 3, legs: 0, legHeightMm: 0 };
		const base: PlannerCatalogue = {
			...PLANNER_CATALOGUE,
			families: PLANNER_CATALOGUE.families.map((f) =>
				f.label === "Base cabinet" ? { ...f, geometry: corrected } : f,
			),
		};

		const { catalogue } = mergeIntoCatalogue(
			oneModule({
				label: "BC 800mm",
				widthMm: 800,
				heightMm: base.families[0].heightMm,
				depthMm: base.families[0].depthMm,
				geometry: fitOut,
			}),
			base,
		);

		expect(familyFor(catalogue, "Base cabinet")?.geometry).toEqual(corrected);
	});
});
