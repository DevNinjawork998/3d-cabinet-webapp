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
 *
 * `calls.order` records what the mocked `tx` saw and in what sequence — the
 * one thing worth asserting about the advisory lock. Deleting the lock line
 * in `tokens.ts` entirely, or reading through `prisma` instead of `tx`, would
 * previously leave every test green: `$executeRaw` was an unasserted stub and
 * the outer `prisma` mock exposed the same `findUnique`. Recording the order
 * `tx`'s own methods are called in, and asserting on it, is what makes that
 * regression fail here.
 */
const row = {
	current: null as null | Record<string, unknown>,
};
const calls = {
	order: [] as string[],
};

vi.mock("@/lib/catalogue/db", () => {
	const upsert = async ({
		create,
		update,
	}: {
		create: Record<string, unknown>;
		update: Record<string, unknown>;
	}) => {
		calls.order.push("write");
		row.current = { ...(row.current ?? {}), ...(update ?? create) };
		return row.current;
	};

	const tx = {
		$executeRaw: async (
			strings: TemplateStringsArray,
			..._values: unknown[]
		) => {
			calls.order.push(`lock:${strings.join("")}`);
			return 1;
		},
		carrierToken: {
			findUnique: async () => {
				calls.order.push("read");
				return row.current;
			},
			update: async ({ data }: { data: Record<string, unknown> }) => {
				calls.order.push("write");
				row.current = { ...(row.current ?? {}), ...data };
				return row.current;
			},
			upsert,
		},
	};

	return {
		prisma: {
			$transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
			carrierToken: {
				findUnique: async () => row.current,
				upsert,
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
	calls.order = [];
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

	it("takes the advisory lock before reading the row", async () => {
		row.current = {
			carrierId: "easyparcel",
			accessToken: "still_good",
			refreshToken: "rt",
			accessTokenExpiresAt: hours(5),
			refreshTokenExpiresAt: hours(8000),
		};

		await accessTokenFor("easyparcel");

		expect(calls.order[0]).toMatch(/^lock:.*pg_advisory_xact_lock/);
		expect(calls.order).toContain("read");
		expect(calls.order.indexOf("read")).toBeGreaterThan(0);
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
