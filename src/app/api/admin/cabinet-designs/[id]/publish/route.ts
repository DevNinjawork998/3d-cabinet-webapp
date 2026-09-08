import { NextResponse } from "next/server";
import { publishDesigns } from "@/lib/catalogue/publishDesigns";

export const runtime = "nodejs";

/**
 * Pushes one design from the library into the planner catalogue.
 *
 * This is the link that was missing. `/admin/cabinet-designs` stored a design,
 * priced it, and marked it "visible to customers" — while the planner read only
 * the published `CatalogueVersion`, which nothing here ever wrote. An earlier
 * version of this bridge (`lib/catalogue/cabinetDesignToFamily.ts`, deleted in
 * `84f4cb7`) mapped a design straight to a `Family` with a single-rung ladder;
 * that is why the live catalogue still carries a "Testing123" family sized
 * 1000-1000mm whose design row was deleted long ago.
 *
 * All the work lives in `publishDesigns`, which the batch route shares — one
 * merge path rather than two, because two would drift and the drift would show
 * up as a mispriced ladder.
 */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const result = await publishDesigns([id]);

	if (!result.ok) {
		const [failure] = result.failures;
		if (!failure) {
			return NextResponse.json({ error: "not_found" }, { status: 404 });
		}
		return NextResponse.json(
			{ error: failure.error, message: failure.message },
			{ status: failure.status },
		);
	}

	// The single-design shape the admin page already reads. The batch route
	// returns the arrays; this one flattens the one entry back out.
	const [family] = result.families;
	return NextResponse.json({
		status: result.status,
		draftId: result.draftId,
		draftVersion: result.draftVersion,
		basedOnVersionId: result.basedOnVersionId,
		basedOnDraftVersion: result.basedOnDraftVersion,
		publishedVersion: result.publishedVersion,
		familyId: family?.familyId,
		familyLabel: family?.familyLabel,
		changes: result.changes,
		meshNote: result.meshNotes[0] ?? null,
	});
}
