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
	await prisma.carrierToken.upsert({
		where: { carrierId },
		create: { carrierId, ...data },
		update: data,
	});
}

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
	await write("easyparcel", token, connectedBy);
	trace("easyparcel.connected", { connectedBy });
}

export async function hasConnection(carrierId: string): Promise<boolean> {
	const row = await prisma.carrierToken.findUnique({ where: { carrierId } });
	return row !== null && row.refreshTokenExpiresAt.getTime() > Date.now();
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
 * A usable access token, refreshing it if it is close to expiry.
 *
 * The whole read-check-refresh-write runs inside one transaction holding a
 * Postgres advisory lock — see `LOCK_ID`. The lock is released when the
 * transaction ends, including when it throws.
 */
export async function accessTokenFor(carrierId: string): Promise<string> {
	if (!easyparcelAppConfigured()) throw new CarrierNotConfigured(carrierId);

	return prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ID})`;

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
	});
}
