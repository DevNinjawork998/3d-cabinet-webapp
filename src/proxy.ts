import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, isValidAdminSession } from "@/lib/adminAuth";

/**
 * Gates `/admin/*` and `/api/admin/*` behind the shared-secret cookie.
 * `/api/admin/login` itself must stay open — that's how the cookie gets set
 * in the first place.
 */
export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	if (pathname === "/api/admin/login" || pathname === "/admin/login") {
		return NextResponse.next();
	}

	const session = request.cookies.get(ADMIN_COOKIE)?.value;
	if (await isValidAdminSession(session)) return NextResponse.next();

	if (pathname.startsWith("/api/admin")) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	const loginUrl = new URL("/admin/login", request.url);
	loginUrl.searchParams.set("next", pathname);
	return NextResponse.redirect(loginUrl);
}

export const config = {
	matcher: ["/admin/:path*", "/api/admin/:path*"],
};
