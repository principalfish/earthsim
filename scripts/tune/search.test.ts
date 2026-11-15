import { describe, expect, it } from 'vitest';
import {
	type EarthFigures,
	isAccepted,
	isWithin,
	MAX_STEPS_PER_SETTING,
	type SettingValues,
	search,
	sweep,
	sweepValues,
} from './search';

/**
 * A made-up scoring: the wind difference least with `a` at 3 and `b` at
 * 0.5, the direction share falling as `a` moves from 2 and the pressure
 * difference rising as `b` moves from 1.
 */
const madeUp = (settings: SettingValues): EarthFigures => {
	const a = settings.a as number;
	const b = settings.b as number;
	return {
		windRms: 4 + (a - 3) ** 2 + (b - 0.5) ** 2,
		directionShare: 0.6 - 0.01 * (a - 2) ** 2,
		pressureRms: 7 + (b - 1) ** 2,
	};
};

describe('sweepValues', () => {
	it('spaces the values evenly from the first to the last, both included', () => {
		expect(sweepValues(1, 2, 5)).toEqual([1, 1.25, 1.5, 1.75, 2]);
		expect(sweepValues(3, 1, 3)).toEqual([3, 2, 1]);
		expect(sweepValues(7, 9, 1)).toEqual([7]);
	});

	it('refuses ends that are not finite and a count that is not a whole number from 1', () => {
		expect(() => sweepValues(Number.NaN, 1, 3)).toThrow(RangeError);
		expect(() => sweepValues(0, Number.POSITIVE_INFINITY, 3)).toThrow(
			RangeError,
		);
		for (const count of [0, 2.5, -1]) {
			expect(() => sweepValues(0, 1, count)).toThrow(RangeError);
		}
	});
});

describe('sweep', () => {
	it('reports one row for each value tried, in order, with the figures each gave', () => {
		const values = sweepValues(0, 6, 7);
		const tried: number[] = [];
		const rows = sweep(values, (value) => {
			tried.push(value);
			return madeUp({ a: value, b: 0.5 });
		});
		expect(rows).toHaveLength(values.length);
		expect(tried).toEqual(values);
		for (const [index, row] of rows.entries()) {
			expect(row.value).toBe(values[index]);
			expect(row.figures).toEqual(madeUp({ a: row.value, b: 0.5 }));
		}
	});
});

describe('isAccepted', () => {
	const start: EarthFigures = {
		windRms: 4,
		directionShare: 0.6,
		pressureRms: 7,
	};

	it('takes a lower wind difference only while the other two figures are no worse than at the start', () => {
		const current = { ...start, windRms: 3.8 };
		expect(isAccepted({ ...start, windRms: 3.7 }, current, start)).toBe(true);
		// No lower than the current one.
		expect(isAccepted({ ...start, windRms: 3.8 }, current, start)).toBe(false);
		expect(isAccepted({ ...start, windRms: 3.9 }, current, start)).toBe(false);
		// The direction share or the pressure difference worse than the
		// start's, however much the wind difference falls.
		expect(
			isAccepted(
				{ windRms: 1, directionShare: 0.599, pressureRms: 7 },
				current,
				start,
			),
		).toBe(false);
		expect(
			isAccepted(
				{ windRms: 1, directionShare: 0.6, pressureRms: 7.001 },
				current,
				start,
			),
		).toBe(false);
		// Better than the start in both is fine.
		expect(
			isAccepted(
				{ windRms: 3, directionShare: 0.7, pressureRms: 6 },
				current,
				start,
			),
		).toBe(true);
	});

	it('never takes figures that are not numbers', () => {
		for (const part of ['windRms', 'directionShare', 'pressureRms'] as const) {
			expect(
				isAccepted({ ...start, windRms: 1, [part]: Number.NaN }, start, start),
			).toBe(false);
		}
	});
});

describe('search', () => {
	it('never ends with a worse wind difference than it started with, nor a worse direction share or pressure difference', () => {
		for (const startAt of [
			{ a: 1, b: 2 },
			{ a: 3, b: 0.5 },
			{ a: 5, b: 1 },
			{ a: 2, b: 1 },
		]) {
			const result = search({
				start: startAt,
				names: ['a', 'b'],
				evaluate: madeUp,
			});
			const label = JSON.stringify(startAt);
			const { start, end } = result;
			expect(start.settings, label).toEqual(startAt);
			expect(start.figures, label).toEqual(madeUp(startAt));
			expect(end.figures, label).toEqual(madeUp(end.settings));
			expect(end.figures.windRms, label).toBeLessThanOrEqual(
				start.figures.windRms,
			);
			expect(end.figures.directionShare, label).toBeGreaterThanOrEqual(
				start.figures.directionShare,
			);
			expect(end.figures.pressureRms, label).toBeLessThanOrEqual(
				start.figures.pressureRms,
			);
			// Every step lowers the wind difference.
			let before = start.figures.windRms;
			for (const step of result.steps) {
				expect(step.figures.windRms, label).toBeLessThan(before);
				before = step.figures.windRms;
			}
		}
	});

	it('moves towards a lower wind difference where the other two figures allow, and holds where they do not', () => {
		// From a = 2, b = 1 the wind difference wants a = 3 and b = 0.5, but
		// moving a from 2 lowers the direction share and moving b from 1
		// raises the pressure difference, so nothing may move.
		const held = search({
			start: { a: 2, b: 1 },
			names: ['a', 'b'],
			evaluate: madeUp,
		});
		expect(held.steps).toHaveLength(0);
		expect(held.end.settings).toEqual({ a: 2, b: 1 });
		// From a = 1 the direction share rises as a moves towards 2, and the
		// wind difference falls, so a moves up but never past 3; b, from 2,
		// moves down towards 1 and no further than the start allows.
		const moved = search({
			start: { a: 1, b: 2 },
			names: ['a', 'b'],
			evaluate: madeUp,
			rounds: 5,
		});
		const a = moved.end.settings.a as number;
		const b = moved.end.settings.b as number;
		expect(a).toBeGreaterThan(1.5);
		expect(a).toBeLessThanOrEqual(3);
		expect(b).toBeLessThan(2);
		// Its steps, of a share of its value, may pass the wind difference's
		// least a little.
		expect(b).toBeGreaterThan(0.45);
		expect(moved.end.figures.windRms).toBeLessThan(
			moved.start.figures.windRms - 1,
		);
		expect(moved.evaluations).toBeGreaterThan(moved.steps.length);
	});

	it('takes at most a set number of steps on one setting in a round, and reports each as it takes it', () => {
		const seen: number[] = [];
		const result = search({
			start: { a: 1 },
			names: ['a'],
			rounds: 1,
			// The wind difference keeps falling as a grows, for ever.
			evaluate: ({ a }) => ({
				windRms: 1 / (a as number),
				directionShare: 0.5,
				pressureRms: 1,
			}),
			onStep: ({ value }) => seen.push(value),
		});
		expect(result.steps).toHaveLength(MAX_STEPS_PER_SETTING);
		expect(seen).toEqual(result.steps.map(({ value }) => value));
		expect(result.end.settings.a).toBeCloseTo(1.1 ** MAX_STEPS_PER_SETTING, 9);
	});

	it('skips a step outside its setting’s bounds, as if it had not helped, and notes it', () => {
		// The wind difference keeps falling as the share grows, but a share
		// may be at most 1.
		const evaluated: number[] = [];
		const result = search({
			start: { share: 0.5, free: 1 },
			names: ['share'],
			rounds: 2,
			bounds: { share: { above: 0, atMost: 1 } },
			evaluate: ({ share }) => {
				evaluated.push(share as number);
				return {
					windRms: 2 - (share as number),
					directionShare: 0.5,
					pressureRms: 1,
				};
			},
		});
		const end = result.end.settings.share as number;
		expect(end).toBeLessThanOrEqual(1);
		expect(end).toBeGreaterThan(0.9);
		expect(Math.max(...evaluated)).toBeLessThanOrEqual(1);
		expect(result.boundStops.length).toBeGreaterThan(0);
		for (const stop of result.boundStops) {
			expect(stop.name).toBe('share');
			expect(stop.value).toBeGreaterThan(1);
			expect(stop.bounds).toEqual({ above: 0, atMost: 1 });
		}
		expect(isWithin(1, { above: 0, atMost: 1 })).toBe(true);
		expect(isWithin(0, { above: 0, atMost: 1 })).toBe(false);
		expect(isWithin(-5)).toBe(true);
		expect(isWithin(91, { atMost: 90 })).toBe(false);
	});

	it('refuses a setting not in the start or at zero, a step outside 0 to 1, and rounds that are not a whole number from 1', () => {
		const run = (overrides: object) =>
			search({
				start: { a: 1, z: 0 },
				names: ['a'],
				evaluate: () => ({ windRms: 1, directionShare: 1, pressureRms: 1 }),
				...overrides,
			});
		expect(() => run({ names: ['b'] })).toThrow(RangeError);
		expect(() => run({ names: ['z'] })).toThrow(RangeError);
		for (const step of [0, 1, -0.1, Number.NaN]) {
			expect(() => run({ step })).toThrow(RangeError);
		}
		for (const rounds of [0, 1.5]) {
			expect(() => run({ rounds })).toThrow(RangeError);
		}
	});
});
