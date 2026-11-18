import { describe, expect, it } from 'vitest';
import {
	checkStoringError,
	dataRangeOf,
	largestDifference,
	largestDifferenceWithGaps,
	rangeOf,
} from './storedValues';

describe('rangeOf', () => {
	it('gives the lowest and highest value of every month', () => {
		expect(rangeOf([Float64Array.of(3, -2), Float64Array.of(7.5, 0)])).toEqual({
			low: -2,
			high: 7.5,
		});
	});
});

describe('largestDifference', () => {
	it('gives the largest difference between the values and their copy', () => {
		expect(
			largestDifference(
				[Float64Array.of(1, 2), Float64Array.of(-3, 4)],
				[Float32Array.of(1.25, 2), Float32Array.of(-3.5, 4)],
			),
		).toBe(0.5);
		expect(largestDifference([Float64Array.of(1)], [Float32Array.of(1)])).toBe(
			0,
		);
	});
});

describe('dataRangeOf', () => {
	it('gives the range of the values that have data, leaving out NaN', () => {
		expect(
			dataRangeOf([Float64Array.of(3, Number.NaN, -2), Float64Array.of(7.5)]),
		).toEqual({ low: -2, high: 7.5 });
	});

	it('gives an empty range when no value has data', () => {
		expect(dataRangeOf([Float64Array.of(Number.NaN)])).toEqual({
			low: Number.POSITIVE_INFINITY,
			high: Number.NEGATIVE_INFINITY,
		});
	});
});

describe('largestDifferenceWithGaps', () => {
	it('compares the values that have data and lets gaps match gaps', () => {
		expect(
			largestDifferenceWithGaps(
				[Float64Array.of(1, Number.NaN), Float64Array.of(-3, 4)],
				[Float32Array.of(1.25, Number.NaN), Float32Array.of(-3, 4)],
			),
		).toBe(0.25);
	});

	it('refuses a gap that appears or disappears', () => {
		expect(() =>
			largestDifferenceWithGaps(
				[Float64Array.of(1)],
				[Float32Array.of(Number.NaN)],
			),
		).toThrow('Storing changed whether month 0 has data at value 0');
		expect(() =>
			largestDifferenceWithGaps(
				[Float64Array.of(Number.NaN)],
				[Float32Array.of(1)],
			),
		).toThrow('Storing changed whether month 0 has data');
	});
});

describe('checkStoringError', () => {
	it('allows half a step and says so, and refuses more', () => {
		const lines: string[] = [];
		const say = (line: string): void => {
			lines.push(line);
		};
		checkStoringError(0.25, 0.5, 'value', '°C', say);
		expect(lines).toEqual(['Storing moves no value by more than 0.2500 °C']);
		expect(() => checkStoringError(0.2501, 0.5, 'value', '°C', say)).toThrow(
			"A stored value is 0.2501 °C from the source's; at most 0.25 was expected",
		);
		expect(() => checkStoringError(0.13, 0.25, 'wind', 'm/s', say)).toThrow(
			"A stored wind is 0.13 m/s from the source's; at most 0.125 was expected",
		);
	});
});
