import { afterEach, describe, expect, it, vi } from "vitest";
import {
	geocodeAddress,
	geocoderFault,
	geocoderHealth,
	isGeocodingConfigured,
	refreshGeocoderHealth,
	resetGeocoderHealth,
	resolveCoordinates,
	reverseGeocode,
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
	resetGeocoderHealth();
});

/**
 * The refusal that started all of this: a real, present, *valid* key that
 * Google will not accept for the Geocoding web service because it is
 * restricted to HTTP referrers. Indistinguishable from a working key until
 * it is used.
 */
const refererRestricted = {
	status: "REQUEST_DENIED",
	error_message:
		"API keys with referer restrictions cannot be used with this API.",
	results: [],
};

describe("geocoder health", () => {
	it("is a fault the admin cannot fix by editing an address", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch(refererRestricted);

		expect(await geocodeAddress("Jalan PJU 5/20")).toBeNull();
		expect(geocoderHealth()).toEqual({
			ok: false,
			why: "rejected",
			detail:
				"API keys with referer restrictions cannot be used with this API.",
		});
		// The sentence must carry Google's own words — "REQUEST_DENIED" alone
		// sends someone to the wrong three menus.
		expect(geocoderFault()).toMatch(/referer restrictions/);
	});

	it("blames the deployment, by name, when there is no key at all", () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
		expect(geocoderHealth().why).toBe("no-key");
		expect(geocoderFault()).toMatch(/GOOGLE_GEOCODING_API_KEY/);
	});

	it("separates a geocoder that did not answer from one that refused", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down");
			}),
		);

		await geocodeAddress("Jalan PJU 5/20");
		expect(geocoderHealth().why).toBe("unreachable");
		expect(geocoderFault()).toMatch(/retry/);
	});

	it("treats an address Google simply does not know as healthy", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch({ status: "ZERO_RESULTS", results: [] });

		expect(await geocodeAddress("nowhere at all")).toBeNull();
		// The one case where "edit it and save again" is the right advice, so
		// nothing here may claim a deployment fault.
		expect(geocoderFault()).toBeNull();
	});

	it("is optimistic until something has actually failed", () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		expect(geocoderHealth().ok).toBe(true);
		expect(geocoderFault()).toBeNull();
	});

	it("probes once and then answers from cache", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch(refererRestricted);

		expect((await refreshGeocoderHealth()).ok).toBe(false);
		expect((await refreshGeocoderHealth()).ok).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("does not spend a probe when there is no key to probe with", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
		const fetchMock = stubFetch(refererRestricted);

		expect((await refreshGeocoderHealth()).why).toBe("no-key");
		expect(fetchMock).not.toHaveBeenCalled();
	});
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

	it("re-geocodes a pre-migration row that has a pin but no postcode", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch(okResponse("ROOFTOP"));

		expect(
			await resolveCoordinates(
				"Jalan PJU 5/20",
				{
					lat: 3.1,
					lng: 101.5,
					geocodedFor: "Jalan PJU 5/20",
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
		expect(fetchMock).toHaveBeenCalled();
	});

	it("re-geocodes an overridden pin whose place was never found", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch(okResponse("ROOFTOP"));

		// Delivery 14, exactly: saved once while the geocoding key was still
		// refused, which stored `geocodedFor` alongside a null postcode. Every
		// save after the key was fixed matched that cache and short-circuited,
		// so the row could never recover and the admin was told to edit an
		// address that geocodes perfectly well.
		expect(
			await resolveCoordinates(
				"Jalan PJU 5/20",
				{
					lat: 3.1,
					lng: 101.5,
					geocodedFor: "Jalan PJU 5/20",
					postcode: null,
					city: null,
					state: null,
				},
				{ lat: 3.1, lng: 101.5 },
			),
		).toEqual({
			// The admin's pin still wins on coordinates.
			lat: 3.1,
			lng: 101.5,
			geocodedFor: "Jalan PJU 5/20",
			postcode: "47810",
			city: "Petaling Jaya",
			state: "MY-10",
		});
		expect(fetchMock).toHaveBeenCalled();
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

/**
 * Google's reverse reply: the coarse rows it puts first carry no postcode, and
 * the street-level one does. Shaped this way on purpose — taking `results[0]`
 * blindly is what would silently keep the postcode null.
 */
const reverseResponse = {
	status: "OK",
	results: [
		{
			formatted_address: "Selangor, Malaysia",
			geometry: {
				location: { lat: 2.9442869, lng: 101.5427859 },
				location_type: "APPROXIMATE",
			},
			address_components: [
				{
					long_name: "Selangor",
					short_name: "Selangor",
					types: ["administrative_area_level_1", "political"],
				},
			],
		},
		{
			formatted_address:
				"3, Persiaran Eco Sanctuary, 42500 Telok Panglima Garang, Selangor",
			geometry: {
				location: { lat: 2.9442869, lng: 101.5427859 },
				location_type: "ROOFTOP",
			},
			address_components: [
				{ long_name: "42500", short_name: "42500", types: ["postal_code"] },
				{
					long_name: "Telok Panglima Garang",
					short_name: "Telok Panglima Garang",
					types: ["locality"],
				},
				{
					long_name: "Selangor",
					short_name: "Selangor",
					types: ["administrative_area_level_1", "political"],
				},
			],
		},
	],
};

describe("reverseGeocode", () => {
	it("takes the first result that actually carries a postcode", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch(reverseResponse);

		expect(await reverseGeocode(2.9442869, 101.5427859)).toEqual({
			postcode: "42500",
			city: "Telok Panglima Garang",
			state: "MY-10",
		});
	});

	it("is null when no result carries one", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		stubFetch({ status: "ZERO_RESULTS", results: [] });

		expect(await reverseGeocode(2.9442869, 101.5427859)).toBeNull();
	});
});

describe("a pin pasted where the address goes", () => {
	// Delivery 14: the address field holds a Google Maps url, so `pinFor` reads
	// the pin out of it and the forward lookup has no address to answer. Before
	// the reverse fallback the row stored a perfect pin and a null postcode, and
	// GDEX and EasyParcel both refused a job Lalamove quoted at RM 85.
	const mapsUrl =
		"https://www.google.com/maps/place/Sanctuary+Mall/@2.9268368,101.5816541,15z/data=!3d2.9442869!4d101.5427859";

	it("takes its postcode from the pin when the address yields none", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = vi.fn(
			async (input: unknown) =>
				new Response(
					JSON.stringify(
						String(input).includes("latlng=")
							? reverseResponse
							: { status: "ZERO_RESULTS", results: [] },
					),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
		);
		vi.stubGlobal("fetch", fetchMock);

		expect(
			await resolveCoordinates(
				mapsUrl,
				{
					lat: null,
					lng: null,
					geocodedFor: null,
					postcode: null,
					city: null,
					state: null,
				},
				{ lat: 2.9442869, lng: 101.5427859 },
			),
		).toEqual({
			lat: 2.9442869,
			lng: 101.5427859,
			geocodedFor: mapsUrl,
			postcode: "42500",
			city: "Telok Panglima Garang",
			state: "MY-10",
		});
	});

	it("does not ask a second time when there is no pin to ask about", async () => {
		vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-key");
		const fetchMock = stubFetch({ status: "ZERO_RESULTS", results: [] });

		expect(
			(
				await resolveCoordinates(
					"nowhere at all",
					{
						lat: null,
						lng: null,
						geocodedFor: null,
						postcode: null,
						city: null,
						state: null,
					},
					null,
				)
			).lat,
		).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
