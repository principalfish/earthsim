/**
 * The climate loop: the temperature and the winds solved together on the
 * Earth at 64 and on a generated world.
 */

import { describe, expect, it } from 'vitest';
import { readEarthDataFile } from '../../scripts/earth/dataFile.mjs';
import {
	type ClimateProgress,
	type ClimateResult,
	solveClimate,
} from './climate';
import { decodeEarth, earthWorld } from './earth/earth';
import { MONTHS_PER_YEAR } from './planet/insolation';
import { solveTemperature, TEMPERATURE_MODEL } from './temperature/temperature';
import { solveWinds } from './wind/solve';
import { generateWorld } from './world/generate';
import type { World } from './world/world';

/** Allows for coverage instrumentation, which makes the solves slower. */
const SOLVE_TIMEOUT_MS = 180_000;

/** One step a month, solved to 0.05 K: several times quicker than the default. */
const COARSE = {
	...TEMPERATURE_MODEL,
	stepsPerMonth: 1,
	solverToleranceK: 0.05,
};

const DATA = decodeEarth(readEarthDataFile());
const EARTH = earthWorld(DATA, 64);

/** A value worked out on first use and then shared. */
const shared = <T>(make: () => T): (() => T) => {
	let value: T | undefined;
	return () => {
		value ??= make();
		return value;
	};
};

type Run = {
	readonly result: ClimateResult;
	readonly passes: ClimateProgress[];
};

const run = (
	world: World,
	options: Parameters<typeof solveClimate>[1] = {},
): Run => {
	const passes: ClimateProgress[] = [];
	const result = solveClimate(world, {
		...options,
		onPass: (progress) => passes.push(progress),
	});
	return { result, passes };
};

const earth = shared(() => run(EARTH, { model: COARSE }));

/** The largest difference between two years of monthly fields. */
const largestDifference = (
	a: readonly Float32Array[],
	b: readonly Float32Array[],
): number => {
	let largest = 0;
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		for (let cell = 0; cell < (a[month] as Float32Array).length; cell++) {
			largest = Math.max(
				largest,
				Math.abs(
					((a[month] as Float32Array)[cell] as number) -
						((b[month] as Float32Array)[cell] as number),
				),
			);
		}
	}
	return largest;
};

describe('solveClimate on the Earth', { timeout: SOLVE_TIMEOUT_MS }, () => {
	it('has a first pass that is today’s temperature and winds exactly', () => {
		const first = earth().passes[0] as ClimateProgress;
		const temperature = solveTemperature(EARTH, { model: COARSE });
		expect(first.temperature.months).toEqual(temperature.months);
		expect(first.temperature.state).toEqual(temperature.state);
		expect(first.winds).toEqual(solveWinds(EARTH, temperature.months));
		expect(first.pass).toBe(1);
		expect(first.changeC).toBeNull();
		expect(first.settled).toBe(false);
	});

	it('settles within the passes allowed and reports each pass in order', () => {
		const { result, passes } = earth();
		expect(result.settled).toBe(true);
		expect(result.passes).toBeGreaterThan(1);
		expect(result.passes).toBeLessThanOrEqual(
			TEMPERATURE_MODEL.climateMaxPasses,
		);
		expect(passes.map((pass) => pass.pass)).toEqual(
			Array.from({ length: result.passes }, (_, index) => index + 1),
		);
		expect(
			passes.every(
				(pass) => pass.maxPasses === TEMPERATURE_MODEL.climateMaxPasses,
			),
		).toBe(true);
		// Only the last pass is the last, and it is the one that settled.
		expect(passes.map((pass) => pass.last)).toEqual(
			passes.map((_, index) => index === passes.length - 1),
		);
		const final = passes[passes.length - 1] as ClimateProgress;
		expect(final.settled).toBe(true);
		expect(final.changeC).toBeLessThanOrEqual(
			TEMPERATURE_MODEL.climateToleranceC,
		);
		// The change falls from pass to pass on the way, and no pass before
		// the last had settled.
		const changes = passes.slice(1).map((pass) => pass.changeC as number);
		expect(
			changes.every(
				(change, index) =>
					index === 0 || change < (changes[index - 1] as number),
			),
		).toBe(true);
		expect(passes.slice(0, -1).every((pass) => !pass.settled)).toBe(true);
		// What is returned is the last pass.
		expect(result.temperature).toBe(final.temperature);
		expect(result.winds).toBe(final.winds);
		expect(result.changeC).toBe(final.changeC);
		expect(result.dayLengthHours).toBe(EARTH.planet.dayLengthHours);
	});

	it('gives the passes’ temperature and winds together: the winds are those of the temperature', () => {
		for (const pass of earth().passes) {
			expect(pass.winds).toEqual(solveWinds(EARTH, pass.temperature.months));
		}
	});

	it('carries heat along the winds from the second pass: the coasts differ from the first pass’s', () => {
		const [first, second] = earth().passes as [
			ClimateProgress,
			ClimateProgress,
		];
		expect(
			largestDifference(first.temperature.months, second.temperature.months),
		).toBeGreaterThan(1);
	});

	it('settles in one pass when carried on from a settled result for the world as it is', () => {
		const again = run(EARTH, { model: COARSE, start: earth().result });
		expect(again.passes).toHaveLength(1);
		expect(again.result.settled).toBe(true);
		expect(again.result.changeC).toBeLessThan(
			TEMPERATURE_MODEL.climateToleranceC,
		);
		// The root-mean-square change is within the tolerance while the
		// largest in some cell is above it, a few times that: the rule is the
		// rms, not the largest change.
		const largest = largestDifference(
			again.result.temperature.months,
			earth().result.temperature.months,
		);
		expect(largest).toBeGreaterThan(TEMPERATURE_MODEL.climateToleranceC);
		expect(largest).toBeLessThan(0.5);
	});

	it('solves from nothing, as the first pass of a cold solve does, when the start is for another day length or sea level', () => {
		const first = (earth().passes[0] as ClimateProgress).temperature.months;
		const otherDay: World = {
			...EARTH,
			planet: { ...EARTH.planet, dayLengthHours: 30 },
		};
		const afterDay = run(otherDay, {
			model: { ...COARSE, climateMaxPasses: 1 },
			start: earth().result,
		});
		expect(afterDay.passes[0]?.temperature.months).toEqual(first);
		const otherSea: World = { ...EARTH, seaLevel: EARTH.seaLevel + 50 };
		const afterSea = run(otherSea, {
			model: { ...COARSE, climateMaxPasses: 1 },
			start: earth().result,
		});
		expect(afterSea.passes[0]?.temperature.months).not.toEqual(first);
		expect(afterSea.passes[0]?.changeC).toBeNull();
	});

	it('stops on a change of no more than the tolerance, not on one above it, and on the most passes', () => {
		const second = earth().passes[1] as ClimateProgress;
		const change = second.changeC as number;
		const twoPasses = { ...COARSE, climateMaxPasses: 2 };
		const at = run(EARTH, {
			model: { ...twoPasses, climateToleranceC: change },
		});
		expect(at.passes[1]?.settled).toBe(true);
		expect(at.result.settled).toBe(true);
		expect(at.passes[1]?.last).toBe(true);
		const below = run(EARTH, {
			model: { ...twoPasses, climateToleranceC: change * (1 - 1e-9) },
		});
		expect(below.passes[1]?.settled).toBe(false);
		expect(below.result.settled).toBe(false);
		expect(below.result.passes).toBe(2);
		// Too few passes to compare: the cap ends a first pass of one.
		const one = run(EARTH, { model: { ...COARSE, climateMaxPasses: 1 } });
		expect(one.result.passes).toBe(1);
		expect(one.result.settled).toBe(false);
		expect(one.passes[0]?.last).toBe(true);
	});

	it('solves from nothing when the start’s temperature was solved for another planet setting, and refuses one with no record', () => {
		const first = (earth().passes[0] as ClimateProgress).temperature.months;
		const warmer: World = {
			...EARTH,
			planet: { ...EARTH.planet, greenhouseStrength: 1.2 },
		};
		const cold = run(warmer, {
			model: { ...COARSE, climateMaxPasses: 1 },
			start: earth().result,
		});
		expect(cold.passes[0]?.changeC).toBeNull();
		expect(cold.passes[0]?.temperature.months).not.toEqual(first);
		const { solvedFor: _gone, ...unrecorded } = earth().result.temperature;
		expect(() =>
			solveClimate(EARTH, {
				model: COARSE,
				start: { ...earth().result, temperature: unrecorded as never },
			}),
		).toThrow(RangeError);
	});

	it('has a first pass that does not depend on the day length, and later passes that do', () => {
		const slow: World = {
			...EARTH,
			planet: { ...EARTH.planet, dayLengthHours: 72 },
		};
		const two = run(slow, { model: { ...COARSE, climateMaxPasses: 2 } });
		const base = earth().passes;
		expect(two.passes[0]?.temperature.months).toEqual(
			(base[0] as ClimateProgress).temperature.months,
		);
		// The winds of the first pass turn with the planet, and carry heat in
		// the second.
		expect(two.passes[0]?.winds).not.toEqual(
			(base[0] as ClimateProgress).winds,
		);
		expect(
			largestDifference(
				(two.passes[1] as ClimateProgress).temperature.months,
				(base[1] as ClimateProgress).temperature.months,
			),
		).toBeGreaterThan(0.1);
		expect(two.result.dayLengthHours).toBe(72);
	});

	it('refuses a start that is not twelve months of one value per cell, and a model it cannot use, before any solving', () => {
		const good = earth().result;
		const bad = [
			{
				...good,
				temperature: {
					...good.temperature,
					months: good.temperature.months.slice(1),
				},
			},
			{ ...good, winds: { ...good.winds, east: good.winds.east.slice(1) } },
			{
				...good,
				winds: {
					...good.winds,
					north: good.winds.north.map(() => new Float32Array(3)),
				},
			},
			{ ...good, dayLengthHours: Number.NaN },
			{},
		];
		for (const start of bad) {
			expect(() => solveClimate(EARTH, { start: start as never })).toThrow(
				RangeError,
			);
		}
		for (const model of [
			{ ...TEMPERATURE_MODEL, climateToleranceC: 0 },
			{ ...TEMPERATURE_MODEL, climateMaxPasses: 0 },
			{ ...TEMPERATURE_MODEL, climateMaxPasses: 2.5 },
			{ ...TEMPERATURE_MODEL, climateMaxPasses: 101 },
			{ ...TEMPERATURE_MODEL, climateOvershootShare: 0 },
			{ ...TEMPERATURE_MODEL, climateOvershootShare: 1.5 },
		]) {
			expect(() => solveClimate(EARTH, { model })).toThrow(RangeError);
		}
	});

	it('ends the solve with whatever the callbacks throw', () => {
		const model = { ...COARSE, climateMaxPasses: 1 };
		expect(() =>
			solveClimate(EARTH, {
				model,
				onPass: () => {
					throw new Error('stop here');
				},
			}),
		).toThrow('stop here');
		const years: [number, number][] = [];
		solveClimate(EARTH, {
			model,
			onYear: (progress, pass) => years.push([progress.yearsDone, pass]),
		});
		expect(years.length).toBeGreaterThan(0);
		expect(years.every(([, pass]) => pass === 1)).toBe(true);
		expect(years.map(([done]) => done)).toEqual(
			years.map((_, index) => index + 1),
		);
	});
});

describe('solveClimate with no winds to carry heat', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	it('settles after the second pass with the temperature of the first', () => {
		const model = { ...COARSE, windHeatCapacity: 0 };
		const { result, passes } = run(EARTH, { model });
		expect(result.passes).toBe(2);
		expect(result.settled).toBe(true);
		const today = solveTemperature(EARTH, { model });
		expect(
			largestDifference(result.temperature.months, today.months),
		).toBeLessThan(
			model.solverToleranceK + TEMPERATURE_MODEL.climateToleranceC,
		);
		expect(passes[0]?.temperature.months).toEqual(today.months);
	});
});

describe('solveClimate when the winds and the temperature chase each other', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	// A generated world with the thermal highs and lows at 3 hPa a kelvin,
	// the strength the winds were tuned at before the temperature depended on
	// them: the loop does not settle, its change grows from the fourth pass to
	// the fifth and, left whole, goes on growing.
	const WORLD = generateWorld({ resolution: 64, seed: 1, landFraction: 0.3 });
	const MODEL = { ...COARSE, climateMaxPasses: 6 };
	const WINDS = { thermalHpaPerK: 3 };

	const whole = shared(() =>
		run(WORLD, {
			model: { ...MODEL, climateOvershootShare: 1 },
			windSettings: WINDS,
		}),
	);
	const half = shared(() => run(WORLD, { model: MODEL, windSettings: WINDS }));

	it('applies only half of a pass that changes the temperature by more than the one before, and the winds of what is applied', () => {
		const wholePasses = whole().passes as ClimateProgress[];
		const halfPasses = half().passes as ClimateProgress[];
		// The first overshoot is the fifth pass.
		expect((wholePasses[4] as ClimateProgress).changeC).toBeGreaterThan(
			(wholePasses[3] as ClimateProgress).changeC as number,
		);
		// Until then the two runs are the same.
		expect((halfPasses[3] as ClimateProgress).temperature.months).toEqual(
			(wholePasses[3] as ClimateProgress).temperature.months,
		);
		// The change is reported before it is damped, in both.
		expect((halfPasses[4] as ClimateProgress).changeC).toBe(
			(wholePasses[4] as ClimateProgress).changeC,
		);
		const before = (halfPasses[3] as ClimateProgress).temperature;
		const pass = (wholePasses[4] as ClimateProgress).temperature;
		const applied = (halfPasses[4] as ClimateProgress).temperature;
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			for (let cell = 0; cell < 64 * 64 * 6; cell += 7) {
				const from = (before.months[month] as Float32Array)[cell] as number;
				const to = (pass.months[month] as Float32Array)[cell] as number;
				expect(
					((applied.months[month] as Float32Array)[cell] as number) -
						(from + 0.5 * (to - from)),
				).toBeCloseTo(0, 3);
			}
		}
		for (const key of ['temperatureK', 'previousK'] as const) {
			for (let cell = 0; cell < 64 * 64 * 6; cell += 7) {
				const from = before.state[key][cell] as number;
				const to = pass.state[key][cell] as number;
				expect(
					(applied.state[key][cell] as number) - (from + 0.5 * (to - from)),
				).toBeCloseTo(0, 6);
			}
		}
		// What is not blended is the pass's own.
		expect(applied.yearsRun).toBe(pass.yearsRun);
		expect(applied.solvedFor).toEqual(pass.solvedFor);
		const winds = (settings: object, months: Float32Array[]) =>
			solveWinds(WORLD, months, { settings });
		expect((halfPasses[4] as ClimateProgress).winds).toEqual(
			winds(WINDS, applied.months),
		);
		expect((wholePasses[4] as ClimateProgress).winds).toEqual(
			winds(WINDS, pass.months),
		);
	});

	it('keeps the change from growing: the pass after a damped one changes less than the same pass left whole', () => {
		const wholeChanges = whole().passes.map((pass) => pass.changeC as number);
		const halfChanges = half().passes.map((pass) => pass.changeC as number);
		// Left whole, the change goes on growing after the overshoot.
		expect(wholeChanges[5]).toBeGreaterThan(wholeChanges[4] as number);
		// Damped, the sixth pass changes the temperature by much less.
		expect(halfChanges[5]).toBeLessThan(0.9 * (wholeChanges[5] as number));
	});

	it('stops at the most passes when the climate does not settle', () => {
		const { result, passes } = half();
		expect(result.passes).toBe(6);
		expect(result.settled).toBe(false);
		expect((passes[5] as ClimateProgress).last).toBe(true);
		expect((passes[5] as ClimateProgress).settled).toBe(false);
	});
});
