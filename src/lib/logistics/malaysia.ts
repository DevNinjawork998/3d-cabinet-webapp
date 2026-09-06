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

/**
 * The thirteen states and three federal territories, canonically spelled, for
 * the admin form's state picker.
 *
 * A picker rather than a text box because this field only ever reaches
 * EasyParcel as `subdivision_code`, and the whole reason `CODES` above has two
 * keys for Melaka and two for Penang is that free text arrives spelled however
 * the typist felt. An admin choosing from a list cannot produce a spelling
 * `subdivisionCode` refuses.
 *
 * Ordered by code, which is also roughly alphabetical by the name Malaysians
 * use — and stable, unlike sorting by display name across two languages.
 */
export const MALAYSIAN_STATES: { code: string; name: string }[] = [
	{ code: "MY-01", name: "Johor" },
	{ code: "MY-02", name: "Kedah" },
	{ code: "MY-03", name: "Kelantan" },
	{ code: "MY-04", name: "Melaka" },
	{ code: "MY-05", name: "Negeri Sembilan" },
	{ code: "MY-06", name: "Pahang" },
	{ code: "MY-07", name: "Pulau Pinang" },
	{ code: "MY-08", name: "Perak" },
	{ code: "MY-09", name: "Perlis" },
	{ code: "MY-10", name: "Selangor" },
	{ code: "MY-11", name: "Terengganu" },
	{ code: "MY-12", name: "Sabah" },
	{ code: "MY-13", name: "Sarawak" },
	{ code: "MY-14", name: "Kuala Lumpur" },
	{ code: "MY-15", name: "Labuan" },
	{ code: "MY-16", name: "Putrajaya" },
];

export function subdivisionCode(stateName: string): string | null {
	const trimmed = stateName.trim();
	if (trimmed === "") return null;

	// An ISO code that has already been resolved once passes through unchanged,
	// so a stored value can be re-read without a second lookup.
	if (/^MY-\d{2}$/i.test(trimmed)) return trimmed.toUpperCase();

	const key = trimmed.toLowerCase().replace(PREFIX, "");
	return CODES[key] ?? null;
}
