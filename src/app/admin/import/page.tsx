"use client";

import { useState } from "react";
import type { CatalogueDraft } from "@/lib/skp/extract";

/**
 * Sales-side tool: drop a Mozaik `.skp` export in, read out the module
 * standard, and download it as a catalogue patch to review and commit.
 *
 * Everything happens in the browser — a 3 MB job file never leaves the
 * machine, there is no upload endpoint, and nothing is written anywhere.
 *
 * ponytail: no auth on this route in v1, because it reads a local file and
 * persists nothing. Gate it behind the Phase 3 admin auth the moment it
 * starts saving.
 */

type State =
	| { status: "idle" }
	| { status: "reading"; name: string }
	| { status: "done"; name: string; draft: CatalogueDraft; patch: string }
	| { status: "error"; message: string };

export default function ImportPage() {
	const [state, setState] = useState<State>({ status: "idle" });

	async function handleFile(file: File) {
		setState({ status: "reading", name: file.name });
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
			setState({
				status: "done",
				name: file.name,
				draft,
				patch: toCataloguePatch(draft, file.name),
			});
		} catch (error) {
			setState({
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

	// The body follows the OS colour scheme; this tool is light-only like the
	// configurator, so it paints its own ground rather than inheriting a dark one
	// under dark text.
	return (
		<main className="min-h-screen bg-white text-neutral-900">
			<div className="mx-auto max-w-4xl space-y-6 p-6">
				<div>
					<h1 className="font-semibold text-lg">Import a SketchUp job</h1>
					<p className="text-neutral-500 text-sm">
						Reads a Mozaik <code>.skp</code> export and proposes catalogue
						entries. The file stays on this machine — nothing is uploaded or
						saved.
					</p>
				</div>

				<label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-neutral-300 border-dashed p-8 text-center hover:border-neutral-400">
					<span className="font-medium text-sm">Choose a .skp file</span>
					<span className="text-neutral-500 text-xs">
						{state.status === "reading"
							? `Reading ${state.name}…`
							: "Nothing is sent anywhere"}
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

				{state.status === "error" && (
					<p className="rounded border border-red-300 bg-red-50 p-3 text-red-900 text-sm">
						Could not read that file: {state.message}
					</p>
				)}

				{state.status === "done" && (
					<Draft
						draft={state.draft}
						onDownload={() => download(state.patch, state.name)}
					/>
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
