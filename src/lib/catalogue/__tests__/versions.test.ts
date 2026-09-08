import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();

vi.mock("../db", () => ({
	prisma: { catalogueVersion: { findFirst } },
}));

// Imported after the mock so `versions.ts` closes over the fake prisma.
const { latestDraftVersion } = await import("../versions");

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
