#!/usr/bin/env node
/**
 * Talk to EasyParcel without the app in the way.
 *
 * The stubbed-fetch tests prove the adapter matches the fixtures in
 * `__tests__/fixtures/easyparcel.ts`, and those fixtures are EasyParcel's
 * documented samples — which is our *belief* about their API, not their API. A
 * renamed field passes every test in CI and fails the first real booking. This
 * is what notices.
 *
 *   node --env-file=.env.local scripts/easyparcel-ping.mjs
 *   pnpm easyparcel:ping
 *
 * It reads only: the wallet (proves the token works and says whether a booking
 * could even be paid for) and a quotation for a small parcel between two real
 * Klang Valley postcodes. It never submits an order — that spends credit.
 */

const CLIENT_ID = process.env.EASYPARCEL_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.EASYPARCEL_CLIENT_SECRET ?? "";
const REFRESH_TOKEN =
	process.argv[2] ?? process.env.EASYPARCEL_REFRESH_TOKEN ?? "";

const VERSION = "2026-06";
const BASE = `https://api.easyparcel.com/open_api/${VERSION}`;

if (CLIENT_ID === "" || CLIENT_SECRET === "") {
	console.error(
		"No app credentials. Run with `node --env-file=.env.local scripts/easyparcel-ping.mjs`,\n" +
			"or set EASYPARCEL_CLIENT_ID and EASYPARCEL_CLIENT_SECRET in the environment.",
	);
	process.exit(1);
}
if (REFRESH_TOKEN === "") {
	console.error(
		"No refresh token. Connect an account at /admin/logistics first, then copy the\n" +
			"CarrierToken.refreshToken column here:\n" +
			"  pnpm easyparcel:ping <refresh_token>",
	);
	process.exit(1);
}

/**
 * A refresh, not a full authorization-code dance — that needs a browser, and
 * this script has none. It also means the token this prints is the one the app
 * would have used, which is the comparison worth making.
 */
async function accessToken() {
	const response = await fetch("https://api.easyparcel.com/oauth/token", {
		method: "POST",
		headers: {
			authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
			"content-type": "application/x-www-form-urlencoded",
			accept: "application/json",
		},
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: REFRESH_TOKEN,
		}).toString(),
	});
	const text = await response.text();
	console.log(`\n── POST /oauth/token → ${response.status}\n${text}\n`);
	if (!response.ok) process.exit(1);
	const body = JSON.parse(text);
	// The refresh token rotates. Print the new one, because the old one in the
	// DB is now dead and anyone re-running this needs the replacement.
	console.log(
		`New refresh token (the old one is now spent):\n  ${body.refresh_token}\n`,
	);
	return body.access_token;
}

async function call(token, method, path, payload) {
	const response = await fetch(`${BASE}${path}`, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
			accept: "application/json",
		},
		...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
	});
	const text = await response.text();
	console.log(`── ${method} ${path} → ${response.status}\n${text}\n`);
	return text;
}

const token = await accessToken();

// Says whether a booking could be paid for at all, and proves the token works.
await call(token, "GET", "/wallet");

// A small parcel, workshop to Kota Damansara. Read-only: no credit is spent.
await call(token, "POST", "/shipment/quotations", {
	shipment: [
		{
			sender: { postcode: "43800", subdivision_code: "MY-10", country: "MY" },
			receiver: { postcode: "47810", subdivision_code: "MY-10", country: "MY" },
			weight: 7,
			length: 72,
			width: 40,
			height: 2,
			parcel_value: 1,
		},
	],
});

console.log(
	"Compare the shapes above against src/lib/logistics/__tests__/fixtures/easyparcel.ts.\n" +
		"A field that has moved or been renamed is a fixture to correct and a schema to widen.",
);
