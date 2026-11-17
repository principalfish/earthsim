/**
 * The layer panel on a real store, with stand-ins for everything else,
 * and the results, observed years and winds its tests give it.
 */

import {
	compareField,
	getGrid,
	type MonthlyTemperature,
	type MonthlyWind,
	type TemperatureResult,
} from '../../core/index';
import { temperatureOf } from '../../core/testing/temperatureFixtures';
import type { ColourRamp, ValueRange } from '../globe/ramp';
import type { WindField } from '../globe/wind';
import {
	createLayerStore,
	type LayerStore,
	type SolvedWinds,
} from '../layers/layers';
import type { ObservedLoader } from '../layers/observedData';
import { cellWeights, FIT_TAIL_SHARE, fitRange } from '../layers/scalar/fit';
import type { PageView, Source } from '../layers/view';
import {
	createLayerPanel,
	type LayerPanel,
	type LayerPanelOptions,
} from '../ui/layerPanel';
import type { ComparisonContent } from '../ui/main/comparison';
import type { CalculationContent } from '../ui/main/infoBox';
import { formatFigures, type LegendContent } from '../ui/main/legend';
import type { WindKeyContent } from '../ui/main/windKey';
import { createFakeTimers } from './fakeTimers';
import { settle } from './settle';

/** What the globe was asked to show: a field, its range and ramp, or none. */
export type Shown = {
	readonly field: Float32Array | null;
	readonly range?: ValueRange;
	readonly ramp?: ColourRamp;
};

/**
 * A result whose months each hold different values: month m holds m - 30
 * and m + 10 in its two cells, so January holds the coldest value and
 * December the hottest, and every month's field is told apart.
 */
export const resultWith = (offset = 0): TemperatureResult => {
	const result = temperatureOf(1);
	result.months.forEach((month, m) => {
		month.set([m - 30 + offset, m + 10 + offset]);
	});
	return result;
};

/** A result whose every month runs from min in one cell to max in the other. */
export const resultSpanning = (min: number, max: number): TemperatureResult => {
	const result = temperatureOf(1);
	for (const month of result.months) {
		month.set([min, max]);
	}
	return result;
};

/** The year's scale of a result, fitted as the panel fits it. */
export const yearRange = (result: TemperatureResult) =>
	fitRange(result.months, cellWeights(result.months[0]?.length ?? 0));

/**
 * A result on the 64 grid. Its smallest cells, a few more than half a
 * percent of the cells but less than half a percent of the area, are at
 * -60 °C in January, and one cell at 100 °C; the rest are at 10 °C. Every
 * cell is 4 °C warmer each month than the month before, so the seasonal
 * range is 44 °C everywhere.
 */
export const resultOnGrid = (): TemperatureResult => {
	const grid = getGrid(64);
	const order = Array.from(grid.areas.keys()).sort(
		(a, b) => (grid.areas[a] as number) - (grid.areas[b] as number),
	);
	const cold = new Set(
		order.slice(0, Math.ceil(grid.cellCount * FIT_TAIL_SHARE) + 3),
	);
	const hot = order.at(-1) as number;
	const result = temperatureOf(1, grid.cellCount);
	result.months.forEach((month, m) => {
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const base = cold.has(cell) ? -60 : cell === hot ? 100 : 10;
			month[cell] = base + 4 * m;
		}
	});
	return result;
};

/** The labels of the ticks along a legend's scale, if it has one. */
export const tickLabels = (legend: LegendContent | null | undefined) =>
	legend?.scale?.ticks.map((tick) => tick.label);

/**
 * The layer panel on a real store, with stand-ins for everything else.
 */
export const createStage = (
	own: Partial<Pick<LayerPanelOptions, 'start' | 'layers' | 'units'>> = {},
) => {
	const errors: unknown[] = [];
	/** What the panel reported as errors of its own. */
	const reported: unknown[] = [];
	const store: LayerStore = createLayerStore((error) => errors.push(error));
	const shown: Shown[] = [];
	/** What was said of the calculation, for the info box's status line. */
	const calculations: CalculationContent[] = [];
	/** Every wind field the globe was given, or null for none. */
	const winds: (WindField | null)[] = [];
	/** What was said of the winds, for the info box's status line. */
	const keys: (WindKeyContent | null)[] = [];
	const legends: (LegendContent | null)[] = [];
	/** What the comparison control was told to show. */
	const comparisons: ComparisonContent[] = [];
	/** The layers whose observed year was asked for, in order. */
	const observedAsked: string[] = [];
	/** The observed temperature's loader, as each test sets it. */
	let loadObserved: ObservedLoader = () =>
		Promise.reject(new Error('The observed temperature is not asked for'));
	/** The observed winds' loader, as each test sets it. */
	let loadObservedWinds: ObservedLoader<MonthlyWind> = () =>
		Promise.reject(new Error('The observed winds are not asked for'));
	/** What the panel told of the view settings, with playing. */
	const views: { readonly view: PageView; readonly playing: boolean }[] = [];
	/** What the panel told of the view settings. */
	const told: PageView[] = [];
	const timers = createFakeTimers();
	/** What the globe throws when next asked to show something, if anything. */
	let failure: Error | null = null;
	/** What the globe throws when next given winds, if anything. */
	let windsFailure: Error | null = null;
	/** What reporting an error throws, once it has taken the error, if anything. */
	let reportFailure: Error | null = null;
	const panel: LayerPanel = createLayerPanel({
		...own,
		store,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		onView: (view, playing) => {
			told.push(view);
			views.push({ view, playing });
		},
		loadObserved: (layer, resolution) => {
			observedAsked.push(layer.id);
			return loadObserved(resolution);
		},
		loadObservedWinds: (resolution) => loadObservedWinds(resolution),
		onComparison: (content) => comparisons.push(content),
		reportError: (error) => {
			reported.push(error);
			if (reportFailure !== null) {
				throw reportFailure;
			}
		},
		globe: {
			setLayer: (field, range, ramp) => {
				if (failure !== null) {
					const thrown = failure;
					failure = null;
					throw thrown;
				}
				shown.push({ field, range, ramp });
			},
			setWinds: (field) => {
				if (windsFailure !== null) {
					const thrown = windsFailure;
					windsFailure = null;
					throw thrown;
				}
				winds.push(field);
			},
		},
		createControls: () => ({
			showLegend: (content) => legends.push(content),
			showWindKey: (content) => keys.push(content),
			showCalculation: (content) => calculations.push(content),
		}),
	});
	/** Has a result arrive, current, as the scheduler does. */
	const arrive = (result: TemperatureResult): void => {
		store.markCalculating();
		store.setResult(result, true);
	};
	return {
		store,
		errors,
		reported,
		shown,
		calculations,
		winds,
		keys,
		legends,
		comparisons,
		observedAsked,
		views,
		told,
		timers,
		panel,
		arrive,
		lastLegend: () => legends.at(-1),
		/** What the panel last told of the view settings, with playing. */
		lastView: () => views.at(-1),
		/** Has the globe throw this the next time it is asked to show something. */
		failNext: (error: Error): void => {
			failure = error;
		},
		/** Has the globe throw this the next time it is given winds. */
		failWindsNext: (error: Error): void => {
			windsFailure = error;
		},
		/** Has the observed temperature come from this loader from now on. */
		setLoader: (loader: ObservedLoader): void => {
			loadObserved = loader;
		},
		/** What the comparison control was last told to show. */
		lastComparison: () => comparisons.at(-1),
		/** Has the observed winds come from this loader from now on. */
		setWindsLoader: (loader: ObservedLoader<MonthlyWind>): void => {
			loadObservedWinds = loader;
		},
		/** What the key to the wind arrows was last told to show. */
		lastKey: () => keys.at(-1),
		/** What was last said of the calculation. */
		lastCalculation: () => calculations.at(-1),
		/** Has every report of an error throw this, once the error is taken. */
		failReports: (error: Error): void => {
			reportFailure = error;
		},
	};
};

/**
 * A loader of an observed year, the temperature's unless said otherwise,
 * that answers when a test says.
 */
export const createDeferredLoader = <G = MonthlyTemperature>() => {
	const calls: {
		readonly resolution: number;
		resolve(months: G): void;
		reject(error: unknown): void;
	}[] = [];
	const loader: ObservedLoader<G> = (resolution) =>
		new Promise((resolve, reject) => {
			calls.push({ resolution, resolve, reject });
		});
	/** The call made last, which must have been made. */
	const last = () => {
		const call = calls.at(-1);
		if (call === undefined) {
			throw new Error('The observed year was not asked for');
		}
		return call;
	};
	return { calls, loader, last };
};

/**
 * An observed year on the 64 grid that differs from a simulated one: each
 * cell is colder by an amount of its own, the more so the later the month,
 * and a few cells far colder, so that it reaches below the simulated year.
 */
export const observedFor = (result: TemperatureResult): Float32Array[] =>
	result.months.map((month, m) =>
		month.map(
			(value, cell) =>
				value - 1 - (cell % 5) * 0.4 - m * 0.3 - (cell % 997 === 0 ? 50 : 0),
		),
	);

/** A stage in Temperature view on the measured Earth at 64, with a result. */
export const createEarthStage = () => {
	const stage = createStage();
	const deferred = createDeferredLoader();
	stage.setLoader(deferred.loader);
	stage.panel.setLayer('temperature');
	stage.panel.newWorld(64);
	const result = resultOnGrid();
	stage.arrive(result);
	const observed = observedFor(result);
	const grid = getGrid(64);
	/** Chooses a source and has the observed temperature arrive. */
	const choose = async (source: Source): Promise<void> => {
		const before = deferred.calls.length;
		stage.panel.setSource(source);
		if (deferred.calls.length > before) {
			deferred.last().resolve(observed);
			await settle();
		}
	};
	return { stage, deferred, result, observed, grid, choose };
};

/** The figures the legend writes for a pair of fields. */
export const figuresText = (
	a: Float32Array,
	b: Float32Array,
	grid = getGrid(64),
): string => formatFigures(compareField(a, b, grid), '°C');

/**
 * A year of winds over two cells whose months are told apart: month m
 * blows m + 1 m/s eastward in the first cell and m + 1 m/s northward in the
 * second.
 */
export const solvedWinds = (offset = 0): SolvedWinds => {
	const months = Array.from({ length: 12 }, (_, m) => m);
	return {
		winds: {
			east: months.map((m) => Float32Array.of(m + 1 + offset, 0)),
			north: months.map((m) => Float32Array.of(0, m + 1 + offset)),
			pressure: months.map(() => Float32Array.of(1013, 1013)),
		},
		temperature: temperatureOf(1),
		dayLengthHours: 24,
	};
};
