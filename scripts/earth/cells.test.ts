import { describe, expect, it } from 'vitest';
import {
	cellAt,
	decodeEarth,
	EARTH_DATA_BYTES,
	EARTH_DATA_CELLS,
	getGrid,
	latLonToDirection,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
} from '../../src/core/index';
import {
	createCellAverager,
	encodeEarth,
	type RasterShape,
	summariseCounts,
} from './cells';

const RESOLUTION = 64;
const CELL_COUNT = 6 * RESOLUTION * RESOLUTION;

/**
 * Pixels of about half a degree: several to every cell of the coarsest grid.
 * With 768 across, no pixel's centre lies exactly on the line between two
 * cells, where the last bit of a sum would decide its cell.
 */
const WIDTH = 768;
const HEIGHT = 384;
const RASTER: RasterShape = { width: WIDTH, height: HEIGHT, noData: -99_999 };
const PLAIN_RASTER: RasterShape = { ...RASTER, noData: null };
const PIXEL_DEG = 360 / WIDTH;

/** A value for every pixel that changes with both latitude and longitude. */
const pixelValue = (column: number, row: number): number =>
	Math.fround(
		3000 * Math.sin(column / 37) * Math.cos(row / 23) - row * 7.5 + column,
	);

const rasterValues = (raster: RasterShape): Float32Array => {
	const values = new Float32Array(raster.width * raster.height);
	for (let row = 0; row < raster.height; row++) {
		for (let column = 0; column < raster.width; column++) {
			values[row * raster.width + column] = pixelValue(column, row);
		}
	}
	return values;
};

/** The whole raster as one block. */
const wholeBlock = (raster: RasterShape, values: Float32Array) => ({
	values,
	stride: raster.width,
	column: 0,
	row: 0,
	columns: raster.width,
	rows: raster.height,
});

describe('createCellAverager', () => {
	it('gives each cell the area-weighted mean of the pixels centred in it', () => {
		const values = rasterValues(RASTER);
		const averager = createCellAverager(RESOLUTION, RASTER);
		averager.add(wholeBlock(RASTER, values));
		const { means, pixelCounts, pixels, noDataPixels } = averager.finish();

		// Worked out again the plain way: the centre of each pixel in
		// degrees, the cell the grid gives for it, and the pixel's exact
		// area between its two latitudes.
		const grid = getGrid(RESOLUTION);
		const sums = new Float64Array(CELL_COUNT);
		const weights = new Float64Array(CELL_COUNT);
		const counts = new Uint32Array(CELL_COUNT);
		const radians = Math.PI / 180;
		for (let row = 0; row < RASTER.height; row++) {
			const north = 90 - row * PIXEL_DEG;
			const weight =
				Math.sin(north * radians) - Math.sin((north - PIXEL_DEG) * radians);
			for (let column = 0; column < RASTER.width; column++) {
				const cell = cellAt(
					grid,
					latLonToDirection(
						north - PIXEL_DEG / 2,
						-180 + (column + 0.5) * PIXEL_DEG,
					),
				);
				sums[cell] =
					(sums[cell] as number) +
					weight * (values[row * RASTER.width + column] as number);
				weights[cell] = (weights[cell] as number) + weight;
				counts[cell] = (counts[cell] as number) + 1;
			}
		}

		expect(pixels).toBe(RASTER.width * RASTER.height);
		expect(noDataPixels).toBe(0);
		expect(means.length).toBe(CELL_COUNT);
		expect(pixelCounts).toEqual(counts);
		for (let cell = 0; cell < CELL_COUNT; cell++) {
			expect(means[cell]).toBeCloseTo(
				(sums[cell] as number) / (weights[cell] as number),
				9,
			);
		}
	});

	it('weights pixels by area, not by number', () => {
		// The cell holding the north pole takes in whole rows of pixels
		// that shrink towards the pole. With each row holding its own
		// number, a plain mean of the pixels would differ from the mean by
		// area.
		const raster = PLAIN_RASTER;
		const values = new Float32Array(raster.width * raster.height);
		for (let row = 0; row < raster.height; row++) {
			values.fill(row * 100, row * raster.width, (row + 1) * raster.width);
		}
		const averager = createCellAverager(RESOLUTION, raster);
		averager.add(wholeBlock(raster, values));
		const { means, pixelCounts } = averager.finish();

		const grid = getGrid(RESOLUTION);
		const pole = cellAt(grid, latLonToDirection(89.9, 45));
		let plainSum = 0;
		for (let row = 0; row < raster.height; row++) {
			for (let column = 0; column < raster.width; column++) {
				const direction = latLonToDirection(
					90 - (row + 0.5) * PIXEL_DEG,
					-180 + (column + 0.5) * PIXEL_DEG,
				);
				if (cellAt(grid, direction) === pole) {
					plainSum += row * 100;
				}
			}
		}
		const plainMean = plainSum / (pixelCounts[pole] as number);
		expect(pixelCounts[pole]).toBeGreaterThan(100);
		expect(means[pole]).toBeGreaterThan(plainMean + 5);
	});

	it('gives a level raster the same level in every cell', () => {
		const raster = PLAIN_RASTER;
		const averager = createCellAverager(RESOLUTION, raster);
		averager.add(
			wholeBlock(
				raster,
				new Float32Array(raster.width * raster.height).fill(-250),
			),
		);
		const { means } = averager.finish();
		for (const mean of means) {
			expect(mean).toBeCloseTo(-250, 9);
		}
	});

	it('gives the same means however the raster is cut into blocks', () => {
		const values = rasterValues(RASTER);
		const whole = createCellAverager(RESOLUTION, RASTER);
		whole.add(wholeBlock(RASTER, values));
		const expected = whole.finish();

		// Tiles of 256 pixels, as a TIFF holds them: those at the right
		// and bottom edges reach past the raster and are filled out.
		const tile = 256;
		const tiled = createCellAverager(RESOLUTION, RASTER);
		for (let row = 0; row < RASTER.height; row += tile) {
			for (let column = 0; column < RASTER.width; column += tile) {
				const block = new Float32Array(tile * tile).fill(12_345);
				const columns = Math.min(tile, RASTER.width - column);
				const rows = Math.min(tile, RASTER.height - row);
				for (let y = 0; y < rows; y++) {
					for (let x = 0; x < columns; x++) {
						block[y * tile + x] = pixelValue(column + x, row + y);
					}
				}
				tiled.add({ values: block, stride: tile, column, row, columns, rows });
			}
		}
		const actual = tiled.finish();
		expect(actual.pixels).toBe(expected.pixels);
		expect(actual.pixelCounts).toEqual(expected.pixelCounts);
		for (let cell = 0; cell < CELL_COUNT; cell++) {
			expect(actual.means[cell]).toBeCloseTo(expected.means[cell] as number, 6);
		}
	});

	it('leaves out pixels with no data, and counts them', () => {
		const values = rasterValues(RASTER);
		const expected = createCellAverager(RESOLUTION, RASTER);
		expected.add(wholeBlock(RASTER, values));
		const clean = expected.finish();

		// One pixel in every sixteen holds no elevation: the no-data value
		// or NaN in turn. Every cell keeps other pixels.
		const holed = values.slice();
		let holes = 0;
		for (let row = 0; row < RASTER.height; row += 4) {
			for (let column = row % 8; column < RASTER.width; column += 4) {
				holed[row * RASTER.width + column] =
					holes % 2 === 0 ? -99_999 : Number.NaN;
				holes++;
			}
		}
		const averager = createCellAverager(RESOLUTION, RASTER);
		averager.add(wholeBlock(RASTER, holed));
		const { means, pixels, noDataPixels } = averager.finish();
		expect(noDataPixels).toBe(holes);
		expect(pixels).toBe(RASTER.width * RASTER.height - holes);
		for (let cell = 0; cell < CELL_COUNT; cell++) {
			expect(Number.isFinite(means[cell])).toBe(true);
			// A hole never drags a mean towards the no-data value.
			expect(
				Math.abs((means[cell] as number) - (clean.means[cell] as number)),
			).toBeLessThan(2000);
		}
	});

	it('treats the no-data value as an elevation when the raster has none', () => {
		const raster = PLAIN_RASTER;
		const averager = createCellAverager(RESOLUTION, raster);
		averager.add(
			wholeBlock(
				raster,
				new Float32Array(raster.width * raster.height).fill(-99_999),
			),
		);
		const { means, noDataPixels } = averager.finish();
		expect(noDataPixels).toBe(0);
		expect(means[0]).toBeCloseTo(-99_999, 6);
	});

	it('gives counts of its own, which adding more pixels does not change', () => {
		const values = rasterValues(RASTER);
		const averager = createCellAverager(RESOLUTION, RASTER);
		averager.add(wholeBlock(RASTER, values));
		const first = averager.finish();
		const before = first.pixelCounts.slice();
		averager.add(wholeBlock(RASTER, values));
		expect(first.pixelCounts).toEqual(before);
		expect(averager.finish().pixels).toBe(2 * first.pixels);
	});

	it('refuses to give means while a cell has no pixel', () => {
		const raster: RasterShape = { width: 8, height: 4, noData: null };
		const averager = createCellAverager(RESOLUTION, raster);
		averager.add(wholeBlock(raster, new Float32Array(32)));
		expect(() => averager.finish()).toThrow('received no pixel');
	});

	it('refuses a block that does not fit the raster', () => {
		const averager = createCellAverager(RESOLUTION, RASTER);
		const block = {
			values: new Float32Array(100),
			stride: 10,
			column: 0,
			row: 0,
			columns: 10,
			rows: 10,
		};
		expect(() => averager.add({ ...block, column: WIDTH - 9 })).toThrow(
			RangeError,
		);
		expect(() => averager.add({ ...block, row: HEIGHT - 9 })).toThrow(
			RangeError,
		);
		expect(() => averager.add({ ...block, column: -1 })).toThrow(RangeError);
		expect(() => averager.add({ ...block, row: -1 })).toThrow(RangeError);
		expect(() => averager.add({ ...block, columns: -1 })).toThrow(RangeError);
		expect(() => averager.add({ ...block, rows: -1 })).toThrow(RangeError);
		expect(() => averager.add({ ...block, columns: 11 })).toThrow(RangeError);
		expect(() =>
			averager.add({ ...block, values: new Float32Array(99) }),
		).toThrow('its 99 values are too few');
		// Nothing was taken from any of them.
		expect(() => averager.finish()).toThrow('received no pixel');
		expect(() =>
			averager.add({ ...block, column: WIDTH - 10, row: HEIGHT - 10 }),
		).not.toThrow();
	});

	it('refuses a raster of no size and a grid that is not supported', () => {
		expect(() =>
			createCellAverager(RESOLUTION, { width: 0, height: 4, noData: null }),
		).toThrow(RangeError);
		expect(() =>
			createCellAverager(RESOLUTION, { width: 4, height: 0, noData: null }),
		).toThrow(RangeError);
		expect(() =>
			createCellAverager(RESOLUTION, { width: 4.5, height: 4, noData: null }),
		).toThrow(RangeError);
		expect(() =>
			createCellAverager(RESOLUTION, { width: 4, height: 2.5, noData: null }),
		).toThrow(RangeError);
		expect(() => createCellAverager(100, RASTER)).toThrow(RangeError);
	});
});

describe('summariseCounts', () => {
	it('gives the least, the middle and the most', () => {
		expect(summariseCounts(Uint32Array.of(7, 300, 2, 40, 11))).toEqual({
			min: 2,
			median: 11,
			max: 300,
		});
		expect(summariseCounts(Uint32Array.of(5))).toEqual({
			min: 5,
			median: 5,
			max: 5,
		});
	});

	it('takes the upper of the two middle counts of an even number', () => {
		expect(summariseCounts(Uint32Array.of(4, 1, 3, 2)).median).toBe(3);
	});

	it('leaves the counts as they were', () => {
		const counts = Uint32Array.of(3, 1, 2);
		summariseCounts(counts);
		expect([...counts]).toEqual([3, 1, 2]);
	});

	it('refuses to summarise nothing', () => {
		expect(() => summariseCounts(new Uint32Array(0))).toThrow(RangeError);
	});
});

describe('encodeEarth', () => {
	it('writes whole metres that the core reads back', () => {
		const means = new Float64Array(EARTH_DATA_CELLS);
		for (let cell = 0; cell < EARTH_DATA_CELLS; cell++) {
			means[cell] = ((cell * 37) % 20_001) - 10_000;
		}
		const bytes = encodeEarth(means);
		expect(bytes.length).toBe(EARTH_DATA_BYTES);
		const { elevation } = decodeEarth(bytes);
		for (let cell = 0; cell < EARTH_DATA_CELLS; cell++) {
			expect(elevation[cell]).toBe(means[cell]);
		}
	});

	it('rounds each mean to the nearest metre', () => {
		const means = new Float64Array(EARTH_DATA_CELLS);
		means.set([0.4, 0.6, -0.4, -0.6, 1234.49, -1234.51, 2.5, -2.5]);
		const { elevation } = decodeEarth(encodeEarth(means));
		expect([...elevation.subarray(0, 8)]).toEqual([
			0, 1, 0, -1, 1234, -1235, 3, -2,
		]);
	});

	it('writes little-endian, two bytes to a cell', () => {
		const means = new Float64Array(EARTH_DATA_CELLS);
		means[0] = 0x1234;
		means[1] = -2;
		const bytes = encodeEarth(means);
		expect([...bytes.subarray(0, 4)]).toEqual([0x34, 0x12, 0xfe, 0xff]);
	});

	it('accepts the limits a cell can hold and nothing beyond them', () => {
		const means = new Float64Array(EARTH_DATA_CELLS);
		means[0] = MIN_ELEVATION_M;
		means[1] = MAX_ELEVATION_M;
		expect(() => encodeEarth(means)).not.toThrow();
		means[5] = MAX_ELEVATION_M + 1;
		expect(() => encodeEarth(means)).toThrow('Cell 5 has a mean elevation');
		means[5] = MIN_ELEVATION_M - 1;
		expect(() => encodeEarth(means)).toThrow(RangeError);
		means[5] = Number.NaN;
		expect(() => encodeEarth(means)).toThrow(RangeError);
		means[5] = Number.POSITIVE_INFINITY;
		expect(() => encodeEarth(means)).toThrow(RangeError);
	});

	it('refuses means that are not one to a cell', () => {
		expect(() => encodeEarth(new Float64Array(EARTH_DATA_CELLS - 1))).toThrow(
			RangeError,
		);
		expect(() => encodeEarth(new Float64Array(0))).toThrow(RangeError);
	});
});
