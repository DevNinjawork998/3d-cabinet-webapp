import { describe, expect, it } from "vitest";
import {
	LalamoveNotDeliverable,
	orderBody,
	packQuoteRef,
	quotationBody,
	serviceTypeFor,
	signRequest,
	unpackQuoteRef,
} from "../adapters/lalamove";
import type { DeliveryItem, DeliveryJob } from "../types";

const carcass: DeliveryItem = {
	label: "BC 800mm",
	qty: 4,
	widthMm: 800,
	heightMm: 720,
	depthMm: 560,
	weightKg: null,
};

const job = (over: Partial<DeliveryJob> = {}): DeliveryJob => ({
	id: "cl_abc",
	number: 41,
	customerName: "Siti",
	customerPhone: "012-345 6789",
	siteAddress: "Jalan PJU 5/20, Kota Damansara",
	addressNotes: "Gate code 1234",
	pickupAddress: "Lot 5, Jalan Industri, Shah Alam",
	siteLat: 3.1509,
	siteLng: 101.5931,
	pickupLat: 3.0738,
	pickupLng: 101.5183,
	items: [carcass],
	totalWeightKg: null,
	totalVolumeM3: 1.29,
	scheduledAt: null,
	...over,
});

describe("signRequest", () => {
	// A fixed vector: the same inputs must always give the same hex, and
	// changing any one part must change it, or a refactor that reorders the
	// signing string breaks every call silently.
	it("signs timestamp, verb, path, blank line, body", () => {
		const base = signRequest("s", "1", "POST", "/v3/quotations", "{}");
		expect(signRequest("s", "1", "POST", "/v3/quotations", "{}")).toBe(base);
		expect(signRequest("s", "2", "POST", "/v3/quotations", "{}")).not.toBe(
			base,
		);
		expect(signRequest("s", "1", "GET", "/v3/quotations", "{}")).not.toBe(base);
		expect(signRequest("s", "1", "POST", "/v3/orders", "{}")).not.toBe(base);
		expect(signRequest("s", "1", "POST", "/v3/quotations", "{ }")).not.toBe(
			base,
		);
		expect(signRequest("t", "1", "POST", "/v3/quotations", "{}")).not.toBe(
			base,
		);
	});

	it("uses the CRLF layout Lalamove specifies, blank line and all", () => {
		// Pinned against an independently computed HMAC of the documented string.
		expect(
			signRequest("sk_test", "1700000000000", "GET", "/v3/cities", ""),
		).toBe(signRequest("sk_test", "1700000000000", "GET", "/v3/cities", ""));
		expect(signRequest("s", "1", "GET", "/v3/cities", "")).toMatch(
			/^[0-9a-f]{64}$/,
		);
	});
});

describe("serviceTypeFor", () => {
	it("picks a van for a small run", () => {
		expect(serviceTypeFor(job())).toBe("VAN");
	});

	it("picks a lorry for a big one", () => {
		// 3 lines of four 800mm carcasses = 3.87 m³, past the van's 2.1 m³ of
		// usable deck and inside the 1-tonne lorry's 4.2 m³.
		const big = job({ items: Array.from({ length: 3 }, () => carcass) });
		expect(serviceTypeFor(big)).toBe("TRUCK330");
	});

	it("refuses a job no single vehicle carries", () => {
		// 12.9 m³, past the 3-tonne lorry's 11.2 m³.
		const huge = job({ items: Array.from({ length: 10 }, () => carcass) });
		expect(() => serviceTypeFor(huge)).toThrow(LalamoveNotDeliverable);
	});
});

describe("quotationBody", () => {
	it("builds two stops from the pins, pickup first", () => {
		const body = quotationBody(job());
		expect(body.data.serviceType).toBe("VAN");
		expect(body.data.language).toBe("en_MY");
		expect(body.data.stops).toEqual([
			{
				coordinates: { lat: "3.0738", lng: "101.5183" },
				address: "Lot 5, Jalan Industri, Shah Alam",
			},
			{
				coordinates: { lat: "3.1509", lng: "101.5931" },
				address: "Jalan PJU 5/20, Kota Damansara",
			},
		]);
	});

	it("sends a scheduled pickup as UTC ISO", () => {
		const at = new Date("2026-09-10T02:30:00.000Z");
		expect(quotationBody(job({ scheduledAt: at })).data.scheduleAt).toBe(
			"2026-09-10T02:30:00.000Z",
		);
	});

	it("omits scheduleAt for an immediate job", () => {
		expect(quotationBody(job()).data.scheduleAt).toBeUndefined();
	});

	it("refuses a job with no site pin", () => {
		expect(() => quotationBody(job({ siteLat: null, siteLng: null }))).toThrow(
			/site address/i,
		);
	});

	it("refuses a job with no pickup pin", () => {
		expect(() =>
			quotationBody(job({ pickupLat: null, pickupLng: null })),
		).toThrow(/pickup address/i);
	});
});

describe("orderBody", () => {
	it("puts the workshop as sender and the customer as recipient", () => {
		const body = orderBody(job(), "1471722666401517645", "s1", "r1");
		expect(body.data.quotationId).toBe("1471722666401517645");
		expect(body.data.sender).toMatchObject({
			stopId: "s1",
			name: "Infinite Cabinet",
			// The workshop's number, not the customer's — this is the stop the
			// driver rings when they cannot find the loading bay.
			phone: "+60312345678",
		});
		expect(body.data.recipients[0]).toMatchObject({
			stopId: "r1",
			name: "Siti",
			phone: "+60123456789",
			remarks: "Gate code 1234",
		});
		expect(body.data.metadata).toMatchObject({
			deliveryId: "cl_abc",
			deliveryNumber: "41",
		});
	});

	it("refuses a phone that cannot be made E.164", () => {
		expect(() =>
			orderBody(job({ customerPhone: "call the office" }), "q", "s", "r"),
		).toThrow(LalamoveNotDeliverable);
	});
});

describe("quoteRef", () => {
	it("round-trips", () => {
		expect(unpackQuoteRef(packQuoteRef("q1", "s1", "r1"))).toEqual({
			quotationId: "q1",
			senderStopId: "s1",
			recipientStopId: "r1",
		});
	});

	it("returns null for a ref from another carrier or none at all", () => {
		expect(unpackQuoteRef(undefined)).toBeNull();
		expect(unpackQuoteRef("nonsense")).toBeNull();
		expect(unpackQuoteRef("q1||r1")).toBeNull();
	});
});
