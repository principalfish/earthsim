/**
 * The climate loop: the temperature, the winds and the currents solved
 * together on the Earth at 64, on an ocean planet and on a generated world.
 */

import { describe, expect, it } from 'vitest';
import { readEarthDataFile } from '../../scripts/earth/dataFile.mjs';
import {
	type ClimateProgress,
	type ClimateResult,
	type ClimateStart,
	solveClimate,
} from './climate';
import { decodeEarth, earthWorld } from './earth/earth';
import { getGrid } from './grid/grid';
import { DEFAULT_GYRE_SETTINGS, solveGyres } from './ocean/gyres';
import { upwelling } from './ocean/upwelling';
import { MONTHS_PER_YEAR } from './planet/insolation';
import { solveTemperature, TEMPERATURE_MODEL } from './temperature/temperature';
import { FLOWING_RESOLUTION, flowingPartForSolve } from './wind/flowing';
import { solveWinds } from './wind/solve';
import { generateWorld } from './world/generate';
import { createBlankWorld, type World } from './world/world';

/** Allows for coverage instrumentation, which makes the solves slower. */
const SOLVE_TIMEOUT_MS = 180_000;

/**
 * The default two steps a month, solved to 0.05 K: quicker than the
 * default. One step a month does not resolve how fast a sea at the ice's
 * edge turns, and the Earth does not settle at one.
 */
const COARSE = {
	...TEMPERATURE_MODEL,
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

/**
 * The largest difference between two years of monthly fields, where both
 * are numbers: the sea's are NaN over land.
 */
const largestDifference = (
	a: readonly Float32Array[],
	b: readonly Float32Array[],
): number => {
	let largest = 0;
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		for (let cell = 0; cell < (a[month] as Float32Array).length; cell++) {
			const difference = Math.abs(
				((a[month] as Float32Array)[cell] as number) -
					((b[month] as Float32Array)[cell] as number),
			);
			if (!Number.isNaN(difference)) {
				largest = Math.max(largest, difference);
			}
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
		expect(first.currents).toEqual(solveGyres(EARTH, first.winds));
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
		expect(result.currents).toBe(final.currents);
		expect(result.changeC).toBe(final.changeC);
		expect(result.dayLengthHours).toBe(EARTH.planet.dayLengthHours);
	});

	it('gives the passes’ temperature and winds together: the winds are those of the temperature', () => {
		for (const pass of earth().passes) {
			expect(pass.winds).toEqual(solveWinds(EARTH, pass.temperature.months));
		}
	});

	it('solves each pass as temperature, winds, currents, the temperature carrying heat along the pass before’s winds and currents and cooled by those winds’ upwelling', () => {
		const [first, second] = earth().passes as [
			ClimateProgress,
			ClimateProgress,
		];
		const flows = first.winds.east.map((east, month) =>
			flowingPartForSolve(
				64,
				64,
				east,
				first.winds.north[month] as Float32Array,
				new Float64Array(getGrid(FLOWING_RESOLUTION).cellCount),
			),
		);
		const temperature = solveTemperature(EARTH, {
			model: COARSE,
			start: first.temperature,
			winds: { flows },
			currents: {
				flows: first.currents.flows,
				depthM: DEFAULT_GYRE_SETTINGS.layerDepthM,
			},
			upwelling: upwelling(EARTH, first.winds),
		});
		expect(temperature.upwellingW).toBeGreaterThan(0);
		expect(second.temperature.months).toEqual(temperature.months);
		expect(second.temperature.seaMonths).toEqual(temperature.seaMonths);
		expect(second.winds).toEqual(solveWinds(EARTH, temperature.months));
		expect(second.currents).toEqual(
			solveGyres(EARTH, second.winds, {
				guess: first.currents.streamfunction,
			}),
		);
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

	it('settles at the second pass, not the first, when carried on from a settled result for the world as it is', () => {
		const again = run(EARTH, { model: COARSE, start: earth().result });
		// The first pass is small enough in change, and still does not settle.
		const first = again.passes[0] as ClimateProgress;
		expect(first.changeC).toBeLessThanOrEqual(
			TEMPERATURE_MODEL.climateToleranceC,
		);
		expect(first.settled).toBe(false);
		expect(first.last).toBe(false);
		expect(again.passes).toHaveLength(2);
		expect(again.result.settled).toBe(true);
		expect(again.result.changeC).toBeLessThanOrEqual(
			TEMPERATURE_MODEL.climateToleranceC,
		);
		// The largest change in some cell is several times the
		// root-mean-square change: the rule is the rms, not the largest.
		const largest = largestDifference(
			first.temperature.months,
			earth().result.temperature.months,
		);
		expect(largest).toBeGreaterThan(3 * (first.changeC as number));
		expect(largest).toBeLessThan(0.5);
	});

	it('carries on from a start with no currents, or with currents across what is now land, as from the currents of its winds', () => {
		const start = earth().result;
		const once = { ...COARSE, climateMaxPasses: 1 };
		const carried = solveClimate(EARTH, { model: once, start });
		const { currents: _, ...withoutCurrents } = start;
		const without = solveClimate(EARTH, {
			model: once,
			start: withoutCurrents,
		});
		const across = solveClimate(EARTH, {
			model: once,
			start: {
				...start,
				currents: {
					...start.currents,
					flows: start.currents.flows.map((month) =>
						new Float64Array(month.length).fill(1),
					),
				},
			},
		});
		// The currents worked out afresh are those of the start's winds, to the
		// gyres' tolerance.
		for (const other of [without, across]) {
			expect(
				largestDifference(other.temperature.months, carried.temperature.months),
			).toBeLessThan(0.05);
		}
	});

	it('carries the sea’s own temperature in its result, NaN over land, and on from a start', () => {
		const { temperature } = earth().result;
		expect(temperature.seaMonths).toHaveLength(MONTHS_PER_YEAR);
		const level = Math.fround(EARTH.seaLevel);
		let misplaced = 0;
		for (const month of temperature.seaMonths) {
			for (let cell = 0; cell < month.length; cell++) {
				const land = (EARTH.elevation[cell] as number) - level > 0;
				if (Number.isNaN(month[cell]) !== land) {
					misplaced++;
				}
			}
		}
		expect(misplaced).toBe(0);
		// The start's sea is carried on: a start whose sea is 2 K warmer is
		// further from settled, and takes more years to come back, and one
		// whose sea is not a temperature is refused.
		const start = earth().result;
		const withSea = (shift: (value: number) => number): ClimateStart => {
			const moved = (values: Float64Array): Float64Array =>
				values.map((value, cell) =>
					(EARTH.elevation[cell] as number) - level > 0 ? value : shift(value),
				);
			return {
				...start,
				temperature: {
					...start.temperature,
					state: {
						...start.temperature.state,
						seaTemperatureK: moved(start.temperature.state.seaTemperatureK),
						seaPreviousK: moved(start.temperature.state.seaPreviousK),
					},
				},
			};
		};
		const once = { ...COARSE, climateMaxPasses: 1 };
		const plain = solveClimate(EARTH, { model: once, start });
		const warmed = solveClimate(EARTH, {
			model: once,
			start: withSea((value) => value + 2),
		});
		expect(warmed.temperature.yearsRun).toBeGreaterThan(
			plain.temperature.yearsRun,
		);
		expect(() =>
			solveClimate(EARTH, {
				model: once,
				start: withSea(() => Number.NaN),
			}),
		).toThrow(RangeError);
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
			{
				...good,
				temperature: {
					...good.temperature,
					seaMonths: good.temperature.seaMonths.slice(1),
				},
			},
			{
				...good,
				temperature: {
					...good.temperature,
					seaMonths: good.temperature.seaMonths.map(() => new Float32Array(5)),
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
			{
				...good,
				currents: { ...good.currents, flows: good.currents.flows.slice(1) },
			},
			{
				...good,
				currents: {
					...good.currents,
					streamfunction: good.currents.streamfunction.map(
						() => new Float64Array(4),
					),
				},
			},
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
	it('settles after the second pass with the temperature of the first on a planet with no coast, whose currents are still', () => {
		const ocean = createBlankWorld(64);
		const model = { ...COARSE, windHeatCapacity: 0 };
		const { result, passes } = run(ocean, { model });
		expect(result.passes).toBe(2);
		expect(result.settled).toBe(true);
		expect(
			result.currents.flows.every((month) => month.every((flow) => flow === 0)),
		).toBe(true);
		const today = solveTemperature(ocean, { model });
		expect(
			largestDifference(result.temperature.months, today.months),
		).toBeLessThan(
			model.solverToleranceK + TEMPERATURE_MODEL.climateToleranceC,
		);
		expect(passes[0]?.temperature.months).toEqual(today.months);
	});

	it('carries the sea’s heat along the currents alone on the Earth, and settles within the passes allowed', () => {
		const model = { ...COARSE, windHeatCapacity: 0 };
		const { result, passes } = run(EARTH, { model });
		expect(result.settled).toBe(true);
		expect(result.passes).toBeGreaterThan(2);
		expect(result.passes).toBeLessThanOrEqual(model.climateMaxPasses);
		expect(
			largestDifference(
				(passes[0] as ClimateProgress).temperature.seaMonths,
				(passes[1] as ClimateProgress).temperature.seaMonths,
			),
		).toBeGreaterThan(1);
	});
});

// Two runs of six passes each: over three minutes under coverage.
describe('solveClimate when the winds and the temperature chase each other', {
	timeout: 3 * SOLVE_TIMEOUT_MS,
}, () => {
	// A generated world with the thermal highs and lows at 3.5 hPa a kelvin,
	// five times the winds' default: the loop does not settle, its change
	// grows from the fourth pass to the fifth (0.82 to 0.86 °C) and, left
	// whole, grows again to the sixth (1.05 °C).
	const WORLD = generateWorld({ resolution: 64, seed: 1, landFraction: 0.3 });
	const MODEL = { ...COARSE, climateMaxPasses: 6 };
	const WINDS = { thermalHpaPerK: 3.5 };

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
		expect(
			wholePasses
				.slice(2, 4)
				.every(
					(pass, index) =>
						(pass.changeC as number) <=
						((wholePasses[index + 1] as ClimateProgress).changeC as number),
				),
		).toBe(true);
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
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			for (let cell = 0; cell < 64 * 64 * 6; cell += 7) {
				const from = (before.seaMonths[month] as Float32Array)[cell] as number;
				const to = (pass.seaMonths[month] as Float32Array)[cell] as number;
				const value = (applied.seaMonths[month] as Float32Array)[
					cell
				] as number;
				if (Number.isNaN(to)) {
					// Land, in both.
					expect(value).toBeNaN();
				} else {
					expect(value - (from + 0.5 * (to - from))).toBeCloseTo(0, 3);
				}
			}
		}
		for (const key of [
			'temperatureK',
			'previousK',
			'seaTemperatureK',
			'seaPreviousK',
		] as const) {
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
		// And the currents of those winds.
		expect((halfPasses[4] as ClimateProgress).currents).toEqual(
			solveGyres(WORLD, (halfPasses[4] as ClimateProgress).winds, {
				guess: (halfPasses[3] as ClimateProgress).currents.streamfunction,
			}),
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
