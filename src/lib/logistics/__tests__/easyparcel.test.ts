import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	cheapest,
	EasyParcelNotDeliverable,
	easyparcelAdapter,
	mmToCm,
	parcelOf,
	quotationBody,
} from "../adapters/easyparcel";
import { WORKSHOP_ADDRESS } from "../carriers";
import type { DeliveryItem, DeliveryJob } from "../types";
import { CarrierNotConfigured } from "../types";
import { quotationRefusal, quotationReply } from "./fixtures/easyparcel";

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
});
