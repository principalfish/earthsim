/**
 * Builds `public/data/earth-sea-temperature-1deg.bin`, the Earth's observed
 * monthly sea-surface temperature, from NOAA's Optimum Interpolation Sea
 * Surface Temperature version 2, its 1991 to 2020 long-term monthly mean.
 *
 * Run with `npm run build:observed-sea-temperature`. Two sources are
 * downloaded once into `.cache/observed/` and reused from there: the
 * temperature, as the netCDF-3 subset NOAA's THREDDS server cuts from its
 * netCDF-4 file, about 3 MB, and the dataset's land-sea mask, 134 kB. The
 * server stamps each subset with the time it was made, so its bytes differ
 * from one download to the next; what is pinned is the SHA-256 of its
 * values, checked at every run, and a file whose values differ is deleted.
 * The mask is pinned by the SHA-256 of the file. A busy server is waited
 * out. They are read with this project's own netCDF reader; a cell is land
 * where the mask says so, which the temperature file, having a value in every
 * cell, does not, and every value is stored in quarter-degree steps
 * on the sources' own grid of degree-wide cells. The build stops rather than
 * clip a value the steps cannot hold.
 *
 * With `--verify-with-gdal`, the values this script's reader gives are
 * first compared with what GDAL's `gdallocationinfo` reads from the same
 * files, for every month, and the build stops if any differs. Where GDAL is
 * not installed the comparison is skipped with a note.
 */

import {
	decodeObservedSeaTemperature,
	encodeObservedSeaTemperature,
	OCEAN_VALUES_PER_MONTH,
	SEA_TEMPERATURE_MAX_C,
	SEA_TEMPERATURE_MIN_C,
	SEA_TEMPERATURE_STEP_C,
} from '../src/core/index';
import { assertValuesDigest, float32Sha256 } from './earth/decodedDigest';
import {
	LAND_SEA_MASK_SOURCE,
	LAND_SEA_MASK_VARIABLE,
	observedSeaCelsius,
	SEA_TEMPERATURE_SOURCE,
	SEA_TEMPERATURE_VALUES_SHA256,
	SEA_TEMPERATURE_VARIABLE,
	seaTemperatureStored,
} from './earth/oceanSource';
import {
	checkStoringError,
	dataRangeOf,
	largestDifferenceWithGaps,
} from './earth/storedValues';
import {
	asksForGdal,
	forgetSubset,
	readObservedSource,
	readSubsetSource,
	say,
	writeDataFile,
} from './observedBuild';
import { verifyOceanWithGdal } from './oceanGdalRun';

const OUTPUT_NAME = 'earth-sea-temperature-1deg.bin';

/**
 * Builds the observed sea-surface temperature file.
 *
 * @param args - The command line's arguments after the script's name.
 * @returns A promise that resolves once the file is written.
 * @throws Error if a source cannot be downloaded or is not as expected, if
 * GDAL disagrees with what is read, or if a value cannot be stored.
 */
export const main = async (args: readonly string[]): Promise<void> => {
	const verify = asksForGdal(args);
	const temperature = await readSubsetSource(SEA_TEMPERATURE_SOURCE);
	const digest = float32Sha256([seaTemperatureStored(temperature.file)]);
	say(`SHA-256 of the temperature values: ${digest}`);
	try {
		assertValuesDigest(
			SEA_TEMPERATURE_SOURCE.name,
			digest,
			SEA_TEMPERATURE_VALUES_SHA256,
		);
	} catch (error) {
		forgetSubset(SEA_TEMPERATURE_SOURCE);
		throw error;
	}
	const mask = await readObservedSource(LAND_SEA_MASK_SOURCE);
	// Checks the layout, which the comparison with GDAL relies on.
	const months = observedSeaCelsius(temperature.file, mask.file);
	if (verify) {
		const compared =
			verifyOceanWithGdal(
				temperature.path,
				temperature.file,
				SEA_TEMPERATURE_VARIABLE,
				say,
			) &&
			verifyOceanWithGdal(mask.path, mask.file, LAND_SEA_MASK_VARIABLE, say);
		if (!compared) {
			say('The comparison with GDAL was not made');
		}
	}
	const range = dataRangeOf(months);
	const seaCells = months[0]?.filter((value) => !Number.isNaN(value)).length;
	say(
		`${seaCells} of ${OCEAN_VALUES_PER_MONTH} cells are sea, with temperatures from ${range.low.toFixed(2)} to ${range.high.toFixed(2)} °C; the file holds ${SEA_TEMPERATURE_MIN_C} to ${SEA_TEMPERATURE_MAX_C.toFixed(1)} °C in steps of ${SEA_TEMPERATURE_STEP_C}`,
	);
	// Refuses any value that would be clipped.
	const bytes = encodeObservedSeaTemperature(months);
	checkStoringError(
		largestDifferenceWithGaps(
			months,
			decodeObservedSeaTemperature(bytes).months,
		),
		SEA_TEMPERATURE_STEP_C,
		'temperature',
		'°C',
		say,
	);
	writeDataFile(OUTPUT_NAME, bytes);
};
