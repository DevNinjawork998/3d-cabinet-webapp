import { describe, expect, it } from "vitest";
import {
	CONSTRUCTION,
	doorLeavesFor,
	FAMILIES,
	type Family,
} from "../catalogue";
import {
	cabinetPartsMm,
	DOOR_GAP_MM,
	FRONT_THICKNESS_MM,
	frontZMm,
	LEG_DIAMETER_MM,
	type PartRole,
	PLINTH_RECESS_MM,
	shelfHeightsMm,
	standOf,
} from "../parts";

const familyById = (id: string): Family => {
	const family = FAMILIES.find((f) => f.id === id);
	if (!family) throw new Error(`no such family: ${id}`);
	return family;
};

const withGeometry = (
	family: Family,
	geometry: Partial<NonNullable<Family["geometry"]>>,
): Family => ({
	...family,
	geometry: {
		shelves: 0,
		fixedShelves: 0,
		doorLeaves: 0,
		drawers: 0,
		hasBack: true,
		legs: 0,
		legHeightMm: 0,
		legDiameterMm: 0,
		legInsetMm: 0,
		...geometry,
	},
});

const rolesOf = <T extends { role: PartRole }>(parts: T[], role: PartRole) =>
	parts.filter((p) => p.role === role);

describe("shelfHeightsMm", () => {
	it("splits the opening into equal bays, not shelves at the bottom", () => {
		// 1000mm of carcass, 16mm boards: 968 clear, three shelves, four bays.
		const heights = shelfHeightsMm(3, 0, 1000, 16);
		expect(heights).toHaveLength(3);
		const gaps = heights.map((y, i) => y - (heights[i - 1] ?? 16));
		for (const gap of gaps) expect(gap).toBeCloseTo(968 / 4);
	});

	it("gives a drawer bank no stray board through the middle", () => {
		expect(shelfHeightsMm(0, 0, 1000, 16)).toEqual([]);
	});
});

describe("cabinetPartsMm", () => {
	const base = familyById("base-cabinet");

	it("draws a six-shelf design with six shelves", () => {
		const parts = cabinetPartsMm(
			withGeometry(base, { shelves: 6 }),
			600,
			false,
		);
		expect(rolesOf(parts, "shelf")).toHaveLength(6);
	});

	it("counts fixed shelves as shelves", () => {
		const parts = cabinetPartsMm(
			withGeometry(base, { shelves: 2, fixedShelves: 1 }),
			600,
			false,
		);
		expect(rolesOf(parts, "shelf")).toHaveLength(3);
	});

	it("gives a three-drawer design three fronts and no leaves", () => {
		const parts = cabinetPartsMm(
			withGeometry(base, { drawers: 3, doorLeaves: 1 }),
			600,
			true,
		);
		expect(rolesOf(parts, "drawerFront")).toHaveLength(3);
		expect(rolesOf(parts, "doorLeaf")).toHaveLength(0);
	});

	it("omits the back when the design has none", () => {
		const backed = cabinetPartsMm(withGeometry(base, {}), 600, false);
		const open = cabinetPartsMm(
			withGeometry(base, { hasBack: false }),
			600,
			false,
		);
		expect(rolesOf(backed, "back")).toHaveLength(1);
		expect(rolesOf(open, "back")).toHaveLength(0);
	});

	it("draws no fronts on a carcass with no door chosen yet", () => {
		const parts = cabinetPartsMm(base, 600, false);
		expect(rolesOf(parts, "doorLeaf")).toHaveLength(0);
		expect(rolesOf(parts, "drawerFront")).toHaveLength(0);
	});

	// The fallbacks matter: catalogues published before design intake carry no
	// `geometry` block at all, and must keep looking exactly as they did.
	it("falls back to one shelf and width-derived leaves without geometry", () => {
		expect(base.geometry).toBeUndefined();
		for (const widthMm of [400, 900]) {
			const parts = cabinetPartsMm(base, widthMm, true);
			expect(rolesOf(parts, "shelf")).toHaveLength(1);
			expect(rolesOf(parts, "doorLeaf")).toHaveLength(doorLeavesFor(widthMm));
		}
	});

	it("uses the family's own drawer count without geometry", () => {
		const drawerBase = familyById("base-drawers");
		expect(drawerBase.geometry).toBeUndefined();
		const parts = cabinetPartsMm(drawerBase, 600, true);
		expect(rolesOf(parts, "drawerFront")).toHaveLength(drawerBase.drawers);
	});

	it("keeps every carcass part inside the carcass", () => {
		const family = withGeometry(base, { shelves: 3 });
		const parts = cabinetPartsMm(family, 800, false);
		const plinth = CONSTRUCTION.plinthHeightMm;

		for (const part of parts) {
			expect(part.centreMm.x - part.sizeMm.x / 2).toBeGreaterThanOrEqual(-400);
			expect(part.centreMm.x + part.sizeMm.x / 2).toBeLessThanOrEqual(400);
			expect(part.centreMm.y - part.sizeMm.y / 2).toBeGreaterThanOrEqual(
				plinth - 1e-9,
			);
			expect(part.centreMm.y + part.sizeMm.y / 2).toBeLessThanOrEqual(
				family.heightMm + 1e-9,
			);
			expect(part.centreMm.z - part.sizeMm.z / 2).toBeGreaterThanOrEqual(
				-family.depthMm / 2 - 1e-9,
			);
		}
	});

	// A wall unit has no plinth, so its carcass starts on its own origin.
	it("starts a wall unit's carcass at the bottom of the cabinet", () => {
		const wall = familyById("wall-cabinet");
		const [bottom] = rolesOf(
			cabinetPartsMm(wall, 600, false),
			"bottom",
		) as ReturnType<typeof cabinetPartsMm>;
		expect(bottom.centreMm.y).toBeCloseTo(CONSTRUCTION.panelThicknessMm / 2);
	});

	it("splits leaves evenly across the width, gaps included", () => {
		const parts = cabinetPartsMm(
			withGeometry(base, { doorLeaves: 2 }),
			900,
			true,
		);
		const leaves = rolesOf(parts, "doorLeaf") as ReturnType<
			typeof cabinetPartsMm
		>;
		expect(leaves).toHaveLength(2);

		const covered =
			leaves.reduce((sum, leaf) => sum + leaf.sizeMm.x, 0) + DOOR_GAP_MM * 3;
		expect(covered).toBeCloseTo(900);
		// Mirrored about the centre line, so a pair reads as a pair.
		expect(leaves[0].centreMm.x).toBeCloseTo(-leaves[1].centreMm.x);
	});

	it("stands fronts proud of the carcass rather than inside it", () => {
		const parts = cabinetPartsMm(base, 600, true);
		const [leaf] = rolesOf(parts, "doorLeaf") as ReturnType<
			typeof cabinetPartsMm
		>;
		expect(leaf.centreMm.z).toBeCloseTo(frontZMm(base.depthMm));
		expect(leaf.centreMm.z - leaf.sizeMm.z / 2).toBeCloseTo(base.depthMm / 2);
		expect(leaf.sizeMm.z).toBe(FRONT_THICKNESS_MM);
	});
});

describe("what a cabinet stands on", () => {
	const base = familyById("base-cabinet");

	it("keeps the plinth for a design that recorded no feet", () => {
		const parts = cabinetPartsMm(withGeometry(base, {}), 800, false);
		expect(rolesOf(parts, "leg")).toHaveLength(0);
		expect(standOf(withGeometry(base, {}))).toEqual({
			heightMm: CONSTRUCTION.plinthHeightMm,
			legs: 0,
			insetMm: PLINTH_RECESS_MM,
		});
	});

	// The client's BC 800mm: four Häfele levellers at 100mm.
	it("stands on the feet the design was drawn with", () => {
		const family = withGeometry(base, { legs: 4, legHeightMm: 100 });
		// The kick board clips to the front of these feet, so the inset comes
		// back with them — 35 is the fallback for a design that did not record it.
		expect(standOf(family)).toEqual({ heightMm: 100, legs: 4, insetMm: 35 });

		const legs = rolesOf(cabinetPartsMm(family, 800, false), "leg");
		expect(legs).toHaveLength(4);
		for (const leg of legs) {
			expect(leg.sizeMm.y).toBe(100);
			expect(leg.centreMm.y).toBe(50); // sitting on the floor
		}
	});

	it("tucks every foot under the carcass footprint", () => {
		const family = withGeometry(base, { legs: 4, legHeightMm: 100 });
		const legs = rolesOf(cabinetPartsMm(family, 800, false), "leg");
		for (const leg of legs) {
			expect(Math.abs(leg.centreMm.x) + leg.sizeMm.x / 2).toBeLessThan(400);
			expect(Math.abs(leg.centreMm.z) + leg.sizeMm.z / 2).toBeLessThan(
				base.depthMm / 2,
			);
		}
	});

	// The property a baked mesh could not give: the feet keep their real size
	// and move to the new corners instead of stretching with the cabinet.
	it("repositions the feet on resize rather than stretching them", () => {
		const family = withGeometry(base, { legs: 4, legHeightMm: 100 });
		const narrow = rolesOf(cabinetPartsMm(family, 400, false), "leg");
		const wide = rolesOf(cabinetPartsMm(family, 900, false), "leg");

		expect(narrow).toHaveLength(4);
		expect(wide).toHaveLength(4);
		for (const leg of [...narrow, ...wide]) {
			expect(leg.sizeMm.x).toBe(LEG_DIAMETER_MM);
			expect(leg.sizeMm.y).toBe(100);
		}
		const spread = (ls: typeof wide) =>
			Math.max(...ls.map((l) => l.centreMm.x)) -
			Math.min(...ls.map((l) => l.centreMm.x));
		expect(spread(wide)).toBeGreaterThan(spread(narrow));
	});

	it("floats the carcass on its feet, not through them", () => {
		const family = withGeometry(base, { legs: 4, legHeightMm: 100 });
		const parts = cabinetPartsMm(family, 800, false);
		const [bottom] = rolesOf(parts, "bottom");
		expect(bottom.centreMm.y - bottom.sizeMm.y / 2).toBeCloseTo(100);
	});

	it("gives a wall unit neither feet nor a plinth", () => {
		const wall = familyById("wall-cabinet");
		const family = withGeometry(wall, { legs: 4, legHeightMm: 100 });
		expect(standOf(family)).toEqual({ heightMm: 0, legs: 0, insetMm: 0 });
		expect(rolesOf(cabinetPartsMm(family, 600, false), "leg")).toHaveLength(0);
	});
});

describe("feet the design measured", () => {
	it("uses the design's own diameter and inset over the constants", () => {
		// The client's Häfele Axilo 48: 57mm across, 17mm in from the carcass
		// edge. The constants guess 50 and 35.
		const family = withGeometry(familyById("base-cabinet"), {
			legs: 4,
			legHeightMm: 100,
			legDiameterMm: 57,
			legInsetMm: 17,
		});

		const legs = cabinetPartsMm(family, 800, true).filter(
			(part) => part.role === "leg",
		);
		expect(legs).toHaveLength(4);

		for (const leg of legs) {
			expect(leg.sizeMm.x).toBe(57);
			expect(leg.sizeMm.z).toBe(57);
		}
		// Outermost foot's outer edge sits 17mm inside the 800 carcass.
		const outer = Math.max(...legs.map((l) => l.centreMm.x + l.sizeMm.x / 2));
		expect(outer).toBeCloseTo(400 - 17);
	});

	it("falls back to the constants, in the position they always drew", () => {
		const family = withGeometry(familyById("base-cabinet"), {
			legs: 4,
			legHeightMm: 100,
		});

		const legs = cabinetPartsMm(family, 800, true).filter(
			(part) => part.role === "leg",
		);
		for (const leg of legs) expect(leg.sizeMm.x).toBe(LEG_DIAMETER_MM);
		// The constant changed meaning from centre-inset to edge-inset; the
		// centre must not have moved.
		const centre = Math.max(...legs.map((l) => l.centreMm.x));
		expect(centre).toBeCloseTo(400 - 60);
	});
});

describe("construction comes from the catalogue, not a global", () => {
	const base = familyById("base-cabinet");
	const thicker = { ...CONSTRUCTION, panelThicknessMm: 25 };

	it("draws sides at the construction's board thickness", () => {
		const side = cabinetPartsMm(base, 600, false, thicker).find(
			(part) => part.role === "side",
		);
		expect(side?.sizeMm.x).toBe(25);
	});

	it("stands a plinth at the construction's plinth height", () => {
		const plinthy = { ...CONSTRUCTION, plinthHeightMm: 140 };
		expect(standOf(base, plinthy).heightMm).toBe(140);
	});

	it("splits into two leaves at the construction's threshold", () => {
		const early = { ...CONSTRUCTION, doorLeavesThresholdMm: 400 };
		const leaves = cabinetPartsMm(base, 600, true, early).filter(
			(part) => part.role === "doorLeaf",
		);
		expect(leaves).toHaveLength(2);
	});

	it("keeps the seed when no construction is given", () => {
		const side = cabinetPartsMm(base, 600, false).find(
			(part) => part.role === "side",
		);
		expect(side?.sizeMm.x).toBe(CONSTRUCTION.panelThicknessMm);
	});
});

describe("door leaf count is a property of width, not of the family", () => {
	const base = familyById("base-cabinet");

	it("a family that learned geometry.doorLeaves: 2 from its 900 does not draw a pair on a 400", () => {
		const family = withGeometry(base, { doorLeaves: 2 });
		const leaves = cabinetPartsMm(family, 400, true).filter(
			(part) => part.role === "doorLeaf",
		);
		expect(leaves).toHaveLength(1);
	});

	it("the same family still draws two leaves above the threshold", () => {
		const family = withGeometry(base, { doorLeaves: 2 });
		const leaves = cabinetPartsMm(family, 900, true).filter(
			(part) => part.role === "doorLeaf",
		);
		expect(leaves).toHaveLength(2);
	});

	it("a family that recorded no front stays frontless", () => {
		const family = withGeometry(base, { doorLeaves: 0 });
		const leaves = cabinetPartsMm(family, 900, true).filter(
			(part) => part.role === "doorLeaf",
		);
		expect(leaves).toHaveLength(0);
	});
});
