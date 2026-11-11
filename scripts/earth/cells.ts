/**
 * Averaging a global raster of elevations into the cells of the grid, and
 * writing the cell means as the bytes of the Earth data file.
 *
 * The raster is a plain latitude and longitude one that covers the whole
 * globe: column 0 starts at 180° west and columns run east, row 0 starts at
 * the north pole and rows run south, and every pixel stands for the area it
 * covers. Each pixel goes to the cell that holds its centre, and counts in
 * that cell's mean by its area on the sphere, since pixels narrow towards
 * the poles.
 */

import {
	cellAt,
	EARTH_DATA_BYTES,
	EARTH_DATA_CELLS,
	getGrid,
	latLonToDirection,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
} from '../../src/core/index';

/** The raster being averaged. */
export type RasterShape = {
	/** Pixels across: the whole 360° of longitude. */
	readonly width: number;
	/** Pixels down: the whole 180° of latitude. */
	readonly height: number;
	/** The value of a pixel that holds no elevation, or null if none does. */
	readonly noData: number | null;
};

/** A rectangle of the raster's pixels. */
export type PixelBlock = {
	/** The pixels, row by row from the block's top-left corner. */
	readonly values: Float32Array;
	/** The distance in `values` from one row's start to the next. */
	readonly stride: number;
	/** The raster column of the block's first column. */
	readonly column: number;
	/** The raster row of the block's first row. */
	readonly row: number;
	/** Pixels across the block; no more than `stride`. */
	readonly columns: number;
	/** Pixels down the block. */
	readonly rows: number;
};

/** What averaging a raster into cells gives. */
export type CellAverages = {
	/** Mean elevation of each cell, in the raster's unit. */
	readonly means: Float64Array;
	/** The number of pixels each cell's mean was taken over. */
	readonly pixelCounts: Uint32Array;
	/** Pixels that counted towards a mean. */
	readonly pixels: number;
	/** Pixels left out because they held no elevation. */
	readonly noDataPixels: number;
};

/** Collects a raster's pixels and averages them by cell. */
export type CellAverager = {
	/**
	 * Adds a block of pixels. Every pixel of the raster is to be added once.
	 *
	 * @throws RangeError if the block reaches outside the raster or its
	 * values are too few for its size.
	 */
	add(block: PixelBlock): void;
	/**
	 * The mean of every cell over the pixels added so far.
	 *
	 * @throws Error if a cell has received no pixel.
	 */
	finish(): CellAverages;
};

/** The smallest, middle and largest of a set of counts. */
export type CountSummary = {
	readonly min: number;
	readonly median: number;
	readonly max: number;
};

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * Starts averaging a raster into the cells of a grid.
 *
 * @remarks
 * A pixel's cell is the one `cellAt` gives for the direction of the pixel's
 * centre, so the data lands on the grid exactly as everything else that
 * looks a place up by latitude and longitude will find it. The sines and
 * cosines are worked out once for each row and column rather than for each
 * pixel, from `latLonToDirection` itself, so the direction of a pixel is
 * the very one that function gives.
 *
 * A pixel's weight is its area on the sphere, which for a pixel between two
 * latitudes is in proportion to the difference of their sines.
 *
 * The centre of a pixel can lie exactly on the line between two cells, as
 * whole columns of an arc-minute raster do on the finest grid. Rounding
 * then decides which of the two cells the pixel goes to, and it counts in
 * that one alone.
 *
 * A pixel equal to the raster's no-data value, or holding NaN, is counted
 * and left out.
 *
 * @param resolution - Cells along a face edge of the grid.
 * @param raster - The size of the raster and its no-data value.
 * @throws RangeError if the resolution is not supported or the raster has
 * no pixels.
 */
export const createCellAverager = (
	resolution: number,
	raster: RasterShape,
): CellAverager => {
	const grid = getGrid(resolution);
	const { width, height, noData } = raster;
	if (
		!(Number.isInteger(width) && Number.isInteger(height)) ||
		width < 1 ||
		height < 1
	) {
		throw new RangeError(
			`A raster needs a whole number of pixels each way; got ${width} × ${height}`,
		);
	}

	const cosLongitude = new Float64Array(width);
	const sinLongitude = new Float64Array(width);
	for (let column = 0; column < width; column++) {
		const [x, y] = latLonToDirection(0, ((column + 0.5) / width) * 360 - 180);
		cosLongitude[column] = x;
		sinLongitude[column] = y;
	}
	const cosLatitude = new Float64Array(height);
	const sinLatitude = new Float64Array(height);
	const rowWeight = new Float64Array(height);
	for (let row = 0; row < height; row++) {
		const [x, , z] = latLonToDirection(90 - ((row + 0.5) / height) * 180, 0);
		cosLatitude[row] = x;
		sinLatitude[row] = z;
		rowWeight[row] =
			Math.sin((90 - (row / height) * 180) * RADIANS_PER_DEGREE) -
			Math.sin((90 - ((row + 1) / height) * 180) * RADIANS_PER_DEGREE);
	}

	const sums = new Float64Array(grid.cellCount);
	const weights = new Float64Array(grid.cellCount);
	const pixelCounts = new Uint32Array(grid.cellCount);
	let pixels = 0;
	let noDataPixels = 0;

	return {
		add: ({ values, stride, column, row, columns, rows }) => {
			const inside =
				column >= 0 &&
				row >= 0 &&
				columns >= 0 &&
				rows >= 0 &&
				column + columns <= width &&
				row + rows <= height &&
				columns <= stride;
			if (!inside || values.length < (rows - 1) * stride + columns) {
				throw new RangeError(
					`A block of ${columns} × ${rows} pixels at column ${column}, row ${row} does not fit a raster of ${width} × ${height}, or its ${values.length} values are too few`,
				);
			}
			for (let dy = 0; dy < rows; dy++) {
				const y = row + dy;
				const cosLat = cosLatitude[y] as number;
				const sinLat = sinLatitude[y] as number;
				const weight = rowWeight[y] as number;
				const start = dy * stride;
				for (let dx = 0; dx < columns; dx++) {
					const value = values[start + dx] as number;
					if (value === noData || Number.isNaN(value)) {
						noDataPixels++;
						continue;
					}
					const x = column + dx;
					const cell = cellAt(grid, [
						cosLat * (cosLongitude[x] as number),
						cosLat * (sinLongitude[x] as number),
						sinLat,
					]);
					sums[cell] = (sums[cell] as number) + weight * value;
					weights[cell] = (weights[cell] as number) + weight;
					pixelCounts[cell] = (pixelCounts[cell] as number) + 1;
					pixels++;
				}
			}
		},
		finish: () => {
			const means = new Float64Array(grid.cellCount);
			for (let cell = 0; cell < grid.cellCount; cell++) {
				if (pixelCounts[cell] === 0) {
					throw new Error(
						`Cell ${cell} received no pixel, so it has no mean elevation`,
					);
				}
				means[cell] = (sums[cell] as number) / (weights[cell] as number);
			}
			return {
				means,
				pixelCounts: pixelCounts.slice(),
				pixels,
				noDataPixels,
			};
		},
	};
};

/**
 * The smallest, middle and largest of a set of counts.
 *
 * @param counts - At least one count. It is not changed.
 * @returns The extremes and the median: the upper of the two middle counts
 * when their number is even.
 * @throws RangeError if there are no counts.
 */
export const summariseCounts = (counts: Uint32Array): CountSummary => {
	if (counts.length === 0) {
		throw new RangeError('There are no counts to summarise');
	}
	const sorted = counts.slice().sort();
	return {
		min: sorted[0] as number,
		median: sorted[sorted.length >> 1] as number,
		max: sorted[sorted.length - 1] as number,
	};
};

/**
 * The bytes of the Earth data file for a set of cell means.
 *
 * @remarks
 * Each mean is rounded to the nearest whole metre and written as a signed
 * 16-bit integer, little-endian, in cell order: what the core's
 * `decodeEarth` reads back.
 *
 * @param means - Mean elevation of each cell of the Earth data's grid, in
 * metres.
 * @returns The bytes, {@link EARTH_DATA_BYTES} long.
 * @throws RangeError if there is not one mean for each cell of that grid,
 * or one is not finite or lies outside the elevations a cell can hold.
 */
export const encodeEarth = (means: Float64Array): Uint8Array<ArrayBuffer> => {
	if (means.length !== EARTH_DATA_CELLS) {
		throw new RangeError(
			`The Earth data holds ${EARTH_DATA_CELLS} cells; got ${means.length} means`,
		);
	}
	const bytes = new Uint8Array(EARTH_DATA_BYTES);
	const view = new DataView(bytes.buffer);
	for (let cell = 0; cell < EARTH_DATA_CELLS; cell++) {
		const metres = Math.round(means[cell] as number);
		// The limits a cell can hold lie well inside the 16-bit range, and
		// the comparison is false for NaN.
		if (!(metres >= MIN_ELEVATION_M && metres <= MAX_ELEVATION_M)) {
			throw new RangeError(
				`Cell ${cell} has a mean elevation of ${means[cell]} m, outside ${MIN_ELEVATION_M} to ${MAX_ELEVATION_M} m`,
			);
		}
		view.setInt16(cell * 2, metres, true);
	}
	return bytes;
};
