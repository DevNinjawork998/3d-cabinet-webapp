import { describe, expect, it } from "vitest";
import {
	DEFAULT_LOCALE,
	htmlLang,
	isLocale,
	LOCALES,
	negotiateLocale,
} from "../locales";

describe("isLocale", () => {
	it("accepts the three we serve and nothing else", () => {
		expect(LOCALES).toEqual(["en", "zh", "ms"]);
		expect(isLocale("zh")).toBe(true);
		expect(isLocale("de")).toBe(false);
		expect(isLocale("")).toBe(false);
	});
});

describe("negotiateLocale", () => {
	it("falls back to English with no header", () => {
		expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
		expect(negotiateLocale("")).toBe("en");
	});

	it("matches a region-tagged locale on its base language", () => {
		expect(negotiateLocale("zh-CN,zh;q=0.9")).toBe("zh");
		expect(negotiateLocale("ms-MY")).toBe("ms");
		expect(negotiateLocale("en-GB")).toBe("en");
	});

	it("honours q-weights rather than document order", () => {
		expect(negotiateLocale("en;q=0.3,zh;q=0.9")).toBe("zh");
	});

	it("skips languages we do not serve", () => {
		expect(negotiateLocale("de-DE,fr;q=0.8")).toBe("en");
		expect(negotiateLocale("de,ms;q=0.5")).toBe("ms");
	});

	it("ignores a q=0 language, which means 'not this one'", () => {
		expect(negotiateLocale("zh;q=0,en;q=0.5")).toBe("en");
	});
});

describe("htmlLang", () => {
	it("widens the URL code to a real BCP-47 tag", () => {
		expect(htmlLang("en")).toBe("en");
		expect(htmlLang("zh")).toBe("zh-Hans");
		expect(htmlLang("ms")).toBe("ms-MY");
	});
});
