import { describe, expect, it } from "vitest";
import { messageFor } from "../errors";

describe("messageFor", () => {
	it("turns a known code into an instruction", () => {
		expect(messageFor("already_booked", "fallback")).toMatch(/carrier/i);
	});

	it("never shows a raw code to an admin", () => {
		expect(messageFor("invalid_body", "fallback")).not.toContain(
			"invalid_body",
		);
	});

	it("falls back when the server said something new", () => {
		expect(messageFor("teapot", "Could not save this delivery")).toBe(
			"Could not save this delivery",
		);
	});

	it("falls back when there was no body at all", () => {
		expect(messageFor(undefined, "Could not save this delivery")).toBe(
			"Could not save this delivery",
		);
	});

	it("falls back on a prototype-chain member instead of returning a function", () => {
		expect(messageFor("toString", "Could not save this delivery")).toBe(
			"Could not save this delivery",
		);
	});

	it("passes a refused booking through with the carrier's own words", () => {
		expect(messageFor("carrier_refused", "Booking failed")).toBe(
			"The partner refused this booking.",
		);
	});
});
