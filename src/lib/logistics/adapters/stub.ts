import "server-only";
import type { CarrierAdapter } from "../types";

/**
 * A partner we have signed but not yet written.
 *
 * Every method fails the same way, so a stub that somehow gets called produces
 * a `CarrierNotConfigured` the routes already know how to report, rather than
 * an undefined-is-not-a-function five frames deep.
 */
export function stubAdapter(id: string, fail: () => never): CarrierAdapter {
	return {
		id,
		isConfigured: () => false,
		async quote() {
			fail();
		},
		async book() {
			fail();
		},
		async track() {
			fail();
		},
	};
}
