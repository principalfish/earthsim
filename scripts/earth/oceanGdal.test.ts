import { describe, expect, it } from 'vitest';
import { OCEAN_COLUMNS, OCEAN_ROWS } from '../../src/core/index';
import { oceanPixels, valuesAtPixels } from './oceanGdal';

describe('oceanPixels', () => {
	it('takes the corners and more than 2,000 points, all on the grid, each once', () => {
		const pixels = oceanPixels();
		for (const [column, row] of [
			[0, 0],
			[OCEAN_COLUMNS - 1, 0],
			[0, OCEAN_ROWS - 1],
			[OCEAN_COLUMNS - 1, OCEAN_ROWS - 1],
		] as const) {
			expect(
				pixels.some((pixel) => pixel.column === column && pixel.row === row),
			).toBe(true);
		}
		expect(pixels.length).toBeGreaterThan(2000);
		expect(
			new Set(pixels.map(({ column, row }) => `${column} ${row}`)).size,
		).toBe(pixels.length);
		expect(
			pixels.every(
				({ column, row }) =>
					column >= 0 && column < OCEAN_COLUMNS && row >= 0 && row < OCEAN_ROWS,
			),
		).toBe(true);
		expect(oceanPixels()).toEqual(pixels);
	});
});

describe('valuesAtPixels', () => {
	const perTime = OCEAN_ROWS * OCEAN_COLUMNS;
	const values = Float32Array.from(
		{ length: 3 * perTime },
		(_, index) => Math.floor(index / perTime) * 1_000_000 + (index % perTime),
	);

	it('gives every time at each point in turn', () => {
		const out = valuesAtPixels(
			values,
			[
				{ column: 5, row: 2 },
				{ column: 0, row: 0 },
			],
			3,
		);
		const first = 2 * OCEAN_COLUMNS + 5;
		expect([...out]).toEqual([
			first,
			1_000_000 + first,
			2_000_000 + first,
			0,
			1_000_000,
			2_000_000,
		]);
	});

	it('gives one value at each point for a variable with one time', () => {
		expect([...valuesAtPixels(values, [{ column: 7, row: 1 }], 1)]).toEqual([
			OCEAN_COLUMNS + 7,
		]);
	});
});
