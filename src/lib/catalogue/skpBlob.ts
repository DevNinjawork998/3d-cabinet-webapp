import "server-only";
import { createHash } from "node:crypto";
import { del, get } from "@vercel/blob";

/**
 * Object storage for raw `.skp` job files.
 *
 * Private, not public — unlike canvas screenshots and quote PDFs, which
 * exist to be shared over WhatsApp, a job file carries the client's own
 * module standard and part naming. Leaking one is a commercial problem, so
 * it never gets a public URL.
 *
 * Never store the binary in Postgres — same "no base64 images in a column"
 * reasoning as screenshots, only worse: a job file is ~3 MB, a screenshot is
 * tens of KB. `CatalogueImport.blobUrl`/`blobPathname` are the only things
 * that live in the database; the bytes live here.
 *
 * Upload itself is client-direct-to-Blob (`@vercel/blob/client`'s
 * `upload()`, called from the admin UI against the token route) — Vercel
 * Functions hard-cap request bodies at 4.5MB, so nothing here ever puts a
 * file *to* Blob from a Buffer. The client builds the pathname it uploads
 * to; what's left here is validating that pathname and fetching the bytes
 * back down for server-side extraction once the upload finished.
 */

/**
 * The one definition of an `.skp` blob pathname: `skp/<uuid>/<filename>`.
 *
 * The admin page builds the same shape inline rather than importing it —
 * this module is `server-only` and that page is a client component. Keep the
 * two in step.
 */
export const SKP_PATHNAME = /^skp\/([0-9a-f-]{36})\/[^/]+$/;

/** The finalize route trusts this, not a client-sent importId field, since
 * the pathname is what the upload token was actually scoped to. */
export function importIdFromPathname(pathname: string): string | null {
	return pathname.match(SKP_PATHNAME)?.[1] ?? null;
}

export function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Fetches a just-uploaded `.skp` back down for the finalize route to parse.
 * `useCache: false` is required, not optional — a private blob can take up
 * to 60s to propagate through the CDN cache after being written, and this
 * runs immediately after the client-direct upload resolves, squarely inside
 * that window. Without it this returns a stale (often 404) response nearly
 * every time rather than occasionally.
 */
export async function fetchSkpFile(pathname: string): Promise<Buffer> {
	const result = await get(pathname, { access: "private", useCache: false });
	if (result?.statusCode !== 200) {
		throw new Error(`could not fetch blob ${pathname}`);
	}
	return Buffer.from(await new Response(result.stream).arrayBuffer());
}

/**
 * Removes a `.skp`. Retention policy is "keep forever", so this is not a
 * cleanup job — it is how the upload routes roll back the blob when the row
 * they were writing alongside it fails (a sha256 dupe, a bad payload) and
 * would otherwise leave the bytes orphaned.
 */
export async function deleteSkpFile(pathname: string): Promise<void> {
	await del(pathname);
}
