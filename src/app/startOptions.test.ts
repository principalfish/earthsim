import { describe, expect, it } from 'vitest';
import { MAX_SEED } from '../core/index';
import { DEFAULT_START_OPTIONS, parseStartOptions } from './startOptions';

describe('parseStartOptions', () => {
	it('uses the defaults for an empty query', () => {
		expect(parseStartOptions('')).toEqual(DEFAULT_START_OPTIONS);
		expect(parseStartOptions('?')).toEqual(DEFAULT_START_OPTIONS);
	});

	it('starts on the smallest grid with about a third land', () => {
		expect(DEFAULT_START_OPTIONS.resolution).toBe(64);
		expect(DEFAULT_START_OPTIONS.landFraction).toBe(0.3);
	});

	it('reads every option, with or without the question mark', () => {
		const expected = { resolution: 256, seed: 42, landFraction: 0.55 };
		expect(parseStartOptions('?resolution=256&seed=42&land=0.55')).toEqual(
			expected,
		);
		expect(parseStartOptions('resolution=256&seed=42&land=0.55')).toEqual(
			expected,
		);
	});

	it('reads one option and leaves the others at their defaults', () => {
		expect(parseStartOptions('?resolution=128')).toEqual({
			...DEFAULT_START_OPTIONS,
			resolution: 128,
		});
	});

	it.each(['100', '0', '-64', '64.5', 'abc', ''])(
		'falls back for the unsupported resolution %j',
		(value) => {
			expect(parseStartOptions(`?resolution=${value}`).resolution).toBe(
				DEFAULT_START_OPTIONS.resolution,
			);
		},
	);

	it.each(['-1', '1.5', String(MAX_SEED + 1), 'seed', '', ' '])(
		'falls back for the invalid seed %j',
		(value) => {
			expect(parseStartOptions(`?seed=${value}`).seed).toBe(
				DEFAULT_START_OPTIONS.seed,
			);
		},
	);

	it('accepts the smallest and largest seeds', () => {
		expect(parseStartOptions('?seed=0').seed).toBe(0);
		expect(parseStartOptions(`?seed=${MAX_SEED}`).seed).toBe(MAX_SEED);
	});

	it.each(['-0.1', '1.1', 'half', '', 'NaN'])(
		'falls back for the invalid land fraction %j',
		(value) => {
			expect(parseStartOptions(`?land=${value}`).landFraction).toBe(
				DEFAULT_START_OPTIONS.landFraction,
			);
		},
	);

	it('accepts land fractions of 0 and 1', () => {
		expect(parseStartOptions('?land=0').landFraction).toBe(0);
		expect(parseStartOptions('?land=1').landFraction).toBe(1);
	});
});
