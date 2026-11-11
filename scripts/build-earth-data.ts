/**
 * Builds `public/data/earth-256.bin`, the Earth's elevation on the finest
 * grid, from NOAA's ETOPO 2022 relief model.
 *
 * Run with `npm run build:earth`. The source file, about 466 MB, is
 * downloaded once into `.cache/etopo/` and reused from there; a download
 * that was cut off is taken up where it stopped. Its SHA-256 is checked
 * against the one pinned for NOAA's file before it is read, at every run,
 * and a file that differs is deleted. The file is then read a
 * tile at a time, so only one tile of it is ever in memory, and every pixel
 * is averaged into the cell of the grid that holds its centre.
 *
 * With `--verify-with-gdal`, the pixels this script's own TIFF reader gives
 * are first compared with what GDAL's `gdallocationinfo` reads from the
 * same file, and the build stops if any differs. Where GDAL is not
 * installed the comparison is skipped with a note.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	closeSync,
	mkdirSync,
	openSync,
	readSync,
	statSync,
	unlinkSync,
	writeFileSync,
	writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import {
	cellCentre,
	computeTerrainStats,
	decodeEarth,
	directionToLatLon,
	EARTH_DATA_RESOLUTION,
	earthWorld,
	getGrid,
	SUPPORTED_RESOLUTIONS,
	type World,
} from '../src/core/index';
import {
	createCellAverager,
	encodeEarth,
	summariseCounts,
} from './earth/cells';
import {
	assertEtopoLayout,
	contentRangeProblem,
	downloadOverrun,
	ETOPO_FILE_BYTES,
	ETOPO_FILE_NAME,
	ETOPO_NO_DATA,
	ETOPO_URL,
	etopoDigestMismatch,
} from './earth/etopo';
import {
	compareWithGdal,
	gdalLocationInput,
	type Pixel,
	samplePixels,
} from './earth/gdalCheck';
import {
	assertFloatTiles,
	decodeFloatTile,
	readTiffLayout,
	type TiffLayout,
} from './earth/tiff';

/** The option that asks for the comparison with GDAL. */
const VERIFY_OPTION = '--verify-with-gdal';

/**
 * The fewest pixels a cell's mean may be taken over. A cell of the finest
 * grid is about 21 pixels across at the equator, so every cell should get
 * some hundreds; far fewer would mean pixels are landing in the wrong cells.
 */
const MIN_PIXELS_PER_CELL = 100;

/** Pixels compared with GDAL beyond the fixed ones, and their seed. */
const GDAL_RANDOM_PIXELS = 2000;
const GDAL_SAMPLE_SEED = 2022;

/** The most `gdallocationinfo` may print before it is cut off, in bytes. */
const GDAL_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** How often the download says how far it has got, in bytes. */
const DOWNLOAD_REPORT_BYTES = 50_000_000;

/** How much of the source file is read at a time to hash it, in bytes. */
const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIRECTORY = join(ROOT, '.cache', 'etopo');
const OUTPUT_DIRECTORY = join(ROOT, 'public', 'data');
const OUTPUT_NAME = `earth-${EARTH_DATA_RESOLUTION}.bin`;

const say = (text: string): void => {
	stdout.write(`${text}\n`);
};

const megabytes = (bytes: number): string => (bytes / 1e6).toFixed(0);

const fileSize = (path: string): number =>
	statSync(path, { throwIfNoEntry: false })?.size ?? 0;

/** The SHA-256 of a file in hexadecimal, read a chunk at a time. */
const sha256Of = (path: string): string => {
	const hash = createHash('sha256');
	const chunk = new Uint8Array(HASH_CHUNK_BYTES);
	const file = openSync(path, 'r');
	try {
		let position = 0;
		for (;;) {
			const length = readSync(file, chunk, 0, chunk.length, position);
			if (length === 0) {
				break;
			}
			hash.update(chunk.subarray(0, length));
			position += length;
		}
	} finally {
		closeSync(file);
	}
	return hash.digest('hex');
};

/**
 * Checks that the cached file is NOAA's, byte for byte, and deletes it if
 * it is not.
 *
 * @throws Error if the file's SHA-256 is not the one pinned.
 */
const assertSourceDigest = (path: string): void => {
	say(`Checking the SHA-256 of ${path}`);
	const mismatch = etopoDigestMismatch(sha256Of(path));
	if (mismatch !== null) {
		unlinkSync(path);
		throw new Error(
			`${mismatch}; the cached file was deleted, so run the script again to download it afresh`,
		);
	}
};

/**
 * Makes sure the whole source file is in the cache, downloading what is
 * missing.
 *
 * @remarks
 * A file already there at its full length is used if its SHA-256 is the one
 * pinned. A shorter one is taken to be a download that was cut off, and
 * only the rest is asked for; if the server sends the whole file all the
 * same, the file is started again. A longer one cannot be part of the right
 * file and is replaced. A finished download has its SHA-256 checked too,
 * which also catches a file put together from the wrong parts.
 *
 * Nothing is written past the file's full length: a server that sends more
 * is cut off there and what was written is deleted. A server that answers
 * the request for the rest of the file with some other part is refused
 * before anything is written, and what is there is left as it was.
 *
 * @returns The path of the file.
 * @throws Error if the server refuses, if it sends another part of the file
 * than the one asked for, if it sends more than the file's length, in which
 * case the file is deleted, if the file is not its full length once the
 * download ends, or if its SHA-256 is not the one pinned, in which case the
 * file is deleted.
 */
const ensureSource = async (): Promise<string> => {
	mkdirSync(CACHE_DIRECTORY, { recursive: true });
	const path = join(CACHE_DIRECTORY, ETOPO_FILE_NAME);
	const have = fileSize(path);
	if (have === ETOPO_FILE_BYTES) {
		say(`Using ${path}`);
		assertSourceDigest(path);
		return path;
	}
	const resumeFrom = have < ETOPO_FILE_BYTES ? have : 0;
	say(
		resumeFrom > 0
			? `Resuming the download at ${megabytes(resumeFrom)} of ${megabytes(ETOPO_FILE_BYTES)} MB`
			: `Downloading ${megabytes(ETOPO_FILE_BYTES)} MB from ${ETOPO_URL}`,
	);
	const response = await fetch(
		ETOPO_URL,
		resumeFrom > 0 ? { headers: { Range: `bytes=${resumeFrom}-` } } : {},
	);
	if (!response.ok || response.body === null) {
		throw new Error(`The download was refused with status ${response.status}`);
	}
	// 206 says the server sent only the part asked for; anything else that
	// is a success is the whole file from its start.
	const appending = resumeFrom > 0 && response.status === 206;
	if (appending) {
		const problem = contentRangeProblem(
			response.headers.get('content-range'),
			resumeFrom,
		);
		if (problem !== null) {
			await response.body.cancel();
			throw new Error(
				`${problem}; delete ${path} to download the file from its start`,
			);
		}
	}
	let written = appending ? resumeFrom : 0;
	let nextReport = written + DOWNLOAD_REPORT_BYTES;
	let overrun: string | null = null;
	const file = openSync(path, appending ? 'a' : 'w');
	try {
		const reader = response.body.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done || value === undefined) {
				break;
			}
			overrun = downloadOverrun(written + value.length);
			if (overrun !== null) {
				await reader.cancel();
				break;
			}
			writeSync(file, value);
			written += value.length;
			if (written >= nextReport) {
				say(`  ${megabytes(written)} MB`);
				nextReport += DOWNLOAD_REPORT_BYTES;
			}
		}
	} finally {
		closeSync(file);
	}
	if (overrun !== null) {
		unlinkSync(path);
		throw new Error(
			`${overrun}; the download was stopped and what was written was deleted`,
		);
	}
	const size = fileSize(path);
	if (size !== ETOPO_FILE_BYTES) {
		throw new Error(
			`The download ended with ${size} of ${ETOPO_FILE_BYTES} bytes; run the script again to carry on`,
		);
	}
	assertSourceDigest(path);
	return path;
};

/** Reads the tiles of the source file, one at a time. */
type TileReader = {
	readonly layout: TiffLayout;
	/**
	 * The floats of a tile, row by row, in an array that the next call
	 * overwrites.
	 */
	readTile(tile: number): Float32Array;
	close(): void;
};

/** Opens the source file and checks it is laid out as expected. */
const openSource = (path: string): TileReader => {
	const file = openSync(path, 'r');
	const read = (offset: number, length: number): Uint8Array => {
		const bytes = new Uint8Array(length);
		return bytes.subarray(0, readSync(file, bytes, 0, length, offset));
	};
	const layout = readTiffLayout(read, fileSize(path));
	assertFloatTiles(layout);
	assertEtopoLayout(layout);
	const values = new Float32Array(layout.tileWidth * layout.tileHeight);
	// A tile that inflates to more than its floats take is not read at all.
	const tileBytes = values.byteLength;
	return {
		layout,
		readTile: (tile) => {
			const compressed = read(
				layout.tileOffsets[tile] as number,
				layout.tileByteCounts[tile] as number,
			);
			decodeFloatTile(
				inflateSync(compressed, { maxOutputLength: tileBytes }),
				layout.tileWidth,
				layout.tileHeight,
				values,
			);
			return values;
		},
		close: () => closeSync(file),
	};
};

/** Whether an error says the program to run was not found. */
const isNotFound = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	error.code === 'ENOENT';

/**
 * Compares what this script reads from the source file with what GDAL
 * reads, at a spread of pixels.
 *
 * @throws Error if any pixel differs.
 */
const verifyWithGdal = (path: string, source: TileReader): void => {
	const { layout } = source;
	const tileOf = ({ column, row }: Pixel): number =>
		Math.floor(row / layout.tileHeight) * layout.tilesAcross +
		Math.floor(column / layout.tileWidth);
	// In tile order, so that each tile is decompressed once.
	const pixels = samplePixels(layout, {
		randomCount: GDAL_RANDOM_PIXELS,
		seed: GDAL_SAMPLE_SEED,
	}).sort((a, b) => tileOf(a) - tileOf(b));

	let output: string;
	try {
		output = execFileSync('gdallocationinfo', ['-valonly', path], {
			input: gdalLocationInput(pixels),
			encoding: 'utf8',
			maxBuffer: GDAL_MAX_OUTPUT_BYTES,
		});
	} catch (error) {
		if (isNotFound(error)) {
			say('GDAL is not installed: the comparison with it is skipped');
			return;
		}
		throw error;
	}

	const values = new Float32Array(pixels.length);
	let loaded = -1;
	let tileValues: Float32Array = new Float32Array(0);
	pixels.forEach((pixel, index) => {
		const tile = tileOf(pixel);
		if (tile !== loaded) {
			tileValues = source.readTile(tile);
			loaded = tile;
		}
		values[index] = tileValues[
			(pixel.row % layout.tileHeight) * layout.tileWidth +
				(pixel.column % layout.tileWidth)
		] as number;
	});

	const { compared, mismatches } = compareWithGdal(values, output);
	if (mismatches.length > 0) {
		const first = pixels[mismatches[0] as number] as Pixel;
		throw new Error(
			`${mismatches.length} of ${compared} pixels differ from GDAL, the first at column ${first.column}, row ${first.row}`,
		);
	}
	say(`GDAL agrees bit for bit at all ${compared} pixels compared`);
};

/** Says where a world's highest and deepest cells are, and its land. */
const describe = (world: World): string => {
	const grid = getGrid(world.resolution);
	let highest = 0;
	let deepest = 0;
	world.elevation.forEach((metres, cell) => {
		if (metres > (world.elevation[highest] as number)) {
			highest = cell;
		}
		if (metres < (world.elevation[deepest] as number)) {
			deepest = cell;
		}
	});
	const place = (cell: number): string => {
		const { latitudeDeg, longitudeDeg } = directionToLatLon(
			cellCentre(grid, cell),
		);
		return `${(world.elevation[cell] as number).toFixed(0)} m at ${latitudeDeg.toFixed(1)}°, ${longitudeDeg.toFixed(1)}°`;
	};
	const { landFraction } = computeTerrainStats(world);
	return `${world.resolution}: ${(landFraction * 100).toFixed(2)}% land, highest ${place(highest)}, deepest ${place(deepest)}`;
};

/**
 * Builds the Earth data file.
 *
 * @param args - The command line's arguments after the script's name.
 * @returns A promise that resolves once the file is written.
 * @throws Error if the source cannot be downloaded or is not as expected,
 * if GDAL disagrees with what is read, or if the averages are not sound.
 */
export const main = async (args: readonly string[]): Promise<void> => {
	const unknown = args.filter((arg) => arg !== VERIFY_OPTION);
	if (unknown.length > 0) {
		throw new Error(
			`Unknown option ${unknown.join(' ')}: the only option is ${VERIFY_OPTION}`,
		);
	}
	const path = await ensureSource();
	const source = openSource(path);
	const started = Date.now();
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		const { layout } = source;
		if (args.includes(VERIFY_OPTION)) {
			verifyWithGdal(path, source);
		}

		say(`Averaging ${layout.width} × ${layout.height} pixels into cells`);
		const averager = createCellAverager(EARTH_DATA_RESOLUTION, {
			width: layout.width,
			height: layout.height,
			noData: ETOPO_NO_DATA,
		});
		for (let tileRow = 0; tileRow < layout.tilesDown; tileRow++) {
			const row = tileRow * layout.tileHeight;
			for (let tileColumn = 0; tileColumn < layout.tilesAcross; tileColumn++) {
				const column = tileColumn * layout.tileWidth;
				averager.add({
					values: source.readTile(tileRow * layout.tilesAcross + tileColumn),
					stride: layout.tileWidth,
					column,
					row,
					// The last tile each way reaches past the image's edge.
					columns: Math.min(layout.tileWidth, layout.width - column),
					rows: Math.min(layout.tileHeight, layout.height - row),
				});
			}
		}

		const averages = averager.finish();
		const total = layout.width * layout.height;
		if (averages.pixels + averages.noDataPixels !== total) {
			throw new Error(
				`${averages.pixels + averages.noDataPixels} pixels were read where the image has ${total}`,
			);
		}
		const counts = summariseCounts(averages.pixelCounts);
		say(
			`Pixels per cell: least ${counts.min}, median ${counts.median}, most ${counts.max}; ${averages.noDataPixels} pixels held no data`,
		);
		if (counts.min < MIN_PIXELS_PER_CELL) {
			throw new Error(
				`A cell's mean was taken over only ${counts.min} pixels; at least ${MIN_PIXELS_PER_CELL} were expected`,
			);
		}
		bytes = encodeEarth(averages.means);
	} finally {
		source.close();
	}

	mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
	const output = join(OUTPUT_DIRECTORY, OUTPUT_NAME);
	writeFileSync(output, bytes);
	say(
		`Wrote ${bytes.length} bytes to ${output} in ${((Date.now() - started) / 1000).toFixed(1)} s`,
	);
	const data = decodeEarth(bytes);
	for (const resolution of [...SUPPORTED_RESOLUTIONS].reverse()) {
		say(describe(earthWorld(data, resolution)));
	}
};
