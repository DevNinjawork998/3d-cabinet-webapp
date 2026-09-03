/**
 * The logistics partner vocabulary, in one place.
 *
 * The admin form, the API's payload schema and the comparison table all read
 * this list — same reasoning as `lib/tutorials.ts`. Two lists kept in step by
 * hand drift, and here the drift would be a carrier the admin can pick and the
 * booking route cannot reach.
 *
 * Isomorphic: this is imported by client components, so nothing secret belongs
 * here. Credentials live in the adapters, which are `server-only`.
 */

/**
 * `vehicle` books a whole van or lorry by distance; `parcel` books a
 * consignment by weight and dimensions.
 *
 * The distinction is not cosmetic. Finished cabinets are bulky — a 900mm
 * carcass fails the girth and weight caps of every parcel network — so a
 * `vehicle` partner does the real work, and the `parcel` ones carry hardware,
 * samples and spare doors. It is also only the `vehicle` partners that report
 * where the driver currently is.
 */
export type CarrierKind = "vehicle" | "parcel";

export const CARRIERS = [
	{ id: "manual", label: "Own lorry / phoned in", kind: "vehicle" },
	{ id: "lalamove", label: "Lalamove", kind: "vehicle" },
	{ id: "gdex", label: "GDEX", kind: "parcel" },
	{ id: "citylink", label: "City-Link", kind: "parcel" },
	{ id: "easyparcel", label: "EasyParcel", kind: "parcel" },
] as const satisfies readonly {
	id: string;
	label: string;
	kind: CarrierKind;
}[];

export type CarrierId = (typeof CARRIERS)[number]["id"];

export const CARRIER_IDS = CARRIERS.map((c) => c.id) as [
	CarrierId,
	...CarrierId[],
];

/** `{ lalamove: "Lalamove", … }` for rendering a row or a chip. */
export const LABEL: Record<string, string> = Object.fromEntries(
	CARRIERS.map((c) => [c.id, c.label]),
);

export const KIND: Record<string, CarrierKind> = Object.fromEntries(
	CARRIERS.map((c) => [c.id, c.kind]),
);

/**
 * Where every pickup starts unless the admin edits it. A constant rather than
 * a settings row because there is one workshop, and a Settings table for a
 * single string nobody has asked to change twice is a table nobody maintains.
 */
export const WORKSHOP_ADDRESS =
	"Infinite Cabinet Sdn Bhd, Klang Valley, Selangor";
