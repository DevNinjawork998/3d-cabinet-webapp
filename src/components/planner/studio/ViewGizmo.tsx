"use client";

/**
 * The round pad on the floor in front of the run.
 *
 * It slides the view across the floor plane — a pan, not a turn. Dragging
 * already rotates and `OrbitControls` has panning switched off, so before this
 * there was no way to shift a long run sideways to look at its far end; you
 * could only spin around it.
 *
 * Circular because that is what it does: four directions on one plane, with
 * no reading order between them. A row of arrows implies a sequence.
 *
 * Its copy arrives as a prop rather than through `useCopy`: this renders
 * inside drei's `<Html>`, under the react-three-fiber reconciler, and React
 * context does not cross that boundary.
 */
export function ViewGizmo({
	labels,
	onLeftAction,
	onRightAction,
	onUpAction,
	onDownAction,
}: {
	labels: {
		left: string;
		right: string;
		up: string;
		down: string;
	};
	onLeftAction: () => void;
	onRightAction: () => void;
	onUpAction: () => void;
	onDownAction: () => void;
}) {
	const arm =
		"absolute flex h-8 w-8 items-center justify-center rounded-full text-[14px] text-[#1f5138] leading-none hover:bg-[#e7efe9] active:bg-[#d8e6dd]";

	return (
		<div className="relative h-[92px] w-[92px] select-none rounded-full border border-[#1f5138] bg-white/95 shadow-[0_2px_10px_rgba(0,0,0,.14)]">
			<button
				type="button"
				onClick={onUpAction}
				aria-label={labels.up}
				title={labels.up}
				className={`${arm} -translate-x-1/2 top-[3px] left-1/2`}
			>
				↑
			</button>
			<button
				type="button"
				onClick={onRightAction}
				aria-label={labels.right}
				title={labels.right}
				className={`${arm} -translate-y-1/2 top-1/2 right-[3px]`}
			>
				→
			</button>
			<button
				type="button"
				onClick={onDownAction}
				aria-label={labels.down}
				title={labels.down}
				className={`${arm} -translate-x-1/2 bottom-[3px] left-1/2`}
			>
				↓
			</button>
			<button
				type="button"
				onClick={onLeftAction}
				aria-label={labels.left}
				title={labels.left}
				className={`${arm} -translate-y-1/2 top-1/2 left-[3px]`}
			>
				←
			</button>

			{/* The dead centre is the pad's hub, not a fifth button: something has
			    to say the four arms belong to one control. */}
			<span
				aria-hidden
				className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-2 w-2 rounded-full bg-[#cfe0d5]"
			/>
		</div>
	);
}
