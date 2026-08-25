import { CONSTRUCTION } from "@/lib/planner/catalogue";
import type {
	Family,
	Finish,
	PlannerCatalogue,
	SizeOption,
} from "@/lib/planner/catalogueSchema";
import { plannerCatalogueSchema } from "@/lib/planner/catalogueSchema";
import type { CabinetGeometry, ModuleKind } from "./extract";
import { slugify } from "./extract";

/**
 * The last step of design intake: the cabinets a human confirmed at
 * `/admin/import` are folded into the catalogue that is live today.
 *
 * **Additive only, and that is the whole design.** The admin's job is to keep
 * adding designs, so import number five has to leave imports one through four
 * intact and priced. This function can create a family and it can add a rung to
 * an existing family's size ladder. It cannot delete a family, cannot remove a
 * rung, and cannot write a `priceRm` that already has a value — an earlier
 * version of this replaced the family list wholesale, which quietly destroyed
 * every previously imported and priced cabinet.
 *
 * Door styles, the door width ladder and room curation are carried over
 * untouched. A geometry export knows nothing about any of them.
 *
 * **Every new price starts at zero.** Geometry carries no money; a person types
 * the numbers in at `/admin/catalogue` before the version is ever published.
 */

/** One row of the confirm table, as the reviewer left it. */
export type ConfirmedModule = {
	label: string;
	kind: ModuleKind;
	widthMm: number;
	heightMm: number;
	depthMm: number;
	floorHeightMm: number;
	geometry: CabinetGeometry;
	/**
	 * What this rung costs, when the caller already knows.
	 *
	 * A mesh import never does — geometry carries no money, which is why the
	 * default below is still zero. The cabinet-design library does: an admin
	 * typed the price into the upload form, and making them type it again in
	 * the catalogue editor is how a cabinet ends up shipping at RM 0. Only ever
	 * used for a rung that does not exist yet; a price already on the ladder is
	 * still never overwritten.
	 */
	priceRm?: number;
	/**
	 * The one room this cabinet belongs in, when the caller knows that too.
	 *
	 * Without it, room curation gives every room that already carries this
	 * `kind` the new family — which is right for a wall export, where nobody
	 * said what room anything was for, and wrong for a design the admin filed
	 * under Kitchen. Every room in the seed catalogue carries a `base` or
	 * `tall` family, so a kitchen base cabinet would otherwise also appear in
	 * the living room and the foyer.
	 *
	 * An id matching no room falls back to the `kind` behaviour rather than
	 * pinning the family nowhere: an unreachable family is the bug this is
	 * meant to prevent, not a stricter version of it.
	 */
	roomId?: string;
};

export type ConfirmedFinish = { label: string; hex: string };

export type ConfirmedImport = {
	modules: ConfirmedModule[];
	finishes: ConfirmedFinish[];
	panelThicknessMm: number;
	plinthHeightMm: number;
};

export type MergeReport = {
	newFamilies: string[];
	/** `["Base 2 door: +600mm", …]` */
	newSizes: string[];
	newFinishes: string[];
	/** Families that had no fit-out recorded and learned one from this import.
	 * A real change even when no family and no size was added — it is what the
	 * scene draws from. */
	learnedGeometry: string[];
	/** Rows that matched an existing family at a width it already carries. */
	unchanged: string[];
};

/**
 * A read of 607mm and a read of 600mm are the same carcass measured with and
 * without its door, so shape matching has to be tolerant or one product forks
 * into two families on the second import.
 */
const DIMENSION_TOLERANCE_MM = 20;

const near = (a: number, b: number) =>
	Math.abs(a - b) <= DIMENSION_TOLERANCE_MM;

/**
 * Same product, different width. Fit-out is matched exactly rather than
 * tolerantly: a 900 with two shelves and a 900 with five are different
 * cabinets even though they are the same box.
 */
export function matchesFamily(
	module: ConfirmedModule,
	family: Family,
): boolean {
	const g = family.geometry;
	return (
		family.kind === module.kind &&
		family.drawers === module.geometry.drawers &&
		near(family.heightMm, module.heightMm) &&
		near(family.depthMm, module.depthMm) &&
		near(family.floorHeightMm, module.floorHeightMm) &&
		// A family imported before `geometry` existed matches on shape alone —
		// otherwise every pre-existing family would fork on the next import.
		(g === undefined ||
			(g.shelves === module.geometry.shelves &&
				g.doorLeaves === module.geometry.doorLeaves))
	);
}

/** `Base 900 · 2 door` describes one rung; the family covers the whole ladder.
 *
 * The unit goes with the number: an admin naming a design `BC 800mm` used to
 * leave `BC mm` behind, because the digits matched and `mm` did not. */
const stripWidth = (label: string) =>
	label
		.replace(/\s*\d{3,4}\s*(mm)?\s*(·|-)?\s*/i, " ")
		.replace(/\s+/g, " ")
		.trim();

function uniqueId(base: string, taken: Set<string>): string {
	let id = base;
	let n = 2;
	while (taken.has(id)) id = `${base}-${n++}`;
	taken.add(id);
	return id;
}

export function mergeIntoCatalogue(
	confirmed: ConfirmedImport,
	base: PlannerCatalogue,
): { catalogue: PlannerCatalogue; report: MergeReport } {
	// Deep copy: nothing in here may mutate the catalogue it was handed, which
	// is the live published one in the caller.
	const families: Family[] = JSON.parse(JSON.stringify(base.families));
	const takenIds = new Set(families.map((family) => family.id));
	const report: MergeReport = {
		newFamilies: [],
		newSizes: [],
		newFinishes: [],
		learnedGeometry: [],
		unchanged: [],
	};

	/** family id → the room its module asked for, for the curation step below. */
	const pinnedRooms = new Map<string, string>();
	/** Families this merge created. Only these are placed into rooms; see the
	 * curation step for why touching the others is destructive. */
	const addedFamilyIds = new Set<string>();
	const pin = (module: ConfirmedModule, familyId: string) => {
		if (module.roomId) pinnedRooms.set(familyId, module.roomId);
	};

	for (const module of confirmed.modules) {
		const existing = families.find((family) => matchesFamily(module, family));

		if (existing) {
			pin(module, existing.id);
			// A family that has never been told what it holds learns it from the
			// first design that matches it — otherwise a seeded family like
			// `base-cabinet` keeps rendering the one-shelf default forever, which
			// is exactly what made an uploaded cabinet look nothing like its
			// drawing. One that already has a fit-out is left alone: a human may
			// have corrected it in the editor, and the same rule protects prices.
			if (!existing.geometry) {
				existing.geometry = module.geometry;
				report.learnedGeometry.push(existing.label);
			}
			if (existing.sizes.some((size) => size.widthMm === module.widthMm)) {
				// Already on the ladder. Leave the price alone — it may be a number
				// the client agreed months ago.
				report.unchanged.push(`${existing.label} ${module.widthMm}mm`);
				continue;
			}
			existing.sizes.push({
				widthMm: module.widthMm,
				priceRm: module.priceRm ?? 0,
			});
			existing.sizes.sort((a, b) => a.widthMm - b.widthMm);
			report.newSizes.push(`${existing.label}: +${module.widthMm}mm`);
			continue;
		}

		const label = stripWidth(module.label) || `${module.kind} cabinet`;
		const sizes: SizeOption[] = [
			{ widthMm: module.widthMm, priceRm: module.priceRm ?? 0 },
		];
		const id = uniqueId(slugify(label) || module.kind, takenIds);
		pin(module, id);
		addedFamilyIds.add(id);
		families.push({
			id,
			label,
			kind: module.kind,
			depthMm: module.depthMm,
			heightMm: module.heightMm,
			floorHeightMm: module.floorHeightMm,
			sizes,
			hasWorktop: module.kind === "base",
			drawers: module.geometry.drawers,
			geometry: module.geometry,
			note:
				module.priceRm === undefined
					? "Imported from a design file — price not yet set."
					: "Imported from a design file.",
		});
		report.newFamilies.push(label);
	}

	// Finishes union by slug. An existing finish keeps its colour: someone
	// picked that hex on purpose and an import only ever guesses `#cccccc`.
	const finishes: Finish[] = JSON.parse(JSON.stringify(base.finishes));
	const finishIds = new Set(finishes.map((finish) => finish.id));
	confirmed.finishes.forEach((finish, i) => {
		const id = slugify(finish.label) || `finish-${i + 1}`;
		if (finishIds.has(id)) return;
		finishIds.add(id);
		finishes.push({ id, label: finish.label, hex: finish.hex });
		report.newFinishes.push(finish.label);
	});

	// Where a newly created family shows up.
	//
	// **Only families this merge added are placed.** An earlier version
	// re-derived every room's whole list by kind, which silently rewrote
	// curation nobody asked it to touch: because the living room carries a
	// `base` and a `tall`, one unrelated import handed it the wardrobe, the shoe
	// cabinet and the shoe bench. Existing membership is now carried through
	// untouched — this can only ever add.
	//
	// A module that named its own room goes into that room and no other.
	// Without a room — which is every mesh import, since a geometry export knows
	// nothing about rooms — it falls back to "every room that already carries
	// this kind", so the family is reachable rather than orphaned. Deciding
	// which cabinet really belongs in a bedroom is a merchandising call, and the
	// reviewer makes it in the catalogue editor.
	const roomIds = new Set<string>(base.roomTypes.map((room) => room.id));
	const kindOfId = new Map(families.map((family) => [family.id, family.kind]));
	const roomTypes = base.roomTypes.map((room) => {
		const kinds = new Set(room.familyIds.map((id) => kindOfId.get(id)));
		const added = [...addedFamilyIds].filter((id) => {
			if (room.familyIds.includes(id)) return false;
			const pinnedTo = pinnedRooms.get(id);
			if (pinnedTo !== undefined && roomIds.has(pinnedTo)) {
				return pinnedTo === room.id;
			}
			return kinds.has(kindOfId.get(id));
		});
		return { ...room, familyIds: [...room.familyIds, ...added] };
	});

	const next: PlannerCatalogue = {
		...base,
		families,
		finishes,
		roomTypes,
		// A catalogue with no `construction` block of its own is not a catalogue
		// with no construction: the planner falls back to the seed `CONSTRUCTION`
		// when the field is absent, and published catalogues today are exactly
		// that case. This used to fabricate its own defaults here, and they had
		// drifted from the seed on three of four fields — so merging anything
		// into a live catalogue quietly moved board thickness 16→18, worktop
		// 40→30, and the two-leaf threshold 650→600, which alone changes how
		// many doors a 600mm cabinet is drawn with.
		//
		// Only the two values an import actually measures are overridden, and
		// only when it measured them.
		construction: {
			...(base.construction ?? CONSTRUCTION),
			...(confirmed.panelThicknessMm
				? { panelThicknessMm: confirmed.panelThicknessMm }
				: {}),
			...(confirmed.plinthHeightMm
				? { plinthHeightMm: confirmed.plinthHeightMm }
				: {}),
		},
	};

	// Parse, not just validate: a catalogue that cannot round-trip its own
	// schema must never reach the database, where the planner would read it
	// back and hand a customer a broken price.
	return { catalogue: plannerCatalogueSchema.parse(next), report };
}

/** One line per change, for the confirm page and the version note. */
export function describeMerge(report: MergeReport): string[] {
	const lines: string[] = [];
	for (const label of report.newFamilies) lines.push(`New cabinet: ${label}`);
	for (const size of report.newSizes) lines.push(`New size — ${size}`);
	for (const finish of report.newFinishes) lines.push(`New finish: ${finish}`);
	for (const label of report.learnedGeometry) {
		lines.push(`${label}: recorded what it holds, from the design`);
	}
	if (report.unchanged.length) {
		lines.push(
			`${report.unchanged.length} already in the catalogue, left untouched`,
		);
	}
	return lines.length ? lines : ["No changes — everything was already here."];
}
