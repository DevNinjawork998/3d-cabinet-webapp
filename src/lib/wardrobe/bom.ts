import type { DesignDocument } from "./schema";

export type BomPart = { sku: string; description: string; quantity: number };
export type Bom = { parts: BomPart[] };

/** Phase 4 — cutting list generation. Not implemented. */
export function computeBom(_design: DesignDocument): Bom {
	throw new Error("computeBom is not implemented — Phase 4");
}
