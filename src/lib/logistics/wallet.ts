/**
 * What Lalamove's wallet event tells us, read defensively.
 *
 * Lalamove documents that `WALLET_BALANCE_CHANGED` exists and never publishes
 * its body, so this reads the field names their own wording implies and gives
 * up rather than guessing. Whatever it returns, the caller stores the raw
 * payload beside it — the first real event is what settles the shape.
 *
 * Isomorphic: the admin screen renders the reading, so nothing server-only
 * belongs here.
 */

export type WalletReading = {
	amount: number;
	/** Null when the payload did not say; Lalamove MY bills in MYR. */
	currency: string | null;
};

/** Below this, the screen starts warning. A guess until the client says. */
export const LOW_WALLET_RM = 150;

function num(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value !== "string" || value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export function readWalletPayload(data: unknown): WalletReading | null {
	if (!data || typeof data !== "object") return null;
	const root = data as Record<string, unknown>;
	const wallet =
		root.wallet && typeof root.wallet === "object"
			? (root.wallet as Record<string, unknown>)
			: root;

	const amount = num(wallet.balance) ?? num(wallet.amount);
	if (amount === null) return null;

	const currency = wallet.currency;
	return {
		amount,
		currency: typeof currency === "string" && currency !== "" ? currency : null,
	};
}

/** Null means nothing has ever been reported, which is not the same as empty. */
export function isLowBalance(amount: number | null): boolean {
	return amount !== null && amount < LOW_WALLET_RM;
}
