import { z } from "zod";

/**
 * The tutorial vocabulary, in one place.
 *
 * The admin form, the API's payload schema and the public page's filters all
 * read these lists. They used to live inline in `app/tutorials/page.tsx`, which
 * was fine while the page was the only thing that knew about tutorials —
 * same reasoning as `siteImages.ts`: two lists kept in step by hand will drift,
 * and here the drift would be a tutorial the admin can file under a category
 * the public page cannot filter to.
 */

export const CATEGORIES = [
	{ id: "base", label: "Base cabinets" },
	{ id: "wall", label: "Wall cabinets" },
	{ id: "wardrobe", label: "Wardrobes" },
	{ id: "drawer", label: "Drawers" },
	{ id: "island", label: "Islands" },
] as const;

export const LEVELS = [
	{ id: "beginner", label: "Beginner" },
	{ id: "intermediate", label: "Intermediate" },
	{ id: "advanced", label: "Advanced" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type LevelId = (typeof LEVELS)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [
	CategoryId,
	...CategoryId[],
];
export const LEVEL_IDS = LEVELS.map((l) => l.id) as [LevelId, ...LevelId[]];

/** `{ base: "Base cabinets", beginner: "Beginner", … }` for rendering a chip. */
export const LABEL: Record<string, string> = Object.fromEntries(
	[...CATEGORIES, ...LEVELS].map((option) => [option.id, option.label]),
);

/**
 * What the public page needs to render one card. Deliberately not the Prisma
 * row: `muxUploadId`, `muxAssetId` and `uploadedBy` are admin bookkeeping and
 * have no business being serialised into a public page's props.
 */
export type PublicTutorial = {
	id: string;
	title: string;
	description: string;
	category: string;
	level: string;
	playbackId: string | null;
	durationSec: number | null;
};

/** The metadata half of the admin form — the video arrives separately. */
export const tutorialInputSchema = z.object({
	title: z.string().trim().min(1).max(200),
	// Optional on purpose: the design gates publishing on a video and a title
	// only, so a tutorial can go up before anyone writes the blurb.
	description: z.string().trim().max(1000).default(""),
	category: z.enum(CATEGORY_IDS),
	level: z.enum(LEVEL_IDS),
	sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const tutorialCreateSchema = tutorialInputSchema.extend({
	muxUploadId: z.string().trim().min(1).max(200),
});

export type TutorialInput = z.infer<typeof tutorialInputSchema>;

/** `487` → `"8 min"`. Rounds up, because a 30-second clip is not "0 min". */
export function durationLabel(seconds: number | null): string | null {
	if (seconds === null || seconds <= 0) return null;
	return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/**
 * Mux renders a poster frame from the playback id, so a card needs no separate
 * thumbnail upload and no image in Blob.
 */
export function posterUrl(playbackId: string, width = 640): string {
	return `https://image.mux.com/${playbackId}/thumbnail.webp?width=${width}&fit_mode=smartcrop`;
}
