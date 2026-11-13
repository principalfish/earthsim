import { describe, expect, it } from 'vitest';
import {
	compareWithGdal,
	gdalLocationInput,
	isNotFound,
	type Pixel,
	type SampledImage,
	samplePixels,
} from './gdalCheck';

const IMAGE: SampledImage = {
	width: 1000,
	height: 600,
	tileWidth: 256,
	tileHeight: 256,
};

const has = (pixels: readonly Pixel[], column: number, row: number): boolean =>
	pixels.some((pixel) => pixel.column === column && pixel.row === row);

describe('samplePixels', () => {
	it('takes the four corners and pixels along every edge', () => {
		const pixels = samplePixels(IMAGE, { randomCount: 0, seed: 1 });
		expect(has(pixels, 0, 0)).toBe(true);
		expect(has(pixels, 999, 0)).toBe(true);
		expect(has(pixels, 0, 599)).toBe(true);
		expect(has(pixels, 999, 599)).toBe(true);
		for (const [name, test] of [
			['top', (pixel: Pixel) => pixel.row === 0],
			['bottom', (pixel: Pixel) => pixel.row === 599],
			['left', (pixel: Pixel) => pixel.column === 0],
			['right', (pixel: Pixel) => pixel.column === 999],
		] as const) {
			expect(pixels.filter(test).length, name).toBeGreaterThanOrEqual(60);
		}
	});

	it('takes the pixels on every side of the corners where tiles meet', () => {
		const pixels = samplePixels(IMAGE, { randomCount: 0, seed: 1 });
		for (const corner of [256, 512]) {
			expect(has(pixels, corner - 1, corner - 1)).toBe(true);
			expect(has(pixels, corner, corner - 1)).toBe(true);
			expect(has(pixels, corner - 1, corner)).toBe(true);
			expect(has(pixels, corner, corner)).toBe(true);
		}
		// Past the bottom of the image the diagonal has left it, but the
		// tiles still to its right are reached along it as far as it goes.
		expect(has(pixels, 768, 768)).toBe(false);
	});

	it('adds as many random pixels as asked for, all inside the image', () => {
		const fixed = samplePixels(IMAGE, { randomCount: 0, seed: 1 });
		const pixels = samplePixels(IMAGE, { randomCount: 500, seed: 1 });
		// A random pixel may fall on one already chosen.
		expect(pixels.length).toBeGreaterThan(fixed.length + 490);
		expect(pixels.length).toBeLessThanOrEqual(fixed.length + 500);
		for (const { column, row } of pixels) {
			expect(Number.isInteger(column) && Number.isInteger(row)).toBe(true);
			expect(column).toBeGreaterThanOrEqual(0);
			expect(column).toBeLessThan(IMAGE.width);
			expect(row).toBeGreaterThanOrEqual(0);
			expect(row).toBeLessThan(IMAGE.height);
		}
	});

	it('gives each pixel once', () => {
		const pixels = samplePixels(IMAGE, { randomCount: 2000, seed: 3 });
		const keys = new Set(pixels.map(({ column, row }) => `${column},${row}`));
		expect(keys.size).toBe(pixels.length);
	});

	it('spreads the random pixels over the whole image', () => {
		const fixed = new Set(
			samplePixels(IMAGE, { randomCount: 0, seed: 9 }).map(
				({ column, row }) => `${column},${row}`,
			),
		);
		const random = samplePixels(IMAGE, { randomCount: 2000, seed: 9 }).filter(
			({ column, row }) => !fixed.has(`${column},${row}`),
		);
		for (const [left, top] of [
			[0, 0],
			[500, 0],
			[0, 300],
			[500, 300],
		] as const) {
			const inQuarter = random.filter(
				({ column, row }) =>
					column >= left &&
					column < left + 500 &&
					row >= top &&
					row < top + 300,
			);
			expect(inQuarter.length).toBeGreaterThan(400);
		}
	});

	it('gives the same pixels for the same seed and others for another', () => {
		const options = { randomCount: 200, seed: 42 };
		expect(samplePixels(IMAGE, options)).toEqual(samplePixels(IMAGE, options));
		expect(samplePixels(IMAGE, { ...options, seed: 43 })).not.toEqual(
			samplePixels(IMAGE, options),
		);
	});
});

describe('gdalLocationInput', () => {
	it('writes a column and a row on each line', () => {
		expect(
			gdalLocationInput([
				{ column: 0, row: 0 },
				{ column: 21_599, row: 10_799 },
			]),
		).toBe('0 0\n21599 10799\n');
		expect(gdalLocationInput([])).toBe('');
	});
});

describe('compareWithGdal', () => {
	it('finds no difference where GDAL printed the same floats', () => {
		const values = Float32Array.of(-4153.25, 2831.8251953125, 0, -99_999);
		expect(
			compareWithGdal(values, '-4153.25\n2831.8251953125\n0\n-99999\n'),
		).toEqual({ compared: 4, mismatches: [] });
	});

	it('takes a number printed with fewer digits for the float nearest it', () => {
		const values = Float32Array.of(0.1, 8848.86);
		expect(compareWithGdal(values, '0.1\n8848.86\n').mismatches).toEqual([]);
		// The same floats written out in full.
		expect(
			compareWithGdal(values, '0.100000001490116\n8848.8603515625\n')
				.mismatches,
		).toEqual([]);
	});

	it('says where the two differ, to the last bit', () => {
		const values = Float32Array.of(1, 2, 3, 4);
		expect(compareWithGdal(values, '1\n2.0000002\n3\n5\n')).toEqual({
			compared: 4,
			mismatches: [1, 3],
		});
		expect(compareWithGdal(Float32Array.of(0), '-0\n').mismatches).toEqual([0]);
	});

	it('reads lines whatever ends them and whatever space is around them', () => {
		expect(
			compareWithGdal(Float32Array.of(1, 2), ' 1 \r\n2\r\n\r\n').mismatches,
		).toEqual([]);
	});

	it('refuses output that is not one value to a pixel', () => {
		expect(() => compareWithGdal(Float32Array.of(1, 2), '1\n')).toThrow(
			'GDAL printed 1 values for 2 pixels',
		);
		expect(() => compareWithGdal(Float32Array.of(1), '1\n2\n')).toThrow(
			'GDAL printed 2 values for 1 pixels',
		);
	});
});

describe('isNotFound', () => {
	it('is true for an error that says the program does not exist', () => {
		expect(isNotFound(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(
			true,
		);
	});

	it('is false for another failure and for anything that is not such an error', () => {
		expect(isNotFound(Object.assign(new Error('x'), { code: 'EACCES' }))).toBe(
			false,
		);
		expect(isNotFound(null)).toBe(false);
		expect(isNotFound('ENOENT')).toBe(false);
		expect(isNotFound(new Error('ENOENT'))).toBe(false);
	});
});
