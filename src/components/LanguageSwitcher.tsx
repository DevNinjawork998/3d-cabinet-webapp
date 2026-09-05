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

export function LanguageSwitcher({
	current,
	label,
}: {
	current: Locale;
	/** The nav's `aria-label`, in the current locale's own word for "Language". */
	label: string;
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

	return (
		<nav
			aria-label={label}
			className="flex h-9 shrink-0 items-center justify-end gap-4 border-neutral-200 border-b bg-white px-5 text-[12px]"
		>
			{LOCALES.map((locale) => (
				<Link
					key={locale}
					href={`/${locale}${tail ? `/${tail}` : ""}${suffix}`}
					hrefLang={htmlLang(locale)}
					aria-current={locale === current ? "true" : undefined}
					className={
						locale === current
							? "font-semibold text-neutral-900"
							: "text-neutral-400 transition-colors hover:text-neutral-600"
					}
				>
					{ENDONYM[locale]}
				</Link>
			))}
		</nav>
	);
}
