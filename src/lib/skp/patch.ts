import type { CatalogueDraft } from "./extract";

/**
 * Renders a draft as TypeScript for a human to paste into
 * `lib/wardrobe/catalogue.ts`. It deliberately stops at the point where money
 * starts: dimensions come from the client's own file and can be trusted, rates
 * cannot be derived from geometry and are left as `0` with a TODO, so nobody
 * can mistake an extracted number for an agreed price.
 */

const quote = (value: string) => JSON.stringify(value);

export function toCataloguePatch(
	draft: CatalogueDraft,
	sourceName = "a Mozaik .skp export",
): string {
	const lines: string[] = [];

	lines.push(
		`// GENERATED DRAFT — extracted from ${sourceName}.`,
		`// SketchUp ${draft.sourceVersion}. Dimensions in millimetres.`,
		"//",
		"// Review before committing. Rates are NOT in the source file and are",
		"// left at 0 — fill them from the client's price list.",
	);
	for (const warning of draft.warnings) lines.push(`// Note: ${warning}`);
	lines.push("");

	lines.push(
		`export const PANEL_THICKNESS_MM = ${draft.panelThicknessMm};`,
		"",
	);

	lines.push("export const MODULES = [");
	for (const module of draft.modules) {
		lines.push("\t{");
		lines.push(`\t\tname: ${quote(module.name)},`);
		lines.push(`\t\twidthMm: ${module.widthMm},`);
		lines.push(`\t\tdepthMm: ${module.depthMm},`);
		lines.push(`\t\theightMm: ${module.heightMm},`);
		lines.push(`\t\tfloorHeightMm: ${module.floorHeightMm},`);
		lines.push(`\t\t// seen ${module.count}× in the source job`);
		lines.push("\t\tparts: [");
		for (const part of module.parts) {
			lines.push(
				`\t\t\t{ name: ${quote(part.name)}, count: ${part.count}, sizeMm: [${part.sizeMm.join(", ")}] },`,
			);
		}
		lines.push("\t\t],");
		lines.push("\t},");
	}
	lines.push("] as const;", "");

	lines.push("export const FINISHES = {");
	for (const finish of draft.finishes) {
		lines.push(`\t${quote(finish.id)}: {`);
		lines.push(`\t\tlabel: ${quote(finish.label)},`);
		lines.push(`\t\tswatch: ${quote(finish.hex)},`);
		lines.push(
			"\t\tsurchargeRmPerFt: 0, // TODO: from the client's price list",
		);
		if (finish.texture) lines.push(`\t\t// source texture: ${finish.texture}`);
		lines.push("\t},");
	}
	lines.push("} as const;", "");

	lines.push("export const HARDWARE = {");
	for (const item of draft.hardware) {
		lines.push(
			`\t${quote(item.name)}: { count: ${item.count}, rateRm: 0 }, // TODO: rate`,
		);
	}
	lines.push("} as const;", "");

	return lines.join("\n");
}
