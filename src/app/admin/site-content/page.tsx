import { AdminHeader } from "@/components/admin/AdminHeader";
import { ImageSlot } from "@/components/admin/ImageSlot";
import { prisma } from "@/lib/catalogue/db";
import { finishSlot, roomSlot, siteImageSrc } from "@/lib/catalogue/siteImages";
import { getPublishedPlannerCatalogue } from "@/lib/catalogue/store";

/**
 * The photos on the public homepage. No publish step — a dropped photo is
 * live immediately, so the write endpoint purges `/` on the way out.
 *
 * There is no hero slot: the homepage hero is the scroll-scrubbed cabinet
 * sequence in `public/hero-frames`, which is code, not content. `HERO_SLOT`
 * still exists in `siteImages.ts` so any row already uploaded under it stays
 * addressable rather than orphaned.
 *
 * Room and finish slots come from the published catalogue rather than a
 * fixed list: the design mocks six finish slots with invented names, but
 * finishes here are catalogue data, so a hardcoded list would drift the
 * moment someone adds one in `/admin/catalogue`.
 */
export default async function SiteContentPage() {
	const [{ data: catalogue }, images] = await Promise.all([
		getPublishedPlannerCatalogue(),
		prisma.siteImage.findMany(),
	]);

	const byKey = new Map(images.map((i) => [i.key, i]));
	const urlFor = (key: string) => {
		const image = byKey.get(key);
		return image ? siteImageSrc(image.key, image.updatedAt) : null;
	};

	return (
		<div className="flex min-h-screen flex-col bg-[#f4f3f1] text-neutral-900">
			<AdminHeader />

			<main className="mx-auto flex w-full max-w-[900px] flex-col gap-9 px-7 pt-8 pb-16">
				<div>
					<h1 className="mb-1 font-semibold text-[22px]">Site content</h1>
					<p className="text-neutral-500 text-[13px]">
						Photos here are live on the homepage as soon as you drop them — no
						publish step. Drag an image onto any slot below, or click to browse.
					</p>
				</div>

				<section>
					<p className="mb-1 font-semibold text-[12px] text-neutral-600 uppercase tracking-[0.06em]">
						Room gallery
					</p>
					<p className="mb-3 text-[12px] text-neutral-500">
						The room-type cards on the homepage.
					</p>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
						{catalogue.roomTypes.map((room) => (
							<ImageSlot
								key={room.id}
								slotKey={roomSlot(room.id)}
								label={room.label}
								placeholder={`${room.label} photo`}
								url={urlFor(roomSlot(room.id))}
								height={130}
							/>
						))}
					</div>
				</section>

				<section>
					<p className="mb-1 font-semibold text-[12px] text-neutral-600 uppercase tracking-[0.06em]">
						Finishes &amp; materials
					</p>
					<p className="mb-3 text-[12px] text-neutral-500">
						The real board, used in two places: the swatch on the homepage and
						the door surface in the 3D planner. A slot per finish in the live
						catalogue — leave one empty to show its flat colour instead.{" "}
						{/* A finish is catalogue data, so it arrives here only once it has
						    been published. Adding one on this page would mean either a
						    publish step on a page that promises none, or a published
						    version edited in place — so this points at the editor that
						    already does it properly rather than growing a second one. */}
						<a
							href="/admin/catalogue?tab=finishes"
							className="font-medium text-[#2b6cb0] underline"
						>
							Add or rename a finish in Catalogue
						</a>{" "}
						— its colour and board live there, and a new one appears here once
						the catalogue is published.
					</p>
					<div className="grid grid-cols-3 gap-3.5 sm:grid-cols-6">
						{catalogue.finishes.map((finish) => (
							<ImageSlot
								key={finish.id}
								slotKey={finishSlot(finish.id)}
								label={finish.label}
								placeholder={finish.label}
								url={urlFor(finishSlot(finish.id))}
								height={74}
								radius={8}
							/>
						))}
					</div>
				</section>
			</main>
		</div>
	);
}
