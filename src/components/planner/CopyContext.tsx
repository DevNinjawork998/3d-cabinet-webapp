"use client";

import { createContext, useContext, useMemo } from "react";
import type { Dictionary } from "@/lib/copy/en";
import type { Locale } from "@/lib/copy/locales";

/**
 * The active locale's strings, handed down rather than imported.
 *
 * Client components cannot read `next/root-params`, so the dictionary is
 * resolved on the server and passed in as a prop. It is a value with one
 * owner for the same reason the catalogue is — see `CatalogueContext.tsx`:
 * a mutable module-level palette caused three bugs at once, including a
 * global mutated during React's render phase. A locale dictionary has the
 * identical failure mode.
 */
type CopyValue = { copy: Dictionary; locale: Locale };

const CopyContext = createContext<CopyValue | null>(null);

export function CopyProvider({
	copy,
	locale,
	children,
}: {
	copy: Dictionary;
	locale: Locale;
	children: React.ReactNode;
}) {
	const value = useMemo(() => ({ copy, locale }), [copy, locale]);
	return <CopyContext.Provider value={value}>{children}</CopyContext.Provider>;
}

/** Throws rather than falling back to English: a component silently rendering
 * English inside a Chinese page is the failure this context exists to prevent. */
function useCopyValue(): CopyValue {
	const value = useContext(CopyContext);
	if (!value) throw new Error("useCopy outside a CopyProvider");
	return value;
}

export const useCopy = (): Dictionary => useCopyValue().copy;
export const useLocale = (): Locale => useCopyValue().locale;
