import { useMemo } from "react";
import {
	NoColorSpace,
	RepeatWrapping,
	SRGBColorSpace,
	type Texture,
	TextureLoader,
} from "three";

/**
 * The one grain texture, shared by every surface in the scene.
 *
 * CLAUDE.md's rule, finally implemented: *one* greyscale tile tinted per finish
 * by the material colour, never a PBR set per finish. `public/grain.png` is
 * 22-53KB and every door, carcass, shelf and worktop is that same file — so a
 * catalogue of twenty finishes still costs one request.
 *
 * It is applied twice on each material: as `map`, where it multiplies the
 * finish colour, and as `roughnessMap`, where it varies the sheen. Both read
 * the same image, so the second costs nothing on the wire and very little on
 * the GPU — clones share a `Texture.source`, which is one upload.
 *
 * Grain direction carries most of the realism, which is why this takes an
 * orientation rather than handing out one texture: a door is veneered with the
 * grain running up it and a drawer front with the grain running across, and
 * getting that backwards looks wrong even to someone who could not say why.
 */

/**
 * How much wall a single tile covers. Real oak grain lines sit 5-30mm apart;
 * the tile has nine lines across it, so 260mm puts them about 29mm apart —
 * coarse enough to read at planner zoom, fine enough not to look like decking.
 */
const TILE_M = 0.26;

/**
 * Loaded on first use rather than at module scope: this file is pulled in by a
 * client component that Next also renders on the server, where there is no
 * `Image` to decode into. Every caller is inside the R3F canvas, so by the time
 * anything asks, we are in a browser.
 */
let source: Texture | null = null;

function grainSource(): Texture {
	if (!source) {
		source = new TextureLoader().load("/grain.png");
		source.wrapS = RepeatWrapping;
		source.wrapT = RepeatWrapping;
	}
	return source;
}

/**
 * Uploaded decor photos, one entry per URL. Same lazy-singleton reasoning as
 * the grain tile, plus a cache: a run of eight cabinets in one finish is one
 * image, not eight.
 */
const photos = new Map<string, Texture>();

function photoSource(url: string): Texture {
	let texture = photos.get(url);
	if (!texture) {
		texture = new TextureLoader().load(url);
		texture.wrapS = RepeatWrapping;
		texture.wrapT = RepeatWrapping;
		photos.set(url, texture);
	}
	return texture;
}

/**
 * How much wall one decor scan covers.
 *
 * A supplier scan is a photograph of a real sheet, not a seamless tile: repeat
 * it and the join shows as a hard line straight across the door. So the sheet
 * is treated as its true size — a laminate sheet runs 1220mm wide — and every
 * door is cut *out of* it rather than papered with copies of it. A 900mm door
 * shows about three quarters of the scan and never reaches an edge.
 */
const PHOTO_SHEET_M = 1.22;

export type GrainDirection = "vertical" | "horizontal";

/**
 * How much of the tile a surface wears.
 *
 * `figure` puts it on the colour as well as the sheen — a veneered front, where
 * the grain is the point. `sheen` uses it only as a roughness map, so the
 * surface catches light unevenly but keeps its flat colour: melamine carcass
 * board and a honed worktop both look wrong with visible figure, and reading
 * as timber is exactly the failure there.
 */
export type GrainStrength = "figure" | "sheen";

/**
 * Material props to spread onto a `meshStandardMaterial`. The `color` the
 * material already sets keeps doing the tinting — this only adds the figure.
 *
 * `width` and `height` are the surface's own size in metres, the unit the rest
 * of the scene works in, so the grain stays the same physical scale whether it
 * is on a 400 drawer front or a 900 door. Tiling to the mesh instead would
 * stretch it, which is the exact artefact CLAUDE.md rejects baked meshes for.
 */
export function useGrain(
	direction: GrainDirection,
	width: number,
	height: number,
	strength: GrainStrength = "figure",
) {
	return useMemo(() => {
		const across = Math.max(width, 0.01) / TILE_M;
		const along = Math.max(height, 0.01) / TILE_M;

		// The tile is drawn with its lines running vertically, so a horizontal
		// grain is the same tile rotated a quarter turn.
		const rotation = direction === "horizontal" ? Math.PI / 2 : 0;
		const repeat: [number, number] =
			direction === "horizontal" ? [along, across] : [across, along];

		const map = grainSource().clone();
		map.colorSpace = SRGBColorSpace;
		map.rotation = rotation;
		map.center.set(0.5, 0.5);
		map.repeat.set(repeat[0], repeat[1]);
		map.needsUpdate = true;

		// Roughness is data, not colour, so it must stay linear — tagging it sRGB
		// would push every surface toward the same sheen.
		const roughnessMap = map.clone();
		roughnessMap.colorSpace = NoColorSpace;
		roughnessMap.needsUpdate = true;

		return strength === "figure" ? { map, roughnessMap } : { roughnessMap };
	}, [direction, width, height, strength]);
}

/**
 * The material for a cabinet front.
 *
 * When the client has uploaded a decor photo for this finish, that photograph
 * *is* the surface: the real scan of the board they will actually cut, so the
 * colour comes from the image and the material colour goes white rather than
 * tinting it a second time. The procedural grain stays on as the roughness map,
 * which is what stops a flat photo reading as a printed sticker.
 *
 * With no photo it falls back to the generated grain tinted by the finish
 * colour, so a catalogue nobody has photographed still looks like something.
 */
export function useFrontSurface(
	photoUrl: string | null,
	direction: GrainDirection,
	width: number,
	height: number,
	finishHex: string,
	/** Stable per-door value, 0-1, deciding where in the sheet this one is cut
	 * from. Its position along the wall does fine — neighbours differ, and it
	 * stays put when the layout re-renders. */
	offset = 0,
) {
	const figure = useGrain(direction, width, height);

	return useMemo(() => {
		if (!photoUrl) return { color: finishHex, ...figure };

		const map = photoSource(photoUrl).clone();
		map.colorSpace = SRGBColorSpace;
		map.center.set(0.5, 0.5);
		map.rotation = direction === "horizontal" ? Math.PI / 2 : 0;

		// Never above 1: a repeat of 1.5 would show the seam. A door wider than
		// the sheet is not a door the client can make from one piece anyway.
		const across = Math.min(Math.max(width, 0.01) / PHOTO_SHEET_M, 1);
		const along = Math.min(Math.max(height, 0.01) / PHOTO_SHEET_M, 1);
		map.repeat.set(
			direction === "horizontal" ? along : across,
			direction === "horizontal" ? across : along,
		);

		// Each door takes its piece from a different part of the sheet, the way
		// a run really is cut. Without this every door in a row is the same
		// photograph and the repetition is the first thing the eye finds.
		map.offset.set(
			offset % (1 - across || 1),
			(offset * 0.618) % (1 - along || 1),
		);
		map.needsUpdate = true;

		return { color: "#ffffff", map, roughnessMap: figure.roughnessMap };
	}, [photoUrl, direction, width, height, offset, finishHex, figure]);
}
