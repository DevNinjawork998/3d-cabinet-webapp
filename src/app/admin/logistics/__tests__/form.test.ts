import { describe, expect, it } from "vitest";
import { blankForm, type DeliveryRow, formFrom, toPayload } from "../form";

const row: DeliveryRow = {
	id: "d1",
	number: 3,
	customerName: "Tesing Customer",
	customerPhone: "012345678",
	siteAddress: "12 Jalan Setia, Shah Alam",
	addressNotes: "Gate code 1234",
	pickupAddress: "Infinite Cabinet Sdn Bhd, Klang Valley, Selangor",
	siteLat: 3.1509,
	siteLng: 101.5931,
	pickupLat: null,
	pickupLng: null,
	items: [
		{
			label: "Base unit",
			qty: 2,
			widthMm: 800,
			heightMm: 720,
			depthMm: 560,
			weightKg: null,
		},
	],
	totalWeightKg: null,
	totalVolumeM3: 0.645,
	scheduledAt: null,
	carrierId: null,
	status: "DRAFT",
	quotedPriceRm: null,
	carrierOrderId: null,
	trackingUrl: null,
	labelUrl: null,
	driverName: null,
	driverPhone: null,
	vehiclePlate: null,
	lastLatitude: null,
	lastLongitude: null,
	lastLocationAt: null,
	bookedBy: null,
	createdAt: "2026-09-05T13:28:14.000Z",
};

describe("formFrom", () => {
	it("carries the row's id so a save becomes a PATCH", () => {
		expect(formFrom(row).id).toBe("d1");
	});

	it("leaves the coords field blank even when the row carries a stored pin", () => {
		// Prefilling it would resend the stored pin as an override on the next
		// save, which stops a corrected address from ever being re-geocoded.
		expect(formFrom(row).siteCoords).toBe("");
	});

	it("shows the stored pin as the placeholder instead", () => {
		expect(formFrom(row).sitePinPlaceholder).toBe("3.1509, 101.5931");
	});

	it("leaves the coords field empty when there is no pin", () => {
		expect(formFrom(row).pickupCoords).toBe("");
	});

	it("gives every item a key React can keep across edits", () => {
		const uids = formFrom({
			...row,
			items: [...row.items, ...row.items],
		}).items.map((i) => i.uid);
		expect(new Set(uids).size).toBe(2);
	});
});

describe("toPayload", () => {
	it("strips the form-only uid", () => {
		const body = toPayload(formFrom(row));
		expect(JSON.stringify(body)).not.toContain("uid");
	});

	it("drops items with no label, so a blank spare row is not saved", () => {
		const state = blankForm("Workshop");
		expect(toPayload(state).items).toEqual([]);
	});

	it("sends an empty access note as null, not an empty string", () => {
		expect(toPayload(blankForm("Workshop")).addressNotes).toBeNull();
	});

	it("sends the pasted pin as a coordinate override", () => {
		const state = { ...blankForm("Workshop"), siteCoords: "3.15, 101.59" };
		expect(toPayload(state)).toMatchObject({ siteLat: 3.15, siteLng: 101.59 });
	});

	it("sends no override for an edited row whose pin field was left untouched, so a changed address is re-geocoded", () => {
		expect(toPayload(formFrom(row))).toMatchObject({
			siteLat: null,
			siteLng: null,
		});
	});

	it("round-trips a scheduled time through the local datetime field", () => {
		const iso = new Date("2026-09-10T09:30:00+08:00").toISOString();
		const state = formFrom({ ...row, scheduledAt: iso });
		expect(toPayload(state).scheduledAt).toBe(iso);
	});
});
