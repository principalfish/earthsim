import { describe, expect, it } from 'vitest';
import { OCEAN_COLUMNS, OCEAN_VALUES_PER_MONTH } from '../../src/core/index';
import { type FineGrid, regridCurrents } from './regrid';

/** Quarter-degree cells over every longitude and eight rows from 10° north. */
const GRID: FineGrid = {
	perDegree: 4,
	columns: 1440,
	rows: 8,
	firstLongitudeDeg: -179.875,
	firstLatitudeDeg: 10.125,
};

/** One month of a component, each value made from its column and row. */
const month = (
	grid: FineGrid,
	value: (column: number, row: number) => number,
): Float64Array =>
	Float64Array.from({ length: grid.columns * grid.rows }, (_, index) =>
		value(Math.floor(index / grid.rows), index % grid.rows),
	);

/** The index of a one-degree cell: row from the north, column from 0° east. */
const cell = (latitudeDeg: number, longitudeDeg: number): number =>
	(89.5 - latitudeDeg) * OCEAN_COLUMNS + (longitudeDeg - 0.5);

describe('regridCurrents', () => {
	const east = [
		month(GRID, (column) => column),
		month(GRID, (column) => column + 10),
	];
	const north = [
		month(GRID, (_column, row) => row),
		month(GRID, (_column, row) => row + 10),
	];
	const result = regridCurrents({ east, north }, GRID);

	it('gives twelve-month-style arrays of one-degree cells, one for each month given', () => {
		expect(result.east).toHaveLength(2);
		expect(result.north).toHaveLength(2);
		expect(result.east[0]).toHaveLength(OCEAN_VALUES_PER_MONTH);
	});

	it('averages the sixteen quarter-degree cells inside each one-degree cell', () => {
		// Degree 0° to 1° east is fine columns 720 to 723; 10° to 11° north is
		// fine rows 0 to 3, and 11° to 12° north rows 4 to 7.
		expect(result.east[0]?.[cell(10.5, 0.5)]).toBe(721.5);
		expect(result.north[0]?.[cell(10.5, 0.5)]).toBe(1.5);
		expect(result.north[0]?.[cell(11.5, 0.5)]).toBe(5.5);
		expect(result.east[1]?.[cell(10.5, 0.5)]).toBe(731.5);
		expect(result.north[1]?.[cell(11.5, 359.5)]).toBe(15.5);
	});

	it('takes longitudes from 0° east, wrapping western longitudes to 180° to 360° east', () => {
		// 179° to 180° east is fine columns 1436 to 1439; 180° to 181° is 0 to 3.
		expect(result.east[0]?.[cell(10.5, 179.5)]).toBe(1437.5);
		expect(result.east[0]?.[cell(10.5, 180.5)]).toBe(1.5);
		// 359° east to 360° is -1° to 0°: fine columns 716 to 719.
		expect(result.east[0]?.[cell(10.5, 359.5)]).toBe(717.5);
	});

	it('leaves cells that no fine cell lies in as NaN, never zero', () => {
		expect(result.east[0]?.[cell(12.5, 0.5)]).toBeNaN();
		expect(result.north[0]?.[cell(9.5, 100.5)]).toBeNaN();
		const present = result.east[0]?.filter((value) => !Number.isNaN(value));
		expect(present).toHaveLength(2 * OCEAN_COLUMNS);
	});

	it('averages only the fine cells that have both components', () => {
		const withGaps = month(GRID, () => 1);
		const northGaps = month(GRID, () => 3);
		// Of the sixteen cells in 0° to 1° east, 10° to 11° north, one has no
		// eastward component and one has no northward component.
		withGaps[720 * GRID.rows + 0] = Number.NaN;
		northGaps[721 * GRID.rows + 1] = Number.NaN;
		const gapped = regridCurrents(
			{ east: [withGaps], north: [northGaps] },
			GRID,
		);
		expect(gapped.east[0]?.[cell(10.5, 0.5)]).toBe(1);
		expect(gapped.north[0]?.[cell(10.5, 0.5)]).toBe(3);
		// A cell whose every fine cell lacks a component has no data in both.
		const allEast = month(GRID, (column, row) =>
			column >= 720 && column < 724 && row < 4 ? Number.NaN : 1,
		);
		const none = regridCurrents({ east: [allEast], north: [northGaps] }, GRID);
		expect(none.east[0]?.[cell(10.5, 0.5)]).toBeNaN();
		expect(none.north[0]?.[cell(10.5, 0.5)]).toBeNaN();
		expect(none.east[0]?.[cell(11.5, 0.5)]).toBe(1);
	});

	it('leaves out fine cells beyond the poles', () => {
		const polar: FineGrid = { ...GRID, firstLatitudeDeg: 89.125 };
		const ones = month(polar, () => 1);
		const out = regridCurrents({ east: [ones], north: [ones] }, polar);
		expect(out.east[0]?.[cell(89.5, 0.5)]).toBe(1);
		const present = out.east[0]?.filter((value) => !Number.isNaN(value));
		expect(present).toHaveLength(OCEAN_COLUMNS);
	});

	it('leaves out fine cells beyond the south pole', () => {
		// Rows centred on -90.875, -90.625, ... lie in degrees -91 and -90:
		// the first four are below -90° and are dropped, the next four make
		// the cell centred on -89.5.
		const southern: FineGrid = { ...GRID, firstLatitudeDeg: -90.875 };
		const values = month(southern, (_column, row) => row);
		const out = regridCurrents({ east: [values], north: [values] }, southern);
		expect(out.east[0]?.[cell(-89.5, 0.5)]).toBe(5.5);
		const present = out.east[0]?.filter((value) => !Number.isNaN(value));
		expect(present).toHaveLength(OCEAN_COLUMNS);
	});

	it('gives the same result each time', () => {
		expect(regridCurrents({ east, north }, GRID)).toEqual(result);
	});

	it('refuses a grid whose cells do not tile whole degrees', () => {
		for (const bad of [
			{ ...GRID, firstLatitudeDeg: 10.25 },
			{ ...GRID, firstLongitudeDeg: -179.5 },
			{ ...GRID, columns: 1000 },
			{ ...GRID, perDegree: 0 },
		]) {
			expect(() => regridCurrents({ east, north }, bad)).toThrow(RangeError);
		}
	});

	it('refuses months of the wrong length or number', () => {
		expect(() =>
			regridCurrents({ east: [new Float64Array(5)], north }, GRID),
		).toThrow(
			'A month of the eastward component has 5 values, expected 1440 × 8',
		);
		expect(() =>
			regridCurrents({ east, north: [north[0] as Float64Array] }, GRID),
		).toThrow('The northward component has 1 months, the eastward 2');
	});
});
