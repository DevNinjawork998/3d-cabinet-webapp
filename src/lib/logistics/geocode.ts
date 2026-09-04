import "server-only";
import { z } from "zod";
import { carrierFetch } from "./http";

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
			}),
		)
		.default([]),
});

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
		};
	} catch {
		// An unreachable geocoder must not take the save down with it.
		return null;
	}
}
