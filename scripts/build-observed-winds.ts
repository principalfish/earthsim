/**
 * Builds `public/data/earth-wind-1deg.bin` and
 * `public/data/earth-pressure-1deg.bin`, the Earth's observed monthly
 * surface winds and sea-level pressure, from NOAA's Twentieth Century
 * Reanalysis version 3.
 *
 * Run with `npm run build:observed-winds`. The three source files, the
 * eastward and the northward wind and the pressure, about 11 MB in all, are
 * downloaded once into `.cache/observed/` and reused from there. Each one's
 * length and SHA-256 are checked against those pinned for NOAA's file
 * before it is read, at every run, and a file that differs is deleted. They
 * are read with this project's own netCDF reader, the pressure turned into
 * hectopascals, and laid out north to south, and every value is stored in
 * quarter steps of a metre a second or half steps of a hectopascal on the
 * sources' own one-degree grid. The build stops rather than clip a value
 * the steps cannot hold.
 *
 * With `--verify-with-gdal`, the values this script's reader gives are
 * first compared with what GDAL's `gdallocationinfo` reads from the same
 * files, for every month of each, and the build stops if any differs. Where
 * GDAL is not installed the comparison is skipped with a note.
 */

import {
	decodeObservedPressure,
	decodeObservedWind,
	encodeObservedPressure,
	encodeObservedWind,
	OBSERVED_PRESSURE_BASE_HPA,
	OBSERVED_PRESSURE_MAX_HPA,
	OBSERVED_PRESSURE_STEP_HPA,
	OBSERVED_WIND_MAX_M_PER_S,
	OBSERVED_WIND_MIN_M_PER_S,
	OBSERVED_WIND_STEP_M_PER_S,
} from '../src/core/index';
import {
	OBSERVED_EASTWARD_WIND_SOURCE,
	OBSERVED_EASTWARD_WIND_VARIABLE,
	OBSERVED_NORTHWARD_WIND_SOURCE,
	OBSERVED_NORTHWARD_WIND_VARIABLE,
	OBSERVED_PRESSURE_SOURCE,
	OBSERVED_PRESSURE_VARIABLE,
	observedEastwardWind,
	observedHectopascals,
	observedNorthwardWind,
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

const WIND_OUTPUT_NAME = 'earth-wind-1deg.bin';
const PRESSURE_OUTPUT_NAME = 'earth-pressure-1deg.bin';

/**
 * Builds the observed wind and pressure files.
 *
 * @param args - The command line's arguments after the script's name.
 * @returns A promise that resolves once both files are written.
 * @throws Error if a source cannot be downloaded or is not as expected, if
 * GDAL disagrees with what is read, or if a value cannot be stored.
 */
export const main = async (args: readonly string[]): Promise<void> => {
	const verify = asksForGdal(args);
	const eastward = await readObservedSource(OBSERVED_EASTWARD_WIND_SOURCE);
	const northward = await readObservedSource(OBSERVED_NORTHWARD_WIND_SOURCE);
	const pressure = await readObservedSource(OBSERVED_PRESSURE_SOURCE);
	if (verify) {
		for (const [{ path, file }, variable] of [
			[eastward, OBSERVED_EASTWARD_WIND_VARIABLE],
			[northward, OBSERVED_NORTHWARD_WIND_VARIABLE],
			[pressure, OBSERVED_PRESSURE_VARIABLE],
		] as const) {
			const compared = verifyObservedWithGdal(path, file, variable, (line) =>
				say(`${variable}: ${line}`),
			);
			if (!compared) {
				break;
			}
		}
	}

	const east = observedEastwardWind(eastward.file);
	const north = observedNorthwardWind(northward.file);
	const eastRange = rangeOf(east);
	const northRange = rangeOf(north);
	say(
		`The eastward wind runs from ${eastRange.low.toFixed(2)} to ${eastRange.high.toFixed(2)} m/s and the northward from ${northRange.low.toFixed(2)} to ${northRange.high.toFixed(2)} m/s; the file holds ${OBSERVED_WIND_MIN_M_PER_S} to ${OBSERVED_WIND_MAX_M_PER_S} m/s in steps of ${OBSERVED_WIND_STEP_M_PER_S}`,
	);
	// Refuses any value that would be clipped.
	const windBytes = encodeObservedWind({ east, north });
	const storedWind = decodeObservedWind(windBytes);
	checkStoringError(
		Math.max(
			largestDifference(east, storedWind.east),
			largestDifference(north, storedWind.north),
		),
		OBSERVED_WIND_STEP_M_PER_S,
		'wind',
		'm/s',
		say,
	);

	const hectopascals = observedHectopascals(pressure.file);
	const pressureRange = rangeOf(hectopascals);
	say(
		`The pressure runs from ${pressureRange.low.toFixed(2)} to ${pressureRange.high.toFixed(2)} hPa; the file holds ${OBSERVED_PRESSURE_BASE_HPA} to ${OBSERVED_PRESSURE_MAX_HPA} hPa in steps of ${OBSERVED_PRESSURE_STEP_HPA}`,
	);
	// Refuses any value that would be clipped.
	const pressureBytes = encodeObservedPressure(hectopascals);
	checkStoringError(
		largestDifference(
			hectopascals,
			decodeObservedPressure(pressureBytes).months,
		),
		OBSERVED_PRESSURE_STEP_HPA,
		'pressure',
		'hPa',
		say,
	);

	writeDataFile(WIND_OUTPUT_NAME, windBytes);
	writeDataFile(PRESSURE_OUTPUT_NAME, pressureBytes);
};
