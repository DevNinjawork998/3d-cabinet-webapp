"use client";

import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { CatalogueDraft } from "@/lib/skp/extract";

/**
 * Sales-side tool: drop a Mozaik `.skp` export in, read out the module
 * standard, and either download it as a catalogue patch (the original,
 * still-supported path — costs nothing to leave in as a fallback) or upload
 * it to the server, review a full catalogue JSON against it, and publish.
 *
 * Local parse is unchanged and still happens first, for the instant preview
 * table. The upload step is separate and re-parses server-side — the
 * published catalogue is never derived from anything the client computed
 * (see the DB-backed-catalogue plan's "never parse bytes the server didn't
 * see" rule).
 */

type LocalState =
	| { status: "idle" }
	| { status: "reading"; name: string }
	| { status: "done"; file: File; draft: CatalogueDraft; patch: string }
	| { status: "error"; message: string };

type UploadState =
	| { status: "idle" }
	| { status: "uploading" }
	| { status: "finalizing" }
	| { status: "done"; importId: string; draft: CatalogueDraft }
	| { status: "duplicate"; importId: string }
	| { status: "error"; message: string };

type PublishState =
	| { status: "idle" }
	| { status: "saving" }
	| { status: "draft"; id: string }
	| { status: "publishing" }
	| { status: "published"; id: string }
	| { status: "error"; message: string };

export default function ImportPage() {
	const [local, setLocal] = useState<LocalState>({ status: "idle" });
	const [upload, setUpload] = useState<UploadState>({ status: "idle" });
	const [product, setProduct] = useState<"WARDROBE" | "PLANNER">("WARDROBE");
	const [catalogueJson, setCatalogueJson] = useState("");
	const [publish, setPublish] = useState<PublishState>({ status: "idle" });

	async function handleFile(file: File) {
		setLocal({ status: "reading", name: file.name });
		setUpload({ status: "idle" });
		setPublish({ status: "idle" });
		try {
			// Loaded on demand: the parser is a chunk the public configurator must
			// never pay for.
			const [{ readSkp }, { extractCatalogue }, { toCataloguePatch }] =
				await Promise.all([
					import("@/lib/skp/read"),
					import("@/lib/skp/extract"),
					import("@/lib/skp/patch"),
				]);

			const draft = extractCatalogue(readSkp(await file.arrayBuffer()));
			setLocal({
				status: "done",
				file,
				draft,
				patch: toCataloguePatch(draft, file.name),
			});
		} catch (error) {
			setLocal({
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	function download(patch: string, name: string) {
		const url = URL.createObjectURL(
			new Blob([patch], { type: "text/plain;charset=utf-8" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${name.replace(/\.skp$/i, "")}-catalogue.ts`;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function uploadToServer(file: File) {
		setUpload({ status: "uploading" });
		try {
			const { upload: blobUpload } = await import("@vercel/blob/client");
			const importId = crypto.randomUUID();
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

			// Seed the review textarea with the currently-live catalogue for this
			// product, as a starting point to edit against the draft table above
			// — never auto-mapped from the draft (see the plan: that's a human's
			// product decision, not something geometry can invent).
			const live = await fetch(
				`/api/admin/catalogue/versions?product=${product}&include=data`,
			).then((r) => r.json());
			const published = live.versions?.find(
				(v: { status: string }) => v.status === "PUBLISHED",
			);
			if (published) setCatalogueJson(JSON.stringify(published.data, null, 2));
		} catch (error) {
			setUpload({
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function saveDraft(importId: string) {
		setPublish({ status: "saving" });
		let data: unknown;
		try {
			data = JSON.parse(catalogueJson);
		} catch {
			setPublish({ status: "error", message: "not valid JSON" });
			return;
		}
		const res = await fetch("/api/admin/catalogue/versions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ product, data, importId }),
		});
		const body = await res.json();
		if (!res.ok) {
			setPublish({
				status: "error",
				message: JSON.stringify(body.issues ?? body.error),
			});
			return;
		}
		setPublish({ status: "draft", id: body.id });
	}

	async function publishDraft(id: string) {
		setPublish({ status: "publishing" });
		const res = await fetch(`/api/admin/catalogue/versions/${id}/publish`, {
			method: "POST",
		});
		const body = await res.json();
		if (!res.ok) {
			setPublish({ status: "error", message: body.error });
			return;
		}
		setPublish({ status: "published", id });
	}

	return (
		<main className="min-h-screen bg-white text-neutral-900">
			<AdminHeader current="import" />
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
						<Draft
							draft={local.draft}
							onDownload={() => download(local.patch, local.file.name)}
						/>

						<div className="space-y-3 rounded-lg border border-neutral-200 p-4">
							<h2 className="font-medium text-sm">Publish from this job</h2>
							<label className="flex items-center gap-2 text-sm">
								Product
								<select
									value={product}
									onChange={(e) =>
										setProduct(e.target.value as "WARDROBE" | "PLANNER")
									}
									className="rounded border border-neutral-300 px-2 py-1 text-sm"
								>
									<option value="WARDROBE">Wardrobe</option>
									<option value="PLANNER">Planner</option>
								</select>
							</label>

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
								<div className="space-y-2">
									<p className="text-neutral-500 text-xs">
										Server-parsed import {upload.importId}. Edit the catalogue
										below against the module table above, then save as a draft.
									</p>
									<textarea
										value={catalogueJson}
										onChange={(e) => setCatalogueJson(e.target.value)}
										rows={14}
										className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
									/>
									{publish.status === "idle" && (
										<button
											type="button"
											onClick={() => saveDraft(upload.importId)}
											className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-500"
										>
											Save as draft
										</button>
									)}
									{publish.status === "saving" && (
										<p className="text-neutral-500 text-sm">Saving…</p>
									)}
									{publish.status === "error" && (
										<p className="text-red-700 text-sm">{publish.message}</p>
									)}
									{publish.status === "draft" && (
										<button
											type="button"
											onClick={() => publishDraft(publish.id)}
											className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white"
										>
											Publish draft {publish.id}
										</button>
									)}
									{publish.status === "publishing" && (
										<p className="text-neutral-500 text-sm">Publishing…</p>
									)}
									{publish.status === "published" && (
										<p className="text-green-700 text-sm">
											Published as version {publish.id}. Live catalogue reads
											will pick it up shortly.
										</p>
									)}
								</div>
							)}
						</div>
					</>
				)}
			</div>
		</main>
	);
}

function Draft({
	draft,
	onDownload,
}: {
	draft: CatalogueDraft;
	onDownload: () => void;
}) {
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-3">
				<p className="text-sm">
					<span className="font-medium">{draft.modules.length} modules</span>,{" "}
					{draft.finishes.length} finishes, {draft.hardware.length} hardware
					items — built from {draft.panelThicknessMm}mm board.
				</p>
				<button
					type="button"
					onClick={onDownload}
					className="shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white"
				>
					Download catalogue patch
				</button>
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
