/**
 * Works out the wind report from the bytes of the data files: builds the
 * cases, runs every model on each with its temperatures and times each on
 * the Earth, and puts the page together. It reads and writes no file; the
 * clock and where warnings go are passed in.
 */

import {
	decodeEarth,
	decodeObservedPressure,
	decodeObservedWind,
	earthWorld,
	observedPressure,
	observedWind,
	type Resolution,
	SUPPORTED_RESOLUTIONS,
	solveTemperature,
	type WindModel,
	type WindResult,
	type World,
} from '../../src/core/index';
import { cases as allCases, CASE_RESOLUTION, type ReportCase } from './cases';
import {
	type BuiltCase,
	buildReport,
	EARTH_CASE_ID,
	faultText,
	type ModelFault,
	type ModelRun,
	type ModelTiming,
} from './page';

/** A wind model as the report runs it, under its name. */
export type RegisteredModel = {
	/** The model's name, for headings: unique among the models. */
	readonly name: string;
	readonly model: WindModel;
};

/** The bytes of the data files the report reads. */
export type ReportSources = {
	/** `public/data/earth-256.bin`. */
	readonly earth: Uint8Array;
	/** `public/data/earth-wind-1deg.bin`. */
	readonly wind: Uint8Array;
	/** `public/data/earth-pressure-1deg.bin`. */
	readonly pressure: Uint8Array;
};

/** What the report is worked out from. */
export type ReportOptions = {
	readonly sources: ReportSources;
	/** The models to run, in the order to show them; there may be none. */
	readonly models: readonly RegisteredModel[];
	/** A clock in milliseconds from any fixed start, for the solve times. */
	readonly now: () => number;
	/**
	 * Where a warning goes, one sentence each: `console.warn` when the
	 * report is written. A warning is given for each case on which a model's
	 * result holds a value that is not a finite number.
	 */
	readonly warn: (message: string) => void;
	/**
	 * The cases to run, one of them the Earth. Defaults to every case of
	 * the report.
	 */
	readonly cases?: readonly ReportCase[];
	/**
	 * The resolutions each model is timed at on the Earth. Defaults to
	 * every supported resolution.
	 */
	readonly timingResolutions?: readonly Resolution[];
};

/** The fields of a result, in the order they are searched. */
const FIELDS = ['east', 'north', 'pressure'] as const;

/**
 * Where a model's result first holds a value that is not a finite number.
 *
 * @param result - The result. Not changed.
 * @returns The earliest month holding such a value and, in it, the first
 * field that does, in the order eastward wind, northward wind, pressure;
 * null when every value is finite.
 */
export const firstNonFinite = (result: WindResult): ModelFault | null => {
	const months = Math.max(...FIELDS.map((field) => result[field].length));
	for (let month = 0; month < months; month++) {
		for (const field of FIELDS) {
			const values = result[field][month];
			if (values === undefined) {
				continue;
			}
			for (const value of values) {
				if (!Number.isFinite(value)) {
					return { month, field };
				}
			}
		}
	}
	return null;
};

/** The temperatures of a world, as a model takes them. */
const temperaturesOf = (world: World): Float32Array[] =>
	solveTemperature(world).months;

/**
 * The whole report page, worked out from the data files' bytes.
 *
 * @remarks
 * Temperatures are solved only when there is a model to give them to:
 * once for each case, and once for the Earth at each resolution it is
 * timed at other than the cases' own, where the Earth case's are used.
 * A model's time is that of its own run alone, given the temperatures.
 *
 * A model whose result on a case holds a value that is not a finite number
 * has that case noted as a fault, which the page shows in place of the
 * case's maps and figures, and a warning passed to `warn`; its other cases
 * and its times carry on as ever.
 *
 * @param options - The data, the models, the clock, and the cases and
 * resolutions to use. Not changed.
 * @returns The page, as {@link buildReport} gives it.
 * @throws RangeError if the cases do not include the Earth, which is
 * checked before anything is worked out, or a data file is not one the
 * core can read.
 */
export const workOutReport = (options: ReportOptions): string => {
	const {
		sources,
		models,
		now,
		warn,
		cases = allCases,
		timingResolutions = SUPPORTED_RESOLUTIONS,
	} = options;
	if (!cases.some(({ id }) => id === EARTH_CASE_ID)) {
		throw new RangeError(`The cases must include one named ${EARTH_CASE_ID}`);
	}
	const earth = decodeEarth(sources.earth);
	const observed: WindResult = {
		...observedWind(decodeObservedWind(sources.wind), CASE_RESOLUTION),
		pressure: observedPressure(
			decodeObservedPressure(sources.pressure),
			CASE_RESOLUTION,
		),
	};
	const built: BuiltCase[] = cases.map((shown) => ({
		case: shown,
		world: shown.build(earth),
	}));
	const runs: ModelRun[] = [];
	if (models.length > 0) {
		const temperatures = built.map(({ world }) => temperaturesOf(world));
		const earthIndex = built.findIndex(
			({ case: shown }) => shown.id === EARTH_CASE_ID,
		);
		const timed = timingResolutions.map((resolution) => {
			if (resolution === CASE_RESOLUTION) {
				return {
					resolution,
					world: built[earthIndex]?.world as World,
					temperatures: temperatures[earthIndex] as Float32Array[],
				};
			}
			const world = earthWorld(earth, resolution);
			return { resolution, world, temperatures: temperaturesOf(world) };
		});
		for (const { name, model } of models) {
			const results = new Map<string, WindResult>();
			const faults = new Map<string, ModelFault>();
			for (const [index, { case: shown, world }] of built.entries()) {
				const result = model(world, temperatures[index] as Float32Array[]);
				results.set(shown.id, result);
				const fault = firstNonFinite(result);
				if (fault !== null) {
					faults.set(shown.id, fault);
					warn(
						`The wind model ${name} gave a value that is not a finite number on the case ${shown.title}; its maps and figures for it are left out. ${faultText(fault)}`,
					);
				}
			}
			const timings: ModelTiming[] = timed.map(
				({ resolution, world, temperatures: months }) => {
					const began = now();
					model(world, months);
					return { resolution, seconds: (now() - began) / 1000 };
				},
			);
			runs.push({ name, results, faults, timings });
		}
	}
	return buildReport({ cases: built, observed, models: runs });
};
