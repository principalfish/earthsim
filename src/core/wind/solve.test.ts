import { describe, expect, it } from 'vitest';
import { readEarthDataFile } from '../../../scripts/earth/dataFile.mjs';
import { decodeEarth, earthWorld } from '../earth';
import { getGrid, type Resolution } from '../grid';
import { cellLatitudes, MONTHS_PER_YEAR } from '../insolation';
import { DEFAULT_PLANET, normalisePlanet } from '../planet';
import { lapseCooling, solveTemperature } from '../temperature';
import { createBlankWorld, type World } from '../world';
import { type WindResult, zonalMean } from './model';
import {
	DEFAULT_WIND_SETTINGS,
	REFERENCE_PRESSURE_HPA,
	rulesPressureMonth,
	rulesWindsOnGrid,
	windsFromPressure,
} from './rules';
import { solveWinds, summariseWinds, WIND_SOLVE_RESOLUTION } from './solve';

const EARTH = decodeEarth(readEarthDataFile());
const RADIANS_PER_DEGREE = Math.PI / 180;
const JANUARY = 0;
const JULY = 6;

/**
 * A made-up year of air temperature, in degrees Celsius, for a world: a
 * profile of latitude whose hottest latitude swings 15° north and south
 * through the year, land 12 K colder than that in its winter and 8 K
 * hotter in its summer, and every cell cooled by its height as the
 * temperature model cools it.
 */
const madeUpYear = (world: World): Float32Array[] => {
	const grid = getGrid(world.resolution);
	const latitudes = cellLatitudes(grid);
	const cooling = lapseCooling(world);
	return Array.from({ length: MONTHS_PER_YEAR }, (_, month) => {
		const season = Math.cos((2 * Math.PI * (month - JULY)) / MONTHS_PER_YEAR);
		const hottest = 15 * season;
		const field = new Float32Array(grid.cellCount);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const latitude = latitudes[cell] as number;
			const away = (latitude - hottest) * RADIANS_PER_DEGREE;
			const land = (world.elevation[cell] as number) > world.seaLevel;
			// Summer in the north is winter in the south.
			const local = season * Math.sign(latitude);
			field[cell] =
				28 -
				45 * (1 - Math.cos(away)) +
				(land ? (local > 0 ? 8 : 12) * local : 0) -
				(cooling[cell] as number);
		}
		return field;
	});
};

/**
 * One month of the rules model on the world's own grid, by the model's own
 * one-month parts: for comparing one month at 256 cells per face edge
 * without a whole year on that grid.
 */
const ownGridMonth = (
	world: World,
	temperature: ArrayLike<number>,
): { east: Float32Array; north: Float32Array; pressure: Float64Array } => {
	const pressure = rulesPressureMonth(world, temperature, lapseCooling(world));
	return { ...windsFromPressure(world, pressure), pressure };
};

/**
 * The area-weighted root-mean-square difference between two months, of the
 * wind as vectors in m/s and of the pressure in hPa.
 */
const monthDifference = (
	resolution: Resolution,
	a: {
		east: ArrayLike<number>;
		north: ArrayLike<number>;
		pressure: ArrayLike<number>;
	},
	b: {
		east: ArrayLike<number>;
		north: ArrayLike<number>;
		pressure: ArrayLike<number>;
	},
): { wind: number; pressure: number } => {
	const { areas, cellCount } = getGrid(resolution);
	let area = 0;
	let wind = 0;
	let pressure = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		const weight = areas[cell] as number;
		const east = (a.east[cell] as number) - (b.east[cell] as number);
		const north = (a.north[cell] as number) - (b.north[cell] as number);
		const high = (a.pressure[cell] as number) - (b.pressure[cell] as number);
		area += weight;
		wind += weight * (east * east + north * north);
		pressure += weight * high * high;
	}
	return { wind: Math.sqrt(wind / area), pressure: Math.sqrt(pressure / area) };
};

const monthOf = (result: WindResult, month: number) => ({
	east: result.east[month] as Float32Array,
	north: result.north[month] as Float32Array,
	pressure: result.pressure[month] as Float32Array,
});

describe('solveWinds', () => {
	// One year at 64 cells per face edge, about half a second, more under
	// coverage, hence the longer time allowed.
	it('solves a world of 64 cells per face edge on its own grid, as the rules model does', () => {
		const world = earthWorld(EARTH, 64);
		const year = madeUpYear(world);
		const solved = solveWinds(world, year);
		expect(solved).toEqual(rulesWindsOnGrid(world, year));
		// The month worked out from the model's parts, as the comparisons
		// below take it on the finer grids, is the model's month.
		const month = ownGridMonth(world, year[JULY] as Float32Array);
		expect(solved.east[JULY]).toEqual(month.east);
		expect(solved.north[JULY]).toEqual(month.north);
		expect(solved.pressure[JULY]).toEqual(Float32Array.from(month.pressure));
	}, 60_000);

	// A year with its pressure on the 64 grid, and two months on the world's
	// own grid, at each of 128 and 256 cells per face edge, the month at 256
	// a second or so, more under coverage, hence the longer time allowed.
	it.each([
		[128, 0.25, 0.32],
		[256, 0.3, 0.35],
	] as const)(
		'solves the Earth at %d with its pressure on the 64 grid, within %f m/s and %f hPa root-mean-square of a solve on its own grid',
		(resolution, windTolerance, pressureTolerance) => {
			// Measured with these made-up temperatures, January and July:
			// 0.23 and 0.22 m/s, 0.29 and 0.20 hPa at 128; 0.27 and 0.25 m/s,
			// 0.32 and 0.22 hPa at 256. They step by 8 to 12 K at every coast,
			// where the 64 grid's land and sea lie a cell or so from the
			// world's own, so they differ more than the Earth's temperatures
			// from the temperature's solve do, which change smoothly across
			// a coast: 0.05 and 0.07 m/s, 0.05 and 0.06 hPa over the year.
			const world = earthWorld(EARTH, resolution);
			const year = madeUpYear(world);
			const solved = solveWinds(world, year);
			const { cellCount } = getGrid(resolution);
			expect(solved.east).toHaveLength(MONTHS_PER_YEAR);
			for (const part of [solved.east, solved.north, solved.pressure]) {
				for (const field of part) {
					expect(field).toHaveLength(cellCount);
				}
			}
			for (const month of [JANUARY, JULY]) {
				const difference = monthDifference(
					resolution,
					monthOf(solved, month),
					ownGridMonth(world, year[month] as Float32Array),
				);
				expect(difference.wind, `month ${month}`).toBeLessThan(windTolerance);
				expect(difference.pressure, `month ${month}`).toBeLessThan(
					pressureTolerance,
				);
			}
		},
		60_000,
	);

	// One year on the world's own grid at 128 cells per face edge, about
	// three seconds, and one on the 64 grid, more under coverage, hence the
	// longer time allowed.
	it('solves on the world’s own grid when asked', () => {
		const world = earthWorld(EARTH, 128);
		const year = madeUpYear(world);
		const own = solveWinds(world, year, { fullResolution: true });
		const month = ownGridMonth(world, year[JULY] as Float32Array);
		expect(own.east[JULY]).toEqual(month.east);
		expect(own.north[JULY]).toEqual(month.north);
		expect(own.pressure[JULY]).toEqual(Float32Array.from(month.pressure));
		expect(own.east[JULY]).not.toEqual(solveWinds(world, year).east[JULY]);
	}, 60_000);

	// Two runs of a year at 64 cells per face edge, about half a second
	// each, more under coverage, hence the longer time allowed.
	it('brings the planet to its limits first, as the temperature does', () => {
		const world = createBlankWorld(WIND_SOLVE_RESOLUTION);
		const year = madeUpYear(world);
		const beyond: World = {
			...world,
			planet: { ...DEFAULT_PLANET, dayLengthHours: 1e9 },
		};
		const atLimit: World = {
			...world,
			planet: { ...DEFAULT_PLANET, dayLengthHours: 720 },
		};
		expect(solveWinds(beyond, year)).toEqual(solveWinds(atLimit, year));
		expect(beyond.planet.dayLengthHours).toBe(1e9);
		expect(() =>
			solveWinds(
				{ ...world, planet: { ...DEFAULT_PLANET, dayLengthHours: Number.NaN } },
				year,
			),
		).toThrow(RangeError);
	}, 60_000);

	// Four runs of a year at 64 cells per face edge and three at 128, about
	// half a second each, more under coverage, hence the longer time
	// allowed.
	it('runs the default model exactly when no setting is changed, and another when one is', () => {
		const world = earthWorld(EARTH, 64);
		const year = madeUpYear(world);
		const solved = solveWinds(world, year);
		expect(solveWinds(world, year, { settings: {} })).toEqual(solved);
		expect(
			solveWinds(world, year, { settings: { ...DEFAULT_WIND_SETTINGS } }),
		).toEqual(solved);
		const changed = solveWinds(world, year, {
			settings: { thermalHpaPerK: 2 },
		});
		expect(changed.pressure[JANUARY]).not.toEqual(solved.pressure[JANUARY]);
		expect(changed.east[JANUARY]).not.toEqual(solved.east[JANUARY]);
		// The settings reach the pressure worked out on the 64 grid for a
		// finer world too, and the winds worked out on its own grid.
		const fine = earthWorld(EARTH, 128);
		const fineYear = madeUpYear(fine);
		const fineSolved = solveWinds(fine, fineYear);
		expect(
			solveWinds(fine, fineYear, { settings: { seaFrictionPerS: 5e-5 } }).east[
				JULY
			],
		).not.toEqual(fineSolved.east[JULY]);
		expect(
			solveWinds(fine, fineYear, { settings: { thermalHpaPerK: 2 } }).pressure[
				JULY
			],
		).not.toEqual(fineSolved.pressure[JULY]);
		expect(() =>
			solveWinds(world, year, {
				settings: { hotWindowK: Number.NaN },
			}),
		).toThrow(RangeError);
	}, 60_000);

	// Two solves of the temperature, a second or so each, and four runs of
	// a year of winds, more under coverage, hence the longer time allowed.
	it('leaves the Earth’s pressure as it was under the cold limit, and keeps a cold world’s highs short of the Earth’s record', () => {
		// No cold limit at all: a knee beyond any cold.
		const unlimited = { settings: { coldKneeK: 1e9 } };
		const world = earthWorld(EARTH, 64);
		const months = solveTemperature(world).months;
		// The Earth's coldest place against its latitude is 17 K below it,
		// short of the knee, so its pressure is the same to the last bit.
		expect(solveWinds(world, months)).toEqual(
			solveWinds(world, months, unlimited),
		);
		// The Earth twice as far from the Sun: frozen over, and so nearly as
		// cold everywhere at a latitude that its highs are low, the cold
		// limit not reached.
		const cold: World = {
			...world,
			planet: normalisePlanet({ ...DEFAULT_PLANET, orbitDistanceAu: 2 }),
		};
		const coldMonths = solveTemperature(cold).months;
		const limited = solveWinds(cold, coldMonths);
		const highest = Math.max(
			...limited.pressure.map((field) => Math.max(...field)),
		);
		expect(highest).toBeGreaterThan(REFERENCE_PRESSURE_HPA);
		expect(highest).toBeLessThan(1084);
		expect(limited).toEqual(solveWinds(cold, coldMonths, unlimited));
	}, 60_000);

	// A solve of the temperature of the Earth tilted 60°, a second or so,
	// and a year of its winds, more under coverage, hence the longer time
	// allowed. Its own temperatures are used, not made-up ones: what keeps
	// its winter winds weak is how its cells fit between a low far into the
	// summer hemisphere and a cold winter pole, which a made-up profile did
	// not reproduce.
	it('keeps the winter hemisphere’s mid-latitude winds weaker than the summer’s on the Earth tilted 60°, in January and July', () => {
		const world = earthWorld(EARTH, 64);
		world.planet = normalisePlanet({ ...DEFAULT_PLANET, axialTiltDeg: 60 });
		const result = solveWinds(world, solveTemperature(world).months);
		const grid = getGrid(64);
		// The size of the mean eastward wind over the bands of 2° whose
		// middles lie 40° to 60° from the equator in one hemisphere, each
		// band weighted by its area.
		const midLatitudes = (month: number, sign: number): number => {
			const { latitudes, means } = zonalMean(
				grid,
				result.east[month] as Float32Array,
				90,
			);
			let total = 0;
			let weights = 0;
			for (const [band, latitude] of latitudes.entries()) {
				const away = sign * latitude;
				if (away >= 40 && away <= 60) {
					const weight = Math.cos(latitude * RADIANS_PER_DEGREE);
					total += weight * (means[band] as number);
					weights += weight;
				}
			}
			return Math.abs(total / weights);
		};
		// About 1.1 against 0.2 m/s in January and 0.6 against 0.4 in July;
		// with every band in full out to the last before the pole, the
		// winter's were 1.3 and 1.6 m/s, stronger than the summer's.
		for (const [month, summer] of [
			[JANUARY, -1],
			[JULY, 1],
		] as const) {
			expect(midLatitudes(month, -summer), `month ${month}`).toBeLessThan(
				midLatitudes(month, summer),
			);
		}
	}, 60_000);

	it('refuses other than twelve months, a month of the wrong length, temperatures for another grid, and a temperature that is not finite', () => {
		const world = createBlankWorld(128);
		const year = madeUpYear(world);
		const refuses = (months: readonly ArrayLike<number>[], on = world) =>
			expect(() => solveWinds(on, months)).toThrow(RangeError);
		refuses('a year' as unknown as Float32Array[]);
		refuses(year.slice(1));
		refuses([...year, year[0] as Float32Array]);
		refuses(
			year.map((field, month) => (month === 4 ? field.subarray(1) : field)),
		);
		// A world and temperatures on different grids.
		refuses(madeUpYear(createBlankWorld(64)));
		refuses(year, createBlankWorld(256));
		for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
			const broken = year.map((field) => Float32Array.from(field));
			(broken[9] as Float32Array)[1234] = bad;
			refuses(broken);
		}
		// The world is checked as the temperature's solve checks it.
		const elevation = Float32Array.from(world.elevation);
		elevation[7] = Number.NaN;
		refuses(year, { ...world, elevation });
		refuses(year, { ...world, resolution: 96 } as unknown as World);
	});
});

describe('summariseWinds', () => {
	/** A year whose wind turns once round through the months. */
	const turning = (cells: number): WindResult => {
		const months = Array.from({ length: MONTHS_PER_YEAR }, (_, month) => {
			const angle = (2 * Math.PI * month) / MONTHS_PER_YEAR;
			return {
				east: new Float32Array(cells).map(
					(_, cell) => 1 + cell + 5 * Math.cos(angle),
				),
				north: new Float32Array(cells).map(
					(_, cell) => -cell + 5 * Math.sin(angle),
				),
				pressure: new Float32Array(cells).fill(1000 + month),
			};
		});
		return {
			east: months.map(({ east }) => east),
			north: months.map(({ north }) => north),
			pressure: months.map(({ pressure }) => pressure),
		};
	};

	it('gives the mean of the twelve months, the wind as vectors', () => {
		const year = turning(3);
		const summary = summariseWinds(year);
		for (let cell = 0; cell < 3; cell++) {
			// The wind that turns round cancels, leaving the steady part.
			expect(summary.east[cell]).toBeCloseTo(1 + cell, 5);
			expect(summary.north[cell]).toBeCloseTo(-cell, 5);
			expect(summary.pressure[cell]).toBeCloseTo(1005.5, 4);
			let east = 0;
			let north = 0;
			for (let month = 0; month < MONTHS_PER_YEAR; month++) {
				east += (year.east[month] as Float32Array)[cell] as number;
				north += (year.north[month] as Float32Array)[cell] as number;
			}
			expect(summary.east[cell]).toBe(Math.fround(east / MONTHS_PER_YEAR));
			expect(summary.north[cell]).toBe(Math.fround(north / MONTHS_PER_YEAR));
		}
		expect(summary.east).toBeInstanceOf(Float32Array);
	});

	it('refuses other than twelve months, or months of different lengths', () => {
		const year = turning(4);
		expect(() =>
			summariseWinds({ ...year, north: year.north.slice(1) }),
		).toThrow(RangeError);
		expect(() =>
			summariseWinds({
				...year,
				pressure: year.pressure.map((field, month) =>
					month === 5 ? field.subarray(1) : field,
				),
			}),
		).toThrow(RangeError);
	});
});
