import { describe, expect, it } from 'vitest';
import { checkStoringError, largestDifference, rangeOf } from './storedValues';

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
