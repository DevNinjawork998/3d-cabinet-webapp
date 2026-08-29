"use client";

import { Grid } from "@react-three/drei";

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
			<mesh rotation={[-Math.PI / 2, 0, 0]}>
				<planeGeometry args={[width, depth]} />
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
				<planeGeometry args={[width, height]} />
				<meshStandardMaterial color="#edebe7" roughness={0.95} />
			</mesh>

			{sideWalls && (
				<>
					<mesh
						position={[-width / 2, height / 2, 0]}
						rotation={[0, Math.PI / 2, 0]}
					>
						<planeGeometry args={[depth, height]} />
						<meshStandardMaterial color="#e1dfda" roughness={0.95} />
					</mesh>
					<mesh
						position={[width / 2, height / 2, 0]}
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
