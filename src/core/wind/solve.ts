/**
 * The winds of a world through its year: the rules model's pressure
 * ({@link rulesPressure}) worked out on the 64 grid whatever the world's
 * own and carried back to the world's grid, the winds worked out from it
 * there ({@link windsFromPressures}), and the annual mean of a year of
 * winds.
 */

import { coarsenField, coarsenWorld, refineField } from '../coarsen';
import { getGrid, type Resolution } from '../grid';
import { MONTHS_PER_YEAR } from '../insolation';
import { normalisePlanet } from '../planet';
import { assertSolvableWorld } from '../temperature';
import type { World } from '../world';
import type { WindResult } from './model';
import {
	rulesPressure,
	rulesWindsOnGrid,
	type WindSettings,
	windSettings,
	windsFromPressures,
} from './rules';

export {
	DEFAULT_WIND_SETTINGS,
	WIND_SETTING_NAMES,
	type WindSettingName,
	type WindSettings,
	windSettings,
} from './rules';

/**
 * The grid every world's winds are solved on, in cells per face edge,
 * unless a solve asks for the world's own.
 */
export const WIND_SOLVE_RESOLUTION: Resolution = 64;

/** What {@link solveWinds} may be given besides the world and temperatures. */
export type SolveWindsOptions = {
	/**
	 * Whether to solve on the world's own grid whatever its resolution,
	 * rather than on {@link WIND_SOLVE_RESOLUTION}; defaults to false.
	 *
	 * @remarks
	 * For the tests and the timing script, which measure how far the
	 * coarser solve lies from the full one; it takes several times as long
	 * at 128 cells per face edge and some twenty times at 256.
	 */
	readonly fullResolution?: boolean;
	/**
	 * Settings of the model to change from {@link DEFAULT_WIND_SETTINGS}
	 * for this run, by name; none by default, and with none the run is the
	 * default one exactly.
	 *
	 * @remarks
	 * For the tuning script, which runs the model many times with settings
	 * changed; the page and its worker never pass any.
	 */
	readonly settings?: Partial<WindSettings>;
};

/** The annual means of a year of winds, one value per cell. */
export type WindSummary = {
	/**
	 * The eastward part of the mean of the twelve months' winds as vectors,
	 * in metres a second.
	 */
	readonly east: Float32Array;
	/** The northward part of that mean, in metres a second. */
	readonly north: Float32Array;
	/** The mean of the twelve months' sea-level pressure, in hectopascals. */
	readonly pressure: Float32Array;
};

/** Throws unless the temperatures are twelve finite fields, one per cell. */
const assertTemperatures = (
	temperatures: readonly ArrayLike<number>[],
	cellCount: number,
): void => {
	if (!Array.isArray(temperatures) || temperatures.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`The winds need ${MONTHS_PER_YEAR} months of temperature; got ${Array.isArray(temperatures) ? temperatures.length : typeof temperatures}`,
		);
	}
	for (const [month, field] of temperatures.entries()) {
		if (field?.length !== cellCount) {
			throw new RangeError(
				`A world of ${cellCount} cells needs ${cellCount} temperatures a month; month ${month} holds ${field?.length}`,
			);
		}
		for (let cell = 0; cell < cellCount; cell++) {
			if (!Number.isFinite(field[cell])) {
				throw new RangeError(
					`The winds need finite temperatures; month ${month}, cell ${cell} holds ${field[cell]}`,
				);
			}
		}
	}
};

/**
 * The surface winds and sea-level pressure of a world through its year,
 * from its twelve monthly temperatures.
 *
 * @remarks
 * A pure function of the world, the temperatures and the options. The
 * world's planet is passed through {@link normalisePlanet} first, as the
 * temperature's solve does, so a setting beyond its limits is brought to
 * the limit and one that is not a number is refused. Of the planet only the
 * day length is read; the tilt and the rest reach the winds only through
 * the temperatures.
 *
 * Every world's pressure is worked out on the grid of
 * {@link WIND_SOLVE_RESOLUTION} cells per face edge, and its winds on its
 * own grid. A world of that grid is solved on it directly. A finer world
 * is averaged onto it a step at a time by {@link coarsenWorld}, where a
 * coarse cell is land by the mean elevation of the cells it covers, and its
 * temperatures by {@link coarsenField}, each coarse cell's the area-weighted
 * mean of the cells it covers; the pressure is worked out there, bands,
 * thermal highs and lows and their smoothing, and each month's is carried
 * back to the world's grid a step at a time by {@link refineField}. The
 * wind then follows from that pressure on the world's own grid, each cell
 * with its own land or sea and its own height and slope. Nearly all the
 * time is the smoothing of the thermal highs and lows, so a finer world
 * takes not much longer than one of 64; and that smoothing reaches 900 km,
 * far wider than a cell of the 64 grid, so little is lost against a solve
 * wholly on the world's own grid. `docs/winds.md` gives the times and the
 * differences measured on the Earth, and `npm run time:winds` measures
 * them. `fullResolution` solves on the world's own grid instead, for tests
 * and measurement.
 *
 * @param world - The world. It is not changed.
 * @param temperatures - Twelve fields, January to December, of the mean
 * near-surface air temperature in degrees Celsius, one finite value per
 * cell of the world's grid, as {@link solveTemperature} gives them in its
 * result's `months`. They are not changed.
 * @param options - Whether to solve on the world's own grid, and any
 * settings of the model to change.
 * @returns New arrays the caller owns, one value per cell of the world's
 * grid in each.
 * @throws RangeError if the world's resolution is not supported, if its
 * elevations are not one finite value per cell, if its sea level does not
 * lie within the elevation limits, if a planet setting is not a number, or
 * if the temperatures are not twelve fields of one finite value per cell;
 * and if a setting given is not one of the model's or not a finite number,
 * before anything costly is done.
 */
export const solveWinds = (
	world: World,
	temperatures: readonly ArrayLike<number>[],
	options: SolveWindsOptions = {},
): WindResult => {
	const { fullResolution = false } = options;
	const settings = windSettings(options.settings);
	// The world is checked as the temperature's solve checks it, and then
	// the temperatures, before anything costly is done.
	assertSolvableWorld(world);
	const planet = normalisePlanet(world.planet);
	const { cellCount } = getGrid(world.resolution);
	assertTemperatures(temperatures, cellCount);
	const settled: World = { ...world, planet };
	if (fullResolution || world.resolution === WIND_SOLVE_RESOLUTION) {
		return rulesWindsOnGrid(settled, temperatures, settings);
	}
	// The grids from the world's down to the one solved on, finest first.
	const steps: Resolution[] = [];
	let coarse = settled;
	let months: readonly ArrayLike<number>[] = temperatures;
	while (coarse.resolution !== WIND_SOLVE_RESOLUTION) {
		steps.push(coarse.resolution);
		const resolution = coarse.resolution;
		months = months.map((month) => coarsenField(month, resolution));
		coarse = coarsenWorld(coarse);
	}
	const upwards = steps.reverse();
	const fine = rulesPressure(coarse, months, settings).map((month) => {
		let field: Float64Array = month;
		for (const resolution of upwards) {
			field = refineField(field, resolution);
		}
		return field;
	});
	return {
		...windsFromPressures(settled, fine, settings),
		pressure: fine.map((field) => Float32Array.from(field)),
	};
};

/**
 * The annual mean of a year of winds and pressure at every cell.
 *
 * @remarks
 * The wind is averaged as vectors, its eastward and northward parts each
 * the mean of the months', so winds that turn round through the year, as a
 * monsoon's do, largely cancel.
 *
 * @param result - A year of winds and pressure, such as
 * {@link solveWinds} gives. It is not changed.
 * @returns New arrays, one value per cell.
 * @throws RangeError if any of the three fields does not hold twelve
 * months, or the months are not all of one length.
 */
export const summariseWinds = (result: WindResult): WindSummary => {
	for (const part of ['east', 'north', 'pressure'] as const) {
		if (result[part].length !== MONTHS_PER_YEAR) {
			throw new RangeError(
				`A year has ${MONTHS_PER_YEAR} months of ${part}; got ${result[part].length}`,
			);
		}
	}
	const count = (result.east[0] as Float32Array).length;
	const parts = [result.east, result.north, result.pressure];
	if (parts.some((months) => months.some((field) => field.length !== count))) {
		throw new RangeError('Every month must hold one value per cell');
	}
	const [east, north, pressure] = parts.map((months) => {
		const mean = new Float32Array(count);
		for (let cell = 0; cell < count; cell++) {
			let total = 0;
			for (const field of months) {
				total += field[cell] as number;
			}
			mean[cell] = total / MONTHS_PER_YEAR;
		}
		return mean;
	}) as [Float32Array, Float32Array, Float32Array];
	return { east, north, pressure };
};
