/**
 * Checking this project's TIFF reader against GDAL: which pixels to compare,
 * and the comparison of what the two read there.
 *
 * Running GDAL is left to the caller. Its `gdallocationinfo -valonly` takes
 * a column and a row on each line of its input and answers with the pixel's
 * value on a line of its own.
 */

/** A pixel of an image, by column and row from its top-left corner. */
export type Pixel = {
	readonly column: number;
	readonly row: number;
};

/** The image pixels are chosen from. */
export type SampledImage = {
	readonly width: number;
	readonly height: number;
	readonly tileWidth: number;
	readonly tileHeight: number;
};

/** How many pixels to choose beyond the fixed ones, and from what seed. */
export type SampleOptions = {
	/** Pixels chosen at random across the image. */
	readonly randomCount: number;
	/** Selects the random pixels: the same seed gives the same ones. */
	readonly seed: number;
};

/** The outcome of comparing values with what GDAL printed. */
export type GdalComparison = {
	/** Values compared. */
	readonly compared: number;
	/** Positions, in the order given, where the two differ in any bit. */
	readonly mismatches: readonly number[];
};

/** Pixels taken along each of the image's four edges. */
const EDGE_SAMPLES = 64;

/**
 * A small seeded generator of numbers from 0 up to 1: mulberry32.
 *
 * @param seed - Any number; only its low 32 bits count.
 */
const seededRandom = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = Math.imul(state ^ (state >>> 15), state | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
	};
};

/**
 * The pixels at which to compare two readings of an image.
 *
 * @remarks
 * Chosen to catch the mistakes a tile reader can make. The four corners,
 * and pixels spread along the first and last rows and columns, show whether
 * the image is the right way up and round and whether the tiles that reach
 * past its edge are read properly. The pixels on both sides of the corners
 * where four tiles meet, taken along the diagonal, show whether tiles are
 * found in the right order and each row of a tile starts afresh. Pixels at
 * random cover the rest.
 *
 * @param image - The size of the image and of its tiles.
 * @param options - How many random pixels, and their seed.
 * @returns The pixels, each one once, in no particular order.
 */
export const samplePixels = (
	image: SampledImage,
	options: SampleOptions,
): Pixel[] => {
	const { width, height, tileWidth, tileHeight } = image;
	const chosen = new Map<number, Pixel>();
	const add = (column: number, row: number): void => {
		if (column >= 0 && column < width && row >= 0 && row < height) {
			chosen.set(row * width + column, { column, row });
		}
	};

	for (let index = 0; index < EDGE_SAMPLES; index++) {
		const column = Math.round((index / (EDGE_SAMPLES - 1)) * (width - 1));
		const row = Math.round((index / (EDGE_SAMPLES - 1)) * (height - 1));
		add(column, 0);
		add(column, height - 1);
		add(0, row);
		add(width - 1, row);
	}
	for (
		let tile = 1;
		tile * tileWidth < width || tile * tileHeight < height;
		tile++
	) {
		const column = tile * tileWidth;
		const row = tile * tileHeight;
		for (const dx of [-1, 0]) {
			for (const dy of [-1, 0]) {
				add(column + dx, row + dy);
			}
		}
	}
	const random = seededRandom(options.seed);
	for (let index = 0; index < options.randomCount; index++) {
		add(Math.floor(random() * width), Math.floor(random() * height));
	}
	return [...chosen.values()];
};

/**
 * The input that asks `gdallocationinfo` for the values of pixels.
 *
 * @param pixels - The pixels, in the order their values are wanted.
 */
export const gdalLocationInput = (pixels: readonly Pixel[]): string =>
	pixels.map(({ column, row }) => `${column} ${row}\n`).join('');

/**
 * Compares 32-bit floats with the values GDAL printed for the same pixels.
 *
 * @remarks
 * GDAL prints a float with enough digits to tell it from every other, so
 * the number it printed, rounded to single precision, is the float it read.
 * Two values match only if they are that same float, bit for bit.
 *
 * @param values - The floats this project's reader gave, in pixel order.
 * @param gdalOutput - What `gdallocationinfo -valonly` printed for the same
 * pixels in the same order: one value on each line.
 * @returns How many values were compared and where they differ.
 * @throws Error if GDAL did not print one value for each pixel.
 */
export const compareWithGdal = (
	values: Float32Array,
	gdalOutput: string,
): GdalComparison => {
	const lines = gdalOutput
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
	if (lines.length !== values.length) {
		throw new Error(
			`GDAL printed ${lines.length} values for ${values.length} pixels`,
		);
	}
	const mismatches: number[] = [];
	lines.forEach((line, index) => {
		if (!Object.is(Math.fround(Number(line)), values[index])) {
			mismatches.push(index);
		}
	});
	return { compared: values.length, mismatches };
};
