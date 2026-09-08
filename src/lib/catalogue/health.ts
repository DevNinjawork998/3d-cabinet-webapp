import { doorPriceRmIn } from "@/lib/planner/catalogue";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";

/**
 * What is wrong with a catalogue, as data the review screen can render.
 *
 * Both answers used to be invisible. A rung priced at nothing is
 * schema-valid — `priceRm` has no positive constraint, deliberately, because
 * a free rung is a thing a maker could genuinely offer — so the only thing
 * standing between "the merge gave this size no price" and a customer seeing
 * RM 0 was somebody noticing. And a family in no room's `familyIds` is
 * unreachable from the planner while looking perfectly healthy in the editor,
 * which is how `Testing123` has survived in the live catalogue.
 *
 * Pure, and separate from `diff.ts`: that one answers "what changed against
 * live", this one answers "what is wrong regardless of what changed".
 */

export type PriceBlocker = {
	familyId: string;
	familyLabel: string;
	widthMm: number;
	/** Where this rung sits in the catalogue, so a caller edits the rung that
	 * is actually blocked. `widthMm` is not unique within a family — nothing in
	 * the schema makes it so — and searching by it silently edits the wrong one. */
	familyIndex: number;
	sizeIndex: number;
	/** The design drawing this rung, if any — lets the review row say where
	 * the unpriced size came from. */
	meshDesignId?: string;
};

/**
 * Every rung that must not reach a customer at the price it carries.
 *
 * Families no room offers are skipped. The publish gate is catalogue-wide, so
 * without this an RM 0 rung in a *retired* family blocks every publish — and
 * unticking every room is this editor's own retire path, with `Testing123`
 * already sitting in exactly that state. A family no customer can reach cannot
 * show a customer a wrong price, so it has no business holding the catalogue
 * shut. Re-tick a room and its unpriced rungs block again, which is correct.
 */
export function blockersOf(catalogue: PlannerCatalogue): PriceBlocker[] {
	const stranded = new Set(strandedFamilyIds(catalogue));
	const blockers: PriceBlocker[] = [];
	catalogue.families.forEach((family, familyIndex) => {
		if (stranded.has(family.id)) return;
		family.sizes.forEach((size, sizeIndex) => {
			if (size.priceRm > 0) return;
			blockers.push({
				familyId: family.id,
				familyLabel: family.label,
				widthMm: size.widthMm,
				familyIndex,
				sizeIndex,
				meshDesignId: size.meshDesignId,
			});
		});
	});
	return blockers;
}

/**
 * Families no room offers.
 *
 * `roomTypes[].familyIds` is the whole of a family's reachability: the palette
 * is built from it, so a family absent from every room exists only in the
 * document. Deriving this rather than storing a flag keeps one source of
 * truth — and makes "untick every room" a working retire path.
 */
export function strandedFamilyIds(catalogue: PlannerCatalogue): string[] {
	const offered = new Set(
		catalogue.roomTypes.flatMap((room) => room.familyIds),
	);
	return catalogue.families
		.filter((family) => !offered.has(family.id))
		.map((family) => family.id);
}

export type DoorBlocker = {
	doorStyleId: string;
	doorStyleLabel: string;
	widthMm: number;
};

/**
 * Every door style × offered width that would charge the customer nothing.
 *
 * `doorPriceRmIn` resolves an exact width, else the next rung of the door
 * ladder, else falls through to zero — and an unknown style id returns zero
 * outright. Those fallbacks are right at runtime: a throw would take the
 * planner down for a customer mid-design, and a zero at least renders. But it
 * is the same silent RM 0 the carcass gate already closes, one field over, so
 * it belongs in front of the same publish button. The fallbacks stay; the gate
 * is what stops a zero being published.
 *
 * Only widths a family actually offers count. The door ladder may carry rungs
 * nothing is manufactured at, and a door nobody can buy is not a problem to
 * solve. Stranded families are skipped for the same reason `blockersOf` skips
 * them.
 */
export function doorBlockersOf(catalogue: PlannerCatalogue): DoorBlocker[] {
	const stranded = new Set(strandedFamilyIds(catalogue));
	const widths = new Set<number>();
	for (const family of catalogue.families) {
		if (stranded.has(family.id)) continue;
		for (const size of family.sizes) widths.add(size.widthMm);
	}
	const offered = [...widths].sort((a, b) => a - b);

	const blockers: DoorBlocker[] = [];
	for (const style of catalogue.doorStyles) {
		for (const widthMm of offered) {
			if (doorPriceRmIn(catalogue, style.id, widthMm) > 0) continue;
			blockers.push({
				doorStyleId: style.id,
				doorStyleLabel: style.label,
				widthMm,
			});
		}
	}
	return blockers;
}
