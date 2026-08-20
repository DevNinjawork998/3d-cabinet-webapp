"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * The admin chrome: a breadcrumb row over a tab bar.
 *
 * Shared by every admin page so the tabs stay in one place — the design has
 * a single "Catalogue" tab because the mockup only knows about this one
 * screen, but the real app has three working admin routes, so they're
 * listed as siblings here. "Orders" is deliberately inert: it's on the
 * roadmap, not built, and a dead link reads as broken.
 */

type Section = "designs" | "catalogue" | "import";

const TABS: { id: Section; label: string; href: string }[] = [
	{ id: "designs", label: "Cabinet designs", href: "/admin/cabinet-designs" },
	{ id: "catalogue", label: "Catalogue", href: "/admin/catalogue" },
	{ id: "import", label: "Import .skp", href: "/admin/import" },
];

export function AdminHeader({ current }: { current: Section }) {
	const router = useRouter();

	// Lives here rather than being passed in: it was copy-pasted identically
	// into all three admin pages, and a function prop isn't serializable
	// across the client-entry boundary anyway.
	async function signOut() {
		await fetch("/api/admin/logout", { method: "POST" });
		router.push("/admin/login");
	}

	return (
		<header className="flex shrink-0 flex-col border-neutral-200 border-b bg-white">
			<div className="flex items-center justify-between gap-6 px-7 pt-3.5">
				<div className="flex items-center gap-1.5 text-neutral-400 text-xs">
					<Link
						href="/"
						target="_blank"
						className="px-1 py-1.5 text-neutral-400 hover:text-neutral-600"
					>
						Infinite Cabinet
					</Link>
					<span>/</span>
					<span className="px-1 py-1.5 font-medium text-neutral-900">
						Admin
					</span>
				</div>
				<div className="flex items-center gap-2">
					<Link
						href="/planner"
						target="_blank"
						className="flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-300 px-3.5 py-2.5 text-neutral-700 text-xs"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 13 13"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M4 2H2v9h9V9M7 2h4v4M11 2 6 7"
								stroke="currentColor"
								strokeWidth="1.2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						View as customer
					</Link>
					<button
						type="button"
						onClick={signOut}
						className="px-2.5 py-2.5 text-neutral-400 text-xs hover:text-neutral-600"
					>
						Sign out
					</button>
					<span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-neutral-900 font-semibold text-white text-xs">
						JT
					</span>
				</div>
			</div>

			<nav className="flex items-center gap-1 px-6 pt-3">
				{TABS.map((tab) =>
					tab.id === current ? (
						<span
							key={tab.id}
							aria-current="page"
							className="border-neutral-900 border-b-2 px-3 py-2.5 font-semibold text-[13px] text-neutral-900"
						>
							{tab.label}
						</span>
					) : (
						<Link
							key={tab.id}
							href={tab.href}
							className="border-transparent border-b-2 px-3 py-2.5 text-[13px] text-neutral-500 hover:text-neutral-900"
						>
							{tab.label}
						</Link>
					),
				)}
				<span className="flex cursor-default items-center gap-1.5 border-transparent border-b-2 px-3 py-2.5 text-[#c7c7c5] text-[13px]">
					Orders
					<span className="rounded-full bg-[#f4f3f1] px-1.5 py-0.5 font-semibold text-[10px] text-neutral-400">
						Soon
					</span>
				</span>
			</nav>
		</header>
	);
}
