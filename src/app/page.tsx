import Link from "next/link";
import { getPublishedPlannerCatalogue } from "@/lib/catalogue/store";
import { ROOM_TYPES, type RoomTypeId } from "@/lib/planner/catalogue";
import { starterFor } from "@/lib/planner/layout";
import { computePlannerPrice } from "@/lib/planner/pricing";

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
		a: "Most orders arrive within 4–6 weeks of confirming your plan, depending on finish and cabinet size.",
	},
	{
		q: "Can I get cabinets installed too?",
		a: "Yes. Installation can be added when you send your plan to our team for a final quote.",
	},
	{
		q: "What are the cabinets made of?",
		a: "Solid carcasses with a choice of veneer, laminate or painted finishes — see the full range in the planner.",
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

/** A soft tinted panel standing in for a photo that doesn't exist yet — same
 * "no real photography" placeholder role `/designs`' colour tiles play. */
function PhotoPlaceholder({ className = "" }: { className?: string }) {
	return (
		<div
			className={`bg-gradient-to-br from-[#e2ddd2] to-[#cdc4b3] ${className}`}
		/>
	);
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
	const { data: catalogue } = await getPublishedPlannerCatalogue();
	const kitchenPrice = computePlannerPrice(
		starterFor("kitchen"),
		catalogue.finishes[0].id,
		catalogue,
	);

	return (
		<div className="flex min-h-screen flex-col bg-[#e9e7e3] text-neutral-900">
			{/* Nav */}
			<div className="sticky top-0 z-10 border-neutral-200 border-b bg-[#fdfcfb]">
				<div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-8">
					<span className="font-bold text-[15px] tracking-tight">
						Infinite Cabinet
					</span>
					<div className="flex items-center gap-7">
						<a
							href="#how"
							className="text-neutral-600 text-[13px] hover:text-neutral-900"
						>
							How it works
						</a>
						<a
							href="#gallery"
							className="text-neutral-600 text-[13px] hover:text-neutral-900"
						>
							Gallery
						</a>
						<a
							href="#finishes"
							className="text-neutral-600 text-[13px] hover:text-neutral-900"
						>
							Finishes
						</a>
						<a
							href="#faq"
							className="text-neutral-600 text-[13px] hover:text-neutral-900"
						>
							FAQ
						</a>
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
							className="border-neutral-200 border-l pl-4 text-[12px] text-neutral-400 hover:text-neutral-600"
						>
							Admin
						</Link>
					</div>
				</div>
			</div>

			{/* Hero */}
			<div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-14 px-8 py-18 md:grid-cols-2">
				<div>
					<p className="mb-3.5 font-semibold text-[#8a8478] text-xs uppercase tracking-[0.08em]">
						Free to try · no account needed
					</p>
					<h1 className="mb-4.5 text-[44px] leading-[1.1] font-bold tracking-tight text-balance">
						Design your kitchen in 3D. Order it in one click.
					</h1>
					<p className="mb-7 max-w-[440px] text-[16px] text-neutral-600 leading-6">
						Drop real Infinite Cabinet units onto a model of your own room, see
						it from every angle, and get an instant price. No showroom visit
						required.
					</p>
					<div className="flex items-center gap-5">
						<Link
							href="/planner"
							className="rounded-[9px] bg-neutral-900 px-6.5 py-3.5 font-medium text-[14px] text-white"
						>
							Start planning
						</Link>
						<span className="text-[13px] text-neutral-500">
							Full kitchens from{" "}
							<strong className="text-neutral-900">
								RM {rm(kitchenPrice.totalRm)}
							</strong>
						</span>
					</div>
				</div>
				<PhotoPlaceholder className="h-[420px] w-full rounded-[14px]" />
			</div>

			{/* How it works */}
			<div id="how" className="border-neutral-200 border-y bg-white">
				<div className="mx-auto max-w-[1180px] px-8 py-16">
					<h2 className="mb-10 text-center font-semibold text-[26px]">
						How it works
					</h2>
					<div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
						{HOW_IT_WORKS.map((step, i) => (
							<div key={step.title} className="px-4 text-center">
								<div className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 font-semibold text-sm text-white">
									{i + 1}
								</div>
								<h3 className="mb-2 font-semibold text-[16px]">{step.title}</h3>
								<p className="text-[14px] text-neutral-500 leading-5">
									{step.detail}
								</p>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Gallery */}
			<div id="gallery" className="mx-auto w-full max-w-[1180px] px-8 py-16">
				<h2 className="mb-1.5 text-center font-semibold text-[26px]">
					Explore by room
				</h2>
				<p className="mb-9 text-center text-[14px] text-neutral-500">
					Every room starts from real Infinite Cabinet sizes and a layout
					already on your wall.
				</p>
				<div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
					{ROOM_TYPES.map((room) => (
						<Link
							key={room.id}
							href={`/planner?room=${room.id}`}
							className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
						>
							<PhotoPlaceholder className="h-[140px] w-full" />
							<div className="px-4 py-3.5">
								<p className="font-semibold text-[14px]">{room.label}</p>
								<p className="mt-0.5 text-[12px] text-neutral-500">
									{ROOM_SUBTITLES[room.id]}
								</p>
							</div>
						</Link>
					))}
				</div>
			</div>

			{/* Finishes */}
			<div id="finishes" className="border-neutral-200 border-y bg-white">
				<div className="mx-auto max-w-[1180px] px-8 py-16">
					<h2 className="mb-1.5 text-center font-semibold text-[26px]">
						Finishes &amp; materials
					</h2>
					<p className="mb-9 text-center text-[14px] text-neutral-500">
						Swap finishes on any cabinet right inside the planner.
					</p>
					<div className="grid grid-cols-3 gap-5 sm:grid-cols-6">
						{catalogue.finishes.map((finish) => (
							<div key={finish.id} className="text-center">
								<div
									className="mb-2 h-16 rounded-lg border border-neutral-200"
									style={{ backgroundColor: finish.hex }}
								/>
								<p className="text-[12px] text-neutral-600">{finish.label}</p>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* FAQ */}
			<div id="faq" className="mx-auto w-full max-w-[760px] px-8 py-16">
				<h2 className="mb-8 text-center font-semibold text-[26px]">
					Frequently asked questions
				</h2>
				<div className="flex flex-col gap-3">
					{FAQS.map((item) => (
						<details
							key={item.q}
							className="rounded-[10px] border border-neutral-200 bg-white p-4.5 [&_summary]:cursor-pointer [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden"
						>
							<summary className="font-medium text-[14px]">{item.q}</summary>
							<p className="mt-2.5 text-[13px] text-neutral-500 leading-5">
								{item.a}
							</p>
						</details>
					))}
				</div>
			</div>

			{/* Footer */}
			<div className="mt-auto bg-neutral-900 text-neutral-200">
				<div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 px-8 py-12 sm:grid-cols-[2fr_1fr_1fr]">
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
						<div className="flex flex-col gap-2">
							<Link href="/planner" className="text-[13px] text-neutral-300">
								Start planning
							</Link>
							<a href="#gallery" className="text-[13px] text-neutral-300">
								Gallery
							</a>
							<a href="#faq" className="text-[13px] text-neutral-300">
								FAQ
							</a>
						</div>
					</div>
					<div>
						<p className="mb-3 font-semibold text-[12px] text-neutral-500 uppercase tracking-[0.06em]">
							Contact
						</p>
						<div className="flex flex-col gap-2">
							<a
								href="mailto:hello@infinitecabinet.com"
								className="text-[13px] text-neutral-300"
							>
								hello@infinitecabinet.com
							</a>
							<Link
								href="/admin/login"
								className="text-[13px] text-neutral-500"
							>
								Admin sign in
							</Link>
						</div>
					</div>
				</div>
				<div className="border-neutral-800 border-t px-8 py-4.5 text-center">
					<p className="text-[12px] text-neutral-500">
						© 2026 Infinite Cabinet. All rights reserved.
					</p>
				</div>
			</div>
		</div>
	);
}
