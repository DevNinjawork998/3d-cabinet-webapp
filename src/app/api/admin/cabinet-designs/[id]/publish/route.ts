import { NextResponse } from "next/server";
import {
	CATEGORY_TO_FAMILY_SHAPE,
	ROOM_TO_PLANNER,
} from "@/lib/catalogue/cabinetDesignLabels";
import { prisma } from "@/lib/catalogue/db";
import { fetchMeshFile } from "@/lib/catalogue/meshBlob";
import { getPublishedPlannerCatalogue } from "@/lib/catalogue/store";
import { createDraftVersion } from "@/lib/catalogue/versions";
import { objTextFromBytes } from "@/lib/mesh/archive";
import { measureDesign } from "@/lib/mesh/measureDesign";
import {
	type ConfirmedModule,
	describeMerge,
	matchesFamily,
	mergeIntoCatalogue,
} from "@/lib/mesh/mergeIntoCatalogue";
import { CONSTRUCTION, WALL_CABINET_FLOOR_MM } from "@/lib/planner/catalogue";

export const runtime = "nodejs";

/** Above this multiple of the recorded width, the file is a run, not a unit.
 * Generous: a real single-cabinet export measures within a few millimetres of
 * its own width, so anything past 1.5x is a different kind of file. */
const MULTI_CABINET_RATIO = 1.5;

/**
 * Pushes one design from the library into the planner catalogue.
 *
 * This is the link that was missing. `/admin/cabinet-designs` stored a design,
 * priced it, and marked it "visible to customers" — while the planner read only
 * the published `CatalogueVersion`, which nothing here ever wrote. An earlier
 * version of this bridge (`lib/catalogue/cabinetDesignToFamily.ts`, deleted in
 * `84f4cb7`) mapped a design straight to a `Family` with a single-rung ladder;
 * that is why the live catalogue still carries a "Testing123" family sized
 * 1000–1000mm whose design row was deleted long ago.
 *
 * This one goes through `mergeIntoCatalogue` instead, so a design that is the
 * same carcass as an existing family extends that family's size ladder rather
 * than forking a near-duplicate.
 *
 * **It creates a DRAFT and stops.** Publishing is a separate act at
 * `/admin/catalogue`, because this document prices real kitchens and a bad
 * parse must never reach a customer unreviewed.
 *
 * The bytes are re-read from Blob and re-parsed here. Trust comes from the
 * file, never from what a client claims about it — the same stance
 * `catalogue/imports/route.ts` takes.
 */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;

	const design = await prisma.cabinetDesign.findUnique({ where: { id } });
	if (!design) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	// Geometry comes from the file; every number a customer sees comes from the
	// row, where a human typed it. A parse can be wrong about a shelf count and
	// nobody dies; a parse wrong about a price is a mispriced kitchen.
	let measured: ReturnType<typeof measureDesign>;
	try {
		const bytes = await fetchMeshFile(design.blobPathname);
		measured = measureDesign(objTextFromBytes(bytes));
	} catch (error) {
		// Two very different failures land here: the file could not be fetched
		// from Blob (wrong or expired token, most often a local env that has not
		// run `vercel env pull`), or it fetched and would not parse. Say which,
		// because the fixes are nothing alike.
		const message = (error as Error).message;
		const unreachable = /blob|403|401|forbidden|denied/i.test(message);
		return NextResponse.json(
			{
				error: unreachable ? "file_unreachable" : "parse_failed",
				message: unreachable
					? `Could not read ${design.filename} from storage (${message}). The design row is fine — this is blob access, so check BLOB_READ_WRITE_TOKEN.`
					: `Could not parse ${design.filename}: ${message}`,
			},
			{ status: unreachable ? 502 : 422 },
		);
	}
	if (!measured) {
		return NextResponse.json(
			{
				error: "no_geometry",
				message:
					"No geometry could be read from that design file, so there is nothing to add.",
			},
			{ status: 422 },
		);
	}

	// A design file that measures far wider than the row claims is not this
	// cabinet — it is the whole run the cabinet came out of. Letting that
	// through produces one absurd family (a "cabinet" with a dozen shelves and
	// thirteen door leaves) that reads as plausible in a table and is obvious
	// only once someone drags it into the planner.
	if (measured.widthMm > design.widthMm * MULTI_CABINET_RATIO) {
		return NextResponse.json(
			{
				error: "looks_like_a_run",
				message: `${design.filename} measures ${measured.widthMm}mm wide but this design is recorded as ${design.widthMm}mm. That file looks like a whole run rather than one cabinet — attach the single-cabinet export, or use Import design for a full run.`,
			},
			{ status: 409 },
		);
	}

	// Shape comes from the category the admin picked, not from the file. Every
	// other customer-visible number already comes from the row, and mixing the
	// two sources produced contradictions: a row recorded as 870mm tall became a
	// `tall` family because the export contained a 2400mm run.
	const shape = CATEGORY_TO_FAMILY_SHAPE[design.category];

	const module: ConfirmedModule = {
		label: design.name,
		kind: shape.kind,
		widthMm: design.widthMm,
		heightMm: design.heightMm,
		depthMm: design.depthMm,
		// A wall unit hangs; everything else stands on the floor. Taking this
		// from the file would record where the cabinet happened to sit in the
		// drawing, which is not a property of the product.
		floorHeightMm: shape.kind === "wall" ? WALL_CABINET_FLOOR_MM : 0,
		// The one thing only the file knows: what is actually inside it.
		geometry: measured.geometry,
		priceRm: design.priceRm,
		roomId: ROOM_TO_PLANNER[design.room],
	};

	const {
		id: baseId,
		version,
		data: base,
	} = await getPublishedPlannerCatalogue();

	// Carry the live workshop constants through. `mergeIntoCatalogue` always
	// writes a `construction` block from what it is handed, and a single-design
	// push has no business resetting the board thickness the whole catalogue is
	// built on.
	//
	// The fallback matters as much as the value. Published catalogues today
	// carry no `construction` at all, and the planner falls back to the seed
	// `CONSTRUCTION` (16mm board) when it is absent — so defaulting to
	// `mergeIntoCatalogue`'s own 18mm here would quietly thicken every panel in
	// the catalogue as a side effect of adding one cabinet.
	const { catalogue, report } = mergeIntoCatalogue(
		{
			modules: [module],
			finishes: [],
			panelThicknessMm:
				base.construction?.panelThicknessMm ?? CONSTRUCTION.panelThicknessMm,
			plinthHeightMm:
				base.construction?.plinthHeightMm ?? CONSTRUCTION.plinthHeightMm,
		},
		base,
	);

	const family = catalogue.families.find((f) => matchesFamily(module, f));
	if (!family) {
		// Unreachable unless `matchesFamily` and the merge disagree; a design
		// linked to nothing is the orphan class of bug this route exists to end,
		// so fail loudly rather than write a draft nobody can trace.
		return NextResponse.json(
			{ error: "merge_failed", message: "Could not locate the merged family." },
			{ status: 500 },
		);
	}

	// Record the link either way. Even when the merge changed nothing, this
	// design *is* represented in the catalogue by that family, and the delete
	// guard has to know it.
	await prisma.cabinetDesign.update({
		where: { id },
		data: { familyId: family.id },
	});

	// A fit-out learned by a family that had none is a real change even when no
	// family and no size was added — it is what the scene draws from, and
	// missing it is what left an uploaded cabinet rendering the old default.
	const changed =
		report.newFamilies.length > 0 ||
		report.newSizes.length > 0 ||
		report.learnedGeometry.length > 0;
	if (!changed) {
		return NextResponse.json({
			status: "already_in_catalogue",
			familyId: family.id,
			familyLabel: family.label,
			publishedVersion: version,
			changes: describeMerge(report),
		});
	}

	const draft = await createDraftVersion({
		product: "PLANNER",
		data: catalogue,
		note: `${design.name} (${design.sku}) added from the design library`,
	});

	return NextResponse.json({
		status: "draft_created",
		draftId: draft.id,
		draftVersion: draft.version,
		basedOnVersionId: baseId,
		familyId: family.id,
		familyLabel: family.label,
		changes: describeMerge(report),
	});
}
