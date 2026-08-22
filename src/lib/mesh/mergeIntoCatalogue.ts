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

/** `Base 900 · 2 door` describes one rung; the family covers the whole ladder. */
const stripWidth = (label: string) =>
	label
		.replace(/\s*\d{3,4}\s*(·|-)?\s*/, " ")
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
		unchanged: [],
	};

	for (const module of confirmed.modules) {
		const existing = families.find((family) => matchesFamily(module, family));

		if (existing) {
			if (existing.sizes.some((size) => size.widthMm === module.widthMm)) {
				// Already on the ladder. Leave the price alone — it may be a number
				// the client agreed months ago.
				report.unchanged.push(`${existing.label} ${module.widthMm}mm`);
				continue;
			}
			existing.sizes.push({ widthMm: module.widthMm, priceRm: 0 });
			existing.sizes.sort((a, b) => a.widthMm - b.widthMm);
			report.newSizes.push(`${existing.label}: +${module.widthMm}mm`);
			continue;
		}

		const label = stripWidth(module.label) || `${module.kind} cabinet`;
		const sizes: SizeOption[] = [{ widthMm: module.widthMm, priceRm: 0 }];
		families.push({
			id: uniqueId(slugify(label) || module.kind, takenIds),
			label,
			kind: module.kind,
			depthMm: module.depthMm,
			heightMm: module.heightMm,
			floorHeightMm: module.floorHeightMm,
			sizes,
			hasWorktop: module.kind === "base",
			drawers: module.geometry.drawers,
			geometry: module.geometry,
			note: "Imported from a design file — price not yet set.",
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

	// Every room offers every family of a kind it already carried. Curating
	// which cabinet belongs in a bedroom is a merchandising decision, so the
	// reviewer does it in the catalogue editor; this only makes sure a new
	// family is reachable rather than orphaned.
	const kindsOf = (ids: string[]) =>
		new Set(
			ids
				.map((id) => families.find((family) => family.id === id)?.kind)
				.filter(Boolean),
		);
	const roomTypes = base.roomTypes.map((room) => {
		const kinds = kindsOf(room.familyIds);
		const familyIds = families
			.filter(
				(family) =>
					kinds.has(family.kind) || room.familyIds.includes(family.id),
			)
			.map((family) => family.id);
		return {
			...room,
			familyIds: familyIds.length ? familyIds : room.familyIds,
		};
	});

	const next: PlannerCatalogue = {
		...base,
		families,
		finishes,
		roomTypes,
		construction: {
			...(base.construction ?? {
				worktopThicknessMm: 30,
				doorLeavesThresholdMm: 600,
				panelThicknessMm: 18,
				plinthHeightMm: 100,
			}),
			panelThicknessMm: confirmed.panelThicknessMm || 18,
			plinthHeightMm: confirmed.plinthHeightMm,
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
	if (report.unchanged.length) {
		lines.push(
			`${report.unchanged.length} already in the catalogue, left untouched`,
		);
	}
	return lines.length ? lines : ["No changes — everything was already here."];
}
