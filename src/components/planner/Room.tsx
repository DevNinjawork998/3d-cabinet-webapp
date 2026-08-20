"use client";

import { Grid } from "@react-three/drei";

/**
 * Cutaway room: floor, back wall, left wall. Planes are single-sided, so the
 * two missing walls simply vanish when the camera swings around — that is the
 * whole cutaway effect, no clipping planes needed.
 */
export function Room({
	width,
	depth,
	height,
}: {
	width: number;
	depth: number;
	height: number;
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

			<mesh
				position={[-width / 2, height / 2, 0]}
				rotation={[0, Math.PI / 2, 0]}
			>
				<planeGeometry args={[depth, height]} />
				<meshStandardMaterial color="#e1dfda" roughness={0.95} />
			</mesh>
		</group>
	);
}
