/**
 * Checking this project's netCDF reader against GDAL on the sea-surface
 * temperature files: which points to compare and the values the reader gives
 * there.
 *
 * Each file holds one variable by time, row and column on the ocean grid of
 * 180 rows from the north and 360 columns. GDAL reads it as an image of 360 ×
 * 180 pixels with a band for each time, and `gdallocationinfo -valonly`
 * prints every band's value at a pixel, the first time first, each on a line
 * of its own. The files' rows run from the north, so GDAL's image and the
 * file are in the same order.
 */

import { OCEAN_COLUMNS, OCEAN_ROWS } from '../../src/core/index';
import { type Pixel, samplePixels } from './gdalCheck';

/** Points compared with GDAL beyond the fixed ones, and their seed. */
const GDAL_RANDOM_POINTS = 2000;
const GDAL_SAMPLE_SEED = 1991;

/**
 * The points at which to compare a file of the ocean grid with GDAL: the
 * corners and edges of the grid, and others at random, always the same ones.
 *
 * @returns The points, each once, as pixels of the grid.
 */
export const oceanPixels = (): Pixel[] =>
	samplePixels(
		{
			width: OCEAN_COLUMNS,
			height: OCEAN_ROWS,
			tileWidth: OCEAN_COLUMNS,
			tileHeight: OCEAN_ROWS,
		},
		{ randomCount: GDAL_RANDOM_POINTS, seed: GDAL_SAMPLE_SEED },
	);

/**
 * The values of a variable at some points, as GDAL would print them: every
 * time at the first point, then every time at the next.
 *
 * @param values - The variable's values as stored, time by time, then row by
 * row, then column by column.
 * @param pixels - The points.
 * @param times - How many times the variable has.
 * @returns `times` values for each point.
 */
export const valuesAtPixels = (
	values: ArrayLike<number>,
	pixels: readonly Pixel[],
	times: number,
): Float32Array => {
	const perTime = OCEAN_ROWS * OCEAN_COLUMNS;
	const out = new Float32Array(pixels.length * times);
	pixels.forEach(({ column, row }, index) => {
		for (let time = 0; time < times; time++) {
			out[index * times + time] = values[
				time * perTime + row * OCEAN_COLUMNS + column
			] as number;
		}
	});
	return out;
};
