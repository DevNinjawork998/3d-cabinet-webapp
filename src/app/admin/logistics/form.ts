import type { DeliveryItem, DeliveryStatusName } from "@/lib/logistics/types";

/**
 * The delivery form as state, and the two translations either side of it: a
 * saved row into fields, and fields into the request body.
 *
 * Split out of the component because it is the only part of this screen worth
 * testing — a timezone slip or a dropped field here is a lorry at the wrong
 * place, and none of it needs React to prove.
 */

/** A delivery as JSON hands it back: dates are strings on this side. */
export type DeliveryRow = {
	id: string;
	number: number;
	customerName: string;
	customerPhone: string;
	siteAddress: string;
	addressNotes: string | null;
	pickupAddress: string;
	siteLat: number | null;
	siteLng: number | null;
	pickupLat: number | null;
	pickupLng: number | null;
	items: DeliveryItem[];
	totalWeightKg: number | null;
	totalVolumeM3: number | null;
	scheduledAt: string | null;
	carrierId: string | null;
	status: DeliveryStatusName;
	quotedPriceRm: number | null;
	carrierOrderId: string | null;
	trackingUrl: string | null;
	driverName: string | null;
	driverPhone: string | null;
	vehiclePlate: string | null;
	lastLatitude: number | null;
	lastLongitude: number | null;
	lastLocationAt: string | null;
	bookedBy: string | null;
	createdAt: string;
};

export type DeliveryEventRow = {
	id: string;
	at: string;
	source: string;
	status: DeliveryStatusName | null;
	message: string;
	actor: string | null;
};

export type QuoteRow = {
	carrierId: string;
	priceRm: number | null;
	etaMinutes: number | null;
	notes?: string;
	error?: string;
};

/** What `PATCH /api/admin/deliveries/[id]` accepts: nothing a carrier holds yet. */
export const EDITABLE = new Set<DeliveryStatusName>(["DRAFT", "QUOTED"]);

/**
 * A form row carries a `uid` the item itself does not: React needs a stable key
 * while rows are added and removed mid-edit, and an index would re-use the key
 * of a deleted row and hand its input state to its replacement. Stripped before
 * the job is saved — nothing outside this form knows about it.
 */
export type FormItem = DeliveryItem & { uid: string };

export const emptyItem = (): FormItem => ({
	uid: crypto.randomUUID(),
	label: "",
	qty: 1,
	widthMm: 600,
	heightMm: 720,
	depthMm: 560,
	weightKg: null,
});

/**
 * `"3.1509, 101.5931"` as the admin pasted it, or null.
 *
 * Deliberately only a bare pair — a Google Maps share link is a shortened URL
 * that has to be followed server-side to learn anything, and long-pressing the
 * map already puts exactly this on the clipboard.
 */
function parseCoords(raw: string): { lat: number; lng: number } | null {
	const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
	if (!match) return null;
	const lat = Number(match[1]);
	const lng = Number(match[2]);
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	return { lat, lng };
}

export const blankForm = (workshopAddress: string) => ({
	id: null as string | null,
	customerName: "",
	customerPhone: "",
	siteAddress: "",
	addressNotes: "",
	pickupAddress: workshopAddress,
	siteCoords: "",
	pickupCoords: "",
	scheduledAt: "",
	items: [emptyItem()],
});

export type FormState = ReturnType<typeof blankForm>;

/** `<input type="datetime-local">` wants local wall time, not the stored UTC. */
export function localDateTime(iso: string | null): string {
	if (!iso) return "";
	const at = new Date(iso);
	return new Date(at.getTime() - at.getTimezoneOffset() * 60000)
		.toISOString()
		.slice(0, 16);
}

const pinField = (lat: number | null, lng: number | null) =>
	lat !== null && lng !== null ? `${lat}, ${lng}` : "";

/**
 * An existing job back into the same form. A pin only shows here if one was
 * pasted or geocoded; either way it is what the next save re-sends, so clearing
 * the field is how an admin asks for the address to be looked up again.
 */
export const formFrom = (row: DeliveryRow): FormState => ({
	id: row.id,
	customerName: row.customerName,
	customerPhone: row.customerPhone,
	siteAddress: row.siteAddress,
	addressNotes: row.addressNotes ?? "",
	pickupAddress: row.pickupAddress,
	siteCoords: pinField(row.siteLat, row.siteLng),
	pickupCoords: pinField(row.pickupLat, row.pickupLng),
	scheduledAt: localDateTime(row.scheduledAt),
	items: row.items.map((item) => ({ ...item, uid: crypto.randomUUID() })),
});

/** The form as the create and edit endpoints want it. */
export function toPayload(state: FormState) {
	// Task 2 replaces this with the `{ ok }` result from
	// `@/lib/logistics/coords`; until then it is the null-returning copy moved
	// out of the component, and the two `?? null`s below are the same fallback.
	const site = parseCoords(state.siteCoords);
	const pickup = parseCoords(state.pickupCoords);
	return {
		customerName: state.customerName,
		customerPhone: state.customerPhone,
		siteAddress: state.siteAddress,
		addressNotes: state.addressNotes || null,
		pickupAddress: state.pickupAddress,
		siteLat: site?.lat ?? null,
		siteLng: site?.lng ?? null,
		pickupLat: pickup?.lat ?? null,
		pickupLng: pickup?.lng ?? null,
		scheduledAt: state.scheduledAt
			? new Date(state.scheduledAt).toISOString()
			: null,
		items: state.items
			.filter((i) => i.label.trim() !== "")
			.map(({ uid: _uid, ...item }) => item),
	};
}
