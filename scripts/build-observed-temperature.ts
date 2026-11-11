/**
 * Builds `public/data/earth-temperature-1deg.bin`, the Earth's observed
 * monthly temperature, from NOAA's Twentieth Century Reanalysis version 3.
 *
 * Run with `npm run build:observed-temperature`. The source file, about
 * 4.7 MB, is downloaded once into `.cache/observed/` and reused from there.
 * Its length and SHA-256 are checked against those pinned for NOAA's file
 * before it is read, at every run, and a file that differs is deleted. It is
 * read with this project's own netCDF reader, turned into degrees Celsius
 * and laid out north to south, and every value is stored in half-degree
 * steps on the source's own one-degree grid. The build stops rather than
 * clip a value the steps cannot hold.
 *
 * With `--verify-with-gdal`, the values this script's reader gives are
 * first compared with what GDAL's `gdallocationinfo` reads from the same
 * file, for every month, and the build stops if any differs. Where GDAL is
 * not installed the comparison is skipped with a note.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
	decodeObservedTemperature,
	encodeObservedTemperature,
	OBSERVED_BASE_C,
	OBSERVED_COLUMNS,
	OBSERVED_MAX_C,
	OBSERVED_ROWS,
	OBSERVED_STEP_C,
} from '../src/core/index';
import { ensurePinnedFile } from './download';
import {
	compareWithGdal,
	gdalLocationInput,
	type Pixel,
	samplePixels,
} from './earth/gdalCheck';
import { findVariable, type NetcdfFile, readNetcdf3 } from './earth/netcdf';
import {
	OBSERVED_SOURCE,
	OBSERVED_VARIABLE,
	observedCelsius,
	rowsFromNorth,
} from './earth/observedSource';

/** The option that asks for the comparison with GDAL. */
const VERIFY_OPTION = '--verify-with-gdal';

/** Points compared with GDAL beyond the fixed ones, and their seed. */
const GDAL_RANDOM_POINTS = 2000;
const GDAL_SAMPLE_SEED = 1981;

/** The most `gdallocationinfo` may print before it is cut off, in bytes. */
const GDAL_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** How often the download says how far it has got, in bytes. */
const DOWNLOAD_REPORT_BYTES = 1_000_000;

/**
 * The most a stored value may differ from the source's, in degrees: half a
 * step, and a little for the rounding of the arithmetic.
 */
const MAX_QUANTISATION_ERROR_C = OBSERVED_STEP_C / 2 + 1e-9;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIRECTORY = join(ROOT, '.cache', 'observed');
const OUTPUT_DIRECTORY = join(ROOT, 'public', 'data');
const OUTPUT_NAME = 'earth-temperature-1deg.bin';

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

const say = (text: string): void => {
	stdout.write(`${text}\n`);
};

/** Whether an error says the program to run was not found. */
const isNotFound = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	error.code === 'ENOENT';

/**
 * What `gdallocationinfo` prints for points of the source file: a value
 * for each month, January first, on a line of its own, for each point in
 * turn; or null if GDAL is not installed.
 *
 * @param bottomUp - Whether GDAL is to turn the file's rows over so that
 * its first line is the northernmost, as it does by default; otherwise its
 * lines are the file's rows in the file's own order.
 */
const gdalValues = (
	path: string,
	pixels: readonly Pixel[],
	bottomUp: boolean,
): string | null => {
	try {
		return execFileSync(
			'gdallocationinfo',
			[
				'--config',
				'GDAL_NETCDF_BOTTOMUP',
				bottomUp ? 'YES' : 'NO',
				'-valonly',
				`NETCDF:"${path}":${OBSERVED_VARIABLE}`,
			],
			{
				input: gdalLocationInput(pixels),
				encoding: 'utf8',
				maxBuffer: GDAL_MAX_OUTPUT_BYTES,
			},
		);
	} catch (error) {
		if (isNotFound(error)) {
			return null;
		}
		throw error;
	}
};

/**
 * Compares what this script reads from the source file with what GDAL
 * reads, at a spread of points and for every month.
 *
 * @remarks
 * GDAL is asked twice: once with the file's rows as they are, which checks
 * the reader value for value, and once turned north side up, which checks
 * that the rows are put the right way round.
 *
 * @throws Error if any value differs.
 */
const verifyWithGdal = (path: string, file: NetcdfFile): void => {
	const air = findVariable(file, OBSERVED_VARIABLE);
	const latitudes = [...(findVariable(file, 'lat')?.values ?? [])];
	const fromNorth = rowsFromNorth(latitudes);
	if (air === undefined || fromNorth === null) {
		throw new Error('The file is not laid out for comparing with GDAL');
	}
	const months = MONTH_NAMES.length;
	const perMonth = OBSERVED_ROWS * OBSERVED_COLUMNS;
	const pixels = samplePixels(
		{
			width: OBSERVED_COLUMNS,
			height: OBSERVED_ROWS,
			tileWidth: OBSERVED_COLUMNS,
			tileHeight: OBSERVED_ROWS,
		},
		{ randomCount: GDAL_RANDOM_POINTS, seed: GDAL_SAMPLE_SEED },
	);
	for (const bottomUp of [false, true]) {
		const output = gdalValues(path, pixels, bottomUp);
		if (output === null) {
			say('GDAL is not installed: the comparison with it is skipped');
			return;
		}
		const values = new Float32Array(pixels.length * months);
		pixels.forEach(({ column, row }, index) => {
			const sourceRow = bottomUp ? (fromNorth[row] as number) : row;
			for (let month = 0; month < months; month++) {
				values[index * months + month] = air.values[
					month * perMonth + sourceRow * OBSERVED_COLUMNS + column
				] as number;
			}
		});
		const { compared, mismatches } = compareWithGdal(values, output);
		const order = bottomUp ? 'north side up' : 'in the file’s order';
		if (mismatches.length > 0) {
			const first = mismatches[0] as number;
			const pixel = pixels[Math.floor(first / months)] as Pixel;
			throw new Error(
				`${mismatches.length} of ${compared} values differ from GDAL's ${order}, the first in ${MONTH_NAMES[first % months]} at column ${pixel.column}, row ${pixel.row}`,
			);
		}
		say(
			`GDAL agrees bit for bit at all ${compared} values compared ${order} (${pixels.length} points, every month)`,
		);
	}
};

/**
 * Builds the observed temperature file.
 *
 * @param args - The command line's arguments after the script's name.
 * @returns A promise that resolves once the file is written.
 * @throws Error if the source cannot be downloaded or is not as expected,
 * if GDAL disagrees with what is read, or if a value cannot be stored.
 */
export const main = async (args: readonly string[]): Promise<void> => {
	const unknown = args.filter((arg) => arg !== VERIFY_OPTION);
	if (unknown.length > 0) {
		throw new Error(
			`Unknown option ${unknown.join(' ')}: the only option is ${VERIFY_OPTION}`,
		);
	}
	const path = await ensurePinnedFile(OBSERVED_SOURCE, {
		directory: CACHE_DIRECTORY,
		reportEveryBytes: DOWNLOAD_REPORT_BYTES,
	});
	const result = readNetcdf3(readFileSync(path));
	if (!result.ok) {
		throw new Error(
			`${path} cannot be read (${result.error}): ${result.detail}`,
		);
	}
	if (args.includes(VERIFY_OPTION)) {
		verifyWithGdal(path, result.file);
	}

	const months = observedCelsius(result.file);
	let coldest = Number.POSITIVE_INFINITY;
	let warmest = Number.NEGATIVE_INFINITY;
	for (const values of months) {
		for (const celsius of values) {
			coldest = Math.min(coldest, celsius);
			warmest = Math.max(warmest, celsius);
		}
	}
	say(
		`The source runs from ${coldest.toFixed(2)} to ${warmest.toFixed(2)} °C; the file holds ${OBSERVED_BASE_C} to ${OBSERVED_MAX_C} °C in steps of ${OBSERVED_STEP_C}`,
	);
	// Refuses any value that would be clipped.
	const bytes = encodeObservedTemperature(months);

	const stored = decodeObservedTemperature(bytes);
	let largestError = 0;
	months.forEach((values, month) => {
		const back = stored.months[month] as Float32Array;
		values.forEach((celsius, index) => {
			largestError = Math.max(
				largestError,
				Math.abs((back[index] as number) - celsius),
			);
		});
	});
	if (largestError > MAX_QUANTISATION_ERROR_C) {
		throw new Error(
			`A stored value is ${largestError} °C from the source's; at most ${OBSERVED_STEP_C / 2} was expected`,
		);
	}
	say(`Storing moves no value by more than ${largestError.toFixed(4)} °C`);

	mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
	const output = join(OUTPUT_DIRECTORY, OUTPUT_NAME);
	writeFileSync(output, bytes);
	say(`Wrote ${bytes.length} bytes to ${output}`);
};
