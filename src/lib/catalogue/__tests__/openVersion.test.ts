import { describe, expect, it } from "vitest";
import { resolveOpenVersion } from "../openVersion";

const row = (
	id: string,
	version: number,
	status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
) => ({ id, version, status });

describe("resolveOpenVersion", () => {
	const published = row("pub-11", 11, "PUBLISHED");

	it("opens the version that was asked for", () => {
		const asked = row("draft-4", 4, "DRAFT");

		expect(resolveOpenVersion([published, asked], "draft-4")).toBe(asked);
	});

	it("returns null when the asked-for version is gone", () => {
		expect(resolveOpenVersion([published], "draft-99")).toBeNull();
	});

	it("opens a draft newer than published — that is the work waiting to be priced", () => {
		const draft = row("draft-12", 12, "DRAFT");

		expect(resolveOpenVersion([published, draft])).toBe(draft);
	});

	it("opens published when the only draft is older than it", () => {
		// The exact state a publish leaves behind: the draft that was published
		// from is a NEW row, so the one the admin opened stays DRAFT below live.
		// Opening it again would show the prices they just published as unset.
		const stale = row("draft-10", 10, "DRAFT");

		expect(resolveOpenVersion([published, stale])).toBe(published);
	});

	it("opens published when there is no draft", () => {
		expect(resolveOpenVersion([published, row("old-9", 9, "ARCHIVED")])).toBe(
			published,
		);
	});

	it("takes the highest-numbered draft, not the first in the list", () => {
		const newest = row("draft-13", 13, "DRAFT");

		expect(
			resolveOpenVersion([row("draft-12", 12, "DRAFT"), newest, published]),
		).toBe(newest);
	});

	it("opens a draft when nothing is published yet", () => {
		const draft = row("draft-1", 1, "DRAFT");

		expect(resolveOpenVersion([draft])).toBe(draft);
	});

	it("returns null when there is nothing to open", () => {
		expect(resolveOpenVersion([])).toBeNull();
	});
});
