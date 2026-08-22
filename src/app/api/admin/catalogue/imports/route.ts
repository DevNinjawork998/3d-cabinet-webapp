import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import {
	deleteMeshFile,
	fetchMeshFile,
	importIdFromPathname,
	sha256Hex,
} from "@/lib/catalogue/meshBlob";
import type { CatalogueDraft } from "@/lib/mesh/extract";
import { readMeshArchive } from "@/lib/mesh/read";

export const runtime = "nodejs";

/**
 * The finalize route. The client calls this itself right after
 * `upload()` resolves — see the token route for why (no `onUploadCompleted`
 * webhook locally). Trust comes from re-fetching the bytes by pathname and
 * parsing those, never from anything the client claims about the file's
 * contents.
 */
export async function POST(request: Request) {
	const body = (await request.json()) as {
		blobUrl?: string;
		blobPathname?: string;
		filename?: string;
	};
	const { blobUrl, blobPathname, filename } = body;
	if (!blobUrl || !blobPathname || !filename) {
		return NextResponse.json({ error: "missing fields" }, { status: 400 });
	}

	const importId = importIdFromPathname(blobPathname);
	if (!importId) {
		return NextResponse.json({ error: "invalid pathname" }, { status: 400 });
	}

	const bytes = await fetchMeshFile(blobPathname);
	const sha256 = sha256Hex(bytes);

	const existing = await prisma.catalogueImport.findUnique({
		where: { sha256 },
	});
	if (existing) {
		// This exact file was already imported under a different upload — the
		// new blob is a duplicate of bytes we already have, not new evidence.
		await deleteMeshFile(blobPathname);
		return NextResponse.json(
			{ error: "duplicate", importId: existing.id },
			{ status: 409 },
		);
	}

	let draft: CatalogueDraft;
	try {
		draft = readMeshArchive(bytes).draft;
	} catch (error) {
		// Leave the blob in place — a parse failure is exactly when a human
		// needs to go look at the raw file.
		return NextResponse.json(
			{ error: "parse_failed", message: (error as Error).message },
			{ status: 422 },
		);
	}

	const uploadedBy = "admin"; // ponytail: shared-secret auth has no identity
	// to attach beyond "an admin". Real names land with the Phase 3 inbox's
	// per-user accounts (see the DB-backed-catalogue plan).

	const created = await prisma.catalogueImport.create({
		data: {
			id: importId,
			filename,
			blobUrl,
			blobPathname,
			sizeBytes: bytes.byteLength,
			sha256,
			sourceVersion: draft.sourceVersion,
			draft: draft as object,
			warnings: draft.warnings,
			uploadedBy,
		},
	});

	return NextResponse.json({ importId: created.id, draft });
}
