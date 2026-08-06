import type { FinishId } from "@/lib/wardrobe/schema";

export const GRAIN_TEXTURE_URL = "/textures/grain-1k.png";

/**
 * Rendering-only concern: the single greyscale grain map is tinted by these
 * colours rather than shipping one PBR set per finish.
 */
export const FINISH_APPEARANCE: Record<
	FinishId,
	{ color: string; roughness: number }
> = {
	"laminate-standard": { color: "#d8cfc2", roughness: 0.75 },
	"laminate-premium": { color: "#8d6f52", roughness: 0.55 },
	veneer: { color: "#5b3d28", roughness: 0.45 },
};

export const CARCASS_COLOR = "#e6e0d6";
export const RAIL_COLOR = "#9aa0a6";
