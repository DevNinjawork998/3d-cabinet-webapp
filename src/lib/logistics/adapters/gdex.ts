import "server-only";
import { CarrierNotConfigured } from "../types";
import { stubAdapter } from "./stub";

/**
 * GDEX — a parcel partner.
 *
 * Not implemented. The request and response shapes are not public enough to
 * write against, and a guessed payload would be rewritten the day the real
 * documentation arrives. `enabledCarriers()` leaves it out of the comparison
 * until `GDEX_API_KEY` is set, so nothing here is reachable by accident.
 *
 * ponytail: stub until the GDEX API docs land. Implementing it is one file —
 * this one — plus its statuses in `status.ts` and its webhook secret.
 */
export const gdexAdapter = stubAdapter("gdex", () => {
	throw new CarrierNotConfigured("gdex");
});
