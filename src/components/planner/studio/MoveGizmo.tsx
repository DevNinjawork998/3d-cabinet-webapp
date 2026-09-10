"use client";

/**
 * The arrows drawn on the selected cabinet while the Move verb is on.
 *
 * ← → slide it along the wall; ↑ ↓ raise and lower a wall cabinet out of the
 * row. A floor unit stands on the floor, so its verticals are disabled rather
 * than hidden — a control that vanishes reads as a bug, one that is greyed
 * out with a reason reads as a rule.
 *
 * Its copy arrives as a prop rather than through `useCopy`. This renders
 * inside drei's `<Html>`, which lives under the react-three-fiber
 * reconciler, and React context does not cross that boundary — a hook call
 * here throws "useCopy outside a CopyProvider". Everything else drawn in the
 * scene takes props for the same reason.
 */
export function MoveGizmo({
	labels,
	vertical,
	onLeftAction,
	onRightAction,
	onUpAction,
	onDownAction,
}: {
	labels: {
		left: string;
		right: string;
		raise: string;
		lower: string;
		vertHint: string;
		vertLocked: string;
	};
	vertical: boolean;
	onLeftAction: () => void;
	onRightAction: () => void;
	onUpAction: () => void;
	onDownAction: () => void;
}) {
	const arrow =
		"flex h-9 w-9 items-center justify-center rounded-[7px] text-[15px] text-[#1f5138] hover:bg-[#e7efe9]";
	const vert = `flex h-[17px] w-9 items-center justify-center rounded-[5px] text-[12px] ${
		vertical
			? "text-[#1f5138] hover:bg-[#e7efe9]"
			: "cursor-not-allowed text-neutral-300"
	}`;

	return (
		<div className="flex items-center gap-0.5 rounded-[10px] border border-[#1f5138] bg-white/95 p-[3px]">
			<button
				type="button"
				onClick={onLeftAction}
				aria-label={labels.left}
				className={arrow}
			>
				←
			</button>

			<div className="flex flex-col gap-0.5">
				<button
					type="button"
					onClick={onUpAction}
					disabled={!vertical}
					aria-label={labels.raise}
					title={vertical ? labels.vertHint : labels.vertLocked}
					className={vert}
				>
					↑
				</button>
				<button
					type="button"
					onClick={onDownAction}
					disabled={!vertical}
					aria-label={labels.lower}
					title={vertical ? labels.vertHint : labels.vertLocked}
					className={vert}
				>
					↓
				</button>
			</div>

			<button
				type="button"
				onClick={onRightAction}
				aria-label={labels.right}
				className={arrow}
			>
				→
			</button>
		</div>
	);
}
