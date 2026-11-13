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

import {
	decodeObservedTemperature,
	encodeObservedTemperature,
	OBSERVED_BASE_C,
	OBSERVED_MAX_C,
	OBSERVED_STEP_C,
} from '../src/core/index';
import {
	OBSERVED_SOURCE,
	OBSERVED_VARIABLE,
	observedCelsius,
} from './earth/observedSource';
import {
	checkStoringError,
	largestDifference,
	rangeOf,
} from './earth/storedValues';
import {
	asksForGdal,
	readObservedSource,
	say,
	writeDataFile,
} from './observedBuild';
import { verifyObservedWithGdal } from './observedGdalRun';

const OUTPUT_NAME = 'earth-temperature-1deg.bin';

/**
 * Builds the observed temperature file.
 *
 * @param args - The command line's arguments after the script's name.
 * @returns A promise that resolves once the file is written.
 * @throws Error if the source cannot be downloaded or is not as expected,
 * if GDAL disagrees with what is read, or if a value cannot be stored.
 */
export const main = async (args: readonly string[]): Promise<void> => {
	const verify = asksForGdal(args);
	const { path, file } = await readObservedSource(OBSERVED_SOURCE);
	if (verify) {
		verifyObservedWithGdal(path, file, OBSERVED_VARIABLE, say);
	}

	const months = observedCelsius(file);
	const { low, high } = rangeOf(months);
	say(
		`The source runs from ${low.toFixed(2)} to ${high.toFixed(2)} °C; the file holds ${OBSERVED_BASE_C} to ${OBSERVED_MAX_C} °C in steps of ${OBSERVED_STEP_C}`,
	);
	// Refuses any value that would be clipped.
	const bytes = encodeObservedTemperature(months);
	checkStoringError(
		largestDifference(months, decodeObservedTemperature(bytes).months),
		OBSERVED_STEP_C,
		'value',
		'°C',
		say,
	);
	writeDataFile(OUTPUT_NAME, bytes);
};
