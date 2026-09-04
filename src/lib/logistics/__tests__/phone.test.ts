import { describe, expect, it } from "vitest";
import { toE164 } from "../phone";

describe("toE164", () => {
	it("turns a local mobile number into +60", () => {
		expect(toE164("012-345 6789")).toBe("+60123456789");
	});

	it("keeps a number that already carries the country code", () => {
		expect(toE164("+60 12 345 6789")).toBe("+60123456789");
		expect(toE164("60123456789")).toBe("+60123456789");
	});

	it("strips the punctuation an admin types", () => {
		expect(toE164("(012) 345-6789")).toBe("+60123456789");
	});

	it("keeps a foreign number as given", () => {
		expect(toE164("+6591234567")).toBe("+6591234567");
	});

	it("reads the workshop landline", () => {
		expect(toE164("03-1234 5678")).toBe("+60312345678");
	});

	it("returns null for something that is not a number", () => {
		expect(toE164("call the office")).toBeNull();
		expect(toE164("")).toBeNull();
		expect(toE164("123")).toBeNull();
	});
});
