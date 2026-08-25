import "server-only";
import { createHash } from "node:crypto";
import { del, get, put } from "@vercel/blob";

/**
 * Object storage for raw design files: the client's OBJ exports, zipped with
 * their textures, for both catalogue import and the cabinet-design library.
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
 * The one definition of a design-import pathname: `mesh/<uuid>/<filename>`.
 *
 * The admin page builds the same shape inline rather than importing it —
 * this module is `server-only` and that page is a client component. Keep the
 * two in step.
 */
export const MESH_PATHNAME = /^mesh\/([0-9a-f-]{36})\/[^/]+$/;

/** The finalize route trusts this, not a client-sent importId field, since
 * the pathname is what the upload token was actually scoped to. */
export function importIdFromPathname(pathname: string): string | null {
	return pathname.match(MESH_PATHNAME)?.[1] ?? null;
}

export function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Fetches a just-uploaded design file back down for the finalize route to
 * parse — the server never trusts what the client says the bytes contained.
 * `useCache: false` is required, not optional — a private blob can take up
 * to 60s to propagate through the CDN cache after being written, and this
 * runs immediately after the client-direct upload resolves, squarely inside
 * that window. Without it this returns a stale (often 404) response nearly
 * every time rather than occasionally.
 */
export async function fetchMeshFile(pathname: string): Promise<Buffer> {
	const result = await get(pathname, { access: "private", useCache: false });
	if (result?.statusCode !== 200) {
		throw new Error(`could not fetch blob ${pathname}`);
	}
	return Buffer.from(await new Response(result.stream).arrayBuffer());
}

/**
 * Removes a design file. Retention policy is "keep forever", so this is not a
 * cleanup job — it is how the upload routes roll back the blob when the row
 * they were writing alongside it fails (a sha256 dupe, a bad payload) and
 * would otherwise leave the bytes orphaned.
 */
export async function deleteMeshFile(pathname: string): Promise<void> {
	await del(pathname);
}

// ----------------------------------------------------- derived render mesh --

/**
 * Where a design's derived render mesh lives: `render/<designId>/<sha256>.icbmesh`.
 *
 * The source export's own sha256 is in the name, which makes the pathname
 * change whenever the design does. That is what lets `/api/cabinet-mesh/[id]`
 * serve the bytes `immutable` — a given URL's contents can never change, and a
 * re-upload simply gets a different URL rather than fighting a year-long cache.
 */
export const renderMeshPathname = (designId: string, sha256: string) =>
	`render/${designId}/${sha256}.icbmesh`;

/**
 * Writes the derived mesh.
 *
 * Unlike the source export this *is* put from a Buffer server-side, and that is
 * fine: the client's whole wall run comes to 258KB and one cabinet to ~42KB,
 * nowhere near the 4.5MB function body cap that forces raw uploads to go
 * client-direct.
 *
 * `addRandomSuffix: false` because the pathname is already unique by content —
 * see `renderMeshPathname` — and a stable name means republishing the same
 * design overwrites rather than accumulating copies.
 *
 * `access: "private"` even though these bytes end up in front of customers.
 * The store is configured private-access-only and rejects a public write
 * outright, so the public hole is the route rather than the object — exactly
 * how `/api/site-images/[key]` already serves the homepage photos.
 */
export async function putRenderMeshFile(
	pathname: string,
	bytes: Uint8Array,
): Promise<void> {
	await put(pathname, Buffer.from(bytes), {
		access: "private",
		addRandomSuffix: false,
		contentType: "application/octet-stream",
		allowOverwrite: true,
	});
}

/** Reads it back for `/api/cabinet-mesh/[id]` to stream to the planner. */
export async function fetchRenderMeshFile(pathname: string): Promise<Buffer> {
	const result = await get(pathname, { access: "private" });
	if (result?.statusCode !== 200) {
		throw new Error(`could not fetch render mesh ${pathname}`);
	}
	return Buffer.from(await new Response(result.stream).arrayBuffer());
}
