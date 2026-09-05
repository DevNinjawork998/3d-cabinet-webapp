/**
 * A Malaysian state's name in ISO 3166-2, which is the only spelling EasyParcel
 * accepts for `subdivision_code`.
 *
 * Pure and isomorphic — no credentials, no I/O. It exists because the two ends
 * of this integration name the same thirteen states differently: Google's
 * geocoder returns `administrative_area_level_1` as a display name, and the
 * display name it picks is not stable across Malay and English, nor across
 * "Penang" and "Pulau Pinang".
 *
 * Null rather than a guess. A wrong subdivision is a quote for the wrong zone,
 * which is a real price the admin would act on — better a carrier row that says
 * the state could not be read.
 */

const CODES: Record<string, string> = {
	johor: "MY-01",
	kedah: "MY-02",
	kelantan: "MY-03",
	melaka: "MY-04",
	malacca: "MY-04",
	"negeri sembilan": "MY-05",
	pahang: "MY-06",
	"pulau pinang": "MY-07",
	penang: "MY-07",
	perak: "MY-08",
	perlis: "MY-09",
	selangor: "MY-10",
	terengganu: "MY-11",
	sabah: "MY-12",
	sarawak: "MY-13",
	"kuala lumpur": "MY-14",
	labuan: "MY-15",
	putrajaya: "MY-16",
};

/**
 * The three federal territories arrive with a prefix as often as without it,
 * and in either language. Stripping the prefix is cheaper than six more keys.
 */
const PREFIX = /^(wilayah persekutuan|federal territory of|w\.?p\.?|ft)\s+/;

export function subdivisionCode(stateName: string): string | null {
	const trimmed = stateName.trim();
	if (trimmed === "") return null;

	// An ISO code that has already been resolved once passes through unchanged,
	// so a stored value can be re-read without a second lookup.
	if (/^MY-\d{2}$/i.test(trimmed)) return trimmed.toUpperCase();

	const key = trimmed.toLowerCase().replace(PREFIX, "");
	return CODES[key] ?? null;
}
