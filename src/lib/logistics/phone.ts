/**
 * A phone number as an admin types it, in the format a carrier's API demands.
 *
 * Pure and framework-free. Malaysian numbers arrive as `012-345 6789`,
 * `+60 12-345 6789` or `0123456789` depending on who filled the form, and
 * Lalamove accepts exactly one of those shapes: E.164, `^\+[1-9]\d{1,14}$`.
 */

/** Malaysia. The only market this app delivers in. */
const DEFAULT_CC = "60";

/**
 * `null` rather than a throw or a best guess: a phone number we cannot read is
 * the admin's typo to fix, and inventing a country code would put a driver on
 * the line to a stranger.
 */
export function toE164(
	raw: string,
	defaultCountryCode = DEFAULT_CC,
): string | null {
	const trimmed = raw.trim();
	// A leading + is the one piece of punctuation that carries meaning.
	const hadPlus = trimmed.startsWith("+");
	const digits = trimmed.replace(/\D/g, "");
	if (digits === "") return null;

	// A local number is written with a trunk 0 that E.164 does not use.
	const national = hadPlus
		? digits
		: digits.startsWith(defaultCountryCode)
			? digits
			: `${defaultCountryCode}${digits.replace(/^0+/, "")}`;

	// E.164 allows 15 digits; anything under 8 is not a reachable number.
	if (national.length < 8 || national.length > 15) return null;
	if (national.startsWith("0")) return null;

	return `+${national}`;
}
