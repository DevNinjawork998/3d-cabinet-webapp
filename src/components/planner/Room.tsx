"use client";

import { Grid } from "@react-three/drei";
import { WALL_GAP_MM } from "@/lib/planner/catalogue";

/**
 * The scribe gap, in metres, held off **every** wall and not only the back one.
 *
 * The run is clamped to `[0, wallWidthMm]`, and the side walls stand at exactly
 * those two figures — so a cabinet pushed to either end put its side panel on
 * the very plane of the wall. Two coplanar surfaces do not read as "flush"; they
 * read as one eating the other, flickering between them as the camera moves, and
 * from outside the room the single-sided wall vanishes and leaves the carcass
 * hanging through where the wall was.
 *
 * The back wall never had this problem because the run is already held off it by
 * `WALL_GAP_MM` — which is a real allowance, not a rendering trick: no fitter
 * pushes a carcass hard against plaster. The side walls get the same, given here
 * rather than by insetting the run, so `wallWidthMm` stays the length the
 * customer measured and a run built wall to wall still reaches both ends.
 */
const SCRIBE = WALL_GAP_MM / 1000;

/**
 * Cutaway room: floor, back wall, and the two side walls when the run is built
 * between them. Planes are single-sided, so the missing front wall simply
 * vanishes when the camera swings around — that is the whole cutaway effect,
 * no clipping planes needed.
 *
 * `width` is the wall the customer measured, not a padded stage. It used to be
 * drawn 1.2m wider with the run centred in it, which left bare wall past each
 * end and made a run built wall to wall impossible to show.
 *
 * The side walls follow `sideWalls` rather than always being drawn, because
 * whether they exist is exactly what decides if the run's end cabinets need a
 * finished panel — see `exposure.ts`. A room that shows walls the price does
 * not believe in is worse than a room with none.
 */
export function Room({
	width,
	depth,
	height,
	sideWalls = false,
}: {
	width: number;
	depth: number;
	height: number;
	/** Return walls at both ends of the run. */
	sideWalls?: boolean;
}) {
	return (
		<group>
			{/* Floor and back wall run the extra scribe each side, so the corner
			    where they meet the side walls stays closed. */}
			<mesh rotation={[-Math.PI / 2, 0, 0]}>
				<planeGeometry args={[width + SCRIBE * 2, depth]} />
				<meshStandardMaterial color="#6f7377" roughness={0.9} />
			</mesh>
			<Grid
				position={[0, 0.003, 0]}
				args={[width, depth]}
				cellSize={0.3}
				cellThickness={0.8}
				cellColor="#9aa0a6"
				sectionSize={1.2}
				sectionThickness={1.1}
				sectionColor="#aab0b6"
				fadeDistance={100}
				fadeStrength={0}
			/>

			<mesh position={[0, height / 2, -depth / 2]}>
				<planeGeometry args={[width + SCRIBE * 2, height]} />
				<meshStandardMaterial color="#edebe7" roughness={0.95} />
			</mesh>

			{sideWalls && (
				<>
					<mesh
						position={[-width / 2 - SCRIBE, height / 2, 0]}
						rotation={[0, Math.PI / 2, 0]}
					>
						<planeGeometry args={[depth, height]} />
						<meshStandardMaterial color="#e1dfda" roughness={0.95} />
					</mesh>
					<mesh
						position={[width / 2 + SCRIBE, height / 2, 0]}
						rotation={[0, -Math.PI / 2, 0]}
					>
						<planeGeometry args={[depth, height]} />
						<meshStandardMaterial color="#e1dfda" roughness={0.95} />
					</mesh>
				</>
			)}
		</group>
	);
}
