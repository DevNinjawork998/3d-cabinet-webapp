import Link from "next/link";

/**
 * The bar across the top of all three planner screens.
 *
 * It carries a breadcrumb rather than a single title because the planner is a
 * three-step flow with no browser history between the steps — the screens are
 * state, not routes, so the back button does not walk them. The crumb is the
 * only thing telling a customer where they are and the only way back that
 * isn't a button labelled from the destination's point of view.
 */

export type Crumb = {
	label: string;
	/** A route. Mutually exclusive with `onClick`. */
	href?: string;
	/** A step of the flow, which is state rather than a route. */
	onClick?: () => void;
};

export function PlannerHeader({
	trail,
	center,
	children,
}: {
	/** Root first, current screen last. The last crumb is never a link. */
	trail: Crumb[];
	/** Optional middle slot — the studio's view toggle lives here. */
	center?: React.ReactNode;
	/** The right-hand actions, which differ per screen. */
	children?: React.ReactNode;
}) {
	return (
		<div className="flex h-14 shrink-0 items-center justify-between gap-6 border-neutral-200 border-b bg-white px-5">
			{/* Padding on the crumbs rather than gap: the tap target is the padded
			    box, not just the glyphs. */}
			<nav
				aria-label="Breadcrumb"
				className="flex min-w-0 items-center gap-0.5 text-[13px] text-neutral-400"
			>
				{trail.map((crumb, i) => {
					const last = i === trail.length - 1;
					return (
						<span key={crumb.label} className="flex items-center gap-0.5">
							{i > 0 && <span aria-hidden>/</span>}
							{crumb.href && !last ? (
								<Link
									href={crumb.href}
									className={`px-1 py-2.5 ${
										i === 0
											? "font-semibold text-neutral-900 hover:text-neutral-600"
											: "hover:text-neutral-900"
									}`}
								>
									{crumb.label}
								</Link>
							) : crumb.onClick && !last ? (
								<button
									type="button"
									onClick={crumb.onClick}
									className="px-1 py-2.5 hover:text-neutral-900"
								>
									{crumb.label}
								</button>
							) : (
								<span
									aria-current={last ? "page" : undefined}
									className={`px-1 py-2.5 ${
										last ? "text-neutral-900" : ""
									} ${i === 0 ? "font-semibold" : ""}`}
								>
									{crumb.label}
								</span>
							)}
						</span>
					);
				})}
			</nav>

			{center}

			<div className="flex shrink-0 items-center gap-3.5">{children}</div>
		</div>
	);
}

/** The `Admin` link every planner screen carries, so it reads the same on each. */
export function AdminLink() {
	return (
		<Link
			href="/admin/login"
			className="border-neutral-200 border-l pl-3.5 text-[12px] text-neutral-400 hover:text-neutral-600"
		>
			Admin
		</Link>
	);
}
