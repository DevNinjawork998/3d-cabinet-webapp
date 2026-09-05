import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	cheapest,
	collectionDate,
	EasyParcelNotDeliverable,
	easyparcelAdapter,
	mmToCm,
	parcelOf,
	quotationBody,
	submitBody,
} from "../adapters/easyparcel";
import { WORKSHOP_ADDRESS } from "../carriers";
import type { DeliveryItem, DeliveryJob } from "../types";
import { CarrierNotConfigured } from "../types";
import {
	cancelReply,
	detailsReply,
	quotationRefusal,
	quotationReply,
	submitRefusal,
	submitReply,
} from "./fixtures/easyparcel";

const door: DeliveryItem = {
	label: "Spare door 400mm",
	qty: 2,
	widthMm: 400,
	heightMm: 720,
	depthMm: 20,
	weightKg: 3.5,
};

const job = (over: Partial<DeliveryJob> = {}): DeliveryJob => ({
	id: "cl_abc",
	number: 41,
	customerName: "Siti",
	customerPhone: "012-345 6789",
	siteAddress: "Jalan PJU 5/20, Kota Damansara",
	addressNotes: "Gate code 1234",
	pickupAddress: WORKSHOP_ADDRESS,
	siteLat: 3.1509,
	siteLng: 101.5931,
	pickupLat: 2.9848868,
	pickupLng: 101.861807,
	sitePostcode: "47810",
	siteCity: "Petaling Jaya",
	siteState: "MY-10",
	pickupPostcode: null,
	pickupCity: null,
	pickupState: null,
	items: [door],
	totalWeightKg: 7,
	totalVolumeM3: 0.012,
	scheduledAt: null,
	...over,
});

describe("mmToCm", () => {
	it("converts and rounds to the millimetre EasyParcel can express", () => {
		expect(mmToCm(400)).toBe(40);
		expect(mmToCm(725)).toBe(72.5);
	});

	it("never returns zero — a courier rejects a parcel with no dimension", () => {
		expect(mmToCm(2)).toBeGreaterThan(0);
	});
});

describe("parcelOf", () => {
	it("takes the whole job's weight and the largest item's box", () => {
		expect(parcelOf(job())).toEqual({
			weight: 7,
			length: 72,
			width: 40,
			height: 2,
		});
	});

	it("refuses a job nobody has weighed", () => {
		expect(() => parcelOf(job({ totalWeightKg: null }))).toThrow(
			EasyParcelNotDeliverable,
		);
	});

	it("refuses a carcass — that is a lorry job, not a parcel", () => {
		const carcass: DeliveryItem = {
			label: "BC 800mm",
			qty: 1,
			widthMm: 800,
			heightMm: 720,
			depthMm: 560,
			weightKg: 45,
		};
		expect(() =>
			parcelOf(job({ items: [carcass], totalWeightKg: 45 })),
		).toThrow(EasyParcelNotDeliverable);
	});

	it("refuses a job with no items at all", () => {
		expect(() => parcelOf(job({ items: [] }))).toThrow(
			EasyParcelNotDeliverable,
		);
	});

	it("refuses on a long item's edge even when a bulkier item wins on volume", () => {
		// The strip loses the volume contest to the box (2.6L vs 125L) but its
		// 2400mm edge is the one that actually decides whether a courier can
		// take the consignment — the box's chosen dimensions would pass.
		const strip: DeliveryItem = {
			label: "Trim strip",
			qty: 1,
			widthMm: 2400,
			heightMm: 60,
			depthMm: 18,
			weightKg: 2,
		};
		const box: DeliveryItem = {
			label: "Hardware box",
			qty: 1,
			widthMm: 500,
			heightMm: 500,
			depthMm: 500,
			weightKg: 5,
		};
		expect(() =>
			parcelOf(job({ items: [strip, box], totalWeightKg: 7 })),
		).toThrow(EasyParcelNotDeliverable);
	});
});

describe("quotationBody", () => {
	it("sends both ends as postcode, subdivision and country", () => {
		const body = quotationBody(job());
		expect(body.shipment[0].receiver).toEqual({
			postcode: "47810",
			subdivision_code: "MY-10",
			country: "MY",
		});
		// The pickup row stored nothing, so the workshop's own place is used.
		expect(body.shipment[0].sender.subdivision_code).toBe("MY-10");
		expect(body.shipment[0].sender.postcode).toBe("43800");
	});

	it("refuses a site address the geocode could not place", () => {
		expect(() =>
			quotationBody(job({ sitePostcode: null, siteState: null })),
		).toThrow(EasyParcelNotDeliverable);
	});

	it("refuses a pickup that is neither the workshop nor placed", () => {
		expect(() =>
			quotationBody(job({ pickupAddress: "Somewhere else entirely" })),
		).toThrow(EasyParcelNotDeliverable);
	});
});

describe("cheapest", () => {
	const rate = (id: string, amount: string) => ({
		courier: {
			service_id: id,
			service_name: `${id} service`,
			courier_id: `c-${id}`,
			courier_name: id,
			delivery_duration: null,
			is_pickup: true,
			is_dropoff: false,
		},
		pricing: { currency: "MYR", total_amount: amount },
	});

	it("picks the lowest total", () => {
		const best = cheapest([rate("A", "12.40"), rate("B", "9.80")]);
		expect(best?.courier.service_id).toBe("B");
	});

	it("ignores a rate with an unreadable price rather than sorting it first", () => {
		const best = cheapest([rate("A", ""), rate("B", "9.80")]);
		expect(best?.courier.service_id).toBe("B");
	});

	it("prefers a pickup service over a drop-off at the same price", () => {
		const dropoff = { ...rate("A", "9.80") };
		dropoff.courier.is_pickup = false;
		dropoff.courier.is_dropoff = true;
		const best = cheapest([dropoff, rate("B", "9.80")]);
		expect(best?.courier.service_id).toBe("B");
	});

	it("returns null when nothing came back", () => {
		expect(cheapest([])).toBeNull();
	});
});

/** A connected account with a token that has hours left, so nothing refreshes. */
vi.mock("@/lib/catalogue/db", () => {
	const live = {
		carrierId: "easyparcel",
		accessToken: "at_live",
		refreshToken: "rt_live",
		accessTokenExpiresAt: new Date(Date.now() + 5 * 3_600_000),
		refreshTokenExpiresAt: new Date(Date.now() + 8000 * 3_600_000),
	};
	const tx = {
		$executeRaw: async () => 1,
		carrierToken: { findUnique: async () => live, update: async () => live },
	};
	return {
		prisma: {
			$transaction: async (fn: (t: unknown) => unknown) => fn(tx),
			carrierToken: { findUnique: async () => live, upsert: async () => live },
		},
	};
});

/** Queue one JSON response per call, in order. Same helper as lalamove.test.ts. */
function stubResponses(...bodies: unknown[]) {
	const fetchMock = vi.fn(async (..._args: unknown[]) => {
		const next = bodies.shift() ?? {};
		return new Response(JSON.stringify(next), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

beforeEach(() => {
	vi.stubEnv("EASYPARCEL_CLIENT_ID", "cid");
	vi.stubEnv("EASYPARCEL_CLIENT_SECRET", "csecret");
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("easyparcelAdapter.isConfigured", () => {
	it("is false without the app credentials, so the row says why", () => {
		vi.stubEnv("EASYPARCEL_CLIENT_SECRET", "");
		expect(easyparcelAdapter.isConfigured()).toBe(false);
	});
});

describe("easyparcelAdapter.quote", () => {
	it("posts the quotation to the 2026-06 endpoint with a Bearer token", async () => {
		const fetchMock = stubResponses(quotationReply);

		await easyparcelAdapter.quote(job());

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(String(url)).toBe(
			"https://api.easyparcel.com/open_api/2026-06/shipment/quotations",
		);
		expect(init.method).toBe("POST");
		const headers = init.headers as Record<string, string>;
		expect(headers.authorization).toBe("Bearer at_live");
	});

	it("sends the body the builder produced, byte for byte", async () => {
		const fetchMock = stubResponses(quotationReply);

		await easyparcelAdapter.quote(job());

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.body).toBe(JSON.stringify(quotationBody(job())));
	});

	it("reads their documented reply into the cheapest rate", async () => {
		stubResponses(quotationReply);

		const quote = await easyparcelAdapter.quote(job());

		expect(quote.carrierId).toBe("easyparcel");
		// City-Link at 8.20 undercuts Aramex at 10.84 in their own sample.
		expect(quote.priceRm).toBe(8.2);
		expect(quote.quoteRef).toBe("EP-CS09C");
		expect(quote.notes).toContain("City-Link");
		expect(quote.etaMinutes).toBeNull();
	});

	it("treats a 200 carrying an error as a refusal — this is not an HTTP failure", async () => {
		stubResponses(quotationRefusal);

		await expect(easyparcelAdapter.quote(job())).rejects.toThrow(
			/No courier service available/,
		);
	});

	it("refuses when nobody has connected an account, without calling out", async () => {
		vi.stubEnv("EASYPARCEL_CLIENT_ID", "");
		const fetchMock = stubResponses(quotationReply);

		await expect(easyparcelAdapter.quote(job())).rejects.toBeInstanceOf(
			CarrierNotConfigured,
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("never calls out at all for a job it can refuse from the row alone", async () => {
		const fetchMock = stubResponses(quotationReply);

		await expect(
			easyparcelAdapter.quote(job({ totalWeightKg: null })),
		).rejects.toBeInstanceOf(EasyParcelNotDeliverable);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("never calls out for a job whose longest edge is oversized, even when another item is bulkier", async () => {
		const fetchMock = stubResponses(quotationReply);
		const strip: DeliveryItem = {
			label: "Trim strip",
			qty: 1,
			widthMm: 2400,
			heightMm: 60,
			depthMm: 18,
			weightKg: 2,
		};
		const box: DeliveryItem = {
			label: "Hardware box",
			qty: 1,
			widthMm: 500,
			heightMm: 500,
			depthMm: 500,
			weightKg: 5,
		};

		await expect(
			easyparcelAdapter.quote(job({ items: [strip, box], totalWeightKg: 7 })),
		).rejects.toBeInstanceOf(EasyParcelNotDeliverable);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("collectionDate", () => {
	it("uses the scheduled date, in Kuala Lumpur", () => {
		// 2026-09-07T17:00Z is already the 8th in Malaysia.
		expect(collectionDate(new Date("2026-09-07T17:00:00Z"))).toBe("2026-09-08");
	});

	it("falls back to today when nothing is scheduled", () => {
		expect(collectionDate(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe("submitBody", () => {
	const body = () => submitBody(job(), "EP-CS096");

	it("carries the chosen service and one shipment", () => {
		expect(body().shipment).toHaveLength(1);
		expect(body().shipment[0].service_id).toBe("EP-CS096");
	});

	it("sends the workshop as sender and the customer as receiver", () => {
		const s = body().shipment[0];
		expect(s.sender.name).toBe("Infinite Cabinet");
		expect(s.receiver.name).toBe("Siti");
		expect(s.receiver.phone_number_country_code).toBe("MY");
		// E.164 without the +60: EasyParcel takes the country code separately.
		expect(s.receiver.phone_number).toBe("123456789");
	});

	it("puts the gate code where a driver reads it, not in the address line", () => {
		expect(body().shipment[0].receiver.address_2).toBe("Gate code 1234");
	});

	it("references the job number the staff say out loud", () => {
		expect(body().shipment[0].reference).toContain("41");
	});

	it("refuses a phone number no courier can call", () => {
		expect(() =>
			submitBody(job({ customerPhone: "not a phone" }), "EP-CS096"),
		).toThrow(EasyParcelNotDeliverable);
	});

	it("describes the items rather than sending an empty parcel", () => {
		expect(body().shipment[0].item[0].content).toContain("Spare door");
		expect(body().shipment[0].item[0].quantity).toBe(2);
	});

	it("refuses a receiver with no city we could read", () => {
		expect(() => submitBody(job({ siteCity: null }), "EP-CS096")).toThrow(
			EasyParcelNotDeliverable,
		);
	});
});

describe("easyparcelAdapter.book", () => {
	const chosen = {
		carrierId: "easyparcel",
		priceRm: 8.2,
		etaMinutes: null,
		quoteRef: "EP-CS09C",
	};

	it("submits to the orders endpoint with the service the admin chose", async () => {
		const fetchMock = stubResponses(submitReply);

		await easyparcelAdapter.book(job(), chosen);

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(String(url)).toBe(
			"https://api.easyparcel.com/open_api/2026-06/shipment/submit_orders",
		);
		const sent = JSON.parse(init.body as string);
		expect(sent.shipment[0].service_id).toBe("EP-CS09C");
		expect(sent.shipment[0].collection_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("returns the shipment number, the tracking page and the label", async () => {
		stubResponses(submitReply);

		const booking = await easyparcelAdapter.book(job(), chosen);

		// The shipment number, not the AWB — it is what details and cancel take.
		expect(booking.carrierOrderId).toBe("ES-2602-VC4KV");
		expect(booking.trackingUrl).toContain("easytrack");
		expect(booking.labelUrl).toContain("format=A4");
	});

	it("surfaces an empty wallet as an error rather than a booking", async () => {
		stubResponses(submitRefusal);

		await expect(easyparcelAdapter.book(job(), chosen)).rejects.toThrow(
			/Insufficient credit balance/,
		);
	});

	it("is never retried — a resubmit deducts the wallet twice", async () => {
		const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(easyparcelAdapter.book(job(), chosen)).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("refuses a quote carrying no service id", async () => {
		const fetchMock = stubResponses(submitReply);

		await expect(
			easyparcelAdapter.book(job(), { ...chosen, quoteRef: undefined }),
		).rejects.toBeInstanceOf(EasyParcelNotDeliverable);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("easyparcelAdapter.track", () => {
	it("asks details by shipment number and maps the status code", async () => {
		const fetchMock = stubResponses(detailsReply);

		const update = await easyparcelAdapter.track("ES-2602-VC4KV");

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(String(url)).toBe(
			"https://api.easyparcel.com/open_api/2026-06/shipment/details",
		);
		expect(JSON.parse(init.body as string)).toEqual({
			shipment_number: "ES-2602-VC4KV",
		});
		// Code 3 is Collected.
		expect(update.status).toBe("PICKED_UP");
		expect(update.message).toContain("Collected");
		expect(update.raw).toBeTruthy();
	});

	it("reports no driver, because a parcel network has none", async () => {
		stubResponses(detailsReply);

		const update = await easyparcelAdapter.track("ES-2602-VC4KV");

		expect(update.driverName).toBeUndefined();
		expect(update.latitude).toBeUndefined();
	});

	it("leaves the row alone for a status code we do not map", async () => {
		stubResponses({
			data: [
				{
					shipment_number: "ES-2602-VC4KV",
					shipment_details: {
						shipment_status_code: 8,
						shipment_status: "On Hold",
					},
				},
			],
		});

		const update = await easyparcelAdapter.track("ES-2602-VC4KV");

		expect(update.status).toBeNull();
		expect(update.message).toContain("On Hold");
	});

	it("says so rather than throwing when EasyParcel knows no such shipment", async () => {
		stubResponses({ data: [] });

		const update = await easyparcelAdapter.track("ES-0000-XXXXX");

		expect(update.status).toBeNull();
	});
});

describe("easyparcelAdapter.cancel", () => {
	it("sends a cancel list with the required remark", async () => {
		const fetchMock = stubResponses(cancelReply);

		await easyparcelAdapter.cancel?.("ES-2602-VC4KV");

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(String(url)).toBe(
			"https://api.easyparcel.com/open_api/2026-06/shipment/cancel",
		);
		const sent = JSON.parse(init.body as string);
		expect(sent.cancel_list[0].shipment_number).toBe("ES-2602-VC4KV");
		// `remark` is required by their API, not optional as it reads.
		expect(sent.cancel_list[0].remark).toBeTruthy();
	});
});
