import { describe, expect, it } from 'vitest';
import {
	readEarthDataFile,
	readObservedTemperatureFile,
} from '../../scripts/earth/dataFile.mjs';
import { applyDab } from './brush';
import { compareFields } from './compare';
import { decodeEarth, earthWorld } from './earth';
import { generateWorld } from './generate';
import { cellAt, cellsWithin, getGrid, latLonToDirection } from './grid';
import { cellLatitudes, MONTHS_PER_YEAR } from './insolation';
import { decodeObservedTemperature, observedTemperature } from './observed';
import { PLANET_LIMITS, PLANET_SETTINGS, type PlanetSettings } from './planet';
import {
	coolingDrift,
	DEFAULT_MAX_YEARS,
	DEFAULT_TOLERANCE_K,
	estimateYearsLeft,
	lapseCooling,
	MAX_STEP_SECONDS,
	MIN_STEP_SECONDS,
	type SolveTemperatureOptions,
	solveTemperature,
	stepBefore,
	summariseTemperature,
	TEMPERATURE_MODEL,
	type TemperatureConditions,
	type TemperatureModel,
	type TemperatureProgress,
	type TemperatureResult,
	type TemperatureStart,
	type TemperatureState,
	temperatureConditions,
} from './temperature';
import {
	createBlankWorld,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	type World,
} from './world';

/**
 * Time allowed for each test here that solves a world's year. The slowest
 * test, the first to need the Earth's solve from nothing, takes about a
 * second, and coverage instrumentation makes it up to seven times slower,
 * which the default five seconds does not allow. Every assertion is on
 * values or years, never on time.
 */
const SOLVE_TIMEOUT_MS = 30_000;

const N = 64;
const grid = getGrid(N);
const { cellCount, areas } = grid;
const latitudes = cellLatitudes(grid);

const JANUARY = 0;
const JULY = 6;
const AUGUST = 7;

/**
 * Numerics for tests that compare settings with each other, not with a
 * fixed value: one step a month, solved to 0.05 K, which keeps every
 * comparison's direction and costs well under half as much.
 */
const COARSE: SolveTemperatureOptions = {
	model: { ...TEMPERATURE_MODEL, stepsPerMonth: 1, solverToleranceK: 0.05 },
};

/** A value worked out on first use and then shared. */
const shared = <T>(make: () => T): (() => T) => {
	let value: T | undefined;
	return () => {
		value ??= make();
		return value;
	};
};

/** Area-weighted mean of a field over the cells a test picks. */
const meanWhere = (
	field: ArrayLike<number>,
	picks: (cell: number) => boolean = () => true,
): number => {
	let total = 0;
	let area = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		if (picks(cell)) {
			total += (areas[cell] as number) * (field[cell] as number);
			area += areas[cell] as number;
		}
	}
	return total / area;
};

const globalAnnualMean = (result: TemperatureResult): number =>
	meanWhere(summariseTemperature(result.months).annualMean);

/** The largest difference between two sets of monthly fields. */
const largestDifference = (
	a: readonly Float32Array[],
	b: readonly Float32Array[],
): number => {
	let largest = 0;
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const first = a[month] as Float32Array;
		const second = b[month] as Float32Array;
		for (let cell = 0; cell < cellCount; cell++) {
			largest = Math.max(
				largest,
				Math.abs((first[cell] as number) - (second[cell] as number)),
			);
		}
	}
	return largest;
};

const everyValueFinite = (result: TemperatureResult): boolean =>
	result.months.every((field) =>
		field.every((value) => Number.isFinite(value)),
	) &&
	result.state.temperatureK.every((value) => Number.isFinite(value)) &&
	Number.isFinite(result.finalChangeK);

const withPlanet = (world: World, planet: Partial<PlanetSettings>): World => ({
	...world,
	planet: { ...world.planet, ...planet },
});

/** A world with no sea: every cell 200 m above sea level. */
const ALL_LAND: World = {
	...createBlankWorld(N),
	elevation: new Float32Array(cellCount).fill(200),
};

const BLANK = createBlankWorld(N);

/** A blank ocean world with the axis upright: no seasons. */
const seasonlessOcean = (planet: Partial<PlanetSettings> = {}): World =>
	withPlanet(BLANK, { axialTiltDeg: 0, ...planet });

const EARTH = earthWorld(decodeEarth(readEarthDataFile()), N);
const GENERATED = generateWorld({ resolution: N, seed: 7, landFraction: 0.3 });
const GENERATED_ELEVATION = Float32Array.from(GENERATED.elevation);

/** The generated world around a bright star, its axis on its side. */
const GENERATED_HOT = withPlanet(GENERATED, {
	axialTiltDeg: 90,
	starBrightness: 10,
	starMass: 0.1,
	orbitDistanceAu: 0.3,
});

/** The solves several tests read, each run once. */
const earth = shared(() => solveTemperature(EARTH));
const blank = shared(() => solveTemperature(BLANK));
const blankOneYear = shared(() =>
	solveTemperature(BLANK, { ...COARSE, maxYears: 1 }),
);
const blankTwoYears = shared(() =>
	solveTemperature(BLANK, { ...COARSE, maxYears: 2 }),
);
const generatedHot = shared(() => solveTemperature(GENERATED_HOT, COARSE));
const seasonless = shared(() =>
	solveTemperature(seasonlessOcean(), { maxYears: 1 }),
);
const seasonlessCoarse = shared(() =>
	solveTemperature(seasonlessOcean(), { ...COARSE, maxYears: 1 }),
);

/** The hottest corner of the planet settings. */
const HOTTEST: Partial<PlanetSettings> = {
	axialTiltDeg: 90,
	starBrightness: 10,
	starMass: 10,
	orbitDistanceAu: 0.3,
	greenhouseStrength: 3,
};

/** A year of the Earth at the hottest corner, from nothing. */
const earthHottest = shared(() =>
	solveTemperature(withPlanet(EARTH, HOTTEST), { ...COARSE, maxYears: 1 }),
);

/** A coarse year of the Earth from nothing, which several tests compare with. */
const earthYear = shared(() =>
	solveTemperature(EARTH, { ...COARSE, maxYears: 1 }),
);

/** The world with its sea level at the given height, in metres. */
const atSeaLevel = (world: World, seaLevel: number): World => ({
	...world,
	seaLevel,
});

/** The Congo basin: land warm enough all year that snow never comes. */
const CONGO = cellAt(grid, latLonToDirection(0, 22));

/** The Earth with the Congo cell raised by a kilometre, from its answer. */
const raisedCongo = shared(() => {
	const raised = { ...EARTH, elevation: Float32Array.from(EARTH.elevation) };
	raised.elevation[CONGO] = (raised.elevation[CONGO] as number) + 1000;
	return solveTemperature(raised, {
		start: { state: earth().state, solvedFor: earth().solvedFor },
	});
});

describe('solveTemperature on the Earth', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	it('converges within the cap', () => {
		const { converged, yearsRun, finalChangeK } = earth();
		expect(converged).toBe(true);
		expect(yearsRun).toBeLessThan(DEFAULT_MAX_YEARS);
		expect(finalChangeK).toBeLessThan(DEFAULT_TOLERANCE_K);
	});

	it('gives twelve fields of one finite value per cell', () => {
		expect(earth().months).toHaveLength(MONTHS_PER_YEAR);
		for (const field of earth().months) {
			expect(field).toBeInstanceOf(Float32Array);
			expect(field).toHaveLength(cellCount);
		}
		expect(everyValueFinite(earth())).toBe(true);
	});

	it('ends in a state of one plausible temperature per cell', () => {
		const { temperatureK, previousK, stepSeconds } = earth().state;
		for (const values of [temperatureK, previousK]) {
			expect(values).toBeInstanceOf(Float64Array);
			expect(values).toHaveLength(cellCount);
			expect(values.every((value) => value > 150 && value < 350)).toBe(true);
		}
		expect(stepSeconds).toBeCloseTo((365.25 * 86_400) / 24, 3);
	});

	it('has a global annual mean between 10 and 18 °C', () => {
		const mean = globalAnnualMean(earth());
		expect(mean).toBeGreaterThan(10);
		expect(mean).toBeLessThan(18);
	});

	it('is above 20 °C in the tropics', () => {
		const { annualMean } = summariseTemperature(earth().months);
		expect(
			meanWhere(annualMean, (cell) => Math.abs(latitudes[cell] as number) < 20),
		).toBeGreaterThan(20);
	});

	it('is below -10 °C at both poles in their winter', () => {
		const north = (cell: number): boolean => (latitudes[cell] as number) > 80;
		const south = (cell: number): boolean => (latitudes[cell] as number) < -80;
		const { months } = earth();
		expect(meanWhere(months[JANUARY] as Float32Array, north)).toBeLessThan(-10);
		expect(meanWhere(months[JULY] as Float32Array, south)).toBeLessThan(-10);
	});

	it('is warmest in the northern hemisphere in July or August', () => {
		const north = (cell: number): boolean => (latitudes[cell] as number) > 0;
		const means = earth().months.map((field) => meanWhere(field, north));
		const warmest = means.indexOf(Math.max(...means));
		expect([JULY, AUGUST]).toContain(warmest);
	});

	it('gives a continent interior a larger seasonal range than the ocean at its latitude', () => {
		const { range } = summariseTemperature(earth().months);
		const siberia = cellAt(grid, latLonToDirection(55, 100));
		const pacific = cellAt(grid, latLonToDirection(55, -160));
		expect(EARTH.elevation[siberia]).toBeGreaterThan(EARTH.seaLevel);
		expect(EARTH.elevation[pacific]).toBeLessThan(EARTH.seaLevel);
		expect(range[siberia]).toBeGreaterThan(2 * (range[pacific] as number));
	});

	it('is within a loose ceiling of the observed temperature', () => {
		// The first tuned run gave a root-mean-square error of 3.9 K for the
		// annual mean and from 3.6 to 6.5 K for single months, with the
		// global mean 0.15 K below the observed. The ceilings leave room for
		// later changes to the model without letting it drift far.
		const observed = observedTemperature(
			decodeObservedTemperature(readObservedTemperatureFile()),
			N,
		);
		const { months, annual } = compareFields(earth().months, observed, grid);
		expect(annual.rmsDifference).toBeLessThan(5);
		expect(Math.abs(annual.meanDifference)).toBeLessThan(2);
		for (const month of months) {
			expect(month.rmsDifference).toBeLessThan(8);
		}
	});

	it('cools a cell raised by a kilometre by the lapse rate', () => {
		expect(EARTH.elevation[CONGO]).toBeGreaterThan(EARTH.seaLevel);
		const expected = -1000 * TEMPERATURE_MODEL.lapseRate;
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const before = earth().months[month]?.[CONGO] as number;
			const after = raisedCongo().months[month]?.[CONGO] as number;
			expect(after - before).toBeCloseTo(expected, 1);
		}
	});

	it('settles after a small terrain edit in fewer years than the unedited Earth took from nothing', () => {
		// The raised Congo cell, carried on from the Earth's answer: the edit
		// is too small to set the state aside. Cooling by exactly the lapse
		// rate, as tested above, shows it settled to the right answer.
		const warm = raisedCongo();
		expect(warm.converged).toBe(true);
		expect(warm.yearsRun).toBeLessThanOrEqual(2);
		expect(warm.yearsRun).toBeLessThan(earth().yearsRun);
	});

	it('converges in one or two years from its own state, to the same fields, ignoring any months and leaving the caller’s arrays as they were', () => {
		const { state } = earth();
		const before = {
			temperatureK: Float64Array.from(state.temperatureK),
			previousK: Float64Array.from(state.previousK),
			guessK: Float64Array.from(state.guessK),
			referenceCoolingK: Float64Array.from(state.referenceCoolingK),
		};
		// Months 40 K off the answer, which would show if they were read.
		const hot = Array.from({ length: MONTHS_PER_YEAR }, () =>
			new Float32Array(cellCount).fill(55),
		);
		const again = solveTemperature(EARTH, {
			start: { state, months: hot, solvedFor: earth().solvedFor },
		});
		expect(again.converged).toBe(true);
		expect(again.yearsRun).toBeLessThanOrEqual(2);
		// The first run gave 1 year and 0.04 K.
		expect(largestDifference(again.months, earth().months)).toBeLessThan(0.1);
		// The caller's arrays are copied, not changed.
		expect(state.temperatureK).toEqual(before.temperatureK);
		expect(state.previousK).toEqual(before.previousK);
		expect(state.guessK).toEqual(before.guessK);
		expect(state.referenceCoolingK).toEqual(before.referenceCoolingK);
	});

	it('sets aside a state whose rough guess lies far from the world’s, even under a record of the world', () => {
		// The record names the hottest planet, so only the rough guesses,
		// more than the fallback limit apart, tell the Earth's state from
		// that planet's.
		const hot = withPlanet(EARTH, HOTTEST);
		const cold = earthHottest();
		const start: TemperatureStart = {
			state: earth().state,
			solvedFor: temperatureConditions(hot),
		};
		expect(coolingDrift(hot, earth().state.referenceCoolingK)).toBe(0);
		const warm = solveTemperature(hot, { ...COARSE, start, maxYears: 1 });
		// The Earth's state is set aside: the same as from nothing.
		expect(warm.months).toEqual(cold.months);
		expect(warm.state).toEqual(cold.state);
		const carried = solveTemperature(hot, {
			...COARSE,
			start: warm,
			maxYears: 1,
		});
		expect(everyValueFinite(carried)).toBe(true);
		const { temperatureK } = carried.state;
		expect(temperatureK.every((value) => value > 300 && value < 2000)).toBe(
			true,
		);
	});

	it('corrects the year without overshooting when the planet changes and the start is only months', () => {
		// Months recorded for the hottest planet are not set aside, so the
		// year-end correction has to move the Earth's year to the hottest
		// planet's by itself: it once overshot to thousands of kelvin.
		const hot = withPlanet(EARTH, HOTTEST);
		const year = solveTemperature(hot, {
			...COARSE,
			start: { months: earth().months, solvedFor: temperatureConditions(hot) },
			maxYears: 1,
		});
		const { temperatureK, previousK } = year.state;
		for (const values of [temperatureK, previousK]) {
			expect(values.every((value) => value > 100 && value < 2000)).toBe(true);
		}
		const next = solveTemperature(hot, {
			...COARSE,
			start: year,
			maxYears: 1,
		});
		expect(everyValueFinite(next)).toBe(true);
	});
});

describe('solveTemperature on simple worlds', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	it('gives an ocean planet with an upright axis no seasons, symmetric and warmest at the equator', () => {
		const { annualMean, range } = summariseTemperature(seasonless().months);
		let largestRange = 0;
		for (const value of range) {
			largestRange = Math.max(largestRange, value);
		}
		expect(largestRange).toBeLessThan(0.01);
		// Mirror cells: the centre (x, y, z) has its mirror at (x, y, -z).
		const { centres } = grid;
		let largestAsymmetry = 0;
		let warmest = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const mirror = cellAt(grid, [
				centres[3 * cell] as number,
				centres[3 * cell + 1] as number,
				-(centres[3 * cell + 2] as number),
			]);
			largestAsymmetry = Math.max(
				largestAsymmetry,
				Math.abs((annualMean[cell] as number) - (annualMean[mirror] as number)),
			);
			if ((annualMean[cell] as number) > (annualMean[warmest] as number)) {
				warmest = cell;
			}
		}
		expect(largestAsymmetry).toBeLessThan(0.01);
		expect(Math.abs(latitudes[warmest] as number)).toBeLessThan(5);
	});

	it.each([
		['star brightness', 'starBrightness', [0.5, 2]],
		['nearness of the orbit', 'orbitDistanceAu', [1.4, 0.7]],
		['greenhouse strength', 'greenhouseStrength', [0, 2]],
	] as const)(
		'warms the global mean with %s, at every step of three',
		(_, setting, [low, high]) => {
			// The middle value of each is Earth's, the shared seasonless solve.
			const mean = (value: number): number =>
				globalAnnualMean(
					solveTemperature(seasonlessOcean({ [setting]: value }), {
						...COARSE,
						maxYears: 1,
					}),
				);
			const middle = globalAnnualMean(seasonlessCoarse());
			expect(middle).toBeGreaterThan(mean(low));
			expect(mean(high)).toBeGreaterThan(middle);
		},
	);

	it('gives land a larger seasonal range in a longer year and a smaller one in a shorter', () => {
		// Star masses 0.5, 1 and 2 give years of 516, 365 and 258 days. Each
		// runs a year from nothing, which is plenty for land, as it settles
		// within weeks.
		const extratropicalLand = (cell: number): boolean =>
			(EARTH.elevation[cell] as number) > EARTH.seaLevel &&
			Math.abs(latitudes[cell] as number) > 30;
		const range = (result: TemperatureResult): number =>
			meanWhere(summariseTemperature(result.months).range, extratropicalLand);
		const year = (starMass: number): TemperatureResult =>
			solveTemperature(withPlanet(EARTH, { starMass }), {
				...COARSE,
				maxYears: 1,
			});
		const middle = range(year(1));
		expect(range(year(0.5))).toBeGreaterThan(middle);
		expect(range(year(2))).toBeLessThan(middle);
	});

	it.each([
		['a blank ocean', blank],
		['a generated world', () => solveTemperature(GENERATED, COARSE)],
		// Around a bright star with its axis on its side, in the coarser
		// numerics, which the generated world's other tests share.
		['a generated world around a bright star', generatedHot],
	])('converges within the cap on %s', (_, solve) => {
		const result = solve();
		expect(result.converged).toBe(true);
		expect(result.yearsRun).toBeLessThan(DEFAULT_MAX_YEARS);
		expect(everyValueFinite(result)).toBe(true);
	});

	it('does not change the world', () => {
		const planet = { ...GENERATED_HOT.planet };
		generatedHot();
		expect(GENERATED_HOT.elevation).toEqual(GENERATED_ELEVATION);
		expect(GENERATED_HOT.planet).toEqual(planet);
	});

	it('does not count a year whose steps could not be solved', () => {
		// A tolerance so loose that any year passes, so that only whether the
		// steps were solved decides.
		const loose = { maxYears: 1, tolerance: 1e3 };
		const capped = solveTemperature(seasonlessOcean(), {
			...loose,
			model: {
				...TEMPERATURE_MODEL,
				stepsPerMonth: 1,
				solverToleranceK: 1e-3,
				solverMaxIterations: 1,
			},
		});
		const uncapped = solveTemperature(seasonlessOcean(), {
			...loose,
			model: {
				...TEMPERATURE_MODEL,
				stepsPerMonth: 1,
				solverToleranceK: 1e-3,
			},
		});
		expect(capped.converged).toBe(false);
		expect(uncapped.converged).toBe(true);
	});

	it('says so when the cap stops it short', () => {
		const result = blankOneYear();
		expect(result.yearsRun).toBe(1);
		expect(result.converged).toBe(false);
		expect(result.finalChangeK).toBeGreaterThan(DEFAULT_TOLERANCE_K);
	});

	it('gives the same output for the same input, bit for bit', () => {
		const again = solveTemperature(BLANK, { ...COARSE, maxYears: 1 });
		expect(again.months).toEqual(blankOneYear().months);
		expect(again.state).toEqual(blankOneYear().state);
		expect(again.finalChangeK).toBe(blankOneYear().finalChangeK);
	});

	it('carries a strongly seasonal hot planet on from its own answer in a year', () => {
		// Its answer lies far from its annual-mean guess, which must not set
		// the state aside: only the two worlds' guesses are compared.
		const again = solveTemperature(GENERATED_HOT, {
			...COARSE,
			start: generatedHot(),
		});
		expect(generatedHot().converged).toBe(true);
		expect(again.yearsRun).toBe(1);
		expect(largestDifference(again.months, generatedHot().months)).toBeLessThan(
			DEFAULT_TOLERANCE_K,
		);
	});

	it('carries a strongly seasonal hot planet on after a small terrain edit', () => {
		const edited = {
			...GENERATED_HOT,
			elevation: Float32Array.from(GENERATED_HOT.elevation),
		};
		for (const cell of cellsWithin(
			grid,
			latLonToDirection(20, 30),
			(2.5 * Math.PI) / 180,
		)) {
			edited.elevation[cell] = (edited.elevation[cell] as number) + 500;
		}
		const warm = solveTemperature(edited, {
			...COARSE,
			start: generatedHot(),
		});
		const cold = solveTemperature(edited, COARSE);
		expect(warm.converged).toBe(true);
		expect(warm.yearsRun).toBeLessThanOrEqual(2);
		expect(largestDifference(warm.months, cold.months)).toBeLessThan(
			2 * DEFAULT_TOLERANCE_K,
		);
	});

	it('carries on from a one-year solve to the same result as a two-year solve, bit for bit', () => {
		const first = blankOneYear();
		const second = solveTemperature(BLANK, {
			...COARSE,
			start: first,
			maxYears: 1,
		});
		const both = blankTwoYears();
		expect(second.months).toEqual(both.months);
		expect(second.state).toEqual(both.state);
		expect(second.finalChangeK).toBe(both.finalChangeK);
	});

	it('still converges from a start that has only months, leaving them as they were', () => {
		const months = blank().months;
		const copies = months.map((field) => Float32Array.from(field));
		const again = solveTemperature(BLANK, {
			start: { months, solvedFor: blank().solvedFor },
		});
		expect(months).toEqual(copies);
		expect(again.converged).toBe(true);
		expect(again.yearsRun).toBeLessThanOrEqual(3);
		expect(largestDifference(again.months, blank().months)).toBeLessThan(0.2);
	});
});

describe('solveTemperature after a change of sea level or planet', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	// A start for another sea level or planet is set aside, so the result is
	// the one from nothing exactly, whatever the cap: a year of each solve
	// shows it, and costs least.
	const YEAR: SolveTemperatureOptions = { ...COARSE, maxYears: 1 };

	it('gives the answer from nothing after the sea level goes 6,000 m down and back', () => {
		const low = solveTemperature(atSeaLevel(EARTH, -6000), {
			...YEAR,
			start: earthYear(),
		});
		const back = solveTemperature(EARTH, { ...YEAR, start: low });
		expect(back).toEqual(earthYear());
	});

	it('gives the answer from nothing at each level on the way back up, in steps of 2,000 m', () => {
		let previous = earthYear();
		for (const level of [-2000, -4000, -6000]) {
			previous = solveTemperature(atSeaLevel(EARTH, level), {
				...YEAR,
				start: previous,
			});
		}
		for (const level of [-4000, -2000, 0]) {
			const world = atSeaLevel(EARTH, level);
			const warm = solveTemperature(world, { ...YEAR, start: previous });
			const cold = level === 0 ? earthYear() : solveTemperature(world, YEAR);
			expect(warm, `at ${level} m`).toEqual(cold);
			previous = warm;
		}
	});

	it('gives the answer from nothing after the star dims to 0.8 and back', () => {
		const dim = solveTemperature(withPlanet(EARTH, { starBrightness: 0.8 }), {
			...YEAR,
			start: earthYear(),
		});
		const back = solveTemperature(EARTH, { ...YEAR, start: dim });
		expect(back).toEqual(earthYear());
	});

	const own = (): TemperatureConditions => blankOneYear().solvedFor;
	const others: [string, () => TemperatureConditions][] = [
		['sea level', () => ({ ...own(), seaLevel: 10 })],
		...PLANET_SETTINGS.map((name): [string, () => TemperatureConditions] => [
			name,
			() => ({
				...own(),
				planet: { ...own().planet, [name]: own().planet[name] + 0.01 },
			}),
		]),
	];

	it.each(others)('sets aside a start recorded for another %s', (_, other) => {
		// Carried on, the year would be the second year from nothing.
		expect(blankTwoYears().months).not.toEqual(blankOneYear().months);
		const result = solveTemperature(BLANK, {
			...YEAR,
			start: { ...blankOneYear(), solvedFor: other() },
		});
		expect(result).toEqual(blankOneYear());
	});

	it('takes as many years from a start set aside as from nothing', () => {
		const result = solveTemperature(BLANK, {
			start: { ...blank(), solvedFor: { ...blank().solvedFor, seaLevel: -10 } },
		});
		expect(blank().yearsRun).toBeGreaterThan(1);
		expect(result).toEqual(blank());
	});

	it('sets aside a start of months alone recorded for another sea level', () => {
		const result = solveTemperature(BLANK, {
			...YEAR,
			start: {
				months: blankOneYear().months,
				solvedFor: { ...own(), seaLevel: 10 },
			},
		});
		expect(result).toEqual(blankOneYear());
	});

	it('sets aside a start recorded for another sea level before reading its state', () => {
		const malformed: TemperatureState = {
			...blankOneYear().state,
			temperatureK: new Float64Array(3),
			previousK: new Float64Array(3),
			guessK: new Float64Array(3),
			referenceCoolingK: new Float64Array(3),
		};
		const result = solveTemperature(BLANK, {
			...YEAR,
			start: { state: malformed, solvedFor: { ...own(), seaLevel: 10 } },
		});
		expect(result).toEqual(blankOneYear());
		expect(() =>
			solveTemperature(BLANK, {
				...YEAR,
				start: { state: malformed, solvedFor: own() },
			}),
		).toThrow(RangeError);
	});

	it('carries on a start recorded for the same sea level, compared as the single-precision number nearest it', () => {
		// 0.1 m is not a single-precision number; the world and the record
		// both hold it as it is.
		const result = solveTemperature(atSeaLevel(BLANK, 0.1), {
			...YEAR,
			start: { ...blankOneYear(), solvedFor: { ...own(), seaLevel: 0.1 } },
		});
		expect(result.months).toEqual(blankTwoYears().months);
		expect(result.solvedFor.seaLevel).toBe(Math.fround(0.1));
	});

	it('carries on a start recorded for the same planet, compared as brought within its limits', () => {
		// Every setting of the hottest corner is at a limit, so settings
		// beyond them name the same planet.
		const hot = withPlanet(EARTH, HOTTEST);
		const beyond: PlanetSettings = {
			axialTiltDeg: 95,
			starBrightness: 20,
			starMass: 11,
			orbitDistanceAu: 0.1,
			greenhouseStrength: 5,
		};
		const result = solveTemperature(hot, {
			...YEAR,
			start: {
				...earthHottest(),
				solvedFor: { seaLevel: EARTH.seaLevel, planet: beyond },
			},
		});
		expect(result.months).not.toEqual(earthHottest().months);
		expect(result.solvedFor).toEqual(earthHottest().solvedFor);
	});

	it('refuses a start without a record, or with a malformed one', () => {
		const { months, state } = earthYear();
		const record = temperatureConditions(EARTH);
		const { starMass: _, ...missing } = record.planet;
		const starts: unknown[] = [
			{ months, state },
			{ months, state, solvedFor: undefined },
			{ state, solvedFor: null },
			{ months, solvedFor: 'Earth' },
			{ state, solvedFor: { planet: record.planet } },
			{ state, solvedFor: { ...record, seaLevel: '0' } },
			{ state, solvedFor: { ...record, seaLevel: Number.NaN } },
			{ state, solvedFor: { ...record, seaLevel: Number.NEGATIVE_INFINITY } },
			{ state, solvedFor: { seaLevel: 0 } },
			{ state, solvedFor: { ...record, planet: null } },
			{ state, solvedFor: { ...record, planet: missing } },
			{
				months,
				solvedFor: {
					...record,
					planet: { ...record.planet, axialTiltDeg: '23.44' },
				},
			},
			{
				state,
				solvedFor: {
					...record,
					planet: {
						...record.planet,
						starBrightness: Number.POSITIVE_INFINITY,
					},
				},
			},
			{
				state,
				solvedFor: {
					...record,
					planet: { ...record.planet, greenhouseStrength: Number.NaN },
				},
			},
		];
		for (const start of starts) {
			expect(() =>
				solveTemperature(EARTH, { start: start as TemperatureStart }),
			).toThrow(RangeError);
		}
	});
});

describe('solveTemperature as the terrain drifts', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	const YEAR: SolveTemperatureOptions = { ...COARSE, maxYears: 1 };

	/** The Earth with every land cell raised by 100 m, `times` times over. */
	const landRaised = (times: number): World => {
		const raised = { ...EARTH, elevation: Float32Array.from(EARTH.elevation) };
		for (let cell = 0; cell < cellCount; cell++) {
			if ((EARTH.elevation[cell] as number) > EARTH.seaLevel) {
				raised.elevation[cell] =
					(EARTH.elevation[cell] as number) + 100 * times;
			}
		}
		return raised;
	};

	/** A year of the Earth with its land raised by 300 m, from nothing. */
	const raisedYear = shared(() => solveTemperature(landRaised(3), YEAR));

	/** The year's options with the drift limit given. */
	const withLimit = (limit: number): SolveTemperatureOptions => ({
		...YEAR,
		model: { ...(YEAR.model as TemperatureModel), terrainDriftLimitK: limit },
	});

	it('carries a run of small edits on until their drift passes the limit, and then starts afresh', () => {
		const reference = earthYear().state.referenceCoolingK;
		expect(reference).toEqual(lapseCooling(EARTH));
		const drifts = [1, 2, 3].map((times) =>
			coolingDrift(landRaised(times), reference),
		);
		const [one, two, three] = drifts as [number, number, number];
		// A limit between the second edit's drift and the third's, passed in
		// so that the test does not hang on the model's own.
		const limit = (two + three) / 2;
		const options = withLimit(limit);
		// Each edit on its own is well under the limit.
		expect(
			coolingDrift(landRaised(2), lapseCooling(landRaised(1))),
		).toBeCloseTo(one, 9);
		expect(one).toBeLessThan(limit);

		const first = solveTemperature(landRaised(1), {
			...options,
			start: earthYear(),
		});
		const second = solveTemperature(landRaised(2), {
			...options,
			start: first,
		});
		// Carried on: each passes on the reference it was given, as values.
		expect(first.state.referenceCoolingK).toEqual(reference);
		expect(second.state.referenceCoolingK).toEqual(reference);
		expect(second.state.referenceCoolingK).not.toBe(
			first.state.referenceCoolingK,
		);

		// Past the limit: the answer from nothing, its world the reference.
		const third = solveTemperature(landRaised(3), {
			...options,
			start: second,
		});
		expect(third).toEqual(raisedYear());
		expect(third.state.referenceCoolingK).toEqual(lapseCooling(landRaised(3)));

		// And the next edit carries on from that reference.
		const fourth = solveTemperature(landRaised(4), {
			...options,
			start: third,
		});
		expect(fourth.state.referenceCoolingK).toEqual(
			third.state.referenceCoolingK,
		);
	});

	it('sets aside a state whose terrain has drifted exactly to the limit', () => {
		const start = raisedYear();
		const drift = coolingDrift(EARTH, start.state.referenceCoolingK);
		expect(drift).toBeGreaterThan(0);
		const result = solveTemperature(EARTH, { ...withLimit(drift), start });
		expect(result).toEqual(earthYear());
	});

	it('carries no state on at a limit of 0, even for the same world', () => {
		const result = solveTemperature(EARTH, {
			...withLimit(0),
			start: earthYear(),
		});
		expect(result).toEqual(earthYear());
	});

	it('takes its own world’s cooling as the reference from a start of months alone', () => {
		const raised = landRaised(1);
		const result = solveTemperature(raised, {
			...YEAR,
			start: { months: earthYear().months, solvedFor: earthYear().solvedFor },
		});
		expect(result.state.referenceCoolingK).toEqual(lapseCooling(raised));
		expect(result.state.referenceCoolingK).not.toEqual(lapseCooling(EARTH));
	});

	it('carries an ordinary stroke on, settling in a year', () => {
		// Five dabs of the page's default brush, 500 km in radius and raising
		// 1,000 m at the centre, across central Africa.
		const stroked = { ...EARTH, elevation: Float32Array.from(EARTH.elevation) };
		for (const longitude of [14, 18, 22, 26, 30]) {
			applyDab(stroked, {
				direction: latLonToDirection(0, longitude),
				radiusKm: 500,
				strength: 1000,
				mode: 'raise',
			});
		}
		const { referenceCoolingK } = earth().state;
		expect(coolingDrift(stroked, referenceCoolingK)).toBeGreaterThan(0);
		expect(coolingDrift(stroked, referenceCoolingK)).toBeLessThan(
			TEMPERATURE_MODEL.terrainDriftLimitK,
		);
		const warm = solveTemperature(stroked, { start: earth() });
		expect(warm.converged).toBe(true);
		expect(warm.yearsRun).toBe(1);
		expect(warm.state.referenceCoolingK).toEqual(referenceCoolingK);
	});

	it('gives the answer from nothing after the whole surface is raised to a 3,000 m plateau and put back', () => {
		const plateau = {
			...EARTH,
			elevation: new Float32Array(cellCount).fill(3000),
		};
		expect(
			coolingDrift(plateau, earthYear().state.referenceCoolingK),
		).toBeGreaterThanOrEqual(TEMPERATURE_MODEL.terrainDriftLimitK);
		const raised = solveTemperature(plateau, { ...YEAR, start: earthYear() });
		expect(raised.state.referenceCoolingK).toEqual(lapseCooling(plateau));
		const back = solveTemperature(EARTH, { ...YEAR, start: raised });
		expect(back).toEqual(earthYear());
	});
});

describe('coolingDrift', () => {
	const reference = lapseCooling(EARTH);
	let totalArea = 0;
	for (const area of areas) {
		totalArea += area;
	}
	const isLand = (cell: number): boolean =>
		(EARTH.elevation[cell] as number) > EARTH.seaLevel;
	const edited = (change: (elevation: Float32Array) => void): World => {
		const world = { ...EARTH, elevation: Float32Array.from(EARTH.elevation) };
		change(world.elevation);
		return world;
	};

	it('is zero for the same world', () => {
		expect(coolingDrift(EARTH, reference)).toBe(0);
	});

	it('is the same either way round', () => {
		const there = coolingDrift(GENERATED, reference);
		expect(there).toBeGreaterThan(0);
		expect(coolingDrift(EARTH, lapseCooling(GENERATED))).toBe(there);
	});

	it('weights each cell by its area', () => {
		let smallest = -1;
		let largest = -1;
		for (let cell = 0; cell < cellCount; cell++) {
			if (isLand(cell)) {
				if (
					smallest < 0 ||
					(areas[cell] as number) < (areas[smallest] as number)
				) {
					smallest = cell;
				}
				if (
					largest < 0 ||
					(areas[cell] as number) > (areas[largest] as number)
				) {
					largest = cell;
				}
			}
		}
		expect(areas[largest] as number).toBeGreaterThan(
			1.2 * (areas[smallest] as number),
		);
		for (const cell of [smallest, largest]) {
			const raised = edited((elevation) => {
				elevation[cell] = (elevation[cell] as number) + 1000;
			});
			const lift =
				(raised.elevation[cell] as number) - (EARTH.elevation[cell] as number);
			expect(coolingDrift(raised, reference)).toBeCloseTo(
				(TEMPERATURE_MODEL.lapseRate * lift * (areas[cell] as number)) /
					totalArea,
				15,
			);
		}
	});

	it('counts the sea as having no cooling', () => {
		let sea = 0;
		while (isLand(sea)) {
			sea++;
		}
		const deeper = edited((elevation) => {
			elevation[sea] = (elevation[sea] as number) - 1000;
		});
		const shallower = edited((elevation) => {
			elevation[sea] = EARTH.seaLevel - 1;
		});
		expect(coolingDrift(deeper, reference)).toBe(0);
		expect(coolingDrift(shallower, reference)).toBe(0);
		// Land sunk beneath the sea counts its whole former cooling.
		expect(isLand(CONGO)).toBe(true);
		const sunk = edited((elevation) => {
			elevation[CONGO] = EARTH.seaLevel - 1;
		});
		expect(coolingDrift(sunk, reference)).toBeCloseTo(
			((reference[CONGO] as number) * (areas[CONGO] as number)) / totalArea,
			15,
		);
	});

	it('is the lapse rate times the lift times the share of land when every land cell is raised', () => {
		let landArea = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			if (isLand(cell)) {
				landArea += areas[cell] as number;
			}
		}
		const raised = edited((elevation) => {
			for (let cell = 0; cell < cellCount; cell++) {
				if (isLand(cell)) {
					elevation[cell] = (elevation[cell] as number) + 256;
				}
			}
		});
		// Within the rounding of single-precision elevations.
		expect(coolingDrift(raised, reference)).toBeCloseTo(
			(TEMPERATURE_MODEL.lapseRate * 256 * landArea) / totalArea,
			5,
		);
	});

	it('refuses a reference of the wrong form', () => {
		for (const bad of [
			new Float64Array(cellCount - 1),
			new Float32Array(cellCount),
			null,
		]) {
			expect(() => coolingDrift(EARTH, bad as unknown as Float64Array)).toThrow(
				RangeError,
			);
		}
	});
});

describe('lapseCooling', () => {
	it('is the lapse rate times the height above the sea on land, and nothing at sea', () => {
		const world = atSeaLevel(EARTH, 100);
		const expected = Float64Array.from(world.elevation, (elevation) =>
			elevation > 100 ? TEMPERATURE_MODEL.lapseRate * (elevation - 100) : 0,
		);
		expect(expected.some((value) => value > 0)).toBe(true);
		expect(expected.some((value) => value === 0)).toBe(true);
		expect(lapseCooling(world)).toEqual(expected);
	});

	it('takes the lapse rate of the model given', () => {
		const model = { ...TEMPERATURE_MODEL, lapseRate: 0 };
		expect(lapseCooling(EARTH, model).every((value) => value === 0)).toBe(true);
	});
});

describe('solveTemperature as each year finishes', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	it('tells of every year, ending with the last, and gives the same output bit for bit', () => {
		const reports: TemperatureProgress[] = [];
		const told = solveTemperature(GENERATED_HOT, {
			...COARSE,
			onYear: (progress) => reports.push(progress),
		});
		const quiet = generatedHot();
		expect(told.months).toEqual(quiet.months);
		expect(told.state).toEqual(quiet.state);
		expect(told.yearsRun).toBe(quiet.yearsRun);
		expect(told.finalChangeK).toBe(quiet.finalChangeK);

		// More than two years, so that some year in the middle is told of.
		expect(quiet.yearsRun).toBeGreaterThan(2);
		expect(reports.map((report) => report.yearsDone)).toEqual(
			Array.from({ length: quiet.yearsRun }, (_, year) => year + 1),
		);
		for (const report of reports) {
			expect(report.maxYears).toBe(DEFAULT_MAX_YEARS);
			expect(report.toleranceK).toBe(DEFAULT_TOLERANCE_K);
		}
		expect(reports.at(-1)?.changeK).toBe(quiet.finalChangeK);
		expect(reports.at(-1)?.estimatedYearsLeft).toBe(0);
		// The first year has no year before it to judge by.
		expect(reports[0]?.estimatedYearsLeft).toBeNull();
		for (const report of reports.slice(1, -1)) {
			const left = report.estimatedYearsLeft;
			if (left !== null) {
				expect(Number.isInteger(left)).toBe(true);
				expect(left).toBeGreaterThanOrEqual(1);
				expect(left).toBeLessThanOrEqual(DEFAULT_MAX_YEARS - report.yearsDone);
			}
		}
	});

	it('says the year that reaches the cap is the last', () => {
		const reports: TemperatureProgress[] = [];
		solveTemperature(BLANK, {
			...COARSE,
			maxYears: 1,
			onYear: (progress) => reports.push(progress),
		});
		expect(reports).toEqual([
			{
				yearsDone: 1,
				maxYears: 1,
				changeK: blankOneYear().finalChangeK,
				toleranceK: DEFAULT_TOLERANCE_K,
				estimatedYearsLeft: 0,
			},
		]);
	});

	it('ends with whatever the callback throws', () => {
		const thrown = new Error('stop here');
		let calls = 0;
		expect(() =>
			solveTemperature(BLANK, {
				...COARSE,
				maxYears: 3,
				onYear: () => {
					calls++;
					throw thrown;
				},
			}),
		).toThrow(thrown);
		expect(calls).toBe(1);
	});
});

describe('estimateYearsLeft', () => {
	it('counts the years until a change shrinking at the same rate is below the tolerance', () => {
		// 0.5, 0.25, 0.125, 0.0625, then 0.03125 is below 0.05: four years.
		expect(estimateYearsLeft(1, 0.5, 0.05, 50)).toBe(4);
		// 0.1 shrinking tenfold reaches 0.01, below 0.05, in one.
		expect(estimateYearsLeft(1, 0.1, 0.05, 50)).toBe(1);
		// Exactly at the tolerance is not below it.
		expect(estimateYearsLeft(0.1, 0.05, 0.05, 50)).toBe(1);
	});

	it('never says more than the cap allows', () => {
		// 0.7 shrinking by 0.7 a year is below 0.05 after eight more.
		expect(estimateYearsLeft(1, 0.7, 0.05, 50)).toBe(8);
		expect(estimateYearsLeft(1, 0.7, 0.05, 3)).toBe(3);
	});

	it('has no guess for a change that shrank by less than a quarter', () => {
		// Shrinking to three quarters is the slowest it goes by: ten more.
		expect(estimateYearsLeft(1, 0.75, 0.05, 50)).toBe(10);
		expect(estimateYearsLeft(1, 0.76, 0.05, 50)).toBeNull();
		// As in the third year of a solve of the Earth, which the fourth
		// then settles: not dozens of years to go.
		expect(estimateYearsLeft(0.7455, 0.7375, 0.05, 57)).toBeNull();
	});

	it('says one more year for a change already below the tolerance', () => {
		expect(estimateYearsLeft(1, 0.01, 0.05, 10)).toBe(1);
		expect(estimateYearsLeft(null, 0, 0.05, 10)).toBe(1);
	});

	it('has no basis in the first year, or when the change did not shrink', () => {
		expect(estimateYearsLeft(null, 1, 0.05, 10)).toBeNull();
		expect(estimateYearsLeft(1, 1, 0.05, 10)).toBeNull();
		expect(estimateYearsLeft(1, 2, 0.05, 10)).toBeNull();
		expect(estimateYearsLeft(Number.POSITIVE_INFINITY, 1, 0.05, 10)).toBeNull();
		expect(estimateYearsLeft(2, Number.NaN, 0.05, 10)).toBeNull();
	});
});

describe('solveTemperature at the extremes', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	const extremes = new Map<string, TemperatureResult>();
	/** A year at a setting from nothing, on the Earth; shared. */
	const extreme = (planet: Partial<PlanetSettings>): TemperatureResult => {
		const key = JSON.stringify(planet, (_, value) =>
			value === Number.POSITIVE_INFINITY ? 'Infinity' : value,
		);
		let result = extremes.get(key);
		if (result === undefined) {
			result = solveTemperature(withPlanet(EARTH, planet), {
				...COARSE,
				maxYears: 1,
			});
			extremes.set(key, result);
		}
		return result;
	};
	const settings = Object.keys(PLANET_LIMITS) as (keyof PlanetSettings)[];

	it.each(settings)(
		'keeps every value finite on the Earth with %s at either limit',
		(name) => {
			for (const value of [PLANET_LIMITS[name].min, PLANET_LIMITS[name].max]) {
				expect(everyValueFinite(extreme({ [name]: value }))).toBe(true);
			}
		},
	);

	const corners: [string, Partial<PlanetSettings>][] = [
		['hottest', HOTTEST],
		[
			'coldest',
			{
				axialTiltDeg: 90,
				starBrightness: 0.1,
				starMass: 0.1,
				orbitDistanceAu: 3,
				greenhouseStrength: 0,
			},
		],
	];

	it.each(corners)(
		'keeps every value finite at the %s corner on every kind of world',
		(_, planet) => {
			for (const world of [EARTH, BLANK, ALL_LAND]) {
				const result =
					world === EARTH && planet === HOTTEST
						? earthHottest()
						: solveTemperature(withPlanet(world, planet), {
								...COARSE,
								maxYears: 1,
							});
				expect(everyValueFinite(result)).toBe(true);
			}
		},
	);

	it('brings a setting beyond its limits to the limit', () => {
		expect(extreme({ starMass: 0 }).months).toEqual(
			extreme({ starMass: PLANET_LIMITS.starMass.min }).months,
		);
		expect(
			extreme({ starBrightness: Number.POSITIVE_INFINITY }).months,
		).toEqual(
			extreme({ starBrightness: PLANET_LIMITS.starBrightness.max }).months,
		);
	});

	it('refuses a setting that is not a number', () => {
		expect(() =>
			solveTemperature(withPlanet(EARTH, { axialTiltDeg: Number.NaN })),
		).toThrow(RangeError);
	});
});

describe('solveTemperature refuses what it cannot use', () => {
	/** A state of the Earth's shape, without solving anything. */
	const STATE: TemperatureState = {
		temperatureK: new Float64Array(cellCount).fill(280),
		previousK: new Float64Array(cellCount).fill(280),
		stepSeconds: 1e6,
		guessK: new Float64Array(cellCount).fill(280),
		referenceCoolingK: lapseCooling(EARTH),
	};
	/** The Earth's own record, so that the rest of a start is read. */
	const SOLVED_FOR = temperatureConditions(EARTH);
	const MONTHS = Array.from({ length: MONTHS_PER_YEAR }, () =>
		new Float32Array(cellCount).fill(10),
	);

	it('refuses a state to carry on from that is malformed or out of range', () => {
		const nan = Float64Array.from(STATE.temperatureK);
		nan[7] = Number.NaN;
		const cold = Float64Array.from(STATE.previousK);
		cold[7] = 0;
		const states = [
			null,
			{ ...STATE, temperatureK: new Float64Array(cellCount - 1) },
			{ ...STATE, temperatureK: new Float64Array(6 * 128 * 128).fill(280) },
			{ ...STATE, temperatureK: nan },
			{ ...STATE, previousK: cold },
			{ ...STATE, previousK: Float32Array.from(STATE.previousK) },
			{ ...STATE, guessK: undefined },
			{ ...STATE, guessK: new Float64Array(cellCount - 1).fill(280) },
			{ ...STATE, guessK: nan },
			{ ...STATE, referenceCoolingK: undefined },
			{ ...STATE, referenceCoolingK: new Float64Array(cellCount - 1) },
			{ ...STATE, referenceCoolingK: new Float32Array(cellCount) },
			{ ...STATE, referenceCoolingK: nan },
			{ ...STATE, referenceCoolingK: new Float64Array(cellCount).fill(-1) },
			{
				...STATE,
				referenceCoolingK: new Float64Array(cellCount).fill(
					Number.POSITIVE_INFINITY,
				),
			},
			{ ...STATE, temperatureK: new Float64Array(cellCount).fill(10_001) },
			{
				...STATE,
				temperatureK: new Float64Array(cellCount).fill(
					Number.POSITIVE_INFINITY,
				),
			},
			{ ...STATE, stepSeconds: 0 },
			{ ...STATE, stepSeconds: -1e6 },
			{ ...STATE, stepSeconds: Number.NaN },
			{ ...STATE, stepSeconds: Number.POSITIVE_INFINITY },
			// Steps no planet takes, which would scale the step before to
			// infinity or to infinity times zero.
			{
				...STATE,
				temperatureK: new Float64Array(cellCount).fill(2.7),
				previousK: new Float64Array(cellCount).fill(10_000),
				stepSeconds: 1e-300,
			},
			{ ...STATE, stepSeconds: 5e-324 },
			{ ...STATE, stepSeconds: MIN_STEP_SECONDS / 2 },
			{ ...STATE, stepSeconds: MAX_STEP_SECONDS * 2 },
		];
		for (const bad of states) {
			expect(() =>
				solveTemperature(EARTH, {
					start: {
						state: bad as unknown as TemperatureState,
						solvedFor: SOLVED_FOR,
					},
				}),
			).toThrow(RangeError);
		}
	});

	it('refuses a start that is neither a state nor months', () => {
		for (const start of [null, { solvedFor: SOLVED_FOR }, MONTHS]) {
			expect(() =>
				solveTemperature(EARTH, {
					start: start as unknown as TemperatureStart,
				}),
			).toThrow(RangeError);
		}
	});

	it('moves the state a step before for a step of another length, keeping its rate', () => {
		const temperatureK = Float64Array.from([300, 250, 100]);
		const previousK = Float64Array.from([299, 252, 100]);
		// Steps twice as long: twice the change per step.
		expect([...stepBefore(temperatureK, previousK, 1e6, 2e6)]).toEqual([
			298, 254, 100,
		]);
		expect([...stepBefore(temperatureK, previousK, 2e6, 1e6)]).toEqual([
			299.5, 251, 100,
		]);
		// The same length leaves it as it was, in a new array.
		const same = stepBefore(temperatureK, previousK, 1e6, 1e6);
		expect(same).toEqual(previousK);
		expect(same).not.toBe(previousK);
		// Brought within what a state may hold.
		expect([
			...stepBefore(Float64Array.from([5]), Float64Array.from([5000]), 1, 1e3),
		]).toEqual([10_000]);
	});

	it('refuses months to start from that are malformed or out of range, leaving them as they were', () => {
		const short = new Float32Array(cellCount - 1);
		const withNaN = Float32Array.from(MONTHS[3] as Float32Array);
		withNaN[10] = Number.NaN;
		const belowZero = Float32Array.from(MONTHS[3] as Float32Array);
		belowZero[10] = -300;
		const tooHot = Float32Array.from(MONTHS[3] as Float32Array);
		tooHot[10] = 20_000;
		const starts = [
			MONTHS.slice(1),
			[...MONTHS, MONTHS[0] as Float32Array],
			[...MONTHS.slice(0, 11), short],
			[...MONTHS.slice(0, 3), withNaN, ...MONTHS.slice(4)],
			[...MONTHS.slice(0, 3), belowZero, ...MONTHS.slice(4)],
			[...MONTHS.slice(0, 3), tooHot, ...MONTHS.slice(4)],
			[...MONTHS.slice(0, 11), Float64Array.from(MONTHS[11] as Float32Array)],
			'twelve months',
			{ length: 12 },
		];
		for (const start of starts) {
			expect(() =>
				solveTemperature(EARTH, {
					start: {
						months: start as unknown as Float32Array[],
						solvedFor: SOLVED_FOR,
					},
				}),
			).toThrow(RangeError);
		}
		expect(MONTHS.every((field) => field.every((value) => value === 10))).toBe(
			true,
		);
		expect(withNaN[10]).toBeNaN();
		expect(tooHot[10]).toBe(20_000);
	});

	it('refuses a malformed world', () => {
		const wrongLength = { ...EARTH, elevation: new Float32Array(10) };
		const nanElevation = {
			...EARTH,
			elevation: Float32Array.from(EARTH.elevation),
		};
		nanElevation.elevation[5] = Number.NaN;
		const resolution = { ...EARTH, resolution: 100 } as unknown as World;
		// A sea level beyond the elevation limits, including one whose
		// single-precision form is infinite.
		const seas = [
			Number.NaN,
			MIN_ELEVATION_M - 0.001,
			MAX_ELEVATION_M + 0.001,
			1e39,
			-1e39,
		].map((seaLevel) => atSeaLevel(EARTH, seaLevel));
		for (const world of [wrongLength, nanElevation, resolution, ...seas]) {
			expect(() => solveTemperature(world)).toThrow(RangeError);
			expect(() => lapseCooling(world)).toThrow(RangeError);
		}
		for (const world of seas.slice(1)) {
			expect(() => solveTemperature(world)).toThrow(
				`from ${MIN_ELEVATION_M} to ${MAX_ELEVATION_M} m`,
			);
		}
	});

	it.each([MIN_ELEVATION_M, MAX_ELEVATION_M])(
		'carries on from a result for a sea level of %d m',
		(seaLevel) => {
			const options: SolveTemperatureOptions = { ...COARSE, maxYears: 1 };
			const world = atSeaLevel(BLANK, seaLevel);
			const first = solveTemperature(world, options);
			expect(first.solvedFor.seaLevel).toBe(seaLevel);
			// Set aside, the start would give the first year again.
			const next = solveTemperature(world, { ...options, start: first });
			expect(next.months).not.toEqual(first.months);
			expect(next.solvedFor).toEqual(first.solvedFor);
		},
		SOLVE_TIMEOUT_MS,
	);

	it('refuses a cap or tolerance out of range', () => {
		for (const maxYears of [0, 1.5, 1e9, Number.NaN]) {
			expect(() => solveTemperature(EARTH, { maxYears })).toThrow(RangeError);
		}
		for (const tolerance of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => solveTemperature(EARTH, { tolerance })).toThrow(RangeError);
		}
	});

	it('refuses model constants that are missing or out of range', () => {
		const { diffusivity: _, ...partial } = TEMPERATURE_MODEL;
		const models: unknown[] = [
			null,
			partial,
			{ ...TEMPERATURE_MODEL, albedo: Number.NaN },
			{ ...TEMPERATURE_MODEL, lapseRate: Number.POSITIVE_INFINITY },
			{ ...TEMPERATURE_MODEL, diffusivity: 0 },
			{ ...TEMPERATURE_MODEL, landDiffusivity: 0 },
			{ ...TEMPERATURE_MODEL, oceanHeatCapacity: 0 },
			{ ...TEMPERATURE_MODEL, landHeatCapacity: -1 },
			{ ...TEMPERATURE_MODEL, seaIceHeatCapacity: -1 },
			{ ...TEMPERATURE_MODEL, solverToleranceK: 0 },
			{ ...TEMPERATURE_MODEL, solverMaxIterations: 0 },
			{ ...TEMPERATURE_MODEL, solverMaxIterations: 1.5 },
			{ ...TEMPERATURE_MODEL, solverMaxIterations: 1e6 },
			// Land would reflect less than nothing, or more than everything.
			{ ...TEMPERATURE_MODEL, landAlbedoExtra: -0.5 },
			{ ...TEMPERATURE_MODEL, landAlbedoExtra: 0.8 },
			{ ...TEMPERATURE_MODEL, greenhouseFactor: -0.1 },
			{ ...TEMPERATURE_MODEL, lapseRate: -0.001 },
			{ ...TEMPERATURE_MODEL, iceAlbedo: 1.2 },
			// Clear ground at the poles would reflect 1.08.
			{ ...TEMPERATURE_MODEL, albedoPoleward: 0.81 },
			// And at the equator less than nothing.
			{ ...TEMPERATURE_MODEL, albedo: 0.03 },
			{ ...TEMPERATURE_MODEL, stepsPerMonth: 0 },
			{ ...TEMPERATURE_MODEL, stepsPerMonth: 2.5 },
			{ ...TEMPERATURE_MODEL, stepsPerMonth: 49 },
			{ ...TEMPERATURE_MODEL, iceStartC: -10 },
			{ ...TEMPERATURE_MODEL, iceStartC: -12 },
			{ ...TEMPERATURE_MODEL, terrainDriftLimitK: -0.1 },
			{ ...TEMPERATURE_MODEL, terrainDriftLimitK: Number.NaN },
		];
		for (const model of models) {
			expect(() =>
				solveTemperature(EARTH, { model: model as TemperatureModel }),
			).toThrow(RangeError);
		}
	});
});

describe('summariseTemperature', () => {
	it('gives the annual mean, warmest, coldest and range of every cell', () => {
		const months = Array.from({ length: MONTHS_PER_YEAR }, (_, month) =>
			Float32Array.from([
				month,
				-month - 1,
				5,
				10 * Math.cos((month * Math.PI) / 6),
			]),
		);
		const { annualMean, warmest, coldest, range } =
			summariseTemperature(months);
		expect([...annualMean]).toEqual([5.5, -6.5, 5, expect.closeTo(0, 5)]);
		expect([...warmest]).toEqual([11, -1, 5, 10]);
		expect([...coldest]).toEqual([0, -12, 5, -10]);
		expect([...range]).toEqual([11, 11, 0, 20]);
	});

	it('refuses anything but twelve fields of equal length', () => {
		const field = new Float32Array(4);
		expect(() => summariseTemperature([field])).toThrow(RangeError);
		expect(() =>
			summariseTemperature([
				...Array.from({ length: 11 }, () => field),
				new Float32Array(3),
			]),
		).toThrow(RangeError);
	});
});
