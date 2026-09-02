"use client";

import { createContext, useContext } from "react";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";

/**
 * The published catalogue, handed down instead of installed into a module
 * global.
 *
 * It replaced `setActivePlannerCatalogue`, which swapped a mutable palette in
 * `catalogue.ts` that every consumer read directly. That made three bugs
 * possible at once — a stale door-price copy, a global mutated during React's
 * render phase, and a server-rendered starter layout priced against a
 * catalogue it was not built from — because "which catalogue is live" was
 * ambient rather than passed. Here it is a value with one owner.
 */
const CatalogueContext = createContext<PlannerCatalogue | null>(null);

export function CatalogueProvider({
	catalogue,
	children,
}: {
	catalogue: PlannerCatalogue;
	children: React.ReactNode;
}) {
	return (
		<CatalogueContext.Provider value={catalogue}>
			{children}
		</CatalogueContext.Provider>
	);
}

/** Throws rather than falling back to the seed: a component rendering the
 * bundled fixtures because someone forgot a provider is exactly the silent
 * wrong-price failure this context exists to make impossible. */
export function useCatalogue(): PlannerCatalogue {
	const catalogue = useContext(CatalogueContext);
	if (!catalogue) {
		throw new Error("useCatalogue outside a CatalogueProvider");
	}
	return catalogue;
}
