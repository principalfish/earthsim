/**
 * Builds `public/data/earth-currents-1deg.bin`, the Earth's observed monthly
 * surface currents, from the Global Drifter Program's drifter-derived
 * climatology of near-surface currents (Laurindo, Mariano and Lumpkin, 2017),
 * regridded from a quarter degree to one degree.
 *
 * Run with `npm run build:observed-currents`. The two sources, the eastward
 * and the northward component, about 87 MB each, are downloaded once into
 * `.cache/observed/` and reused from there, one request for each; they are
 * the netCDF-3 subsets that AOML's ERDDAP server cuts from its monthly means,
 * stamped with the time they were made, so their bytes differ from one
 * download to the next. What is pinned is the SHA-256 of their values, checked
 * at every run, and files whose values differ are deleted. A busy server is
 * waited out. They are read with this project's own netCDF reader, each
 * one-degree cell takes the mean of the quarter-degree cells inside it that
 * have a current, and every component is stored in steps of a thirty-second of a
 * metre a second. The build stops rather than clip a value the steps cannot hold.
 */

import {
	decodeObservedCurrents,
	encodeObservedCurrents,
	OCEAN_CURRENT_MAX_M_PER_S,
	OCEAN_CURRENT_MIN_M_PER_S,
	OCEAN_CURRENT_STEP_M_PER_S,
	OCEAN_VALUES_PER_MONTH,
} from '../src/core/index';
import { assertValuesDigest, float32Sha256 } from './earth/decodedDigest';
import {
	DRIFTER_EASTWARD_SOURCE,
	DRIFTER_EASTWARD_VARIABLE,
	DRIFTER_GRID,
	DRIFTER_NORTHWARD_SOURCE,
	DRIFTER_NORTHWARD_VARIABLE,
	DRIFTER_VALUES_SHA256,
	drifterMonths,
	drifterStored,
} from './earth/oceanSource';
import { regridCurrents } from './earth/regrid';
import {
	checkStoringError,
	dataRangeOf,
	largestDifferenceWithGaps,
} from './earth/storedValues';
import {
	asksForGdal,
	forgetSubset,
	readSubsetSource,
	say,
	writeDataFile,
} from './observedBuild';

const OUTPUT_NAME = 'earth-currents-1deg.bin';

/**
 * Builds the observed currents file.
 *
 * @param args - The command line's arguments after the script's name.
 * @returns A promise that resolves once the file is written.
 * @throws Error if a source cannot be downloaded or is not as expected, or
 * if a value cannot be stored.
 */
export const main = async (args: readonly string[]): Promise<void> => {
	// The comparison with GDAL is not offered: GDAL would read these
	// files' longitude as rows, so there is nothing cheap to compare with.
	if (asksForGdal(args)) {
		throw new Error('The currents build has no comparison with GDAL');
	}
	const eastward = await readSubsetSource(DRIFTER_EASTWARD_SOURCE);
	const northward = await readSubsetSource(DRIFTER_NORTHWARD_SOURCE);
	const digest = float32Sha256([
		drifterStored(eastward.file, DRIFTER_EASTWARD_VARIABLE),
		drifterStored(northward.file, DRIFTER_NORTHWARD_VARIABLE),
	]);
	say(`SHA-256 of the current values: ${digest}`);
	try {
		assertValuesDigest('the drifter currents', digest, DRIFTER_VALUES_SHA256);
	} catch (error) {
		forgetSubset(DRIFTER_EASTWARD_SOURCE);
		forgetSubset(DRIFTER_NORTHWARD_SOURCE);
		throw error;
	}

	const east = drifterMonths(eastward.file, DRIFTER_EASTWARD_VARIABLE);
	const north = drifterMonths(northward.file, DRIFTER_NORTHWARD_VARIABLE);
	const fineEast = dataRangeOf(east);
	const fineNorth = dataRangeOf(north);
	say(
		`The quarter-degree eastward current runs from ${fineEast.low.toFixed(2)} to ${fineEast.high.toFixed(2)} m/s and the northward from ${fineNorth.low.toFixed(2)} to ${fineNorth.high.toFixed(2)} m/s`,
	);
	const regridded = regridCurrents({ east, north }, DRIFTER_GRID);
	const eastRange = dataRangeOf(regridded.east);
	const northRange = dataRangeOf(regridded.north);
	const cells = regridded.east[0]?.filter(
		(value) => !Number.isNaN(value),
	).length;
	say(
		`${cells} of ${OCEAN_VALUES_PER_MONTH} one-degree cells have a current in January; the eastward runs from ${eastRange.low.toFixed(2)} to ${eastRange.high.toFixed(2)} m/s and the northward from ${northRange.low.toFixed(2)} to ${northRange.high.toFixed(2)} m/s; the file holds ${OCEAN_CURRENT_MIN_M_PER_S.toFixed(2)} to ${OCEAN_CURRENT_MAX_M_PER_S.toFixed(2)} m/s in steps of ${OCEAN_CURRENT_STEP_M_PER_S}`,
	);
	// Refuses any value that would be clipped.
	const bytes = encodeObservedCurrents(regridded);
	const stored = decodeObservedCurrents(bytes);
	checkStoringError(
		Math.max(
			largestDifferenceWithGaps(regridded.east, stored.east),
			largestDifferenceWithGaps(regridded.north, stored.north),
		),
		OCEAN_CURRENT_STEP_M_PER_S,
		'current',
		'm/s',
		say,
	);
	writeDataFile(OUTPUT_NAME, bytes);
};
