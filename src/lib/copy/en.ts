/**
 * The English dictionary, and the shape every other locale is held to.
 *
 * Values are plain strings — never functions. The dictionary is handed from a
 * server component into `CopyProvider`, so it crosses the RSC boundary and has
 * to serialise. Strings needing a number carry a `{token}` and go through
 * `fill`.
 */
export const en = {
	meta: {
		title: "Infinite Cabinet · Design your kitchen in 3D",
		description:
			"Drop real Infinite Cabinet units onto a model of your own room, see it from every angle, and get an instant price. No showroom visit required.",
	},
	common: {
		brand: "Infinite Cabinet",
		back: "Back",
		next: "Next",
		close: "Close",
		language: "Language",
	},
} as const;

/**
 * Every leaf of `en`'s shape must be a string, at whatever depth it sits.
 * Groups nest further than two levels (e.g. `landing.hero.title`), so this
 * recurses rather than fixing a depth.
 */
type Leaves<T> = {
	readonly [K in keyof T]: T[K] extends string ? string : Leaves<T[K]>;
};

export type Dictionary = Leaves<typeof en>;
