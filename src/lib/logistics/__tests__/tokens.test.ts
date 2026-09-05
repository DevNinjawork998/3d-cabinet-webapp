import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenReply } from "./fixtures/easyparcel";

/**
 * The one mocked module in this folder.
 *
 * `tokens.ts` is read-check-refresh-write around a single row, and the check is
 * the part worth testing: that a live token is returned without a call, that an
 * expiring one is refreshed and written back, and that a dead refresh token
 * reports itself as not configured rather than looping. A fake row is enough
 * for all three, and it keeps CI free of a database.
 *
 * `tx` lives inside the factory (not closed over from module scope) because
 * `vi.mock` factories are hoisted above the rest of the file — a `const tx`
 * declared below would work only by accident of import-time evaluation order.
 */
const row = {
	current: null as null | Record<string, unknown>,
};

vi.mock("@/lib/catalogue/db", () => {
	const tx = {
		$executeRaw: async () => 1,
		carrierToken: {
			findUnique: async () => row.current,
			update: async ({ data }: { data: Record<string, unknown> }) => {
				row.current = { ...(row.current ?? {}), ...data };
				return row.current;
			},
		},
	};

	return {
		prisma: {
			$transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
			carrierToken: {
				findUnique: async () => row.current,
				upsert: async ({
					create,
					update,
				}: {
					create: Record<string, unknown>;
					update: Record<string, unknown>;
				}) => {
					row.current = { ...(row.current ?? {}), ...(update ?? create) };
					return row.current;
				},
			},
		},
	};
});

const { accessTokenFor, exchangeCode, hasConnection } = await import(
	"../tokens"
);
const { CarrierNotConfigured } = await import("../types");

function stubToken() {
	const fetchMock = vi.fn(
		async () =>
			new Response(JSON.stringify(tokenReply), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

beforeEach(() => {
	vi.stubEnv("EASYPARCEL_CLIENT_ID", "cid");
	vi.stubEnv("EASYPARCEL_CLIENT_SECRET", "csecret");
	row.current = null;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("accessTokenFor", () => {
	it("returns a live token without calling EasyParcel", async () => {
		row.current = {
			carrierId: "easyparcel",
			accessToken: "still_good",
			refreshToken: "rt",
			accessTokenExpiresAt: hours(5),
			refreshTokenExpiresAt: hours(8000),
		};
		const fetchMock = stubToken();

		expect(await accessTokenFor("easyparcel")).toBe("still_good");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("refreshes an expiring token and writes the rotated pair back", async () => {
		row.current = {
			carrierId: "easyparcel",
			accessToken: "about_to_die",
			refreshToken: "rt_old",
			accessTokenExpiresAt: hours(0),
			refreshTokenExpiresAt: hours(8000),
		};
		const fetchMock = stubToken();

		expect(await accessTokenFor("easyparcel")).toBe("at_sandbox");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		// Rotation is the whole reason this lives in a row rather than an env var.
		expect(row.current.refreshToken).toBe("rt_sandbox");
	});

	it("reports not configured when nobody has connected an account", async () => {
		await expect(accessTokenFor("easyparcel")).rejects.toBeInstanceOf(
			CarrierNotConfigured,
		);
	});

	it("reports not configured when the refresh token has itself expired", async () => {
		row.current = {
			carrierId: "easyparcel",
			accessToken: "dead",
			refreshToken: "rt_dead",
			accessTokenExpiresAt: hours(-1),
			refreshTokenExpiresAt: hours(-1),
		};
		const fetchMock = stubToken();

		await expect(accessTokenFor("easyparcel")).rejects.toBeInstanceOf(
			CarrierNotConfigured,
		);
		// A year is up; retrying with a dead token would just fail slower.
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports not configured when the app credentials are absent", async () => {
		vi.stubEnv("EASYPARCEL_CLIENT_ID", "");
		await expect(accessTokenFor("easyparcel")).rejects.toBeInstanceOf(
			CarrierNotConfigured,
		);
	});
});

describe("exchangeCode", () => {
	it("stores the first token pair and who connected it", async () => {
		stubToken();
		await exchangeCode("auth-code", "admin");
		expect(row.current?.accessToken).toBe("at_sandbox");
		expect(row.current?.connectedBy).toBe("admin");
	});
});

describe("hasConnection", () => {
	it("is false with no row", async () => {
		expect(await hasConnection("easyparcel")).toBe(false);
	});

	it("is false once the refresh token has expired — it needs re-authorising", async () => {
		row.current = { refreshTokenExpiresAt: hours(-1) };
		expect(await hasConnection("easyparcel")).toBe(false);
	});

	it("is true while the refresh token is alive", async () => {
		row.current = { refreshTokenExpiresAt: hours(8000) };
		expect(await hasConnection("easyparcel")).toBe(true);
	});
});
