import { describe, expect, it } from "vitest";
import { needsLocaleRedirect } from "../locales";

describe("needsLocaleRedirect", () => {
	it("redirects a bare public path", () => {
		expect(needsLocaleRedirect("/")).toBe(true);
		expect(needsLocaleRedirect("/planner")).toBe(true);
		expect(needsLocaleRedirect("/tutorials")).toBe(true);
	});

	it("leaves a path that already carries a locale alone", () => {
		expect(needsLocaleRedirect("/en")).toBe(false);
		expect(needsLocaleRedirect("/zh/planner")).toBe(false);
		expect(needsLocaleRedirect("/ms")).toBe(false);
	});

	// The bug that would lock every admin out of the site.
	it("never touches admin or api", () => {
		expect(needsLocaleRedirect("/admin")).toBe(false);
		expect(needsLocaleRedirect("/admin/login")).toBe(false);
		expect(needsLocaleRedirect("/admin/catalogue")).toBe(false);
		expect(needsLocaleRedirect("/api/admin/login")).toBe(false);
		expect(needsLocaleRedirect("/api/cabinet-mesh/abc")).toBe(false);
	});

	it("never touches framework or static paths", () => {
		expect(needsLocaleRedirect("/_next/static/chunk.js")).toBe(false);
		expect(needsLocaleRedirect("/favicon.ico")).toBe(false);
		expect(needsLocaleRedirect("/grain.png")).toBe(false);
		expect(needsLocaleRedirect("/robots.txt")).toBe(false);
	});

	it("does not mistake a locale-prefixed word for a locale", () => {
		// "/english" starts with "en" but is not the `en` segment.
		expect(needsLocaleRedirect("/english")).toBe(true);
	});
});
