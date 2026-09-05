import { afterEach, describe, expect, it, vi } from "vitest";
import { CarrierHttpError, carrierFetch } from "../http";

function stubFetch(status = 200, body: unknown = { ok: true }) {
	const fetchMock = vi.fn(
		async (..._args: unknown[]) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("carrierFetch", () => {
	it("sends a string body untouched, so a signature matches", async () => {
		const fetchMock = stubFetch();
		const raw = '{"data":{"serviceType":"VAN"}}';

		await carrierFetch("https://example.test/x", {
			carrierId: "test",
			method: "POST",
			body: raw,
		});

		expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(raw);
	});

	it("still serialises an object body", async () => {
		const fetchMock = stubFetch();

		await carrierFetch("https://example.test/x", {
			carrierId: "test",
			method: "POST",
			body: { a: 1 },
		});

		expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe('{"a":1}');
	});

	it("throws CarrierHttpError with the body attached", async () => {
		stubFetch(422, { errors: [{ id: "ERR_INVALID_SERVICE_TYPE" }] });

		await expect(
			carrierFetch("https://example.test/x", { carrierId: "test" }),
		).rejects.toBeInstanceOf(CarrierHttpError);
	});

	it("puts the carrier's own words in the message, not just the status", async () => {
		// The whole point of the change: an admin reads `.message` on a
		// comparison row, and "test responded 422" told them nothing about which
		// field the carrier refused.
		stubFetch(422, { errors: [{ id: "ERR_INVALID_SERVICE_TYPE" }] });

		await expect(
			carrierFetch("https://example.test/x", { carrierId: "test" }),
		).rejects.toThrow(/ERR_INVALID_SERVICE_TYPE/);
	});

	it("treats a 2xx that is not JSON as a carrier failure, body and all", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () => new Response("<html>maintenance</html>", { status: 200 }),
			),
		);

		await expect(
			carrierFetch("https://example.test/x", { carrierId: "test" }),
		).rejects.toThrow(/maintenance/);
	});

	it("does not retry a call that is not marked idempotent", async () => {
		const fetchMock = stubFetch(500);

		await expect(
			carrierFetch("https://example.test/x", {
				carrierId: "test",
				method: "POST",
			}),
		).rejects.toBeInstanceOf(CarrierHttpError);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
