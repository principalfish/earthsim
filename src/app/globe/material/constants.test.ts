import { describe, expect, it } from 'vitest';
import { MAX_ELEVATION_M, MIN_ELEVATION_M } from '../../../core/index';
import {
	DEFAULT_EXAGGERATION,
	drawnSeaLevel,
	MAX_DRAWN_SEA_LEVEL_M,
	MAX_EXAGGERATION,
	MIN_DRAWN_SEA_LEVEL_M,
	MIN_EXAGGERATION,
} from './constants';

describe('the exaggeration range', () => {
	it('runs from true scale and holds the default', () => {
		expect(MIN_EXAGGERATION).toBe(1);
		expect(DEFAULT_EXAGGERATION).toBeGreaterThan(MIN_EXAGGERATION);
		expect(DEFAULT_EXAGGERATION).toBeLessThan(MAX_EXAGGERATION);
	});
});

describe('the drawn sea-level range', () => {
	it('stays within the limits a sea level can have and spans the datum', () => {
		expect(MIN_DRAWN_SEA_LEVEL_M).toBeGreaterThanOrEqual(MIN_ELEVATION_M);
		expect(MAX_DRAWN_SEA_LEVEL_M).toBeLessThanOrEqual(MAX_ELEVATION_M);
		expect(MIN_DRAWN_SEA_LEVEL_M).toBeLessThan(0);
		expect(MAX_DRAWN_SEA_LEVEL_M).toBeGreaterThan(0);
	});

	it('has ends that single precision holds exactly', () => {
		expect(Math.fround(MIN_DRAWN_SEA_LEVEL_M)).toBe(MIN_DRAWN_SEA_LEVEL_M);
		expect(Math.fround(MAX_DRAWN_SEA_LEVEL_M)).toBe(MAX_DRAWN_SEA_LEVEL_M);
	});
});

describe('drawnSeaLevel', () => {
	it('leaves a level within the range at single precision', () => {
		expect(drawnSeaLevel(0)).toBe(0);
		expect(drawnSeaLevel(-120.1)).toBe(Math.fround(-120.1));
		expect(drawnSeaLevel(MIN_DRAWN_SEA_LEVEL_M)).toBe(MIN_DRAWN_SEA_LEVEL_M);
		expect(drawnSeaLevel(MAX_DRAWN_SEA_LEVEL_M)).toBe(MAX_DRAWN_SEA_LEVEL_M);
	});

	it('brings a level outside the range to the nearer end', () => {
		expect(drawnSeaLevel(MIN_DRAWN_SEA_LEVEL_M - 0.5)).toBe(
			MIN_DRAWN_SEA_LEVEL_M,
		);
		expect(drawnSeaLevel(MIN_ELEVATION_M)).toBe(MIN_DRAWN_SEA_LEVEL_M);
		expect(drawnSeaLevel(Number.NEGATIVE_INFINITY)).toBe(MIN_DRAWN_SEA_LEVEL_M);
		expect(drawnSeaLevel(MAX_ELEVATION_M)).toBe(MAX_DRAWN_SEA_LEVEL_M);
		expect(drawnSeaLevel(Number.POSITIVE_INFINITY)).toBe(MAX_DRAWN_SEA_LEVEL_M);
	});

	it('rejects NaN', () => {
		expect(() => drawnSeaLevel(Number.NaN)).toThrow(RangeError);
	});
});
