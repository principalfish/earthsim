/**
 * Checking this project's netCDF reader against GDAL on the observed
 * sources: which points to compare, the values the reader gives there, and
 * what to say of the comparison.
 *
 * Each source holds one variable by month, row and column on the observed
 * one-degree grid. GDAL reads it as an image of {@link OBSERVED_COLUMNS} ×
 * {@link OBSERVED_ROWS} pixels with a band for each month, and
 * `gdallocationinfo -valonly` prints every band's value at a pixel, January
 * first, each on a line of its own. By default GDAL turns the rows over so
 * that the image is north side up; asked not to, it gives the file's rows
 * in the file's own order.
 */

import {
	MONTH_NAMES,
	MONTHS_PER_YEAR,
	OBSERVED_COLUMNS,
	OBSERVED_ROWS,
} from '../../src/core/index';
import { type GdalComparison, type Pixel, samplePixels } from './gdalCheck';

/** Points compared with GDAL beyond the fixed ones, and their seed. */
const GDAL_RANDOM_POINTS = 2000;
const GDAL_SAMPLE_SEED = 1981;

/**
 * The points at which to compare a source with GDAL: the corners and the
 * edges of the grid, and others at random, always the same ones.
 *
 * @returns The points, each once, as pixels of the grid.
 */
export const observedPixels = (): Pixel[] =>
	samplePixels(
		{
			width: OBSERVED_COLUMNS,
			height: OBSERVED_ROWS,
			tileWidth: OBSERVED_COLUMNS,
			tileHeight: OBSERVED_ROWS,
		},
		{ randomCount: GDAL_RANDOM_POINTS, seed: GDAL_SAMPLE_SEED },
	);

/**
 * The values of a source's variable at some points, as GDAL would print
 * them: every month at the first point, then every month at the next.
 *
 * @param values - The variable's values as stored, month by month, then
 * row by row as the file has them, then column by column.
 * @param pixels - The points, with rows counted as GDAL counts them.
 * @param rowsFromNorth - For GDAL north side up, the file's row for each
 * row from the north, as `rowsFromNorth` of the source finds them; null for
 * GDAL with the file's rows in the file's own order.
 * @returns {@link MONTH_NAMES} values for each point.
 */
export const monthlyValuesAt = (
	values: ArrayLike<number>,
	pixels: readonly Pixel[],
	rowsFromNorth: readonly number[] | null,
): Float32Array => {
	const perMonth = OBSERVED_ROWS * OBSERVED_COLUMNS;
	const out = new Float32Array(pixels.length * MONTHS_PER_YEAR);
	pixels.forEach(({ column, row }, index) => {
		const sourceRow =
			rowsFromNorth === null ? row : (rowsFromNorth[row] as number);
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			out[index * MONTHS_PER_YEAR + month] = values[
				month * perMonth + sourceRow * OBSERVED_COLUMNS + column
			] as number;
		}
	});
	return out;
};

/** How GDAL was asked to lay out the rows, as the messages name it. */
const orderName = (northSideUp: boolean): string =>
	northSideUp ? 'north side up' : 'in the file’s order';

/**
 * What to say of a comparison with GDAL in which no value differed.
 *
 * @param comparison - The comparison of {@link monthlyValuesAt}'s values.
 * @param pointCount - The points compared.
 * @param northSideUp - Whether GDAL turned the rows north side up.
 */
export const gdalAgreement = (
	comparison: GdalComparison,
	pointCount: number,
	northSideUp: boolean,
): string =>
	`GDAL agrees bit for bit at all ${comparison.compared} values compared ${orderName(northSideUp)} (${pointCount} points, every month)`;

/**
 * What to say of a comparison with GDAL in which some values differed:
 * how many, and the month and point of the first.
 *
 * @param comparison - The comparison of {@link monthlyValuesAt}'s values,
 * with at least one mismatch.
 * @param pixels - The points compared, in the order compared.
 * @param northSideUp - Whether GDAL turned the rows north side up.
 */
export const gdalDisagreement = (
	comparison: GdalComparison,
	pixels: readonly Pixel[],
	northSideUp: boolean,
): string => {
	const { compared, mismatches } = comparison;
	const first = mismatches[0] as number;
	const pixel = pixels[Math.floor(first / MONTHS_PER_YEAR)] as Pixel;
	return `${mismatches.length} of ${compared} values differ from GDAL's ${orderName(northSideUp)}, the first in ${MONTH_NAMES[first % MONTHS_PER_YEAR]} at column ${pixel.column}, row ${pixel.row}`;
};
