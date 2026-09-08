import "server-only";
import type { CabinetDesign } from "@/generated/prisma/client";
import { objTextFromBytes } from "@/lib/mesh/archive";
import { measureDesign } from "@/lib/mesh/measureDesign";
import {
	type ConfirmedModule,
	describeMerge,
	matchesFamily,
	mergeIntoCatalogue,
} from "@/lib/mesh/mergeIntoCatalogue";
import {
	buildRenderMesh,
	encodeRenderMesh,
	MAX_TRIANGLES,
	type MeshGroup,
} from "@/lib/mesh/renderMesh";
import { CONSTRUCTION, WALL_CABINET_FLOOR_MM } from "@/lib/planner/catalogue";
import { plannerCatalogueSchema } from "@/lib/planner/catalogueSchema";
import { type BoxMm, swingOf } from "@/lib/planner/swing";
import {
	CATEGORY_TO_FAMILY_SHAPE,
	ROOM_TO_PLANNER,
} from "./cabinetDesignLabels";
import { prisma } from "./db";
import {
	fetchMeshFile,
	putRenderMeshFile,
	renderMeshPathname,
} from "./meshBlob";
import { getPublishedPlannerCatalogue } from "./store";
import { createDraftVersion, latestDraftVersion, mergeBase } from "./versions";

/**
 * Pushing designs from the library into the planner catalogue.
 *
 * One design or several — the several case is the point. Infinite Cabinet draws
 * one export per width (BC 600, BC 800, BC 900), and those are three rungs of
 * *one* size ladder. Publishing them one at a time produced three DRAFT
 * catalogue versions to review and publish in sequence, each based on the last,
 * for what is a single decision. `mergeIntoCatalogue` already takes an array of
 * modules, so a batch is one merge and one draft.
 *
 * **It creates a DRAFT and stops.** Publishing stays a separate act at
 * `/admin/catalogue`, because this document prices real kitchens and a bad
 * parse must never reach a customer unreviewed.
 *
 * The bytes are re-read from Blob and re-parsed here. Trust comes from the
 * file, never from what a client claims about it — the same stance
 * `catalogue/imports/route.ts` takes.
 */

/** Above this multiple of the recorded width, the file is a run, not a unit.
 * Generous: a real single-cabinet export measures within a few millimetres of
 * its own width, so anything past 1.5x is a different kind of file. */
const MULTI_CABINET_RATIO = 1.5;

export type DesignFailure = {
	designId: string;
	name: string;
	error:
		| "file_unreachable"
		| "parse_failed"
		| "no_geometry"
		| "looks_like_a_run";
	message: string;
	status: number;
};

type Prepared = {
	design: CabinetDesign;
	module: ConfirmedModule;
	meshNote: string | null;
};

/**
 * Reads one design's file into the module the merge takes, and stores the mesh
 * the planner will draw.
 *
 * The mesh is built before anything is merged: a design whose file will not
 * convert should not quietly reach the catalogue as a procedural box pretending
 * to be it. But a mesh failure is **not** fatal — the planner falls back to
 * procedural geometry, which is what every catalogue published before design
 * intake did, so the cabinet is still sellable. That is why `meshNote` travels
 * alongside a success rather than replacing it.
 */
async function prepare(
	design: CabinetDesign,
): Promise<Prepared | DesignFailure> {
	const fail = (
		error: DesignFailure["error"],
		message: string,
		status: number,
	): DesignFailure => ({
		designId: design.id,
		name: design.name,
		error,
		message,
		status,
	});

	// Geometry comes from the file; every number a customer sees comes from the
	// row, where a human typed it. A parse can be wrong about a shelf count and
	// nobody dies; a parse wrong about a price is a mispriced kitchen.
	let measured: ReturnType<typeof measureDesign>;
	let objText = "";
	try {
		const bytes = await fetchMeshFile(design.blobPathname);
		objText = objTextFromBytes(bytes);
		measured = measureDesign(objText);
	} catch (error) {
		// Two very different failures land here: the file could not be fetched
		// from Blob (wrong or expired token, most often a local env that has not
		// run `vercel env pull`), or it fetched and would not parse. Say which,
		// because the fixes are nothing alike.
		const message = (error as Error).message;
		const unreachable = /blob|403|401|forbidden|denied/i.test(message);
		return unreachable
			? fail(
					"file_unreachable",
					`Could not read ${design.filename} from storage (${message}). The design row is fine — this is blob access, so check BLOB_READ_WRITE_TOKEN.`,
					502,
				)
			: fail(
					"parse_failed",
					`Could not parse ${design.filename}: ${message}`,
					422,
				);
	}

	if (!measured) {
		return fail(
			"no_geometry",
			`No geometry could be read from ${design.filename}, so there is nothing to add.`,
			422,
		);
	}

	// A design file that measures far wider than the row claims is not this
	// cabinet — it is the whole run the cabinet came out of. Letting that
	// through produces one absurd family (a "cabinet" with a dozen shelves and
	// thirteen door leaves) that reads as plausible in a table and is obvious
	// only once someone drags it into the planner.
	if (measured.widthMm > design.widthMm * MULTI_CABINET_RATIO) {
		return fail(
			"looks_like_a_run",
			`${design.filename} measures ${measured.widthMm}mm wide but this design is recorded as ${design.widthMm}mm. That file looks like a whole run rather than one cabinet — attach the single-cabinet export, or use Import design for a full run.`,
			409,
		);
	}

	let meshNote: string | null = null;
	let meshDesignId: string | undefined;
	try {
		const mesh = buildRenderMesh(objText);
		if (!mesh) {
			meshNote = `No drawable geometry in ${design.filename} — the planner will draw this cabinet procedurally.`;
		} else if (mesh.triangleCount > MAX_TRIANGLES) {
			meshNote = `${design.filename} holds ${mesh.triangleCount.toLocaleString()} triangles, past the ${MAX_TRIANGLES.toLocaleString()} a customer on mobile data should download. Drawing this one procedurally instead.`;
		} else {
			const bytes = encodeRenderMesh(mesh);
			const pathname = renderMeshPathname(design.id, design.sha256);
			await putRenderMeshFile(pathname, bytes);
			await prisma.cabinetDesign.update({
				where: { id: design.id },
				data: {
					meshPathname: pathname,
					meshBytes: bytes.length,
					meshGroups: mesh.groups.map((group) => ({
						role: group.role,
						triangles: group.indices.length / 3,
						// How this door will actually behave when a customer opens
						// it. Recorded here so a wrong reading is visible in the
						// review table BEFORE publish rather than in front of a
						// customer — which is the whole reason the swing is decided
						// at intake instead of at runtime.
						...(group.role === "door"
							? {
									hingeSide: group.hingeSide ?? null,
									fit: swingOf(
										boxOf(group.bboxMm),
										carcassBox(mesh.groups, group),
										group.hingeSide ?? "left",
									).fit,
								}
							: {}),
					})),
				},
			});
			meshDesignId = design.id;
		}
	} catch (error) {
		meshNote = `Could not build a render mesh from ${design.filename} (${(error as Error).message}). The planner will draw this cabinet procedurally.`;
	}

	// Shape comes from the category the admin picked, not from the file. Every
	// other customer-visible number already comes from the row, and mixing the
	// two sources produced contradictions: a row recorded as 870mm tall became a
	// `tall` family because the export contained a 2400mm run.
	const shape = CATEGORY_TO_FAMILY_SHAPE[design.category];

	return {
		design,
		meshNote,
		module: {
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
			meshDesignId,
			priceRm: design.priceRm,
			roomId: ROOM_TO_PLANNER[design.room],
		},
	};
}

export type PublishResult =
	| { ok: false; failures: DesignFailure[] }
	| {
			ok: true;
			status: "draft_created" | "already_in_catalogue";
			draftId?: string;
			draftVersion?: number;
			basedOnVersionId: string;
			publishedVersion: number;
			families: { designId: string; familyId: string; familyLabel: string }[];
			changes: string[];
			meshNotes: string[];
			failures: DesignFailure[];
	  };

/** The mesh carries a bbox as two triples; `swingOf` works in `{x,y,z}`. */
const boxOf = (bbox: MeshGroup["bboxMm"]): BoxMm => ({
	min: { x: bbox.min[0], y: bbox.min[1], z: bbox.min[2] },
	max: { x: bbox.max[0], y: bbox.max[1], z: bbox.max[2] },
});

/**
 * The box a design's doors hang on.
 *
 * Without a carcass group there is nothing to compare a leaf's back face
 * against, so fall back to a front plane sitting exactly on that back face —
 * the overlay reading, and what every design the client has sent so far
 * actually is.
 */
function carcassBox(groups: MeshGroup[], door: MeshGroup): BoxMm {
	const carcass = groups.find((group) => group.role === "carcass");
	if (carcass) return boxOf(carcass.bboxMm);
	const leaf = boxOf(door.bboxMm);
	return { ...leaf, max: { ...leaf.max, z: leaf.min.z } };
}

export async function publishDesigns(ids: string[]): Promise<PublishResult> {
	const designs = await prisma.cabinetDesign.findMany({
		where: { id: { in: ids } },
	});

	const prepared: Prepared[] = [];
	const failures: DesignFailure[] = [];
	for (const design of designs) {
		const result = await prepare(design);
		// One bad file in a batch of three must not lose the other two. Each is
		// its own rung and its own decision; the caller reports per row.
		if ("error" in result) failures.push(result);
		else prepared.push(result);
	}

	if (prepared.length === 0) return { ok: false, failures };

	// The published version is what a change is *measured* against, and what a
	// push falls back to. It is not always what a push builds on: an open draft
	// already carries work this merge must not drop — unless that draft is
	// stale (see `mergeBase`), in which case building on it would revert
	// whatever was published after it.
	const published = await getPublishedPlannerCatalogue();
	const openDraft = await latestDraftVersion("PLANNER");
	const parsedDraft = openDraft
		? {
				id: openDraft.id,
				version: openDraft.version,
				data: plannerCatalogueSchema.parse(openDraft.data),
			}
		: null;
	const chosenBase = mergeBase(published, parsedDraft);
	const { id: baseId, data: base } = chosenBase;
	const version = published.version;
	// `mergeBase` may reject `parsedDraft` as stale (see its doc comment), so
	// the note below has to check what was actually chosen, not just whether a
	// draft existed.
	const stackedOnDraft = chosenBase === parsedDraft ? parsedDraft : null;

	// Carry the live workshop constants through. `mergeIntoCatalogue` always
	// writes a `construction` block from what it is handed, and a design push has
	// no business resetting the board thickness the whole catalogue is built on.
	//
	// The fallback matters as much as the value. Published catalogues today carry
	// no `construction` at all, and the planner falls back to the seed
	// `CONSTRUCTION` (16mm board) when it is absent — so defaulting to
	// `mergeIntoCatalogue`'s own 18mm here would quietly thicken every panel in
	// the catalogue as a side effect of adding one cabinet.
	const { catalogue, report } = mergeIntoCatalogue(
		{
			modules: prepared.map((p) => p.module),
			finishes: [],
			panelThicknessMm:
				base.construction?.panelThicknessMm ?? CONSTRUCTION.panelThicknessMm,
			plinthHeightMm:
				base.construction?.plinthHeightMm ?? CONSTRUCTION.plinthHeightMm,
		},
		base,
	);

	// Record which family each design landed in, even when the merge changed
	// nothing: the design *is* represented by that family, and the delete guard
	// has to know it.
	const families: {
		designId: string;
		familyId: string;
		familyLabel: string;
	}[] = [];
	for (const { design, module } of prepared) {
		const family = catalogue.families.find((f) => matchesFamily(module, f));
		if (!family) {
			// Unreachable unless `matchesFamily` and the merge disagree; a design
			// linked to nothing is the orphan class of bug this path exists to end.
			failures.push({
				designId: design.id,
				name: design.name,
				error: "parse_failed",
				message: `Could not locate the family ${design.name} merged into.`,
				status: 500,
			});
			continue;
		}
		await prisma.cabinetDesign.update({
			where: { id: design.id },
			data: { familyId: family.id },
		});
		families.push({
			designId: design.id,
			familyId: family.id,
			familyLabel: family.label,
		});
	}

	const meshNotes = prepared
		.map((p) => p.meshNote)
		.filter((note): note is string => note !== null);

	// A fit-out learned by a family that had none is a real change even when no
	// family and no size was added — it is what the scene draws from, and missing
	// it is what left an uploaded cabinet rendering the old default.
	const changed =
		report.newFamilies.length > 0 ||
		report.newSizes.length > 0 ||
		report.learnedGeometry.length > 0;

	if (!changed) {
		return {
			ok: true,
			status: "already_in_catalogue",
			basedOnVersionId: baseId,
			publishedVersion: version,
			families,
			changes: describeMerge(report),
			meshNotes,
			failures,
		};
	}

	const label =
		prepared.length === 1
			? `${prepared[0].design.name} (${prepared[0].design.sku})`
			: `${prepared.length} designs`;
	const draft = await createDraftVersion({
		product: "PLANNER",
		data: catalogue,
		// Say what this draft was built on when it stacked. Without it the note
		// reads as though the draft holds one design when it may hold five.
		note: stackedOnDraft
			? `${label} added from the design library, on top of draft v${stackedOnDraft.version}`
			: `${label} added from the design library`,
	});

	return {
		ok: true,
		status: "draft_created",
		draftId: draft.id,
		draftVersion: draft.version,
		basedOnVersionId: baseId,
		publishedVersion: version,
		families,
		changes: describeMerge(report),
		meshNotes,
		failures,
	};
}
