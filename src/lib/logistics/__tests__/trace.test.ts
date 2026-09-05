import { afterEach, describe, expect, it, vi } from "vitest";
import { trace } from "../trace";

const spy = () => vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
	vi.restoreAllMocks();
	process.env.LOGISTICS_DEBUG = undefined;
});

describe("trace", () => {
	it("prints nothing unless the flag is set", () => {
		const log = spy();
		process.env.LOGISTICS_DEBUG = "";
		trace("request", {
			url: "https://rest.sandbox.lalamove.com/v3/quotations",
		});
		expect(log).not.toHaveBeenCalled();
	});

	it("prints the scope and the payload when it is", () => {
		const log = spy();
		process.env.LOGISTICS_DEBUG = "1";
		trace("request", { carrierId: "lalamove", status: 422 });
		expect(log).toHaveBeenCalledWith(
			"[logistics] request",
			'{"carrierId":"lalamove","status":422}',
		);
	});

	it("never prints a credential, however it is nested", () => {
		const log = spy();
		process.env.LOGISTICS_DEBUG = "1";
		trace("request", {
			headers: { Authorization: "hmac pk_test_abc:123:deadbeef", Market: "MY" },
		});
		const printed = String(log.mock.calls[0]?.[1]);
		expect(printed).not.toContain("deadbeef");
		expect(printed).toContain('"Authorization":"[redacted]"');
		// The rest of the header block still has to be readable — redaction that
		// swallowed the whole object would cost the log its point.
		expect(printed).toContain('"Market":"MY"');
	});

	it("truncates a reply too long to scroll past, and says by how much", () => {
		const log = spy();
		process.env.LOGISTICS_DEBUG = "1";
		trace("response", { body: "x".repeat(2050) });
		expect(String(log.mock.calls[0]?.[1])).toContain("…(+50 more)");
	});

	it("prints an Error as its message rather than an empty object", () => {
		const log = spy();
		process.env.LOGISTICS_DEBUG = "1";
		trace("failed", { error: new TypeError("fetch failed") });
		expect(String(log.mock.calls[0]?.[1])).toContain("TypeError: fetch failed");
	});
});
