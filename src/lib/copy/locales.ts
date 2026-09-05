/**
 * The locales this site serves, and how an incoming request is matched to one.
 *
 * Pure and framework-free so the proxy, the layout and the tests all share one
 * answer. Short codes because they sit in the URL: `/zh/planner` reads better
 * than `/zh-Hans/planner`, and `htmlLang` widens them where a real BCP-47 tag
 * is required.
 */

export const LOCALES = ["en", "zh", "ms"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const isLocale = (value: string): value is Locale =>
	(LOCALES as readonly string[]).includes(value);

/** `<html lang>` and `hreflang` want a real tag; the URL wants a short one.
 * Simplified Chinese and Malaysian Malay are what we actually publish. */
const HTML_LANG: Record<Locale, string> = {
	en: "en",
	zh: "zh-Hans",
	ms: "ms-MY",
};
export const htmlLang = (locale: Locale): string => HTML_LANG[locale];

/**
 * Pick a locale from an `Accept-Language` header.
 *
 * Hand-rolled rather than pulling `negotiator` and `@formatjs/intl-localematcher`:
 * two dependencies to choose between three fixed strings is not a trade worth
 * making. Matching is on the base language, so `zh-CN`, `zh-Hans` and `zh-TW`
 * all land on `zh` — a Traditional-script reader gets Simplified, which is the
 * right call for a Malaysian audience and beats falling back to English.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
	if (!header) return DEFAULT_LOCALE;

	const ranked = header
		.split(",")
		.map((part) => {
			const [tag, ...params] = part.trim().split(";");
			const weight = params
				.map((p) => p.trim())
				.find((p) => p.startsWith("q="));
			const q = weight ? Number.parseFloat(weight.slice(2)) : 1;
			return { tag: tag.trim().toLowerCase(), q };
		})
		// q=0 is the header's way of saying "not this one", so it must not match.
		.filter(
			(entry) => entry.tag !== "" && Number.isFinite(entry.q) && entry.q > 0,
		)
		.sort((a, b) => b.q - a.q);

	for (const { tag } of ranked) {
		const base = tag.split("-")[0];
		if (isLocale(base)) return base;
	}
	return DEFAULT_LOCALE;
}

/** Paths that belong to the app rather than to a reader: the admin surface,
 * every API route, Next's own assets, and anything with a file extension. */
const EXEMPT = /^\/(?:admin|api|_next)(?:\/|$)|\.[a-z0-9]+$/i;

/**
 * Whether this request should be sent to a locale-prefixed URL.
 *
 * The exemption list is the load-bearing half. `/admin` is gated by a
 * shared-secret cookie in this same proxy, and bouncing it through a locale
 * redirect would fight that gate — at best an extra hop, at worst a loop that
 * locks out all three internal users.
 */
export function needsLocaleRedirect(pathname: string): boolean {
	if (EXEMPT.test(pathname)) return false;
	const [, first] = pathname.split("/");
	return !isLocale(first);
}
