"use client";

import { Center, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import type { Group } from "three";
import { Box3, Vector3 } from "three";

/**
 * Shows an uploaded design file as the drafter drew it.
 *
 * **This is the one place a mesh is loaded, and it is not the planner.**
 * CLAUDE.md's rule — nothing in the scene is a loaded model — is about the
 * customer-facing planner, where a baked mesh cannot resize to a size ladder,
 * carries no parameters and so can never produce a price or a BOM, and blows
 * the mobile budget. None of that applies here: this is an admin behind a
 * login, checking that the file they just picked is the cabinet they meant,
 * before anything is priced or published. It answers "is this the right file",
 * which is a question a table of numbers cannot.
 *
 * It stays out of the public bundle because the only thing that imports it is
 * an admin page, behind a dynamic import.
 */

/** Fit any model into a box about this big, whatever units it was drawn in. */
const FRAME_SIZE = 2;

const isZip = (name: string) => name.toLowerCase().endsWith(".zip");

/**
 * The `.obj` text, from whichever shape the design arrived in.
 *
 * The upload form accepts `.obj` *or* a `.zip` of the whole export folder, so
 * the viewer has to handle both or half the things an admin can attach show
 * "no geometry". `lib/mesh/archive.ts` already knows how to find the `.obj`
 * inside an archive — this only has to decide which case it is looking at.
 */
async function objTextFrom(source: File | string): Promise<string> {
	if (typeof source === "string") {
		const res = await fetch(source);
		if (!res.ok) throw new Error("could not fetch the design file");
		// A stored design keeps its original filename in the URL's disposition,
		// so a zip is recognised by its bytes rather than its name.
		const bytes = new Uint8Array(await res.arrayBuffer());
		const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
		if (!zipped) return new TextDecoder().decode(bytes);
		const { readArchive } = await import("@/lib/mesh/archive");
		return readArchive(bytes).objText;
	}

	if (!isZip(source.name)) return source.text();
	const { readArchive } = await import("@/lib/mesh/archive");
	return readArchive(new Uint8Array(await source.arrayBuffer())).objText;
}

/**
 * Frames the model, whatever it was drawn in.
 *
 * One mechanism only. An earlier version scaled here *and* wrapped the result
 * in drei's `<Bounds fit clip>`, and the two disagreed about what they were
 * measuring — the canvas mounted, the file parsed, and nothing appeared.
 * `<Center>` puts the model on the origin; the scale below decides how big it
 * is; the camera never moves. A viewer only has to look right, not measure.
 */
function Model({ object }: { object: Group }) {
	const size = new Box3().setFromObject(object).getSize(new Vector3());
	const longest = Math.max(size.x, size.y, size.z) || 1;

	// Z-up files arrive lying on their back. A cabinet is never deeper than it
	// is tall, so that comparison is a safe way to spot one.
	const zUp = size.z > size.y;

	return (
		<Center>
			<primitive
				object={object}
				scale={FRAME_SIZE / longest}
				rotation={zUp ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
			/>
		</Center>
	);
}

export function DesignViewer({
	/** The picked file, or a URL an admin route streams the stored one from. */
	source,
	className = "",
}: {
	source: File | string | null;
	className?: string;
}) {
	const [object, setObject] = useState<Group | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!source) {
			setObject(null);
			setError(null);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		(async () => {
			try {
				// Loaded on demand. The loader is three's own, from `examples/jsm`,
				// and has no business in any bundle but this one.
				const { OBJLoader } = await import(
					"three/examples/jsm/loaders/OBJLoader.js"
				);
				const text = await objTextFrom(source);

				if (cancelled) return;
				const parsed = new OBJLoader().parse(text);
				if (parsed.children.length === 0) {
					setError("No geometry in that file.");
					setObject(null);
				} else {
					setObject(parsed);
				}
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : String(e));
					setObject(null);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [source]);

	if (!source) return null;

	return (
		<div
			className={`relative overflow-hidden rounded-lg border border-neutral-200 bg-[#f4f2ee] ${className}`}
		>
			{object && (
				<Canvas
					dpr={[1, 2]}
					camera={{ fov: 40, position: [2.8, 2, 3.4] }}
					// The panel is a fixed overlay with a scrolling body. R3F sizes
					// itself through react-use-measure, and with scroll tracking on it
					// measured this container as zero and never created its root — the
					// canvas element existed but no frame was ever drawn.
					resize={{ scroll: false, debounce: 0 }}
					style={{ width: "100%", height: "100%" }}
				>
					<ambientLight intensity={1.1} />
					<directionalLight position={[4, 7, 6]} intensity={1.6} />
					<Model object={object} />
					<OrbitControls makeDefault enablePan={false} />
				</Canvas>
			)}

			{(loading || error) && (
				<p
					className={`absolute inset-0 flex items-center justify-center px-4 text-center text-xs ${
						error ? "text-amber-800" : "text-neutral-500"
					}`}
				>
					{error ?? "Reading the model…"}
				</p>
			)}

			{object && (
				<p className="pointer-events-none absolute bottom-1.5 left-0 right-0 text-center text-[10px] text-neutral-400">
					drag to rotate · scroll to zoom
				</p>
			)}
		</div>
	);
}
