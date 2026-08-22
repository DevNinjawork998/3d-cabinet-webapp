"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { CatalogueDraft } from "@/lib/skp/extract";

/**
 * Sales-side tool: drop a Mozaik `.skp` export in and read out the module
 * standard it was drawn to.
 *
 * Parse happens twice, deliberately. Locally first, for the instant preview
 * table; then again server-side on upload, because the published catalogue
 * is never derived from anything the client computed ("never parse bytes the
 * server didn't see").
 *
 * This page stops at storing the job. Turning its modules into priced
 * families is a separate step in `/admin/catalogue` — geometry carries no
 * money, so that decision stays a human's.
 */

type LocalState =
	| { status: "idle" }
	| { status: "reading"; name: string }
	| { status: "done"; file: File; draft: CatalogueDraft }
	| { status: "error"; message: string };

type UploadState =
	| { status: "idle" }
	| { status: "uploading" }
	| { status: "finalizing" }
	| { status: "done"; importId: string; draft: CatalogueDraft }
	| { status: "duplicate"; importId: string }
	| { status: "error"; message: string };

export default function ImportPage() {
	const [local, setLocal] = useState<LocalState>({ status: "idle" });
	const [upload, setUpload] = useState<UploadState>({ status: "idle" });

	async function handleFile(file: File) {
		setLocal({ status: "reading", name: file.name });
		setUpload({ status: "idle" });
		try {
			// Loaded on demand: the parser is a chunk the public configurator must
			// never pay for.
			const [{ readSkp }, { extractCatalogue }] = await Promise.all([
				import("@/lib/skp/read"),
				import("@/lib/skp/extract"),
			]);

			setLocal({
				status: "done",
				file,
				draft: extractCatalogue(readSkp(await file.arrayBuffer())),
			});
		} catch (error) {
			setLocal({
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function uploadToServer(file: File) {
		setUpload({ status: "uploading" });
		try {
			const { upload: blobUpload } = await import("@vercel/blob/client");
			const importId = crypto.randomUUID();
			// Must match SKP_PATHNAME in lib/catalogue/skpBlob.ts, which is
			// server-only and so cannot be imported here.
			const pathname = `skp/${importId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

			const blob = await blobUpload(pathname, file, {
				access: "private",
				handleUploadUrl: "/api/admin/catalogue/uploads/token",
			});

			setUpload({ status: "finalizing" });
			const res = await fetch("/api/admin/catalogue/imports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					blobUrl: blob.url,
					blobPathname: blob.pathname,
					filename: file.name,
				}),
			});
			const body = await res.json();

			if (res.status === 409) {
				setUpload({ status: "duplicate", importId: body.importId });
				return;
			}
			if (!res.ok) {
				setUpload({ status: "error", message: body.message ?? body.error });
				return;
			}
			setUpload({ status: "done", importId: body.importId, draft: body.draft });
		} catch (error) {
			setUpload({
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return (
		<main className="min-h-screen bg-white text-neutral-900">
			<AdminHeader />
			<div className="mx-auto max-w-4xl space-y-6 p-6">
				<div>
					<h1 className="font-semibold text-lg">Import a SketchUp job</h1>
					<p className="text-neutral-500 text-sm">
						Reads a Mozaik <code>.skp</code> export and proposes catalogue
						entries. Parsed locally first for preview; uploading re-parses on
						the server, which is the only copy that can ever become the live
						catalogue.
					</p>
				</div>

				<label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-neutral-300 border-dashed p-8 text-center hover:border-neutral-400">
					<span className="font-medium text-sm">Choose a .skp file</span>
					<span className="text-neutral-500 text-xs">
						{local.status === "reading"
							? `Reading ${local.name}…`
							: "Parsed in your browser first"}
					</span>
					<input
						type="file"
						accept=".skp"
						className="sr-only"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) handleFile(file);
						}}
					/>
				</label>

				{local.status === "error" && (
					<p className="rounded border border-red-300 bg-red-50 p-3 text-red-900 text-sm">
						Could not read that file: {local.message}
					</p>
				)}

				{local.status === "done" && (
					<>
						<Draft draft={local.draft} />

						<div className="space-y-3 rounded-lg border border-neutral-200 p-4">
							<h2 className="font-medium text-sm">Keep this job</h2>
							<p className="text-neutral-500 text-sm">
								Uploading stores the file and re-parses it on the server, which
								is the only copy allowed to become a catalogue. Turning the
								modules above into families is a separate, deliberate step in{" "}
								<Link href="/admin/catalogue" className="underline">
									Catalogue
								</Link>
								— geometry can't invent a price, so that stays a human's call.
							</p>
							{upload.status === "idle" && (
								<button
									type="button"
									onClick={() => uploadToServer(local.file)}
									className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white"
								>
									Upload to server
								</button>
							)}
							{(upload.status === "uploading" ||
								upload.status === "finalizing") && (
								<p className="text-neutral-500 text-sm">
									{upload.status === "uploading"
										? "Uploading…"
										: "Parsing on the server…"}
								</p>
							)}
							{upload.status === "duplicate" && (
								<p className="text-amber-700 text-sm">
									This exact file was already imported (import {upload.importId}
									).
								</p>
							)}
							{upload.status === "error" && (
								<p className="text-red-700 text-sm">{upload.message}</p>
							)}
							{upload.status === "done" && (
								<p className="text-green-700 text-sm">
									Stored and parsed as import {upload.importId}.
								</p>
							)}
						</div>
					</>
				)}
			</div>
		</main>
	);
}

function Draft({ draft }: { draft: CatalogueDraft }) {
	return (
		<div className="space-y-6">
			<div className="rounded-lg border border-neutral-200 p-3">
				<p className="text-sm">
					<span className="font-medium">{draft.modules.length} modules</span>,{" "}
					{draft.finishes.length} finishes, {draft.hardware.length} hardware
					items — built from {draft.panelThicknessMm}mm board.
				</p>
			</div>

			{draft.warnings.length > 0 && (
				<ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
					{draft.warnings.map((warning) => (
						<li key={warning}>{warning}</li>
					))}
				</ul>
			)}

			<section className="space-y-2">
				<h2 className="font-medium text-sm">Modules</h2>
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="text-neutral-500 text-xs">
							<tr>
								<th className="py-1 pr-3">Name</th>
								<th className="py-1 pr-3">W × D × H (mm)</th>
								<th className="py-1 pr-3">Off floor</th>
								<th className="py-1 pr-3">Used</th>
								<th className="py-1">Parts</th>
							</tr>
						</thead>
						<tbody>
							{draft.modules.map((module) => (
								<tr
									key={`${module.name}-${module.widthMm}-${module.heightMm}`}
									className="border-neutral-100 border-t align-top"
								>
									<td className="py-1 pr-3">{module.name}</td>
									<td className="py-1 pr-3 tabular-nums">
										{module.widthMm} × {module.depthMm} × {module.heightMm}
									</td>
									<td className="py-1 pr-3 tabular-nums">
										{module.floorHeightMm}
									</td>
									<td className="py-1 pr-3 tabular-nums">{module.count}×</td>
									<td className="py-1 text-neutral-500 text-xs">
										{module.parts
											.map((part) => `${part.count}× ${part.name}`)
											.join(", ")}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section className="space-y-2">
				<h2 className="font-medium text-sm">Finishes</h2>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{draft.finishes.map((finish) => (
						<div
							key={finish.id}
							className="rounded-md border border-neutral-200 p-2"
						>
							<span
								className="block h-9 w-full rounded"
								style={{ backgroundColor: finish.hex }}
							/>
							<p className="mt-1 truncate text-xs">{finish.label}</p>
							<p className="text-[10px] text-neutral-500">{finish.id}</p>
						</div>
					))}
				</div>
			</section>

			<section className="space-y-2">
				<h2 className="font-medium text-sm">Hardware</h2>
				<ul className="text-sm">
					{draft.hardware.map((item) => (
						<li key={item.name} className="border-neutral-100 border-t py-1">
							<span className="tabular-nums text-neutral-500">
								{item.count}×
							</span>{" "}
							{item.name}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
