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
			address_components: [
				{ long_name: "47810", short_name: "47810", types: ["postal_code"] },
				{
					long_name: "Petaling Jaya",
					short_name: "PJ",
					types: ["locality"],
				},
				{
					long_name: "Selangor",
					short_name: "Selangor",
					types: ["administrative_area_level_1", "political"],
				},
				{
					long_name: "Malaysia",
					short_name: "MY",
					types: ["country", "political"],
				},
			],
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
			postcode: "47810",
			city: "Petaling Jaya",
			state: "MY-10",
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
	it("takes an admin override on coordinates, but still geocodes the place", async () => {
		// An override corrects where the map dropped the pin — it says nothing
		// about the postcode, and without a geocode here the job would be
		// permanently unquotable by a parcel partner with no remedy the admin
		// could apply.
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch(okResponse("ROOFTOP"));

		expect(
			await resolveCoordinates(
				"Jalan PJU 5/20",
				{
					lat: null,
					lng: null,
					geocodedFor: null,
					postcode: null,
					city: null,
					state: null,
				},
				{ lat: 3.2, lng: 101.6 },
			),
		).toEqual({
			lat: 3.2,
			lng: 101.6,
			geocodedFor: "Jalan PJU 5/20",
			postcode: "47810",
			city: "Petaling Jaya",
			state: "MY-10",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("keeps the stored place on an override when the address has not changed", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch(okResponse("ROOFTOP"));

		expect(
			await resolveCoordinates(
				"Jalan PJU 5/20",
				{
					lat: 3.1,
					lng: 101.5,
					geocodedFor: "Jalan PJU 5/20",
					postcode: "47810",
					city: "Petaling Jaya",
					state: "MY-10",
				},
				{ lat: 3.2, lng: 101.6 },
			),
		).toEqual({
			lat: 3.2,
			lng: 101.6,
			geocodedFor: "Jalan PJU 5/20",
			postcode: "47810",
			city: "Petaling Jaya",
			state: "MY-10",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps an existing pin when the address has not changed", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch(okResponse("ROOFTOP"));

		expect(
			await resolveCoordinates(
				"Jalan PJU 5/20",
				{
					lat: 3.1,
					lng: 101.5,
					geocodedFor: "Jalan PJU 5/20",
					postcode: "47810",
					city: "Petaling Jaya",
					state: "MY-10",
				},
				null,
			),
		).toEqual({
			lat: 3.1,
			lng: 101.5,
			geocodedFor: "Jalan PJU 5/20",
			postcode: "47810",
			city: "Petaling Jaya",
			state: "MY-10",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("geocodes when the address changed", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch(okResponse("ROOFTOP"));

		expect(
			await resolveCoordinates(
				"Jalan PJU 5/20",
				{
					lat: 3.1,
					lng: 101.5,
					geocodedFor: "Somewhere else",
					postcode: null,
					city: null,
					state: null,
				},
				null,
			),
		).toEqual({
			lat: 3.1509,
			lng: 101.5931,
			geocodedFor: "Jalan PJU 5/20",
			postcode: "47810",
			city: "Petaling Jaya",
			state: "MY-10",
		});
	});

	it("clears the pin when the new address will not geocode", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch({ status: "ZERO_RESULTS", results: [] });

		expect(
			await resolveCoordinates(
				"nowhere at all",
				{
					lat: 3.1,
					lng: 101.5,
					geocodedFor: "Somewhere else",
					postcode: null,
					city: null,
					state: null,
				},
				null,
			),
		).toEqual({
			lat: null,
			lng: null,
			geocodedFor: null,
			postcode: null,
			city: null,
			state: null,
		});
	});
});

describe("geocodeAddress address components", () => {
	it("keeps the postcode, city and ISO state", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch(okResponse("ROOFTOP"));

		const found = await geocodeAddress("Jalan PJU 5/20, Kota Damansara");
		expect(found?.postcode).toBe("47810");
		expect(found?.city).toBe("Petaling Jaya");
		expect(found?.state).toBe("MY-10");
	});

	it("returns nulls for the components Google omits, not a throw", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch({
			status: "OK",
			results: [
				{
					formatted_address: "Somewhere vague but precise",
					geometry: {
						location: { lat: 3.1, lng: 101.5 },
						location_type: "ROOFTOP",
					},
					address_components: [
						{
							long_name: "Malaysia",
							short_name: "MY",
							types: ["country", "political"],
						},
					],
				},
			],
		});

		const found = await geocodeAddress("Somewhere vague but precise");
		expect(found?.postcode).toBeNull();
		expect(found?.city).toBeNull();
		expect(found?.state).toBeNull();
	});
});
