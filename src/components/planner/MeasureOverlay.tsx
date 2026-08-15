import { Line } from "@react-three/drei";
import { AXIS_COLOR, type Vec3Mm } from "@/lib/planner/measure";

const m = (mm: number) => mm / 1000;

const MARKER_COLOR = "#2b6cb0";
const PREVIEW_COLOR = "#d97706";

/**
 * The picked point(s) for the measuring tool: a marker at each point picked
 * so far, a ghost marker at wherever the pointer would land right now, and
 * once there are two committed points, a dimension line between them.
 *
 * The dimension line is drawn as three axis-aligned segments (an "L" or
 * staircase path — a → same-x-and-z-as-b → same-x-and-y-as-b → b) rather
 * than one straight 3D line between the two points. A single diagonal line
 * cuts through cabinet interiors at whatever angle the two points happen to
 * imply and reads as "bent" once the perspective camera and the carcasses it
 * passes behind fight for the eye — three segments, each moving along only
 * one axis, is the standard CAD dimension-chain convention and stays
 * legible from any camera angle.
 *
 * Each leg is colour-coded (`AXIS_COLOR`) rather than carrying its own
 * floating number: a measurement that's mostly along one axis leaves the
 * other two legs only a few millimetres long on screen, and a text label
 * pinned to a leg that short reads as disconnected from any line at all —
 * worse than no label. The numbers live in the fixed 2D readout panel
 * instead (`StudioScreen`), colour-matched to the same `AXIS_COLOR` so a
 * number and its line are still visually paired, just never distorted by
 * perspective or foreshortening.
 *
 * Rendered as a sibling of `Run`, not a child — the points passed in are
 * already in the scene's outer world space (see `Run`'s `onMeasurePick`),
 * so no group offset belongs here.
 */
export function MeasureOverlay({
	points,
	previewPoint,
}: {
	points: Vec3Mm[];
	/** Where the next click would land, so the user sees the target before
	 * committing to it. `null` when the pointer isn't over a cabinet. */
	previewPoint?: Vec3Mm | null;
}) {
	const [a, b] = points;

	return (
		<>
			{points.map((p, i) => (
				<mesh
					// biome-ignore lint/suspicious/noArrayIndexKey: points are only appended/cleared, never reordered
					key={i}
					position={[m(p.x), m(p.y), m(p.z)]}
				>
					<sphereGeometry args={[0.012, 16, 16]} />
					<meshBasicMaterial color={MARKER_COLOR} depthTest={false} />
				</mesh>
			))}

			{previewPoint && (
				<mesh
					position={[m(previewPoint.x), m(previewPoint.y), m(previewPoint.z)]}
				>
					<sphereGeometry args={[0.017, 16, 16]} />
					<meshBasicMaterial
						color={PREVIEW_COLOR}
						transparent
						opacity={0.6}
						depthTest={false}
					/>
				</mesh>
			)}

			{a && b && <DimensionChain a={a} b={b} />}
		</>
	);
}

/** The corner where the "move along X" leg ends and "move along Y" begins,
 * and the corner where that ends and "move along Z" (to `b`) begins. */
function DimensionChain({ a, b }: { a: Vec3Mm; b: Vec3Mm }) {
	const c1: Vec3Mm = { x: b.x, y: a.y, z: a.z };
	const c2: Vec3Mm = { x: b.x, y: b.y, z: a.z };

	return (
		<>
			<AxisSegment from={a} to={c1} axis="x" />
			<AxisSegment from={c1} to={c2} axis="y" />
			<AxisSegment from={c2} to={b} axis="z" />
		</>
	);
}

function AxisSegment({
	from,
	to,
	axis,
}: {
	from: Vec3Mm;
	to: Vec3Mm;
	axis: "x" | "y" | "z";
}) {
	const lengthMm = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
	// Two picked points can share a coordinate on any axis — a pure-width
	// measurement between two corners at the same height leaves no "height"
	// leg to draw at all.
	if (lengthMm < 1) return null;

	return (
		<Line
			points={[
				[m(from.x), m(from.y), m(from.z)],
				[m(to.x), m(to.y), m(to.z)],
			]}
			color={AXIS_COLOR[axis]}
			dashed
			dashSize={0.025}
			gapSize={0.015}
			lineWidth={1.5}
			depthTest={false}
		/>
	);
}
