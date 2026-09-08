import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLANNER_CATALOGUE } from "@/lib/planner/catalogue";

/**
 * A design push must stack onto the open draft.
 *
 * This is the data-loss defect the branch exists to close, and `mergeBase`'s
 * own tests cannot see it: they prove the *decision* is right, not that
 * `publishDesigns` acts on it. Wiring `published.data` into the merge while
 * still calling `mergeBase` for the id would keep every other test green and
 * restore the exact bug — the second push silently dropping the first.
 *
 * So the assertion is on the second draft's contents: both families in it, and
 * based on the first draft rather than on what is live.
 *
 * Everything the module reaches for outside the merge is faked — Blob, the
 * cached published read, and Postgres. `versions.ts` is deliberately NOT faked:
 * the draft numbering and the base choice are the things under test.
 */

/** One axis-aligned box as an OBJ object. `readObj` reads `o` and `v` only. */
function box(
	name: string,
	[x0, y0, z0]: number[],
	[x1, y1, z1]: number[],
): string {
	const corners = [
		[x0, y0, z0],
		[x1, y0, z0],
		[x1, y1, z0],
		[x0, y1, z0],
		[x0, y0, z1],
		[x1, y0, z1],
		[x1, y1, z1],
		[x0, y1, z1],
	];
	return [`o ${name}`, ...corners.map((c) => `v ${c.join(" ")}`)].join("\n");
}

/** An 800 × 880 × 600 carcass in millimetres, Y-up, 18mm board. */
const OBJ_TEXT = [
	box("G-UEnd_(L)", [0, 0, 0], [18, 880, 600]),
	box("G-UEnd_(R)", [782, 0, 0], [800, 880, 600]),
	box("G-Top", [18, 862, 0], [782, 880, 600]),
	box("G-Bottom", [18, 0, 0], [782, 18, 600]),
	box("G-Back", [18, 18, 0], [782, 862, 18]),
	box("G-Shelf", [18, 430, 18], [782, 448, 600]),
	box("G-Door(R)", [0, 0, 600], [800, 880, 618]),
].join("\n");

/** Dimensions are deliberately off every seed family's — within
 * `DIMENSION_TOLERANCE_MM` of one, the design would join an existing family
 * that already lives in the published catalogue, and "the second draft kept the
 * first" would be true whether or not the merge stacked. */
const design = (
	id: string,
	heightMm: number,
	category: "BASE_CABINET" | "TALL_CABINET",
) => ({
	id,
	name: `Design ${id}`,
	sku: `SKU-${id}`,
	filename: `${id}.obj`,
	blobPathname: `mesh/${id}/${id}.obj`,
	sha256: `sha-${id}`,
	widthMm: 800,
	heightMm,
	depthMm: 500,
	category,
	room: "KITCHEN" as const,
	priceRm: 900,
});

const state = vi.hoisted(() => ({
	rows: [] as { id: string; version: number; status: string; data: unknown }[],
	designs: [] as { id: string }[],
}));

vi.mock("../db", () => ({
	prisma: {
		cabinetDesign: {
			findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
				state.designs.filter((d) => where.id.in.includes(d.id)),
			update: async () => ({}),
		},
		catalogueVersion: {
			aggregate: async () => ({
				_max: { version: Math.max(0, ...state.rows.map((r) => r.version)) },
			}),
			create: async ({
				data,
			}: {
				data: { version: number; status: string; data: unknown };
			}) => {
				const row = { ...data, id: `ver-${data.version}` };
				state.rows.push(row);
				return row;
			},
			findFirst: async () =>
				state.rows
					.filter((r) => r.status === "DRAFT")
					.sort((a, b) => b.version - a.version)[0] ?? null,
		},
	},
}));

vi.mock("../meshBlob", () => ({
	fetchMeshFile: async () => Buffer.from(OBJ_TEXT, "utf8"),
	putRenderMeshFile: async () => undefined,
	renderMeshPathname: (id: string, sha: string) =>
		`render/${id}/${sha}.icbmesh`,
}));

vi.mock("../store", () => ({
	CATALOGUE_CACHE_TAG: "catalogue",
	getPublishedPlannerCatalogue: async () => ({
		id: "ver-1",
		version: 1,
		data: structuredClone(PLANNER_CATALOGUE),
	}),
}));

const { publishDesigns } = await import("../publishDesigns");

describe("publishDesigns", () => {
	beforeEach(() => {
		// The published row lives in the same table, so the draft numbering the
		// real `createDraftVersion` computes starts above it.
		state.rows = [
			{
				id: "ver-1",
				version: 1,
				status: "PUBLISHED",
				data: structuredClone(PLANNER_CATALOGUE),
			},
		];
		// Two shapes, so `matchesFamily` puts each design in a family of its own
		// and "did the second draft keep the first" is answerable by id.
		state.designs = [
			design("a", 900, "BASE_CABINET"),
			design("b", 2200, "TALL_CABINET"),
		];
	});

	it("stacks a second push onto the open draft instead of forking from live", async () => {
		const first = await publishDesigns(["a"]);
		const second = await publishDesigns(["b"]);

		if (!first.ok || !second.ok) throw new Error("both pushes must succeed");
		expect(first.status).toBe("draft_created");
		expect(second.status).toBe("draft_created");

		// Built on the first draft, not on what is live.
		expect(second.basedOnVersionId).toBe(first.draftId);
		expect(second.basedOnVersionId).not.toBe("ver-1");

		const familyA = first.families[0].familyId;
		const familyB = second.families[0].familyId;
		expect(familyA).not.toBe(familyB);
		// Both are new families. If either had merged into a seed family the
		// assertions below would hold even for a merge based on `published`.
		const seeded = PLANNER_CATALOGUE.families.map((f) => f.id);
		expect(seeded).not.toContain(familyA);
		expect(seeded).not.toContain(familyB);

		// The whole point: the second draft carries BOTH designs' families. A
		// merge based on `published` would hold only the second.
		const draft = state.rows.find((r) => r.id === second.draftId);
		if (!draft) throw new Error("the second push must have written a draft");
		const ids = (draft.data as typeof PLANNER_CATALOGUE).families.map(
			(f) => f.id,
		);
		expect(ids).toContain(familyA);
		expect(ids).toContain(familyB);
	});

	it("falls back to the published catalogue when the only draft is older than live", async () => {
		// Exactly what a publish leaves behind: the draft that was published from
		// is a new row, so the one still open sits below live. Merging onto it
		// would revert whatever that publish added.
		state.rows.push({
			id: "ver-0",
			version: 0,
			status: "DRAFT",
			data: structuredClone(PLANNER_CATALOGUE),
		});

		const result = await publishDesigns(["a"]);

		if (!result.ok) throw new Error("the push must succeed");
		expect(result.basedOnVersionId).toBe("ver-1");
		expect(result.basedOnDraftVersion).toBeUndefined();
	});
});
