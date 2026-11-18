/**
 * The climate: the temperature and the winds worked out together, each
 * feeding the other.
 *
 * The winds follow from the temperature, and the temperature depends on
 * the winds, which carry heat. {@link solveClimate} takes them round in a
 * loop of passes. The first pass is the temperature alone, as
 * {@link solveTemperature} gives it, and the winds from it, as
 * {@link solveWinds} gives them. Each later pass solves the temperature
 * again, carried on from the last pass's, with heat carried along the last
 * pass's winds (their flowing part: see {@link flowingPartForSolve}), and
 * then the winds from the new temperature.
 *
 * The loop stops when the root-mean-square change a pass makes to the
 * monthly temperature, over the area and the twelve months, is no more than
 * {@link TemperatureModel.climateToleranceC}, or after
 * {@link TemperatureModel.climateMaxPasses}. A pass whose change is larger
 * than the pass before's is an overshoot, the winds and the
 * temperature chasing each other, and only
 * {@link TemperatureModel.climateOvershootShare} of its change is applied:
 * its temperature, and the state it ends in, are that share of the way from
 * the last pass's to its own, and its winds are those of the temperature
 * applied.
 *
 * With no winds to carry heat, the loop is only the temperature solve and
 * the winds from it: the second pass changes nothing and the loop settles
 * there.
 */

import { getGrid } from './grid/grid';
import { MONTHS_PER_YEAR } from './planet/insolation';
import { normalisePlanet } from './planet/planet';
import {
	assertModel,
	assertSolvableWorld,
	conditionsMatch,
	solveResolution,
	solveTemperature,
	TEMPERATURE_MODEL,
	type TemperatureModel,
	type TemperatureProgress,
	type TemperatureResult,
} from './temperature/temperature';
import { FLOWING_RESOLUTION, flowingPartForSolve } from './wind/flowing';
import type { WindResult } from './wind/model';
import type { MonthlyWind } from './wind/observedWind';
import { solveWinds, type WindSettings } from './wind/solve';
import type { World } from './world/world';

/** A solved climate: the last pass's temperature and winds. */
export type ClimateResult = {
	/** The last pass's temperature, with the state it ends in. */
	readonly temperature: TemperatureResult;
	/** The winds worked out from that temperature. */
	readonly winds: WindResult;
	/** The day length the climate was solved for, in hours. */
	readonly dayLengthHours: number;
	/** The passes taken, from 1. */
	readonly passes: number;
	/**
	 * Whether the root-mean-square change the last pass made to the monthly
	 * temperature was no more than
	 * {@link TemperatureModel.climateToleranceC}: the loop ended on the
	 * tolerance, not on its most passes. Only a
	 * settled climate is worth carrying on from.
	 */
	readonly settled: boolean;
	/**
	 * The root-mean-square change the last pass made to the monthly
	 * temperature, weighted by area and over the twelve months, in degrees
	 * Celsius; null for a first pass with nothing before it.
	 */
	readonly changeC: number | null;
};

/**
 * What a climate result is without its arrays: the day length it was
 * solved for, the passes taken, whether it settled and its last change.
 * The arrays are the last pass's, which {@link SolveClimateOptions.onPass}
 * hears of.
 */
export type ClimateSummary = Omit<ClimateResult, 'temperature' | 'winds'>;

/** The part of a temperature result a climate is carried on from. */
export type CarriedTemperature = Pick<
	TemperatureResult,
	'months' | 'state' | 'solvedFor'
>;

/**
 * Where to start a climate from instead of a first guess: a previous
 * result for the world, usually before an edit.
 *
 * @remarks
 * A {@link ClimateResult} is one. It carries the temperature to carry on
 * from, its months to compare the first pass with, the winds to carry heat
 * along in the first pass, and the day length they were solved for. Only
 * the winds' eastward and northward parts are read, not the pressure.
 */
export type ClimateStart = {
	/** The temperature to carry on from: its months, state and record. */
	readonly temperature: CarriedTemperature;
	/** The winds to carry heat along in the first pass. */
	readonly winds: Pick<WindResult, 'east' | 'north'>;
	/** The day length the winds were solved for, in hours. */
	readonly dayLengthHours: number;
};

/** One pass of the loop, as it finishes. */
export type ClimateProgress = {
	/** The pass, from 1. */
	readonly pass: number;
	/** The most passes the loop may take. */
	readonly maxPasses: number;
	/**
	 * The temperature after this pass, with the state it ends in: those of
	 * the pass if it was applied whole, and a share of the way from the
	 * pass before's to the pass's if it was an overshoot.
	 */
	readonly temperature: TemperatureResult;
	/** The winds worked out from that temperature. */
	readonly winds: WindResult;
	/**
	 * The root-mean-square change the pass made to the monthly temperature,
	 * weighted by area and over the twelve months, in degrees Celsius,
	 * before an overshoot was damped; null for a first pass with nothing
	 * before it.
	 */
	readonly changeC: number | null;
	/** Whether the pass settled the climate. */
	readonly settled: boolean;
	/** Whether the loop ends with this pass. */
	readonly last: boolean;
};

/** What {@link solveClimate} may be given besides the world. */
export type SolveClimateOptions = {
	/**
	 * Where to start from, usually the previous result for the world. It is
	 * used only for a world it suits: its day length must be the world's
	 * and its temperature's record, as for {@link solveTemperature}'s start,
	 * must be the world's, or the climate is solved from nothing. A start
	 * whose temperature has no valid record is refused, not set aside.
	 */
	readonly start?: ClimateStart;
	/** The model's constants; defaults to {@link TEMPERATURE_MODEL}. */
	readonly model?: TemperatureModel;
	/**
	 * Settings of the wind model to change from its defaults for this run,
	 * by name, as {@link solveWinds} takes them in its options.
	 *
	 * @remarks
	 * For the tests and the tuning script; the page and its worker never
	 * pass any.
	 */
	readonly windSettings?: Partial<WindSettings>;
	/**
	 * Called as each pass finishes, with the pass. It is given what the
	 * solve itself holds, so whatever it does to it is the caller's own
	 * risk; whatever it throws ends the solve and is thrown from
	 * {@link solveClimate} as it is.
	 */
	readonly onPass?: (progress: ClimateProgress) => void;
	/**
	 * Called as each year of a pass's temperature solve finishes, with how
	 * far that solve has come and the pass it is in.
	 */
	readonly onYear?: (progress: TemperatureProgress, pass: number) => void;
};

/**
 * The root-mean-square difference between two years of monthly fields,
 * weighted by the cells' areas, the months equally.
 */
const rmsChange = (
	areas: Float64Array,
	a: readonly Float32Array[],
	b: readonly Float32Array[],
): number => {
	let squares = 0;
	let area = 0;
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const first = a[month] as Float32Array;
		const second = b[month] as Float32Array;
		for (let cell = 0; cell < first.length; cell++) {
			const difference = (first[cell] as number) - (second[cell] as number);
			squares += (areas[cell] as number) * difference * difference;
			area += areas[cell] as number;
		}
	}
	return Math.sqrt(squares / area);
};

/** A field `share` of the way from `from` to `to`, in the type of `to`. */
const blend = <T extends Float32Array | Float64Array>(
	from: T,
	to: T,
	share: number,
): T => {
	const result = to.slice() as T;
	for (let cell = 0; cell < result.length; cell++) {
		const start = from[cell] as number;
		result[cell] = start + share * ((to[cell] as number) - start);
	}
	return result;
};

/**
 * A pass's temperature a share of the way from the pass before's: its
 * months and the state it ends in, the rest of the result (the years run,
 * whether it converged, its last year's change and its record) being the
 * pass's own.
 */
const dampened = (
	before: CarriedTemperature,
	pass: TemperatureResult,
	share: number,
): TemperatureResult => ({
	...pass,
	months: pass.months.map((month, index) =>
		blend(before.months[index] as Float32Array, month, share),
	),
	state: {
		...pass.state,
		temperatureK: blend(
			before.state.temperatureK,
			pass.state.temperatureK,
			share,
		),
		previousK: blend(before.state.previousK, pass.state.previousK, share),
	},
});

/** Throws unless a start's arrays are twelve months of one value per cell. */
const assertStart = (start: ClimateStart, cellCount: number): void => {
	const { temperature, winds } = start ?? {};
	const fields: [string, unknown][] = [
		['temperature months', temperature?.months],
		['eastward winds', winds?.east],
		['northward winds', winds?.north],
	];
	for (const [what, field] of fields) {
		if (!Array.isArray(field) || field.length !== MONTHS_PER_YEAR) {
			throw new RangeError(`A start's ${what} must be twelve fields`);
		}
		for (const month of field) {
			if (month?.length !== cellCount) {
				throw new RangeError(
					`A start's ${what} must hold one value per cell, ${cellCount}; got ${month?.length}`,
				);
			}
		}
	}
	if (!Number.isFinite(start.dayLengthHours)) {
		throw new RangeError("A start's day length must be a finite number");
	}
};

/**
 * Whether a start suits a world: its temperature was solved for the world's
 * sea level and temperature settings, as {@link conditionsMatch} judges, and
 * the winds for its day length.
 */
const suits = (
	start: ClimateStart,
	world: World,
	dayLengthHours: number,
): boolean =>
	conditionsMatch(world, start.temperature.solvedFor) &&
	start.dayLengthHours === dayLengthHours;

/**
 * The climate of a world: its temperature and winds through the year,
 * worked out together.
 *
 * @remarks
 * See the module's description for the loop. The first pass, from nothing,
 * is exactly {@link solveTemperature} and the {@link solveWinds} of its
 * months. Passes after it carry the temperature on from the pass before's
 * state, which takes about a year of solving each: a pass costs the
 * temperature's warm solve, the flowing part of the winds (about 60 ms a
 * month on the 64 grid, whatever the world's resolution) and the winds.
 *
 * A start that suits the world makes the first pass carry on from its
 * temperature's state with heat carried along its winds, and compare its
 * result with the start's months. The first pass never settles the
 * climate: the start's winds may be those of a world since edited, and a
 * local edit moves the global change by less than the tolerance, so the
 * winds of the new temperature are tried once more. A start that was
 * settled and whose world has not changed therefore settles at the second
 * pass.
 *
 * The temperature of a settled climate depends on the day length, through
 * the winds, which turn with it and are as wide as it sets; the first pass
 * does not, as {@link solveTemperature} alone does not.
 *
 * @param world - The world. It is not changed.
 * @param options - Where to start, the model's constants, and whom to tell
 * as each pass and each year finishes.
 * @returns New arrays the caller owns.
 * @throws RangeError for whatever {@link solveTemperature} and
 * {@link solveWinds} refuse, if a model constant is missing or out of
 * range, if a start is not twelve months of one value per cell in each of
 * its temperature, eastward wind and northward wind, or if a start's
 * temperature does not record a finite sea level and the planet's
 * temperature settings, as {@link solveTemperature}'s start must.
 * @throws Whatever `onPass` or `onYear` throws, as it is.
 */
export const solveClimate = (
	world: World,
	options: SolveClimateOptions = {},
): ClimateResult => {
	const { model = TEMPERATURE_MODEL, windSettings, onPass, onYear } = options;
	assertModel(model);
	assertSolvableWorld(world);
	const dayLengthHours = normalisePlanet(world.planet).dayLengthHours;
	const resolution = world.resolution;
	const solvedOn = solveResolution(resolution);
	const cells = 6 * resolution * resolution;
	let before: CarriedTemperature | undefined;
	let windsBefore: MonthlyWind | undefined;
	let lastChange: number | null = null;
	if (options.start !== undefined) {
		assertStart(options.start, cells);
		if (suits(options.start, world, dayLengthHours)) {
			before = options.start.temperature;
			windsBefore = options.start.winds;
		}
	}
	const { climateMaxPasses, climateToleranceC, climateOvershootShare } = model;
	const { areas } = getGrid(resolution);
	// Each month's potential of the winds' converging part, kept from pass to
	// pass: the next pass's winds are close, and start from it.
	const potentials = Array.from(
		{ length: MONTHS_PER_YEAR },
		() => new Float64Array(getGrid(FLOWING_RESOLUTION).cellCount),
	);
	for (let pass = 1; ; pass++) {
		const flows =
			windsBefore === undefined
				? undefined
				: windsBefore.east.map((east, month) =>
						flowingPartForSolve(
							resolution,
							solvedOn,
							east,
							(windsBefore as MonthlyWind).north[month] as Float32Array,
							potentials[month],
						),
					);
		const solved = solveTemperature(world, {
			model,
			start:
				before === undefined
					? undefined
					: { state: before.state, solvedFor: before.solvedFor },
			winds: flows === undefined ? undefined : { flows },
			onYear: onYear === undefined ? undefined : (p) => onYear(p, pass),
		});
		const change =
			before === undefined
				? null
				: rmsChange(areas, before.months, solved.months);
		const overshoot =
			change !== null && lastChange !== null && change > lastChange;
		const temperature =
			before !== undefined && overshoot
				? dampened(before, solved, climateOvershootShare)
				: solved;
		const winds = solveWinds(world, temperature.months, {
			settings: windSettings,
		});
		// A pass settles only from the second: the first of a start that suits
		// carries heat along the start's winds, which may be those of a world
		// since edited, and a local edit moves the global rms change by less
		// than the tolerance, so the winds of the new temperature are tried
		// once before the climate can settle. For the same reason the first
		// pass of a run carried on after a pause cannot settle either, so
		// such a run can take one pass more than one never paused.
		const settled = pass > 1 && change !== null && change <= climateToleranceC;
		const last = settled || pass === climateMaxPasses;
		onPass?.({
			pass,
			maxPasses: climateMaxPasses,
			temperature,
			winds,
			changeC: change,
			settled,
			last,
		});
		if (last) {
			return {
				temperature,
				winds,
				dayLengthHours,
				passes: pass,
				settled,
				changeC: change,
			};
		}
		before = temperature;
		windsBefore = winds;
		lastChange = change;
	}
};
