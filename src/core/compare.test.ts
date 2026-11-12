import { describe, expect, it } from 'vitest';
import { compareField, compareFields, differenceField } from './compare';
import { getGrid } from './grid';
import { cellLatitudes, MONTHS_PER_YEAR } from './insolation';

const grid = getGrid(64);
const { cellCount } = grid;
const latitudes = cellLatitudes(grid);

/** Twelve fields from a function of the month and the cell. */
const fields = (
	value: (month: number, cell: number) => number,
): Float32Array[] =>
	Array.from({ length: MONTHS_PER_YEAR }, (_, month) => {
		const field = new Float32Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			field[cell] = value(month, cell);
		}
		return field;
	});

/** A field that varies over the globe and through the year. */
const base = fields(
	(month, cell) =>
		25 - 0.5 * Math.abs(latitudes[cell] as number) + 3 * Math.sin(month),
);

describe('compareFields', () => {
	it('is zero for identical fields', () => {
		const { months, annual } = compareFields(base, base, grid);
		expect(months).toHaveLength(MONTHS_PER_YEAR);
		for (const figures of [...months, annual]) {
			expect(figures.meanDifference).toBe(0);
			expect(figures.rmsDifference).toBe(0);
		}
	});

	it('gives a shift as its mean and its size as its root-mean-square', () => {
		const shifted = fields(
			(month, cell) => (base[month]?.[cell] as number) + 1.5,
		);
		const { months, annual } = compareFields(shifted, base, grid);
		for (const figures of [...months, annual]) {
			expect(figures.meanDifference).toBeCloseTo(1.5, 5);
			expect(figures.rmsDifference).toBeCloseTo(1.5, 5);
		}
		const reverse = compareFields(base, shifted, grid);
		expect(reverse.annual.meanDifference).toBeCloseTo(-1.5, 5);
		expect(reverse.annual.rmsDifference).toBeCloseTo(1.5, 5);
	});

	it('gives each month its own shift and the annual mean their mean', () => {
		const shifted = fields(
			(month, cell) => (base[month]?.[cell] as number) + month - 5.5,
		);
		const { months, annual } = compareFields(shifted, base, grid);
		for (const [month, figures] of months.entries()) {
			expect(figures.meanDifference).toBeCloseTo(month - 5.5, 4);
			expect(figures.rmsDifference).toBeCloseTo(Math.abs(month - 5.5), 4);
		}
		// The shifts cancel over the year, so the annual means agree.
		expect(annual.meanDifference).toBeCloseTo(0, 4);
		expect(annual.rmsDifference).toBeCloseTo(0, 4);
	});

	it('weights cells by area', () => {
		// +2 north of 60°N, the middle of a cube face, where cells are larger
		// than average, so the cap's share of the area exceeds its share of
		// the cells.
		const inCap = (cell: number): boolean => (latitudes[cell] as number) > 60;
		const shifted = fields(
			(month, cell) => (base[month]?.[cell] as number) + (inCap(cell) ? 2 : 0),
		);
		let capArea = 0;
		let totalArea = 0;
		let capCells = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const area = grid.areas[cell] as number;
			totalArea += area;
			if (inCap(cell)) {
				capArea += area;
				capCells++;
			}
		}
		const areaShare = capArea / totalArea;
		const cellShare = capCells / cellCount;
		expect(areaShare - cellShare).toBeGreaterThan(0.005);
		const { months, annual } = compareFields(shifted, base, grid);
		for (const figures of [...months, annual]) {
			expect(figures.meanDifference).toBeCloseTo(2 * areaShare, 5);
			expect(figures.rmsDifference).toBeCloseTo(2 * Math.sqrt(areaShare), 5);
		}
		expect(Math.abs(annual.meanDifference - 2 * cellShare)).toBeGreaterThan(
			0.01,
		);
	});

	it('refuses anything but twelve fields of one value per cell', () => {
		expect(() => compareFields(base.slice(1), base, grid)).toThrow(RangeError);
		expect(() =>
			compareFields(base, [...base.slice(1), new Float32Array(3)], grid),
		).toThrow(RangeError);
	});
});

describe('differenceField', () => {
	it('is zero everywhere for identical fields', () => {
		const field = base[0] as Float32Array;
		const difference = differenceField(field, field);
		expect(difference).toBeInstanceOf(Float32Array);
		expect(difference).toHaveLength(cellCount);
		expect(difference.every((value) => value === 0)).toBe(true);
	});

	it('gives the first less the second, in a new array', () => {
		const a = Float32Array.of(1, 5, -2.5);
		const b = Float32Array.of(3, 1, -2.5);
		const difference = differenceField(a, b);
		expect([...difference]).toEqual([-2, 4, 0]);
		expect(difference).not.toBe(a);
		expect([...a]).toEqual([1, 5, -2.5]);
	});

	it('refuses fields of unequal lengths', () => {
		expect(() =>
			differenceField(new Float32Array(3), new Float32Array(4)),
		).toThrow(RangeError);
	});
});

describe('compareField', () => {
	it('is zero for identical fields', () => {
		const field = base[3] as Float32Array;
		expect(compareField(field, field, grid)).toEqual({
			meanDifference: 0,
			rmsDifference: 0,
		});
	});

	it('gives the same figures as compareFields for each month', () => {
		const shifted = fields(
			(month, cell) =>
				((base[month] as Float32Array)[cell] as number) +
				(cell % 7) -
				month / 4,
		);
		const { months } = compareFields(shifted, base, grid);
		months.forEach((figures, month) => {
			expect(
				compareField(
					shifted[month] as Float32Array,
					base[month] as Float32Array,
					grid,
				),
			).toEqual(figures);
		});
	});

	it('gives a shift as its mean and its size as its root-mean-square', () => {
		const field = base[0] as Float32Array;
		const warmer = field.map((value) => value - 2);
		const { meanDifference, rmsDifference } = compareField(warmer, field, grid);
		expect(meanDifference).toBeCloseTo(-2, 5);
		expect(rmsDifference).toBeCloseTo(2, 5);
	});

	it('refuses anything but one value per cell in each', () => {
		const field = base[0] as Float32Array;
		expect(() => compareField(field.subarray(1), field, grid)).toThrow(
			RangeError,
		);
		expect(() => compareField(field, field.subarray(1), grid)).toThrow(
			RangeError,
		);
	});
});
