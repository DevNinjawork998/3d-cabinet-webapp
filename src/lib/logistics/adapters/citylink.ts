import "server-only";
import { CarrierNotConfigured } from "../types";
import { stubAdapter } from "./stub";

/**
 * City-Link — a parcel partner.
 *
 * Not implemented. The request and response shapes are not public enough to
 * write against, and a guessed payload would be rewritten the day the real
 * documentation arrives. `enabledCarriers()` leaves it out of the comparison
 * until `CITYLINK_API_KEY` is set, so nothing here is reachable by accident.
 *
 * ponytail: stub until the City-Link API docs land. Implementing it is one file —
 * this one — plus its statuses in `status.ts` and its webhook secret.
 */
export const citylinkAdapter = stubAdapter("citylink", () => {
	throw new CarrierNotConfigured("citylink");
});
