"use client";

import { createContext, useContext, useMemo } from "react";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";
import { type PlannerEngine, plannerEngine } from "@/lib/planner/layout";

/**
 * The published catalogue, handed down instead of installed into a module
 * global — and the engine built from it, so every consumer shares one
 * identity and `useMemo`/`useCallback` deps downstream stay honest.
 *
 * It replaced `setActivePlannerCatalogue`, which swapped a mutable palette in
 * `catalogue.ts` that every consumer read directly. That made three bugs
 * possible at once — a stale door-price copy, a global mutated during React's
 * render phase, and a server-rendered starter layout priced against a
 * catalogue it was not built from — because "which catalogue is live" was
 * ambient rather than passed. Here it is a value with one owner.
 */
type CatalogueValue = { catalogue: PlannerCatalogue; engine: PlannerEngine };

const CatalogueContext = createContext<CatalogueValue | null>(null);

export function CatalogueProvider({
	catalogue,
	children,
}: {
	catalogue: PlannerCatalogue;
	children: React.ReactNode;
}) {
	// One engine per catalogue, not one per consumer: the closures it returns
	// end up in hook dependency arrays downstream.
	const value = useMemo(
		() => ({ catalogue, engine: plannerEngine(catalogue) }),
		[catalogue],
	);
	return (
		<CatalogueContext.Provider value={value}>
			{children}
		</CatalogueContext.Provider>
	);
}

/** Throws rather than falling back to the seed: a component rendering the
 * bundled fixtures because someone forgot a provider is exactly the silent
 * wrong-price failure this context exists to make impossible. */
function useCatalogueValue(): CatalogueValue {
	const value = useContext(CatalogueContext);
	if (!value) throw new Error("useCatalogue outside a CatalogueProvider");
	return value;
}

export const useCatalogue = (): PlannerCatalogue =>
	useCatalogueValue().catalogue;
export const useEngine = (): PlannerEngine => useCatalogueValue().engine;
