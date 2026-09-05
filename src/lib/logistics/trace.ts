/**
 * One line of server log per step of a carrier call, when someone is watching.
 *
 * A partner comparison can fail in five places — no credentials, no pin, a
 * refused payload, a shape we did not expect, a timeout — and four of them
 * currently reach the admin as the same blank row. This is the record that
 * tells them apart: what we sent, what came back, and where it stopped.
 *
 * Off unless `LOGISTICS_DEBUG=1`, because it prints request bodies and a quote
 * comparison would otherwise write four of them into production logs on every
 * click.
 */

/** Read per call, not once at import: a test flips it between cases. */
const on = () => process.env.LOGISTICS_DEBUG === "1";

/** Anything whose name says it is a credential. Value never printed. */
const SECRET = /authorization|secret|api[_-]?key|token|password/i;

/**
 * A carrier's reply can be a page of HTML when something is badly wrong, and a
 * log line nobody can scroll past is a log line nobody reads.
 */
const MAX = 2000;

function redact(value: unknown): unknown {
	if (typeof value === "string") {
		return value.length <= MAX
			? value
			: `${value.slice(0, MAX)}…(+${value.length - MAX} more)`;
	}
	if (Array.isArray(value)) return value.map(redact);
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, inner]) => [
				key,
				SECRET.test(key) ? "[redacted]" : redact(inner),
			]),
		);
	}
	return value;
}

export function trace(scope: string, data: Record<string, unknown>): void {
	if (!on()) return;
	console.log(`[logistics] ${scope}`, JSON.stringify(redact(data)));
}
