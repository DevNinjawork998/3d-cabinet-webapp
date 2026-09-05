/**
 * What the delivery API refuses with, said as the thing to do about it.
 *
 * The codes are the API's vocabulary and belong in it; an admin booking a
 * lorry should never read one. Anything unrecognised falls back to the
 * caller's own sentence rather than surfacing a new code the day it is added.
 */
const MESSAGE: Record<string, string> = {
	already_booked:
		"This job is with a carrier already — change or cancel it with them first.",
	not_found: "This delivery is gone. Someone may have deleted it.",
	invalid_body:
		"Something in the form is not right — check the phone number and the item sizes.",
	carrier_not_configured:
		"That partner has no credentials on this deployment yet.",
};

export function messageFor(code: unknown, fallback: string): string {
	return typeof code === "string" && code in MESSAGE ? MESSAGE[code] : fallback;
}
