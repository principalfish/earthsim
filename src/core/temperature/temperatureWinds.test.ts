/**
 * Heat carried by the wind in the temperature solve: what the `winds`
 * option does to the Earth and to the worlds around it.
 */

import { describe, expect, it } from 'vitest';
import { readEarthDataFile } from '../../../scripts/earth/dataFile.mjs';
import { decodeEarth, earthWorld } from '../earth/earth';
import { coarsenWorld } from '../grid/coarsen';
import { cellAt, getGrid, latLonToDirection } from '../grid/grid';
import { MONTHS_PER_YEAR } from '../planet/insolation';
import { flowingPart } from '../wind/flowing';
import { solveWinds } from '../wind/solve';
import {
	conditionsMatch,
	type SolveTemperatureOptions,
	solveTemperature,
	TEMPERATURE_MODEL,
	temperatureConditions,
} from './temperature';

/** Allows for coverage instrumentation, which makes the solves slower. */
const SOLVE_TIMEOUT_MS = 120_000;

const N = 64;
const grid = getGrid(N);

/** One step a month, solved to 0.05 K: several times quicker than the default. */
const COARSE_MODEL = {
	...TEMPERATURE_MODEL,
	stepsPerMonth: 1,
	solverToleranceK: 0.05,
};

const DATA = decodeEarth(readEarthDataFile());
const EARTH = earthWorld(DATA, N);

/** A value worked out on first use and then shared. */
const shared = <T>(make: () => T): (() => T) => {
	let value: T | undefined;
	return () => {
		value ??= make();
		return value;
	};
};

const withoutWinds = shared(() =>
	solveTemperature(EARTH, { model: COARSE_MODEL }),
);

/** The flowing part of the winds of the Earth as it is without any. */
const earthFlows = shared(() => {
	const winds = solveWinds(EARTH, withoutWinds().months);
	return winds.east.map((east, month) =>
		flowingPart(grid, east, winds.north[month] as Float32Array),
	);
});

const withWinds = (windHeatCapacity: number) =>
	solveTemperature(EARTH, {
		model: { ...COARSE_MODEL, windHeatCapacity },
		winds: { flows: earthFlows() },
	});

const withDefaultWinds = shared(() =>
	withWinds(TEMPERATURE_MODEL.windHeatCapacity),
);
const withMoreWinds = shared(() =>
	withWinds(5 * TEMPERATURE_MODEL.windHeatCapacity),
);

/** The cell at a latitude and longitude in degrees. */
const placeAt = (latitude: number, longitude: number): number =>
	cellAt(grid, latLonToDirection(latitude, longitude));

const WESTERN_EUROPE = placeAt(52, 2);
const EAST_ASIA = placeAt(40, 125);
const EASTERN_NORTH_AMERICA = placeAt(40, -78);
const WESTERN_NORTH_AMERICA = placeAt(47, -122);

const JANUARY = 0;

/** A month's change at a place from carrying heat along the winds. */
const change = (
	result: { months: readonly Float32Array[] },
	place: number,
	month = JANUARY,
): number =>
	((result.months[month] as Float32Array)[place] as number) -
	((withoutWinds().months[month] as Float32Array)[place] as number);

/** The area-weighted root-mean-square change of a whole year. */
const rmsChange = (result: { months: readonly Float32Array[] }): number => {
	let squares = 0;
	let area = 0;
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const difference =
				((result.months[month] as Float32Array)[cell] as number) -
				((withoutWinds().months[month] as Float32Array)[cell] as number);
			squares += (grid.areas[cell] as number) * difference * difference;
			area += grid.areas[cell] as number;
		}
	}
	return Math.sqrt(squares / area);
};

describe('solveTemperature with winds', { timeout: SOLVE_TIMEOUT_MS }, () => {
	it('gives mild west coasts and cold east coasts at mid-latitudes in January', () => {
		const result = withDefaultWinds();
		expect(result.converged).toBe(true);
		// The winds carry the sea's warmth over western Europe and western
		// North America, and the continents' cold over East Asia and the
		// east of North America.
		expect(change(result, WESTERN_EUROPE)).toBeGreaterThan(1);
		expect(change(result, WESTERN_NORTH_AMERICA)).toBeGreaterThan(1);
		expect(change(result, EAST_ASIA)).toBeLessThan(-5);
		expect(change(result, EASTERN_NORTH_AMERICA)).toBeLessThan(-1);
	});

	it('changes the answer more at a greater heat capacity of the moving air', () => {
		const smaller = rmsChange(withDefaultWinds());
		const larger = rmsChange(withMoreWinds());
		expect(smaller).toBeGreaterThan(0.5);
		expect(larger).toBeGreaterThan(smaller + 0.5);
		expect(withMoreWinds().converged).toBe(true);
	});

	it('is the solve with no winds, bit for bit, at a heat capacity of 0 or with none given', () => {
		const plain = withoutWinds();
		const zero = withWinds(0);
		expect(zero.months).toEqual(plain.months);
		expect(zero.state).toEqual(plain.state);
		const none = solveTemperature(EARTH, { model: COARSE_MODEL });
		expect(none.months).toEqual(plain.months);
	});

	it('is nearly the solve with no winds where there are no flows', () => {
		const flows = Array.from(
			{ length: MONTHS_PER_YEAR },
			() => new Float64Array(4 * grid.cellCount),
		);
		const result = solveTemperature(EARTH, {
			model: COARSE_MODEL,
			winds: { flows },
		});
		expect(rmsChange(result)).toBeLessThan(0.01);
	});

	it('carries on from the state of a solve with winds, settling in a year', () => {
		const first = withDefaultWinds();
		const again = solveTemperature(EARTH, {
			model: { ...COARSE_MODEL },
			winds: { flows: earthFlows() },
			start: { state: first.state, solvedFor: first.solvedFor },
		});
		expect(again.converged).toBe(true);
		expect(again.yearsRun).toBeLessThanOrEqual(2);
		expect(first.yearsRun).toBeGreaterThan(again.yearsRun);
	});

	it('solves a world of 128 on the grid of 64 with the winds on that grid, as the coarsened world', () => {
		const world = earthWorld(DATA, 128);
		const options: SolveTemperatureOptions = {
			model: COARSE_MODEL,
			maxYears: 1,
			winds: { flows: earthFlows() },
		};
		const fine = solveTemperature(world, options);
		const coarse = solveTemperature(coarsenWorld(world), options);
		expect(fine.state).toEqual(coarse.state);
		expect(fine.months).toHaveLength(MONTHS_PER_YEAR);
		expect((fine.months[0] as Float32Array).length).toBe(6 * 128 * 128);
	});

	it('keeps every value finite and above absolute zero on the coldest world', () => {
		const result = solveTemperature(
			{
				...EARTH,
				planet: {
					...EARTH.planet,
					axialTiltDeg: 90,
					starBrightness: 0.1,
					starMass: 0.1,
					orbitDistanceAu: 3,
					greenhouseStrength: 0,
				},
			},
			{ model: COARSE_MODEL, maxYears: 1, winds: { flows: earthFlows() } },
		);
		for (const month of result.months) {
			for (const value of month) {
				expect(Number.isFinite(value)).toBe(true);
				// The months are air temperatures: the cosmic background, 2.7 K,
				// the least the model holds at sea level, less at most half of it
				// for the lapse cooling of high ground, so 1.35 K.
				expect(value).toBeGreaterThanOrEqual(1.35 - 273.15 - 1e-4);
			}
		}
	});

	it('refuses winds that are not twelve flows of four values a cell of the grid solved on, or not finite', () => {
		const good = earthFlows();
		const solve = (flows: unknown) =>
			solveTemperature(EARTH, {
				model: COARSE_MODEL,
				winds: { flows } as never,
			});
		expect(() => solve(good.slice(0, 11))).toThrow(RangeError);
		expect(() => solve(undefined)).toThrow(RangeError);
		expect(() => solve([...good.slice(0, 11), new Float64Array(5)])).toThrow(
			/month 12/,
		);
		const broken = Float64Array.from(good[3] as Float64Array);
		broken[11] = Number.NaN;
		expect(() =>
			solve([...good.slice(0, 3), broken, ...good.slice(4)]),
		).toThrow(/finite/);
		// A world of 128 is solved on 64, so flows on 128 do not fit; nor
		// do flows on 64 for a solve on the world's own grid.
		expect(() =>
			solveTemperature(earthWorld(DATA, 128), {
				model: COARSE_MODEL,
				fullResolution: true,
				winds: { flows: good },
			}),
		).toThrow(RangeError);
	});
});

describe('conditionsMatch', () => {
	const record = temperatureConditions(EARTH);

	it('names the world’s own record, in any key order and with keys to spare, and any day length', () => {
		expect(conditionsMatch(EARTH, record)).toBe(true);
		const reordered = {
			planet: Object.fromEntries(Object.entries(record.planet).reverse()),
			seaLevel: record.seaLevel,
			extra: 1,
		};
		expect(conditionsMatch(EARTH, reordered as never)).toBe(true);
		const slower = {
			...EARTH,
			planet: { ...EARTH.planet, dayLengthHours: 90 },
		};
		expect(conditionsMatch(slower, record)).toBe(true);
	});

	it('does not name a world of another sea level or another setting the temperature reads', () => {
		expect(
			conditionsMatch({ ...EARTH, seaLevel: EARTH.seaLevel + 10 }, record),
		).toBe(false);
		expect(
			conditionsMatch(
				{ ...EARTH, planet: { ...EARTH.planet, axialTiltDeg: 30 } },
				record,
			),
		).toBe(false);
	});

	it('refuses a record that is not a sea level and the planet’s settings', () => {
		expect(() => conditionsMatch(EARTH, undefined as never)).toThrow(
			RangeError,
		);
		expect(() =>
			conditionsMatch(EARTH, { seaLevel: Number.NaN, planet: record.planet }),
		).toThrow(RangeError);
		expect(() =>
			conditionsMatch(EARTH, { seaLevel: 0, planet: undefined as never }),
		).toThrow(RangeError);
	});
});
