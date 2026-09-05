import "server-only";
import { z } from "zod";
import { carrierFetch } from "./http";
import { subdivisionCode } from "./malaysia";

/**
 * An address string turned into a pin.
 *
 * Lalamove prices stop to stop by coordinate — `POST /v3/quotations` takes
 * `stops[].coordinates`, and the address line is only a label the driver reads.
 * The admin only ever has an address, so something has to do this, and it has
 * to be something whose Malaysian address coverage — *taman*, *jalan*, unit
 * numbers — is trustworthy: a pin dropped on the wrong housing estate is a
 * lorry at the wrong house.
 *
 * Called at job-save time, not at quote time, so a bad address is the admin's
 * problem while they are still typing it rather than a mystery 400 later.
 */

export type GeocodeResult = {
	lat: number;
	lng: number;
	formattedAddress: string;
	postcode: string | null;
	city: string | null;
	state: string | null;
};

/**
 * Google's answer, only the fields we read.
 *
 * Parsed rather than cast: this is a third party's payload, which the project's
 * rules put on the same footing as a request body.
 */
const responseSchema = z.object({
	status: z.string(),
	results: z
		.array(
			z.object({
				formatted_address: z.string(),
				geometry: z.object({
					location: z.object({ lat: z.number(), lng: z.number() }),
					location_type: z.string(),
				}),
				address_components: z
					.array(
						z.object({
							long_name: z.string(),
							short_name: z.string(),
							types: z.array(z.string()),
						}),
					)
					.default([]),
			}),
		)
		.default([]),
});

type Component = { long_name: string; short_name: string; types: string[] };

/**
 * Google returns the address broken into components; we keep the three
 * EasyParcel prices against.
 *
 * `locality` is the city in Klang Valley, but Google drops it for some
 * addresses and puts the town in `administrative_area_level_2` instead — so
 * both are read, most specific first. Everything is nullable: a component
 * Google did not return is a field EasyParcel will refuse the job for, and the
 * adapter says so on the comparison row. Filling it with a plausible guess
 * would produce a quote for the wrong zone instead.
 */
function readPlace(components: Component[]) {
	const first = (type: string) =>
		components.find((c) => c.types.includes(type)) ?? null;

	const state = first("administrative_area_level_1");
	const city = first("locality") ?? first("administrative_area_level_2");

	return {
		postcode: first("postal_code")?.long_name ?? null,
		city: city?.long_name ?? null,
		// Stored as the ISO code, not the display name: the name is what varies
		// between Google's answers and EasyParcel is the only consumer.
		state: state ? subdivisionCode(state.long_name) : null,
	};
}

/**
 * `APPROXIMATE` means Google matched the town and nothing finer. That is a
 * successful geocode and a wrong delivery, so it is refused here and the admin
 * is asked for a better address.
 */
const PRECISE = new Set(["ROOFTOP", "RANGE_INTERPOLATED", "GEOMETRIC_CENTER"]);

export function isGeocodingConfigured(): boolean {
	return (process.env.GOOGLE_GEOCODING_API_KEY ?? "") !== "";
}

/**
 * Null covers every "we do not have a pin" case — no key, no match, too vague,
 * Google unreachable. The caller stores null and the row shows as not located;
 * none of those are worth failing a save the admin has already typed.
 */
export async function geocodeAddress(
	address: string,
): Promise<GeocodeResult | null> {
	const key = process.env.GOOGLE_GEOCODING_API_KEY ?? "";
	if (key === "" || address.trim() === "") return null;

	const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
	url.searchParams.set("address", address);
	// Both, and they do different jobs: `region` biases ambiguous names toward
	// Malaysia, `components` refuses to leave it.
	url.searchParams.set("region", "my");
	url.searchParams.set("components", "country:MY");
	url.searchParams.set("key", key);

	try {
		const body = await carrierFetch<unknown>(url.toString(), {
			carrierId: "geocode",
			idempotent: true,
		});
		const parsed = responseSchema.safeParse(body);
		if (!parsed.success || parsed.data.status !== "OK") return null;

		const best = parsed.data.results[0];
		if (!best) return null;
		if (!PRECISE.has(best.geometry.location_type)) return null;

		return {
			lat: best.geometry.location.lat,
			lng: best.geometry.location.lng,
			formattedAddress: best.formatted_address,
			...readPlace(best.address_components),
		};
	} catch {
		// An unreachable geocoder must not take the save down with it.
		return null;
	}
}

export type StoredPin = {
	lat: number | null;
	lng: number | null;
	/** The address string this pin was resolved for; null when there is none. */
	geocodedFor: string | null;
	postcode: string | null;
	city: string | null;
	state: string | null;
};

/**
 * The pin a delivery row should carry after a save.
 *
 * Three rules, in order:
 *
 * 1. An admin-typed override wins outright on *coordinates*. It is the escape
 *    hatch for the geocode that landed on the wrong Taman, and second-guessing
 *    the pin would make the hatch useless. It says nothing about the postcode
 *    though — that still comes from the geocode, re-read when the address
 *    changed, because a permanently unquotable EasyParcel job with no remedy
 *    the admin could apply is worse than one extra geocoding call.
 * 2. An unchanged address keeps its pin. A PATCH that only fixed a phone number
 *    must not spend a geocoding call, and must not risk a different answer.
 * 3. Otherwise geocode, and store null when that fails — a stale pin belonging
 *    to the previous address is worse than no pin, because nothing on screen
 *    would say it is wrong.
 */
export async function resolveCoordinates(
	address: string,
	current: StoredPin,
	override: { lat: number; lng: number } | null,
): Promise<StoredPin> {
	if (override) {
		// An admin-typed pin overrides the *coordinates*, not the postcode — they
		// are correcting where the map dropped the marker, not telling us the job
		// moved to another state. The stored place is kept when the address is
		// unchanged and re-read from the geocode when it is not.
		const place =
			current.geocodedFor === address
				? current
				: ((await geocodeAddress(address)) ?? {
						postcode: null,
						city: null,
						state: null,
					});
		return {
			lat: override.lat,
			lng: override.lng,
			geocodedFor: address,
			postcode: place.postcode,
			city: place.city,
			state: place.state,
		};
	}
	if (current.geocodedFor === address && current.lat !== null) {
		return current;
	}
	const found = await geocodeAddress(address);
	return found
		? {
				lat: found.lat,
				lng: found.lng,
				geocodedFor: address,
				postcode: found.postcode,
				city: found.city,
				state: found.state,
			}
		: {
				lat: null,
				lng: null,
				geocodedFor: null,
				postcode: null,
				city: null,
				state: null,
			};
}
