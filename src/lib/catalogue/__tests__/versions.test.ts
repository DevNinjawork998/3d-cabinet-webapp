import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();

vi.mock("../db", () => ({
	prisma: { catalogueVersion: { findFirst } },
}));

// Imported after the mock so `versions.ts` closes over the fake prisma.
const { latestDraftVersion, mergeBase } = await import("../versions");

describe("latestDraftVersion", () => {
	beforeEach(() => {
		findFirst.mockReset();
	});

	it("asks for the highest-numbered DRAFT of that product", async () => {
		findFirst.mockResolvedValue({ id: "v13", version: 13, data: {} });

		await latestDraftVersion("PLANNER");

		expect(findFirst).toHaveBeenCalledWith({
			where: { product: "PLANNER", status: "DRAFT" },
			orderBy: { version: "desc" },
			select: { id: true, version: true, data: true },
		});
	});

	it("returns the row when a draft exists", async () => {
		findFirst.mockResolvedValue({ id: "v13", version: 13, data: { a: 1 } });

		expect(await latestDraftVersion("PLANNER")).toEqual({
			id: "v13",
			version: 13,
			data: { a: 1 },
		});
	});

	it("returns null when there is no draft", async () => {
		findFirst.mockResolvedValue(null);

		expect(await latestDraftVersion("PLANNER")).toBeNull();
	});
});

describe("mergeBase", () => {
	const published = { id: "pub-5", version: 5 };

	it("returns published when there is no open draft", () => {
		expect(mergeBase(published, null)).toBe(published);
	});

	it("returns the draft when it is newer than published", () => {
		const draft = { id: "draft-6", version: 6 };

		expect(mergeBase(published, draft)).toBe(draft);
	});

	it("returns published when the draft is older than published — a draft left behind by a publish must not be merged onto", () => {
		const staleDraft = { id: "draft-4", version: 4 };

		expect(mergeBase(published, staleDraft)).toBe(published);
	});
});
