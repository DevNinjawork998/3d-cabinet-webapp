import Link from "next/link";
import {
	CATEGORY_LABELS,
	CATEGORY_SWATCH,
	ROOM_LABELS,
	ROOM_TO_PLANNER,
	ROOMS,
	type Room,
} from "@/lib/catalogue/cabinetDesignLabels";
import { prisma } from "@/lib/catalogue/db";

/**
 * Public gallery of published cabinet designs — the customer-facing surface
 * `/admin/cabinet-designs` claims to publish to but, until this page, never
 * actually reached anyone. Spec-sheet only: `CabinetDesign` rows aren't fed
 * into the procedural engine (their vocabulary doesn't match `Family`), so
 * "Customize" links out to the room in `/planner` rather than prefilling it.
 * (A design can separately be *published* into the planner's live catalogue
 * from `/admin/cabinet-designs` — see `cabinetDesignToFamily.ts`.)
 */

const rm = (amount: number) =>
	amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

export default async function DesignsPage({
	searchParams,
}: {
	searchParams: Promise<{ room?: string }>;
}) {
	const { room: roomParam } = await searchParams;
	const room = ROOMS.includes(roomParam as Room) ? (roomParam as Room) : null;

	const designs = await prisma.cabinetDesign.findMany({
		where: { status: "PUBLISHED", ...(room ? { room } : {}) },
		orderBy: { updatedAt: "desc" },
		select: {
			id: true,
			name: true,
			category: true,
			room: true,
			widthMm: true,
			heightMm: true,
			depthMm: true,
			priceRm: true,
			sku: true,
			description: true,
			finishes: true,
		},
	});

	return (
		<main className="min-h-screen bg-[#e9e7e3] text-neutral-900">
			<div className="mx-auto max-w-6xl px-5 py-8">
				<h1 className="font-semibold text-2xl">Browse designs</h1>
				<p className="mt-1 text-neutral-600 text-sm">
					Real cabinets from Infinite Cabinet, ready to customise for your
					space.
				</p>

				<div className="mt-5 flex flex-wrap gap-1.5">
					<Link
						href="/designs"
						className={`rounded-full px-3 py-1.5 text-xs ${
							room === null
								? "bg-neutral-900 text-white"
								: "bg-white text-neutral-600 shadow-[inset_0_0_0_1px_#e5e5e5]"
						}`}
					>
						All rooms
					</Link>
					{ROOMS.map((r) => (
						<Link
							key={r}
							href={`/designs?room=${r}`}
							className={`rounded-full px-3 py-1.5 text-xs ${
								room === r
									? "bg-neutral-900 text-white"
									: "bg-white text-neutral-600 shadow-[inset_0_0_0_1px_#e5e5e5]"
							}`}
						>
							{ROOM_LABELS[r]}
						</Link>
					))}
				</div>

				{designs.length === 0 ? (
					<p className="mt-10 text-neutral-500 text-sm">
						No designs published yet — check back soon.
					</p>
				) : (
					<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{designs.map((d) => (
							<div
								key={d.id}
								className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
							>
								<div
									className="flex h-32 items-center justify-center font-medium text-sm text-white/90"
									style={{ backgroundColor: CATEGORY_SWATCH[d.category] }}
								>
									{CATEGORY_LABELS[d.category]}
								</div>
								<div className="space-y-2 p-4">
									<div className="flex items-start justify-between gap-2">
										<h2 className="font-medium text-sm">{d.name}</h2>
										<span className="shrink-0 text-neutral-500 text-xs">
											{ROOM_LABELS[d.room]}
										</span>
									</div>
									<p className="text-neutral-500 text-xs tabular-nums">
										{d.widthMm} × {d.heightMm} × {d.depthMm} mm
									</p>
									{d.description && (
										<p className="line-clamp-2 text-neutral-600 text-xs">
											{d.description}
										</p>
									)}
									{d.finishes.length > 0 && (
										<div className="flex flex-wrap gap-1">
											{d.finishes.map((f) => (
												<span
													key={f}
													className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600"
												>
													{f}
												</span>
											))}
										</div>
									)}
									<div className="flex items-center justify-between pt-1">
										<span className="font-semibold text-sm">
											RM {rm(d.priceRm)}
										</span>
										<Link
											href={`/planner?room=${ROOM_TO_PLANNER[d.room]}`}
											className="rounded-full bg-neutral-900 px-3 py-1.5 text-white text-xs"
										>
											Customize in planner
										</Link>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</main>
	);
}
