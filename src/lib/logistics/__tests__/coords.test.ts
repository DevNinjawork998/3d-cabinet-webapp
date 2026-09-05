import { describe, expect, it } from "vitest";
import { parseCoords, pinState } from "../coords";

describe("parseCoords", () => {
	it("reads the bare pair a long-press copies", () => {
		expect(parseCoords("3.1509, 101.5931")).toEqual({
			ok: true,
			lat: 3.1509,
			lng: 101.5931,
		});
	});

	it("reads it without the space", () => {
		expect(parseCoords("3.1509,101.5931")).toMatchObject({ ok: true });
	});

	it("reads the pin out of a full Google Maps url", () => {
		expect(
			parseCoords("https://www.google.com/maps/@3.1509,101.5931,17z"),
		).toEqual({ ok: true, lat: 3.1509, lng: 101.5931 });
	});

	it("reads the pin out of a place url's q parameter", () => {
		expect(
			parseCoords("https://maps.google.com/?q=3.1509,101.5931&z=17"),
		).toEqual({ ok: true, lat: 3.1509, lng: 101.5931 });
	});

	it("reads the !3d!4d pin a shared place url carries", () => {
		expect(
			parseCoords(
				"https://www.google.com/maps/place/Shah+Alam/data=!3m1!4b1!4d101.5931!3d3.1509",
			),
		).toEqual({ ok: true, lat: 3.1509, lng: 101.5931 });
	});

	it("names a short link rather than shrugging at it", () => {
		expect(parseCoords("https://maps.app.goo.gl/abc123")).toEqual({
			ok: false,
			reason: "short-link",
		});
	});

	it("treats an empty field as empty, not as a mistake", () => {
		expect(parseCoords("   ")).toEqual({ ok: false, reason: "empty" });
	});

	it("refuses a pair that is not on Earth", () => {
		expect(parseCoords("300, 101.5931")).toEqual({
			ok: false,
			reason: "unreadable",
		});
	});

	it("refuses a lone number", () => {
		expect(parseCoords("3.1509")).toEqual({ ok: false, reason: "unreadable" });
	});
});

describe("pinState", () => {
	it("is located when there is a pin", () => {
		expect(pinState(3.1509, true)).toBe("located");
	});

	it("blames the missing key, not the admin's typing, when geocoding is off", () => {
		expect(pinState(null, false)).toBe("geocoder-off");
	});

	it("blames the address when geocoding is on and found nothing", () => {
		expect(pinState(null, true)).toBe("not-found");
	});

	it("is located even with geocoding off, because the pin was pasted by hand", () => {
		expect(pinState(3.1509, false)).toBe("located");
	});
});
