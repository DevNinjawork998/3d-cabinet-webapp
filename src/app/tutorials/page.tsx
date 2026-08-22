"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CATEGORIES = [
	{ id: "all", label: "All types" },
	{ id: "base", label: "Base cabinets" },
	{ id: "wall", label: "Wall cabinets" },
	{ id: "wardrobe", label: "Wardrobes" },
	{ id: "drawer", label: "Drawers" },
	{ id: "island", label: "Islands" },
] as const;

const LEVELS = [
	{ id: "all", label: "All levels" },
	{ id: "beginner", label: "Beginner" },
	{ id: "intermediate", label: "Intermediate" },
	{ id: "advanced", label: "Advanced" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];
type LevelId = (typeof LEVELS)[number]["id"];

type Tutorial = {
	id: string;
	title: string;
	description: string;
	category: Exclude<CategoryId, "all">;
	level: Exclude<LevelId, "all">;
	duration: string;
};

const TUTORIALS: Tutorial[] = [
	{
		id: "t1",
		title: "Assembling a base cabinet carcass",
		description:
			"Panels, cams and dowels: building your first flat-pack base cabinet from the box.",
		category: "base",
		level: "beginner",
		duration: "8 min",
	},
	{
		id: "t2",
		title: "Installing soft-close drawer runners",
		description:
			"Mounting and aligning runners so drawers sit flush and close quietly.",
		category: "drawer",
		level: "beginner",
		duration: "6 min",
	},
	{
		id: "t3",
		title: "Choosing the right screws and fixings",
		description:
			"A quick guide to the fixings that ship with your order and when to use each.",
		category: "wall",
		level: "beginner",
		duration: "5 min",
	},
	{
		id: "t4",
		title: "Fitting hinges and adjusting doors",
		description:
			"Attaching concealed hinges and dialing in the 3-way adjustment for a level door.",
		category: "base",
		level: "beginner",
		duration: "7 min",
	},
	{
		id: "t5",
		title: "Hanging wall cabinets level and square",
		description:
			"Finding studs, setting a ledger line, and hanging a run of wall units true.",
		category: "wall",
		level: "intermediate",
		duration: "10 min",
	},
	{
		id: "t6",
		title: "Building a wardrobe carcass from flat-pack panels",
		description:
			"Assembling a tall wardrobe body and squaring it before it goes upright.",
		category: "wardrobe",
		level: "intermediate",
		duration: "14 min",
	},
	{
		id: "t7",
		title: "Joining two cabinet runs seamlessly",
		description:
			"Clamping, aligning and fixing adjacent carcasses so the run reads as one piece.",
		category: "base",
		level: "intermediate",
		duration: "9 min",
	},
	{
		id: "t8",
		title: "Scribing cabinets to an uneven wall",
		description:
			"Marking and trimming a side panel so a cabinet sits tight against a bowed wall.",
		category: "base",
		level: "advanced",
		duration: "12 min",
	},
	{
		id: "t9",
		title: "Planning and cutting an island countertop overhang",
		description:
			"Working out support and overhang before cutting the top for a kitchen island.",
		category: "island",
		level: "advanced",
		duration: "15 min",
	},
];

const LABEL = Object.fromEntries(
	[...CATEGORIES, ...LEVELS].map((o) => [o.id, o.label]),
) as Record<string, string>;

/** The dark plate a video will sit in once real footage exists. */
function VideoPlaceholder({
	className,
	big = false,
	children,
}: {
	className: string;
	big?: boolean;
	children?: React.ReactNode;
}) {
	return (
		<div
			className={`relative flex items-center justify-center bg-neutral-900 ${className}`}
		>
			<div
				className={`flex items-center justify-center rounded-full bg-white/15 ${big ? "h-16 w-16" : "h-11 w-11"}`}
			>
				<svg
					viewBox="0 0 24 24"
					aria-hidden="true"
					className={`ml-0.5 fill-white ${big ? "h-[26px] w-[26px]" : "h-[18px] w-[18px]"}`}
				>
					<path d="M6 4l14 8-14 8V4z" />
				</svg>
			</div>
			{children}
		</div>
	);
}

export default function Tutorials() {
	const [category, setCategory] = useState<CategoryId>("all");
	const [level, setLevel] = useState<LevelId>("all");
	const [activeId, setActiveId] = useState<string | null>(null);

	// Esc closes the player — the backdrop click is mouse-only.
	useEffect(() => {
		if (!activeId) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setActiveId(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [activeId]);

	const filtered = TUTORIALS.filter(
		(t) =>
			(category === "all" || t.category === category) &&
			(level === "all" || t.level === level),
	);
	const active = TUTORIALS.find((t) => t.id === activeId) ?? null;

	return (
		<div className="flex min-h-screen flex-col bg-[#e9e7e3] text-neutral-900">
			{/* Nav */}
			<div className="sticky top-0 z-10 border-neutral-200 border-b bg-[#fdfcfb]">
				<div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-8">
					<div className="flex items-center gap-0.5 text-[13px] text-neutral-400">
						<Link
							href="/"
							className="px-1 py-2.5 font-semibold text-neutral-900"
						>
							Infinite Cabinet
						</Link>
						<span>/</span>
						<span className="px-1 py-2.5 text-neutral-900">Tutorials</span>
					</div>
					<div className="flex items-center gap-4">
						<Link
							href="/planner"
							className="rounded-[9px] bg-neutral-900 px-4.5 py-2.5 font-medium text-[13px] text-white"
						>
							Start planning
						</Link>
						<Link
							href="/admin/login"
							target="_blank"
							className="border-neutral-200 border-l py-2.5 pl-4 text-[12px] text-neutral-400 hover:text-neutral-600"
						>
							Admin
						</Link>
					</div>
				</div>
			</div>

			{/* Header */}
			<div className="mx-auto w-full max-w-[1180px] px-8 pt-14">
				<p className="mb-2.5 font-semibold text-[#8a8478] text-xs uppercase tracking-[0.08em]">
					Learn
				</p>
				<h1 className="mb-3 font-bold text-[34px] leading-[1.15] tracking-tight">
					DIY tutorials
				</h1>
				<p className="mb-9 max-w-[560px] text-[15px] text-neutral-600 leading-[22px]">
					Step-by-step videos for building and installing Infinite Cabinet units
					yourself, from a first flat-pack carcass to fitting a full run.
				</p>
			</div>

			{/* Filters */}
			<div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-6 px-8 pb-5">
				<div className="flex flex-wrap gap-2">
					{CATEGORIES.map((c) => (
						<button
							key={c.id}
							type="button"
							onClick={() => setCategory(c.id)}
							aria-pressed={category === c.id}
							className={
								category === c.id
									? "rounded-full bg-neutral-900 px-[15px] py-2 font-medium text-[13px] text-white"
									: "rounded-full border border-neutral-200 bg-white px-[15px] py-2 text-[13px] text-neutral-600"
							}
						>
							{c.label}
						</button>
					))}
				</div>
				<div className="flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 p-[3px]">
					{LEVELS.map((l) => (
						<button
							key={l.id}
							type="button"
							onClick={() => setLevel(l.id)}
							aria-pressed={level === l.id}
							className={
								level === l.id
									? "rounded-full bg-white px-3.5 py-1.5 font-medium text-[13px] text-neutral-900 shadow-sm"
									: "rounded-full px-3.5 py-1.5 text-[13px] text-neutral-600"
							}
						>
							{l.label}
						</button>
					))}
				</div>
			</div>

			{/* Grid */}
			<div className="mx-auto w-full max-w-[1180px] flex-1 px-8 pt-5 pb-18">
				{filtered.length > 0 ? (
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{filtered.map((t) => (
							<button
								key={t.id}
								type="button"
								onClick={() => setActiveId(t.id)}
								className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left"
							>
								<VideoPlaceholder className="h-[150px] w-full">
									<span className="absolute right-2.5 bottom-2 rounded-[5px] bg-black/50 px-[7px] py-0.5 text-[11px] text-white">
										{t.duration}
									</span>
								</VideoPlaceholder>
								<div className="flex flex-1 flex-col gap-2 px-4.5 py-4">
									<div className="flex gap-1.5">
										<span className="rounded-full bg-neutral-100 px-2.5 py-[3px] font-medium text-[11px] text-neutral-600">
											{LABEL[t.category]}
										</span>
										<span className="rounded-full bg-[#f0efe9] px-2.5 py-[3px] font-medium text-[#8a8478] text-[11px]">
											{LABEL[t.level]}
										</span>
									</div>
									<h3 className="font-semibold text-[15px] leading-5">
										{t.title}
									</h3>
									<p className="text-[13px] text-neutral-500 leading-[19px]">
										{t.description}
									</p>
								</div>
							</button>
						))}
					</div>
				) : (
					<div className="rounded-xl border border-neutral-200 bg-white px-6 py-14 text-center text-[14px] text-neutral-500">
						No tutorials match those filters yet.
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="mt-auto bg-neutral-900 text-neutral-200">
				<div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-7 text-[12px] text-neutral-400">
					<span>© Infinite Cabinet</span>
					<Link href="/" className="text-neutral-400">
						Back to site
					</Link>
				</div>
			</div>

			{/* Player */}
			{active && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
					role="dialog"
					aria-modal="true"
					aria-label={active.title}
				>
					{/* The backdrop is a click target, not a control: the ✕ below is the
					    keyboard/screen-reader way out, so this stays a plain div. */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: see above */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
					<div className="absolute inset-0" onClick={() => setActiveId(null)} />
					<div className="relative w-full max-w-[720px] overflow-hidden rounded-[14px] bg-white">
						<VideoPlaceholder className="h-[380px] w-full" big>
							<button
								type="button"
								onClick={() => setActiveId(null)}
								aria-label="Close"
								className="absolute top-3.5 right-3.5 h-8 w-8 rounded-full bg-white/15 text-[16px] text-white"
							>
								✕
							</button>
						</VideoPlaceholder>
						<div className="px-6 py-5">
							<h3 className="mb-1.5 font-semibold text-[17px]">
								{active.title}
							</h3>
							<p className="text-[13px] text-neutral-500 leading-5">
								{active.description}
							</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
