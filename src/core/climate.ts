/**
 * The climate: the temperature, the winds and the sea's currents worked
 * out together, each feeding the next.
 *
 * The winds follow from the temperature, the currents from the winds, and
 * the temperature depends on both, which carry heat. {@link solveClimate}
 * takes them round in a loop of passes. The first pass is the temperature
 * alone, as {@link solveTemperature} gives it, the winds from it, as
 * {@link solveWinds} gives them, and the currents the winds drive, as
 * {@link solveGyres} gives them. Each later pass solves the temperature
 * again, carried on from the last pass's, with the air's heat carried along
 * the last pass's winds (their flowing part: see
 * {@link flowingPartForSolve}) and the sea's along the last pass's
 * currents, and then the winds from the new temperature and the currents
 * from the new winds.
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
 * applied, and its currents those of those winds.
 *
 * With no winds to carry heat, on a world with no sea or no coast, whose
 * currents are still, the loop is only the temperature solve and the winds
 * from it: the second pass changes nothing and the loop settles there.
 */

import { coarsenField, coarsenWorld } from './grid/coarsen';
import { cornerIndex } from './grid/corners';
import { getGrid, NEIGHBOUR_COUNT } from './grid/grid';
import {
	DEFAULT_GYRE_SETTINGS,
	type GyreResult,
	solveGyres,
} from './ocean/gyres';
import { MONTHS_PER_YEAR } from './planet/insolation';
import { normalisePlanet } from './planet/planet';
import {
	assertModel,
	assertSolvableWorld,
	conditionsMatch,
	landCrossing,
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

/** A solved climate: the last pass's temperature, winds and currents. */
export type ClimateResult = {
	/** The last pass's temperature, with the state it ends in. */
	readonly temperature: TemperatureResult;
	/** The winds worked out from that temperature. */
	readonly winds: WindResult;
	/**
	 * The currents those winds drive, on the grid the temperature is solved
	 * on (see {@link solveResolution}), with the gyres' default settings.
	 */
	readonly currents: GyreResult;
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
export type ClimateSummary = Omit<
	ClimateResult,
	'temperature' | 'winds' | 'currents'
>;

/** The part of a temperature result a climate is carried on from. */
export type CarriedTemperature = Pick<
	TemperatureResult,
	'months' | 'seaMonths' | 'state' | 'solvedFor'
>;

/**
 * The part of the currents a climate is carried on from: the flows heat is
 * carried along, and the streamfunction the next currents start from.
 */
export type CarriedCurrents = Pick<GyreResult, 'flows' | 'streamfunction'>;

/**
 * Where to start a climate from instead of a first guess: a previous
 * result for the world, usually before an edit.
 *
 * @remarks
 * A {@link ClimateResult} is one. It carries the temperature to carry on
 * from, the air's and the sea's, with its months to compare the first pass
 * with, the winds and currents to carry heat along in the first pass, and
 * the day length they were solved for. Only the winds' eastward and
 * northward parts are read, not the pressure, and only the currents' flows
 * and streamfunction.
 */
export type ClimateStart = {
	/**
	 * The temperature to carry on from: its months, the air's and the sea's,
	 * its state and its record.
	 */
	readonly temperature: CarriedTemperature;
	/** The winds to carry heat along in the first pass. */
	readonly winds: Pick<WindResult, 'east' | 'north'>;
	/**
	 * The currents to carry the sea's heat along in the first pass, on the
	 * grid the temperature is solved on, as {@link ClimateResult.currents}
	 * are. Left out, or carrying something across an edge of what is now
	 * land, they are worked out afresh from the start's winds, the
	 * streamfunction given still the first guess.
	 */
	readonly currents?: CarriedCurrents;
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
	/** The currents those winds drive. */
	readonly currents: GyreResult;
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
 * months, the air's and the sea's, and the state it ends in, the rest of the
 * result (the years run, whether it converged, its last year's change and
 * its record) being the pass's own. A sea month stays NaN where the cell is
 * land.
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
	seaMonths: pass.seaMonths.map((month, index) =>
		blend(before.seaMonths[index] as Float32Array, month, share),
	),
	state: {
		...pass.state,
		temperatureK: blend(
			before.state.temperatureK,
			pass.state.temperatureK,
			share,
		),
		previousK: blend(before.state.previousK, pass.state.previousK, share),
		seaTemperatureK: blend(
			before.state.seaTemperatureK,
			pass.state.seaTemperatureK,
			share,
		),
		seaPreviousK: blend(
			before.state.seaPreviousK,
			pass.state.seaPreviousK,
			share,
		),
	},
});

/** Throws unless a field is twelve months of `length` values each. */
const assertMonths = (field: unknown, length: number, what: string): void => {
	if (!Array.isArray(field) || field.length !== MONTHS_PER_YEAR) {
		throw new RangeError(`A start's ${what} must be twelve fields`);
	}
	for (const month of field) {
		if (month?.length !== length) {
			throw new RangeError(
				`A start's ${what} must hold ${length} values each; got ${month?.length}`,
			);
		}
	}
};

/**
 * Throws unless a start's currents, if it has any, are twelve months of
 * four flows for each cell of the grid solved on and of one value of the
 * streamfunction for each of its corners.
 */
const assertStartCurrents = (
	currents: CarriedCurrents | undefined,
	solvedOn: number,
): void => {
	if (currents === undefined) {
		return;
	}
	const grid = getGrid(solvedOn);
	assertMonths(
		currents.flows,
		NEIGHBOUR_COUNT * grid.cellCount,
		"currents' flows",
	);
	assertMonths(
		currents.streamfunction,
		cornerIndex(grid).cornerCount,
		"currents' streamfunction",
	);
};

/** Throws unless a start's arrays are twelve months of one value per cell. */
const assertStart = (start: ClimateStart, cellCount: number): void => {
	const { temperature, winds } = start ?? {};
	const fields: [string, unknown][] = [
		['temperature months', temperature?.months],
		['sea temperature months', temperature?.seaMonths],
		['eastward winds', winds?.east],
		['northward winds', winds?.north],
	];
	for (const [what, field] of fields) {
		assertMonths(field, cellCount, what);
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
 * is exactly {@link solveTemperature}, the {@link solveWinds} of its months
 * and the {@link solveGyres} of those winds. Passes after it carry the
 * temperature on from the pass before's state, which takes about a year of
 * solving each: a pass costs the temperature's warm solve, the flowing part
 * of the winds (about 60 ms a month on the 64 grid, whatever the world's
 * resolution), the winds and the currents.
 *
 * The currents are solved on the world on the grid the temperature is
 * solved on, with the winds on that grid, so that their flows are those of
 * the coasts the heat is carried between; each pass's start from the pass
 * before's streamfunction. The sea's heat is carried with the whole
 * transport of the gyres' wind-driven layer: their flows over its depth,
 * the gyres' `layerDepthM`.
 *
 * A start that suits the world makes the first pass carry on from its
 * temperature's state with heat carried along its winds and currents, and
 * compare its result with the start's months. The first pass never settles the
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
 * its temperature, eastward wind and northward wind, if a start's currents
 * are not twelve months of the flows and the streamfunction of the grid
 * solved on, or if a start's
 * temperature does not record a finite sea level and the planet's
 * temperature settings, as {@link solveTemperature}'s start must.
 * @throws Error if a month's currents do not converge, as
 * {@link solveGyres} throws it.
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
	// The world on the grid solved on, which the currents are solved on.
	const solveWorld = solvedOn === resolution ? world : coarsenWorld(world);
	const onSolveGrid = (field: Float32Array): Float32Array =>
		solvedOn === resolution
			? field
			: Float32Array.from(coarsenField(field, resolution));
	const currentsOf = (
		winds: MonthlyWind,
		guess: CarriedCurrents | undefined,
	): GyreResult =>
		solveGyres(
			solveWorld,
			{
				east: winds.east.map(onSolveGrid),
				north: winds.north.map(onSolveGrid),
			},
			{ guess: guess?.streamfunction },
		);
	let before: CarriedTemperature | undefined;
	let windsBefore: MonthlyWind | undefined;
	let currentsBefore: CarriedCurrents | undefined;
	let lastChange: number | null = null;
	if (options.start !== undefined) {
		assertStart(options.start, cells);
		assertStartCurrents(options.start.currents, solvedOn);
		if (suits(options.start, world, dayLengthHours)) {
			const { temperature, winds, currents } = options.start;
			before = temperature;
			windsBefore = winds;
			// Currents that cross what is now a coast are worked out afresh
			// for the land as it is, from the winds they go with.
			currentsBefore = currents?.flows.every(
				(flows) => landCrossing(solveWorld, flows) < 0,
			)
				? currents
				: currentsOf(winds, currents);
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
			currents:
				currentsBefore === undefined
					? undefined
					: {
							flows: currentsBefore.flows,
							depthM: DEFAULT_GYRE_SETTINGS.layerDepthM,
						},
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
		const currents = currentsOf(winds, currentsBefore);
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
			currents,
			changeC: change,
			settled,
			last,
		});
		if (last) {
			return {
				temperature,
				winds,
				currents,
				dayLengthHours,
				passes: pass,
				settled,
				changeC: change,
			};
		}
		before = temperature;
		windsBefore = winds;
		currentsBefore = currents;
		lastChange = change;
	}
};
