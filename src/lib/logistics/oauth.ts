import { z } from "zod";
import { carrierFetch } from "./http";

/**
 * EasyParcel's OAuth 2.0 half that touches no database.
 *
 * Split out of `tokens.ts` so it can be tested the way everything else in this
 * folder is — a stubbed `fetch` and no Prisma client. The token exchange is the
 * single call most likely to be wrong (form-encoded body, Basic app auth, a
 * reply shape we do not control), so it is the call that most needs to be
 * covered without a database in the way.
 *
 * Deliberately not `server-only`: it reads the client secret from the
 * environment, and a client bundle has no environment to read it from, but the
 * file that holds the credentials for real is `tokens.ts` and that one is.
 */

export const OAUTH_BASE = "https://api.easyparcel.com";

const CLIENT_ID = () => process.env.EASYPARCEL_CLIENT_ID ?? "";
const CLIENT_SECRET = () => process.env.EASYPARCEL_CLIENT_SECRET ?? "";

export function easyparcelAppConfigured(): boolean {
	return CLIENT_ID() !== "" && CLIENT_SECRET() !== "";
}

/**
 * The URL EasyParcel sends the admin back to. Must match a redirect URI
 * registered on the app in their Developer Hub, byte for byte — a mismatch is
 * an error on their login page, not in our logs.
 */
export function easyparcelRedirectUri(): string {
	const base = process.env.APP_URL ?? "http://localhost:3000";
	return `${base}/api/admin/logistics/easyparcel/callback`;
}

export function easyparcelLoginUrl(state: string): string {
	const url = new URL(`${OAUTH_BASE}/oauth/login`);
	url.searchParams.set("client_id", CLIENT_ID());
	url.searchParams.set("redirect_uri", easyparcelRedirectUri());
	url.searchParams.set("state", state);
	return url.toString();
}

/**
 * Their token reply. `expires_at` is present in the documented sample but is
 * only ever derived from `expires_in`, so it is optional here and the seconds
 * are what we compute from — one clock (ours) rather than two.
 */
export const tokenResponseSchema = z.object({
	token_type: z.string().optional(),
	access_token: z.string().min(1),
	refresh_token: z.string().min(1),
	expires_in: z.number().int().positive(),
	expires_at: z.string().optional(),
	refresh_token_expires_in: z.number().int().positive(),
	refresh_token_expires_at: z.string().optional(),
	app: z.looseObject({}).optional(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

/**
 * How close to the expiry counts as expired.
 *
 * A token with twenty seconds left is a token that expires mid-request. Sixty
 * seconds is enough for the slowest call `carrierFetch` will wait for.
 */
const MARGIN_MS = 60_000;

export function willExpireSoon(expiresAt: Date, now = new Date()): boolean {
	return expiresAt.getTime() - now.getTime() <= MARGIN_MS;
}

// Corrected per pre-flight ruling: tokens.ts imports this, so it must be
// exported — the brief's interface list already says so.
export function expiryFrom(seconds: number): Date {
	return new Date(Date.now() + seconds * 1000);
}

/** `Basic base64(client_id:client_secret)` — how their token endpoint authenticates the app. */
function basicAuth(): string {
	const raw = `${CLIENT_ID()}:${CLIENT_SECRET()}`;
	return `Basic ${Buffer.from(raw).toString("base64")}`;
}

/**
 * Their token endpoint takes form-encoded parameters, not JSON — so this is the
 * one call in the logistics module that does not go through `carrierFetch`'s
 * JSON body path. The string body form exists for exactly this.
 */
export async function requestToken(
	params: Record<string, string>,
): Promise<TokenResponse> {
	const body = new URLSearchParams(params).toString();
	const reply = await carrierFetch<unknown>(`${OAUTH_BASE}/oauth/token`, {
		carrierId: "easyparcel",
		method: "POST",
		headers: {
			authorization: basicAuth(),
			"content-type": "application/x-www-form-urlencoded",
		},
		body,
		// Safe to send twice: an authorization code that has already been spent
		// comes back as a 4xx, which is not retried.
		idempotent: true,
	});
	const parsed = tokenResponseSchema.safeParse(reply);
	if (!parsed.success) {
		throw new Error(
			`EasyParcel's token reply was not the shape we expect: ${JSON.stringify(reply)?.slice(0, 200)}`,
		);
	}
	return parsed.data;
}
