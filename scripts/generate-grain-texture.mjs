import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const SIZE = 1024;
const OUT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../public/textures/grain-1k.png",
);

// Wood grain: long horizontal fibres. Value-noise stretched heavily along X,
// plus a fine per-pixel speckle so the surface doesn't read as flat plastic.
function valueNoiseRow(width, cellSize, seedOffset) {
	const cells = Math.ceil(width / cellSize) + 1;
	const points = Array.from(
		{ length: cells },
		(_, i) => pseudoRandom(i + seedOffset) * 2 - 1,
	);
	return (x) => {
		const t = x / cellSize;
		const i = Math.floor(t);
		const f = t - i;
		const smooth = f * f * (3 - 2 * f);
		return points[i] * (1 - smooth) + points[i + 1] * smooth;
	};
}

function pseudoRandom(n) {
	const s = Math.sin(n * 127.1) * 43758.5453;
	return s - Math.floor(s);
}

// 8-bit greyscale, no alpha: a tinted grain map needs one channel, and RGBA
// here cost ~4x the bytes over mobile data for identical output.
const png = new PNG({
	width: SIZE,
	height: SIZE,
	colorType: 0,
	inputColorType: 0,
	bitDepth: 8,
});

for (let y = 0; y < SIZE; y++) {
	// Three octaves of noise along X, seeded per-row so grain drifts vertically.
	const coarse = valueNoiseRow(SIZE, 220, y * 0.12);
	const mid = valueNoiseRow(SIZE, 70, 1000 + y * 0.35);
	const fine = valueNoiseRow(SIZE, 18, 5000 + y * 0.9);

	for (let x = 0; x < SIZE; x++) {
		const grain = coarse(x) * 0.55 + mid(x) * 0.3 + fine(x) * 0.15;
		// Centre on mid-grey: the shader tints this via material colour, so the
		// texture must not darken or blow out the chosen finish colour.
		const value = 0.72 + grain * 0.14;
		const level = Math.max(0, Math.min(255, Math.round(value * 255)));
		png.data[SIZE * y + x] = level;
	}
}

mkdirSync(dirname(OUT), { recursive: true });
png
	.pack()
	.pipe(createWriteStream(OUT))
	.on("finish", () => console.log(`wrote ${OUT}`));
