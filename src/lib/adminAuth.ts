import "server-only";

/**
 * Shared-secret admin gate — not Auth.js/Better Auth (see the
 * DB-backed-catalogue plan's Decisions table). Three internal users, one
 * locked door, no user table. Upgrade to per-user accounts when the Phase 3
 * admin inbox needs to know *which* admin did something, not just that one
 * did.
 *
 * Web Crypto, not `node:crypto` — this also runs inside `middleware.ts`,
 * which executes on the Edge runtime and doesn't have Node's crypto module.
 */

export const ADMIN_COOKIE = "admin_session";

function secret(): string {
	const value = process.env.ADMIN_PASSWORD;
	if (!value) throw new Error("ADMIN_PASSWORD is not set");
	return value;
}

async function hmacHex(message: string, key: string): Promise<string> {
	const enc = new TextEncoder();
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		enc.encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		cryptoKey,
		enc.encode(message),
	);
	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Constant-time-ish string compare — no early return on the first mismatch. */
function timingSafeEqualStr(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

/** The cookie value: not the password itself, an HMAC of it so the cookie
 * alone (readable by anyone with disk/devtools access to it) doesn't leak
 * the password admins actually type in. */
export async function signAdminSession(): Promise<string> {
	return hmacHex("admin", secret());
}

export async function isValidAdminSession(
	cookieValue: string | undefined,
): Promise<boolean> {
	if (!cookieValue) return false;
	return timingSafeEqualStr(await signAdminSession(), cookieValue);
}

export function checkAdminPassword(password: string): boolean {
	return timingSafeEqualStr(password, secret());
}
