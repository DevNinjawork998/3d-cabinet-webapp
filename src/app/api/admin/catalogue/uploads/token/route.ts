import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { SKP_PATHNAME } from "@/lib/catalogue/skpBlob";

export const runtime = "nodejs";

/**
 * Issues the short-lived token `@vercel/blob/client`'s `upload()` needs to
 * write straight to Blob from the browser. Auth is handled by middleware
 * (this route sits under `/api/admin/*`) — by the time this runs, the
 * request already carries a valid admin session cookie.
 *
 * The client picks the `importId` (a `crypto.randomUUID()`) and builds the
 * pathname itself before calling `upload()` — `onBeforeGenerateToken` only
 * gets to see the pathname the client already chose, not invent one, so
 * there's no way to hand back a server-generated id here. That's fine: the
 * id is just a path key for namespacing, not a trust boundary. The real
 * integrity check is the finalize route's sha256 dedupe against bytes it
 * fetches back itself.
 *
 * No `onUploadCompleted`: that webhook doesn't fire on localhost without an
 * ngrok tunnel (confirmed against Vercel's own docs), and this is a
 * three-person internal tool with no reason to require one. The client
 * calls `/api/admin/catalogue/imports` itself once `upload()` resolves.
 */
export async function POST(request: Request) {
	const body = (await request.json()) as HandleUploadBody;

	try {
		const jsonResponse = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (pathname) => {
				if (!SKP_PATHNAME.test(pathname)) {
					throw new Error(`invalid .skp pathname: ${pathname}`);
				}
				return {
					// No `allowedContentTypes`: `.skp` isn't a MIME type browsers
					// recognise, and Chrome sniffs it to essentially random values
					// (`application/vnd.koan` for this exact file) that don't follow
					// a `type/*` pattern a wildcard could cover — the SDK's own
					// wildcard matching only accepts literal `type/*` entries, not a
					// blanket `*/*`. Content type isn't a trust boundary here
					// anyway; the finalize route validates the actual bytes.
					addRandomSuffix: false,
				};
			},
		});
		return NextResponse.json(jsonResponse);
	} catch (error) {
		return NextResponse.json(
			{ error: (error as Error).message },
			{ status: 400 },
		);
	}
}
