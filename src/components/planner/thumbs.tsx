import type { DoorStyle, Family, FinishId } from "@/lib/planner/catalogue";
import { FINISHES } from "@/lib/planner/catalogue";

/** Tiny elevation of a family, drawn from its own proportions. */
export function FamilyThumb({ family: option }: { family: Family }) {
	const widest = option.sizes[option.sizes.length - 1].widthMm;
	const ratio = widest / option.heightMm;
	const w = Math.max(18, Math.min(92, 46 * ratio));
	const fronts = option.drawers > 0 ? option.drawers : widest > 650 ? 2 : 1;
	const horizontal = option.drawers > 0;

	return (
		<svg
			viewBox="0 0 100 50"
			className="h-10 w-full text-neutral-400"
			role="img"
			aria-label={`${option.label} elevation`}
		>
			<title>{`${option.label} elevation`}</title>
			<rect
				x={(100 - w) / 2}
				y={2}
				width={w}
				height={46}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={0.8}
			/>
			{Array.from({ length: fronts - 1 }, (_, i) => {
				const step = (horizontal ? 46 : w) / fronts;
				const offset = step * (i + 1);
				return horizontal ? (
					<line
						key={`h${offset}`}
						x1={(100 - w) / 2}
						y1={2 + offset}
						x2={(100 + w) / 2}
						y2={2 + offset}
						stroke="currentColor"
						strokeWidth={0.6}
					/>
				) : (
					<line
						key={`v${offset}`}
						x1={(100 - w) / 2 + offset}
						y1={2}
						x2={(100 - w) / 2 + offset}
						y2={48}
						stroke="currentColor"
						strokeWidth={0.6}
					/>
				);
			})}
		</svg>
	);
}

/** A door style swatch, in the room's chosen colour. */
export function DoorThumb({
	style,
	finish,
}: {
	style: DoorStyle;
	finish: FinishId;
}) {
	const hex = FINISHES.find((f) => f.id === finish)?.hex ?? "#ffffff";
	return (
		<svg
			viewBox="0 0 60 50"
			className="h-10 w-full"
			role="img"
			aria-label={`${style.label} door`}
		>
			<title>{`${style.label} door`}</title>
			<rect
				x={8}
				y={2}
				width={44}
				height={46}
				fill={hex}
				stroke="#3f3b36"
				strokeWidth={1}
			/>
			{style.look !== "slab" && (
				<rect
					x={15}
					y={9}
					width={30}
					height={32}
					fill={style.look === "glass" ? "#dfe9ec" : hex}
					fillOpacity={style.look === "glass" ? 0.8 : 1}
					stroke="#3f3b36"
					strokeWidth={0.8}
				/>
			)}
		</svg>
	);
}
