import type { DoorTypeId } from "@/lib/wardrobe/schema";

/**
 * Flat elevation of the run. Cheaper than a rendered thumbnail in every sense:
 * no WebGL context per card, no PNG pipeline, and it re-draws for any bay
 * count the customer lands on.
 */
export function Elevation({
	bays,
	doorType,
}: {
	bays: number;
	doorType: DoorTypeId;
}) {
	const gap = 1.5;
	const bayW = (100 - gap * (bays + 1)) / bays;
	return (
		<svg
			viewBox="0 0 100 70"
			className="h-20 w-full text-neutral-400"
			role="img"
			aria-label={`${bays}-door elevation`}
		>
			<title>{`${bays}-door elevation`}</title>
			<rect
				x="0.5"
				y="0.5"
				width="99"
				height="69"
				fill="none"
				stroke="currentColor"
			/>
			{Array.from({ length: bays }, (_, i) => {
				const x = gap + i * (bayW + gap);
				return (
					<g key={x}>
						<rect
							x={x}
							y={gap}
							width={bayW}
							height={70 - gap * 2}
							fill="currentColor"
							fillOpacity={0.12}
							stroke="currentColor"
							strokeWidth={0.7}
						/>
						{doorType === "sliding" ? (
							<line
								x1={x + bayW / 2}
								y1={gap}
								x2={x + bayW / 2}
								y2={70 - gap}
								stroke="currentColor"
								strokeWidth={0.4}
								strokeDasharray="2 2"
							/>
						) : (
							<circle cx={x + bayW - 3} cy={35} r={1.2} fill="currentColor" />
						)}
					</g>
				);
			})}
		</svg>
	);
}
