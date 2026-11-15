import { describe, expect, it } from 'vitest';
import type { Pixel } from './gdalCheck';
import {
	gdalAgreement,
	gdalDisagreement,
	monthlyValuesAt,
	observedPixels,
} from './observedGdal';

const MONTHS = 12;
const ROWS = 181;
const COLUMNS = 360;

/** A value that says where it is stored: the month, row and column. */
const marker = (month: number, row: number, column: number): number =>
	month * 1_000_000 + row * 1000 + column;

/** Values as a source stores them, each its own {@link marker}. */
const VALUES = Float32Array.from(
	{ length: MONTHS * ROWS * COLUMNS },
	(_, index) =>
		marker(
			Math.floor(index / (ROWS * COLUMNS)),
			Math.floor(index / COLUMNS) % ROWS,
			index % COLUMNS,
		),
);

const has = (pixels: readonly Pixel[], column: number, row: number): boolean =>
	pixels.some((pixel) => pixel.column === column && pixel.row === row);

describe('observedPixels', () => {
	it('takes the corners and more than 2,000 points, all on the grid', () => {
		const pixels = observedPixels();
		for (const [column, row] of [
			[0, 0],
			[359, 0],
			[0, 180],
			[359, 180],
		] as const) {
			expect(has(pixels, column, row), `${column}, ${row}`).toBe(true);
		}
		expect(pixels.length).toBeGreaterThan(2000);
		expect(
			new Set(pixels.map(({ column, row }) => `${column} ${row}`)).size,
		).toBe(pixels.length);
		for (const { column, row } of pixels) {
			expect(column >= 0 && column < COLUMNS && row >= 0 && row < ROWS).toBe(
				true,
			);
		}
	});

	it('takes the same points every time', () => {
		expect(observedPixels()).toEqual(observedPixels());
	});
});

describe('monthlyValuesAt', () => {
	const pixels: Pixel[] = [
		{ column: 0, row: 0 },
		{ column: 359, row: 180 },
		{ column: 17, row: 42 },
	];

	it('gives every month at each point in turn, in the file’s rows', () => {
		const values = monthlyValuesAt(VALUES, pixels, null);
		expect(values).toHaveLength(pixels.length * MONTHS);
		pixels.forEach(({ column, row }, index) => {
			for (let month = 0; month < MONTHS; month++) {
				expect(values[index * MONTHS + month]).toBe(marker(month, row, column));
			}
		});
	});

	it('takes each row from the file’s row at the same latitude', () => {
		const southFirst = Array.from({ length: ROWS }, (_, row) => ROWS - 1 - row);
		const values = monthlyValuesAt(VALUES, pixels, southFirst);
		expect(values[0]).toBe(marker(0, 180, 0));
		expect(values[MONTHS + 11]).toBe(marker(11, 0, 359));
		expect(values[2 * MONTHS + 6]).toBe(marker(6, 138, 17));
	});
});

describe('gdalAgreement and gdalDisagreement', () => {
	const pixels: Pixel[] = [
		{ column: 4, row: 9 },
		{ column: 200, row: 170 },
	];

	it('say how much agreed, and in which order of the rows', () => {
		expect(gdalAgreement({ compared: 24, mismatches: [] }, 2, false)).toBe(
			'GDAL agrees bit for bit at all 24 values compared in the file’s order (2 points, every month)',
		);
		expect(gdalAgreement({ compared: 24, mismatches: [] }, 2, true)).toBe(
			'GDAL agrees bit for bit at all 24 values compared north side up (2 points, every month)',
		);
	});

	it('say how much differed, and the month and point of the first', () => {
		expect(
			gdalDisagreement({ compared: 24, mismatches: [18, 20] }, pixels, true),
		).toBe(
			"2 of 24 values differ from GDAL's north side up, the first in July at column 200, row 170",
		);
		expect(
			gdalDisagreement({ compared: 24, mismatches: [0] }, pixels, false),
		).toBe(
			"1 of 24 values differ from GDAL's in the file’s order, the first in January at column 4, row 9",
		);
	});
});
