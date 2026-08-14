import "server-only";
import { createHash } from "node:crypto";
import { del, head, put } from "@vercel/blob";

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
 */

const MAX_SKP_BYTES = 4 * 1024 * 1024; // Vercel's request body ceiling has
// headroom above a typical 3 MB job file; see the plan's note on switching
// to client-direct upload if a file ever needs more room than this allows.

export class SkpTooLargeError extends Error {
	constructor(sizeBytes: number) {
		super(
			`.skp file is ${(sizeBytes / 1024 / 1024).toFixed(1)}MB, over the ${MAX_SKP_BYTES / 1024 / 1024}MB ceiling`,
		);
		this.name = "SkpTooLargeError";
	}
}

export function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function sanitiseFilename(filename: string): string {
	return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Uploads one `.skp` job file to private Blob storage at
 * `skp/<importId>/<sanitised-filename>.skp`, keyed by an id the caller
 * already has (the `CatalogueImport` row this belongs to) so the Blob path
 * and the database row are traceable to each other in both directions.
 */
export async function putSkpFile(
	importId: string,
	filename: string,
	bytes: Uint8Array,
): Promise<{ url: string; pathname: string }> {
	if (bytes.byteLength > MAX_SKP_BYTES) {
		throw new SkpTooLargeError(bytes.byteLength);
	}

	const pathname = `skp/${importId}/${sanitiseFilename(filename)}`;
	const blob = await put(pathname, Buffer.from(bytes), {
		access: "private",
		contentType: "application/octet-stream",
		cacheControlMaxAge: 0,
		addRandomSuffix: false,
	});

	return { url: blob.url, pathname: blob.pathname };
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
 * the one place that would, if that policy ever changes.
 */
export async function deleteSkpFile(pathname: string): Promise<void> {
	await del(pathname);
}
