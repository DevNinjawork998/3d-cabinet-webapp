"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { chipClass, fieldClass } from "@/components/admin/styles";
import {
	CATEGORIES,
	CATEGORY_LABELS,
	CATEGORY_SWATCH,
	type Category,
	ROOM_LABELS,
	ROOMS,
	type Room,
} from "@/lib/catalogue/cabinetDesignLabels";

type Status = "PUBLISHED" | "ARCHIVED";

type CabinetDesign = {
	id: string;
	name: string;
	filename: string;
	blobUrl: string;
	blobPathname: string;
	category: Category;
	room: Room;
	widthMm: number;
	heightMm: number;
	depthMm: number;
	priceRm: number;
	sku: string;
	description: string | null;
	tags: string | null;
	finishes: string[];
	status: Status;
	updatedAt: string;
};

const FINISH_OPTIONS = ["Slab", "Shaker", "Glass"];

/** What the API's zod schema actually requires, mirrored here so the form
 * can flag missing fields before a round trip — same rules, human labels. */
const REQUIRED_FIELDS: {
	key: "name" | "w" | "h" | "d" | "price" | "sku";
	label: string;
	valid: (value: string) => boolean;
}[] = [
	{ key: "name", label: "Cabinet name", valid: (v) => v.trim().length > 0 },
	{ key: "w", label: "Width", valid: (v) => Number(v) > 0 },
	{ key: "h", label: "Height", valid: (v) => Number(v) > 0 },
	{ key: "d", label: "Depth", valid: (v) => Number(v) > 0 },
	{
		key: "price",
		label: "Price",
		valid: (v) => v.trim() !== "" && Number(v) >= 0,
	},
	{ key: "sku", label: "SKU", valid: (v) => v.trim().length > 0 },
];

type Form = {
	name: string;
	category: Category;
	room: Room;
	w: string;
	h: string;
	d: string;
	price: string;
	sku: string;
	description: string;
	tags: string;
	finishes: string[];
};

function emptyForm(): Form {
	return {
		name: "",
		category: "BASE_CABINET",
		room: "KITCHEN",
		w: "",
		h: "",
		d: "",
		price: "",
		sku: "",
		description: "",
		tags: "",
		finishes: ["Slab"],
	};
}

export default function CabinetDesignsPage() {
	const router = useRouter();
	const [designs, setDesigns] = useState<CabinetDesign[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
	const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");

	const [panelOpen, setPanelOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<Form>(emptyForm());
	const [formStatus, setFormStatus] = useState<Status>("PUBLISHED");
	const [file, setFile] = useState<File | null>(null);
	const [existingFilename, setExistingFilename] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [missing, setMissing] = useState<Set<string>>(new Set());

	async function load() {
		setLoading(true);
		const res = await fetch("/api/admin/cabinet-designs");
		if (res.status === 401) {
			router.push("/admin/login");
			return;
		}
		if (!res.ok) {
			setError("Failed to load designs");
			setLoading(false);
			return;
		}
		const body = await res.json();
		setDesigns(body.designs ?? []);
		setLoading(false);
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: load on mount only
	useEffect(() => {
		load();
	}, []);

	function openUpload() {
		setEditingId(null);
		setForm(emptyForm());
		setFormStatus("PUBLISHED");
		setFile(null);
		setExistingFilename(null);
		setError(null);
		setMissing(new Set());
		setPanelOpen(true);
	}

	function editItem(d: CabinetDesign) {
		setEditingId(d.id);
		setForm({
			name: d.name,
			category: d.category,
			room: d.room,
			w: String(d.widthMm),
			h: String(d.heightMm),
			d: String(d.depthMm),
			price: String(d.priceRm),
			sku: d.sku,
			description: d.description ?? "",
			tags: d.tags ?? "",
			finishes: d.finishes,
		});
		setFormStatus(d.status);
		setFile(null);
		setExistingFilename(d.filename);
		setError(null);
		setMissing(new Set());
		setPanelOpen(true);
	}

	function closePanel() {
		setPanelOpen(false);
	}

	function setField<K extends keyof Form>(key: K, value: Form[K]) {
		setForm((f) => ({ ...f, [key]: value }));
		setMissing((m) => {
			if (!m.has(key)) return m;
			const next = new Set(m);
			next.delete(key);
			return next;
		});
	}

	function toggleFinish(label: string) {
		setForm((f) => ({
			...f,
			finishes: f.finishes.includes(label)
				? f.finishes.filter((v) => v !== label)
				: [...f.finishes, label],
		}));
	}

	async function toggleArchive(d: CabinetDesign) {
		const status: Status = d.status === "PUBLISHED" ? "ARCHIVED" : "PUBLISHED";
		await fetch(`/api/admin/cabinet-designs/${d.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status }),
		});
		load();
	}

	async function save() {
		const failed = REQUIRED_FIELDS.filter((f) => !f.valid(form[f.key]));
		if (failed.length > 0) {
			setMissing(new Set(failed.map((f) => f.key)));
			setError(`Missing: ${failed.map((f) => f.label).join(", ")}`);
			return;
		}
		setMissing(new Set());
		setSaving(true);
		setError(null);
		try {
			let blob: { url: string; pathname: string; filename: string } | null =
				null;
			if (file) {
				const { upload } = await import("@vercel/blob/client");
				const importId = crypto.randomUUID();
				const pathname = `skp/${importId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
				const result = await upload(pathname, file, {
					access: "private",
					handleUploadUrl: "/api/admin/catalogue/uploads/token",
				});
				blob = {
					url: result.url,
					pathname: result.pathname,
					filename: file.name,
				};
			}

			if (!editingId && !blob) {
				setError("Choose a .skp file first");
				setSaving(false);
				return;
			}

			const payload = {
				...(blob
					? {
							blobUrl: blob.url,
							blobPathname: blob.pathname,
							filename: blob.filename,
						}
					: {}),
				name: form.name,
				category: form.category,
				room: form.room,
				widthMm: Number(form.w),
				heightMm: Number(form.h),
				depthMm: Number(form.d),
				priceRm: Number(form.price),
				sku: form.sku,
				description: form.description || undefined,
				tags: form.tags || undefined,
				finishes: form.finishes,
				status: formStatus,
			};

			const res = await fetch(
				editingId
					? `/api/admin/cabinet-designs/${editingId}`
					: "/api/admin/cabinet-designs",
				{
					method: editingId ? "PATCH" : "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				},
			);
			const body = await res.json();
			if (!res.ok) {
				setError(
					body.error === "duplicate"
						? "This exact file is already uploaded."
						: body.error === "sku_taken"
							? "That SKU is already in use."
							: body.error === "invalid_body"
								? "Some fields are invalid — check the highlighted ones."
								: (body.error ?? "Could not save"),
				);
				setSaving(false);
				return;
			}

			setPanelOpen(false);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	}

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return designs.filter((d) => {
			if (statusFilter !== "all" && d.status !== statusFilter) return false;
			if (categoryFilter !== "all" && d.category !== categoryFilter)
				return false;
			if (
				q &&
				!(
					d.name.toLowerCase().includes(q) ||
					d.sku.toLowerCase().includes(q) ||
					(d.tags ?? "").toLowerCase().includes(q)
				)
			)
				return false;
			return true;
		});
	}, [designs, search, statusFilter, categoryFilter]);

	return (
		<div className="flex min-h-screen flex-col bg-[#f4f3f1] text-neutral-900">
			<AdminHeader />

			<main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-5 p-7">
				<div className="flex items-end justify-between gap-4">
					<div>
						<h1 className="mb-1 font-semibold text-[22px]">Cabinet designs</h1>
						<p className="text-neutral-500 text-sm">
							Upload SketchUp (.skp) drawings, describe them, and control what
							customers see in the planner.
						</p>
					</div>
					<button
						type="button"
						onClick={openUpload}
						className="flex items-center gap-1.5 rounded-[9px] bg-neutral-900 px-4 py-2.5 font-medium text-[13px] text-white"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M7 1V13M1 7H13"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinecap="round"
							/>
						</svg>
						Upload design
					</button>
				</div>

				<div className="flex flex-wrap items-center gap-2.5">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search by name, SKU or tag"
						className="min-w-[200px] max-w-[320px] flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
					/>
					<div className="flex flex-wrap items-center gap-1.5">
						{(["all", "PUBLISHED", "ARCHIVED"] as const).map((s) => (
							<button
								key={s}
								type="button"
								onClick={() => setStatusFilter(s)}
								className={chipClass(statusFilter === s)}
							>
								{s === "all"
									? "All"
									: s === "PUBLISHED"
										? "Published"
										: "Archived"}
							</button>
						))}
					</div>
					<span className="mx-1 h-5 w-px bg-neutral-200" />
					<div className="flex flex-wrap items-center gap-1.5">
						<button
							type="button"
							onClick={() => setCategoryFilter("all")}
							className={chipClass(categoryFilter === "all")}
						>
							All categories
						</button>
						{CATEGORIES.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => setCategoryFilter(c)}
								className={chipClass(categoryFilter === c)}
							>
								{CATEGORY_LABELS[c]}
							</button>
						))}
					</div>
					<span className="ml-auto text-neutral-400 text-xs">
						{filtered.length} of {designs.length} designs
					</span>
				</div>

				<div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
					<div className="overflow-x-auto">
						<table className="w-full table-fixed text-left text-sm">
							<colgroup>
								<col className="w-[22%]" />
								<col className="w-[12%]" />
								<col className="w-[10%]" />
								<col className="w-[13%]" />
								<col className="w-[10%]" />
								<col className="w-[9%]" />
								<col className="w-[10%]" />
								<col className="w-[8%]" />
								<col className="w-[6%]" />
							</colgroup>
							<thead>
								<tr className="border-neutral-200 border-b bg-[#f7f6f4]">
									{[
										"Design",
										"Category",
										"Room",
										"Dimensions",
										"SKU",
										"Price",
										"Status",
										"Updated",
										"",
									].map((h) => (
										<th
											key={h}
											className="whitespace-nowrap px-4 py-2.5 font-medium text-[11px] text-neutral-500 uppercase tracking-wide"
										>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{filtered.map((d) => (
									<tr key={d.id} className="border-neutral-100 border-b">
										<td className="overflow-hidden px-4 py-2.5">
											<div className="flex min-w-0 items-center gap-2.5">
												<span
													className="h-8 w-10 flex-shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]"
													style={{
														backgroundColor: CATEGORY_SWATCH[d.category],
													}}
												/>
												<div className="min-w-0">
													<p className="truncate font-medium">{d.name}</p>
													<p className="truncate text-[11px] text-neutral-400">
														{d.filename}
													</p>
												</div>
											</div>
										</td>
										<td className="truncate px-3 py-2.5 text-neutral-700">
											{CATEGORY_LABELS[d.category]}
										</td>
										<td className="truncate px-3 py-2.5 text-neutral-700">
											{ROOM_LABELS[d.room]}
										</td>
										<td className="whitespace-nowrap px-3 py-2.5 text-neutral-700 tabular-nums">
											{d.widthMm} × {d.heightMm} × {d.depthMm}
										</td>
										<td className="truncate px-3 py-2.5 font-mono text-neutral-500 text-xs">
											{d.sku}
										</td>
										<td className="px-3 py-2.5 text-right tabular-nums">
											RM {d.priceRm.toLocaleString()}
										</td>
										<td className="px-3 py-2.5">
											<span
												className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-xs ${
													d.status === "PUBLISHED"
														? "bg-green-50 text-green-700"
														: "bg-neutral-100 text-neutral-500"
												}`}
											>
												<span
													className={`h-1.5 w-1.5 rounded-full ${
														d.status === "PUBLISHED"
															? "bg-green-700"
															: "bg-neutral-500"
													}`}
												/>
												{d.status === "PUBLISHED" ? "Published" : "Archived"}
											</span>
										</td>
										<td className="px-3 py-2.5 text-neutral-400">
											{new Date(d.updatedAt).toLocaleDateString()}
										</td>
										<td className="whitespace-nowrap px-4 py-2.5 text-right">
											<button
												type="button"
												onClick={() => editItem(d)}
												className="text-neutral-600 text-xs underline"
											>
												Edit
											</button>
											<button
												type="button"
												onClick={() => toggleArchive(d)}
												className={`ml-3 text-xs underline ${
													d.status === "PUBLISHED"
														? "text-amber-700"
														: "text-green-700"
												}`}
											>
												{d.status === "PUBLISHED" ? "Archive" : "Publish"}
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{!loading && filtered.length === 0 && (
						<div className="p-10 text-center text-neutral-400 text-sm">
							No designs match your filters.
						</div>
					)}
				</div>
			</main>

			{panelOpen && (
				<div className="fixed inset-0 z-10 flex justify-end bg-neutral-900/30">
					<div className="flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-white shadow-2xl">
						<div className="sticky top-0 z-10 flex items-center justify-between border-neutral-200 border-b bg-white px-5.5 py-4.5">
							<p className="font-semibold text-[15px]">
								{editingId ? "Edit design" : "Upload new design"}
							</p>
							<button
								type="button"
								onClick={closePanel}
								className="text-lg text-neutral-400 leading-none"
							>
								×
							</button>
						</div>

						<div className="flex flex-col gap-5 p-5.5">
							<div>
								<p className="mb-1.5 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
									SketchUp file
								</p>
								<div className="rounded-[10px] border-[1.5px] border-neutral-300 border-dashed bg-neutral-50 p-5 text-center">
									{file || existingFilename ? (
										<>
											<p className="font-medium text-sm">
												{file ? file.name : existingFilename}
											</p>
											<p className="mt-1 text-neutral-500 text-xs">
												{file ? "uploaded just now" : "currently attached"}
											</p>
											<button
												type="button"
												onClick={() => {
													setFile(null);
													setExistingFilename(null);
												}}
												className="mt-2.5 text-amber-700 text-xs underline"
											>
												Remove and choose a different file
											</button>
										</>
									) : (
										<>
											<p className="mb-1 text-neutral-700 text-sm">
												Drag a .skp file here, or
											</p>
											<label className="inline-block cursor-pointer rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs">
												Browse files
												<input
													type="file"
													accept=".skp"
													className="hidden"
													onChange={(e) => {
														const f = e.target.files?.[0];
														if (f) setFile(f);
													}}
												/>
											</label>
											<p className="mt-2.5 text-[11px] text-neutral-400">
												.skp (SketchUp) up to 40 MB
											</p>
										</>
									)}
								</div>
							</div>

							<div>
								<p className="mb-1 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
									Cabinet name
								</p>
								<input
									type="text"
									value={form.name}
									onChange={(e) => setField("name", e.target.value)}
									placeholder="e.g. Drawer base 400"
									className={fieldClass(missing.has("name"), "w-full")}
								/>
								{missing.has("name") && (
									<p className="mt-1 text-[11px] text-red-600">Required</p>
								)}
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div>
									<p className="mb-1 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
										Category
									</p>
									<select
										value={form.category}
										onChange={(e) =>
											setField("category", e.target.value as Category)
										}
										className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm"
									>
										{CATEGORIES.map((c) => (
											<option key={c} value={c}>
												{CATEGORY_LABELS[c]}
											</option>
										))}
									</select>
								</div>
								<div>
									<p className="mb-1 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
										Room type
									</p>
									<select
										value={form.room}
										onChange={(e) => setField("room", e.target.value as Room)}
										className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm"
									>
										{ROOMS.map((r) => (
											<option key={r} value={r}>
												{ROOM_LABELS[r]}
											</option>
										))}
									</select>
								</div>
							</div>

							<div>
								<p className="mb-1 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
									Dimensions (W × H × D, mm)
								</p>
								<div className="grid grid-cols-3 gap-2">
									<div>
										<input
											type="number"
											value={form.w}
											onChange={(e) => setField("w", e.target.value)}
											placeholder="W"
											className={fieldClass(missing.has("w"), "w-full")}
										/>
										{missing.has("w") && (
											<p className="mt-1 text-[11px] text-red-600">Required</p>
										)}
									</div>
									<div>
										<input
											type="number"
											value={form.h}
											onChange={(e) => setField("h", e.target.value)}
											placeholder="H"
											className={fieldClass(missing.has("h"), "w-full")}
										/>
										{missing.has("h") && (
											<p className="mt-1 text-[11px] text-red-600">Required</p>
										)}
									</div>
									<div>
										<input
											type="number"
											value={form.d}
											onChange={(e) => setField("d", e.target.value)}
											placeholder="D"
											className={fieldClass(missing.has("d"), "w-full")}
										/>
										{missing.has("d") && (
											<p className="mt-1 text-[11px] text-red-600">Required</p>
										)}
									</div>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div>
									<p className="mb-1 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
										Price (RM)
									</p>
									<input
										type="number"
										value={form.price}
										onChange={(e) => setField("price", e.target.value)}
										placeholder="0.00"
										className={fieldClass(missing.has("price"), "w-full")}
									/>
									{missing.has("price") && (
										<p className="mt-1 text-[11px] text-red-600">Required</p>
									)}
								</div>
								<div>
									<p className="mb-1 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
										SKU
									</p>
									<input
										type="text"
										value={form.sku}
										onChange={(e) => setField("sku", e.target.value)}
										placeholder="ICB-0000"
										className={fieldClass(
											missing.has("sku"),
											"w-full font-mono",
										)}
									/>
									{missing.has("sku") && (
										<p className="mt-1 text-[11px] text-red-600">Required</p>
									)}
								</div>
							</div>

							<div>
								<p className="mb-1.5 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
									Front / finish options
								</p>
								<div className="flex flex-wrap gap-1.5">
									{FINISH_OPTIONS.map((label) => (
										<button
											key={label}
											type="button"
											onClick={() => toggleFinish(label)}
											className={chipClass(form.finishes.includes(label))}
										>
											{label}
										</button>
									))}
								</div>
							</div>

							<div>
								<p className="mb-1 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
									Description
								</p>
								<textarea
									value={form.description}
									onChange={(e) => setField("description", e.target.value)}
									placeholder="Shown to customers in the planner detail view"
									rows={3}
									className="w-full resize-y rounded-lg border border-neutral-300 px-2.5 py-2 text-sm"
								/>
							</div>

							<div>
								<p className="mb-1 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
									Tags
								</p>
								<input
									type="text"
									value={form.tags}
									onChange={(e) => setField("tags", e.target.value)}
									placeholder="e.g. soft-close, corner, best-seller"
									className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm"
								/>
								<p className="mt-1 text-[11px] text-neutral-400">
									Comma-separated. Used for search only, not shown to customers.
								</p>
							</div>

							<div className="border-neutral-100 border-t pt-4">
								<p className="mb-2 font-semibold text-[11px] text-neutral-600 uppercase tracking-wide">
									Visibility
								</p>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => setFormStatus("PUBLISHED")}
										className={`flex-1 rounded-lg border px-3 py-2.5 text-left text-[12.5px] font-medium ${
											formStatus === "PUBLISHED"
												? "border-green-700 bg-green-50 text-green-700"
												: "border-neutral-200 bg-white text-neutral-500"
										}`}
									>
										Published — visible to customers
									</button>
									<button
										type="button"
										onClick={() => setFormStatus("ARCHIVED")}
										className={`flex-1 rounded-lg border px-3 py-2.5 text-left text-[12.5px] font-medium ${
											formStatus === "ARCHIVED"
												? "border-amber-700 bg-amber-50 text-amber-700"
												: "border-neutral-200 bg-white text-neutral-500"
										}`}
									>
										Archived — hidden
									</button>
								</div>
							</div>

							{error && (
								<p className="rounded border border-red-300 bg-red-50 p-2.5 text-red-900 text-sm">
									{error}
								</p>
							)}
						</div>

						<div className="sticky bottom-0 mt-auto flex justify-end gap-2.5 border-neutral-200 border-t bg-white px-5.5 py-4">
							<button
								type="button"
								onClick={closePanel}
								className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={save}
								disabled={saving}
								className="rounded-lg bg-neutral-900 px-4.5 py-2.5 font-medium text-sm text-white disabled:opacity-50"
							>
								{saving
									? "Saving…"
									: editingId
										? "Save changes"
										: "Upload design"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
