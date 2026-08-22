"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { fieldClass } from "@/components/admin/styles";
import { summariseCatalogueChanges } from "@/lib/catalogue/diff";
import {
	type PlannerCatalogue,
	plannerCatalogueSchema,
} from "@/lib/planner/catalogueSchema";

/**
 * Field-level editor for the live planner catalogue.
 *
 * Replaces the raw-JSON textarea on `/admin/import`, which could only be
 * reached by uploading a `.skp` file first and reported a bad edit as the
 * string "not valid JSON". Everything here still goes out through the same
 * `POST /versions` → `.../publish` gate, so schema validation, the DRAFT
 * review step and cache revalidation are unchanged — only the editing
 * surface is new.
 */

type Tab = "families" | "doors" | "finishes" | "rooms" | "standards";

const TABS: { id: Tab; label: string }[] = [
	{ id: "families", label: "Cabinets" },
	{ id: "doors", label: "Door styles" },
	{ id: "finishes", label: "Finishes" },
	{ id: "rooms", label: "Rooms" },
	{ id: "standards", label: "Rates & build" },
];

const DEFAULT_CONSTRUCTION = {
	panelThicknessMm: 16,
	plinthHeightMm: 100,
	worktopThicknessMm: 40,
	doorLeavesThresholdMm: 650,
};
const DEFAULT_RATES = { worktopRmPerFt: 200 };

type SaveState =
	| { status: "idle" }
	| { status: "saving" }
	| { status: "draft"; id: string }
	| { status: "publishing"; id: string }
	| { status: "published" }
	| { status: "error"; message: string };

/**
 * These three own their own `<label>` rather than being wrapped in one by the
 * caller: a `<label>` around a component reads as unlabelled to a screen
 * reader, since the association is only made when the control is a real
 * descendant element.
 */
function Num({
	label,
	value,
	onChange,
	width = "w-24",
	min = 0,
}: {
	label?: string;
	value: number;
	onChange: (n: number) => void;
	width?: string;
	min?: number;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			{label && (
				<label htmlFor={id} className="text-[11px] text-neutral-500">
					{label}
				</label>
			)}
			<input
				id={id}
				type="number"
				value={Number.isFinite(value) ? value : ""}
				min={min}
				onChange={(e) => onChange(Number(e.target.value))}
				className={fieldClass(
					!Number.isFinite(value) || value < min,
					`${width} tabular-nums`,
				)}
			/>
		</div>
	);
}

function Text({
	label,
	value,
	onChange,
	width = "w-48",
	placeholder,
}: {
	label?: string;
	value: string;
	onChange: (v: string) => void;
	width?: string;
	placeholder?: string;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			{label && (
				<label htmlFor={id} className="text-[11px] text-neutral-500">
					{label}
				</label>
			)}
			<input
				id={id}
				value={value}
				placeholder={placeholder}
				aria-label={label ? undefined : placeholder}
				onChange={(e) => onChange(e.target.value)}
				className={fieldClass(!value.trim(), width)}
			/>
		</div>
	);
}

function Select<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (v: T) => void;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-[11px] text-neutral-500">
				{label}
			</label>
			<select
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value as T)}
				className={fieldClass(false, "bg-white")}
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</div>
	);
}

function SectionCard({
	title,
	subtitle,
	children,
	onRemove,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
	onRemove?: () => void;
}) {
	return (
		<div className="rounded-lg border border-neutral-200 bg-white p-4">
			<div className="mb-3 flex items-start justify-between gap-3">
				<div>
					<p className="font-medium text-sm">{title}</p>
					{subtitle && (
						<p className="mt-0.5 text-[12px] text-neutral-500">{subtitle}</p>
					)}
				</div>
				{onRemove && (
					<button
						type="button"
						onClick={onRemove}
						className="shrink-0 text-[12px] text-red-600 hover:underline"
					>
						Remove
					</button>
				)}
			</div>
			{children}
		</div>
	);
}

export default function CatalogueEditorPage() {
	const router = useRouter();
	const [live, setLive] = useState<PlannerCatalogue | null>(null);
	const [draft, setDraft] = useState<PlannerCatalogue | null>(null);
	const [tab, setTab] = useState<Tab>("families");
	const [loadError, setLoadError] = useState<string | null>(null);
	const [save, setSave] = useState<SaveState>({ status: "idle" });
	const [showJson, setShowJson] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: load on mount only
	useEffect(() => {
		(async () => {
			const res = await fetch(
				"/api/admin/catalogue/versions?product=PLANNER&include=data",
			);
			if (res.status === 401) {
				router.push("/admin/login");
				return;
			}
			if (!res.ok) {
				setLoadError("Could not load the catalogue");
				return;
			}
			const body = await res.json();
			const published = body.versions?.find(
				(v: { status: string }) => v.status === "PUBLISHED",
			);
			if (!published) {
				setLoadError("No published planner catalogue to edit yet");
				return;
			}
			setLive(published.data);
			setDraft(JSON.parse(JSON.stringify(published.data)));
		})();
	}, []);

	const changes = useMemo(
		() => (live && draft ? summariseCatalogueChanges(live, draft) : []),
		[live, draft],
	);

	const issues = useMemo(() => {
		if (!draft) return [];
		const parsed = plannerCatalogueSchema.safeParse(draft);
		return parsed.success ? [] : parsed.error.issues;
	}, [draft]);

	function edit(mutate: (next: PlannerCatalogue) => void) {
		setDraft((prev) => {
			if (!prev) return prev;
			const next = JSON.parse(JSON.stringify(prev)) as PlannerCatalogue;
			mutate(next);
			return next;
		});
		setSave({ status: "idle" });
	}

	async function saveDraft() {
		if (!draft) return;
		setSave({ status: "saving" });
		const res = await fetch("/api/admin/catalogue/versions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				product: "PLANNER",
				data: draft,
				note: changes.length ? changes.join("; ") : "No changes",
			}),
		});
		const body = await res.json();
		if (!res.ok) {
			setSave({
				status: "error",
				message:
					body.error === "invalid_catalogue"
						? "The server rejected this catalogue — check the highlighted fields."
						: (body.error ?? "Could not save"),
			});
			return;
		}
		setSave({ status: "draft", id: body.id });
	}

	async function publish(id: string) {
		setSave({ status: "publishing", id });
		const res = await fetch(`/api/admin/catalogue/versions/${id}/publish`, {
			method: "POST",
		});
		const body = await res.json();
		if (!res.ok) {
			setSave({ status: "error", message: body.error ?? "Could not publish" });
			return;
		}
		setSave({ status: "published" });
		setLive(draft);
	}

	return (
		<div className="flex min-h-screen flex-col bg-[#f4f3f1] text-neutral-900">
			<AdminHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 p-6">
				<div className="mb-5">
					<h1 className="font-semibold text-lg">Catalogue</h1>
					<p className="text-neutral-500 text-sm">
						What the planner offers and what it charges. Changes are saved as a
						draft first — nothing reaches customers until you publish.
					</p>
				</div>

				{loadError && (
					<p className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 text-sm">
						{loadError}
					</p>
				)}

				{draft && (
					<div className="flex flex-col gap-4">
						<div className="flex flex-wrap gap-1.5">
							{TABS.map((t) => (
								<button
									key={t.id}
									type="button"
									onClick={() => setTab(t.id)}
									className={`rounded-full px-3 py-1.5 text-xs ${
										tab === t.id
											? "bg-neutral-900 text-white"
											: "bg-white text-neutral-600 shadow-[inset_0_0_0_1px_#e5e5e5] hover:shadow-[inset_0_0_0_1px_#a3a3a3]"
									}`}
								>
									{t.label}
								</button>
							))}
						</div>

						{tab === "families" && (
							<div className="flex flex-col gap-3">
								{draft.families.map((family, fi) => (
									<SectionCard
										key={family.id}
										title={family.label || "Untitled cabinet"}
										subtitle={`${family.kind} · ${family.sizes.length} size${
											family.sizes.length === 1 ? "" : "s"
										}`}
										onRemove={() =>
											edit((n) => {
												n.families.splice(fi, 1);
												for (const room of n.roomTypes) {
													room.familyIds = room.familyIds.filter(
														(id) => id !== family.id,
													);
													room.starter = room.starter.filter(
														(s) => s.familyId !== family.id,
													);
												}
											})
										}
									>
										<div className="flex flex-wrap items-end gap-3">
											<Text
												label="Name"
												value={family.label}
												onChange={(v) =>
													edit((n) => {
														n.families[fi].label = v;
													})
												}
											/>
											<Select
												label="Type"
												value={family.kind}
												options={[
													{ value: "base" as const, label: "Base" },
													{ value: "wall" as const, label: "Wall" },
													{ value: "tall" as const, label: "Tall" },
												]}
												onChange={(v) =>
													edit((n) => {
														n.families[fi].kind = v;
													})
												}
											/>
											<Num
												label="Depth mm"
												value={family.depthMm}
												min={1}
												onChange={(v) =>
													edit((n) => {
														n.families[fi].depthMm = v;
													})
												}
											/>
											<Num
												label="Height mm"
												value={family.heightMm}
												min={1}
												onChange={(v) =>
													edit((n) => {
														n.families[fi].heightMm = v;
													})
												}
											/>
											<Num
												label="Off floor mm"
												value={family.floorHeightMm}
												onChange={(v) =>
													edit((n) => {
														n.families[fi].floorHeightMm = v;
													})
												}
											/>
											<Num
												label="Drawers"
												value={family.drawers}
												width="w-16"
												onChange={(v) =>
													edit((n) => {
														n.families[fi].drawers = v;
													})
												}
											/>
											<label className="flex items-center gap-1.5 pb-2 text-[12px]">
												<input
													type="checkbox"
													checked={family.hasWorktop}
													onChange={(e) =>
														edit((n) => {
															n.families[fi].hasWorktop = e.target.checked;
														})
													}
												/>
												Worktop
											</label>
										</div>

										<div className="mt-3 border-neutral-100 border-t pt-3">
											<p className="mb-2 text-[11px] text-neutral-500 uppercase tracking-wide">
												Sizes &amp; prices
											</p>
											<div className="flex flex-col gap-2">
												{family.sizes.map((size, si) => (
													<div
														// biome-ignore lint/suspicious/noArrayIndexKey: a size rung has no id in the schema, and these inputs hold no internal state — every value is read straight from `draft`, so a reorder re-renders correctly.
														key={`${family.id}-${size.widthMm}-${si}`}
														className="flex items-center gap-2"
													>
														<Num
															value={size.widthMm}
															min={1}
															onChange={(v) =>
																edit((n) => {
																	n.families[fi].sizes[si].widthMm = v;
																})
															}
														/>
														<span className="text-[12px] text-neutral-400">
															mm — RM
														</span>
														<Num
															value={size.priceRm}
															onChange={(v) =>
																edit((n) => {
																	n.families[fi].sizes[si].priceRm = v;
																})
															}
														/>
														{family.sizes.length > 1 && (
															<button
																type="button"
																onClick={() =>
																	edit((n) => {
																		n.families[fi].sizes.splice(si, 1);
																	})
																}
																className="text-[12px] text-neutral-400 hover:text-red-600"
															>
																Remove
															</button>
														)}
													</div>
												))}
												<button
													type="button"
													onClick={() =>
														edit((n) => {
															const last = n.families[fi].sizes.at(-1);
															n.families[fi].sizes.push({
																widthMm: (last?.widthMm ?? 600) + 100,
																priceRm: last?.priceRm ?? 0,
															});
														})
													}
													className="self-start text-[12px] text-[#2b6cb0] hover:underline"
												>
													+ Add size
												</button>
											</div>
										</div>
									</SectionCard>
								))}
								<button
									type="button"
									onClick={() =>
										edit((n) => {
											n.families.push({
												id: `family-${Date.now()}`,
												label: "New cabinet",
												kind: "base",
												depthMm: 600,
												heightMm: 880,
												floorHeightMm: 0,
												sizes: [{ widthMm: 600, priceRm: 0 }],
												hasWorktop: true,
												drawers: 0,
											});
										})
									}
									className="self-start rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm hover:border-neutral-500"
								>
									+ Add cabinet
								</button>
							</div>
						)}

						{tab === "doors" && (
							<div className="flex flex-col gap-3">
								<SectionCard
									title="Door width ladder"
									subtitle="Door prices round up to the next rung on this ladder."
								>
									<div className="flex flex-wrap items-center gap-2">
										{draft.doorWidthLadderMm.map((mm, i) => (
											<div
												// biome-ignore lint/suspicious/noArrayIndexKey: a ladder rung is a bare number with no id; the input is fully controlled from `draft`, so index keys can't strand stale state here.
												key={`rung-${mm}-${i}`}
												className="flex items-center gap-1"
											>
												<Num
													value={mm}
													min={1}
													width="w-20"
													onChange={(v) =>
														edit((n) => {
															n.doorWidthLadderMm[i] = v;
														})
													}
												/>
												{draft.doorWidthLadderMm.length > 1 && (
													<button
														type="button"
														onClick={() =>
															edit((n) => {
																n.doorWidthLadderMm.splice(i, 1);
															})
														}
														className="text-[12px] text-neutral-400 hover:text-red-600"
													>
														Remove
													</button>
												)}
											</div>
										))}
										<button
											type="button"
											onClick={() =>
												edit((n) => {
													n.doorWidthLadderMm.push(
														(n.doorWidthLadderMm.at(-1) ?? 600) + 100,
													);
												})
											}
											className="text-[12px] text-[#2b6cb0] hover:underline"
										>
											+ Add
										</button>
									</div>
								</SectionCard>

								{draft.doorStyles.map((style, di) => (
									<SectionCard
										key={style.id}
										title={style.label || "Untitled door"}
										subtitle={`Drawn as ${style.look}`}
										onRemove={
											draft.doorStyles.length > 1
												? () =>
														edit((n) => {
															n.doorStyles.splice(di, 1);
														})
												: undefined
										}
									>
										<div className="flex flex-wrap items-end gap-3">
											<Text
												label="Name"
												width="w-40"
												value={style.label}
												onChange={(v) =>
													edit((n) => {
														n.doorStyles[di].label = v;
													})
												}
											/>
											<Select
												label="Look"
												value={style.look}
												options={[
													{ value: "slab" as const, label: "Slab" },
													{ value: "shaker" as const, label: "Shaker" },
													{ value: "glass" as const, label: "Glass" },
												]}
												onChange={(v) =>
													edit((n) => {
														n.doorStyles[di].look = v;
													})
												}
											/>
										</div>
										<div className="mt-3 border-neutral-100 border-t pt-3">
											<p className="mb-2 text-[11px] text-neutral-500 uppercase tracking-wide">
												Price per width
											</p>
											<div className="flex flex-wrap gap-3">
												{draft.doorWidthLadderMm.map((mm) => (
													<Num
														key={`${style.id}-${mm}`}
														label={`${mm}mm`}
														width="w-20"
														value={style.priceRmBySizeMm[String(mm)] ?? 0}
														onChange={(v) =>
															edit((n) => {
																n.doorStyles[di].priceRmBySizeMm[String(mm)] =
																	v;
															})
														}
													/>
												))}
											</div>
										</div>
									</SectionCard>
								))}
								<button
									type="button"
									onClick={() =>
										edit((n) => {
											n.doorStyles.push({
												id: `door-${Date.now()}`,
												label: "New door",
												look: "slab",
												priceRmBySizeMm: Object.fromEntries(
													n.doorWidthLadderMm.map((mm) => [String(mm), 0]),
												),
											});
										})
									}
									className="self-start rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm hover:border-neutral-500"
								>
									+ Add door style
								</button>
							</div>
						)}

						{tab === "finishes" && (
							<SectionCard
								title="Finishes"
								subtitle="One colour applies to a whole room, which is how they're sold."
							>
								<div className="flex flex-col gap-2">
									{draft.finishes.map((finish, i) => (
										<div key={finish.id} className="flex items-center gap-2">
											<input
												type="color"
												aria-label={`${finish.label} colour`}
												value={finish.hex}
												onChange={(e) =>
													edit((n) => {
														n.finishes[i].hex = e.target.value;
													})
												}
												className="h-9 w-12 cursor-pointer rounded border border-neutral-300"
											/>
											<Text
												width="w-52"
												placeholder="Name"
												value={finish.label}
												onChange={(v) =>
													edit((n) => {
														n.finishes[i].label = v;
													})
												}
											/>
											<code className="text-[12px] text-neutral-400">
												{finish.hex}
											</code>
											{draft.finishes.length > 1 && (
												<button
													type="button"
													onClick={() =>
														edit((n) => {
															n.finishes.splice(i, 1);
														})
													}
													className="text-[12px] text-neutral-400 hover:text-red-600"
												>
													Remove
												</button>
											)}
										</div>
									))}
									<button
										type="button"
										onClick={() =>
											edit((n) => {
												n.finishes.push({
													id: `finish-${Date.now()}`,
													label: "New finish",
													hex: "#cccccc",
												});
											})
										}
										className="self-start text-[12px] text-[#2b6cb0] hover:underline"
									>
										+ Add finish
									</button>
								</div>
							</SectionCard>
						)}

						{tab === "rooms" && (
							<div className="flex flex-col gap-3">
								{draft.roomTypes.map((room, ri) => (
									<SectionCard
										key={room.id}
										title={room.label}
										subtitle="Which cabinets this room offers, and how wide its wall starts."
									>
										<div className="mb-3">
											<Num
												label="Default wall width mm"
												value={room.defaultWallWidthMm}
												min={1}
												onChange={(v) =>
													edit((n) => {
														n.roomTypes[ri].defaultWallWidthMm = v;
													})
												}
											/>
										</div>
										<p className="mb-2 text-[11px] text-neutral-500 uppercase tracking-wide">
											Cabinets offered
										</p>
										<div className="flex flex-wrap gap-1.5">
											{draft.families.map((family) => {
												const on = room.familyIds.includes(family.id);
												return (
													<button
														key={family.id}
														type="button"
														onClick={() =>
															edit((n) => {
																const ids = n.roomTypes[ri].familyIds;
																n.roomTypes[ri].familyIds = on
																	? ids.filter((id) => id !== family.id)
																	: [...ids, family.id];
																if (on) {
																	n.roomTypes[ri].starter = n.roomTypes[
																		ri
																	].starter.filter(
																		(s) => s.familyId !== family.id,
																	);
																}
															})
														}
														className={`rounded-full border px-3 py-1.5 font-medium text-xs ${
															on
																? "border-neutral-900 bg-neutral-900 text-white"
																: "border-neutral-200 bg-white text-neutral-600"
														}`}
													>
														{family.label}
													</button>
												);
											})}
										</div>
										{room.familyIds.length === 0 && (
											<p className="mt-2 text-[12px] text-red-600">
												A room needs at least one cabinet.
											</p>
										)}
									</SectionCard>
								))}
							</div>
						)}

						{tab === "standards" && (
							<div className="flex flex-col gap-3">
								<SectionCard
									title="Rates"
									subtitle="Charged on top of the per-cabinet prices."
								>
									<Num
										label="Worktop RM per running foot"
										value={
											draft.rates?.worktopRmPerFt ??
											DEFAULT_RATES.worktopRmPerFt
										}
										onChange={(v) =>
											edit((n) => {
												n.rates = {
													...DEFAULT_RATES,
													...n.rates,
													worktopRmPerFt: v,
												};
											})
										}
									/>
								</SectionCard>

								<SectionCard
									title="Build standards"
									subtitle="Workshop defaults — these change how cabinets are drawn."
								>
									<div className="flex flex-wrap gap-4">
										{(
											[
												["panelThicknessMm", "Board thickness mm"],
												["plinthHeightMm", "Plinth height mm"],
												["worktopThicknessMm", "Worktop thickness mm"],
												["doorLeavesThresholdMm", "Two doors above mm"],
											] as const
										).map(([key, label]) => (
											<Num
												key={key}
												label={label}
												value={
													draft.construction?.[key] ?? DEFAULT_CONSTRUCTION[key]
												}
												min={key === "plinthHeightMm" ? 0 : 1}
												onChange={(v) =>
													edit((n) => {
														n.construction = {
															...DEFAULT_CONSTRUCTION,
															...n.construction,
															[key]: v,
														};
													})
												}
											/>
										))}
									</div>
								</SectionCard>
							</div>
						)}

						{/* Review + publish */}
						<div className="rounded-lg border border-neutral-200 bg-white p-4">
							<div className="flex items-start justify-between gap-4">
								<div className="min-w-0 flex-1">
									<p className="font-medium text-sm">Review</p>
									{changes.length === 0 ? (
										<p className="mt-1 text-[13px] text-neutral-500">
											No changes yet.
										</p>
									) : (
										<ul className="mt-1.5 flex flex-col gap-1">
											{changes.map((line) => (
												<li key={line} className="text-[13px] text-neutral-700">
													• {line}
												</li>
											))}
										</ul>
									)}

									{issues.length > 0 && (
										<div className="mt-3 rounded border border-red-300 bg-red-50 p-2.5">
											<p className="font-medium text-[12px] text-red-900">
												Fix before publishing:
											</p>
											<ul className="mt-1 flex flex-col gap-0.5">
												{issues.slice(0, 8).map((issue) => (
													<li
														key={`${issue.path.join(".")}-${issue.message}`}
														className="text-[12px] text-red-800"
													>
														{issue.path.join(" › ") || "catalogue"} —{" "}
														{issue.message}
													</li>
												))}
											</ul>
										</div>
									)}
								</div>

								<div className="flex shrink-0 flex-col items-end gap-2">
									{save.status === "idle" && (
										<button
											type="button"
											onClick={saveDraft}
											disabled={changes.length === 0 || issues.length > 0}
											className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-500 disabled:opacity-40"
										>
											Save as draft
										</button>
									)}
									{save.status === "saving" && (
										<span className="text-neutral-500 text-sm">Saving…</span>
									)}
									{save.status === "draft" && (
										<button
											type="button"
											onClick={() => publish(save.id)}
											className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white"
										>
											Publish to customers
										</button>
									)}
									{save.status === "publishing" && (
										<span className="text-neutral-500 text-sm">
											Publishing…
										</span>
									)}
									{save.status === "published" && (
										<span className="text-green-700 text-sm">
											Published — live in the planner.
										</span>
									)}
									{save.status === "error" && (
										<span className="max-w-[240px] text-right text-red-700 text-sm">
											{save.message}
										</span>
									)}
									<button
										type="button"
										onClick={() => setShowJson((v) => !v)}
										className="text-[12px] text-neutral-400 hover:text-neutral-700"
									>
										{showJson ? "Hide JSON" : "View as JSON"}
									</button>
								</div>
							</div>

							{showJson && (
								<pre className="mt-3 max-h-80 overflow-auto rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-[11px]">
									{JSON.stringify(draft, null, 2)}
								</pre>
							)}
						</div>
					</div>
				)}
			</main>
		</div>
	);
}
