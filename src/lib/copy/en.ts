/**
 * The English dictionary, and the shape every other locale is held to.
 *
 * Values are plain strings — never functions. The dictionary is handed from a
 * server component into `CopyProvider`, so it crosses the RSC boundary and has
 * to serialise. Strings needing a number carry a `{token}` and go through
 * `fill`.
 */
export const en = {
	meta: {
		title: "Infinite Cabinet · Design your kitchen in 3D",
		description:
			"Drop real Infinite Cabinet units onto a model of your own room, see it from every angle, and get an instant price. No showroom visit required.",
	},
	common: {
		brand: "Infinite Cabinet",
		back: "Back",
		next: "Next",
		close: "Close",
		language: "Language",
	},
	landing: {
		nav: {
			howItWorks: "How it works",
			gallery: "Gallery",
			finishes: "Finishes",
			faq: "FAQ",
			tutorials: "Tutorials",
			startPlanning: "Start planning",
			admin: "Admin",
		},
		hero: {
			eyebrow: "Free to try · no account needed",
			titleBeforeAccent: "Design your kitchen",
			titleAccent: "in 3D",
			subtitle:
				"Drop real Infinite Cabinet units into your own room, see the price move as you build, and send us the plan.",
			cta: "Start planning",
			howItWorks: "How it works",
			alt: "A finished Infinite Cabinet kitchen",
		},
		facts: {
			starterKitchenLabel: "Starter kitchen run",
			typicalDeliveryValue: "4-6 weeks",
			typicalDeliveryLabel: "Typical delivery",
			warrantyValue: "5 years",
			warrantyLabel: "Warranty on hardware and build",
			noAccountValue: "No account",
			noAccountLabel: "Needed to plan and price",
		},
		how: {
			heading: "Three steps from an empty wall to a quote",
			step1Title: "Pick your room",
			step1Detail:
				"Choose kitchen, living room, bedroom or foyer, and set your real wall dimensions.",
			step2Title: "Drop in cabinets, to scale",
			step2Detail:
				"Arrange real Infinite Cabinet units in 3D and swap finishes until it looks right.",
			step3Title: "Get an instant quote",
			step3Detail:
				"See a live price as you build, then send your plan straight to our team.",
		},
		gallery: {
			heading: "Explore by room",
			subtitle:
				"Every room starts from real Infinite Cabinet sizes and a layout already on your wall.",
			roomAlt: "{room} cabinets",
			roomSubtitle: {
				kitchen: "Real Infinite Cabinet sizes",
				living: "TV ledge & display units",
				bedroom: "Wardrobes",
				foyer: "Shoe cabinets & bench",
			},
		},
		finishes: {
			heading: "Finishes & materials",
			subtitle: "Swap finishes on any cabinet right inside the planner.",
		},
		faq: {
			heading: "Frequently asked questions",
			q1: "How long does delivery take?",
			a1: "Most orders arrive within 4-6 weeks of confirming your plan, depending on finish and cabinet size.",
			q2: "Can I get cabinets installed too?",
			a2: "Yes. Installation can be added when you send your plan to our team for a final quote.",
			q3: "What are the cabinets made of?",
			a3: "Solid carcasses with a choice of veneer, laminate or painted finishes. The full range is in the planner.",
			q4: "Can I change my design after ordering?",
			a4: "Changes are free before production starts. Our team will confirm your plan with you first.",
			q5: "Do you offer a warranty?",
			a5: "Every cabinet comes with a 5-year warranty on hardware and construction.",
		},
		closing: {
			heading: "Your wall, your sizes, your price. In about five minutes.",
			subtitle: "Nothing to install and nothing to sign up for.",
			cta: "Start planning",
		},
		footer: {
			tagline:
				"Custom cabinets, planned in 3D and built to your room's real dimensions.",
			productHeading: "Product",
			startPlanning: "Start planning",
			gallery: "Gallery",
			faq: "FAQ",
			tutorials: "Tutorials",
			contactHeading: "Contact",
			email: "hello@infinitecabinet.com",
			adminSignIn: "Admin sign in",
			copyright: "© 2026 {brand}. All rights reserved.",
		},
	},
} as const;

/**
 * Every leaf of `en`'s shape must be a string, at whatever depth it sits.
 * Groups nest further than two levels (e.g. `landing.hero.title`), so this
 * recurses rather than fixing a depth.
 */
type Leaves<T> = {
	readonly [K in keyof T]: T[K] extends string ? string : Leaves<T[K]>;
};

export type Dictionary = Leaves<typeof en>;
