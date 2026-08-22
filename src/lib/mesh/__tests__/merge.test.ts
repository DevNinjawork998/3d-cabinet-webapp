import { describe, expect, it } from "vitest";
import { PLANNER_CATALOGUE } from "@/lib/planner/catalogue";
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
