import "server-only";
import type {
	CarrierAdapter,
	CarrierBooking,
	CarrierQuote,
	DeliveryJob,
	TrackingUpdate,
} from "../types";

/**
 * The partner that is not an API: the company's own lorry, or a courier
 * arranged over the phone.
 *
 * Always available, no credentials. It exists so the page is useful on day one
 * — before any carrier documentation arrives, a delivery can still be recorded,
 * booked against a real vehicle and moved along its timeline by hand. Every
 * status change is an admin action writing a DeliveryEvent, which is exactly
 * what the real adapters will do from a webhook.
 */
export const manualAdapter: CarrierAdapter = {
	id: "manual",

	isConfigured: () => true,

	// No price: whoever phoned the driver knows it, and inventing a figure here
	// would put a number in front of the admin that nothing stands behind.
	async quote(_job: DeliveryJob): Promise<CarrierQuote> {
		return {
			carrierId: "manual",
			priceRm: null,
			etaMinutes: null,
			notes: "Arranged by hand — enter the agreed price on the job.",
		};
	},

	async book(job: DeliveryJob): Promise<CarrierBooking> {
		// Keyed on the job so the unique index still guards a double-submit, and
		// so the reference the admin reads back matches the number they say aloud.
		return { carrierOrderId: `manual-${job.id}`, trackingUrl: null };
	},

	// Nothing to poll. The admin drives this job's status from the page.
	async track(): Promise<TrackingUpdate> {
		return { status: null };
	},
};
