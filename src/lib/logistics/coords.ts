/**
 * A map pin as an admin pasted it.
 *
 * Pure and isomorphic — the delivery form imports this, so nothing here may
 * touch the network, the environment, or a credential.
 *
 * There is no pin input on the form any more: a person types the full address
 * and the geocode finds the pin, which is what a person actually does. What
 * survives is the reading of a pin out of the *address* field — because what a
 * phone puts on the clipboard from Google Maps is a URL, and somebody will
 * paste it where the address goes.
 */

export type ParsedCoords =
	| { ok: true; lat: number; lng: number }
	| { ok: false; reason: "empty" | "short-link" | "unreadable" };

/** Malaysia is well inside both, but a swapped pair is not, so check the world. */
const onEarth = (lat: number, lng: number) =>
	Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const PAIR = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;
/** `/@lat,lng,17z` — the map's own viewport, and the pin when one is dropped. */
const AT = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
/** `!3dlat!4dlng` — how a shared place url carries the pin. Latitude first. */
const BANG =
	/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)|!4d(-?\d+(?:\.\d+)?).*?!3d(-?\d+(?:\.\d+)?)/;

export function parseCoords(raw: string): ParsedCoords {
	const text = raw.trim();
	if (text === "") return { ok: false, reason: "empty" };

	// A shortened link is a redirect, and following it is a server-side fetch of
	// a url someone pasted. Ask for the pin instead — Maps offers it two taps
	// away, and this stays a pure function.
	if (/goo\.gl|maps\.app|g\.co\//i.test(text)) {
		return { ok: false, reason: "short-link" };
	}

	const bang = BANG.exec(text);
	if (bang) {
		const lat = Number(bang[1] ?? bang[4]);
		const lng = Number(bang[2] ?? bang[3]);
		if (onEarth(lat, lng)) return { ok: true, lat, lng };
	}

	const at = AT.exec(text);
	if (at) {
		const lat = Number(at[1]);
		const lng = Number(at[2]);
		if (onEarth(lat, lng)) return { ok: true, lat, lng };
	}

	// Last. On a url, only the query part — a street number in a path must not
	// be read as a latitude. On free text there is no query part to narrow to,
	// so the whole string has to match the bare-pair shape end to end, or a
	// typed address like "Blok 3, 101 Jalan Setia" reads as a coordinate.
	const pair = text.includes("?")
		? PAIR.exec(text.slice(text.indexOf("?")))
		: /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(text);
	if (pair) {
		const lat = Number(pair[1]);
		const lng = Number(pair[2]);
		if (onEarth(lat, lng)) return { ok: true, lat, lng };
	}

	return { ok: false, reason: "unreadable" };
}

/**
 * Why a delivery has no pin, which decides what the admin should do about it.
 *
 * "Did not resolve" reads as a typo, and with no `GOOGLE_GEOCODING_API_KEY`
 * every address ever typed resolves to nothing. Telling an admin to fix an
 * address that was never looked up sends them round a loop they cannot win.
 */
export type PinState = "located" | "geocoder-off" | "not-found";

export function pinState(
	lat: number | null,
	geocodingConfigured: boolean,
): PinState {
	if (lat !== null) return "located";
	return geocodingConfigured ? "not-found" : "geocoder-off";
}

/**
 * The pin to use for a stop: an override the API was given, or the address
 * itself when what was typed there is a coordinate pair or a Maps link.
 *
 * The form no longer offers a pin field, so the second case is now the only
 * one a person reaches. It is not a hypothetical — three saves in a row on the
 * first real job put a pin where an address goes. A coordinate pair is never a
 * street address, so reading one as a pin costs nothing.
 */
export function pinFor(
	lat: number | null,
	lng: number | null,
	address: string,
): { lat: number; lng: number } | null {
	if (lat !== null && lng !== null) return { lat, lng };
	const parsed = parseCoords(address);
	return parsed.ok ? { lat: parsed.lat, lng: parsed.lng } : null;
}
