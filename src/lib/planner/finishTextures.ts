/**
 * Decor photographs shipped with the repo, keyed by finish id.
 *
 * A finish looks like real board only when the surface *is* real board, so
 * where we have the supplier's decor scan the planner uses it in place of the
 * generated grain. These are the boards Infinite Cabinet actually buys, which
 * is what makes the planner's swatch worth trusting.
 *
 * This is only the default. An admin upload to the `finish:<id>` site-image
 * slot wins, so the client can correct one of these without a deploy — see
 * `app/planner/page.tsx`, which layers the two.
 *
 * Keep them small. CLAUDE.md's rule is one grain texture shared across
 * finishes, and every file here is a deliberate exception to it: a photograph
 * per finish is exactly the per-finish asset that rule exists to limit, so add
 * one only for a finish whose look the generated grain genuinely cannot carry
 * — the woodgrains — and never for a solid colour.
 */
export const DEFAULT_FINISH_TEXTURES: Record<string, string> = {
	// Max World MW 13226 UW "Gnocchi Naturale Oak" — pale cream straight-grain.
	"rhone-oak": "/finishes/rhone-oak.jpg",
};
