import { readArchive } from "./archive";
import { type CatalogueDraft, extractCatalogue } from "./extract";
import { normalise } from "./normalise";
import { readObj } from "./objRead";
import { boundsOf, classify } from "./roles";
import { groupModules } from "./strategies";

/**
 * The whole intake path in one call: zipped export folder in, draft catalogue
 * out. Runs identically in the browser (for the import page's instant preview)
 * and on the server (which is the only copy that can ever become a catalogue).
 * Pure — no React, no three.js, no I/O.
 *
 * The stages are deliberately separate and each one has a fallback, because
 * every design that arrives from here on is a file nobody has seen:
 *
 *   read      → what the file literally says
 *   normalise → millimetres and an up-axis, inferred not assumed
 *   classify  → what each panel is, by name or by shape
 *   group     → which cabinet each panel belongs to
 *   extract   → the draft a human confirms
 */
export function readMeshArchive(bytes: Uint8Array): { draft: CatalogueDraft } {
	const archive = readArchive(bytes);
	const obj = readObj(archive.objText);
	const { parts, panelThicknessMm, notes } = normalise(obj.parts);

	const classified = classify(parts, boundsOf(parts, panelThicknessMm));
	const grouping = groupModules(classified, panelThicknessMm);

	return {
		draft: extractCatalogue({
			sourceVersion: obj.version,
			grouping,
			imageNames: archive.imageNames,
			droppedCount: obj.droppedCount,
			notes,
		}),
	};
}
