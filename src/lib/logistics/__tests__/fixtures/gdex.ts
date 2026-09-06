/**
 * GDEX's own replies, verbatim, captured from the sandbox on 2026-09-06 by
 * booking consignment TCN170001588 and cancelling it again.
 *
 * Verbatim is the point. GDEX's documentation omits fields that decide
 * behaviour — `IsValid` on a shipment status is the standing example, and
 * reading a status off a row without it reported a parcel that does not exist
 * as booked. A test built on a hand-written reply proves the parser matches
 * itself; one built on theirs proves it matches them. `pnpm gdex:ping` is what
 * notices when a shape moves, and this file is what gets corrected.
 */

/** The whole pickup board. `Consignments` is populated here. */
export const upcomingPickupsReply = {
	statusCode: 200,
	data: [
		{
			PickupNo: "CPAA166526",
			Consignments: ["TCN170001588"],
			Status: "Pending",
			Transportation: "Motorbike",
			PickupAddress:
				"B-28-05, Nest 3 Residence   59200 Kuala Lumpur Kuala Lumpur Malaysia",
			ParcelReadyTime: "10:00 AM",
			PickupTime: "2026-09-08T00:00:00",
			PickupRemark: "Sandbox verification — please ignore",
			IsTrolleyRequired: false,
		},
	],
	message: null,
};

/**
 * One consignment's pickup. Same shape as a board row with two differences
 * that are GDEX's, not ours: `Consignments` comes back null, and
 * `ParcelReadyTime` is formatted "10:00am" where the board says "10:00 AM".
 */
export const pickupReferenceReply = {
	statusCode: 200,
	data: {
		PickupNo: "CPAA166526",
		Consignments: null,
		Status: "Pending",
		Transportation: "Motorbike",
		PickupAddress:
			"B-28-05, Nest 3 Residence   59200 Kuala Lumpur Kuala Lumpur Malaysia",
		ParcelReadyTime: "10:00am",
		PickupTime: "2026-09-08T00:00:00",
		PickupRemark: "Sandbox verification — please ignore",
		IsTrolleyRequired: false,
	},
	message: null,
};

/** Cancelling the consignment cancels its collection too. */
export const pickupCancelledRefusal = {
	statusCode: 400,
	data: null,
	message: "Pickup Is Already Cancelled",
};

/**
 * What the WRONG parameter name gets. `GetPickUpReference` takes
 * `ConsignmentNo`; every other operation takes `ConsignmentNumber`, and using
 * that here blames the consignment for a misspelled query string.
 */
export const pickupWrongParamRefusal = {
	statusCode: 400,
	data: null,
	message: "Consignment Number Not Found",
};
