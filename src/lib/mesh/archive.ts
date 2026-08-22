import { unzipSync } from "fflate";

/**
 * A design export is a folder — `FLAT PACK.obj`, `FLAT PACK.mtl` and every
 * texture it references — so intake takes the zipped folder rather than a
 * lone `.obj`. The textures are the only place the real finish names survive
 * (`Rhone Oak.jpg`, `Strata Noir.jpg`); the `.mtl` calls the same materials
 * `7#752#-1`.
 *
 * The bytes never reach the 3D scene. This reads names and text out of the
 * archive and drops the image data on the floor — see CLAUDE.md, "design
 * files are intake, not runtime assets".
 */

export type MeshArchive = {
	objName: string;
	objText: string;
	/** Texture filenames, in archive order. Finish candidates for a human. */
	imageNames: string[];
};

const IMAGE = /\.(png|jpe?g|webp|tga|bmp)$/i;

/** Editor cruft, not content. */
const isNoise = (path: string) =>
	path.endsWith("/") || /(^|\/)(__MACOSX\/|\._|\.DS_Store$)/.test(path);

export function readArchive(bytes: Uint8Array): MeshArchive {
	const imageNames: string[] = [];

	// One pass. The filter runs for every entry, so it is also where the
	// texture names get collected — decompressing a 30 MB texture folder just
	// to read its filenames would be the whole cost of the import for nothing.
	const files = unzipSync(bytes, {
		filter: ({ name }) => {
			if (isNoise(name)) return false;
			if (IMAGE.test(name)) {
				imageNames.push(basename(name));
				return false;
			}
			return true;
		},
	});

	const objName = Object.keys(files).find((name) =>
		name.toLowerCase().endsWith(".obj"),
	);
	if (!objName) {
		throw new Error("no .obj in the archive — zip the whole export folder");
	}

	// The `.mtl` is deliberately not read. Its materials are exporter ids
	// (`7#752#-1`) pointing at re-encoded texture copies, so it can name
	// neither a finish nor a panel — the texture filenames above are the only
	// thing in the archive that carries a real name.
	return {
		objName: basename(objName),
		objText: new TextDecoder().decode(files[objName]),
		imageNames,
	};
}

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
