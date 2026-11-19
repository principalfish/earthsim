/**
 * Comparing what this project's netCDF reader reads from the sea-surface
 * temperature files with what GDAL's `gdallocationinfo` reads from the same
 * files.
 */

import { execFileSync } from 'node:child_process';
import {
	compareWithGdal,
	gdalLocationInput,
	isNotFound,
} from './earth/gdalCheck';
import { findVariable, type NetcdfFile } from './earth/netcdf';
import { oceanPixels, valuesAtPixels } from './earth/oceanGdal';

/** The most `gdallocationinfo` may print before it is cut off, in bytes. */
const GDAL_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/**
 * Compares what this project's reader reads from a file of the ocean grid
 * with what GDAL reads, at a spread of points and for every time.
 *
 * @remarks
 * GDAL is asked for the file's rows in the file's own order, which the
 * caller has checked run from the north. Where GDAL is not installed, that is
 * said instead and nothing is compared.
 *
 * @param path - The file.
 * @param file - The same file as this project's reader read it.
 * @param variable - The name of the variable to compare.
 * @param say - Where each line of the outcome is written.
 * @returns Whether the comparison was made: false if GDAL is not installed.
 * @throws Error if the file has no such variable or any value differs.
 */
export const verifyOceanWithGdal = (
	path: string,
	file: NetcdfFile,
	variable: string,
	say: (line: string) => void,
): boolean => {
	const stored = findVariable(file, variable);
	if (stored === undefined) {
		throw new Error(`The file has no variable ${variable}`);
	}
	const times = stored.shape[0] as number;
	const pixels = oceanPixels();
	let output: string;
	try {
		output = execFileSync(
			'gdallocationinfo',
			[
				'--config',
				'GDAL_NETCDF_BOTTOMUP',
				'NO',
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
			say('GDAL is not installed: the comparison with it is skipped');
			return false;
		}
		throw error;
	}
	const comparison = compareWithGdal(
		valuesAtPixels(stored.values, pixels, times),
		output,
	);
	if (comparison.mismatches.length > 0) {
		throw new Error(
			`${comparison.mismatches.length} of ${comparison.compared} values of ${variable} differ from GDAL's`,
		);
	}
	say(
		`${variable}: GDAL agrees bit for bit at all ${comparison.compared} values compared (${pixels.length} points, every time)`,
	);
	return true;
};
