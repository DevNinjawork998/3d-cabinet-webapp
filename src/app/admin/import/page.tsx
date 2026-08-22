"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { fieldClass } from "@/components/admin/styles";
import type { CatalogueDraft } from "@/lib/mesh/extract";
import {
	type ConfirmedImport,
	type ConfirmedModule,
	matchesFamily,
} from "@/lib/mesh/mergeIntoCatalogue";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";

/**
 * Sales-side tool: drop the client's zipped design export in and read out the
 * module standard it was drawn to.
 *
 * The file is a reference for design intent, never a runtime asset — the
 * browser never loads the mesh into the scene. See CLAUDE.md, "design files
 * are intake, not runtime assets".
 *
 * Parse happens twice, deliberately. Locally first, for the instant preview
 * table; then again server-side on upload, because the published catalogue is
 * never derived from anything the client computed ("never parse bytes the
 * server didn't see").
 *
 * Three steps: read, keep, confirm. The confirm step is what turns geometry
 * into a DRAFT catalogue — and it stays a human's, because a design file can
 * tell us a cabinet is 900 wide but never what it costs.
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
			// Loaded on demand: the reader is a chunk the public planner must
			// never pay for.
			const { readMeshArchive } = await import("@/lib/mesh/read");
			const bytes = new Uint8Array(await file.arrayBuffer());

			setLocal({ status: "done", file, draft: readMeshArchive(bytes).draft });
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
			// Must match MESH_PATHNAME in lib/catalogue/meshBlob.ts, which is
			// server-only and so cannot be imported here.
			const pathname = `mesh/${importId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

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
					<h1 className="font-semibold text-lg">Import a design</h1>
					<p className="text-neutral-500 text-sm">
						Reads a zipped OBJ export — the <code>.obj</code>, its{" "}
						<code>.mtl</code> and the texture folder — and proposes catalogue
						entries. Parsed in your browser for preview; uploading re-parses on
						the server, which is the only copy that can ever become the live
						catalogue.
					</p>
				</div>

				<label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-neutral-300 border-dashed p-8 text-center hover:border-neutral-400">
					<span className="font-medium text-sm">Choose a .zip export</span>
					<span className="text-neutral-500 text-xs">
						{local.status === "reading"
							? `Reading ${local.name}…`
							: "Zip the whole export folder, textures included"}
					</span>
					<input
						type="file"
						accept=".zip,application/zip"
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
							<h2 className="font-medium text-sm">Keep this design</h2>
							<p className="text-neutral-500 text-sm">
								Uploading stores the file and re-parses it on the server, which
								is the only copy allowed to become a catalogue.
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

				{upload.status === "done" && (
					<Confirm importId={upload.importId} draft={upload.draft} />
				)}
			</div>
		</main>
	);
}

/** A confirm row: the extractor's reading, plus whether to keep it. */
type Row = ConfirmedModule & { include: boolean; inferred: boolean };

const CONFIDENCE_COPY: Record<CatalogueDraft["confidence"], string> = {
	high: "Read cleanly off the design's end panels.",
	medium: "Read by working out which panels touch — check the splits.",
	low: "Could not tell the cabinets apart. Correct the row below by hand.",
};

function Confirm({
	importId,
	draft,
}: {
	importId: string;
	draft: CatalogueDraft;
}) {
	const router = useRouter();
	const [rows, setRows] = useState<Row[]>(() =>
		draft.modules.map((module) => ({
			include: true,
			inferred: module.inferred,
			label: module.name,
			kind: module.kind,
			widthMm: module.widthMm,
			heightMm: module.heightMm,
			depthMm: module.depthMm,
			floorHeightMm: module.floorHeightMm,
			geometry: module.geometry,
		})),
	);
	// What is live today, so each row can say whether it will create a cabinet
	// or just add a width to one that already exists.
	const [base, setBase] = useState<PlannerCatalogue | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: load on mount only
	useEffect(() => {
		baseCatalogue().then(setBase);
	}, []);
	const [finishes, setFinishes] = useState(() =>
		draft.finishes.map((finish) => ({ label: finish.label, hex: finish.hex })),
	);
	const [state, setState] = useState<
		| { status: "idle" }
		| { status: "saving" }
		| { status: "error"; message: string }
	>({ status: "idle" });

	const edit = (i: number, patch: Partial<Row>) =>
		setRows((prev) =>
			prev.map((row, j) => (i === j ? { ...row, ...patch } : row)),
		);

	async function create() {
		setState({ status: "saving" });
		try {
			const [{ mergeIntoCatalogue, describeMerge }, target] = await Promise.all(
				[
					import("@/lib/mesh/mergeIntoCatalogue"),
					base ? Promise.resolve(base) : baseCatalogue(),
				],
			);

			const confirmed: ConfirmedImport = {
				modules: rows.filter((row) => row.include),
				finishes,
				panelThicknessMm: draft.panelThicknessMm,
				plinthHeightMm: draft.plinthHeightMm,
			};
			const { catalogue, report } = mergeIntoCatalogue(confirmed, target);

			const res = await fetch("/api/admin/catalogue/versions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					product: "PLANNER",
					data: catalogue,
					importId,
					note: describeMerge(report).join("; "),
				}),
			});
			const body = await res.json();
			if (!res.ok) {
				setState({
					status: "error",
					message:
						body.error === "invalid_catalogue"
							? "The server rejected this catalogue — check the sizes below."
							: (body.error ?? "Could not create the draft"),
				});
				return;
			}
			router.push(`/admin/catalogue?version=${body.id}`);
		} catch (error) {
			setState({
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return (
		<section className="space-y-4 rounded-lg border border-neutral-200 p-4">
			<div>
				<h2 className="font-medium text-sm">Confirm what we read</h2>
				<p className="text-neutral-500 text-sm">
					Everything below was worked out from the geometry, so check it before
					it becomes a catalogue. This is added to the catalogue you already
					have — nothing existing is removed and no price you have set is
					touched. Nothing here is priced either; you do that in the catalogue
					editor, which is where this lands.
				</p>
				<p
					className={`mt-2 rounded px-2 py-1 text-xs ${
						draft.confidence === "high"
							? "bg-neutral-100 text-neutral-600"
							: "bg-amber-50 text-amber-900"
					}`}
				>
					{CONFIDENCE_COPY[draft.confidence]} Built from{" "}
					{draft.panelThicknessMm}mm board on a {draft.plinthHeightMm}mm plinth.
				</p>
			</div>

			<div className="overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead className="text-neutral-500 text-xs">
						<tr>
							<th className="py-1 pr-3">Keep</th>
							<th className="py-1 pr-3">Name</th>
							<th className="py-1 pr-3">Run</th>
							<th className="py-1 pr-3">Width</th>
							<th className="py-1 pr-3">Height</th>
							<th className="py-1 pr-3">Depth</th>
							<th className="py-1 pr-3">Off floor</th>
							<th className="py-1 pr-3">Shelves</th>
							<th className="py-1 pr-3">Doors</th>
							<th className="py-1 pr-3">Drawers</th>
							<th className="py-1">Lands as</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row, i) => (
							<tr
								key={`${row.label}-${row.widthMm}-${row.floorHeightMm}`}
								className="border-neutral-100 border-t"
							>
								<td className="py-1 pr-3">
									<input
										type="checkbox"
										checked={row.include}
										aria-label={`Keep ${row.label}`}
										onChange={(e) => edit(i, { include: e.target.checked })}
									/>
								</td>
								<td className="py-1 pr-3">
									<input
										value={row.label}
										aria-label="Name"
										className={fieldClass(!row.label.trim(), "w-44")}
										onChange={(e) => edit(i, { label: e.target.value })}
									/>
									{row.inferred && (
										<span
											className="mt-0.5 block text-[10px] text-amber-700"
											title="Some panels had no recognisable name, so their role was worked out from shape and position."
										>
											inferred — check the counts
										</span>
									)}
								</td>
								<td className="py-1 pr-3">
									<select
										value={row.kind}
										aria-label="Run"
										className={fieldClass(false)}
										onChange={(e) =>
											edit(i, { kind: e.target.value as Row["kind"] })
										}
									>
										<option value="base">Base</option>
										<option value="wall">Wall</option>
										<option value="tall">Tall</option>
									</select>
								</td>
								{(
									["widthMm", "heightMm", "depthMm", "floorHeightMm"] as const
								).map((key) => (
									<td key={key} className="py-1 pr-3">
										<input
											type="number"
											value={row[key]}
											aria-label={key}
											className={fieldClass(row[key] <= 0, "w-20 tabular-nums")}
											onChange={(e) =>
												edit(i, {
													[key]: Number(e.target.value),
												} as Partial<Row>)
											}
										/>
									</td>
								))}
								{(["shelves", "doorLeaves", "drawers"] as const).map((key) => (
									<td key={key} className="py-1 pr-3">
										<input
											type="number"
											min={0}
											value={row.geometry[key]}
											aria-label={key}
											className={fieldClass(false, "w-16 tabular-nums")}
											onChange={(e) =>
												edit(i, {
													geometry: {
														...row.geometry,
														[key]: Math.max(0, Number(e.target.value)),
													},
												})
											}
										/>
									</td>
								))}
								<td className="py-1 text-xs">
									<Lands row={row} base={base} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="space-y-2">
				<h3 className="font-medium text-sm">Finishes</h3>
				<p className="text-neutral-500 text-xs">
					Names came from the texture filenames — the export does not carry
					readable material names. Pick the colour the planner should tint each
					one with.
				</p>
				<div className="grid gap-2 sm:grid-cols-2">
					{finishes.map((finish, i) => (
						<div key={finish.label} className="flex items-center gap-2">
							<input
								type="color"
								value={finish.hex}
								aria-label={`${finish.label} colour`}
								className="h-9 w-12 rounded border border-neutral-300"
								onChange={(e) =>
									setFinishes((prev) =>
										prev.map((f, j) =>
											i === j ? { ...f, hex: e.target.value } : f,
										),
									)
								}
							/>
							<input
								value={finish.label}
								aria-label="Finish name"
								className={fieldClass(!finish.label.trim(), "flex-1")}
								onChange={(e) =>
									setFinishes((prev) =>
										prev.map((f, j) =>
											i === j ? { ...f, label: e.target.value } : f,
										),
									)
								}
							/>
						</div>
					))}
				</div>
			</div>

			{state.status === "error" && (
				<p className="text-red-700 text-sm">{state.message}</p>
			)}

			<button
				type="button"
				disabled={state.status === "saving" || !rows.some((r) => r.include)}
				onClick={create}
				className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
			>
				{state.status === "saving" ? "Creating…" : "Create draft catalogue"}
			</button>
			<p className="text-neutral-500 text-xs">
				Creates an unpublished version and opens it in{" "}
				<Link href="/admin/catalogue" className="underline">
					Catalogue
				</Link>
				. Nothing reaches a customer until you publish it there.
			</p>
		</section>
	);
}

/**
 * What this row will actually do to the catalogue, decided by the same matcher
 * the merge uses so the preview can never disagree with the result.
 */
function Lands({ row, base }: { row: Row; base: PlannerCatalogue | null }) {
	if (!row.include) return <span className="text-neutral-400">skipped</span>;
	if (!base) return <span className="text-neutral-400">…</span>;

	const match = base.families.find((family) => matchesFamily(row, family));
	if (!match) return <span className="text-green-700">new cabinet</span>;
	if (match.sizes.some((size) => size.widthMm === row.widthMm)) {
		return <span className="text-neutral-500">already in “{match.label}”</span>;
	}
	return (
		<span className="text-blue-700">
			+{row.widthMm}mm on “{match.label}”
		</span>
	);
}

/**
 * The catalogue the imported cabinets are laid on top of, so door styles and
 * their agreed prices survive an import. Falls back to the repo seed the first
 * time, before anything has ever been published.
 */
async function baseCatalogue(): Promise<PlannerCatalogue> {
	const res = await fetch(
		"/api/admin/catalogue/versions?product=PLANNER&include=data",
	);
	const body = res.ok ? await res.json() : { versions: [] };
	const published = body.versions?.find(
		(v: { status: string }) => v.status === "PUBLISHED",
	);
	if (published) return published.data as PlannerCatalogue;

	const { PLANNER_CATALOGUE } = await import("@/lib/planner/catalogue");
	return PLANNER_CATALOGUE;
}

function Draft({ draft }: { draft: CatalogueDraft }) {
	return (
		<div className="space-y-6">
			<div className="rounded-lg border border-neutral-200 p-3">
				<p className="text-sm">
					<span className="font-medium">{draft.modules.length} cabinets</span>,{" "}
					{draft.finishes.length} finishes, {draft.hardware.length} hardware
					items — built from {draft.panelThicknessMm}mm board on a{" "}
					{draft.plinthHeightMm}mm plinth.
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
				<h2 className="font-medium text-sm">Cabinets</h2>
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="text-neutral-500 text-xs">
							<tr>
								<th className="py-1 pr-3">Name</th>
								<th className="py-1 pr-3">W × D × H (mm)</th>
								<th className="py-1 pr-3">Off floor</th>
								<th className="py-1 pr-3">Used</th>
								<th className="py-1 pr-3">Holds</th>
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
									<td className="py-1 pr-3 text-neutral-500 text-xs">
										{[
											module.geometry.doorLeaves &&
												`${module.geometry.doorLeaves} door`,
											module.geometry.drawers &&
												`${module.geometry.drawers} drawer`,
											module.geometry.shelves + module.geometry.fixedShelves &&
												`${module.geometry.shelves + module.geometry.fixedShelves} shelf`,
										]
											.filter(Boolean)
											.join(", ") || "open"}
									</td>
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
