"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { htmlLang, isLocale, LOCALES, type Locale } from "@/lib/copy/locales";

/**
 * What each language calls itself — never the current locale's word for it.
 * A reader looking for Chinese scans for 中文, not for "Chinese".
 *
 * Deliberately not in the dictionary: every other string there is a
 * *translation*, and these three are the one thing that stays identical no
 * matter which locale is reading them. Putting them in `en`/`zh`/`ms` would
 * mean either repeating the same three values three times (nothing for the
 * "no value left untranslated" gate to check) or fighting that gate over
 * values that are correct precisely because they don't change.
 */
const ENDONYM: Record<Locale, string> = {
	en: "English",
	zh: "中文",
	ms: "Bahasa Malaysia",
};

/**
 * The same three, short enough to sit inside a nav bar. `zh` keeps its
 * endonym: 中文 is already two characters, and "ZH" is a code no reader of
 * Chinese scans for.
 */
const SHORT: Record<Locale, string> = { en: "EN", zh: "中文", ms: "MS" };

export function LanguageSwitcher({
	current,
	label,
	inline = false,
}: {
	current: Locale;
	/** The nav's `aria-label`, in the current locale's own word for "Language". */
	label: string;
	/**
	 * Sit inside a page's own menu bar as short codes, rather than being the
	 * strip above it. The landing page's bar carries its own, so the standalone
	 * strip hides itself there instead of stacking two language rows.
	 */
	inline?: boolean;
}) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const query = searchParams.toString();

	// Swap the locale segment and keep the reader on the same page — `usePathname`
	// drops the query string, so it's carried back on separately rather than
	// sending a reader on /en/planner?room=living to the /zh homepage.
	const [, first, ...rest] = pathname.split("/");
	const tail = (isLocale(first) ? rest : [first, ...rest]).join("/");
	const suffix = query ? `?${query}` : "";

	// The landing page renders this inline in its own menu bar, so the strip
	// has nothing to add there.
	if (!inline && !tail) return null;

	return (
		<nav
			aria-label={label}
			className={
				inline
					? "flex shrink-0 items-center gap-2 text-[12px]"
					: "flex h-9 shrink-0 items-center justify-end gap-4 border-neutral-200 border-b bg-white px-5 text-[12px]"
			}
		>
			{LOCALES.map((locale) => (
				<Link
					key={locale}
					href={`/${locale}${tail ? `/${tail}` : ""}${suffix}`}
					hrefLang={htmlLang(locale)}
					aria-label={inline ? ENDONYM[locale] : undefined}
					aria-current={locale === current ? "true" : undefined}
					className={`${inline ? "inline-flex min-h-9 items-center px-1" : ""} ${
						locale === current
							? "font-semibold text-neutral-900"
							: "text-neutral-400 transition-colors hover:text-neutral-600"
					}`}
				>
					{inline ? SHORT[locale] : ENDONYM[locale]}
				</Link>
			))}
		</nav>
	);
}
