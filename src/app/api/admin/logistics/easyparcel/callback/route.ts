import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/logistics/tokens";

export const runtime = "nodejs";

/**
 * Where EasyParcel sends the admin back with an authorization code.
 *
 * Always redirects to the logistics page rather than rendering — this is a
 * browser round trip, and the admin should land back where they started with a
 * banner saying what happened.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code") ?? "";
	const state = url.searchParams.get("state") ?? "";

	const expected = request.headers
		.get("cookie")
		?.match(/easyparcel_oauth_state=([^;]+)/)?.[1];

	const done = (result: string) => {
		const back = new URL("/admin/logistics", url.origin);
		back.searchParams.set("easyparcel", result);
		const response = NextResponse.redirect(back);
		response.cookies.delete("easyparcel_oauth_state");
		return response;
	};

	// An unmatched state means this code did not come from a link we issued.
	if (code === "" || state === "" || state !== expected) {
		return done("failed");
	}

	try {
		// Admin auth is one shared password, so there is no name to record beyond
		// the fact that someone holding it did this.
		await exchangeCode(code, "admin");
	} catch {
		return done("failed");
	}

	return done("connected");
}
