import { describe, expect, it } from 'vitest';
import { getGrid } from '../../../core/index';
import { UNITS } from '../../settings/units';
import {
	cellWeights,
	FIT_TAIL_SHARE,
	fitRange,
	fitRangeCentred,
	fitRangeFromZero,
	formatTick,
	MIN_FITTED_SPAN_C,
} from './fit';

/** Twelve one-cell fields with the values given, January first. */
const monthsOf = (...values: number[]): Float32Array[] =>
	values.map((value) => Float32Array.of(value, value / 2));

/** Equal weights for fields of the cells given. */
const evenly = (cells: number): Float64Array => new Float64Array(cells).fill(1);

describe('fitRange', () => {
	it('spans a handful of values from the lowest to the highest, rounded outward to whole degrees', () => {
		// The coldest value is in January and the hottest in December, both
		// far from July's.
		const months = monthsOf(-40, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30);
		months[0]?.set([-40, -52.5]);
		months[11]?.set([30, 41.5]);
		expect(fitRange(months, evenly(2))).toEqual({ min: -53, max: 42 });
	});

	it('keeps ends that are whole already', () => {
		expect(fitRange([Float32Array.of(-10, 30)], evenly(2))).toEqual({
			min: -10,
			max: 30,
		});
	});

	it('widens a constant field about its value', () => {
		const months = Array.from({ length: 12 }, () =>
			Float32Array.of(12, 12, 12),
		);
		expect(fitRange(months, evenly(3))).toEqual({
			min: 12 - MIN_FITTED_SPAN_C / 2,
			max: 12 + MIN_FITTED_SPAN_C / 2,
		});
	});

	it('widens a field that varies less than the narrowest span about its middle, then rounds outward', () => {
		// 5.25 ± 1 is 4.25 to 6.25.
		expect(fitRange([Float32Array.of(5, 5.5)], evenly(2))).toEqual({
			min: 4,
			max: 7,
		});
	});

	it('leaves out half a percent of the weight at each end', () => {
		// A thousand cells from 0 to 999: half a percent of them is five.
		const field = Float32Array.from({ length: 1000 }, (_, cell) => cell);
		expect(FIT_TAIL_SHARE).toBe(0.005);
		expect(fitRange([field], evenly(1000))).toEqual({ min: 4, max: 995 });
	});

	it('weights each cell by the weights given', () => {
		// The first cell is cold; it is left out while it weighs a tenth of
		// a percent of the whole, and kept once it weighs one percent.
		const field = Float32Array.from({ length: 1000 }, (_, cell) =>
			cell === 0 ? -100 : 10 + (cell % 10),
		);
		const light = fitRange([field], evenly(1000));
		expect(light.min).toBe(10);
		const weights = evenly(1000);
		weights[0] = 10;
		const heavy = fitRange([field], weights);
		expect(heavy.min).toBe(-100);
	});

	it('is not stretched by one tall peak', () => {
		// One cell of a thousand far colder than the rest in every month.
		const months = Array.from({ length: 12 }, (_, m) =>
			Float32Array.from({ length: 1000 }, (_, cell) =>
				cell === 0 ? -94 : -30 + ((cell * 7 + m) % 61),
			),
		);
		const without = fitRange(
			months.map((month) => month.slice(1)),
			evenly(999),
		);
		const withPeak = fitRange(months, evenly(1000));
		expect(withPeak).toEqual({ min: -30, max: 30 });
		expect(withPeak).toEqual(without);
	});

	it('ends at the highest value when nothing is left out above', () => {
		// Four cold cells of a thousand are left out; the hot end is the
		// highest value.
		const field = Float32Array.from({ length: 1000 }, (_, cell) =>
			cell < 4 ? -50 : 20 + (cell % 5),
		);
		expect(fitRange([field], evenly(1000))).toEqual({ min: 20, max: 24 });
	});

	it('rounds the cuts outward to whole degrees', () => {
		// The low cut is 2.6, the high 7.4; the values left out, 2.5 and
		// 7.5, are within the whole degrees around them.
		const field = Float32Array.from({ length: 1000 }, (_, cell) =>
			cell === 0 ? 2.5 : cell === 999 ? 7.5 : cell < 500 ? 2.6 : 7.4,
		);
		expect(fitRange([field], evenly(1000))).toEqual({ min: 2, max: 8 });
	});

	it('widens the cuts before rounding them', () => {
		// The cuts, 10 and 10.5, are widened to 9.25 to 11.25 and rounded to
		// 9 to 12. The values left out below, at 9.2, are within it; of
		// those left out above, 11.8 is within it and 60 is beyond.
		const field = Float32Array.from({ length: 1000 }, (_, cell) =>
			cell < 4
				? 9.2
				: cell < 7
					? 11.8
					: cell === 7
						? 60
						: cell % 2 === 0
							? 10
							: 10.5,
		);
		expect(fitRange([field], evenly(1000))).toEqual({ min: 9, max: 12 });
	});

	it('passes over values that are not numbers', () => {
		expect(fitRange([Float32Array.of(Number.NaN, -10, 10)], evenly(3))).toEqual(
			{ min: -10, max: 10 },
		);
	});

	it('passes over infinite values', () => {
		expect(
			fitRange(
				[
					Float32Array.of(Number.POSITIVE_INFINITY, -10),
					Float32Array.of(10, Number.NEGATIVE_INFINITY),
				],
				evenly(2),
			),
		).toEqual({ min: -10, max: 10 });
	});

	it('refuses fields with no value to fit', () => {
		expect(() => fitRange([], evenly(1))).toThrow(RangeError);
		expect(() => fitRange([Float32Array.of(Number.NaN)], evenly(1))).toThrow(
			RangeError,
		);
		expect(() =>
			fitRange(
				[
					Float32Array.of(Number.POSITIVE_INFINITY, Number.NaN),
					Float32Array.of(Number.NEGATIVE_INFINITY),
				],
				evenly(2),
			),
		).toThrow(RangeError);
	});
});

describe('cellWeights', () => {
	it("gives a grid's own cell areas for a field of its cells", () => {
		for (const n of [64, 128]) {
			const grid = getGrid(n);
			expect(cellWeights(grid.cellCount)).toBe(grid.areas);
		}
	});

	it('counts every cell the same for a field no grid has', () => {
		expect(Array.from(cellWeights(2))).toEqual([1, 1]);
		expect(cellWeights(getGrid(64).cellCount + 1)).toHaveLength(
			getGrid(64).cellCount + 1,
		);
		expect(Array.from(cellWeights(6 * 10 * 10)).every((w) => w === 1)).toBe(
			true,
		);
	});

	it('fits a real grid by area, unlike by count', () => {
		// The smallest cells, cold, are a few more than half a percent of
		// the cells but cover less than half a percent of the area.
		const grid = getGrid(64);
		const order = Array.from(grid.areas.keys()).sort(
			(a, b) => (grid.areas[a] as number) - (grid.areas[b] as number),
		);
		const total = grid.areas.reduce((sum, area) => sum + area, 0);
		const cold = order.slice(0, Math.ceil(grid.cellCount * FIT_TAIL_SHARE) + 3);
		const coldArea = cold.reduce(
			(sum, cell) => sum + (grid.areas[cell] as number),
			0,
		);
		expect(coldArea / total).toBeLessThan(FIT_TAIL_SHARE);
		const field = new Float32Array(grid.cellCount).fill(10);
		for (const cell of cold) {
			field[cell] = -60;
		}
		expect(fitRange([field], cellWeights(grid.cellCount)).min).toBe(9);
		expect(fitRange([field], evenly(grid.cellCount)).min).toBe(-60);
	});
});

describe('formatTick', () => {
	it('writes negatives with a minus sign rather than a hyphen', () => {
		expect(formatTick(-20)).toBe('−20');
	});

	it('writes zero and decimals plainly', () => {
		expect(formatTick(0)).toBe('0');
		expect(formatTick(-0)).toBe('0');
		expect(formatTick(14.5)).toBe('14.5');
		expect(formatTick(0.2 + 0.1)).toBe('0.3');
	});
});

describe('fitRangeFromZero', () => {
	it('runs from zero to the largest value, rounded up to a whole number', () => {
		expect(fitRangeFromZero(Float32Array.of(0.5, 41.2, 12))).toEqual({
			min: 0,
			max: 42,
		});
	});

	it('keeps a largest value that is already whole', () => {
		expect(fitRangeFromZero(Float32Array.of(3, 30))).toEqual({
			min: 0,
			max: 30,
		});
	});

	it('runs at least as far as the narrowest span', () => {
		expect(fitRangeFromZero(Float32Array.of(0, 0.3))).toEqual({
			min: 0,
			max: MIN_FITTED_SPAN_C,
		});
	});

	it('passes over values that are not finite numbers', () => {
		expect(
			fitRangeFromZero(
				Float32Array.of(Number.NaN, Number.POSITIVE_INFINITY, 7.5),
			),
		).toEqual({ min: 0, max: 8 });
	});

	it('refuses a field with no finite value', () => {
		expect(() => fitRangeFromZero(Float32Array.of(Number.NaN))).toThrow(
			RangeError,
		);
	});
});

describe('fitRangeCentred', () => {
	const ones = (cells: number) => new Float64Array(cells).fill(1);

	it('reaches as far either side of the rounded centre as the further end of the year', () => {
		const months = [Float32Array.of(1000, 1031), Float32Array.of(1010, 1020)];
		expect(fitRangeCentred(months, ones(2), 1015.6)).toEqual({
			min: 1000,
			max: 1032,
		});
	});

	it('reaches at least half the smallest span either way, rounded up', () => {
		const months = [Float32Array.of(1012, 1013)];
		expect(fitRangeCentred(months, ones(2), 1012, 5)).toEqual({
			min: 1009,
			max: 1015,
		});
		expect(fitRangeCentred(months, ones(2), 1012)).toEqual({
			min: 1011,
			max: 1013,
		});
	});

	it('leaves out the tails by area', () => {
		const grid = getGrid(64);
		const field = new Float32Array(grid.cellCount).fill(0);
		const smallest = Array.from(grid.areas.keys()).sort(
			(a, b) => (grid.areas[a] as number) - (grid.areas[b] as number),
		)[0] as number;
		field[smallest] = 500;
		expect(fitRangeCentred([field], grid.areas, 0)).toEqual({
			min: -1,
			max: 1,
		});
	});

	it('refuses a centre that is not finite', () => {
		expect(() =>
			fitRangeCentred([Float32Array.of(1, 2)], ones(2), Number.NaN),
		).toThrow(RangeError);
	});
});

describe('fitting a scale in a unit', () => {
	const fahrenheit = UNITS.temperature['°F'];
	const kelvin = UNITS.temperature.K;
	const inches = UNITS.pressure.inHg;

	it('converts the ends before widening and rounding them, outward to whole numbers', () => {
		// −10 and 30 °C are 14 and 86 °F, and 263.15 and 303.15 K.
		const months = [Float32Array.of(-10, 30)];
		expect(fitRange(months, evenly(2), 4, fahrenheit)).toEqual({
			min: 14,
			max: 86,
		});
		expect(fitRange(months, evenly(2), 2, kelvin)).toEqual({
			min: 263,
			max: 304,
		});
		// 12 °C alone is 53.6 °F, widened to 4 °F about it.
		expect(
			fitRange([Float32Array.of(12, 12)], evenly(2), 4, fahrenheit),
		).toEqual({ min: 51, max: 56 });
	});

	it('rounds the ends outward to the unit’s decimals', () => {
		// 1000 and 1030 hPa are 29.5299… and 30.4160… inHg.
		const range = fitRange(
			[Float32Array.of(1000, 1030)],
			evenly(2),
			0.3,
			inches,
		);
		expect(range).toEqual({ min: 29.52, max: 30.42 });
		// Widened to 0.3 inHg about 1013 hPa, 29.9139… inHg.
		expect(
			fitRange([Float32Array.of(1013, 1013)], evenly(2), 0.3, inches),
		).toEqual({ min: 29.76, max: 30.07 });
	});

	it('rounds an end on a decimal of the unit to itself, not past it', () => {
		const exact = { scale: 1, offset: 0, decimals: 2 };
		expect(
			fitRange([Float32Array.of(0.5, 0.75)], evenly(2), 0.1, exact),
		).toEqual({ min: 0.5, max: 0.75 });
	});

	it('fits sizes from zero by the scale alone', () => {
		// A range of 10 °C is one of 18 °F, and of 10 K.
		expect(fitRangeFromZero(Float32Array.of(10, 4), 4, fahrenheit)).toEqual({
			min: 0,
			max: 18,
		});
		expect(fitRangeFromZero(Float32Array.of(10, 4), 2, kelvin)).toEqual({
			min: 0,
			max: 10,
		});
		expect(fitRangeFromZero(Float32Array.of(1), 4, fahrenheit)).toEqual({
			min: 0,
			max: 4,
		});
		expect(fitRangeFromZero(Float32Array.of(10), 0.3, inches)).toEqual({
			min: 0,
			max: 0.3,
		});
		expect(fitRangeFromZero(Float32Array.of(20), 0.3, inches)).toEqual({
			min: 0,
			max: 0.6,
		});
	});

	it('centres a scale on the centre in the unit, rounded to its decimals', () => {
		const months = [Float32Array.of(1000, 1030)];
		const range = fitRangeCentred(months, evenly(2), 1013.25, 0.3, inches);
		// 1013.25 hPa is 29.92 inHg; the further end, 1000 hPa, is 0.39
		// inHg below it, rounded up.
		expect(range).toEqual({ min: 29.42, max: 30.42 });
		expect(
			fitRangeCentred([Float32Array.of(15, 15)], evenly(2), 15, 4, fahrenheit),
		).toEqual({ min: 57, max: 61 });
	});
});
