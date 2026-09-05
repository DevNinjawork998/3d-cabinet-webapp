import "server-only";
import { prisma } from "@/lib/catalogue/db";
import {
	easyparcelAppConfigured,
	easyparcelRedirectUri,
	expiryFrom,
	requestToken,
	type TokenResponse,
	willExpireSoon,
} from "./oauth";
import { trace } from "./trace";
import { CarrierNotConfigured } from "./types";

/**
 * Where a logistics partner's OAuth tokens are read, refreshed and written.
 *
 * One file, for the same reason `store.ts` is one file: two callers refreshing
 * a rotating credential in two places is a credential neither of them holds any
 * more. Every EasyParcel call goes through `accessTokenFor`.
 */

async function write(
	tx: Pick<typeof prisma, "carrierToken">,
	carrierId: string,
	token: TokenResponse,
	connectedBy?: string,
) {
	const data = {
		accessToken: token.access_token,
		refreshToken: token.refresh_token,
		accessTokenExpiresAt: expiryFrom(token.expires_in),
		refreshTokenExpiresAt: expiryFrom(token.refresh_token_expires_in),
		...(connectedBy ? { connectedBy } : {}),
	};
	await tx.carrierToken.upsert({
		where: { carrierId },
		create: { carrierId, ...data },
		update: data,
	});
}

/**
 * One lock id for all carrier tokens.
 *
 * ponytail: a single advisory lock serialises every refresh in the app, which
 * is correct and slightly coarse. It is here because the refresh token rotates:
 * two instances refreshing at once means the loser presents a token EasyParcel
 * has already invalidated, and the connection is dead until someone
 * re-authorises. Hash the carrierId into the lock id if a second OAuth partner
 * ever makes the contention real.
 */
const LOCK_ID = 8_215_041;

/**
 * How long the transaction is allowed to run versus how long it may wait to
 * start.
 *
 * `requestToken` can take up to `TIMEOUT_MS` (10s) × 2 attempts — one retry on
 * a 5xx — so Prisma's 5s default transaction timeout would trip mid-call,
 * roll back, and leave the row holding a refresh token EasyParcel has already
 * invalidated by issuing the new one. That is the exact dead-connection
 * outcome the advisory lock exists to prevent, reachable here with no
 * concurrency at all — just a slow round trip. 25s comfortably outlives the
 * HTTP budget; `maxWait` is how long a second caller queues for the lock
 * before giving up, not part of the HTTP budget itself.
 */
const TRANSACTION_OPTIONS = { timeout: 25_000, maxWait: 10_000 };

/** The first authorisation: an admin has just come back from EasyParcel's login. */
export async function exchangeCode(
	code: string,
	connectedBy: string,
): Promise<void> {
	const token = await requestToken({
		grant_type: "authorization_code",
		code,
		redirect_uri: easyparcelRedirectUri(),
	});
	// Routed through the same lock as a refresh: a re-authorisation landing
	// mid-refresh must not overwrite the pair a concurrent refresh is about to
	// write, or clobber it with one derived from a token that refresh has
	// already caused EasyParcel to invalidate.
	await prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ID}::bigint)`;
		await write(tx, "easyparcel", token, connectedBy);
	}, TRANSACTION_OPTIONS);
	trace("easyparcel.connected", { connectedBy });
}

export async function hasConnection(carrierId: string): Promise<boolean> {
	const row = await prisma.carrierToken.findUnique({ where: { carrierId } });
	return row !== null && row.refreshTokenExpiresAt.getTime() > Date.now();
}

/**
 * A usable access token, refreshing it if it is close to expiry.
 *
 * The whole read-check-refresh-write runs inside one transaction holding a
 * Postgres advisory lock — see `LOCK_ID`. The lock is released when the
 * transaction ends, including when it throws.
 */
export async function accessTokenFor(carrierId: string): Promise<string> {
	if (!easyparcelAppConfigured()) throw new CarrierNotConfigured(carrierId);

	return prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ID}::bigint)`;

		const row = await tx.carrierToken.findUnique({ where: { carrierId } });
		if (!row) throw new CarrierNotConfigured(carrierId);

		if (!willExpireSoon(row.accessTokenExpiresAt)) return row.accessToken;

		if (row.refreshTokenExpiresAt.getTime() <= Date.now()) {
			// A year is up. Nothing here can fix it — an admin has to click through
			// EasyParcel's login again.
			throw new CarrierNotConfigured(carrierId);
		}

		trace("easyparcel.refresh", { carrierId });
		const token = await requestToken({
			grant_type: "refresh_token",
			refresh_token: row.refreshToken,
			redirect_uri: easyparcelRedirectUri(),
		});

		await tx.carrierToken.update({
			where: { carrierId },
			data: {
				accessToken: token.access_token,
				refreshToken: token.refresh_token,
				accessTokenExpiresAt: expiryFrom(token.expires_in),
				refreshTokenExpiresAt: expiryFrom(token.refresh_token_expires_in),
			},
		});

		return token.access_token;
	}, TRANSACTION_OPTIONS);
}
