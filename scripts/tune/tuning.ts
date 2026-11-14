/**
 * What the tuning script runs the wind model on, worked out once from the
 * data files' bytes: the report's cases with their temperatures solved,
 * and the observed Earth's winds and pressure. Then the runs themselves:
 * the Earth's three whole-year figures for a set of settings, every case's
 * measures as the wind report takes them, and the Earth run on the
 * observed temperature. It reads and writes no file.
 */

import {
	decodeEarth,
	decodeObservedPressure,
	decodeObservedTemperature,
	decodeObservedWind,
	type Grid,
	getGrid,
	observedPressure,
	observedTemperature,
	observedWind,
	solveTemperature,
	solveWinds,
	summariseWinds,
	type WindResult,
	type WindSettings,
	windErrorFigures,
	zonalMean,
} from '../../src/core/index';
import { cases as allCases, CASE_RESOLUTION } from '../report/cases';
import { type BuiltCase, EARTH_CASE_ID } from '../report/page';
import type { ReportSources } from '../report/run';
import {
	type ChecksSummary,
	type Hemisphere,
	MEASURE_BANDS,
	type Measure,
	summariseChecks,
	tropicalEdge,
	windBandCount,
} from '../report/summary';
import { type FaultMeasures, faultMeasures } from './faults';
import type { EarthFigures } from './search';

/** The cases with their temperatures, and the observed Earth. */
export type Tuning = {
	/** The report's cases, the Earth among them, with their worlds. */
	readonly cases: readonly BuiltCase[];
	/** Each case's twelve months of temperature, in the cases' order. */
	readonly temperatures: readonly (readonly Float32Array[])[];
	/** The observed Earth's winds and pressure on the cases' grid. */
	readonly observed: WindResult;
	/** The cases' grid. */
	readonly grid: Grid;
	/** The Earth case, with its temperatures. */
	readonly earth: {
		readonly built: BuiltCase;
		readonly temperatures: readonly Float32Array[];
	};
};

/**
 * Builds the report's cases and solves each one's temperatures, once.
 *
 * @param sources - The data files' bytes, as the wind report takes them.
 * Not changed.
 * @returns A new tuning set.
 * @throws RangeError if a data file is not one the core can read.
 */
export const prepareTuning = (sources: ReportSources): Tuning => {
	const earthData = decodeEarth(sources.earth);
	const cases: BuiltCase[] = allCases.map((shown) => ({
		case: shown,
		world: shown.build(earthData),
	}));
	const temperatures = cases.map(({ world }) => solveTemperature(world).months);
	const index = cases.findIndex(
		({ case: shown }) => shown.id === EARTH_CASE_ID,
	);
	const built = cases[index] as BuiltCase;
	return {
		cases,
		temperatures,
		observed: {
			...observedWind(decodeObservedWind(sources.wind), CASE_RESOLUTION),
			pressure: observedPressure(
				decodeObservedPressure(sources.pressure),
				CASE_RESOLUTION,
			),
		},
		grid: getGrid(CASE_RESOLUTION),
		earth: { built, temperatures: temperatures[index] as Float32Array[] },
	};
};

/** The three whole-year figures of a year of winds against the observed. */
export const figuresOf = (tuning: Tuning, result: WindResult): EarthFigures => {
	const { year } = windErrorFigures(result, tuning.observed, tuning.grid);
	return {
		windRms: year.rmsVectorDifference,
		// No direction is counted only where no observed wind reaches the
		// speed it takes, which is not so on the Earth; such a run counts as
		// pointing nowhere right.
		directionShare: year.directionShare ?? 0,
		pressureRms: year.pressureRmsDifference,
	};
};

/**
 * The Earth's three whole-year figures with some settings changed.
 *
 * @param tuning - The cases and the observed Earth. Not changed.
 * @param settings - The settings to change. Not changed.
 * @throws RangeError if a setting is not the model's or not finite.
 */
export const earthFigures = (
	tuning: Tuning,
	settings: Partial<WindSettings>,
): EarthFigures =>
	figuresOf(
		tuning,
		solveWinds(tuning.earth.built.world, tuning.earth.temperatures, {
			settings,
		}),
	);

/** A case's measures on its annual mean, as the wind report takes them. */
export type CaseMeasures = {
	readonly caseId: string;
	readonly title: string;
	/** Bands of wind in each hemisphere, by {@link windBandCount}. */
	readonly bands: { readonly [H in Hemisphere]: number };
	/** The tropical cell's edge in each hemisphere, by {@link tropicalEdge}. */
	readonly edges: { readonly [H in Hemisphere]: Measure };
};

/** Every case's measures and the three checks, for one set of settings. */
export type CasesRun = {
	readonly earth: EarthFigures;
	readonly cases: readonly CaseMeasures[];
	readonly checks: ChecksSummary;
};

/**
 * Runs the model on every case with some settings changed, and takes the
 * report's measures of each and its three checks.
 *
 * @param tuning - The cases and the observed Earth. Not changed.
 * @param settings - The settings to change. Not changed.
 * @throws RangeError if a setting is not the model's or not finite.
 */
export const runCases = (
	tuning: Tuning,
	settings: Partial<WindSettings>,
): CasesRun => {
	const results = new Map<string, WindResult>();
	for (const [index, { case: shown, world }] of tuning.cases.entries()) {
		results.set(
			shown.id,
			solveWinds(world, tuning.temperatures[index] as Float32Array[], {
				settings,
			}),
		);
	}
	const measures = tuning.cases.map(({ case: shown }) => {
		const result = results.get(shown.id) as WindResult;
		const east = zonalMean(
			tuning.grid,
			summariseWinds(result).east,
			MEASURE_BANDS,
		);
		return {
			caseId: shown.id,
			title: shown.title,
			bands: {
				southern: windBandCount(east, 'southern'),
				northern: windBandCount(east, 'northern'),
			},
			edges: {
				southern: tropicalEdge(east, 'southern'),
				northern: tropicalEdge(east, 'northern'),
			},
		};
	});
	return {
		earth: figuresOf(tuning, results.get(EARTH_CASE_ID) as WindResult),
		cases: measures,
		checks: summariseChecks({ cases: tuning.cases, results }),
	};
};

/** One column of the diagnostic: a year's figures and fault measures. */
export type DiagnosticColumn = {
	/** The Earth's three figures; null for the observed Earth itself. */
	readonly figures: EarthFigures | null;
	readonly faults: FaultMeasures;
};

/** The Earth on the simulated and on the observed temperature. */
export type Diagnostic = {
	readonly simulated: DiagnosticColumn;
	readonly observedTemperature: DiagnosticColumn;
	readonly observed: DiagnosticColumn;
};

/**
 * The model run on the Earth with the simulated temperature and with the
 * observed temperature, beside the observed winds and pressure.
 *
 * @remarks
 * The observed temperature is taken onto the Earth's cells as the page's
 * comparison takes it, each cell its centre's value, and given to the
 * model as the simulated temperature is.
 *
 * @param tuning - The cases and the observed Earth. Not changed.
 * @param temperatureBytes - The bytes of the observed temperature's data
 * file. Not changed.
 * @param settings - The settings to change, for both runs. Not changed.
 * @throws RangeError if the data file is not one the core can read, or a
 * setting is not the model's or not finite.
 */
export const diagnose = (
	tuning: Tuning,
	temperatureBytes: Uint8Array,
	settings: Partial<WindSettings>,
): Diagnostic => {
	const { world } = tuning.earth.built;
	const observedMonths = observedTemperature(
		decodeObservedTemperature(temperatureBytes),
		world.resolution,
	);
	const column = (months: readonly ArrayLike<number>[]): DiagnosticColumn => {
		const result = solveWinds(world, months, { settings });
		return {
			figures: figuresOf(tuning, result),
			faults: faultMeasures(tuning.grid, result),
		};
	};
	return {
		simulated: column(tuning.earth.temperatures),
		observedTemperature: column(observedMonths),
		observed: {
			figures: null,
			faults: faultMeasures(tuning.grid, tuning.observed),
		},
	};
};
