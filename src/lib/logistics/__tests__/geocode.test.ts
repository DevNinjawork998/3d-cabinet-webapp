import { afterEach, describe, expect, it, vi } from "vitest";
import {
	geocodeAddress,
	isGeocodingConfigured,
	resolveCoordinates,
} from "../geocode";

/** One Google Geocoding response, trimmed to the fields the module reads. */
const okResponse = (locationType: string) => ({
	status: "OK",
	results: [
		{
			formatted_address: "Jalan PJU 5/20, Kota Damansara, 47810 Petaling Jaya",
			geometry: {
				location: { lat: 3.1509, lng: 101.5931 },
				location_type: locationType,
			},
		},
	],
});

function stubFetch(body: unknown) {
	const fetchMock = vi.fn(
		async (..._args: unknown[]) =>
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("isGeocodingConfigured", () => {
	it("is false without a key", () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
		expect(isGeocodingConfigured()).toBe(false);
	});

	it("is true with one", () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		expect(isGeocodingConfigured()).toBe(true);
	});
});

describe("geocodeAddress", () => {
	it("returns the pin for a precise match", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch(okResponse("ROOFTOP"));

		expect(await geocodeAddress("Jalan PJU 5/20")).toEqual({
			lat: 3.1509,
			lng: 101.5931,
			formattedAddress: "Jalan PJU 5/20, Kota Damansara, 47810 Petaling Jaya",
		});
	});

	it("biases the request to Malaysia", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch(okResponse("ROOFTOP"));

		await geocodeAddress("Jalan PJU 5/20");

		const url = String(fetchMock.mock.calls[0][0]);
		expect(url).toContain("components=country%3AMY");
		expect(url).toContain("region=my");
	});

	it("refuses a town-centre match", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch(okResponse("APPROXIMATE"));

		expect(await geocodeAddress("Petaling Jaya")).toBeNull();
	});

	it("returns null when Google finds nothing", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch({ status: "ZERO_RESULTS", results: [] });

		expect(await geocodeAddress("nowhere at all")).toBeNull();
	});

	it("returns null rather than throwing when the key is missing", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
		expect(await geocodeAddress("Jalan PJU 5/20")).toBeNull();
	});

	it("returns null when Google is unreachable", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down");
			}),
		);

		expect(await geocodeAddress("Jalan PJU 5/20")).toBeNull();
	});
});

describe("resolveCoordinates", () => {
	it("takes an admin override without calling Google", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch(okResponse("ROOFTOP"));

		expect(
			await resolveCoordinates(
				"Jalan PJU 5/20",
				{ lat: null, lng: null, geocodedFor: null },
				{ lat: 3.2, lng: 101.6 },
			),
		).toEqual({ lat: 3.2, lng: 101.6, geocodedFor: "Jalan PJU 5/20" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps an existing pin when the address has not changed", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch(okResponse("ROOFTOP"));

		expect(
			await resolveCoordinates(
				"Jalan PJU 5/20",
				{ lat: 3.1, lng: 101.5, geocodedFor: "Jalan PJU 5/20" },
				null,
			),
		).toEqual({ lat: 3.1, lng: 101.5, geocodedFor: "Jalan PJU 5/20" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("geocodes when the address changed", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch(okResponse("ROOFTOP"));

		expect(
			await resolveCoordinates(
				"Jalan PJU 5/20",
				{ lat: 3.1, lng: 101.5, geocodedFor: "Somewhere else" },
				null,
			),
		).toEqual({ lat: 3.1509, lng: 101.5931, geocodedFor: "Jalan PJU 5/20" });
	});

	it("clears the pin when the new address will not geocode", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch({ status: "ZERO_RESULTS", results: [] });

		expect(
			await resolveCoordinates(
				"nowhere at all",
				{ lat: 3.1, lng: 101.5, geocodedFor: "Somewhere else" },
				null,
			),
		).toEqual({ lat: null, lng: null, geocodedFor: null });
	});
});
