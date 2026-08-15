import "server-only";
import { createHash } from "node:crypto";
import { del, get, head } from "@vercel/blob";

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
 * file *to* Blob from a Buffer. What's left is: build the pathname the
 * client uploads to, and fetch the bytes back down for server-side
 * extraction once the client says the upload finished.
 */

export function skpPathname(importId: string, filename: string): string {
	return `skp/${importId}/${sanitiseFilename(filename)}`;
}

/** The inverse of `skpPathname` — the finalize route trusts this, not a
 * client-sent importId field, since the pathname is what the upload token
 * was actually scoped to. */
export function importIdFromPathname(pathname: string): string | null {
	const match = pathname.match(/^skp\/([0-9a-f-]{36})\//);
	return match ? match[1] : null;
}

function sanitiseFilename(filename: string): string {
	return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
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

/** Whether a `.skp` at this pathname is still there. Used before a re-download. */
export async function skpFileExists(pathname: string): Promise<boolean> {
	try {
		await head(pathname);
		return true;
	} catch {
		return false;
	}
}

/**
 * Not called anywhere yet — retention policy is "keep forever" (see the
 * DB-backed-catalogue plan), so nothing currently deletes a `.skp`. Kept as
 * the one place that would, if that policy ever changes, and for cleaning up
 * an orphaned re-upload's blob when the finalize route hits a sha256 dupe.
 */
export async function deleteSkpFile(pathname: string): Promise<void> {
	await del(pathname);
}
