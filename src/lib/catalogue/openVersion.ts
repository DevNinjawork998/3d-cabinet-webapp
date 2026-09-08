/**
 * Which catalogue version the editor opens on.
 *
 * The client-side twin of `mergeBase` in `versions.ts`, and it exists for the
 * same reason. Publishing POSTs a *new* version, and
 * `versions/[id]/publish/route.ts` supersedes only the outgoing PUBLISHED row —
 * so the draft an admin opened, priced and published from stays `DRAFT`
 * forever, at a version *below* live. Reopening it on the next visit shows
 * "Draft vN · not live" over prices that read as unset again, and publishing it
 * reverts what was just published.
 *
 * Pure and separate from the page for the same reason `mergeBase` is separate
 * from `publishDesigns`: the decision is the part worth testing, and it is
 * invisible inside an effect that also fetches, parses and sets five pieces of
 * state. Kept out of `versions.ts` because that module is `server-only` and
 * this one is read by a client component.
 */

type VersionRow = {
	id: string;
	version: number;
	status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

export function resolveOpenVersion<T extends VersionRow>(
	versions: T[],
	askedId?: string | null,
): T | null {
	// `?version=` still wins — that is how `/admin/import` and the design
	// library hand over the draft they just built, and an explicit ask is not
	// ours to second-guess.
	if (askedId) return versions.find((v) => v.id === askedId) ?? null;

	const published = versions.find((v) => v.status === "PUBLISHED") ?? null;
	const draft = versions
		.filter((v) => v.status === "DRAFT")
		.reduce<T | null>(
			(best, v) => (best === null || v.version > best.version ? v : best),
			null,
		);

	// No published row at all (a fresh database mid-import) means any draft is
	// the only thing there is to open.
	return draft && draft.version > (published?.version ?? -Infinity)
		? draft
		: published;
}
