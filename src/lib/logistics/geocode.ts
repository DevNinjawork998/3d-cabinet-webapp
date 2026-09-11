import "server-only";
import { z } from "zod";
import { carrierFetch } from "./http";
import { subdivisionCode } from "./malaysia";
import { trace } from "./trace";

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
	// Google's own sentence about why it refused. Read because it is the only
	// thing that separates "your key is restricted to HTTP referrers" from
	// "billing is off" from "the Geocoding API is not enabled on this project",
	// and an admin cannot act on `REQUEST_DENIED` alone.
	error_message: z.string().optional(),
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
 * Whether the geocoder actually answers — not whether a key is present.
 *
 * These were the same question until a real key came back
 * `REQUEST_DENIED: "API keys with referer restrictions cannot be used with
 * this API."` A browser-restricted key is a perfectly valid Maps JavaScript
 * key and is refused outright by the Geocoding *web service*, which is what
 * runs here. `isGeocodingConfigured` said yes, `geocodeAddress` returned null
 * on every address, and both parcel adapters therefore told the admin to go
 * and edit an address that was already correct — a loop with no exit, over a
 * setting three menus away in Google Cloud Console.
 *
 * So "configured" is now a claim we check rather than assume:
 *
 * - `no-key`      — the variable is unset. Nothing was ever asked.
 * - `rejected`    — Google answered, and refused us. `detail` is their
 *                   sentence, which names the actual misconfiguration.
 * - `unreachable` — the call threw or timed out. Transient; worth retrying.
 *
 * All three are deployment faults, and none of them are the admin's address.
 */
export type GeocoderHealth =
	| { ok: true; why: null; detail: null }
	| {
			ok: false;
			why: "no-key" | "rejected" | "unreachable";
			detail: string | null;
	  };

const HEALTHY: GeocoderHealth = { ok: true, why: null, detail: null };

/**
 * What the last call to Google told us, and when.
 *
 * Module scope, so a save and the quote comparison that follows it share the
 * answer inside one warm instance and usually cost nothing. It is a cache and
 * not a record: a cold instance starts with `null` and is *optimistic* — an
 * unproven geocoder is not a broken one, and inventing a fault would be the
 * same class of mistake this whole block exists to remove.
 */
let health: GeocoderHealth | null = null;
let healthAt = 0;
const HEALTH_TTL_MS = 5 * 60_000;

function noteHealth(next: GeocoderHealth): GeocoderHealth {
	health = next;
	healthAt = Date.now();
	if (!next.ok)
		trace("geocode.unhealthy", { why: next.why, detail: next.detail });
	return next;
}

/** Tests only — the cache is per-process and would otherwise leak between them. */
export function resetGeocoderHealth(): void {
	health = null;
	healthAt = 0;
}

/**
 * The cached verdict, synchronously.
 *
 * Sync because the two callers that matter — `sitePostcodeOf` in `gdex.ts` and
 * `endpoint` in `easyparcel.ts` — are sync payload builders reached from a
 * dozen tests, and making them async to fetch a fact the enclosing request has
 * usually already learned would be a worse trade than an occasionally stale
 * answer. `refreshGeocoderHealth` is how a caller makes it non-stale first.
 */
export function geocoderHealth(): GeocoderHealth {
	if (!isGeocodingConfigured()) {
		return { ok: false, why: "no-key", detail: null };
	}
	return health ?? HEALTHY;
}

/**
 * Make the verdict current, probing Google once if it has gone stale.
 *
 * Called at the top of the quote comparison, which is the one place where
 * being wrong is expensive: it is where the admin reads the sentence and
 * decides what to go and fix. One geocode of a fixed address every five
 * minutes per instance is a rounding error against Google's free tier, and it
 * is skipped entirely whenever a save in the same instance has already
 * answered the question.
 */
export async function refreshGeocoderHealth(): Promise<GeocoderHealth> {
	if (!isGeocodingConfigured()) return geocoderHealth();
	if (health !== null && Date.now() - healthAt < HEALTH_TTL_MS) return health;
	// Notes the health as a side effect; the pin itself is thrown away.
	await geocodeAddress("Kuala Lumpur");
	return health ?? HEALTHY;
}

/**
 * The half of a "no postcode" refusal that belongs to us, or null when the
 * address really is the problem.
 *
 * Lives here rather than in each adapter because both of them were growing
 * their own copy of the same paragraph, and the copies had already drifted.
 * The carrier appends why *it* needs a postcode.
 */
export function geocoderFault(): string | null {
	const state = geocoderHealth();
	if (state.ok) return null;
	if (state.why === "no-key") {
		return "This deployment has no geocoding key, so no address here has a postcode — set GOOGLE_GEOCODING_API_KEY";
	}
	if (state.why === "rejected") {
		return `Google is refusing this deployment's geocoding key, so no address here has a postcode${
			state.detail === null ? "" : ` — Google said: “${state.detail}”`
		}`;
	}
	return "The geocoder could not be reached, so this address has no postcode yet — retry in a minute";
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
		if (!parsed.success) {
			noteHealth({
				ok: false,
				why: "rejected",
				detail: "the reply did not look like a Geocoding API response",
			});
			return null;
		}

		const { status, error_message } = parsed.data;
		// `ZERO_RESULTS` is a working geocoder saying it does not know this
		// address — the admin's problem, and the one case where "edit it and
		// save again" is the right advice. Every other non-OK status is ours.
		if (status !== "OK" && status !== "ZERO_RESULTS") {
			noteHealth({
				ok: false,
				why: "rejected",
				detail: error_message ?? status,
			});
			return null;
		}
		noteHealth(HEALTHY);
		if (status !== "OK") return null;

		const best = parsed.data.results[0];
		if (!best) return null;
		if (!PRECISE.has(best.geometry.location_type)) return null;

		return {
			lat: best.geometry.location.lat,
			lng: best.geometry.location.lng,
			formattedAddress: best.formatted_address,
			...readPlace(best.address_components),
		};
	} catch (error) {
		// An unreachable geocoder must not take the save down with it — but it
		// must not be filed as a bad address either.
		noteHealth({
			ok: false,
			why: "unreachable",
			detail: error instanceof Error ? error.message : null,
		});
		return null;
	}
}

/** The three fields a parcel partner prices against. */
export type Place = Pick<GeocodeResult, "postcode" | "city" | "state">;

/**
 * The place a pin sits in, asked of the pin rather than of an address string.
 *
 * The forward lookup can only answer an address, and an admin who pastes a
 * Maps link or a coordinate pair where the address goes has not given it one —
 * `pinFor` in `coords.ts` reads that paste as the pin on purpose, and it is the
 * common paste, because a phone's clipboard from Google Maps is a URL. Google
 * then returns nothing usable for the URL, the row stores a perfect pin beside
 * a null postcode, and the job quotes on Lalamove and is refused by GDEX and
 * EasyParcel with a sentence telling the admin to edit an address that says
 * exactly what they meant. Delivery 14 is that row.
 *
 * So when there is a pin and no postcode, ask about the pin. Reverse results
 * come back at several granularities and not all of them carry a postcode; the
 * first that does wins, and null when none do.
 */
export async function reverseGeocode(
	lat: number,
	lng: number,
): Promise<Place | null> {
	const key = process.env.GOOGLE_GEOCODING_API_KEY ?? "";
	if (key === "") return null;

	const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
	url.searchParams.set("latlng", `${lat},${lng}`);
	url.searchParams.set("key", key);

	try {
		const body = await carrierFetch<unknown>(url.toString(), {
			carrierId: "geocode",
			idempotent: true,
		});
		const parsed = responseSchema.safeParse(body);
		if (!parsed.success) return null;
		if (parsed.data.status !== "OK") {
			// Same split as the forward call: Google saying it knows nothing about
			// this pin is not this deployment being misconfigured.
			if (parsed.data.status !== "ZERO_RESULTS") {
				noteHealth({
					ok: false,
					why: "rejected",
					detail: parsed.data.error_message ?? parsed.data.status,
				});
			}
			return null;
		}
		noteHealth(HEALTHY);

		for (const result of parsed.data.results) {
			const place = readPlace(result.address_components);
			if (place.postcode !== null) return place;
		}
		return null;
	} catch (error) {
		noteHealth({
			ok: false,
			why: "unreachable",
			detail: error instanceof Error ? error.message : null,
		});
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
 * A pin we have, with the postcode Google will only give us for the pin.
 *
 * Costs a second call and only on the saves that would otherwise store an
 * unquotable row — a pin with no postcode is precisely the state that refuses
 * every parcel partner, so there is nothing to lose by asking.
 */
async function withPlace(pin: StoredPin): Promise<StoredPin> {
	if (pin.postcode !== null || pin.lat === null || pin.lng === null) return pin;
	const place = await reverseGeocode(pin.lat, pin.lng);
	return place === null ? pin : { ...pin, ...place };
}

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
		//
		// `postcode !== null` is the other half of that test, and leaving it out
		// cost delivery 14. This branch writes `geocodedFor: address` whatever
		// the geocode returned, so a save made while the geocoding key was being
		// refused stored "we looked this up" next to a null postcode — and every
		// save afterwards matched the cache, took the nulls, and never called
		// Google again. The row latched unquotable, and the message it produced
		// sent the admin to edit an address that geocodes perfectly well. Same
		// failure, same reasoning and now the same guard as the branch below.
		const place =
			current.geocodedFor === address && current.postcode !== null
				? current
				: ((await geocodeAddress(address)) ?? {
						postcode: null,
						city: null,
						state: null,
					});
		return withPlace({
			lat: override.lat,
			lng: override.lng,
			geocodedFor: address,
			postcode: place.postcode,
			city: place.city,
			state: place.state,
		});
	}
	// The postcode has to be part of this test, not just the pin: a row saved
	// before the `20260905181525_delivery_place_and_label` migration has a pin
	// and no place, and if the pin alone satisfied this, editing that row could
	// never back-fill the postcode EasyParcel needs — every re-save would hit
	// this branch and hand back the same unquotable row. Requiring the postcode
	// too means such a row geocodes once here and then stays cached like any
	// other.
	if (
		current.geocodedFor === address &&
		current.lat !== null &&
		current.postcode !== null
	) {
		return current;
	}
	const found = await geocodeAddress(address);
	return withPlace(
		found
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
				},
	);
}
