/**
 * Comparing what this project's netCDF reader reads from an observed source
 * with what GDAL's `gdallocationinfo` reads from the same file, for the
 * builds of the observed data.
 */

import { execFileSync } from 'node:child_process';
import {
	compareWithGdal,
	gdalLocationInput,
	isNotFound,
	type Pixel,
} from './earth/gdalCheck';
import { findVariable, type NetcdfFile } from './earth/netcdf';
import {
	gdalAgreement,
	gdalDisagreement,
	monthlyValuesAt,
	observedPixels,
} from './earth/observedGdal';
import { rowsFromNorth } from './earth/observedSource';

/** The most `gdallocationinfo` may print before it is cut off, in bytes. */
const GDAL_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/**
 * What `gdallocationinfo` prints for points of a source file: a value for
 * each month, January first, on a line of its own, for each point in turn;
 * or null if GDAL is not installed.
 *
 * @param northSideUp - Whether GDAL is to turn the file's rows over so that
 * its first line is the northernmost, as it does by default; otherwise its
 * lines are the file's rows in the file's own order.
 */
const gdalValues = (
	path: string,
	variable: string,
	pixels: readonly Pixel[],
	northSideUp: boolean,
): string | null => {
	try {
		return execFileSync(
			'gdallocationinfo',
			[
				'--config',
				'GDAL_NETCDF_BOTTOMUP',
				northSideUp ? 'YES' : 'NO',
				'-valonly',
				`NETCDF:"${path}":${variable}`,
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
 * Compares what this project's reader reads from a source file with what
 * GDAL reads, at a spread of points and for every month.
 *
 * @remarks
 * GDAL is asked twice: once with the file's rows as they are, which checks
 * the reader value for value, and once turned north side up, which checks
 * that the rows are put the right way round. Where GDAL is not installed,
 * that is said instead and nothing is compared.
 *
 * @param path - The source file.
 * @param file - The same file as this project's reader read it.
 * @param variable - The name of the variable to compare.
 * @param say - Where each line of the outcome is written.
 * @returns Whether the comparison was made: false if GDAL is not installed.
 * @throws Error if the file has no such variable or no whole-degree
 * latitudes, or if any value differs.
 */
export const verifyObservedWithGdal = (
	path: string,
	file: NetcdfFile,
	variable: string,
	say: (line: string) => void,
): boolean => {
	const stored = findVariable(file, variable);
	const fromNorth = rowsFromNorth([
		...(findVariable(file, 'lat')?.values ?? []),
	]);
	if (stored === undefined || fromNorth === null) {
		throw new Error('The file is not laid out for comparing with GDAL');
	}
	const pixels = observedPixels();
	for (const northSideUp of [false, true]) {
		const output = gdalValues(path, variable, pixels, northSideUp);
		if (output === null) {
			say('GDAL is not installed: the comparison with it is skipped');
			return false;
		}
		const comparison = compareWithGdal(
			monthlyValuesAt(stored.values, pixels, northSideUp ? fromNorth : null),
			output,
		);
		if (comparison.mismatches.length > 0) {
			throw new Error(gdalDisagreement(comparison, pixels, northSideUp));
		}
		say(gdalAgreement(comparison, pixels.length, northSideUp));
	}
	return true;
};
