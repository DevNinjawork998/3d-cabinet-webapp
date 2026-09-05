import { describe, expect, it } from "vitest";
import { parseCoords, pinFor, pinState } from "../coords";

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

	it("does not read a typed address's numbers as a coordinate", () => {
		expect(parseCoords("Blok 3, 101 Jalan Setia")).toEqual({
			ok: false,
			reason: "unreadable",
		});
	});

	// The workshop's own link, expanded. Its `@` viewport (101.8106849) and its
	// `!4d` pin (101.861807) disagree by about 5 km, so this is the real-world
	// proof that reading `!3d`/`!4d` before `@` is load-bearing rather than
	// tidiness — taking the viewport would start the lorry in the wrong town.
	it("prefers the place pin over the viewport centre when they disagree", () => {
		expect(
			parseCoords(
				"https://www.google.com/maps/place/INFINITE+CABINET+SDN+BHD/@2.9856556,101.8106849,13.9z/data=!4m7!3m6!1s0x31cdcdba584ad201:0xe69cfd04c886e5d5!8m2!3d2.9848868!4d101.861807",
			),
		).toEqual({ ok: true, lat: 2.9848868, lng: 101.861807 });
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

describe("pinFor", () => {
	it("takes the pasted pin when there is one", () => {
		expect(pinFor(3.15, 101.59, "12 Jalan Setia")).toEqual({
			lat: 3.15,
			lng: 101.59,
		});
	});

	it("reads a coordinate pair typed into the address field", () => {
		// What actually happened on the first real job: the pin went into the
		// address box, and the delivery was saved with no pin at all.
		expect(pinFor(null, null, "2.9848922,101.8592321")).toEqual({
			lat: 2.9848922,
			lng: 101.8592321,
		});
	});

	it("leaves a real address alone, so it still gets geocoded", () => {
		expect(
			pinFor(null, null, "No 78, Jalan 1/2, Semenyih, Selangor"),
		).toBeNull();
	});
});
