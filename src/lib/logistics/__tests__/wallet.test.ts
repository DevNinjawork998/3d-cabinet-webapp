import { describe, expect, it } from "vitest";
import { isLowBalance, LOW_WALLET_RM, readWalletPayload } from "../wallet";

describe("readWalletPayload", () => {
	it("reads a nested wallet object", () => {
		expect(
			readWalletPayload({ wallet: { balance: "125.40", currency: "MYR" } }),
		).toEqual({ amount: 125.4, currency: "MYR" });
	});

	it("reads a flat balance, because the shape is undocumented", () => {
		expect(readWalletPayload({ balance: 88, currency: "MYR" })).toEqual({
			amount: 88,
			currency: "MYR",
		});
	});

	it("reads an amount field, which is the other name they use", () => {
		expect(readWalletPayload({ wallet: { amount: "12.5" } })).toEqual({
			amount: 12.5,
			currency: null,
		});
	});

	it("is null for an order payload, so a status event is not read as money", () => {
		expect(
			readWalletPayload({ order: { orderId: "ORD1", status: "PICKED_UP" } }),
		).toBeNull();
	});

	it("is null when the number is unreadable rather than guessing zero", () => {
		// A wallet wrongly shown as empty would stop an admin booking a lorry
		// they could afford.
		expect(readWalletPayload({ wallet: { balance: "" } })).toBeNull();
		expect(readWalletPayload({ wallet: { balance: "n/a" } })).toBeNull();
	});
});

describe("isLowBalance", () => {
	it("is false when nothing has ever been reported", () => {
		expect(isLowBalance(null)).toBe(false);
	});

	it("warns below the threshold and not at it", () => {
		expect(isLowBalance(LOW_WALLET_RM - 0.01)).toBe(true);
		expect(isLowBalance(LOW_WALLET_RM)).toBe(false);
	});
});
