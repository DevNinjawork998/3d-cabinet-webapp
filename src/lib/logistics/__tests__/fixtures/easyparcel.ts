/**
 * EasyParcel's own documented response samples, verbatim.
 *
 * Verbatim is the point. These are not payloads shaped to make our schemas
 * pass — they are what https://easyparcel.github.io/OpenAPI/ prints for the
 * `2026-06` version, trimmed only of fields no schema in this repo reads. A
 * test built on a hand-written response proves the parser matches itself; one
 * built on theirs proves it matches them.
 *
 * When EasyParcel changes a shape, `pnpm easyparcel:ping` is what notices and
 * this file is what gets corrected.
 */

export const tokenReply = {
	token_type: "Bearer",
	expires_in: 36000,
	expires_at: "2026-09-06T13:03:23.013Z",
	access_token: "at_sandbox",
	refresh_token: "rt_sandbox",
	refresh_token_expires_in: 31557600,
	refresh_token_expires_at: "2027-09-06T09:03:23.013Z",
	app: {
		client_id: "your client-id",
		callbackUrls: [],
		redirectUris: ["https://your-app/callback"],
	},
};

export const quotationReply = {
	status_code: 200,
	request_id: "1770285829860.591d8c4f-ca8d-4e8b-9871-28e86ae541d9",
	message: "1 request success, 0 request error.",
	data: [
		{
			status: "success",
			input: {},
			quotations: [
				{
					courier: {
						service_id: "EP-CS096",
						service_name: "Aramex (Pick Up)",
						courier_id: "EP-CR0AP",
						courier_name: "Aramex",
						courier_logo:
							"https://s3-ap-southeast-1.amazonaws.com/…/Aramex.jpg",
						delivery_duration: null,
						service_tag: [
							{ name: "Service Methods", value: "Pick Up from Door" },
						],
						is_pickup: true,
						is_dropoff: false,
					},
					pricing: {
						currency: "MYR",
						total_amount: "10.84",
						shipment_price: "9.80",
						shipment_tax: "0.59",
						total_features_price: "0.45",
						total_features_tax: "0.00",
					},
					features: [],
				},
				{
					courier: {
						service_id: "EP-CS09C",
						service_name: "City-Link (Drop Off)",
						courier_id: "EP-CR0CL",
						courier_name: "City-Link Express",
						courier_logo:
							"https://s3-ap-southeast-1.amazonaws.com/…/CityLink.jpg",
						delivery_duration: "1-3 working days",
						service_tag: [{ name: "Service Methods", value: "Drop-Off" }],
						is_pickup: false,
						is_dropoff: true,
					},
					pricing: { currency: "MYR", total_amount: "8.20" },
					features: [],
				},
			],
			errors: [],
		},
	],
};

/**
 * The same call against the **live** API, 2026-09-11, trimmed the same way.
 *
 * Kept next to `quotationReply` because they disagree: the documentation prints
 * every price as a string and the live service sends JSON numbers. The
 * documented sample alone let `total_amount: z.string()` ship, and the
 * EasyParcel row on the comparison screen then read "EasyParcel's quotation
 * reply was not the shape we expect" on every real job while the recorded
 * fixtures passed — the exact blind spot `pnpm easyparcel:ping` exists for.
 */
export const liveQuotationReply = {
	status_code: 200,
	request_id: "1789089907792.2e65020d-d1fe-4344-8556-b995da20b991",
	message: "1 request success, 0 request error.",
	data: [
		{
			status: "success",
			input: {
				sender: { postcode: "43300", subdivision_code: "MY-10", country: "MY" },
				receiver: {
					postcode: "42500",
					subdivision_code: "MY-10",
					country: "MY",
				},
				weight: 5,
			},
			quotations: [
				{
					courier: {
						service_id: "EP-CS096",
						service_name: "Aramex (Pick Up) (From Door to Door)",
						courier_id: "EP-CR0AP",
						courier_name: "Aramex",
						delivery_duration: null,
						is_pickup: true,
						is_dropoff: false,
					},
					pricing: {
						currency: "MYR",
						total_amount: 18.26,
						shipment_price: 16.8,
						shipment_tax: 1.01,
					},
					features: [],
				},
				{
					courier: {
						service_id: "EP-CS09C",
						service_name: "City-Link (Drop Off)",
						courier_id: "EP-CR0CL",
						courier_name: "City-Link Express",
						delivery_duration: "1-3 working days",
						is_pickup: false,
						is_dropoff: true,
					},
					pricing: { currency: "MYR", total_amount: 12.4 },
					features: [],
				},
			],
		},
	],
};

/** Their documented failure shape — HTTP 200, and the error is inside `data`. */
export const quotationRefusal = {
	status_code: 200,
	message: "0 request success, 1 request error.",
	data: [
		{
			status: "error",
			input: {},
			quotations: [],
			errors: ["No courier service available for this destination"],
		},
	],
};

export const submitReply = {
	status_code: 200,
	message: "1 request success, 0 request error.",
	data: [
		{
			status: "success",
			shipment_number: "ES-2602-VC4KV",
			courier: "DHL eCommerce",
			awb_number: "7028021894371796",
			awb_url:
				"https://app.easyparcel.com/portal/v2/public/label/ES-2602-VC4KV/3972206?format=A4",
			awb_urls_by_format: {
				A4: "https://app.easyparcel.com/portal/v2/public/label/ES-2602-VC4KV/3972206?format=A4",
				A5: "",
				A6: "https://app.easyparcel.com/portal/v2/public/label/ES-2602-VC4KV/3972206?format=A6",
			},
			tracking_url:
				"https://app.easyparcel.com/tools/easytrack/details?courier=DHLeC&awb=7028021894371796",
			weight: 4,
			height: 30,
			length: 40,
			width: 20,
			pricing_breakdown: { currency_code: "MYR", total_paid_amount: "13.42" },
			reference: "Delivery 41",
			errors: [],
		},
	],
};

/** A wallet with nothing in it is the failure an admin will actually hit. */
export const submitRefusal = {
	status_code: 200,
	message: "0 request success, 1 request error.",
	data: [
		{
			status: "error",
			shipment_number: null,
			errors: ["Insufficient credit balance"],
		},
	],
};

export const detailsReply = {
	status_code: 200,
	message: "success",
	data: [
		{
			shipment_number: "ES-2602-VC4KV",
			order_number: "EI-2602-U8FZW",
			shipment_details: {
				weight: 1.5,
				height: 5,
				length: 5,
				width: 5,
				shipment_status_code: 3,
				shipment_status: "Collected",
				awb_number: "7028021894371796",
				tracking_url:
					"https://app.easyparcel.com/tools/easytrack/details?courier=DHLeC&awb=7028021894371796",
			},
		},
	],
};

export const cancelReply = {
	status_code: 200,
	message: "1 requests success, 0 request error.",
	data: [
		{
			status: "success",
			message: "Shipment Cancelled",
			shipment_number: "ES-2602-VC4KV",
		},
	],
};

/** Same HTTP-200-carries-an-error shape as `submitRefusal` — already collected. */
export const cancelRefusal = {
	status_code: 200,
	message: "0 request success, 1 request error.",
	data: [
		{
			status: "error",
			message: null,
			shipment_number: "ES-2602-VC4KV",
			errors: ["Shipment has been collected and cannot be cancelled"],
		},
	],
};

/** The five webhook topics, from their sample block. */
export const webhooks = {
	statusUpdate: {
		topic: "shipment.status.update",
		awb_number: "238725129086",
		event_date: "2026-09-06 11:40:00",
		shipment_number: "ES-2504-G7FDF",
		shipment_status: "Cancelled",
		shipment_status_code: 0,
	},
	awbUpdate: {
		topic: "shipment.awb.update",
		shipment_number: "ES-2504-G7FDF",
		uuid: "webhook-test-uuid-123",
		timestamp: "2026-09-06 11:40:00",
		awb_number: "23872512999",
		awb_url: "http://demo.connect.easyparcel.my/?ac=AWBLabel&id=QmIxTE43",
		tracking_url:
			"https://easyparcel.com/my/en/track/details/?courier=Skynet&awb=23877001999",
	},
	trackingUpdate: {
		topic: "shipment.tracking.update",
		shipment_number: "ES-2504-G7FDF",
		uuid: "webhook-test-uuid-123",
		timestamp: "2026-09-06 11:40:00",
		awb_number: "238725129086",
		latest_shipment_status_code: 5,
		latest_tracking_status: "Deliverd To Suntech",
		status_log: [],
	},
	ondemandUpdate: {
		topic: "ondemand.status.update",
		order_number: "EODWEBHOOK-TEST-001",
		status: 2,
		event_date: "2026-09-06 04:21:07",
	},
};
