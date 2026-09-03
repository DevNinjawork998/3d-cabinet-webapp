/**
 * The one outbound HTTP helper the carrier adapters share.
 *
 * The app had none — Mux ships its own SDK and everything else is same-origin.
 * A logistics partner is the first third party we call by hand, and calling it
 * with a bare `fetch` means no timeout, which on Vercel means the function
 * hangs until the platform kills it at 30s and the admin sees nothing.
 */

export class CarrierHttpError extends Error {
	constructor(
		readonly carrierId: string,
		readonly status: number,
		readonly body: string,
	) {
		super(`${carrierId} responded ${status}`);
		this.name = "CarrierHttpError";
	}
}

const TIMEOUT_MS = 10_000;

type Options = {
	carrierId: string;
	method?: "GET" | "POST" | "PUT" | "DELETE";
	headers?: Record<string, string>;
	body?: unknown;
	/**
	 * Whether this call is safe to send twice. Quotes and tracking reads are;
	 * **booking is not** — a retried booking buys a second lorry. Defaults to
	 * false so a new adapter has to opt in rather than forget to opt out.
	 */
	idempotent?: boolean;
};

/** JSON in, JSON out. Non-2xx throws with the body attached for the event log. */
export async function carrierFetch<T>(
	url: string,
	options: Options,
): Promise<T> {
	const { carrierId, method = "GET", headers = {}, body, idempotent } = options;

	// One retry, only for calls that can safely be sent twice, and only for the
	// failures a retry can fix: a dropped connection or the carrier's own 5xx.
	// A 4xx is our payload being wrong and will be wrong again.
	const attempts = idempotent ? 2 : 1;
	let lastError: unknown;

	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			const response = await fetch(url, {
				method,
				headers: {
					"content-type": "application/json",
					accept: "application/json",
					...headers,
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});

			if (!response.ok) {
				const text = await response.text().catch(() => "");
				const error = new CarrierHttpError(carrierId, response.status, text);
				if (response.status >= 500 && attempt < attempts - 1) {
					lastError = error;
					continue;
				}
				throw error;
			}

			return (await response.json()) as T;
		} catch (error) {
			// A CarrierHttpError here is a 4xx, or a 5xx on the final attempt.
			if (error instanceof CarrierHttpError) throw error;
			lastError = error;
			if (attempt === attempts - 1) throw error;
		}
	}

	throw lastError;
}
