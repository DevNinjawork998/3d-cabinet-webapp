"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
	Suspense,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ImageSlot } from "@/components/admin/ImageSlot";
import { chipClass, fieldClass } from "@/components/admin/styles";
import { summariseCatalogueChanges } from "@/lib/catalogue/diff";
import { blockersOf, strandedFamilyIds } from "@/lib/catalogue/health";
import { finishSlot, siteImageSrc } from "@/lib/catalogue/siteImages";
import { type Construction, constructionOf } from "@/lib/planner/catalogue";
import {
	type Family,
	type PlannerCatalogue,
	plannerCatalogueSchema,
} from "@/lib/planner/catalogueSchema";
import { DEFAULT_FINISH_TEXTURES } from "@/lib/planner/finishTextures";
import { fitOutOf, standOf } from "@/lib/planner/parts";

/**
 * Field-level editor for the live planner catalogue.
 *
 * Replaces the raw-JSON textarea on `/admin/import`, which could only be
 * reached by uploading a design file first and reported a bad edit as the
 * string "not valid JSON". Everything here still goes out through the same
 * `POST /versions` → `.../publish` gate, so schema validation, the DRAFT
 * review step and cache revalidation are unchanged — only the editing
 * surface is new.
 *
 * Opens on the published catalogue by default, or on `?version=<id>` — which
 * is how `/admin/import` hands over the draft it just built from a design.
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
	| { status: "publishing"; id: string }
	| { status: "published" }
	| { status: "error"; message: string };

type OpenedVersion = {
	id: string;
	version: number;
	status: "DRAFT" | "PUBLISHED";
	note: string | null;
	publishedAt: string | null;
	/** The published version, for the "open the live catalogue" link. Both
	 * fields, because the link needs the id and the label needs the number. */
	publishedVersion: number | null;
	publishedVersionId: string | null;
};

/**
 * These three own their own `<label>` rather than being wrapped in one by the
 * caller: a `<label>` around a component reads as unlabelled to a screen
 * reader, since the association is only made when the control is a real
 * descendant element.
 */
/**
 * The family's `geometry`, created on first edit.
 *
 * It is optional in the schema so catalogues published before design intake
 * keep validating, which means the editor cannot assume it exists. Defaults
 * match what `Cabinet.tsx` falls back to when it is absent, so opening a family
 * and changing one field does not silently restyle the rest of it.
 */
/** What `/api/admin/cabinet-designs` returns per row, narrowed to the fields
 * the coverage badge reads. */
type DesignRow = {
	id: string;
	name: string;
	filename: string;
	meshBytes: number | null;
	meshGroups: { role: string; triangles: number }[] | null;
};

/**
 * What the planner will actually draw for one rung.
 *
 * Three states, and they mean genuinely different things:
 *
 * - **drafted** — a design is attached and converted; the customer sees the
 *   model the drafter made.
 * - **none** — no design has been pushed for this width, so the planner falls
 *   back to procedural boxes. Expected, and the thing to close by uploading.
 * - **missing** — the rung points at a design row that no longer exists. That
 *   is a published catalogue referencing something that was deleted underneath
 *   it, which nothing else would ever surface.
 */
function rungCoverage(
	meshDesignId: string | undefined,
	designs: Record<string, DesignRow>,
) {
	if (!meshDesignId) return { state: "none" as const };
	const design = designs[meshDesignId];
	if (!design) return { state: "missing" as const };
	const triangles = (design.meshGroups ?? []).reduce(
		(n, group) => n + group.triangles,
		0,
	);
	return { state: "drafted" as const, design, triangles };
}

function withGeometry(family: Family): NonNullable<Family["geometry"]> {
	family.geometry ??= {
		shelves: 1,
		fixedShelves: 0,
		doorLeaves: 0,
		drawers: family.drawers,
		hasBack: true,
		legs: 0,
		legHeightMm: 0,
		// Zero means "not recorded", so `parts.ts` keeps using its own constants
		// rather than being told the foot really is 0mm across.
		legDiameterMm: 0,
		legInsetMm: 0,
	};
	return family.geometry;
}

/**
 * What the scene falls back to for this family, in one line.
 *
 * Computed with the same functions the renderer calls — `fitOutOf` and
 * `standOf` — rather than by reading `family.geometry` directly. That is the
 * point: on a rung with a design the drawn mesh overrides these numbers
 * anyway, and `fitOutOf` already encodes the precedence (a drawer bank carries
 * no shelf; a leaf count belongs to the width, not the family). Restating the
 * stored fields as inputs invited edits the scene would ignore.
 */
function fitOutSummary(family: Family, construction: Construction): string {
	const widest = Math.max(...family.sizes.map((s) => s.widthMm));
	const fit = fitOutOf(family, widest, construction);
	const stand = standOf(family, construction);

	const parts: string[] = [];
	parts.push(
		fit.shelves === 0
			? "no shelf"
			: `${fit.shelves} ${fit.shelves === 1 ? "shelf" : "shelves"}`,
	);
	if (fit.drawers > 0) {
		parts.push(`${fit.drawers} ${fit.drawers === 1 ? "drawer" : "drawers"}`);
	}
	// `cabinetPartsMm` returns early for a drawer bank and never emits a
	// doorLeaf record — a leaf count on top of drawers is a caption for
	// geometry the scene does not draw.
	if (fit.drawers === 0) {
		parts.push(
			fit.doorLeaves === 0
				? "no door"
				: `${fit.doorLeaves} door ${
						fit.doorLeaves === 1 ? "leaf" : "leaves"
					} at ${widest} mm`,
		);
	}
	parts.push(fit.hasBack ? "back panel" : "open back");
	if (stand.legs > 0) {
		const diameter = family.geometry?.legDiameterMm ?? 0;
		parts.push(
			`${stand.legs} legs, ${stand.heightMm} mm${
				diameter > 0 ? ` × ⌀${diameter}` : ""
			}, ${stand.insetMm} mm in`,
		);
	} else if (family.kind !== "wall") {
		parts.push(`recessed plinth, ${stand.heightMm} mm`);
	}
	return parts.join(" · ");
}

/**
 * One rung's coverage badge.
 *
 * Deliberately quiet for the common case: with one design in the library,
 * twenty-nine of these say "no design", and a row of warnings would train the
 * reader to ignore all of them. Only `missing` is loud, because only `missing`
 * is broken.
 */
function RungCoverage({
	coverage,
}: {
	coverage: ReturnType<typeof rungCoverage>;
}) {
	if (coverage.state === "none") {
		return (
			<span className="text-[11px] text-neutral-400">
				no design · drawn procedurally
			</span>
		);
	}

	if (coverage.state === "missing") {
		return (
			<span className="text-[11px] text-amber-700">
				design deleted — falls back to procedural
			</span>
		);
	}

	return (
		<span
			className="truncate text-[11px] text-[#166534]"
			title={coverage.design.filename}
		>
			● {coverage.design.name} · {coverage.triangles.toLocaleString()} tris
			{coverage.design.meshBytes
				? ` · ${Math.round(coverage.design.meshBytes / 1024)} KB`
				: ""}
		</span>
	);
}

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

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The finish colour as something you can paste into.
 *
 * `<input type="color">` alone can only be *picked*. A supplier gives the
 * colour as a number — Max World's MW 13526 NW is #cc9168 — and the OS colour
 * panel was the only way in: open it, find its own hex field, type it there.
 * The swatch keeps the picker for eyeballing; this is the typed path, and it
 * takes a pasted "cc9168" without the hash because that is how they arrive.
 *
 * Typing is held locally so a half-finished "#cc9" never reaches the draft —
 * only a complete hex commits. The draft can still change underneath (undo,
 * or opening another version), so the local copy follows it back.
 */
function HexField({
	value,
	label,
	onChange,
}: {
	value: string;
	label: string;
	onChange: (hex: string) => void;
}) {
	const [text, setText] = useState(value);
	useEffect(() => setText(value), [value]);
	const valid = HEX.test(text);
	return (
		<input
			value={text}
			aria-label={`${label} hex colour`}
			spellCheck={false}
			placeholder="#cc9168"
			onChange={(e) => {
				const typed = e.target.value.trim();
				const hex = typed === "" || typed.startsWith("#") ? typed : `#${typed}`;
				setText(hex);
				if (HEX.test(hex)) onChange(hex.toLowerCase());
			}}
			// Red rather than silently ignored: the colour on screen is still the
			// last good one, so without this the field looks accepted and is not.
			className={`w-24 rounded border px-2 py-1.5 font-mono text-[12px] ${
				valid
					? "border-neutral-300 text-neutral-500"
					: "border-red-400 text-red-600"
			}`}
		/>
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

/**
 * `useSearchParams` opts the tree out of prerendering, so the boundary is
 * required — without it the build fails on this route.
 */
export default function CatalogueEditorPage() {
	return (
		<Suspense fallback={null}>
			<CatalogueEditor />
		</Suspense>
	);
}

function CatalogueEditor() {
	const router = useRouter();
	// `/admin/import` sends the reviewer straight here with the draft it just
	// created. Without this the editor could only ever open the published
	// version, and an imported draft would be unreachable.
	const versionId = useSearchParams().get("version");
	const [live, setLive] = useState<PlannerCatalogue | null>(null);
	const [draft, setDraft] = useState<PlannerCatalogue | null>(null);
	/** Which version the editor is looking at — a DRAFT waiting to be reviewed,
	 * or the live one. Drives the header and the review panel's copy. */
	const [openedVersion, setOpenedVersion] = useState<OpenedVersion | null>(
		null,
	);
	const [tab, setTab] = useState<Tab>("families");
	/** Filters the Cabinets tab by family label or rung width. At ~200 rungs a
	 * flat scroll stops being navigable, and a width is how someone hunts. */
	const [familyQuery, setFamilyQuery] = useState("");
	const [loadError, setLoadError] = useState<string | null>(null);
	const [save, setSave] = useState<SaveState>({ status: "idle" });
	const [showJson, setShowJson] = useState(false);
	const [confirming, setConfirming] = useState(false);

	/**
	 * Decor photo per finish slot, `finish:<id>` → URL.
	 *
	 * Fetched rather than passed in: `/admin/site-content` is a server component
	 * and reads `siteImage` straight from Postgres, but this page is a client
	 * component, so it asks the same data through the API instead.
	 *
	 * Deliberately *not* part of `draft`. A photo is live the moment it is
	 * dropped and carries no version, while everything else on this page is
	 * draft-gated — mixing them into one object would let "Save as draft" imply
	 * it was holding a photo back.
	 */
	const [finishPhotos, setFinishPhotos] = useState<Record<string, string>>({});

	/**
	 * The design behind each rung, `designId` → row.
	 *
	 * A rung's `meshDesignId` says which design the planner draws for it, and
	 * without this nothing on any admin screen said which rungs are drafted and
	 * which fall back to procedural boxes. That gap is easy to miss and
	 * expensive: the client's first look at the planner was a run of seven
	 * cabinets, none of which had a design, and the fallback leg is what they
	 * noticed.
	 *
	 * Same reasoning as `finishPhotos` for fetching rather than receiving it,
	 * and same reason for keeping it out of `draft`: it is not editable here.
	 */
	const [designs, setDesigns] = useState<Record<string, DesignRow>>({});

	const loadDesigns = useCallback(async () => {
		const res = await fetch("/api/admin/cabinet-designs");
		if (!res.ok) return;
		const body = await res.json();
		const next: Record<string, DesignRow> = {};
		for (const design of body.designs ?? []) next[design.id] = design;
		setDesigns(next);
	}, []);

	const loadFinishPhotos = useCallback(async () => {
		const res = await fetch("/api/admin/site-images");
		if (!res.ok) return;
		const body = await res.json();
		const next: Record<string, string> = {};
		for (const image of body.images ?? []) {
			next[image.key] = siteImageSrc(image.key, image.updatedAt);
		}
		setFinishPhotos(next);
	}, []);

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
			type VersionRow = {
				id: string;
				version: number;
				status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
				note: string | null;
				publishedAt: string | null;
				data: PlannerCatalogue;
			};
			const versions: VersionRow[] = body.versions ?? [];
			const published = versions.find((v) => v.status === "PUBLISHED");

			// `?version=` still wins — that is how /admin/import hands over the
			// draft it just built. Absent it, an open DRAFT is what the admin was
			// sent here to deal with: the design library tells them to price it
			// here, and opening the live catalogue instead showed them a screen
			// with none of their work in it.
			const asked = versionId
				? versions.find((v) => v.id === versionId)
				: (versions.find((v) => v.status === "DRAFT") ?? null);

			if (versionId && !asked) {
				setLoadError("That catalogue version no longer exists");
				return;
			}
			if (!published && !asked) {
				setLoadError("No published planner catalogue to edit yet");
				return;
			}
			const opened = asked ?? published;
			if (!opened) return;

			// Edits are always diffed against what is live, even when the editor
			// opened on a draft — "what changes if I publish this" is the only
			// comparison that means anything.
			setLive(published?.data ?? opened.data);
			setDraft(JSON.parse(JSON.stringify(opened.data)));
			setOpenedVersion({
				id: opened.id,
				version: opened.version,
				status: opened.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
				note: opened.note,
				publishedAt: opened.publishedAt,
				publishedVersion: published?.version ?? null,
				publishedVersionId: published?.id ?? null,
			});
		})();
		loadFinishPhotos();
		loadDesigns();
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

	// A rung priced at nothing is schema-valid, so `issues` never sees it. It is
	// the one thing a design file structurally cannot supply, which makes it the
	// blocker that actually occurs.
	const blockers = useMemo(() => (draft ? blockersOf(draft) : []), [draft]);

	/**
	 * The Cabinets tab, grouped the way an admin arrives thinking: one room at a
	 * time. Membership comes from `roomTypes[].familyIds`, which the tab used to
	 * ignore entirely — so a family in no room looked healthy here while being
	 * unreachable from the planner.
	 */
	const familyGroups = useMemo(() => {
		if (!draft) return [];
		const q = familyQuery.trim().toLowerCase();
		const matches = (family: Family) =>
			q === "" ||
			family.label.toLowerCase().includes(q) ||
			family.sizes.some((s) => String(s.widthMm).includes(q));

		const stranded = new Set(strandedFamilyIds(draft));
		const indexOf = new Map(draft.families.map((f, i) => [f.id, i]));

		const groups = draft.roomTypes.map((room) => ({
			key: room.id as string,
			label: room.label,
			stranded: false,
			indices: room.familyIds
				.map((id) => indexOf.get(id))
				.filter((i): i is number => i !== undefined)
				.filter((i) => matches(draft.families[i])),
		}));

		groups.push({
			key: "__stranded",
			label: "In no room — customers cannot see these",
			stranded: true,
			indices: draft.families
				.map((f, i) => (stranded.has(f.id) ? i : -1))
				.filter((i) => i >= 0)
				.filter((i) => matches(draft.families[i])),
		});

		return groups.filter((g) => g.indices.length > 0);
	}, [draft, familyQuery]);

	/** The workshop constants the scene resolves with — board thickness and
	 * plinth height decide the fit-out the fallback draws. */
	const construction = useMemo(
		() => (draft ? constructionOf(draft) : null),
		[draft],
	);

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
		return body.id as string;
	}

	/**
	 * One gesture from the admin's side: they confirmed the change list, so the
	 * draft is a record of what was published, not a step they have to take.
	 * Still two requests — the version row is the audit trail and the publish
	 * endpoint is the only thing that flips it live.
	 */
	async function saveAndPublish() {
		const id = await saveDraft();
		if (id) await publish(id);
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
					{openedVersion?.status === "DRAFT" ? (
						<>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-[11px] text-amber-900 uppercase tracking-wide">
								<span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
								Draft v{openedVersion.version} · not live
							</span>
							<h1 className="mt-2 font-semibold text-lg">
								Review this draft before customers see it
							</h1>
							<p className="text-neutral-500 text-sm">
								{openedVersion.note ??
									"Nothing on this draft reaches the planner until you publish it."}
							</p>
							{openedVersion.publishedVersionId && (
								<a
									href={`/admin/catalogue?version=${openedVersion.publishedVersionId}`}
									className="mt-1 inline-block text-[12px] text-neutral-500 underline"
								>
									Open the live catalogue (v{openedVersion.publishedVersion})
									instead
								</a>
							)}
						</>
					) : (
						<>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-2.5 py-1 font-semibold text-[11px] text-green-900 uppercase tracking-wide">
								<span className="h-1.5 w-1.5 rounded-full bg-green-600" />
								Live{openedVersion ? ` · v${openedVersion.version}` : ""}
							</span>
							<h1 className="mt-2 font-semibold text-lg">Catalogue</h1>
							<p className="text-neutral-500 text-sm">
								What the planner offers and what it charges. Changes are saved
								as a draft first — nothing reaches customers until you publish.
							</p>
						</>
					)}
				</div>

				{loadError && (
					<p className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 text-sm">
						{loadError}
					</p>
				)}

				{draft && (
					<div className="flex flex-col gap-4">
						{changes.length > 0 && (
							<div className="rounded-lg border border-neutral-200 bg-white">
								<div className="flex flex-wrap items-baseline gap-2.5 border-neutral-100 border-b px-4 py-3">
									<p className="text-[11px] text-neutral-500 uppercase tracking-wide">
										Needs you
									</p>
									<span className="text-[12px] text-neutral-400">
										{blockers.length === 0
											? "nothing blocking · ready to publish"
											: `${blockers.length} rung${
													blockers.length === 1 ? "" : "s"
												} still need${blockers.length === 1 ? "s" : ""} a price`}
									</span>
								</div>

								<ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-neutral-100 border-b px-4 py-3">
									{changes.map((line) => (
										<li key={line} className="text-[13px] text-neutral-700">
											· {line}
										</li>
									))}
								</ul>

								{blockers.map((blocker) => {
									const { familyIndex: fi, sizeIndex: si } = blocker;
									if (!draft.families[fi]?.sizes[si]) return null;
									return (
										<div
											key={`${fi}-${si}`}
											className="flex flex-wrap items-center justify-between gap-3 border-neutral-100 border-b px-4 py-3 last:border-b-0"
										>
											<div className="min-w-0">
												<p className="text-sm">
													<span className="font-medium">
														{blocker.familyLabel}
													</span>{" "}
													·{" "}
													<span className="tabular-nums">
														{blocker.widthMm} mm
													</span>
												</p>
												<p className="text-[12px] text-neutral-500">
													{blocker.meshDesignId
														? "Drawn from a design, but carries no price"
														: "No price set"}
												</p>
											</div>
											<div className="flex items-center gap-2">
												<span className="text-[12px] text-neutral-400">RM</span>
												<Num
													value={draft.families[fi].sizes[si].priceRm}
													width="w-24"
													onChange={(v) =>
														edit((n) => {
															n.families[fi].sizes[si].priceRm = v;
														})
													}
												/>
											</div>
										</div>
									);
								})}
							</div>
						)}
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
								<input
									type="search"
									value={familyQuery}
									onChange={(e) => setFamilyQuery(e.target.value)}
									placeholder="Search cabinets or a width, e.g. 900"
									aria-label="Search cabinets or a width"
									className={fieldClass(false, "w-full max-w-xs")}
								/>

								{familyGroups.map((group) => (
									<div key={group.key} className="flex flex-col gap-3">
										<div
											className={`flex flex-wrap items-baseline gap-2 pt-1 ${
												group.stranded ? "text-amber-800" : "text-neutral-500"
											}`}
										>
											<p className="text-[11px] uppercase tracking-wide">
												{group.label}
											</p>
											<span className="text-[12px] text-neutral-400">
												{group.indices.length} famil
												{group.indices.length === 1 ? "y" : "ies"} ·{" "}
												{group.indices.reduce(
													(n, i) => n + draft.families[i].sizes.length,
													0,
												)}{" "}
												rungs ·{" "}
												{group.indices.reduce(
													(n, i) =>
														n +
														draft.families[i].sizes.filter(
															(s) => s.meshDesignId,
														).length,
													0,
												)}{" "}
												drawn
											</span>
										</div>

										{group.indices.map((fi) => {
											const family = draft.families[fi];
											return (
												<SectionCard
													key={family.id}
													title={family.label || "Untitled cabinet"}
													subtitle={`${family.kind} · ${family.sizes.length} size${
														family.sizes.length === 1 ? "" : "s"
													} · ${
														family.sizes.filter((s) => s.meshDesignId).length
													} drawn from a design`}
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
														{family.geometry ? (
															<div className="flex flex-col gap-1">
																<span className="text-[11px] text-neutral-500">
																	Drawers
																</span>
																<p className="px-2.5 py-2 text-neutral-700 text-sm tabular-nums">
																	{family.geometry.drawers}
																	<span className="ml-1.5 text-[12px] text-neutral-400">
																		from design
																	</span>
																</p>
															</div>
														) : (
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
														)}
														<label className="flex items-center gap-1.5 pb-2 text-[12px]">
															<input
																type="checkbox"
																checked={family.hasWorktop}
																onChange={(e) =>
																	edit((n) => {
																		n.families[fi].hasWorktop =
																			e.target.checked;
																	})
																}
															/>
															Worktop
														</label>
													</div>

													{/* What the planner actually draws inside the carcass.
										    Until this existed the numbers could only come from a
										    design-file parse, so a miscounted shelf rendered wrong
										    for good — there was nowhere to correct it. `geometry`
										    is optional in the schema, so a family that has none
										    (everything seeded before design intake) falls back to
										    the old constants until someone edits it here. */}
													<div className="mt-3 border-neutral-100 border-t pt-3">
														<p className="text-[11px] text-neutral-500 uppercase tracking-wide">
															What it holds
														</p>
														<p className="mt-1 text-[13px] text-neutral-700">
															{construction
																? fitOutSummary(family, construction)
																: "—"}
															<span className="text-neutral-400">
																{family.geometry
																	? " — measured from a design"
																	: " — no design yet, planner defaults"}
															</span>
														</p>
														<details className="mt-2">
															<summary className="cursor-pointer text-[12px] text-neutral-500 underline">
																Override these
															</summary>
															<p className="mt-2 text-[12px] text-neutral-500">
																Only for correcting a bad parse. A rung with a
																design draws the mesh, not these numbers.
															</p>
															<div className="mt-2 flex flex-wrap items-end gap-3">
																<Num
																	label="Shelves"
																	value={family.geometry?.shelves ?? 1}
																	width="w-16"
																	onChange={(v) =>
																		edit((n) => {
																			withGeometry(n.families[fi]).shelves = v;
																		})
																	}
																/>
																<Num
																	label="Fixed shelves"
																	value={family.geometry?.fixedShelves ?? 0}
																	width="w-16"
																	onChange={(v) =>
																		edit((n) => {
																			withGeometry(
																				n.families[fi],
																			).fixedShelves = v;
																		})
																	}
																/>
																<Num
																	label="Door leaves"
																	value={family.geometry?.doorLeaves ?? 0}
																	width="w-16"
																	onChange={(v) =>
																		edit((n) => {
																			withGeometry(n.families[fi]).doorLeaves =
																				v;
																		})
																	}
																/>
																<Num
																	label="Drawer fronts"
																	value={
																		family.geometry?.drawers ?? family.drawers
																	}
																	width="w-16"
																	onChange={(v) =>
																		edit((n) => {
																			withGeometry(n.families[fi]).drawers = v;
																		})
																	}
																/>
																<label className="flex items-center gap-1.5 pb-2 text-[12px]">
																	<input
																		type="checkbox"
																		checked={family.geometry?.hasBack ?? true}
																		onChange={(e) =>
																			edit((n) => {
																				withGeometry(n.families[fi]).hasBack =
																					e.target.checked;
																			})
																		}
																	/>
																	Back panel
																</label>
																{/* Feet. Zero means the recessed plinth the scene
												    draws for everything that did not say otherwise. */}
																<Num
																	label="Legs"
																	value={family.geometry?.legs ?? 0}
																	width="w-16"
																	onChange={(v) =>
																		edit((n) => {
																			withGeometry(n.families[fi]).legs = v;
																		})
																	}
																/>
																<Num
																	label="Leg height mm"
																	value={family.geometry?.legHeightMm ?? 0}
																	width="w-20"
																	onChange={(v) =>
																		edit((n) => {
																			withGeometry(n.families[fi]).legHeightMm =
																				v;
																		})
																	}
																/>
																{/* Zero in either of these means "not recorded", so
												    `parts.ts` keeps its own constants — 50mm across,
												    35mm in. An import fills a zero and never
												    overwrites a number typed here, so these have to
												    be typeable or that protection guards nothing. */}
																<Num
																	label="Leg ⌀ mm"
																	value={family.geometry?.legDiameterMm ?? 0}
																	width="w-20"
																	onChange={(v) =>
																		edit((n) => {
																			withGeometry(
																				n.families[fi],
																			).legDiameterMm = v;
																		})
																	}
																/>
																<Num
																	label="Leg inset mm"
																	value={family.geometry?.legInsetMm ?? 0}
																	width="w-20"
																	onChange={(v) =>
																		edit((n) => {
																			withGeometry(n.families[fi]).legInsetMm =
																				v;
																		})
																	}
																/>
															</div>
														</details>
													</div>

													<div className="mt-3 border-neutral-100 border-t pt-3">
														<p className="mb-2 text-[11px] text-neutral-500 uppercase tracking-wide">
															Offered in
														</p>
														<div className="flex flex-wrap gap-1.5">
															{draft.roomTypes.map((room, ri) => {
																const on = room.familyIds.includes(family.id);
																return (
																	<button
																		key={room.id}
																		type="button"
																		onClick={() =>
																			edit((n) => {
																				const ids = n.roomTypes[ri].familyIds;
																				n.roomTypes[ri].familyIds = on
																					? ids.filter((id) => id !== family.id)
																					: [...ids, family.id];
																				// A starter layout may not place a cabinet the
																				// room no longer offers.
																				if (on) {
																					n.roomTypes[ri].starter = n.roomTypes[
																						ri
																					].starter.filter(
																						(s) => s.familyId !== family.id,
																					);
																				}
																			})
																		}
																		className={chipClass(on)}
																	>
																		{room.label}
																	</button>
																);
															})}
														</div>
														{!draft.roomTypes.some((r) =>
															r.familyIds.includes(family.id),
														) && (
															<p className="mt-2 text-[12px] text-amber-800">
																No room offers this cabinet, so no customer can
																see it. Ticking a room is what puts it in the
																planner; unticking every room retires it without
																losing its prices.
															</p>
														)}
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
																	<RungCoverage
																		coverage={rungCoverage(
																			size.meshDesignId,
																			designs,
																		)}
																	/>
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
											);
										})}
									</div>
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
								{/* The photo and the colour sit together because they are two
								    answers to the same question, but they do not travel
								    together: catalogue edits wait for Publish, a dropped photo
								    is live at once. Saying so here is cheaper than explaining
								    a surprise later. */}
								<p className="mb-3 text-[12px] text-neutral-500">
									Drop the supplier&rsquo;s board scan on a swatch to use the
									real material: it becomes the door and end-panel surface in
									3D, the chip in the planner&rsquo;s finish picker, and the
									swatch on the homepage. Without one the finish is drawn as its
									flat colour everywhere — never as a stand-in woodgrain,
									because a customer must not be shown a board nobody sells.
									Photos go live immediately — they are not part of the draft.
									Removing an upload falls back to the board shipped with the
									app, if there is one.
								</p>
								<div className="flex flex-col gap-2">
									{draft.finishes.map((finish, i) => {
										const board =
											finishPhotos[finishSlot(finish.id)] ??
											DEFAULT_FINISH_TEXTURES[finish.id] ??
											null;
										return (
											<div key={finish.id} className="flex items-center gap-2">
												<div className="w-[54px] shrink-0">
													{/* An upload wins, but a finish can also have a board
												    shipped in the repo — Rhone Oak does. Showing only
												    uploads left that slot looking empty while the
												    planner was busy rendering with it. Layered the same
												    way `app/planner/page.tsx` layers them, so this
												    shows what the 3D is actually using. */}
													<ImageSlot
														slotKey={finishSlot(finish.id)}
														placeholder="Board"
														url={board}
														height={40}
														radius={6}
														onChangeAction={loadFinishPhotos}
													/>
												</div>
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
												<HexField
													value={finish.hex}
													label={finish.label}
													onChange={(hex) =>
														edit((n) => {
															n.finishes[i].hex = hex;
														})
													}
												/>
												{/* Coverage, said out loud. A finish with no board is
											    perfectly sellable — it is a painted door — but which
											    ones those are is otherwise invisible until you look
											    at the homepage and wonder why one swatch is flat. */}
												{!board && (
													<span className="text-[11px] text-neutral-400">
														no board · flat colour
													</span>
												)}
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
										);
									})}
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

									{blockers.length > 0 && (
										<p className="mt-3 text-[12px] text-amber-800">
											{blockers.length} rung
											{blockers.length === 1 ? "" : "s"} still need
											{blockers.length === 1 ? "s" : ""} a price before this can
											go live.
										</p>
									)}
								</div>

								<div className="flex shrink-0 flex-col items-end gap-2">
									{save.status === "idle" && (
										<button
											type="button"
											onClick={() => setConfirming(true)}
											disabled={
												changes.length === 0 ||
												issues.length > 0 ||
												blockers.length > 0
											}
											className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
										>
											Publish to customers
										</button>
									)}
									{(save.status === "saving" ||
										save.status === "publishing") && (
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

						{/*
						 * Publishing is the only thing on this screen a customer
						 * can see, so it gets the one confirmation step. Native
						 * `<dialog>` rather than an overlay div: Esc, the
						 * backdrop and the focus trap come with it.
						 */}
						{confirming && (
							<dialog
								ref={(el) => {
									if (el && !el.open) el.showModal();
								}}
								onClose={() => setConfirming(false)}
								className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-neutral-200 p-5 backdrop:bg-neutral-900/40"
							>
								<p className="font-medium text-sm">
									Publish {changes.length}{" "}
									{changes.length === 1 ? "change" : "changes"} to customers?
								</p>
								<ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-auto">
									{changes.map((line) => (
										<li key={line} className="text-[13px] text-neutral-700">
											• {line}
										</li>
									))}
								</ul>
								<p className="mt-3 text-[13px] text-neutral-500">
									The planner shows this to everyone straight away.
								</p>
								<div className="mt-4 flex justify-end gap-2">
									<button
										type="button"
										onClick={() => setConfirming(false)}
										className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-500"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={() => {
											setConfirming(false);
											saveAndPublish();
										}}
										className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white"
									>
										Publish
									</button>
								</div>
							</dialog>
						)}
					</div>
				)}
			</main>
		</div>
	);
}
