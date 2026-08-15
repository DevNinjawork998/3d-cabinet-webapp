import { NextResponse } from "next/server";
import {
	ADMIN_COOKIE,
	checkAdminPassword,
	signAdminSession,
} from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const { password } = (await request.json()) as { password?: string };
	if (typeof password !== "string" || !checkAdminPassword(password)) {
		return NextResponse.json({ error: "wrong password" }, { status: 401 });
	}

	const res = NextResponse.json({ ok: true });
	res.cookies.set(ADMIN_COOKIE, await signAdminSession(), {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 7, // a week — re-typing a password every session is friction with no security benefit for a three-person tool
	});
	return res;
}
