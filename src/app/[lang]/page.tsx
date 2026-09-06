import Link from "next/link";
import { notFound } from "next/navigation";
import RevealOnEnter from "@/components/scroll/RevealOnEnter";
import ScrollSequence from "@/components/scroll/ScrollSequence";
import ScrollTrack from "@/components/scroll/ScrollTrack";
import { prisma } from "@/lib/catalogue/db";
import { finishSlot, roomSlot, siteImageSrc } from "@/lib/catalogue/siteImages";
import { getPublishedPlannerCatalogue } from "@/lib/catalogue/store";
import { getDictionary } from "@/lib/copy/dictionary";
import type { Dictionary } from "@/lib/copy/en";
import { fill } from "@/lib/copy/fill";
import { isLocale } from "@/lib/copy/locales";
import type { RoomTypeId } from "@/lib/planner/catalogue";
import { DEFAULT_FINISH_TEXTURES } from "@/lib/planner/finishTextures";
import { plannerEngine } from "@/lib/planner/layout";
import { computePlannerPrice } from "@/lib/planner/pricing";
import { HERO_POSTER_FRAME, heroFrameSrc } from "@/lib/scroll/sequence";

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

const roomSubtitles = (t: Dictionary): Record<RoomTypeId, string> => ({
	kitchen: t.landing.gallery.roomSubtitle.kitchen,
	living: t.landing.gallery.roomSubtitle.living,
	bedroom: t.landing.gallery.roomSubtitle.bedroom,
	foyer: t.landing.gallery.roomSubtitle.foyer,
});

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

const howItWorks = (t: Dictionary) => [
	{ title: t.landing.how.step1Title, detail: t.landing.how.step1Detail },
	{ title: t.landing.how.step2Title, detail: t.landing.how.step2Detail },
	{ title: t.landing.how.step3Title, detail: t.landing.how.step3Detail },
];

const faqs = (t: Dictionary) => [
	{ q: t.landing.faq.q1, a: t.landing.faq.a1 },
	{ q: t.landing.faq.q2, a: t.landing.faq.a2 },
	{ q: t.landing.faq.q3, a: t.landing.faq.a3 },
	{ q: t.landing.faq.q4, a: t.landing.faq.a4 },
	{ q: t.landing.faq.q5, a: t.landing.faq.a5 },
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

export default async function Home({
	params,
}: {
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();

	// Read the live catalogue so the swatch row, the room strip and the hero
	// price can't drift from what the planner actually offers after a publish.
	const [{ data: catalogue }, siteImages, t] = await Promise.all([
		getPublishedPlannerCatalogue(),
		prisma.siteImage.findMany(),
		getDictionary(lang),
	]);
	const engine = plannerEngine(catalogue);
	const photo = new Map(
		siteImages.map((i) => [i.key, siteImageSrc(i.key, i.updatedAt)]),
	);

	const kitchenPrice = computePlannerPrice(
		engine.starterFor("kitchen"),
		catalogue.finishes[0].id,
		catalogue,
	);

	/**
	 * Every figure here is a claim already made in the FAQ or the planner. None
	 * of it is invented: a fabricated statistic on a fabricator's homepage is
	 * the one thing their sales team would have to walk back on a call.
	 */
	const FACTS = [
		{
			value: `RM ${rm(kitchenPrice.totalRm)}`,
			label: t.landing.facts.starterKitchenLabel,
		},
		{
			value: t.landing.facts.typicalDeliveryValue,
			label: t.landing.facts.typicalDeliveryLabel,
		},
		{
			value: t.landing.facts.warrantyValue,
			label: t.landing.facts.warrantyLabel,
		},
		{
			value: t.landing.facts.noAccountValue,
			label: t.landing.facts.noAccountLabel,
		},
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
						{t.common.brand}
					</span>
					{/* Tight gap, padding on each link instead: the tap target is the
					    padded box, not just the glyphs. Hidden below lg rather than
					    wrapped to a second line — the CTA is what matters on mobile. */}
					<nav className="hidden items-center gap-1 lg:flex">
						{[
							[t.landing.nav.howItWorks, "#how"],
							[t.landing.nav.gallery, "#gallery"],
							[t.landing.nav.finishes, "#finishes"],
							[t.landing.nav.faq, "#faq"],
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
							href={`/${lang}/tutorials`}
							className="rounded-xl px-3 py-2.5 text-[13px] text-neutral-600 transition-colors hover:text-neutral-900"
						>
							{t.landing.nav.tutorials}
						</Link>
					</nav>
					<div className="flex shrink-0 items-center gap-4">
						<Link
							href={`/${lang}/planner`}
							className="rounded-xl bg-neutral-900 px-4.5 py-2.5 font-medium text-[13px] text-white transition-transform active:translate-y-px"
						>
							{t.landing.nav.startPlanning}
						</Link>
						<Link
							href="/admin/login"
							target="_blank"
							className="hidden border-l py-2.5 pl-4 text-[12px] text-neutral-400 transition-colors hover:text-neutral-600 sm:block"
							style={{ borderColor: RULE }}
						>
							{t.landing.nav.admin}
						</Link>
					</div>
				</div>
			</header>

			{/* Hero — full bleed, and the one place the product argues for itself.

			    It is not a photograph. It is a rendered cabinet coming apart as you
			    scroll: the carcass, the doors, the hinges, the drawer boxes, drawn
			    frame by frame off `--p`. A photograph of a finished kitchen says the
			    same thing every competitor's homepage says; the explosion says the
			    thing only this company can say, which is that the cabinet is a known
			    set of parts they can quote you on today.

			    The frames are light grey, so this hero is light — dark ink on paper,
			    not the white-on-black it was while a photo was behind it.

			    It has to hold up with no sequence at all: `ScrollSequence` refuses to
			    run under 900px or on reduced motion, and never fetches its 1.7 MB
			    there. Underneath is a plain `<img>` of frame 0, the cabinet assembled
			    — which is the honest still, and the LCP element. */}
			<ScrollTrack viewports={3}>
				{/* The ground and the stage's mask are both in `globals.css`: they
				    are shared with the admin sign-in panel, and the ground has to
				    follow the stage across a breakpoint, which an inline style
				    cannot express. */}
				<section
					data-cabinet-ground="hero"
					className="relative isolate flex h-full w-full items-center overflow-hidden"
				>
					{/* The stage. Full width where the copy sits over it, the right
					    side of the section once there is room for the two side by
					    side — the frames are composed tightly enough that a
					    full-bleed cabinet runs straight through the headline.

					    The box is 16:9 because the frames are, so the picture fills
					    it exactly and its edge and the box's are the same edge — which
					    is what lets one mask handle both.

					    The mask on it is structural, not decoration — see
					    `[data-cabinet-stage]` in `globals.css`. The
					    poster and the canvas share this one box so the still and the
					    sequence land in exactly the same place — otherwise the
					    cabinet would jump the moment the first frame decoded. */}
					<div
						data-cabinet-stage
						className="-z-20 -right-[18%] absolute bottom-[14%] aspect-[16/9] w-[136%] lg:-translate-y-1/2 lg:top-1/2 lg:right-0 lg:bottom-auto lg:w-[68%]"
					>
						{/* biome-ignore lint/performance/noImgElement: ships in the repo,
						    and it has to share a box with a canvas next/image can't size */}
						<img
							src={heroFrameSrc(HERO_POSTER_FRAME)}
							alt={t.landing.hero.alt}
							className="h-full w-full object-contain"
						/>
						<ScrollSequence />
					</div>

					<div
						data-beat="hero-copy"
						className="mx-auto flex h-full w-full max-w-[1180px] flex-col justify-start px-6 pt-[7vh] pb-20 sm:px-8 lg:h-auto lg:min-h-[clamp(460px,68vh,640px)] lg:justify-center lg:py-24"
					>
						<p className="mb-5 font-semibold text-[11px] text-neutral-500 uppercase tracking-[0.16em]">
							{t.landing.hero.eyebrow}
						</p>
						{/* The accent word is the product, not decoration — the template
						    this follows colours a noun, and the noun worth colouring
						    here is the thing nobody else in the market offers. */}
						<h1 className="max-w-[15ch] text-balance font-bold text-[clamp(38px,6vw,68px)] text-neutral-900 leading-[1.02] tracking-[-0.02em]">
							{t.landing.hero.titleBeforeAccent}{" "}
							<span style={{ color: ACCENT }}>
								{t.landing.hero.titleAccent}
							</span>
						</h1>
						<p className="mt-6 max-w-[42ch] text-[17px] text-neutral-600 leading-7">
							{t.landing.hero.subtitle}
						</p>
						<div className="mt-9 flex flex-wrap items-center gap-3">
							<Link
								href={`/${lang}/planner`}
								className="rounded-xl bg-neutral-900 px-8 py-4 font-semibold text-[15px] text-white transition-transform active:translate-y-px"
							>
								{t.landing.hero.cta}
							</Link>
							{/* Ghost, not a second solid button: two equal buttons make the
							    customer choose, and the choice we want is the planner. */}
							<a
								href="#how"
								className="rounded-xl border px-8 py-4 font-medium text-[15px] text-neutral-700 transition-colors hover:border-neutral-500 active:translate-y-px"
								style={{ borderColor: RULE }}
							>
								{t.landing.hero.howItWorks}
							</a>
						</div>
					</div>
				</section>
			</ScrollTrack>

			{/* Facts — trust strip, under the hero rather than inside it. */}
			<section
				data-reveal
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
				data-reveal
				className="mx-auto w-full max-w-[1180px] px-6 py-20 sm:px-8"
			>
				<h2 className="mb-12 max-w-[520px] font-semibold text-[30px] leading-tight tracking-tight">
					{t.landing.how.heading}
				</h2>
				<div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_1fr_1fr] lg:gap-12">
					{howItWorks(t).map((step) => (
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
				data-reveal
				className="border-y"
				style={{ backgroundColor: RAISED, borderColor: RULE }}
			>
				<div className="mx-auto w-full max-w-[1180px] px-6 py-20 sm:px-8">
					<h2 className="mb-2 font-semibold text-[30px] leading-tight tracking-tight">
						{t.landing.gallery.heading}
					</h2>
					<p className="mb-10 max-w-[520px] text-[15px] text-neutral-600 leading-6">
						{t.landing.gallery.subtitle}
					</p>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[224px]">
						{catalogue.roomTypes.map((room, i) => (
							<Link
								key={room.id}
								href={`/${lang}/planner?room=${room.id}`}
								className={`group relative flex flex-col justify-end overflow-hidden rounded-xl border transition-transform active:translate-y-px ${ROOM_SPAN[i] ?? "min-h-[200px] lg:min-h-0"}`}
								style={{ borderColor: RULE }}
							>
								<Photo
									url={photo.get(roomSlot(room.id)) ?? null}
									alt={fill(t.landing.gallery.roomAlt, { room: room.label })}
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
										{roomSubtitles(t)[room.id]}
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
				data-reveal
				className="mx-auto w-full max-w-[1180px] px-6 py-20 sm:px-8"
			>
				<h2 className="mb-2 font-semibold text-[30px] leading-tight tracking-tight">
					{t.landing.finishes.heading}
				</h2>
				<p className="mb-10 max-w-[520px] text-[15px] text-neutral-600 leading-6">
					{t.landing.finishes.subtitle}
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
				data-reveal
				className="border-y"
				style={{ backgroundColor: RAISED, borderColor: RULE }}
			>
				<div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-10 px-6 py-20 sm:px-8 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
					<h2 className="font-semibold text-[30px] leading-tight tracking-tight lg:sticky lg:top-28 lg:self-start">
						{t.landing.faq.heading}
					</h2>
					<div className="flex flex-col">
						{faqs(t).map((item) => (
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
							{t.landing.closing.heading}
						</h2>
						<p className="mt-3 max-w-[440px] text-[15px] text-white/70 leading-6">
							{t.landing.closing.subtitle}
						</p>
					</div>
					<Link
						href={`/${lang}/planner`}
						className="shrink-0 rounded-xl bg-white px-7 py-3.5 font-medium text-[14px] text-neutral-900 transition-transform active:translate-y-px"
					>
						{t.landing.closing.cta}
					</Link>
				</div>
			</section>

			{/* Footer */}
			<footer className="mt-auto bg-neutral-900 text-neutral-200">
				<div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 px-6 py-14 sm:grid-cols-[2fr_1fr_1fr] sm:px-8">
					<div>
						<p className="mb-2 font-bold text-[15px] text-white">
							{t.common.brand}
						</p>
						<p className="max-w-[280px] text-[13px] text-neutral-400 leading-5">
							{t.landing.footer.tagline}
						</p>
					</div>
					<div>
						<p className="mb-3 font-semibold text-[12px] text-neutral-500 uppercase tracking-[0.06em]">
							{t.landing.footer.productHeading}
						</p>
						<div className="flex flex-col gap-2.5">
							<Link
								href={`/${lang}/planner`}
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								{t.landing.footer.startPlanning}
							</Link>
							<a
								href="#gallery"
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								{t.landing.footer.gallery}
							</a>
							<a
								href="#faq"
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								{t.landing.footer.faq}
							</a>
							<Link
								href={`/${lang}/tutorials`}
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								{t.landing.footer.tutorials}
							</Link>
						</div>
					</div>
					<div>
						<p className="mb-3 font-semibold text-[12px] text-neutral-500 uppercase tracking-[0.06em]">
							{t.landing.footer.contactHeading}
						</p>
						<div className="flex flex-col gap-2.5">
							<a
								href="mailto:hello@infinitecabinet.com"
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								{t.landing.footer.email}
							</a>
							<Link
								href="/admin/login"
								className="text-[13px] text-neutral-500 transition-colors hover:text-neutral-300"
							>
								{t.landing.footer.adminSignIn}
							</Link>
						</div>
					</div>
				</div>
				<div className="border-neutral-800 border-t px-6 py-4.5 text-center sm:px-8">
					<p className="text-[12px] text-neutral-500">
						{fill(t.landing.footer.copyright, { brand: t.common.brand })}
					</p>
				</div>
			</footer>
			<RevealOnEnter />
		</div>
	);
}
