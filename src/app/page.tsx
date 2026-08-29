import Link from "next/link";
import { prisma } from "@/lib/catalogue/db";
import {
	finishSlot,
	HERO_SLOT,
	roomSlot,
	siteImageSrc,
} from "@/lib/catalogue/siteImages";
import { getPublishedPlannerCatalogue } from "@/lib/catalogue/store";
import { ROOM_TYPES, type RoomTypeId } from "@/lib/planner/catalogue";
import { DEFAULT_FINISH_TEXTURES } from "@/lib/planner/finishTextures";
import { starterFor } from "@/lib/planner/layout";
import { computePlannerPrice } from "@/lib/planner/pricing";

/**
 * Design tokens for this page, stated once.
 *
 * The base is the incumbent brand: warm paper (`#e9e7e3`), raised warm white
 * (`#fdfcfb`), ink for actions. What was missing was any accent at all — every
 * element was the same neutral, so nothing could be emphasised without making
 * it bigger. `ACCENT` is the one accent on the page and it appears nowhere as
 * decoration: eyebrow, price figure, links, and the closing band. Nothing else.
 *
 * Radius is locked to 12px everywhere — cards, images, buttons — because the
 * page previously mixed six different values.
 */
const ACCENT = "#2c5f47";
const PAPER = "#e9e7e3";
const RAISED = "#fdfcfb";
const RULE = "#d9d5cd";

const rm = (amount: number) =>
	amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

const ROOM_SUBTITLES: Record<RoomTypeId, string> = {
	kitchen: "Real Infinite Cabinet sizes",
	living: "TV ledge & display units",
	bedroom: "Wardrobes",
	foyer: "Shoe cabinets & bench",
};

/**
 * The tone a room card carries before anyone uploads a photo of it. Kept
 * inside the brand's own neutral band so four unphotographed cards still read
 * as one set rather than four placeholders.
 */
const ROOM_TONE: Record<RoomTypeId, string> = {
	kitchen: "#cfc6b6",
	living: "#c7ccc6",
	bedroom: "#d3cbc2",
	foyer: "#c3c8cc",
};

/**
 * The bento. Four rooms, four cells, eight tracks: the lead room takes a 2x2
 * and the rest tile the remainder exactly, so the grid never ends on a hole.
 * Written out in full because Tailwind only sees class names it can read in
 * the source.
 */
const ROOM_SPAN = [
	"min-h-[300px] lg:col-span-2 lg:row-span-2 lg:min-h-0",
	"min-h-[200px] lg:col-span-2 lg:min-h-0",
	"min-h-[200px] lg:min-h-0",
	"min-h-[200px] lg:min-h-0",
];

const HOW_IT_WORKS = [
	{
		title: "Pick your room",
		detail:
			"Choose kitchen, living room, bedroom or foyer, and set your real wall dimensions.",
	},
	{
		title: "Drop in cabinets, to scale",
		detail:
			"Arrange real Infinite Cabinet units in 3D and swap finishes until it looks right.",
	},
	{
		title: "Get an instant quote",
		detail:
			"See a live price as you build, then send your plan straight to our team.",
	},
];

const FAQS = [
	{
		q: "How long does delivery take?",
		a: "Most orders arrive within 4-6 weeks of confirming your plan, depending on finish and cabinet size.",
	},
	{
		q: "Can I get cabinets installed too?",
		a: "Yes. Installation can be added when you send your plan to our team for a final quote.",
	},
	{
		q: "What are the cabinets made of?",
		a: "Solid carcasses with a choice of veneer, laminate or painted finishes. The full range is in the planner.",
	},
	{
		q: "Can I change my design after ordering?",
		a: "Changes are free before production starts. Our team will confirm your plan with you first.",
	},
	{
		q: "Do you offer a warranty?",
		a: "Every cabinet comes with a 5-year warranty on hardware and construction.",
	},
];

/**
 * A homepage photo, or what stands in until someone drops one on
 * `/admin/site-content`. Every slot is optional, so the page has to look
 * deliberate with no photography at all, which is its state today.
 *
 * `fallbackSrc` lets a slot name a real image that ships in the repo rather
 * than a flat panel. The hero uses it: a photograph of a board the client
 * actually buys beats a tinted rectangle, and a client upload still wins.
 */
function Photo({
	url,
	alt,
	className = "",
	fallbackSrc,
	fallbackStyle,
}: {
	url: string | null;
	alt: string;
	className?: string;
	fallbackSrc?: string;
	fallbackStyle?: React.CSSProperties;
}) {
	const src = url ?? fallbackSrc ?? null;
	if (!src) {
		return <div className={className} style={fallbackStyle} aria-hidden />;
	}
	// Plain <img>: the photos live on a Blob host next/image isn't configured
	// for, and adding a remote pattern for a bucket whose domain varies per
	// deploy is more moving parts than the optimisation is worth here.
	// biome-ignore lint/performance/noImgElement: see above
	return <img src={src} alt={alt} className={`object-cover ${className}`} />;
}

export default async function Home() {
	// Read the live catalogue so the swatch row and the hero price can't drift
	// from what the planner actually offers after a publish.
	//
	// ponytail: `starterFor` reads the module-level FAMILIES/ROOM_TYPES, which
	// server-side are still the static fixtures (`setActivePlannerCatalogue`
	// is deliberately client-only — see its note in catalogue.ts). So the
	// starter *layout* is static while its *prices* come from the DB. Fine
	// while the two agree; if a published catalogue ever changes a room's
	// starter widths, this headline figure needs `layout.ts` parameterised
	// like `pricing.ts` already is.
	const [{ data: catalogue }, siteImages] = await Promise.all([
		getPublishedPlannerCatalogue(),
		prisma.siteImage.findMany(),
	]);
	const photo = new Map(
		siteImages.map((i) => [i.key, siteImageSrc(i.key, i.updatedAt)]),
	);

	const kitchenPrice = computePlannerPrice(
		starterFor("kitchen"),
		catalogue.finishes[0].id,
		catalogue,
	);

	/**
	 * Every figure here is a claim already made in the FAQ or the planner. None
	 * of it is invented: a fabricated statistic on a fabricator's homepage is
	 * the one thing their sales team would have to walk back on a call.
	 */
	const FACTS = [
		{ value: `RM ${rm(kitchenPrice.totalRm)}`, label: "Starter kitchen run" },
		{ value: "4-6 weeks", label: "Typical delivery" },
		{ value: "5 years", label: "Warranty on hardware and build" },
		{ value: "No account", label: "Needed to plan and price" },
	];

	return (
		<div
			className="flex min-h-screen flex-col text-neutral-900"
			style={{ backgroundColor: PAPER }}
		>
			{/* Nav */}
			<header
				className="sticky top-0 z-10 border-b"
				style={{ backgroundColor: RAISED, borderColor: RULE }}
			>
				<div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-6 px-6 sm:px-8">
					<span className="shrink-0 font-bold text-[15px] tracking-tight">
						Infinite Cabinet
					</span>
					{/* Tight gap, padding on each link instead: the tap target is the
					    padded box, not just the glyphs. Hidden below lg rather than
					    wrapped to a second line — the CTA is what matters on mobile. */}
					<nav className="hidden items-center gap-1 lg:flex">
						{[
							["How it works", "#how"],
							["Gallery", "#gallery"],
							["Finishes", "#finishes"],
							["FAQ", "#faq"],
						].map(([label, href]) => (
							<a
								key={href}
								href={href}
								className="rounded-xl px-3 py-2.5 text-[13px] text-neutral-600 transition-colors hover:text-neutral-900"
							>
								{label}
							</a>
						))}
						<Link
							href="/tutorials"
							className="rounded-xl px-3 py-2.5 text-[13px] text-neutral-600 transition-colors hover:text-neutral-900"
						>
							Tutorials
						</Link>
					</nav>
					<div className="flex shrink-0 items-center gap-4">
						<Link
							href="/planner"
							className="rounded-xl bg-neutral-900 px-4.5 py-2.5 font-medium text-[13px] text-white transition-transform active:translate-y-px"
						>
							Start planning
						</Link>
						<Link
							href="/admin/login"
							target="_blank"
							className="hidden border-l py-2.5 pl-4 text-[12px] text-neutral-400 transition-colors hover:text-neutral-600 sm:block"
							style={{ borderColor: RULE }}
						>
							Admin
						</Link>
					</div>
				</div>
			</header>

			{/* Hero — full bleed.
			    The photograph is the argument. A kitchen someone can imagine
			    standing in does more work than any sentence, which is why this
			    stopped being a column of text beside a swatch: the image is now
			    the section, and the words sit on it.

			    It has to hold up before that photo exists, though — the
			    `SiteImage` table starts empty and the client's photography
			    arrives when it arrives. So the fallback is not a grey box
			    waiting to be replaced: it is the finish the planner actually
			    renders on its doors, banded into a deep gradient, which reads as
			    a deliberate dark hero rather than a hole. One upload to the
			    `hero` slot at /admin/site-content swaps it, no code change. */}
			<section className="relative isolate w-full overflow-hidden">
				<div className="absolute inset-0 -z-20 bg-neutral-900">
					<Photo
						url={photo.get(HERO_SLOT) ?? null}
						alt="A finished Infinite Cabinet kitchen"
						fallbackSrc={DEFAULT_FINISH_TEXTURES["rhone-oak"]}
						className="h-full w-full"
					/>
				</div>

				{/* Two overlays, not one. A flat scrim dims the photo evenly and
				    leaves the text no more legible than before; this darkens the
				    left, where the words are, and lets the right side of the
				    photograph stay bright. The bottom fade is what stops the
				    headline fighting whatever the camera found down there. */}
				<div
					className="-z-10 absolute inset-0"
					style={{
						background:
							"linear-gradient(100deg, rgba(14,15,14,.86) 0%, rgba(14,15,14,.72) 38%, rgba(14,15,14,.22) 78%, rgba(14,15,14,.12) 100%)",
					}}
					aria-hidden
				/>
				<div
					className="-z-10 absolute inset-x-0 bottom-0 h-1/3"
					style={{
						background:
							"linear-gradient(to top, rgba(14,15,14,.55), transparent)",
					}}
					aria-hidden
				/>

				<div className="mx-auto flex min-h-[clamp(460px,68vh,640px)] w-full max-w-[1180px] flex-col justify-center px-6 py-20 sm:px-8 sm:py-24">
					<p className="mb-5 font-semibold text-[11px] text-white/70 uppercase tracking-[0.16em]">
						Free to try · no account needed
					</p>
					{/* The accent word is the product, not decoration — the template
					    this follows colours a noun, and the noun worth colouring
					    here is the thing nobody else in the market offers. */}
					<h1 className="max-w-[15ch] text-balance font-bold text-[clamp(38px,6vw,68px)] text-white leading-[1.02] tracking-[-0.02em]">
						Design your kitchen <span style={{ color: "#8fc4a8" }}>in 3D</span>
					</h1>
					<p className="mt-6 max-w-[46ch] text-[17px] text-white/75 leading-7">
						Drop real Infinite Cabinet units into your own room, see the price
						move as you build, and send us the plan.
					</p>
					<div className="mt-9 flex flex-wrap items-center gap-3">
						<Link
							href="/planner"
							className="rounded-xl bg-white px-8 py-4 font-semibold text-[15px] text-neutral-900 transition-transform active:translate-y-px"
						>
							Start planning
						</Link>
						{/* Ghost, not a second solid button: two equal buttons make the
						    customer choose, and the choice we want is the planner. */}
						<a
							href="#how"
							className="rounded-xl border border-white/30 px-8 py-4 font-medium text-[15px] text-white/90 transition-colors hover:border-white/60 active:translate-y-px"
						>
							How it works
						</a>
					</div>
				</div>
			</section>

			{/* Facts — trust strip, under the hero rather than inside it. */}
			<section
				className="border-y"
				style={{ backgroundColor: RAISED, borderColor: RULE }}
			>
				<dl className="mx-auto grid max-w-[1180px] grid-cols-2 gap-x-6 gap-y-8 px-6 py-10 sm:px-8 lg:grid-cols-4">
					{FACTS.map((fact) => (
						<div key={fact.label}>
							<dt
								className="font-semibold text-[22px] tracking-tight"
								style={{ color: ACCENT }}
							>
								{fact.value}
							</dt>
							<dd className="mt-1 text-[13px] text-neutral-500 leading-5">
								{fact.label}
							</dd>
						</div>
					))}
				</dl>
			</section>

			{/* How it works — no cards. Three uneven columns separated by a rule,
			    which is what the hairline is for. */}
			<section
				id="how"
				className="mx-auto w-full max-w-[1180px] px-6 py-20 sm:px-8"
			>
				<h2 className="mb-12 max-w-[520px] font-semibold text-[30px] leading-tight tracking-tight">
					Three steps from an empty wall to a quote
				</h2>
				<div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_1fr_1fr] lg:gap-12">
					{HOW_IT_WORKS.map((step) => (
						<div
							key={step.title}
							className="border-t pt-5"
							style={{ borderColor: ACCENT }}
						>
							<h3 className="mb-2.5 font-semibold text-[18px] tracking-tight">
								{step.title}
							</h3>
							<p className="text-[14px] text-neutral-600 leading-6">
								{step.detail}
							</p>
						</div>
					))}
				</div>
			</section>

			{/* Gallery — bento. Four rooms, four cells, kitchen carries the weight. */}
			<section
				id="gallery"
				className="border-y"
				style={{ backgroundColor: RAISED, borderColor: RULE }}
			>
				<div className="mx-auto w-full max-w-[1180px] px-6 py-20 sm:px-8">
					<h2 className="mb-2 font-semibold text-[30px] leading-tight tracking-tight">
						Explore by room
					</h2>
					<p className="mb-10 max-w-[520px] text-[15px] text-neutral-600 leading-6">
						Every room starts from real Infinite Cabinet sizes and a layout
						already on your wall.
					</p>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[224px]">
						{ROOM_TYPES.map((room, i) => (
							<Link
								key={room.id}
								href={`/planner?room=${room.id}`}
								className={`group relative flex flex-col justify-end overflow-hidden rounded-xl border transition-transform active:translate-y-px ${ROOM_SPAN[i] ?? "min-h-[200px] lg:min-h-0"}`}
								style={{ borderColor: RULE }}
							>
								<Photo
									url={photo.get(roomSlot(room.id)) ?? null}
									alt={`${room.label} cabinets`}
									className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.03]"
									// Flat tone rather than the grain tile: at card scale the
									// grain reads as brushed metal stripes, and four large
									// striped fields fight the photos that will replace them.
									fallbackStyle={{
										position: "absolute",
										inset: 0,
										backgroundColor: ROOM_TONE[room.id],
									}}
								/>
								<div className="relative bg-gradient-to-t from-black/70 to-transparent px-5 pt-14 pb-4.5">
									<p className="font-semibold text-[15px] text-white">
										{room.label}
									</p>
									<p className="mt-0.5 text-[12px] text-white/75">
										{ROOM_SUBTITLES[room.id]}
									</p>
								</div>
							</Link>
						))}
					</div>
				</div>
			</section>

			{/* Finishes */}
			<section
				id="finishes"
				className="mx-auto w-full max-w-[1180px] px-6 py-20 sm:px-8"
			>
				<h2 className="mb-2 font-semibold text-[30px] leading-tight tracking-tight">
					Finishes &amp; materials
				</h2>
				<p className="mb-10 max-w-[520px] text-[15px] text-neutral-600 leading-6">
					Swap finishes on any cabinet right inside the planner.
				</p>
				<div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
					{catalogue.finishes.map((finish) => {
						// A swatch photo if one's been uploaded, otherwise the
						// catalogue's flat colour — which is a perfectly good swatch,
						// so an empty slot is a fallback rather than a hole.
						const swatch =
							photo.get(finishSlot(finish.id)) ??
							DEFAULT_FINISH_TEXTURES[finish.id];
						return (
							<div key={finish.id}>
								{swatch ? (
									<Photo
										url={swatch}
										alt={finish.label}
										className="mb-2.5 h-24 w-full rounded-xl border"
									/>
								) : (
									<div
										className="mb-2.5 h-24 rounded-xl border"
										style={{
											borderColor: RULE,
											backgroundColor: finish.hex,
											backgroundImage: "url(/grain.png)",
											// One tile per ~56px keeps the grain fine at swatch
											// scale; larger and it reads as wide stripes.
											backgroundSize: "56px",
											backgroundBlendMode: "multiply",
										}}
									/>
								)}
								<p className="text-[12px] text-neutral-600">{finish.label}</p>
							</div>
						);
					})}
				</div>
			</section>

			{/* FAQ — sticky headline beside the accordion, so the right column
			    carries the interaction and the left stays a fixed anchor. */}
			<section
				id="faq"
				className="border-y"
				style={{ backgroundColor: RAISED, borderColor: RULE }}
			>
				<div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-10 px-6 py-20 sm:px-8 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
					<h2 className="font-semibold text-[30px] leading-tight tracking-tight lg:sticky lg:top-28 lg:self-start">
						Frequently asked questions
					</h2>
					<div className="flex flex-col">
						{FAQS.map((item) => (
							<details
								key={item.q}
								className="group border-b py-4.5 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none"
								style={{ borderColor: RULE }}
							>
								<summary className="flex cursor-pointer items-center justify-between gap-4 font-medium text-[15px]">
									{item.q}
									{/* CSS chevron: a rotated corner of a box. No icon library
									    for one glyph, and no hand-drawn SVG path. */}
									<span
										aria-hidden
										className="mt-[-3px] size-2 shrink-0 rotate-45 border-r-2 border-b-2 transition-transform duration-200 group-open:mt-[3px] group-open:-rotate-135"
										style={{ borderColor: ACCENT }}
									/>
								</summary>
								<p className="mt-3 max-w-[62ch] text-[14px] text-neutral-600 leading-6">
									{item.a}
								</p>
							</details>
						))}
					</div>
				</div>
			</section>

			{/* Close. The page previously ended on the FAQ. */}
			<section style={{ backgroundColor: ACCENT }}>
				<div className="mx-auto flex max-w-[1180px] flex-col items-start gap-7 px-6 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 className="max-w-[520px] text-balance font-semibold text-[30px] text-white leading-tight tracking-tight">
							Your wall, your sizes, your price. In about five minutes.
						</h2>
						<p className="mt-3 max-w-[440px] text-[15px] text-white/70 leading-6">
							Nothing to install and nothing to sign up for.
						</p>
					</div>
					<Link
						href="/planner"
						className="shrink-0 rounded-xl bg-white px-7 py-3.5 font-medium text-[14px] text-neutral-900 transition-transform active:translate-y-px"
					>
						Start planning
					</Link>
				</div>
			</section>

			{/* Footer */}
			<footer className="mt-auto bg-neutral-900 text-neutral-200">
				<div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 px-6 py-14 sm:grid-cols-[2fr_1fr_1fr] sm:px-8">
					<div>
						<p className="mb-2 font-bold text-[15px] text-white">
							Infinite Cabinet
						</p>
						<p className="max-w-[280px] text-[13px] text-neutral-400 leading-5">
							Custom cabinets, planned in 3D and built to your room's real
							dimensions.
						</p>
					</div>
					<div>
						<p className="mb-3 font-semibold text-[12px] text-neutral-500 uppercase tracking-[0.06em]">
							Product
						</p>
						<div className="flex flex-col gap-2.5">
							<Link
								href="/planner"
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								Start planning
							</Link>
							<a
								href="#gallery"
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								Gallery
							</a>
							<a
								href="#faq"
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								FAQ
							</a>
							<Link
								href="/tutorials"
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								Tutorials
							</Link>
						</div>
					</div>
					<div>
						<p className="mb-3 font-semibold text-[12px] text-neutral-500 uppercase tracking-[0.06em]">
							Contact
						</p>
						<div className="flex flex-col gap-2.5">
							<a
								href="mailto:hello@infinitecabinet.com"
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								hello@infinitecabinet.com
							</a>
							<Link
								href="/admin/login"
								className="text-[13px] text-neutral-500 transition-colors hover:text-neutral-300"
							>
								Admin sign in
							</Link>
						</div>
					</div>
				</div>
				<div className="border-neutral-800 border-t px-6 py-4.5 text-center sm:px-8">
					<p className="text-[12px] text-neutral-500">
						© 2026 Infinite Cabinet. All rights reserved.
					</p>
				</div>
			</footer>
		</div>
	);
}
