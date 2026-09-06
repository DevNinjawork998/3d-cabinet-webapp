import { parseCoords } from "@/lib/logistics/coords";
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
	labelUrl: string | null;
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

/** What the pin input shows when the admin has not typed anything into it. */
export const NO_PIN_PLACEHOLDER = "Found from the address";

export const blankForm = (workshopAddress: string) => ({
	id: null as string | null,
	customerName: "",
	customerPhone: "",
	siteAddress: "",
	addressNotes: "",
	pickupAddress: workshopAddress,
	siteCoords: "",
	pickupCoords: "",
	sitePinPlaceholder: NO_PIN_PLACEHOLDER,
	pickupPinPlaceholder: NO_PIN_PLACEHOLDER,
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

const pinPlaceholder = (lat: number | null, lng: number | null) =>
	lat !== null && lng !== null ? `${lat}, ${lng}` : NO_PIN_PLACEHOLDER;

/**
 * An existing job back into the same form.
 *
 * The coords fields start blank, never prefilled with the stored pin — almost
 * every stored pin is a *geocoded* one, not a pasted override, and prefilling
 * it would resend it as an override on the next save. `resolveCoordinates`
 * treats any override as authoritative (rule 1), so a corrected address would
 * silently keep the old, wrong pin instead of being re-geocoded. The stored
 * pin still shows, as the input's placeholder, so the admin can see it without
 * it becoming part of what gets sent.
 */
export const formFrom = (row: DeliveryRow): FormState => ({
	id: row.id,
	customerName: row.customerName,
	customerPhone: row.customerPhone,
	siteAddress: row.siteAddress,
	addressNotes: row.addressNotes ?? "",
	pickupAddress: row.pickupAddress,
	siteCoords: "",
	pickupCoords: "",
	sitePinPlaceholder: pinPlaceholder(row.siteLat, row.siteLng),
	pickupPinPlaceholder: pinPlaceholder(row.pickupLat, row.pickupLng),
	scheduledAt: localDateTime(row.scheduledAt),
	items: row.items.map((item) => ({ ...item, uid: crypto.randomUUID() })),
});

/** The form as the create and edit endpoints want it. */
export function toPayload(state: FormState) {
	// A pin that failed to parse sends null, same as an empty field — the hint
	// under the input is what tells the admin the paste was rejected rather
	// than just not given.
	const site = parseCoords(state.siteCoords);
	const pickup = parseCoords(state.pickupCoords);
	return {
		customerName: state.customerName,
		customerPhone: state.customerPhone,
		siteAddress: state.siteAddress,
		addressNotes: state.addressNotes || null,
		pickupAddress: state.pickupAddress,
		siteLat: site.ok ? site.lat : null,
		siteLng: site.ok ? site.lng : null,
		pickupLat: pickup.ok ? pickup.lat : null,
		pickupLng: pickup.ok ? pickup.lng : null,
		scheduledAt: state.scheduledAt
			? new Date(state.scheduledAt).toISOString()
			: null,
		items: state.items
			.filter((i) => i.label.trim() !== "")
			.map(({ uid: _uid, ...item }) => item),
	};
}
