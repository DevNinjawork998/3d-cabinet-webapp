import { Html, Line } from "@react-three/drei";
import type {
	Offsets,
	PlannerEngine,
	PlannerLayout,
	Positioned,
} from "@/lib/planner/layout";
import { cabinetBoundsMm } from "@/lib/planner/measure";

const m = (mm: number) => mm / 1000;

const LINE_COLOR = "#1f5138";

/** How far in front of the cabinet's face the dimension line floats, so it
 * reads as a line drawn over the room rather than one buried in a carcass. */
const STANDOFF_MM = 90;

/** Half-length of the tick at each end of a dimension line. */
const TICK_MM = 180;

/**
 * Where the selected cabinet sits, drawn on the scene.
 *
 * Not the measuring tool: nothing is picked and nothing is clicked. Selecting
 * a cabinet is the whole gesture, and what comes back is its **position** —
 * the clear gap to each side, and how high it hangs if it is a wall unit.
 * `offsetsOf` decides the numbers; this only draws them.
 *
 * The gaps run to whatever is actually in the way — a neighbour's edge, or the
 * wall — because that is what the customer can move into. A number measured
 * past a neighbour to the far wall would be a gap that isn't there.
 *
 * A zero gap draws nothing. A cabinet pushed flush against its neighbour is
 * the normal case in a run, and "0 mm" repeated down a wall is noise sitting
 * on top of the thing it describes.
 *
 * Rendered as a sibling of `Run`, like `MeasureOverlay` — the millimetres
 * `cabinetBoundsMm` reports are already the scene's outer world space, so no
 * group offset belongs here.
 */
export function PositionDimensions({
	position,
	offsets,
	layout,
	engine,
}: {
	position: Positioned;
	offsets: Offsets;
	layout: PlannerLayout;
	engine: PlannerEngine;
}) {
	const box = cabinetBoundsMm(position, layout, engine);

	/** Wall millimetres are measured from the left wall; the scene centres the
	 * run on the origin. Same shift `cabinetBoundsMm` applies. */
	const worldX = (alongWallMm: number) => alongWallMm - layout.wallWidthMm / 2;

	// On the floor for a base unit, at its own underside for a hung one: the
	// line belongs on the plane the cabinet slides along.
	const alongY = box.minY;
	const zMm = box.maxZ + STANDOFF_MM;

	return (
		<>
			{offsets.leftMm > 0 && (
				<Dimension
					fromMm={worldX(offsets.leftAnchorMm)}
					toMm={box.minX}
					atMm={alongY}
					zMm={zMm}
					valueMm={offsets.leftMm}
				/>
			)}

			{offsets.rightMm > 0 && (
				<Dimension
					fromMm={box.maxX}
					toMm={worldX(offsets.rightAnchorMm)}
					atMm={alongY}
					zMm={zMm}
					valueMm={offsets.rightMm}
				/>
			)}

			{offsets.floorMm !== null && offsets.floorMm > 0 && (
				<Dimension
					vertical
					fromMm={0}
					toMm={offsets.floorMm}
					atMm={box.minX}
					zMm={zMm}
					valueMm={offsets.floorMm}
				/>
			)}
		</>
	);
}

/**
 * One dimension line: the span, a tick at each end, and the figure.
 *
 * A vertical line is the same shape with the axes swapped — it runs up y at a
 * fixed x instead of along x at a fixed y — so `fromMm`/`toMm` are the span
 * and `atMm` is whichever coordinate stays put.
 */
function Dimension({
	fromMm,
	toMm,
	atMm,
	zMm,
	valueMm,
	vertical = false,
}: {
	fromMm: number;
	toMm: number;
	atMm: number;
	zMm: number;
	valueMm: number;
	vertical?: boolean;
}) {
	const z = m(zMm);
	const point = (alongMm: number): [number, number, number] =>
		vertical ? [m(atMm), m(alongMm), z] : [m(alongMm), m(atMm), z];

	const start = point(fromMm);
	const end = point(toMm);

	// The ticks run across the line: along the wall for a vertical span, and
	// straight up for a horizontal one — a gap on the floor is drawn at floor
	// level, so half a tick would be under it.
	const tick = (at: [number, number, number]): [number, number, number][] =>
		vertical
			? [
					[at[0] - m(TICK_MM) / 2, at[1], at[2]],
					[at[0] + m(TICK_MM) / 2, at[1], at[2]],
				]
			: [
					[at[0], at[1], at[2]],
					[at[0], at[1] + m(TICK_MM), at[2]],
				];

	return (
		<>
			<Line points={[start, end]} color={LINE_COLOR} lineWidth={2} />
			<Line points={tick(start)} color={LINE_COLOR} lineWidth={2} />
			<Line points={tick(end)} color={LINE_COLOR} lineWidth={2} />
			<Html
				position={point((fromMm + toMm) / 2)}
				center
				zIndexRange={[4, 0]}
				pointerEvents="none"
			>
				<span className="whitespace-nowrap rounded-[6px] border border-[#1f5138] bg-white/95 px-1.5 py-0.5 font-semibold text-[#1f5138] text-[11px] leading-none tabular-nums shadow-[0_1px_4px_rgba(0,0,0,.16)]">
					{Math.round(valueMm)} mm
				</span>
			</Html>
		</>
	);
}
