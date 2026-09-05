import type { Dictionary } from "@/lib/copy/en";
import { fill } from "@/lib/copy/fill";
import type { PriceLine } from "@/lib/planner/pricing";

/**
 * Translates one price-breakdown line for display.
 *
 * `pricing.ts` is a framework-free engine and must not import the copy
 * layer, so it emits a stable `id` and a `{ key, vars }` detail rather than
 * English strings. This is the one place that turns those back into text,
 * shared by the studio sidebar and the quote screen so the two never drift.
 */
export function priceLineLabel(t: Dictionary, line: PriceLine): string {
	return t.planner.price.lines[line.id];
}

export function priceLineDetail(t: Dictionary, line: PriceLine): string {
	const template =
		t.planner.price.detail[
			line.detail.key as keyof typeof t.planner.price.detail
		];
	return template ? fill(template, line.detail.vars ?? {}) : "";
}
