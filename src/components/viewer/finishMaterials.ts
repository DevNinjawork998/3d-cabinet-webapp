import { FINISHES } from "@/lib/wardrobe/catalogue";
import type { FinishId } from "@/lib/wardrobe/schema";

export const GRAIN_TEXTURE_URL = "/textures/grain-1k.png";

/**
 * Rendering-only concern: the single greyscale grain map is tinted by the
 * catalogue's swatch colour rather than shipping one PBR set per finish.
 * Only roughness lives here — the colour would otherwise be a second copy of
 * the catalogue and the two would drift.
 */
const ROUGHNESS: Record<"Laminate" | "Veneer", number> = {
	Laminate: 0.7,
	Veneer: 0.45,
};

export function finishAppearance(id: FinishId) {
	const finish = FINISHES[id];
	return { color: finish.swatch, roughness: ROUGHNESS[finish.group] };
}

export const CARCASS_COLOR = "#e6e0d6";
export const RAIL_COLOR = "#9aa0a6";
