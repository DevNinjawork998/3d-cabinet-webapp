import "server-only";
import type { Dictionary } from "./en";
import type { Locale } from "./locales";

/**
 * The dictionary for a locale, loaded on the server only.
 *
 * Dynamic imports so a request for `/ms` never parses the other two. Server
 * components await this directly and pay nothing on the wire — only the
 * rendered HTML reaches the browser. The planner's client components get it
 * as a prop through `CopyProvider`, because `next/root-params` does not reach
 * across the client boundary.
 */
const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
	en: () => import("./en").then((m) => m.en),
	zh: () => import("./zh").then((m) => m.zh),
	ms: () => import("./ms").then((m) => m.ms),
};

export const getDictionary = (locale: Locale): Promise<Dictionary> =>
	dictionaries[locale]();
