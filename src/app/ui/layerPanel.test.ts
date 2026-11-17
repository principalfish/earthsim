import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	compareField,
	compareFields,
	differenceField,
	type FieldDifference,
	getGrid,
	type MonthlyTemperature,
	type MonthlyWind,
	summariseTemperature,
	summariseWinds,
	type TemperatureResult,
} from '../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../core/testing/temperatureFixtures';
import {
	type ColourRamp,
	DIFFERENCE_RAMP,
	PRESSURE_RAMP,
	rampGradient,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
	type ValueRange,
} from '../globe/ramp';
import type { WindField } from '../globe/wind';
import {
	createLayerStore,
	type LayerStore,
	type SolvedWinds,
} from '../layers/layers';
import type { ObservedLoader } from '../layers/observedData';
import { PLAYBACK_STEP_MS } from '../layers/playback';
import {
	fitSummaryScale,
	isDifferenceView,
	layerCaption,
	metricRange,
	OBSERVED_FAILED_TEXT,
	OBSERVED_LOADING_TEXT,
	OBSERVED_PRESSURE_FAILED_TEXT,
	OBSERVED_PRESSURE_LOADING_TEXT,
	PRESSURE_LAYER,
	SEASONAL_RANGE_TICK_STEP,
	summaryOf,
	TEMPERATURE_LAYER,
	TEMPERATURE_NOT_SHOWN_TEXT,
	TEMPERATURE_UNAVAILABLE_TEXT,
	toLayerUnit,
} from '../layers/scalarLayer';
import {
	DEFAULT_MONTH,
	DEFAULT_PAGE_VIEW,
	DEFAULT_SOURCE,
	DEFAULT_SUMMARY,
	type Layer,
	type PageView,
	SOURCES,
	type Source,
	type StoredView,
	type Summary,
	WIND_SOURCES,
} from '../layers/view';
import { SYSTEM_UNITS } from '../settings/units';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { createFakeTimers } from '../testing/fakeTimers';
import { SEVEN_STOP_RAMP } from '../testing/rampFixtures';
import {
	MADE_UP_ID,
	MADE_UP_LAYER,
	pressureWinds,
	weightedMean,
} from '../testing/scalarLayerFixtures';
import { settle } from '../testing/settle';
import {
	createLayerPanel,
	type LayerPanel,
	type LayerPanelOptions,
} from './layerPanel';
import type { ComparisonContent } from './main/comparison';
import {
	CALCULATING_TEMPERATURE_TEXT,
	CALCULATING_WINDS_TEXT,
	type CalculationContent,
	createInfoBox,
	type InfoBox,
	PAUSED_TEXT,
} from './main/infoBox';
import {
	cellWeights,
	FIT_TAIL_SHARE,
	fitRange,
	fitRangeCentred,
	fitRangeFromZero,
	formatFigures,
	LEGEND_CALCULATING_TEXT,
	LEGEND_EMPTY_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
	type LegendContent,
	legendContent,
} from './main/legend';
import {
	OBSERVED_WINDS_FAILED_TEXT,
	OBSERVED_WINDS_LOADING_TEXT,
	WINDS_CALCULATING_TEXT,
	WINDS_UNAVAILABLE_TEXT,
	type WindKeyContent,
} from './main/windKey';

/** What the globe was asked to show: a field, its range and ramp, or none. */
type Shown = {
	readonly field: Float32Array | null;
	readonly range?: ValueRange;
	readonly ramp?: ColourRamp;
};

/**
 * A result whose months each hold different values: month m holds m - 30
 * and m + 10 in its two cells, so January holds the coldest value and
 * December the hottest, and every month's field is told apart.
 */
const resultWith = (offset = 0): TemperatureResult => {
	const result = temperatureOf(1);
	result.months.forEach((month, m) => {
		month.set([m - 30 + offset, m + 10 + offset]);
	});
	return result;
};

/** A result whose every month runs from min in one cell to max in the other. */
const resultSpanning = (min: number, max: number): TemperatureResult => {
	const result = temperatureOf(1);
	for (const month of result.months) {
		month.set([min, max]);
	}
	return result;
};

/** The year's scale of a result, fitted as the panel fits it. */
const yearRange = (result: TemperatureResult) =>
	fitRange(result.months, cellWeights(result.months[0]?.length ?? 0));

/**
 * A result on the 64 grid. Its smallest cells, a few more than half a
 * percent of the cells but less than half a percent of the area, are at
 * -60 °C in January, and one cell at 100 °C; the rest are at 10 °C. Every
 * cell is 4 °C warmer each month than the month before, so the seasonal
 * range is 44 °C everywhere.
 */
const resultOnGrid = (): TemperatureResult => {
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
const tickLabels = (legend: LegendContent | null | undefined) =>
	legend?.scale?.ticks.map((tick) => tick.label);

/**
 * The layer panel on a real store, with stand-ins for everything else.
 */
const createStage = (
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

describe('createLayerPanel', () => {
	it('opens on the terrain, asking nothing of the globe', () => {
		const stage = createStage();
		expect(stage.told).toEqual([]);
		stage.panel.setSunlight(true);
		expect(stage.told).toEqual([{ ...DEFAULT_PAGE_VIEW, sunlight: true }]);
		expect(stage.shown).toEqual([]);
		expect(stage.legends).toEqual([null]);
	});

	it('leaves the globe on the terrain while a result arrives in Terrain view', () => {
		const stage = createStage();
		stage.arrive(resultWith());
		expect(stage.shown).toEqual([]);
		expect(stage.legends.every((legend) => legend === null)).toBe(true);
	});

	it('says nothing is there yet when the temperature is chosen before a result', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
	});

	it("shows July's field once a result arrives, on the year's fitted range and the ramp", () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		expect(stage.shown).toHaveLength(1);
		const [first] = stage.shown;
		expect(first?.field).toBe(result.months[DEFAULT_MONTH]);
		expect(first?.range).toEqual({ min: -30, max: 21 });
		expect(first?.range).toEqual(yearRange(result));
		expect(first?.ramp).toBe(TEMPERATURE_RAMP);
		const legend = stage.lastLegend();
		expect(legend?.status).toBeNull();
		expect(legend?.scale?.gradient).toBe(rampGradient(TEMPERATURE_RAMP));
		expect(legend?.scale?.ticks.map((tick) => tick.label)).toEqual([
			'−30',
			'−20',
			'−10',
			'0',
			'10',
			'20',
		]);
	});

	it('shows the result on hand at once when chosen again', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setLayer('terrain');
		stage.panel.setLayer('temperature');
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
			null,
			result.months[DEFAULT_MONTH],
		]);
		expect(stage.shown[2]?.field).toBe(result.months[DEFAULT_MONTH]);
	});

	it('goes back to the height colours for Terrain', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.panel.setLayer('terrain');
		expect(stage.shown.at(-1)).toEqual({
			field: null,
			range: undefined,
			ramp: undefined,
		});
		expect(stage.lastLegend()).toBeNull();
	});

	it('changes nothing for a layer chosen again that is already on show', () => {
		const stage = createStage();
		stage.panel.setLayer('terrain');
		stage.panel.setLayer('temperature');
		const told = stage.told.length;
		const legends = stage.legends.length;
		stage.panel.setLayer('temperature');
		expect(stage.told).toHaveLength(told);
		expect(stage.legends).toHaveLength(legends);
	});

	it('sends each new result to the globe, on its own range', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		const next = resultWith(5);
		stage.arrive(next);
		expect(stage.shown).toHaveLength(2);
		expect(stage.shown[1]?.field).toBe(next.months[DEFAULT_MONTH]);
		expect(stage.shown[1]?.range).toEqual({ min: -25, max: 26 });
	});

	it('keeps the previous field on the globe while it is out of date or calculated again', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.store.markOutOfDate();
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.lastLegend()?.scale).not.toBeNull();
		stage.store.markCalculating();
		stage.store.setProgress({ ...progressOf(2), estimatedYearsLeft: 2 });
		expect(stage.lastLegend()?.status).toBe(
			'Calculating · year 2, about 2 to go',
		);
		expect(stage.lastLegend()?.bar).toEqual({ fraction: 0.5 });
		expect(stage.lastLegend()?.scale).not.toBeNull();
		stage.store.markFailed();
		expect(stage.shown).toHaveLength(1);
		expect(stage.shown[0]?.field).toBe(result.months[DEFAULT_MONTH]);
	});

	it('goes back to the height colours when the store drops its result, as for a new world', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.store.clear();
		expect(stage.shown.at(-1)?.field).toBeNull();
		expect(stage.lastLegend()).toEqual({
			scale: null,
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
		// The choice is kept: the new world's result is shown when it comes.
		const next = resultWith(1);
		stage.arrive(next);
		expect(stage.shown.at(-1)?.field).toBe(next.months[DEFAULT_MONTH]);
	});

	it('fits a result afresh that comes again after the store dropped it', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.store.clear();
		// The same result, with other values: a scale kept from before the
		// store dropped it would no longer fit.
		result.months.forEach((month, m) => {
			month.set([m - 50, m + 50]);
		});
		stage.arrive(result);
		expect(stage.shown.at(-1)?.range).toEqual({ min: -50, max: 61 });
	});

	it('keeps the field on the globe once the temperature is unavailable', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.store.markUnavailable();
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
		]);
		expect(stage.lastLegend()?.status).toBe(TEMPERATURE_UNAVAILABLE_TEXT);
		expect(stage.lastLegend()?.scale).not.toBeNull();
	});

	it('says the temperature is unavailable with no result, leaving the terrain', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.store.markUnavailable();
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			state: 'unavailable',
			status: TEMPERATURE_UNAVAILABLE_TEXT,
			bar: null,
		});
	});

	it('records what the globe throws, still updates the legend, and shows the next result', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const failure = new RangeError('The field is not one value per cell');
		stage.failNext(failure);
		stage.arrive(resultWith());
		expect(stage.errors).toEqual([failure]);
		// The globe was left on the terrain, so the legend has no scale, and
		// it says the temperature could not be shown, not that it is still
		// being calculated.
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()?.status).toBe(TEMPERATURE_NOT_SHOWN_TEXT);
		expect(stage.lastLegend()?.scale).toBeNull();
		// Straight to the next result, with no change between to send the
		// first again.
		const next = resultWith(5);
		stage.store.setResult(next, true);
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			next.months[DEFAULT_MONTH],
		]);
		expect(stage.shown[0]?.range).toEqual({ min: -25, max: 26 });
		expect(stage.lastLegend()?.status).toBeNull();
		expect(stage.errors).toEqual([failure]);
	});

	it('sends a field the globe refused again at the next change', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.failNext(new RangeError('Refused once'));
		stage.arrive(result);
		stage.store.markOutOfDate();
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
		]);
		expect(stage.errors).toHaveLength(1);
	});

	it("keeps the legend on the globe's scale while the globe refuses a new result, until it takes it", () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const first = resultSpanning(-10, 10);
		stage.arrive(first);
		const firstTicks = ['−10', '−5', '0', '5', '10'];
		expect(tickLabels(stage.lastLegend())).toEqual(firstTicks);
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		const second = resultSpanning(0, 40);
		stage.store.markCalculating();
		stage.store.setResult(second, false);
		expect(stage.errors).toEqual([failure]);
		// The globe still shows the first result, and the legend its scale,
		// while its line says where the store's result stands.
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			first.months[DEFAULT_MONTH],
		]);
		expect(tickLabels(stage.lastLegend())).toEqual(firstTicks);
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		// The next change sends the refused field again; taken, the legend
		// moves to its scale.
		stage.store.markCalculating();
		expect(stage.shown.at(-1)?.field).toBe(second.months[DEFAULT_MONTH]);
		expect(stage.shown.at(-1)?.range).toEqual({ min: 0, max: 40 });
		expect(tickLabels(stage.lastLegend())).toEqual([
			'0',
			'10',
			'20',
			'30',
			'40',
		]);
		expect(stage.errors).toEqual([failure]);
	});

	it('marks the earlier result out of date while the globe refuses a current one, until it takes it', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const first = resultSpanning(-10, 10);
		stage.arrive(first);
		expect(stage.lastLegend()?.status).toBeNull();
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		const second = resultSpanning(0, 40);
		stage.store.markCalculating();
		stage.store.setResult(second, true);
		expect(stage.store.temperature.status).toBe('current');
		expect(stage.errors).toEqual([failure]);
		// The globe still shows the first result, on its scale, and the
		// legend does not pass it off as the current one.
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			first.months[DEFAULT_MONTH],
		]);
		expect(tickLabels(stage.lastLegend())).toEqual([
			'−10',
			'−5',
			'0',
			'5',
			'10',
		]);
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		// Leaving for the terrain and coming back sends the refused field;
		// taken, the legend moves to its scale with nothing said.
		stage.panel.setLayer('terrain');
		stage.panel.setLayer('temperature');
		expect(stage.shown.at(-1)?.field).toBe(second.months[DEFAULT_MONTH]);
		expect(tickLabels(stage.lastLegend())).toEqual([
			'0',
			'10',
			'20',
			'30',
			'40',
		]);
		expect(stage.lastLegend()?.status).toBeNull();
	});

	it('shows no scale but says where the result stands when the first field is refused', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.failNext(new RangeError('Refused once'));
		stage.store.markCalculating();
		stage.store.setResult(resultSpanning(-10, 10), false);
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			state: 'outOfDate',
			status: LEGEND_OUT_OF_DATE_TEXT,
			bar: null,
		});
	});

	it('says a current first result the globe refused could not be shown, until it takes one', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.failNext(new RangeError('Refused once'));
		stage.arrive(resultSpanning(-10, 10));
		expect(stage.store.temperature.status).toBe('current');
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			state: 'unavailable',
			status: TEMPERATURE_NOT_SHOWN_TEXT,
			bar: null,
		});
		// The next result, straight after with no change between, is taken,
		// and its scale replaces the line.
		const next = resultSpanning(0, 40);
		stage.store.setResult(next, true);
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			next.months[DEFAULT_MONTH],
		]);
		expect(stage.lastLegend()?.status).toBeNull();
		expect(tickLabels(stage.lastLegend())).toEqual([
			'0',
			'10',
			'20',
			'30',
			'40',
		]);
	});

	it('records nothing as an error in normal use', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.store.markOutOfDate();
		stage.store.clear();
		expect(stage.errors).toEqual([]);
	});

	it("fits the year's scale to the middle 99% of a real grid by area, with no words for what lies beyond", () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultOnGrid();
		stage.arrive(result);
		// By area the cold cells and the hot one are left out; counted by
		// cell-months, the cold cells would take the scale below zero.
		expect(stage.shown.at(-1)?.range).toEqual({ min: 10, max: 54 });
		const evenly = new Float64Array(getGrid(64).cellCount).fill(1);
		expect(fitRange(result.months, evenly).min).toBe(-16);
		const legend = stage.lastLegend();
		expect(legend?.scale).not.toHaveProperty('below');
		expect(legend?.scale).not.toHaveProperty('above');
	});

	it('fits the year once per result, on one scale through every month, summary and change of status', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultOnGrid();
		stage.arrive(result);
		const scale = stage.shown.at(-1)?.range;
		stage.store.markOutOfDate();
		stage.store.markCalculating();
		stage.store.setProgress(progressOf(1));
		stage.panel.setMonth(0);
		for (const view of ['annualMean', 'warmest', 'coldest'] as const) {
			stage.panel.setSummary('temperature', view);
			expect(stage.shown.at(-1)?.range).toBe(scale);
			// The warmest and coldest months hold values beyond the scale
			// too, which take its end colours; the legend has no words for them.
			expect(stage.lastLegend()?.scale).not.toHaveProperty('below');
			expect(stage.lastLegend()?.scale).not.toHaveProperty('above');
		}
		stage.panel.setSummary('temperature', 'month');
		expect(stage.shown.every((shown) => shown.range === scale)).toBe(true);
		// A new result is fitted afresh.
		stage.arrive(resultOnGrid());
		expect(stage.shown.at(-1)?.range).not.toBe(scale);
	});

	it('captions the legend with the month on screen', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in July, °C',
		);
		stage.panel.setMonth(0);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in January, °C',
		);
	});
});

describe('createLayerPanel, starting on a stored view', () => {
	/** A view as the browser may have stored it. */
	const stored = (view: Partial<StoredView> = {}): StoredView => ({
		layer: 'temperature',
		summaries: { temperature: 'annualMean', pressure: 'month' },
		sunlight: true,
		winds: true,
		grid: true,
		...view,
	});

	it('starts on the stored layer, views of the year and toggles, with July and Simulated, telling nothing of the view', () => {
		const stage = createStage({ start: stored() });
		expect(stage.told).toEqual([]);
		stage.panel.setSource('simulated');
		stage.panel.setMonth(3);
		expect(stage.told).toEqual([
			{
				...stored(),
				month: 3,
				source: DEFAULT_SOURCE,
			},
		]);
	});

	it('shows on the globe what the stored view chooses, as the same choices made on a default start would', () => {
		const result = resultWith();
		const started = createStage({ start: stored() });
		started.arrive(result);
		started.store.markWindsCalculating();
		started.store.setWindsResult(solvedWinds(), true);
		const chosen = createStage();
		chosen.panel.setLayer('temperature');
		chosen.panel.setSummary('temperature', 'annualMean');
		chosen.panel.setWinds(true);
		chosen.arrive(result);
		chosen.store.markWindsCalculating();
		chosen.store.setWindsResult(solvedWinds(), true);
		expect(started.shown).toHaveLength(1);
		expect(started.shown).toEqual(chosen.shown);
		expect(started.winds.at(-1)).not.toBeNull();
		expect(started.winds.at(-1)).toEqual(chosen.winds.at(-1));
		expect(started.lastLegend()).toEqual(chosen.lastLegend());
	});

	it('starts on Terrain for a stored layer it does not offer', () => {
		const stage = createStage({
			start: stored({ layer: 'pressure' }),
			layers: [TEMPERATURE_LAYER],
		});
		stage.panel.setMonth(3);
		expect(stage.told.at(-1)?.layer).toBe('terrain');
		stage.arrive(resultWith());
		expect(stage.shown).toEqual([]);
	});

	it('starts a layer on the Month view for a stored view of the year it does not offer', () => {
		const stage = createStage({
			start: stored({
				layer: 'pressure',
				summaries: { temperature: 'range', pressure: 'range' },
			}),
		});
		stage.panel.setMonth(3);
		expect(stage.told.at(-1)?.summaries).toEqual({
			temperature: 'range',
			pressure: DEFAULT_SUMMARY,
		});
	});

	it('keeps each layer’s stored view of the year while another is on screen', () => {
		const stage = createStage({
			start: stored({
				summaries: { temperature: 'coldest', pressure: 'annualMean' },
			}),
		});
		stage.panel.setLayer('pressure');
		stage.panel.setLayer('temperature');
		expect(stage.told.at(-1)?.summaries).toEqual({
			temperature: 'coldest',
			pressure: 'annualMean',
		});
	});
});

describe('createLayerPanel, the cell grid', () => {
	it('starts off, and tells of the grid with the rest of the view at each change, asking nothing of the globe', () => {
		const stage = createStage();
		stage.panel.setGrid(false);
		expect(stage.told).toEqual([]);
		stage.panel.setGrid(true);
		stage.panel.setGrid(true);
		stage.panel.setGrid(false);
		expect(stage.told).toEqual([
			{ ...DEFAULT_PAGE_VIEW, grid: true },
			DEFAULT_PAGE_VIEW,
		]);
		expect(stage.shown).toEqual([]);
		expect(stage.winds).toEqual([]);
	});

	it('is kept through a new world', () => {
		const stage = createStage();
		stage.panel.setGrid(true);
		stage.panel.setMonth(2);
		stage.panel.newWorld(null);
		expect(stage.told.at(-1)).toEqual({ ...DEFAULT_PAGE_VIEW, grid: true });
	});
});

describe('createLayerPanel, the month', () => {
	it('shows the month the slider is moved to, on the same scale as July', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const ticks = tickLabels(stage.lastLegend());
		stage.panel.setMonth(0);
		stage.panel.setMonth(11);
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
			result.months[0],
			result.months[11],
		]);
		expect(stage.shown[2]?.field).toBe(result.months[11]);
		// The colours keep their meaning: one range, one ramp.
		expect(stage.shown[1]?.range).toBe(stage.shown[0]?.range);
		expect(stage.shown[2]?.range).toBe(stage.shown[0]?.range);
		expect(stage.shown.every((shown) => shown.ramp === TEMPERATURE_RAMP)).toBe(
			true,
		);
		expect(tickLabels(stage.lastLegend())).toEqual(ticks);
		expect(stage.told.at(-1)).toEqual({
			layer: 'temperature',
			summaries: { temperature: 'month', pressure: 'month' },
			source: 'simulated',
			month: 11,
			sunlight: false,
			winds: false,
			grid: false,
		});
	});

	it('asks nothing for the month already on screen', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		const told = stage.told.length;
		stage.panel.setMonth(DEFAULT_MONTH);
		expect(stage.shown).toHaveLength(1);
		expect(stage.told).toHaveLength(told);
	});

	it('keeps the month across a switch to the terrain and back', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setMonth(2);
		stage.panel.setLayer('terrain');
		stage.panel.setLayer('temperature');
		expect(stage.shown.at(-1)?.field).toBe(result.months[2]);
	});

	it('keeps the month and the view for a new result, as after an edit', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.panel.setMonth(2);
		const next = resultWith(5);
		stage.arrive(next);
		expect(stage.shown.at(-1)?.field).toBe(next.months[2]);
		expect(stage.lastView()?.view.month).toBe(2);
	});

	it('puts July back on screen and stops playing for a new world, keeping the view', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setMonth(2);
		stage.panel.togglePlaying();
		stage.panel.newWorld(null);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 6,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: false,
		});
		expect(stage.told.at(-1)?.month).toBe(DEFAULT_MONTH);
		expect(stage.shown.at(-1)?.field).toBe(result.months[DEFAULT_MONTH]);
		expect(stage.timers.pending()).toBe(0);
	});

	it('stops playing for a new world on July, sending nothing more', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.panel.togglePlaying();
		const shown = stage.shown.length;
		stage.panel.newWorld(null);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 6,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: false,
		});
		expect(stage.shown).toHaveLength(shown);
	});

	it('keeps a summary chosen when a new world puts July back', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'range');
		stage.panel.setMonth(2);
		stage.panel.newWorld(null);
		expect(stage.lastView()?.view).toEqual({
			layer: 'temperature',
			summaries: { temperature: 'range', pressure: 'month' },
			source: 'simulated',
			month: DEFAULT_MONTH,
			sunlight: false,
			winds: false,
			grid: false,
		});
	});
});

describe('createLayerPanel, playing the year', () => {
	/** A stage in the Month view with a result on show, playing from a month. */
	const playingFrom = (month: number) => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setMonth(month);
		stage.panel.togglePlaying();
		return { stage, result };
	};

	it('says it is playing and moves on a month each step, slider and globe together', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		expect(stage.lastView()?.playing).toBe(true);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[7]);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 7,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: true,
		});
		expect(stage.told.at(-1)?.month).toBe(7);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in August, °C',
		);
	});

	it('wraps from December to January', () => {
		const { stage, result } = playingFrom(11);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[0]);
		expect(stage.lastView()?.view.month).toBe(0);
	});

	it('stops when the button is pressed again', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		stage.panel.togglePlaying();
		expect(stage.lastView()?.playing).toBe(false);
		const shown = stage.shown.length;
		stage.timers.advance(5 * PLAYBACK_STEP_MS);
		expect(stage.shown).toHaveLength(shown);
		expect(stage.lastView()?.view.month).toBe(DEFAULT_MONTH);
	});

	it('stops when the view leaves the Month view', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
		stage.panel.setSummary('temperature', 'month');
		expect(stage.lastView()?.playing).toBe(false);
	});

	it('stops when the layer leaves Temperature', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		stage.panel.setLayer('terrain');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.lastView()?.view.month).toBe(DEFAULT_MONTH);
		stage.panel.setLayer('temperature');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
	});

	it('keeps playing when the Month view is chosen again', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		const views = stage.views.length;
		stage.panel.setSummary('temperature', 'month');
		expect(stage.views).toHaveLength(views);
		expect(stage.timers.pending()).toBe(1);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[7]);
		expect(stage.lastView()?.playing).toBe(true);
	});

	it('carries on from a month the slider is moved to, a whole step later', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		stage.timers.advance(PLAYBACK_STEP_MS - 10);
		stage.panel.setMonth(3);
		expect(stage.shown.at(-1)?.field).toBe(result.months[3]);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 3,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: true,
		});
		stage.timers.advance(PLAYBACK_STEP_MS - 1);
		expect(stage.lastView()?.view.month).toBe(3);
		stage.timers.advance(1);
		expect(stage.shown.at(-1)?.field).toBe(result.months[4]);
		expect(stage.lastView()?.view.month).toBe(4);
	});

	it('reports what the globe throws on a step and stops playing, the legend on what it shows', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		expect(() => stage.timers.advance(PLAYBACK_STEP_MS)).not.toThrow();
		expect(stage.reported).toEqual([failure]);
		expect(stage.errors).toEqual([]);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 7,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: false,
		});
		// The globe still shows July, and the legend says so, marking it out
		// of date beside the current result it refused.
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
		]);
		const legend = stage.lastLegend();
		expect(legend?.scale?.caption).toBe('Air temperature in July, °C');
		expect(legend?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		stage.timers.advance(5 * PLAYBACK_STEP_MS);
		expect(stage.reported).toEqual([failure]);
	});

	it('stops playing even when reporting what the globe threw throws too', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		const failure = new RangeError('Refused once');
		const unreported = new Error('The report failed');
		stage.failNext(failure);
		stage.failReports(unreported);
		expect(() => stage.timers.advance(PLAYBACK_STEP_MS)).toThrow(unreported);
		expect(stage.reported).toEqual([failure]);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 7,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: false,
		});
		stage.timers.advance(5 * PLAYBACK_STEP_MS);
		expect(stage.reported).toEqual([failure]);
	});

	it('hands what the globe throws for a move of the slider back to it, playing on', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		expect(() => stage.panel.setMonth(3)).toThrow(failure);
		expect(stage.reported).toEqual([]);
		expect(stage.lastView()?.playing).toBe(true);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[4]);
	});

	it('moves the month on before there is a result, and shows it once there is', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.togglePlaying();
		stage.timers.advance(2 * PLAYBACK_STEP_MS);
		expect(stage.shown).toEqual([]);
		const result = resultWith();
		stage.arrive(result);
		expect(stage.shown.at(-1)?.field).toBe(result.months[8]);
	});
});

describe('createLayerPanel, under sunlight', () => {
	/** A stage in Terrain view with sunlight on. */
	const sunlit = () => {
		const stage = createStage();
		stage.panel.setSunlight(true);
		return stage;
	};

	it('tells of the sunlight with the rest of the view, which starts with it off', () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		expect(stage.told.at(-1)?.sunlight).toBe(false);
		stage.panel.setWinds(false);
		stage.panel.setSunlight(true);
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, sunlight: true },
			playing: false,
		});
		expect(stage.told.at(-1)).toEqual({ ...DEFAULT_PAGE_VIEW, sunlight: true });
	});

	it('tells nothing for the sunlight it already has', () => {
		const stage = createStage();
		stage.panel.setSunlight(false);
		expect(stage.views).toEqual([]);
		expect(stage.told).toEqual([]);
	});

	it('plays the year in Terrain view, the month moving on with the globe on the terrain', () => {
		const stage = sunlit();
		stage.panel.togglePlaying();
		expect(stage.lastView()?.playing).toBe(true);
		stage.timers.advance(2 * PLAYBACK_STEP_MS);
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, month: 8, sunlight: true },
			playing: true,
		});
		expect(stage.told.at(-1)?.month).toBe(8);
		expect(stage.shown).toEqual([]);
	});

	it('takes the month from the slider in Terrain view', () => {
		const stage = sunlit();
		stage.panel.setMonth(1);
		expect(stage.told.at(-1)).toEqual({
			...DEFAULT_PAGE_VIEW,
			month: 1,
			sunlight: true,
			winds: false,
			grid: false,
		});
		expect(stage.shown).toEqual([]);
	});

	it('stops the year when sunlight is turned off in Terrain view', () => {
		const stage = sunlit();
		stage.panel.togglePlaying();
		stage.timers.advance(PLAYBACK_STEP_MS);
		stage.panel.setSunlight(false);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, month: 7 },
			playing: false,
		});
		stage.timers.advance(5 * PLAYBACK_STEP_MS);
		expect(stage.lastView()?.view.month).toBe(7);
	});

	it('keeps the year playing in Temperature view when sunlight is turned on or off', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.togglePlaying();
		stage.panel.setSunlight(true);
		expect(stage.lastView()?.playing).toBe(true);
		stage.panel.setSunlight(false);
		expect(stage.lastView()?.playing).toBe(true);
		expect(stage.timers.pending()).toBe(1);
	});

	it('keeps the year playing from the Month view to Terrain, and stops it on the way to a summary', () => {
		const stage = createStage();
		stage.panel.setSunlight(true);
		stage.panel.setLayer('temperature');
		stage.panel.togglePlaying();
		stage.panel.setLayer('terrain');
		expect(stage.lastView()?.playing).toBe(true);
		expect(stage.timers.pending()).toBe(1);
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.lastView()?.playing).toBe(true);
		stage.panel.setLayer('temperature');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
	});

	it('stops the year on a summary chosen in Temperature view, as without sunlight', () => {
		const stage = sunlit();
		stage.panel.setLayer('temperature');
		stage.panel.togglePlaying();
		stage.panel.setSummary('temperature', 'warmest');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
	});

	it('keeps the month last on screen while a summary is shown', () => {
		const stage = sunlit();
		stage.panel.setLayer('temperature');
		stage.panel.setMonth(2);
		stage.panel.setSummary('temperature', 'range');
		stage.panel.setLayer('terrain');
		expect(stage.told.at(-1)).toEqual({
			layer: 'terrain',
			summaries: { temperature: 'range', pressure: 'month' },
			source: 'simulated',
			month: 2,
			sunlight: true,
			winds: false,
			grid: false,
		});
	});

	it('keeps the sunlight for a new world', () => {
		const stage = sunlit();
		stage.panel.setMonth(2);
		stage.panel.togglePlaying();
		stage.panel.newWorld(null);
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, sunlight: true },
			playing: false,
		});
	});
});

describe('createLayerPanel, the summaries', () => {
	it.each([
		['annualMean', 'Annual average air temperature, °C'],
		['warmest', 'Air temperature in the warmest month, °C'],
		['coldest', 'Air temperature in the coldest month, °C'],
	] as const)("shows the %s on the year's scale and ramp", (view, caption) => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setSummary('temperature', view);
		const summary = summariseTemperature(result.months);
		const last = stage.shown.at(-1);
		expect(last?.field).toEqual(summary[view]);
		expect(last?.range).toBe(stage.shown[0]?.range);
		expect(last?.range).toEqual(yearRange(result));
		expect(last?.ramp).toBe(TEMPERATURE_RAMP);
		expect(stage.lastLegend()?.scale?.caption).toBe(caption);
		expect(layerCaption(TEMPERATURE_LAYER, view, 0)).toBe(caption);
		expect(stage.told.at(-1)?.summaries.temperature).toBe(view);
	});

	it('gives the expected values for each summary', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		const fieldFor = (view: Summary) => {
			stage.panel.setSummary('temperature', view);
			return Array.from(stage.shown.at(-1)?.field ?? []);
		};
		// Month m holds m - 30 and m + 10.
		expect(fieldFor('annualMean')).toEqual([-24.5, 15.5]);
		expect(fieldFor('warmest')).toEqual([-19, 21]);
		expect(fieldFor('coldest')).toEqual([-30, 10]);
		expect(fieldFor('range')).toEqual([11, 11]);
	});

	it('shows the seasonal range on its own scale from zero, in its own ramp', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		result.months[0]?.set([-40.5, 10]);
		stage.arrive(result);
		stage.panel.setSummary('temperature', 'range');
		const last = stage.shown.at(-1);
		expect(last?.field).toEqual(summariseTemperature(result.months).range);
		// Cell 0 runs from -40.5 in January to -19 in December.
		expect(last?.range).toEqual({ min: 0, max: 22 });
		expect(last?.ramp).toBe(SEASONAL_RANGE_RAMP);
		const legend = stage.lastLegend();
		expect(legend?.scale?.gradient).toBe(rampGradient(SEASONAL_RANGE_RAMP));
		expect(legend?.scale?.caption).toBe(
			'Seasonal range: difference between the warmest and coldest months, °C',
		);
		expect(tickLabels(legend)).toEqual(['0', '5', '10', '15', '20']);
		// Back to a month: the year's scale and ramp again.
		stage.panel.setSummary('temperature', 'month');
		expect(stage.shown.at(-1)?.range).toEqual(yearRange(result));
		expect(stage.shown.at(-1)?.ramp).toBe(TEMPERATURE_RAMP);
	});

	it('marks the seasonal range every 5 degrees, with no words at its ends', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultOnGrid());
		expect(stage.lastLegend()?.scale).not.toHaveProperty('below');
		stage.panel.setSummary('temperature', 'range');
		expect(stage.shown.at(-1)?.range).toEqual({ min: 0, max: 44 });
		const legend = stage.lastLegend();
		expect(SEASONAL_RANGE_TICK_STEP).toBe(5);
		expect(tickLabels(legend)).toEqual([
			'0',
			'5',
			'10',
			'15',
			'20',
			'25',
			'30',
			'35',
			'40',
		]);
		expect(legend?.scale).not.toHaveProperty('below');
		expect(legend?.scale).not.toHaveProperty('above');
	});

	it('asks nothing for the temperature view already chosen', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.panel.setSummary('temperature', 'range');
		const counts = () => [
			stage.shown.length,
			stage.views.length,
			stage.told.length,
			stage.legends.length,
		];
		const before = counts();
		stage.panel.setSummary('temperature', 'range');
		expect(counts()).toEqual(before);
	});

	it('works each summary out once per result, giving the same arrays again', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setSummary('temperature', 'annualMean');
		const mean = stage.shown.at(-1)?.field;
		const sent = stage.shown.length;
		stage.store.markOutOfDate();
		stage.store.markCalculating();
		stage.store.setProgress(progressOf(1));
		expect(stage.shown).toHaveLength(sent);
		stage.panel.setSummary('temperature', 'range');
		const range = stage.shown.at(-1)?.field;
		const rangeScale = stage.shown.at(-1)?.range;
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.shown.at(-1)?.field).toBe(mean);
		stage.panel.setSummary('temperature', 'range');
		expect(stage.shown.at(-1)?.field).toBe(range);
		expect(stage.shown.at(-1)?.range).toBe(rangeScale);
		// A new result has summaries of its own.
		stage.arrive(resultWith(5));
		expect(stage.shown.at(-1)?.field).not.toBe(range);
		expect(Array.from(stage.shown.at(-1)?.field ?? [])).toEqual([11, 11]);
	});

	it('works the summaries out afresh for a result that comes again after the store dropped it', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		const result = resultWith();
		stage.arrive(result);
		stage.store.clear();
		result.months.forEach((month) => {
			month.set([1, 2]);
		});
		stage.arrive(result);
		expect(Array.from(stage.shown.at(-1)?.field ?? [])).toEqual([1, 2]);
	});

	it('goes back to the height colours when the store drops its result in a summary', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'range');
		stage.arrive(resultWith());
		stage.store.clear();
		expect(stage.shown.at(-1)?.field).toBeNull();
		expect(stage.lastLegend()?.scale).toBeNull();
	});

	it('says a seasonal range the globe refused could not be shown, and sends it at the next change', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'range');
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		const result = resultWith();
		stage.arrive(result);
		expect(stage.errors).toEqual([failure]);
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			state: 'unavailable',
			status: TEMPERATURE_NOT_SHOWN_TEXT,
			bar: null,
		});
		stage.store.markOutOfDate();
		expect(stage.shown.at(-1)?.ramp).toBe(SEASONAL_RANGE_RAMP);
		expect(stage.shown.at(-1)?.range).toEqual({ min: 0, max: 11 });
		expect(stage.lastLegend()?.scale?.gradient).toBe(
			rampGradient(SEASONAL_RANGE_RAMP),
		);
	});

	it("keeps the legend on what the globe shows while it refuses another view's field", () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		// From a control, the error reaches whoever made the choice.
		expect(() => stage.panel.setSummary('temperature', 'range')).toThrow(
			failure,
		);
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
		]);
		const legend = stage.lastLegend();
		expect(legend?.scale?.caption).toBe('Air temperature in July, °C');
		expect(legend?.scale?.gradient).toBe(rampGradient(TEMPERATURE_RAMP));
		expect(legend?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		// The view is chosen all the same, and its field sent at the next
		// change.
		expect(stage.lastView()?.view.summaries.temperature).toBe('range');
		stage.store.markOutOfDate();
		expect(stage.shown.at(-1)?.ramp).toBe(SEASONAL_RANGE_RAMP);
		expect(stage.lastLegend()?.scale?.gradient).toBe(
			rampGradient(SEASONAL_RANGE_RAMP),
		);
	});
});

describe('createLayerPanel, what the globe shows', () => {
	it('shows nothing in Terrain view, nor in Temperature view before a result', () => {
		const stage = createStage();
		expect(stage.panel.shown()).toBeNull();
		stage.arrive(resultWith());
		expect(stage.panel.shown()).toBeNull();
		stage.panel.setLayer('temperature');
		stage.store.clear();
		expect(stage.panel.shown()).toBeNull();
		stage.store.markCalculating();
		expect(stage.panel.shown()).toBeNull();
	});

	it('gives the field the globe was last given, with its month, current', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const shown = stage.panel.shown();
		expect(shown).toEqual({
			layer: TEMPERATURE_LAYER,
			summary: 'month',
			field: result.months[DEFAULT_MONTH],
			source: 'simulated',
			current: true,
		});
		expect(shown?.field).toBe(stage.shown.at(-1)?.field);

		stage.panel.setMonth(2);
		expect(stage.panel.shown()?.field).toBe(result.months[2]);
	});

	it('gives the array of the summary on show, as sent to the globe', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		for (const view of ['annualMean', 'warmest', 'coldest', 'range'] as const) {
			stage.panel.setSummary('temperature', view);
			expect(stage.panel.shown()?.field).toBe(stage.shown.at(-1)?.field);
			expect(stage.panel.shown()?.current).toBe(true);
		}
	});

	it('is not current while the result is out of date, calculated again or no longer calculable', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const field = result.months[DEFAULT_MONTH];

		stage.store.markOutOfDate();
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shown()).toMatchObject({ field, current: false });

		stage.store.markCalculating();
		expect(stage.panel.shown()).toMatchObject({ field, current: false });

		stage.store.setResult(result, true);
		expect(stage.panel.shown()).toMatchObject({ field, current: true });

		stage.store.markUnavailable();
		expect(stage.lastLegend()?.status).toBe(TEMPERATURE_UNAVAILABLE_TEXT);
		expect(stage.panel.shown()).toMatchObject({ field, current: false });
	});

	it('keeps the earlier field, not current, while the globe refuses the one chosen', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const first = resultWith();
		stage.arrive(first);

		stage.failNext(new RangeError('Refused once'));
		const second = resultWith(5);
		stage.store.markCalculating();
		stage.store.setResult(second, true);
		expect(stage.store.temperature.status).toBe('current');
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shown()).toEqual({
			layer: TEMPERATURE_LAYER,
			summary: 'month',
			field: first.months[DEFAULT_MONTH],
			source: 'simulated',
			current: false,
		});

		stage.failNext(new RangeError('Refused again'));
		expect(() => stage.panel.setMonth(0)).toThrow('Refused again');
		expect(stage.panel.shown()).toMatchObject({
			field: first.months[DEFAULT_MONTH],
			current: false,
		});

		stage.panel.setMonth(1);
		expect(stage.panel.shown()).toEqual({
			layer: TEMPERATURE_LAYER,
			summary: 'month',
			field: second.months[1],
			source: 'simulated',
			current: true,
		});
	});

	it('shows nothing again once the globe is back on the height colours', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.panel.setLayer('terrain');
		expect(stage.panel.shown()).toBeNull();
		stage.panel.setLayer('temperature');
		expect(stage.panel.shown()).not.toBeNull();
		stage.store.clear();
		expect(stage.panel.shown()).toBeNull();
	});
});

/**
 * A loader of an observed year, the temperature's unless said otherwise,
 * that answers when a test says.
 */
const createDeferredLoader = <G = MonthlyTemperature>() => {
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
const observedFor = (result: TemperatureResult): Float32Array[] =>
	result.months.map((month, m) =>
		month.map(
			(value, cell) =>
				value - 1 - (cell % 5) * 0.4 - m * 0.3 - (cell % 997 === 0 ? 50 : 0),
		),
	);

/** A stage in Temperature view on the measured Earth at 64, with a result. */
const createEarthStage = () => {
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
const figuresText = (
	a: Float32Array,
	b: Float32Array,
	grid = getGrid(64),
): string => formatFigures(compareField(a, b, grid), '°C');

describe('createLayerPanel, the comparison', () => {
	it('is offered only in Temperature view on the measured Earth', () => {
		const stage = createStage();
		// The controls start hidden, and are told nothing until it changes.
		expect(stage.lastComparison()).toBeUndefined();
		stage.panel.setEarth(64);
		// Terrain view: not offered.
		expect(stage.lastComparison()?.offered).toEqual([]);
		stage.panel.setLayer('temperature');
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'simulated',
			message: null,
		});
		stage.panel.setLayer('terrain');
		expect(stage.lastComparison()?.offered).toEqual([]);
		stage.panel.setLayer('temperature');
		stage.panel.setEarth(null);
		expect(stage.lastComparison()?.offered).toEqual([]);
		stage.panel.newWorld(64);
		expect(stage.lastComparison()?.offered).toEqual(SOURCES);
		stage.panel.newWorld(null);
		expect(stage.lastComparison()?.offered).toEqual([]);
	});

	it('names no source in the caption until it is offered, and the source from then on', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultOnGrid());
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in July, °C',
		);
		stage.panel.setEarth(64);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Simulated air temperature in July, °C',
		);
	});

	it('ignores a source chosen while it is not offered', () => {
		const { stage, deferred } = createEarthStage();
		stage.panel.setEarth(null);
		const told = stage.told.length;
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(0);
		expect(stage.lastComparison()?.source).toBe('simulated');
		expect(stage.told.at(-1)?.source).toBe('simulated');
		expect(stage.told.length).toBe(told + 1);
	});

	it('asks for the observed temperature once, and keeps the simulated on the globe until it arrives', async () => {
		const { stage, deferred, result, observed } = createEarthStage();
		const sent = stage.shown.length;
		stage.panel.setSource('observed');
		expect(deferred.calls.map((call) => call.resolution)).toEqual([64]);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'observed',
			message: OBSERVED_LOADING_TEXT,
		});
		expect(stage.told.at(-1)?.source).toBe('observed');
		expect(stage.shown).toHaveLength(sent);
		expect(stage.panel.shown()?.source).toBe('simulated');
		stage.panel.setSource('difference');
		expect(deferred.calls).toHaveLength(1);

		deferred.last().resolve(observed);
		await settle();
		expect(stage.lastComparison()?.message).toBeNull();
		const difference = stage.shown.at(-1)?.field as Float32Array;
		expect([...difference]).toEqual([
			...differenceField(
				result.months[DEFAULT_MONTH] as Float32Array,
				observed[DEFAULT_MONTH] as Float32Array,
			),
		]);
		expect(stage.panel.shown()?.source).toBe('difference');
		stage.panel.setSource('observed');
		expect(stage.shown.at(-1)?.field).toBe(observed[DEFAULT_MONTH]);
		expect(deferred.calls).toHaveLength(1);
	});

	it('keeps saying the observed temperature is loading whatever is chosen until it arrives', async () => {
		const { stage, deferred, result, observed } = createEarthStage();
		stage.panel.setSource('observed');
		stage.panel.setSource('difference');
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'difference',
			message: OBSERVED_LOADING_TEXT,
		});
		stage.panel.setSource('simulated');
		expect(stage.lastComparison()?.message).toBe(OBSERVED_LOADING_TEXT);
		stage.panel.setSource('difference');
		expect(stage.lastComparison()?.message).toBe(OBSERVED_LOADING_TEXT);
		expect(deferred.calls).toHaveLength(1);
		expect(stage.panel.shown()?.source).toBe('simulated');

		deferred.last().resolve(observed);
		await settle();
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'difference',
			message: null,
		});
		expect(stage.panel.shown()?.source).toBe('difference');
		expect([...(stage.shown.at(-1)?.field ?? [])]).toEqual([
			...differenceField(
				result.months[DEFAULT_MONTH] as Float32Array,
				observed[DEFAULT_MONTH] as Float32Array,
			),
		]);
	});

	it('shows the observed month and each summary of the observed year, on one scale shared with the simulated', async () => {
		const { stage, result, observed, choose } = createEarthStage();
		const own = stage.shown.at(-1)?.range;
		expect(own).toEqual(yearRange(result));
		await choose('observed');
		const shared = fitRange(
			[...result.months, ...observed],
			cellWeights(observed[0]?.length ?? 0),
		);
		expect(shared).not.toEqual(own);
		const last = stage.shown.at(-1);
		expect(last?.field).toBe(observed[DEFAULT_MONTH]);
		expect(last?.range).toEqual(shared);
		expect(last?.ramp).toBe(TEMPERATURE_RAMP);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Observed air temperature in July, °C',
		);
		expect(stage.lastLegend()?.scale).not.toHaveProperty('below');

		const theirs = summariseTemperature(observed);
		for (const view of ['annualMean', 'warmest', 'coldest'] as const) {
			stage.panel.setSummary('temperature', view);
			expect(stage.shown.at(-1)?.field, view).toEqual(theirs[view]);
			expect(stage.shown.at(-1)?.range, view).toEqual(shared);
		}
		stage.panel.setSummary('temperature', 'range');
		expect(stage.shown.at(-1)?.field).toEqual(theirs.range);
		expect(stage.shown.at(-1)?.range).toEqual({
			min: 0,
			max: Math.max(
				fitRangeFromZero(summariseTemperature(result.months).range).max,
				fitRangeFromZero(theirs.range).max,
			),
		});
		expect(stage.shown.at(-1)?.ramp).toBe(SEASONAL_RANGE_RAMP);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Observed seasonal range: difference between the warmest and coldest months, °C',
		);
		// The simulated year now shares the scale, in every month and summary.
		stage.panel.setSource('simulated');
		expect(stage.shown.at(-1)?.range).toEqual(stage.shown.at(-2)?.range);
		stage.panel.setSummary('temperature', 'month');
		expect(stage.shown.at(-1)?.field).toBe(result.months[DEFAULT_MONTH]);
		expect(stage.shown.at(-1)?.range).toEqual(shared);
		stage.panel.setMonth(0);
		expect(stage.shown.at(-1)?.range).toEqual(shared);
	});

	it('gives the simulated year its own scale again once the world stops being the measured Earth, and the shared one when it is again', async () => {
		const { stage, result, observed, choose } = createEarthStage();
		await choose('observed');
		const shared = fitRange(
			[...result.months, ...observed],
			cellWeights(observed[0]?.length ?? 0),
		);
		stage.panel.setEarth(null);
		expect(stage.shown.at(-1)?.field).toBe(result.months[DEFAULT_MONTH]);
		expect(stage.shown.at(-1)?.range).toEqual(yearRange(result));
		expect(stage.lastLegend()?.scale?.figures).toBeNull();
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in July, °C',
		);
		// The same field on another scale is sent again, with that scale.
		stage.panel.setEarth(64);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'simulated',
			message: null,
		});
		expect(stage.shown.at(-1)?.field).toBe(result.months[DEFAULT_MONTH]);
		expect(stage.shown.at(-1)?.range).toEqual(shared);
		expect(stage.lastLegend()?.scale?.figures).not.toBeNull();
		// A new result takes the shared scale.
		const next = resultOnGrid();
		stage.arrive(next);
		expect(stage.shown.at(-1)?.field).toBe(next.months[DEFAULT_MONTH]);
		expect(stage.shown.at(-1)?.range).toEqual(shared);
	});

	it('forgets the observed temperature and the shared scale for a new world', async () => {
		const { stage, deferred, choose } = createEarthStage();
		await choose('observed');
		stage.store.clear();
		stage.panel.newWorld(64);
		expect(stage.lastComparison()?.source).toBe('simulated');
		const next = resultOnGrid();
		stage.arrive(next);
		expect(stage.shown.at(-1)?.range).toEqual(yearRange(next));
		expect(stage.lastLegend()?.scale?.figures).toBeNull();
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(2);
	});

	it('draws the difference of every month and summary on the fixed scale, with both end words', async () => {
		const { stage, result, observed, choose } = createEarthStage();
		await choose('difference');
		const ours = summariseTemperature(result.months);
		const theirs = summariseTemperature(observed);
		const expectFixed = (caption: string): void => {
			const last = stage.shown.at(-1);
			expect(last?.range).toEqual({ min: -20, max: 20 });
			expect(last?.ramp).toBe(DIFFERENCE_RAMP);
			const scale = stage.lastLegend()?.scale;
			expect(scale?.caption).toBe(caption);
			expect(tickLabels(stage.lastLegend())).toEqual([
				'−20',
				'−10',
				'0',
				'10',
				'20',
			]);
			expect(scale).not.toHaveProperty('below');
			expect(scale).not.toHaveProperty('above');
		};
		expectFixed('Simulated less observed in July, °C');
		stage.panel.setMonth(0);
		expect([...(stage.shown.at(-1)?.field ?? [])]).toEqual([
			...differenceField(
				result.months[0] as Float32Array,
				observed[0] as Float32Array,
			),
		]);
		expectFixed('Simulated less observed in January, °C');
		const captions = {
			annualMean: 'Simulated less observed, annual average air temperature, °C',
			warmest:
				'Simulated less observed, air temperature in the warmest month, °C',
			coldest:
				'Simulated less observed, air temperature in the coldest month, °C',
			range: 'Simulated less observed, seasonal range, °C',
		};
		for (const view of ['annualMean', 'warmest', 'coldest', 'range'] as const) {
			stage.panel.setSummary('temperature', view);
			expect([...(stage.shown.at(-1)?.field ?? [])], view).toEqual([
				...differenceField(ours[view], theirs[view]),
			]);
			expectFixed(captions[view]);
		}
	});

	it('writes the figures of the simulated field on screen against the observed, for each month and summary and every source', async () => {
		const { stage, result, observed, grid, choose } = createEarthStage();
		// Before the observed temperature is there, none.
		expect(stage.lastLegend()?.scale?.figures).toBeNull();
		await choose('observed');
		const { months } = compareFields(result.months, observed, grid);
		for (const source of ['simulated', 'observed', 'difference'] as const) {
			stage.panel.setSource(source);
			stage.panel.setSummary('temperature', 'month');
			for (const month of [0, 6, 11]) {
				stage.panel.setMonth(month);
				expect(stage.lastLegend()?.scale?.figures, `${source} ${month}`).toBe(
					formatFigures(months[month] as FieldDifference, '°C'),
				);
			}
			const ours = summariseTemperature(result.months);
			const theirs = summariseTemperature(observed);
			for (const view of [
				'annualMean',
				'warmest',
				'coldest',
				'range',
			] as const) {
				stage.panel.setSummary('temperature', view);
				expect(stage.lastLegend()?.scale?.figures, `${source} ${view}`).toBe(
					figuresText(ours[view], theirs[view]),
				);
			}
		}
		// The figures differ by month, so a wrong month would be seen.
		expect(formatFigures(months[0] as FieldDifference, '°C')).not.toBe(
			formatFigures(months[11] as FieldDifference, '°C'),
		);
	});

	it('makes each derived field once for each result, and drops the differences with it', async () => {
		const { stage, choose } = createEarthStage();
		await choose('difference');
		const july = stage.shown.at(-1)?.field;
		stage.panel.setMonth(0);
		const january = stage.shown.at(-1)?.field;
		stage.panel.setMonth(DEFAULT_MONTH);
		expect(stage.shown.at(-1)?.field).toBe(july);
		stage.panel.setSummary('temperature', 'warmest');
		const warmest = stage.shown.at(-1)?.field;
		stage.panel.setSummary('temperature', 'month');
		stage.panel.setSummary('temperature', 'warmest');
		expect(stage.shown.at(-1)?.field).toBe(warmest);
		// Not sent again as the status changes.
		const sent = stage.shown.length;
		stage.store.markOutOfDate();
		stage.store.markCalculating();
		expect(stage.shown).toHaveLength(sent);
		// A new result: new differences.
		stage.arrive(resultOnGrid());
		const next = stage.shown.at(-1)?.field;
		expect(next).not.toBe(warmest);
		stage.panel.setSummary('temperature', 'month');
		expect(stage.shown.at(-1)?.field).not.toBe(july);
		stage.panel.setMonth(0);
		expect(stage.shown.at(-1)?.field).not.toBe(january);
	});

	it('never marks the observed temperature out of date, and marks the difference as the simulated', async () => {
		const { stage, choose } = createEarthStage();
		await choose('observed');
		stage.store.markOutOfDate();
		expect(stage.lastLegend()?.status).toBeNull();
		expect(stage.lastLegend()?.bar).toBeNull();
		expect(stage.panel.shown()).toMatchObject({
			source: 'observed',
			current: true,
		});
		stage.store.markCalculating();
		expect(stage.lastLegend()?.status).toBeNull();
		expect(stage.panel.shown()?.current).toBe(true);

		stage.panel.setSource('difference');
		expect(stage.lastLegend()?.status).toBe(LEGEND_CALCULATING_TEXT);
		expect(stage.lastLegend()?.bar).not.toBeNull();
		expect(stage.panel.shown()).toMatchObject({
			source: 'difference',
			current: false,
		});
		stage.panel.setSource('simulated');
		expect(stage.lastLegend()?.status).toBe(LEGEND_CALCULATING_TEXT);
		expect(stage.panel.shown()).toMatchObject({
			source: 'simulated',
			current: false,
		});
	});

	it('writes no figures under the observed temperature while the result is not current, and those of the next current one', async () => {
		const { stage, observed, grid, choose } = createEarthStage();
		await choose('observed');
		expect(stage.lastLegend()?.scale?.figures).not.toBeNull();
		stage.store.markOutOfDate();
		expect(stage.lastLegend()?.scale?.figures).toBeNull();
		expect(stage.lastLegend()?.status).toBeNull();
		expect(stage.panel.shown()?.current).toBe(true);
		stage.store.markCalculating();
		expect(stage.lastLegend()?.scale?.figures).toBeNull();
		// The simulated and the difference keep theirs, marked as before.
		stage.panel.setSource('difference');
		expect(stage.lastLegend()?.scale?.figures).not.toBeNull();
		expect(stage.lastLegend()?.status).toBe(LEGEND_CALCULATING_TEXT);
		stage.panel.setSource('simulated');
		expect(stage.lastLegend()?.scale?.figures).not.toBeNull();
		stage.panel.setSource('observed');
		expect(stage.lastLegend()?.scale?.figures).toBeNull();

		const next = resultOnGrid();
		stage.store.setResult(next, true);
		const { months } = compareFields(next.months, observed, grid);
		expect(stage.lastLegend()?.scale?.figures).toBe(
			formatFigures(months[DEFAULT_MONTH] as FieldDifference, '°C'),
		);
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.lastLegend()?.scale?.figures).toBe(
			figuresText(
				summariseTemperature(next.months).annualMean,
				summariseTemperature(observed).annualMean,
			),
		);

		stage.store.markUnavailable();
		expect(stage.lastLegend()?.scale?.figures).toBeNull();
		expect(stage.panel.shown()?.current).toBe(true);
	});

	it('marks the difference out of date exactly when it marks the simulated', async () => {
		const { stage, choose } = createEarthStage();
		await choose('difference');
		expect(stage.lastLegend()?.status).toBeNull();
		expect(stage.panel.shown()?.current).toBe(true);
		stage.store.markOutOfDate();
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shown()?.current).toBe(false);
		stage.panel.setSource('simulated');
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shown()?.current).toBe(false);
	});

	it('marks the observed temperature out of date only while the globe keeps an earlier field', async () => {
		const { stage, choose } = createEarthStage();
		await choose('observed');
		stage.failNext(new Error('Refused'));
		expect(() => stage.panel.setMonth(0)).toThrow('Refused');
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shown()).toMatchObject({
			source: 'observed',
			current: false,
		});
	});

	it.each([
		[
			'the world stops being the measured Earth',
			(panel: LayerPanel) => panel.setEarth(null),
		],
		['a new world arrives', (panel: LayerPanel) => panel.newWorld(64)],
	])(
		'goes back to Simulated, and hides the choice if it must, when %s',
		async (_, change) => {
			const { stage, result, choose } = createEarthStage();
			await choose('difference');
			change(stage.panel);
			expect(stage.lastComparison()?.source).toBe('simulated');
			expect(stage.told.at(-1)?.source).toBe('simulated');
			if (stage.store.temperature.result === result) {
				expect(stage.panel.shown()?.source).toBe('simulated');
				expect(stage.shown.at(-1)?.field).toBe(result.months[DEFAULT_MONTH]);
			}
		},
	);

	it('says the observed temperature could not be loaded, goes back to Simulated and asks again at the next choice', async () => {
		const { stage, deferred, result, observed } = createEarthStage();
		const error = new TypeError('Failed to fetch');
		stage.panel.setSource('observed');
		deferred.last().reject(error);
		await settle();
		expect(stage.reported).toEqual([error]);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'simulated',
			message: OBSERVED_FAILED_TEXT,
		});
		expect(OBSERVED_FAILED_TEXT).toBe(
			'Observed temperature could not be loaded',
		);
		expect(stage.told.at(-1)?.source).toBe('simulated');
		// The simulated temperature goes on working.
		expect(stage.panel.shown()?.source).toBe('simulated');
		stage.panel.setMonth(0);
		expect(stage.shown.at(-1)?.field).toBe(result.months[0]);
		expect(stage.shown.at(-1)?.range).toEqual(yearRange(result));
		expect(stage.lastLegend()?.scale?.figures).toBeNull();

		stage.panel.setSource('difference');
		expect(deferred.calls).toHaveLength(2);
		expect(stage.lastComparison()?.message).toBe(OBSERVED_LOADING_TEXT);
		deferred.last().resolve(observed);
		await settle();
		expect(stage.lastComparison()?.message).toBeNull();
		expect(stage.panel.shown()?.source).toBe('difference');
	});

	it.each([
		['the world was replaced', (panel: LayerPanel) => panel.newWorld(64)],
		[
			'the world stopped being the measured Earth',
			(panel: LayerPanel) => panel.setEarth(null),
		],
		[
			'the world stopped and started being the measured Earth',
			(panel: LayerPanel) => {
				panel.setEarth(null);
				panel.setEarth(64);
			},
		],
		[
			'the world changed resolution',
			(panel: LayerPanel) => panel.newWorld(128),
		],
	])('sets aside what arrives after %s', async (_, change) => {
		for (const outcome of ['arrives', 'fails'] as const) {
			const { stage, deferred, observed } = createEarthStage();
			stage.panel.setSource('observed');
			change(stage.panel);
			const sent = stage.shown.length;
			const comparisons = stage.comparisons.length;
			const told = stage.told.length;
			if (outcome === 'arrives') {
				deferred.last().resolve(observed);
			} else {
				deferred.last().reject(new Error('late'));
			}
			await settle();
			expect(stage.shown, outcome).toHaveLength(sent);
			expect(stage.comparisons, outcome).toHaveLength(comparisons);
			expect(stage.told, outcome).toHaveLength(told);
			expect(stage.reported, outcome).toEqual([]);
			expect(stage.panel.shown()?.source ?? 'simulated', outcome).toBe(
				'simulated',
			);
		}
	});

	it('reports what the globe throws as the observed temperature arrives', async () => {
		const { stage, deferred, observed } = createEarthStage();
		stage.panel.setSource('observed');
		const error = new Error('Refused');
		stage.failNext(error);
		deferred.last().resolve(observed);
		await settle();
		expect(stage.reported).toEqual([error]);
	});

	it('shows the height colours for every source until there is a result', async () => {
		const stage = createStage();
		const deferred = createDeferredLoader();
		stage.setLoader(deferred.loader);
		stage.panel.setLayer('temperature');
		stage.panel.newWorld(64);
		stage.panel.setSource('observed');
		deferred.last().resolve(observedFor(resultOnGrid()));
		await settle();
		expect(stage.shown).toEqual([]);
		expect(stage.panel.shown()).toBeNull();
	});

	it('does not compare a result of another grid with the observed year', async () => {
		const { stage, choose } = createEarthStage();
		await choose('observed');
		const other = resultWith();
		stage.arrive(other);
		expect(stage.shown.at(-1)?.field).toBe(other.months[DEFAULT_MONTH]);
		expect(stage.panel.shown()?.source).toBe('simulated');
		expect(stage.lastLegend()?.scale?.figures).toBeNull();
	});

	it('does nothing when told again what it was told of the world', () => {
		const { stage } = createEarthStage();
		const told = stage.told.length;
		const comparisons = stage.comparisons.length;
		stage.panel.setEarth(64);
		expect(stage.told).toHaveLength(told);
		expect(stage.comparisons).toHaveLength(comparisons);
	});

	it('does nothing when the source on screen is chosen again', () => {
		const { stage, deferred } = createEarthStage();
		const told = stage.told.length;
		const sent = stage.shown.length;
		stage.panel.setSource('simulated');
		expect(stage.told).toHaveLength(told);
		expect(stage.shown).toHaveLength(sent);
		expect(deferred.calls).toHaveLength(0);
	});

	it('is told nothing new by a new world that changes nothing', () => {
		const stage = createStage();
		const views = stage.views.length;
		stage.panel.newWorld(null);
		expect(stage.views).toHaveLength(views);
	});
});

describe('layerCaption', () => {
	it('names no source unless given one', () => {
		expect(layerCaption(TEMPERATURE_LAYER, 'month', 0)).toBe(
			'Air temperature in January, °C',
		);
		expect(layerCaption(TEMPERATURE_LAYER, 'range', 0)).toBe(
			'Seasonal range: difference between the warmest and coldest months, °C',
		);
	});

	it('names the simulated and the observed source', () => {
		expect(layerCaption(TEMPERATURE_LAYER, 'annualMean', 0, 'simulated')).toBe(
			'Simulated annual average air temperature, °C',
		);
		expect(layerCaption(TEMPERATURE_LAYER, 'coldest', 0, 'observed')).toBe(
			'Observed air temperature in the coldest month, °C',
		);
	});

	it('names the difference after what it is a difference of', () => {
		expect(layerCaption(TEMPERATURE_LAYER, 'month', 6, 'difference')).toBe(
			'Simulated less observed in July, °C',
		);
		expect(layerCaption(TEMPERATURE_LAYER, 'range', 6, 'difference')).toBe(
			'Simulated less observed, seasonal range, °C',
		);
	});
});

describe('the info box over the globe', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** The real layer panel, showing what it has in a real info box. */
	const make = () => {
		const store = createLayerStore(() => {});
		const timers = createFakeTimers();
		let box: InfoBox | undefined;
		const panel = createLayerPanel({
			store,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
			loadObserved: () =>
				Promise.reject(new Error('The observed temperature is not asked for')),
			loadObservedWinds: () =>
				Promise.reject(new Error('The observed winds are not asked for')),
			reportError: () => {},
			globe: { setLayer: () => {}, setWinds: () => {} },
			createControls: () => {
				box = createInfoBox();
				return box;
			},
		});
		if (box === undefined) {
			throw new Error('The layer panel made no controls');
		}
		/** Picks a layer, as the dock tells it. */
		const pickLayer = (layer: Layer): void => panel.setLayer(layer);
		const root = box.element as unknown as FakeElement;
		return {
			store,
			panel,
			pickLayer,
			root,
			legend: oneByClass(root, 'legend'),
			status: () => oneByClass(root, 'info-box__status').textContent,
			bar: oneByClass(root, 'info-box__bar'),
		};
	};

	it('starts with only its status line, saying nothing is calculated yet, and no month, layer, view of the year or source in it', () => {
		const { root, status, legend } = make();
		expect(root.hidden).toBe(false);
		expect(status()).toBe(LEGEND_EMPTY_TEXT);
		expect(legend.hidden).toBe(true);
		expect(byClass(root, 'field__range')).toEqual([]);
		expect(byClass(root, 'segmented__input')).toEqual([]);
		expect(byClass(root, 'field__select')).toEqual([]);
		expect(byClass(root, 'comparison')).toEqual([]);
	});

	/** Has the temperature and then its winds arrive, both current. */
	const solveAll = (store: LayerStore): void => {
		store.markCalculating();
		store.setResult(resultWith(), true);
		store.markWindsCalculating();
		store.setWindsResult(solvedWinds(), true);
	};

	it('shows on Terrain while nothing is calculated yet, and hides there once all is current', () => {
		const { store, pickLayer, root, status } = make();
		pickLayer('temperature');
		expect(root.hidden).toBe(false);
		expect(status()).toBe(LEGEND_EMPTY_TEXT);
		pickLayer('terrain');
		expect(root.hidden).toBe(false);
		expect(status()).toBe(LEGEND_EMPTY_TEXT);
		solveAll(store);
		expect(root.hidden).toBe(true);
		expect(status()).toBe('');
	});

	it('says where the winds stand while they are shown, and shows no box on Terrain once they are current', () => {
		const { store, panel, root, status } = make();
		panel.setWinds(true);
		expect(root.hidden).toBe(false);
		expect(status()).toBe(LEGEND_EMPTY_TEXT);
		solveAll(store);
		expect(status()).toBe('');
		expect(root.hidden).toBe(true);
		store.markWindsOutOfDate();
		expect(status()).toBe(LEGEND_OUT_OF_DATE_TEXT);
		panel.setWinds(false);
		// Out of date whatever is shown: the calculation's line says so.
		expect(status()).toBe(LEGEND_OUT_OF_DATE_TEXT);
		store.markWindsCalculating();
		store.setWindsResult(solvedWinds(), true);
		expect(root.hidden).toBe(true);
	});

	it('names the temperature and then the winds while each is calculated on Terrain, the temperature with its progress', () => {
		const { store, root, status, bar } = make();
		store.markCalculating();
		store.setProgress({ ...progressOf(2), estimatedYearsLeft: 2 });
		expect(root.hidden).toBe(false);
		expect(status()).toBe(CALCULATING_TEMPERATURE_TEXT);
		expect(bar.hidden).toBe(false);
		expect(bar.getAttribute('value')).toBe('0.5');

		store.setResult(resultWith(), true);
		store.markWindsCalculating();
		expect(status()).toBe(CALCULATING_WINDS_TEXT);
		expect(bar.hidden).toBe(false);

		store.setWindsResult(solvedWinds(), true);
		expect(status()).toBe('');
		expect(bar.hidden).toBe(true);
		expect(root.hidden).toBe(true);
	});

	it('says Paused only while paused with a result that is not current, on any layer', () => {
		const { store, panel, pickLayer, status } = make();
		solveAll(store);
		panel.setPaused(true);
		expect(status()).toBe('');

		store.markOutOfDate();
		expect(status()).toBe(PAUSED_TEXT);
		pickLayer('temperature');
		expect(status()).toBe(PAUSED_TEXT);
		pickLayer('pressure');
		expect(status()).toBe(PAUSED_TEXT);
		panel.setWinds(true);
		expect(status()).toBe(PAUSED_TEXT);

		panel.setPaused(false);
		expect(status()).toBe(LEGEND_OUT_OF_DATE_TEXT);
		panel.setPaused(true);
		store.clear();
		expect(status()).toBe(PAUSED_TEXT);
		// A calculation left to finish is said as one under way.
		store.markCalculating();
		expect(status()).not.toBe(PAUSED_TEXT);
	});

	it('changes nothing for being told again whether it is paused', () => {
		const { store, panel, status } = make();
		store.markOutOfDate();
		panel.setPaused(false);
		expect(status()).toBe(LEGEND_EMPTY_TEXT);
		panel.setPaused(true);
		panel.setPaused(true);
		expect(status()).toBe(PAUSED_TEXT);
	});

	it('follows the calculation', () => {
		const { store, pickLayer, legend, status, bar } = make();
		pickLayer('temperature');
		store.markCalculating();
		store.setProgress(progressOf(1));
		expect(status()).toBe(CALCULATING_TEMPERATURE_TEXT);
		expect(bar.hidden).toBe(false);
		store.setProgress({ ...progressOf(2), estimatedYearsLeft: 3 });
		expect(status()).toBe(
			legendContent(TEMPERATURE_LAYER, store.temperature, null, false).status,
		);
		expect(bar.hidden).toBe(false);
		expect(legend.hidden).toBe(true);

		const result = resultWith();
		store.setResult(result, true);
		store.markWindsCalculating();
		store.setWindsResult(solvedWinds(), true);
		expect(status()).toBe('');
		expect(bar.hidden).toBe(true);
		expect(legend.hidden).toBe(false);
		expect(oneByClass(legend, 'legend__caption').textContent).toBe(
			layerCaption(TEMPERATURE_LAYER, 'month', DEFAULT_MONTH),
		);
	});
});

/**
 * A year of winds over two cells whose months are told apart: month m
 * blows m + 1 m/s eastward in the first cell and m + 1 m/s northward in the
 * second.
 */
const solvedWinds = (offset = 0): SolvedWinds => {
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

describe('createLayerPanel, the winds', () => {
	/** A stage with the winds switched on. */
	const windy = () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		return stage;
	};
	/** Has winds arrive, current, as the scheduler does. */
	const arrive = (
		stage: ReturnType<typeof createStage>,
		solved: SolvedWinds,
	) => {
		stage.store.markWindsCalculating();
		stage.store.setWindsResult(solved, true);
	};
	/** The field of a month of a year of winds. */
	const monthOf = (solved: SolvedWinds, month: number) => ({
		east: solved.winds.east[month],
		north: solved.winds.north[month],
	});

	it('starts off, giving the globe no winds and hiding the key', () => {
		const stage = createStage();
		stage.panel.setSunlight(true);
		expect(stage.told.at(-1)?.winds).toBe(false);
		arrive(stage, solvedWinds());
		expect(stage.winds).toEqual([]);
		expect(stage.keys.every((key) => key === null)).toBe(true);
	});

	it('shows the winds when turned on, telling of it with the view, and says nothing is there yet', () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		expect(stage.told.at(-1)).toEqual({ ...DEFAULT_PAGE_VIEW, winds: true });
		expect(stage.winds).toEqual([]);
		expect(stage.keys.at(-1)).toEqual({
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
		});
	});

	it('tells nothing for the setting it already has', () => {
		const stage = createStage();
		stage.panel.setWinds(false);
		expect(stage.told).toEqual([]);
	});

	it('gives the globe the month on screen of a result as it arrives, the result’s own arrays, and clears the key’s line', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		expect(stage.winds).toHaveLength(1);
		expect(stage.winds[0]?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		expect(stage.winds[0]?.north).toBe(solved.winds.north[DEFAULT_MONTH]);
		expect(stage.keys.at(-1)).toEqual({ state: 'current', status: null });
	});

	it('follows the month on the slider and as the year plays, in Terrain view', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		stage.panel.setMonth(0);
		stage.panel.togglePlaying();
		stage.timers.advance(2 * PLAYBACK_STEP_MS);
		expect(stage.winds).toEqual([
			monthOf(solved, DEFAULT_MONTH),
			monthOf(solved, 0),
			monthOf(solved, 1),
			monthOf(solved, 2),
		]);
	});

	it('gives the new result’s month when a new result arrives, and nothing more as the status changes', () => {
		const stage = windy();
		const first = solvedWinds();
		arrive(stage, first);
		stage.store.markWindsOutOfDate();
		stage.store.markWindsCalculating();
		expect(stage.winds).toHaveLength(1);
		const second = solvedWinds(5);
		stage.store.setWindsResult(second, true);
		expect(stage.winds).toEqual([
			monthOf(first, DEFAULT_MONTH),
			monthOf(second, DEFAULT_MONTH),
		]);
	});

	it.each([
		[
			'out of date',
			(store: LayerStore) => store.markWindsOutOfDate(),
			'outOfDate',
			LEGEND_OUT_OF_DATE_TEXT,
		],
		[
			'being worked out',
			(store: LayerStore) => store.markWindsCalculating(),
			'calculating',
			WINDS_CALCULATING_TEXT,
		],
		[
			'no longer calculable',
			(store: LayerStore) => store.markWindsUnavailable(),
			'unavailable',
			WINDS_UNAVAILABLE_TEXT,
		],
	] as const)(
		'keeps the arrows while the winds are %s, and the key says so',
		(_name, change, state, words) => {
			const stage = windy();
			arrive(stage, solvedWinds());
			change(stage.store);
			expect(stage.winds).toHaveLength(1);
			expect(stage.keys.at(-1)).toEqual({ state, status: words });
		},
	);

	it('drops the arrows when the store drops its winds, as for a new world', () => {
		const stage = windy();
		arrive(stage, solvedWinds());
		stage.store.clear();
		expect(stage.winds.at(-1)).toBeNull();
		expect(stage.keys.at(-1)).toEqual({
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
		});
	});

	it('shows the annual mean on Annual average, worked out once for each result', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		const mean = stage.winds.at(-1);
		expect(mean?.east).toEqual(summariseWinds(solved.winds).east);
		expect(mean?.north).toEqual(summariseWinds(solved.winds).north);
		stage.panel.setSummary('temperature', 'month');
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.winds.at(-1)?.east).toBe(mean?.east);
		expect(stage.winds.at(-1)?.north).toBe(mean?.north);
	});

	it.each(['warmest', 'coldest', 'range'] as const)(
		'keeps the month last on screen on the %s',
		(view) => {
			const stage = windy();
			const solved = solvedWinds();
			arrive(stage, solved);
			stage.panel.setLayer('temperature');
			stage.panel.setMonth(3);
			stage.panel.setSummary('temperature', view);
			expect(stage.winds.at(-1)).toEqual(monthOf(solved, 3));
			expect(stage.winds).toHaveLength(2);
		},
	);

	it('shows the month on screen in Terrain view, whatever summary was last chosen in Temperature view', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		stage.panel.setLayer('terrain');
		expect(stage.winds.at(-1)).toEqual(monthOf(solved, DEFAULT_MONTH));
	});

	it('removes the arrows when turned off, and hides the key', () => {
		const stage = windy();
		arrive(stage, solvedWinds());
		stage.panel.setWinds(false);
		expect(stage.winds.at(-1)).toBeNull();
		expect(stage.keys.at(-1)).toBeNull();
		stage.store.setWindsResult(solvedWinds(3), true);
		expect(stage.winds.at(-1)).toBeNull();
		expect(stage.winds).toHaveLength(2);
	});

	it('offers the month in Terrain view while on, and stops the year when turned off there with sunlight off', () => {
		const stage = windy();
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, winds: true },
			playing: false,
		});
		stage.panel.togglePlaying();
		stage.panel.setWinds(false);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: DEFAULT_PAGE_VIEW,
			playing: false,
		});
	});

	it('keeps the year playing in Terrain view when turned off with sunlight still on', () => {
		const stage = windy();
		stage.panel.setSunlight(true);
		stage.panel.togglePlaying();
		stage.panel.setWinds(false);
		expect(stage.timers.pending()).toBe(1);
		expect(stage.lastView()?.playing).toBe(true);
	});

	it('says the globe shows no winds while they are off, and none before a result', () => {
		const stage = createStage();
		arrive(stage, solvedWinds());
		expect(stage.panel.shownWinds()).toBeNull();
		const on = windy();
		expect(on.panel.shownWinds()).toBeNull();
	});

	it('says the globe shows the very winds its arrows are drawn from, the month’s, current', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		const shown = stage.panel.shownWinds();
		expect(shown?.field).toBe(stage.winds.at(-1));
		expect(shown?.field.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		expect(shown?.field.north).toBe(solved.winds.north[DEFAULT_MONTH]);
		expect(shown?.current).toBe(true);
		stage.panel.setMonth(2);
		expect(stage.panel.shownWinds()?.field.east).toBe(solved.winds.east[2]);
	});

	it('says the globe shows the year’s mean winds on Annual average, and the month’s again after', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		const shown = stage.panel.shownWinds();
		expect(shown?.field).toBe(stage.winds.at(-1));
		// Month m blows m + 1 m/s, so the year's mean blows 6.5 m/s.
		expect(Array.from(shown?.field.east ?? [])).toEqual([6.5, 0]);
		expect(shown?.current).toBe(true);
		stage.panel.setSummary('temperature', 'warmest');
		expect(stage.panel.shownWinds()?.field.east).toBe(
			solved.winds.east[DEFAULT_MONTH],
		);
	});

	it.each([
		['out of date', (store: LayerStore) => store.markWindsOutOfDate()],
		['being worked out', (store: LayerStore) => store.markWindsCalculating()],
		[
			'no longer calculable',
			(store: LayerStore) => store.markWindsUnavailable(),
		],
	])(
		'says the winds on the globe are not current while the store’s are %s',
		(_name, change) => {
			const stage = windy();
			arrive(stage, solvedWinds());
			change(stage.store);
			expect(stage.panel.shownWinds()?.current).toBe(false);
		},
	);

	it('says the winds on the globe are current again once new ones arrive', () => {
		const stage = windy();
		arrive(stage, solvedWinds());
		stage.store.markWindsOutOfDate();
		const next = solvedWinds(4);
		arrive(stage, next);
		expect(stage.panel.shownWinds()).toMatchObject({
			field: { east: next.winds.east[DEFAULT_MONTH] },
			current: true,
		});
	});

	it('says the earlier winds the globe keeps are not current when it refuses the new', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		const failure = new Error('refused');
		stage.failWindsNext(failure);
		stage.store.setWindsResult(solvedWinds(4), true);
		expect(stage.errors).toEqual([failure]);
		const shown = stage.panel.shownWinds();
		expect(shown?.field.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		expect(shown?.current).toBe(false);
	});

	it('says the globe shows no winds once they are turned off, or the store drops them', () => {
		const stage = windy();
		arrive(stage, solvedWinds());
		stage.panel.setWinds(false);
		expect(stage.panel.shownWinds()).toBeNull();
		stage.panel.setWinds(true);
		expect(stage.panel.shownWinds()).not.toBeNull();
		stage.store.clear();
		expect(stage.panel.shownWinds()).toBeNull();
	});

	it('keeps the winds for a new world', () => {
		const stage = windy();
		stage.panel.setMonth(2);
		stage.panel.newWorld(null);
		expect(stage.lastView()?.view).toEqual({
			...DEFAULT_PAGE_VIEW,
			winds: true,
		});
		expect(stage.told.at(-1)?.winds).toBe(true);
	});
});

describe('createLayerPanel, the observed winds', () => {
	const grid = getGrid(64);
	/** Twelve months of a field on the 64 grid, from a value of the month and cell. */
	const monthsOf = (value: (m: number, cell: number) => number) =>
		Array.from({ length: 12 }, (_, m) =>
			Float32Array.from({ length: grid.cellCount }, (_, cell) =>
				value(m, cell),
			),
		);
	/** A simulated year of winds on the 64 grid, differing by cell and month. */
	const simulatedOnGrid = (offset = 0): SolvedWinds => ({
		winds: {
			east: monthsOf((m, cell) => 4 + (cell % 5) + m * 0.2 + offset),
			north: monthsOf((m, cell) => (cell % 3) - 1 - m * 0.1),
			pressure: monthsOf(() => 1013),
		},
		temperature: temperatureOf(1, grid.cellCount),
		dayLengthHours: 24,
	});
	/** Observed winds on the 64 grid, apart from the simulated in places. */
	const observedOnGrid = (): MonthlyWind => ({
		east: monthsOf((m, cell) => 6 - (cell % 7) + m * 0.1),
		north: monthsOf((m, cell) => (cell % 4) - 1.5 + m * 0.05),
	});
	/** Has winds arrive, current, as the scheduler does. */
	const arrive = (
		stage: ReturnType<typeof createStage>,
		solved: SolvedWinds,
	): SolvedWinds => {
		stage.store.markWindsCalculating();
		stage.store.setWindsResult(solved, true);
		return solved;
	};
	/**
	 * A stage on the measured Earth at 64 with the winds on and a result,
	 * and the observed winds' loader answering when a test says.
	 */
	const createWindsStage = () => {
		const stage = createStage();
		const deferred = createDeferredLoader<MonthlyWind>();
		stage.setWindsLoader(deferred.loader);
		// A layer chosen on Observed asks for its observed year, which stays
		// on its way here.
		stage.setLoader(() => new Promise(() => {}));
		stage.panel.setWinds(true);
		stage.panel.newWorld(64);
		const solved = arrive(stage, simulatedOnGrid());
		const observed = observedOnGrid();
		/** Chooses Observed and has the observed winds arrive. */
		const observe = async (): Promise<void> => {
			stage.panel.setSource('observed');
			deferred.last().resolve(observed);
			await settle();
		};
		return { stage, deferred, solved, observed, observe };
	};

	it('offers Simulated and Observed only on the measured Earth, on Simulated, and fetches nothing until Observed is first chosen', () => {
		const stage = createStage();
		const deferred = createDeferredLoader<MonthlyWind>();
		stage.setWindsLoader(deferred.loader);
		stage.panel.setWinds(true);
		arrive(stage, simulatedOnGrid());
		stage.panel.setEarth(64);
		expect(stage.lastComparison()).toEqual({
			offered: WIND_SOURCES,
			source: 'simulated',
			message: null,
		});
		stage.panel.setLayer('temperature');
		stage.panel.setMonth(2);
		stage.panel.setWinds(false);
		stage.panel.setWinds(true);
		stage.panel.setLayer('terrain');
		expect(deferred.calls).toEqual([]);
		stage.panel.setSource('observed');
		expect(deferred.calls.map((call) => call.resolution)).toEqual([64]);
		expect(stage.lastComparison()).toEqual({
			offered: WIND_SOURCES,
			source: 'observed',
			message: null,
		});
		stage.panel.setEarth(null);
		expect(stage.lastComparison()).toEqual({
			offered: [],
			source: 'simulated',
			message: null,
		});
	});

	it('ignores Observed chosen while the world is not the measured Earth', () => {
		const stage = createStage();
		const deferred = createDeferredLoader<MonthlyWind>();
		stage.setWindsLoader(deferred.loader);
		stage.panel.setWinds(true);
		stage.panel.setSource('observed');
		expect(deferred.calls).toEqual([]);
		expect(stage.lastComparison()).toEqual({
			offered: [],
			source: 'simulated',
			message: null,
		});
		expect(stage.told.at(-1)?.source).toBe('simulated');
	});

	it('says on the key that the observed winds are loading, keeping the simulated arrows until they arrive', () => {
		const { stage, solved } = createWindsStage();
		stage.panel.setSource('observed');
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		// Whatever is chosen meanwhile, the key says so until they arrive.
		stage.panel.setSource('simulated');
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
	});

	it('draws the arrows from the observed winds once they arrive, the month’s, following the month', async () => {
		const { stage, observed, observe } = createWindsStage();
		await observe();
		expect(stage.winds.at(-1)?.east).toBe(observed.east[DEFAULT_MONTH]);
		expect(stage.winds.at(-1)?.north).toBe(observed.north[DEFAULT_MONTH]);
		expect(stage.panel.shownWinds()).toMatchObject({
			source: 'observed',
			current: true,
		});
		expect(stage.lastKey()?.status).toBeNull();
		stage.panel.setMonth(0);
		expect(stage.winds.at(-1)?.east).toBe(observed.east[0]);
	});

	it('draws the observed winds’ year mean on the annual average, worked out once, as the simulated mean is', async () => {
		const { stage, solved, observed, observe } = createWindsStage();
		await observe();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		const mean = stage.winds.at(-1);
		const expected = summariseWinds({
			...observed,
			pressure: solved.winds.pressure,
		});
		expect(mean?.east).toEqual(expected.east);
		expect(mean?.north).toEqual(expected.north);
		expect(stage.panel.shownWinds()).toMatchObject({
			field: mean,
			source: 'observed',
		});
		stage.panel.setSummary('temperature', 'month');
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.winds.at(-1)?.east).toBe(mean?.east);
		// The simulated mean again, once Simulated is chosen.
		stage.panel.setSource('simulated');
		expect(stage.winds.at(-1)?.east).toEqual(summariseWinds(solved.winds).east);
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
	});

	it('draws the simulated arrows again when Simulated is chosen, fetching nothing more', async () => {
		const { stage, deferred, solved, observed, observe } = createWindsStage();
		await observe();
		stage.panel.setSource('simulated');
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
		stage.panel.setSource('observed');
		expect(stage.winds.at(-1)?.east).toBe(observed.east[DEFAULT_MONTH]);
		expect(deferred.calls).toHaveLength(1);
	});

	it('says where the winds stand before anything about the observed winds, loading or failed', async () => {
		const { stage, deferred } = createWindsStage();
		// While the observed winds load, winds that are out of date or being
		// worked out again say so.
		stage.panel.setSource('observed');
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
		stage.store.markOutOfDate();
		expect(stage.lastKey()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		stage.store.markWindsCalculating();
		expect(stage.lastKey()?.status).toBe(WINDS_CALCULATING_TEXT);
		// So they do once the load has failed, and the failure shows again
		// when they are current.
		deferred.last().reject(new Error('offline'));
		await settle();
		expect(stage.lastKey()?.status).toBe(WINDS_CALCULATING_TEXT);
		arrive(stage, simulatedOnGrid());
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_FAILED_TEXT);
		stage.store.markOutOfDate();
		expect(stage.lastKey()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
	});

	it('goes back to Simulated when the observed winds cannot be loaded, the status line saying so, and fetches again at the next choice', async () => {
		const { stage, deferred, solved } = createWindsStage();
		stage.panel.setSource('observed');
		const error = new Error('offline');
		deferred.last().reject(error);
		await settle();
		expect(stage.reported).toEqual([error]);
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_FAILED_TEXT);
		expect(stage.lastComparison()).toMatchObject({
			offered: WIND_SOURCES,
			source: 'simulated',
		});
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(2);
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
	});

	it.each([
		['a new world', (panel: LayerPanel) => panel.newWorld(64)],
		[
			'the world stopped being the measured Earth',
			(panel: LayerPanel) => panel.setEarth(null),
		],
		[
			'the world stopped and started being the measured Earth',
			(panel: LayerPanel) => {
				panel.setEarth(null);
				panel.setEarth(64);
			},
		],
	])(
		'sets aside the observed winds that arrive after %s',
		async (_, change) => {
			for (const outcome of ['arrives', 'fails'] as const) {
				const { stage, deferred, observed } = createWindsStage();
				stage.panel.setSource('observed');
				change(stage.panel);
				const sent = stage.winds.length;
				const comparisons = stage.comparisons.length;
				const keys = stage.keys.length;
				if (outcome === 'arrives') {
					deferred.last().resolve(observed);
				} else {
					deferred.last().reject(new Error('late'));
				}
				await settle();
				expect(stage.winds, outcome).toHaveLength(sent);
				expect(stage.comparisons, outcome).toHaveLength(comparisons);
				expect(stage.keys, outcome).toHaveLength(keys);
				expect(stage.reported, outcome).toEqual([]);
				expect(stage.lastComparison()?.source, outcome).toBe('simulated');
				expect(stage.panel.shownWinds()?.source ?? 'simulated', outcome).toBe(
					'simulated',
				);
			}
		},
	);

	it('goes back to Simulated when the world stops being the measured Earth, keeping the observed winds for the same grid', async () => {
		const { stage, deferred, solved, observed, observe } = createWindsStage();
		await observe();
		stage.panel.setEarth(null);
		expect(stage.lastComparison()).toMatchObject({
			offered: [],
			source: 'simulated',
		});
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		stage.panel.setEarth(64);
		expect(stage.lastComparison()).toMatchObject({
			offered: WIND_SOURCES,
			source: 'simulated',
		});
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(1);
		expect(stage.winds.at(-1)?.east).toBe(observed.east[DEFAULT_MONTH]);
	});

	it('forgets the observed winds and the choice for a new world', async () => {
		const { stage, deferred, solved, observe } = createWindsStage();
		await observe();
		stage.panel.newWorld(64);
		expect(stage.lastComparison()).toMatchObject({
			offered: WIND_SOURCES,
			source: 'simulated',
		});
		arrive(stage, solved);
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(2);
	});

	it('says only where the winds stand, with no figures of them against the observed winds, for both sources', async () => {
		const { stage, observe } = createWindsStage();
		await observe();
		expect(stage.lastKey()).toEqual({ state: 'current', status: null });
		stage.panel.setSource('simulated');
		expect(stage.lastKey()).toEqual({ state: 'current', status: null });
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.lastKey()).toEqual({ state: 'current', status: null });
	});

	it('says nothing of the simulated winds being out of date under the observed, and says so under the simulated', async () => {
		const { stage, observe } = createWindsStage();
		await observe();
		stage.store.markWindsOutOfDate();
		// Under the observed winds, which are never out of date.
		expect(stage.lastKey()?.status).toBeNull();
		expect(stage.panel.shownWinds()?.current).toBe(true);
		stage.panel.setSource('simulated');
		expect(stage.lastKey()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shownWinds()?.current).toBe(false);
		stage.store.markWindsCalculating();
		expect(stage.lastKey()?.status).toBe(WINDS_CALCULATING_TEXT);
	});

	it('says nothing of the winds off the measured Earth once they are current, and drops the arrows without a simulated result', async () => {
		const { stage, observe } = createWindsStage();
		await observe();
		stage.store.clear();
		expect(stage.winds.at(-1)).toBeNull();
		const elsewhere = createStage();
		elsewhere.panel.setWinds(true);
		arrive(elsewhere, simulatedOnGrid());
		expect(elsewhere.lastKey()).toEqual({ state: 'current', status: null });
	});
});

describe('createLayerPanel, the key’s wording', () => {
	it('says Calculating while the temperature the winds wait for is worked out, and Not calculated yet only when nothing is under way', () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		expect(stage.lastKey()).toEqual({
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
		});
		stage.store.markCalculating();
		expect(stage.store.winds.status).toBe('empty');
		expect(stage.lastKey()).toEqual({
			state: 'calculating',
			status: WINDS_CALCULATING_TEXT,
		});
		stage.store.markFailed();
		expect(stage.lastKey()).toEqual({
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
		});
		stage.store.markCalculating();
		stage.store.setResult(temperatureOf(1), true);
		// A temperature and no winds asked for yet: nothing is under way.
		expect(stage.lastKey()).toEqual({
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
		});
		stage.store.markWindsCalculating();
		expect(stage.lastKey()).toEqual({
			state: 'calculating',
			status: WINDS_CALCULATING_TEXT,
		});
	});

	it('words its line as the pressure’s legend does, by the same rule', () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		stage.panel.setLayer('pressure');
		stage.store.markCalculating();
		expect(stage.lastKey()?.status).toBe(WINDS_CALCULATING_TEXT);
		expect(stage.lastLegend()?.status).toBe(LEGEND_CALCULATING_TEXT);
	});
});

describe('createLayerPanel, another layer described', () => {
	/** The view settings with the made-up layer's own, as the panel keeps them. */
	const twoLayerView = (view: Partial<PageView> = {}): PageView => ({
		...DEFAULT_PAGE_VIEW,
		summaries: Object.fromEntries([
			['temperature', 'month'],
			[MADE_UP_ID, 'month'],
		]) as PageView['summaries'],
		...view,
	});

	/** The panel on a real store, offering the temperature and the made-up layer. */
	const createTwoLayerStage = () => {
		const store = createLayerStore(() => {});
		const shown: Shown[] = [];
		const legends: (LegendContent | null)[] = [];
		const calculations: CalculationContent[] = [];
		const comparisons: ComparisonContent[] = [];
		const told: PageView[] = [];
		const asked: string[] = [];
		/** The field the globe refuses, as a globe can refuse one it is given. */
		let refused: Float32Array | null = null;
		const panel = createLayerPanel({
			store,
			layers: [TEMPERATURE_LAYER, MADE_UP_LAYER],
			setTimer: () => 0,
			clearTimer: () => {},
			loadObserved: (layer) => {
				asked.push(layer.id);
				return Promise.reject(new Error('No observed year is asked for'));
			},
			loadObservedWinds: () =>
				Promise.reject(new Error('The observed winds are not asked for')),
			reportError: () => {},
			globe: {
				setLayer: (field, range, ramp) => {
					if (field !== null && field === refused) {
						throw new Error('The globe refuses this field');
					}
					shown.push({ field, range, ramp });
				},
				setWinds: () => {},
			},
			onView: (view) => told.push(view),
			onComparison: (content) => comparisons.push(content),
			createControls: () => ({
				showLegend: (content) => legends.push(content),
				showWindKey: () => {},
				showCalculation: (content) => calculations.push(content),
			}),
		});
		/** Has a year of winds and pressure arrive, current. */
		const arrive = (solved: SolvedWinds = pressureWinds()): SolvedWinds => {
			store.markWindsCalculating();
			store.setWindsResult(solved, true);
			return solved;
		};
		return {
			store,
			panel,
			shown,
			legends,
			calculations,
			comparisons,
			told,
			asked,
			arrive,
			/** Has the globe refuse the field given, or none for null. */
			refuse: (field: Float32Array | null) => {
				refused = field;
			},
		};
	};

	it('tells the view of the layers it offers, each on its own view of the year', () => {
		const stage = createTwoLayerStage();
		stage.panel.setSunlight(true);
		expect(stage.told).toEqual([{ ...twoLayerView(), sunlight: true }]);
	});

	it('says where the calculation stands the same way whichever layer is chosen, and with the Winds tile on or off', () => {
		const stage = createTwoLayerStage();
		stage.store.markCalculating();
		const calculating = {
			state: 'calculating',
			status: CALCULATING_TEMPERATURE_TEXT,
			bar: { fraction: null },
		};
		for (const step of [
			() => stage.panel.setLayer(MADE_UP_ID),
			() => stage.panel.setWinds(true),
			() => stage.panel.setLayer('temperature'),
			() => stage.panel.setWinds(false),
			() => stage.panel.setLayer('terrain'),
		]) {
			step();
			expect(stage.calculations.at(-1)).toEqual(calculating);
		}
	});

	it('shows its months from where it says, on a scale centred on the year’s mean, in its colours and words', () => {
		const stage = createTwoLayerStage();
		stage.panel.setLayer(MADE_UP_ID);
		expect(stage.legends.at(-1)).toEqual({
			scale: null,
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
		const solved = stage.arrive();
		const last = stage.shown.at(-1);
		expect(last?.field).toBe(solved.winds.pressure[DEFAULT_MONTH]);
		expect(last?.ramp).toBe(SEVEN_STOP_RAMP);
		expect(last?.range).toEqual(
			fitRangeCentred(
				solved.winds.pressure,
				cellWeights(2),
				weightedMean(solved.winds.pressure, cellWeights(2)),
				MADE_UP_LAYER.minSpan.hPa,
			),
		);
		expect(((last?.range?.min ?? 0) + (last?.range?.max ?? 0)) / 2).toBe(1016);
		const legend = stage.legends.at(-1);
		expect(legend?.status).toBeNull();
		expect(legend?.scale?.caption).toBe('Made-up pressure in month 7, hPa');
		expect(legend?.scale?.gradient).toBe(rampGradient(SEVEN_STOP_RAMP));
		expect(
			legend?.scale?.ticks.every((tick) => tick.label.startsWith('≈')),
		).toBe(true);
		expect(stage.panel.shown()).toEqual({
			layer: MADE_UP_LAYER,
			summary: 'month',
			field: solved.winds.pressure[DEFAULT_MONTH],
			source: 'simulated',
			current: true,
		});
		// The temperature's store is not where its months are.
		stage.store.markCalculating();
		stage.store.setResult(temperatureOf(1), true);
		expect(stage.panel.shown()?.field).toBe(
			solved.winds.pressure[DEFAULT_MONTH],
		);
	});

	it('says its own words while its calculation is under way or unavailable', () => {
		const stage = createTwoLayerStage();
		stage.panel.setLayer(MADE_UP_ID);
		stage.store.markWindsCalculating();
		expect(stage.legends.at(-1)).toEqual({
			scale: null,
			state: 'calculating',
			status: LEGEND_CALCULATING_TEXT,
			bar: { fraction: null },
		});
		stage.store.markWindsUnavailable();
		expect(stage.legends.at(-1)?.status).toBe(MADE_UP_LAYER.unavailableText);
	});

	it('offers only its own views, its annual average on the same scale as its months', () => {
		const stage = createTwoLayerStage();
		stage.panel.setLayer(MADE_UP_ID);
		const solved = stage.arrive();
		const monthRange = stage.shown.at(-1)?.range;
		stage.panel.setSummary(MADE_UP_ID, 'range');
		expect(stage.told.at(-1)?.summaries[MADE_UP_ID]).toBe('month');
		stage.panel.setSummary(MADE_UP_ID, 'annualMean');
		expect(stage.told.at(-1)?.summaries[MADE_UP_ID]).toBe('annualMean');
		expect(Array.from(stage.shown.at(-1)?.field ?? [])).toEqual(
			Array.from(
				MADE_UP_LAYER.summarise(solved.winds.pressure).annualMean ?? [],
			),
		);
		expect(stage.shown.at(-1)?.range).toEqual(monthRange);
		expect(stage.legends.at(-1)?.scale?.caption).toBe(
			'Yearly mean made-up pressure, hPa',
		);
	});

	it('keeps each layer’s own view of the year while the other is shown', () => {
		const stage = createTwoLayerStage();
		stage.panel.setSummary('temperature', 'warmest');
		stage.panel.setSummary(MADE_UP_ID, 'annualMean');
		expect(stage.told.at(-1)?.summaries).toEqual(
			Object.fromEntries([
				['temperature', 'warmest'],
				[MADE_UP_ID, 'annualMean'],
			]),
		);
		stage.arrive();
		stage.store.markCalculating();
		stage.store.setResult(temperatureOf(1), true);
		stage.panel.setLayer('temperature');
		expect(stage.told.at(-1)?.summaries.temperature).toBe('warmest');
		stage.panel.setLayer(MADE_UP_ID);
		expect(stage.told.at(-1)?.summaries[MADE_UP_ID]).toBe('annualMean');
		stage.panel.setLayer('temperature');
		expect(stage.told.at(-1)?.summaries.temperature).toBe('warmest');
	});

	it('offers no comparison for a layer with no observed year, on the measured Earth too', () => {
		const stage = createTwoLayerStage();
		stage.panel.setEarth(64);
		stage.panel.setLayer(MADE_UP_ID);
		stage.arrive();
		expect(stage.comparisons.at(-1)?.offered).toEqual([]);
		stage.panel.setSource('observed');
		stage.panel.setSource('difference');
		expect(stage.asked).toEqual([]);
		expect(stage.told.at(-1)?.source).toBe('simulated');
		expect(stage.legends.at(-1)?.scale?.caption).toBe(
			'Made-up pressure in month 7, hPa',
		);
		// With the winds on, only they are compared: Difference is not offered.
		stage.panel.setWinds(true);
		expect(stage.comparisons.at(-1)?.offered).toEqual(WIND_SOURCES);
		stage.panel.setWinds(false);
		stage.panel.setLayer('temperature');
		expect(stage.comparisons.at(-1)).toEqual({
			offered: SOURCES,
			source: 'simulated',
			message: null,
		});
	});

	it('has the winds show the year’s mean while it shows its annual average', () => {
		const stage = createTwoLayerStage();
		stage.panel.setWinds(true);
		const solved = stage.arrive();
		const month = solved.winds.east[DEFAULT_MONTH];
		stage.panel.setLayer(MADE_UP_ID);
		expect(stage.panel.shownWinds()?.field.east).toBe(month);
		stage.panel.setSummary(MADE_UP_ID, 'annualMean');
		expect(stage.panel.shownWinds()?.field.east).toEqual(
			summariseWinds(solved.winds).east,
		);
		stage.panel.setLayer('terrain');
		expect(stage.panel.shownWinds()?.field.east).toBe(month);
	});

	it('keeps the scale of the layer the globe still shows, as that layer writes it, when it refuses the first field of another', () => {
		const stage = createTwoLayerStage();
		stage.panel.setLayer('temperature');
		stage.store.markCalculating();
		stage.store.setResult(temperatureOf(1), true);
		const temperatureScale = stage.legends.at(-1)?.scale;
		expect(temperatureScale?.caption).toMatch(/, °C$/);
		const solved = stage.arrive();
		stage.refuse(solved.winds.pressure[DEFAULT_MONTH] ?? null);
		expect(() => stage.panel.setLayer(MADE_UP_ID)).toThrow(
			'The globe refuses this field',
		);
		expect(stage.panel.shown()?.layer).toBe(TEMPERATURE_LAYER);
		const legend = stage.legends.at(-1);
		expect(legend?.scale).toEqual(temperatureScale);
		expect(legend?.scale?.ticks.map((tick) => tick.label)).toEqual(
			temperatureScale?.ticks.map((tick) => tick.label),
		);
		expect(
			legend?.scale?.ticks.some((tick) => tick.label.startsWith('≈')),
		).toBe(false);
		expect(legend?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		// The line goes on in the chosen layer's words: its calculation tells
		// no years, where the temperature's would.
		stage.store.markWindsCalculating();
		expect(stage.panel.shown()?.layer).toBe(TEMPERATURE_LAYER);
		expect(stage.legends.at(-1)).toEqual({
			scale: temperatureScale,
			state: 'calculating',
			status: LEGEND_CALCULATING_TEXT,
			bar: { fraction: null },
		});
	});
});

describe('createLayerPanel, the pressure', () => {
	/** Has winds and pressure arrive, current, as the scheduler does. */
	const arriveWinds = (
		stage: ReturnType<typeof createStage>,
		solved: SolvedWinds = pressureWinds(),
	): SolvedWinds => {
		stage.store.markWindsCalculating();
		stage.store.setWindsResult(solved, true);
		return solved;
	};
	/** The scale the pressure of a year is drawn on: centred on its mean. */
	const pressureRange = (solved: SolvedWinds): ValueRange =>
		fitRangeCentred(
			solved.winds.pressure,
			cellWeights(2),
			weightedMean(solved.winds.pressure, cellWeights(2)),
			10,
		);

	it('offers the Pressure after the Temperature, with only the Month and the Annual average', () => {
		const stage = createStage();
		stage.panel.setLayer('pressure');
		expect(Object.keys(stage.told.at(-1)?.summaries ?? {})).toEqual([
			'temperature',
			'pressure',
		]);
		expect(stage.told.at(-1)?.summaries.pressure).toBe('month');
		stage.panel.setSummary('pressure', 'warmest');
		expect(stage.told.at(-1)?.summaries.pressure).toBe('month');
		stage.panel.setSummary('pressure', 'annualMean');
		expect(stage.told.at(-1)?.summaries.pressure).toBe('annualMean');
	});

	it('says the winds are being calculated on it, on the Temperature and on Terrain alike, with the Winds tile off', () => {
		const stage = createStage();
		stage.arrive(resultWith());
		stage.store.markWindsCalculating();
		const calculating = {
			state: 'calculating',
			status: CALCULATING_WINDS_TEXT,
			bar: { fraction: null },
		};
		for (const layer of ['pressure', 'temperature', 'terrain'] as const) {
			stage.panel.setLayer(layer);
			expect(stage.lastCalculation()).toEqual(calculating);
		}
	});

	it('says the same with the Winds tile on, whichever layer it is left for', () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		stage.arrive(resultWith());
		stage.store.markWindsCalculating();
		for (const layer of ['pressure', 'temperature', 'terrain'] as const) {
			stage.panel.setLayer(layer);
			expect(stage.lastCalculation()?.status).toBe(CALCULATING_WINDS_TEXT);
		}
		stage.store.setWindsResult(solvedWinds(), true);
		expect(stage.lastCalculation()).toEqual({
			state: 'current',
			status: null,
			bar: null,
		});
	});

	it('shows the month’s pressure of the winds’ result, centred on the year’s mean, in its colours and words', () => {
		const stage = createStage();
		stage.panel.setLayer('pressure');
		expect(stage.lastLegend()).toEqual({
			scale: null,
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
		// The temperature's result is not where its months are.
		stage.arrive(resultWith());
		expect(stage.shown).toEqual([]);
		const solved = arriveWinds(stage);
		const last = stage.shown.at(-1);
		expect(last?.field).toBe(solved.winds.pressure[DEFAULT_MONTH]);
		expect(last?.ramp).toBe(PRESSURE_RAMP);
		expect(last?.range).toEqual(pressureRange(solved));
		expect(((last?.range?.min ?? 0) + (last?.range?.max ?? 0)) / 2).toBe(1016);
		const legend = stage.lastLegend();
		expect(legend?.status).toBeNull();
		expect(legend?.scale?.caption).toBe('Sea-level pressure in July, hPa');
		expect(legend?.scale?.gradient).toBe(rampGradient(PRESSURE_RAMP));
		expect(tickLabels(legend)).toContain('1,010');
		expect(stage.panel.shown()).toEqual({
			layer: PRESSURE_LAYER,
			summary: 'month',
			field: solved.winds.pressure[DEFAULT_MONTH],
			source: 'simulated',
			current: true,
		});
		stage.panel.setMonth(0);
		expect(stage.shown.at(-1)?.field).toBe(solved.winds.pressure[0]);
		expect(stage.shown.at(-1)?.range).toEqual(last?.range);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Sea-level pressure in January, hPa',
		);
	});

	it('shows the year’s mean pressure on its Annual average, on the months’ scale, worked out once', () => {
		const stage = createStage();
		stage.panel.setLayer('pressure');
		const solved = arriveWinds(stage);
		const monthRange = stage.shown.at(-1)?.range;
		stage.panel.setSummary('pressure', 'annualMean');
		const mean = stage.shown.at(-1)?.field;
		expect(mean).toEqual(summariseWinds(solved.winds).pressure);
		expect(stage.shown.at(-1)?.range).toEqual(monthRange);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Annual average sea-level pressure, hPa',
		);
		const sent = stage.shown.length;
		stage.store.markWindsOutOfDate();
		stage.panel.setSummary('pressure', 'month');
		stage.panel.setSummary('pressure', 'annualMean');
		expect(stage.shown).toHaveLength(sent + 2);
		expect(stage.shown.at(-1)?.field).toBe(mean);
	});

	it('says Calculating with no year count, and its own words when it cannot be calculated or shown', () => {
		const stage = createStage();
		stage.panel.setLayer('pressure');
		stage.store.markWindsCalculating();
		expect(stage.lastLegend()).toEqual({
			scale: null,
			state: 'calculating',
			status: LEGEND_CALCULATING_TEXT,
			bar: { fraction: null },
		});
		expect(LEGEND_CALCULATING_TEXT).toBe('Calculating');
		stage.store.markWindsUnavailable();
		expect(stage.lastLegend()?.status).toBe('Pressure unavailable');

		const refused = createStage();
		refused.panel.setLayer('pressure');
		refused.failNext(new Error('The globe refuses this field'));
		arriveWinds(refused);
		expect(refused.lastLegend()).toEqual({
			scale: null,
			state: 'unavailable',
			status: 'Pressure could not be shown',
			bar: null,
		});
	});

	/**
	 * A year of winds and pressure on the 64 grid, its pressure differing
	 * from cell to cell and month to month about 1,013 hPa.
	 */
	const pressureOnGrid = (): SolvedWinds => {
		const { cellCount } = getGrid(64);
		const months = Array.from({ length: 12 }, (_, m) => m);
		const field = (value: (cell: number) => number) =>
			Float32Array.from({ length: cellCount }, (_, cell) => value(cell));
		return {
			winds: {
				east: months.map(() => field(() => 1)),
				north: months.map(() => field(() => 0)),
				pressure: months.map((m) =>
					field((cell) => 1005 + (cell % 17) + m * 0.5),
				),
			},
			temperature: temperatureOf(1, cellCount),
			dayLengthHours: 24,
		};
	};
	/** An observed pressure below the simulated by an amount of each cell's. */
	const observedPressureFor = (solved: SolvedWinds): Float32Array[] =>
		solved.winds.pressure.map((month, m) =>
			month.map((value, cell) => value - 2 - (cell % 3) - m * 0.1),
		);
	/** A stage in Pressure view on the measured Earth at 64, with a result. */
	const createPressureEarthStage = () => {
		const stage = createStage();
		const deferred = createDeferredLoader();
		stage.setLoader(deferred.loader);
		stage.panel.setLayer('pressure');
		stage.panel.newWorld(64);
		const solved = arriveWinds(stage, pressureOnGrid());
		const observed = observedPressureFor(solved);
		return { stage, deferred, solved, observed };
	};

	it('is compared with the observed pressure on the measured Earth: Simulated, Observed and Difference', async () => {
		const { stage, deferred, solved, observed } = createPressureEarthStage();
		const grid = getGrid(64);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'simulated',
			message: null,
		});
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Simulated sea-level pressure in July, hPa',
		);
		stage.panel.setSource('observed');
		expect(deferred.calls.map((call) => call.resolution)).toEqual([64]);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'observed',
			message: OBSERVED_PRESSURE_LOADING_TEXT,
		});
		expect(stage.panel.shown()?.source).toBe('simulated');
		deferred.last().resolve(observed);
		await settle();
		expect(stage.lastComparison()?.message).toBeNull();
		expect(stage.shown.at(-1)?.field).toBe(observed[DEFAULT_MONTH]);
		expect(stage.shown.at(-1)?.ramp).toBe(PRESSURE_RAMP);
		expect(stage.panel.shown()?.source).toBe('observed');
		const legend = stage.lastLegend();
		expect(legend?.scale?.caption).toBe(
			'Observed sea-level pressure in July, hPa',
		);
		// The figures, in hPa, of the simulated month against the observed.
		const figures = compareField(
			solved.winds.pressure[DEFAULT_MONTH] as Float32Array,
			observed[DEFAULT_MONTH] as Float32Array,
			grid,
		);
		expect(legend?.scale?.figures).toBe(formatFigures(figures, 'hPa'));
		expect(legend?.scale?.figures).toMatch(
			/^Mean \+\d\.\d hPa · RMS \d\.\d hPa$/,
		);

		stage.panel.setSource('difference');
		const difference = stage.shown.at(-1);
		expect([...(difference?.field ?? [])]).toEqual([
			...differenceField(
				solved.winds.pressure[DEFAULT_MONTH] as Float32Array,
				observed[DEFAULT_MONTH] as Float32Array,
			),
		]);
		expect(difference?.range).toEqual({ min: -20, max: 20 });
		expect(difference?.ramp).toBe(DIFFERENCE_RAMP);
		const shownDifference = stage.lastLegend();
		expect(shownDifference?.scale?.caption).toBe(
			'Simulated less observed in July, hPa',
		);
		expect(tickLabels(shownDifference)).toEqual([
			'−20',
			'−10',
			'0',
			'10',
			'20',
		]);
		expect(shownDifference?.scale).not.toHaveProperty('below');
		expect(shownDifference?.scale).not.toHaveProperty('above');
		expect(shownDifference?.scale?.figures).toBe(formatFigures(figures, 'hPa'));
		stage.panel.setSummary('pressure', 'annualMean');
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Simulated less observed, annual average sea-level pressure, hPa',
		);
		expect(stage.shown.at(-1)?.range).toEqual({ min: -20, max: 20 });
		expect(deferred.calls).toHaveLength(1);
		expect(stage.told.at(-1)?.source).toBe('difference');
	});

	it('goes back to Simulated when the observed pressure cannot be loaded, and asks again at the next choice', async () => {
		const { stage, deferred } = createPressureEarthStage();
		stage.panel.setSource('difference');
		const error = new Error('offline');
		deferred.last().reject(error);
		await settle();
		expect(stage.reported).toEqual([error]);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'simulated',
			message: OBSERVED_PRESSURE_FAILED_TEXT,
		});
		expect(stage.told.at(-1)?.source).toBe('simulated');
		expect(stage.panel.shown()?.source).toBe('simulated');
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(2);
		expect(stage.lastComparison()?.message).toBe(
			OBSERVED_PRESSURE_LOADING_TEXT,
		);
	});

	it('offers its sources only on the measured Earth, and offers them again on Simulated when it is again', async () => {
		const { stage, deferred, observed } = createPressureEarthStage();
		stage.panel.setSource('observed');
		deferred.last().resolve(observed);
		await settle();
		expect(stage.panel.shown()?.source).toBe('observed');
		stage.panel.setEarth(null);
		expect(stage.lastComparison()).toEqual({
			offered: [],
			source: 'simulated',
			message: null,
		});
		expect(stage.panel.shown()?.source).toBe('simulated');
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Sea-level pressure in July, hPa',
		);
		expect(stage.lastLegend()?.scale?.figures).toBeNull();
		stage.panel.setEarth(64);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'simulated',
			message: null,
		});
		// The observed pressure is kept for the same grid.
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(1);
		expect(stage.panel.shown()?.source).toBe('observed');
		// Off its own view, the choice is hidden.
		stage.panel.setLayer('terrain');
		expect(stage.lastComparison()?.offered).toEqual([]);
	});

	it('has the winds over it follow the month, and the year’s mean on its Annual average', () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		const solved = arriveWinds(stage);
		stage.panel.setLayer('pressure');
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		stage.panel.setSummary('pressure', 'annualMean');
		const mean = stage.winds.at(-1);
		expect(mean?.east).toEqual(summariseWinds(solved.winds).east);
		expect(mean?.north).toEqual(summariseWinds(solved.winds).north);
		expect(mean?.east).not.toBe(solved.winds.east[DEFAULT_MONTH]);
		expect(stage.panel.shownWinds()?.field).toBe(mean);
		stage.panel.setSummary('pressure', 'month');
		stage.panel.setMonth(2);
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[2]);
	});

	it('keeps each layer’s own view of the year while the other is shown', () => {
		const stage = createStage();
		stage.arrive(resultWith());
		arriveWinds(stage);
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'warmest');
		stage.panel.setLayer('pressure');
		expect(stage.told.at(-1)?.summaries.pressure).toBe('month');
		stage.panel.setSummary('pressure', 'annualMean');
		stage.panel.setLayer('temperature');
		expect(stage.told.at(-1)?.summaries.temperature).toBe('warmest');
		expect(stage.panel.shown()?.layer).toBe(TEMPERATURE_LAYER);
		expect(stage.told.at(-1)?.summaries).toEqual({
			temperature: 'warmest',
			pressure: 'annualMean',
		});
		stage.panel.setLayer('pressure');
		expect(stage.told.at(-1)?.summaries.pressure).toBe('annualMean');
	});
});

describe('createLayerPanel, one source for the layer and the winds', () => {
	const grid = getGrid(64);
	/** Twelve months of a field on the 64 grid, from a value of the month and cell. */
	const monthsOf = (value: (m: number, cell: number) => number) =>
		Array.from({ length: 12 }, (_, m) =>
			Float32Array.from({ length: grid.cellCount }, (_, cell) =>
				value(m, cell),
			),
		);
	/** A year of winds and pressure on the 64 grid, differing by cell and month. */
	const windsOnGrid = (): SolvedWinds => ({
		winds: {
			east: monthsOf((m, cell) => 4 + (cell % 5) + m * 0.2),
			north: monthsOf((m, cell) => (cell % 3) - 1 - m * 0.1),
			pressure: monthsOf((m, cell) => 1005 + (cell % 17) + m * 0.5),
		},
		temperature: temperatureOf(1, grid.cellCount),
		dayLengthHours: 24,
	});
	/** Observed winds on the 64 grid, apart from the simulated in places. */
	const observedWindsOnGrid = (): MonthlyWind => ({
		east: monthsOf((m, cell) => 6 - (cell % 7) + m * 0.1),
		north: monthsOf((m, cell) => (cell % 4) - 1.5 + m * 0.05),
	});
	/** An observed pressure below the simulated by an amount of each cell's. */
	const observedPressureFor = (solved: SolvedWinds): Float32Array[] =>
		solved.winds.pressure.map((month, m) =>
			month.map((value, cell) => value - 2 - (cell % 3) - m * 0.1),
		);

	/**
	 * A stage on the measured Earth at 64 on the layer given, with the winds
	 * on or off, a temperature and a winds result, and the observed years'
	 * and the observed winds' loaders answering when a test says.
	 */
	const createSourceStage = (layer: Layer, winds: boolean) => {
		const stage = createStage();
		const years = createDeferredLoader();
		const observedWinds = createDeferredLoader<MonthlyWind>();
		stage.setLoader(years.loader);
		stage.setWindsLoader(observedWinds.loader);
		stage.panel.setLayer(layer);
		stage.panel.setWinds(winds);
		stage.panel.newWorld(64);
		const result = resultOnGrid();
		stage.arrive(result);
		const solved = windsOnGrid();
		stage.store.markWindsCalculating();
		stage.store.setWindsResult(solved, true);
		return {
			stage,
			years,
			observedWinds,
			result,
			solved,
			observed: observedFor(result),
			observedPressure: observedPressureFor(solved),
			windsObserved: observedWindsOnGrid(),
		};
	};

	it('offers what each view on the Earth and off it allows', () => {
		const cases: [Layer, boolean, boolean, readonly string[]][] = [
			['terrain', false, false, []],
			['terrain', true, false, []],
			['temperature', false, false, []],
			['temperature', true, false, []],
			['pressure', true, false, []],
			['terrain', false, true, []],
			['terrain', true, true, ['simulated', 'observed']],
			['temperature', false, true, ['simulated', 'observed', 'difference']],
			['temperature', true, true, ['simulated', 'observed', 'difference']],
			['pressure', false, true, ['simulated', 'observed', 'difference']],
			['pressure', true, true, ['simulated', 'observed', 'difference']],
		];
		for (const [layer, winds, earth, offered] of cases) {
			const stage = createStage();
			stage.panel.setLayer(layer);
			stage.panel.setWinds(winds);
			stage.panel.setEarth(earth ? 64 : null);
			expect(
				stage.lastComparison()?.offered ?? [],
				`${layer}, winds ${winds}, earth ${earth}`,
			).toEqual(offered);
		}
	});

	it('shows the observed temperature and the observed winds on Observed, and the difference under the simulated winds on Difference', async () => {
		const {
			stage,
			years,
			observedWinds,
			result,
			solved,
			observed,
			windsObserved,
		} = createSourceStage('temperature', true);
		stage.panel.setSource('observed');
		years.last().resolve(observed);
		observedWinds.last().resolve(windsObserved);
		await settle();
		expect(stage.panel.shown()?.source).toBe('observed');
		expect(stage.shown.at(-1)?.field).toBe(observed[DEFAULT_MONTH]);
		expect(stage.panel.shownWinds()?.source).toBe('observed');
		expect(stage.winds.at(-1)?.east).toBe(windsObserved.east[DEFAULT_MONTH]);
		expect(stage.told.at(-1)?.source).toBe('observed');

		stage.panel.setSource('difference');
		expect(stage.panel.shown()?.source).toBe('difference');
		expect([...(stage.shown.at(-1)?.field ?? [])]).toEqual([
			...differenceField(
				result.months[DEFAULT_MONTH] as Float32Array,
				observed[DEFAULT_MONTH] as Float32Array,
			),
		]);
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);

		stage.panel.setSource('simulated');
		expect(stage.panel.shown()?.source).toBe('simulated');
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
		// Everything was on hand: nothing more was asked for.
		expect(years.calls).toHaveLength(1);
		expect(observedWinds.calls).toHaveLength(1);
	});

	it('still writes the legend’s difference figures on Difference with the winds on, and says only where the winds stand', async () => {
		const { stage, years, observedWinds, result, observed, windsObserved } =
			createSourceStage('temperature', true);
		stage.panel.setSource('difference');
		years.last().resolve(observed);
		observedWinds.last().resolve(windsObserved);
		await settle();
		expect(stage.lastLegend()?.scale?.figures).toBe(
			figuresText(
				result.months[DEFAULT_MONTH] as Float32Array,
				observed[DEFAULT_MONTH] as Float32Array,
			),
		);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Simulated less observed in July, °C',
		);
		expect(stage.lastKey()).toEqual({ state: 'current', status: null });
		// And on Observed, with the observed winds under them, as before.
		stage.panel.setSource('observed');
		expect(stage.lastLegend()?.scale?.figures).toBe(
			figuresText(
				result.months[DEFAULT_MONTH] as Float32Array,
				observed[DEFAULT_MONTH] as Float32Array,
			),
		);
	});

	it('asks for both observed sets on Observed with the winds on, only the layer’s with them off, and the winds’ once they are turned on', () => {
		const both = createSourceStage('temperature', true);
		both.stage.panel.setSource('observed');
		expect(both.years.calls.map((call) => call.resolution)).toEqual([64]);
		expect(both.stage.observedAsked).toEqual(['temperature']);
		expect(both.observedWinds.calls.map((call) => call.resolution)).toEqual([
			64,
		]);
		expect(both.stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
		expect(both.stage.lastComparison()?.message).toBe(OBSERVED_LOADING_TEXT);

		const layerOnly = createSourceStage('temperature', false);
		layerOnly.stage.panel.setSource('observed');
		expect(layerOnly.years.calls).toHaveLength(1);
		expect(layerOnly.observedWinds.calls).toEqual([]);
		layerOnly.stage.panel.setWinds(true);
		expect(layerOnly.observedWinds.calls).toHaveLength(1);
		expect(layerOnly.stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
		expect(layerOnly.years.calls).toHaveLength(1);
		// Turned off and on again while they are on their way: asked once.
		layerOnly.stage.panel.setWinds(false);
		layerOnly.stage.panel.setWinds(true);
		expect(layerOnly.observedWinds.calls).toHaveLength(1);
	});

	it('asks for the observed winds on Difference too, for the key’s figures, and only the winds’ on Terrain', () => {
		const difference = createSourceStage('temperature', true);
		difference.stage.panel.setSource('difference');
		expect(difference.observedWinds.calls).toHaveLength(1);

		const terrain = createSourceStage('terrain', true);
		terrain.stage.panel.setSource('observed');
		expect(terrain.observedWinds.calls).toHaveLength(1);
		expect(terrain.years.calls).toEqual([]);
		expect(terrain.stage.lastComparison()).toEqual({
			offered: WIND_SOURCES,
			source: 'observed',
			message: null,
		});
	});

	it('goes back to Simulated on leaving a compared layer on Difference, and keeps Observed with the winds on', async () => {
		const { stage, years, observedWinds, observed, windsObserved } =
			createSourceStage('temperature', true);
		stage.panel.setSource('difference');
		years.last().resolve(observed);
		observedWinds.last().resolve(windsObserved);
		await settle();
		stage.panel.setLayer('terrain');
		expect(stage.lastComparison()).toEqual({
			offered: WIND_SOURCES,
			source: 'simulated',
			message: null,
		});
		expect(stage.told.at(-1)?.source).toBe('simulated');
		expect(stage.panel.shownWinds()?.source).toBe('simulated');

		stage.panel.setLayer('temperature');
		expect(stage.lastComparison()?.source).toBe('simulated');
		stage.panel.setSource('observed');
		stage.panel.setLayer('terrain');
		expect(stage.lastComparison()).toEqual({
			offered: WIND_SOURCES,
			source: 'observed',
			message: null,
		});
		expect(stage.panel.shownWinds()?.source).toBe('observed');
		expect(stage.winds.at(-1)?.east).toBe(windsObserved.east[DEFAULT_MONTH]);
		// Back on the layer, Observed is kept, its year already on hand.
		stage.panel.setLayer('temperature');
		expect(stage.lastComparison()?.source).toBe('observed');
		expect(stage.panel.shown()?.source).toBe('observed');
		expect(years.calls).toHaveLength(1);
	});

	it('goes back to Simulated on leaving a compared layer on Observed with the winds off, and when the winds are turned off on Terrain', async () => {
		const off = createSourceStage('temperature', false);
		off.stage.panel.setSource('observed');
		off.stage.panel.setLayer('terrain');
		expect(off.stage.lastComparison()).toEqual({
			offered: [],
			source: 'simulated',
			message: null,
		});
		expect(off.stage.told.at(-1)?.source).toBe('simulated');

		const terrain = createSourceStage('terrain', true);
		terrain.stage.panel.setSource('observed');
		terrain.stage.panel.setWinds(false);
		expect(terrain.stage.lastComparison()?.offered).toEqual([]);
		expect(terrain.stage.lastComparison()?.source).toBe('simulated');
		terrain.stage.panel.setWinds(true);
		expect(terrain.stage.lastComparison()).toEqual({
			offered: WIND_SOURCES,
			source: 'simulated',
			message: null,
		});
		// The observed winds asked for on Observed are still on their way.
		expect(terrain.stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
	});

	it.each(['observed', 'difference'] as const)(
		'keeps %s from one compared layer to the other, asking for the new layer’s observed year once, the simulated shown with its loading line until it arrives',
		async (source) => {
			const { stage, years, result, solved, observed, observedPressure } =
				createSourceStage('temperature', false);
			stage.panel.setSource(source);
			years.last().resolve(observed);
			await settle();
			expect(stage.panel.shown()?.source).toBe(source);

			stage.panel.setLayer('pressure');
			expect(stage.observedAsked).toEqual(['temperature', 'pressure']);
			expect(stage.lastComparison()).toEqual({
				offered: SOURCES,
				source,
				message: OBSERVED_PRESSURE_LOADING_TEXT,
			});
			expect(stage.told.at(-1)?.source).toBe(source);
			expect(stage.panel.shown()).toMatchObject({
				layer: PRESSURE_LAYER,
				source: 'simulated',
			});
			expect(stage.shown.at(-1)?.field).toBe(
				solved.winds.pressure[DEFAULT_MONTH],
			);
			// Asked once, however often it is chosen while it is on its way.
			stage.panel.setLayer('temperature');
			expect(stage.panel.shown()?.source).toBe(source);
			stage.panel.setLayer('pressure');
			expect(years.calls).toHaveLength(2);

			years.last().resolve(observedPressure);
			await settle();
			expect(stage.lastComparison()?.message).toBeNull();
			expect(stage.panel.shown()).toMatchObject({
				layer: PRESSURE_LAYER,
				source,
			});
			// And back again, each observed year on hand.
			stage.panel.setLayer('temperature');
			expect(stage.panel.shown()?.source).toBe(source);
			expect(stage.panel.shown()?.field).not.toBe(result.months[DEFAULT_MONTH]);
			expect(years.calls).toHaveLength(2);
		},
	);

	it('goes back to Simulated with the layer’s failure line when the new layer’s observed year cannot be loaded', async () => {
		const { stage, years, observed } = createSourceStage('temperature', false);
		stage.panel.setSource('difference');
		years.last().resolve(observed);
		await settle();
		stage.panel.setLayer('pressure');
		const error = new Error('offline');
		years.last().reject(error);
		await settle();
		expect(stage.reported).toEqual([error]);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'simulated',
			message: OBSERVED_PRESSURE_FAILED_TEXT,
		});
		expect(stage.told.at(-1)?.source).toBe('simulated');
		expect(stage.panel.shown()?.source).toBe('simulated');
		// Its year is asked for again at the next choice.
		stage.panel.setSource('observed');
		expect(years.calls).toHaveLength(3);
		expect(stage.lastComparison()?.message).toBe(
			OBSERVED_PRESSURE_LOADING_TEXT,
		);
	});

	it('keeps the source when a layer no longer on screen fails to load, its line waiting for it', async () => {
		const { stage, years, observedPressure } = createSourceStage(
			'temperature',
			false,
		);
		stage.panel.setSource('observed');
		stage.panel.setLayer('pressure');
		const [temperatureCall, pressureCall] = years.calls;
		temperatureCall?.reject(new Error('offline'));
		pressureCall?.resolve(observedPressure);
		await settle();
		expect(stage.panel.shown()).toMatchObject({
			layer: PRESSURE_LAYER,
			source: 'observed',
		});
		stage.panel.setLayer('temperature');
		// Still Observed, so its year is asked for again.
		expect(years.calls).toHaveLength(3);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'observed',
			message: OBSERVED_LOADING_TEXT,
		});
	});

	it.each([
		['the layer’s observed year', 'years'],
		['the observed winds', 'winds'],
	] as const)(
		'goes back to Simulated, saying so, when %s cannot be loaded',
		async (_, which) => {
			const { stage, years, observedWinds, observed, windsObserved } =
				createSourceStage('temperature', true);
			stage.panel.setSource('observed');
			const error = new Error('offline');
			if (which === 'years') {
				years.last().reject(error);
				observedWinds.last().resolve(windsObserved);
			} else {
				years.last().resolve(observed);
				observedWinds.last().reject(error);
			}
			await settle();
			expect(stage.reported).toEqual([error]);
			expect(stage.lastComparison()?.source).toBe('simulated');
			expect(stage.told.at(-1)?.source).toBe('simulated');
			expect(stage.panel.shown()?.source).toBe('simulated');
			expect(stage.panel.shownWinds()?.source).toBe('simulated');
			if (which === 'years') {
				expect(stage.lastComparison()?.message).toBe(OBSERVED_FAILED_TEXT);
				expect(stage.lastKey()?.status).toBeNull();
			} else {
				expect(stage.lastComparison()?.message).toBeNull();
				expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_FAILED_TEXT);
			}
		},
	);

	it('goes back to Simulated and offers nothing off the measured Earth, and offers the control again on Simulated', async () => {
		const { stage, years, observedWinds, observed, windsObserved } =
			createSourceStage('temperature', true);
		stage.panel.setSource('observed');
		years.last().resolve(observed);
		observedWinds.last().resolve(windsObserved);
		await settle();
		stage.panel.setEarth(null);
		expect(stage.lastComparison()).toEqual({
			offered: [],
			source: 'simulated',
			message: null,
		});
		expect(stage.panel.shown()?.source).toBe('simulated');
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
		stage.panel.setEarth(64);
		expect(stage.lastComparison()).toEqual({
			offered: SOURCES,
			source: 'simulated',
			message: null,
		});
	});
});

describe('createLayerPanel, the units', () => {
	const IMPERIAL = SYSTEM_UNITS.imperial;
	const KELVIN = { ...SYSTEM_UNITS.metric, temperature: 'K' } as const;
	const month = summaryOf(TEMPERATURE_LAYER, 'month');

	it('starts in the units given: the scale fitted in them, the caption and ticks in them, the globe on the same values', () => {
		const stage = createStage({ units: IMPERIAL });
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		// −30 to 21 °C is −22 to 69.8 °F, rounded out to whole degrees.
		const fahrenheit = { min: -22, max: 70 };
		expect(
			fitSummaryScale(TEMPERATURE_LAYER, month, [result], DEFAULT_MONTH, '°F'),
		).toEqual(fahrenheit);
		expect(stage.shown.at(-1)?.range).toEqual(
			metricRange(TEMPERATURE_LAYER, '°F', fahrenheit, false),
		);
		const scale = stage.lastLegend()?.scale;
		expect(scale?.caption).toBe('Air temperature in July, °F');
		expect(tickLabels(stage.lastLegend())).toEqual([
			'−20',
			'0',
			'20',
			'40',
			'60',
		]);
		expect(stage.panel.shown()?.field).toBe(result.months[DEFAULT_MONTH]);
	});

	it('draws the seasonal range in °F on the values the ends of its legend convert back to, by the scale alone', () => {
		const stage = createStage({ units: IMPERIAL });
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setSummary('temperature', 'range');
		const range = summaryOf(TEMPERATURE_LAYER, 'range');
		// Each cell's range is 11 °C, 19.8 °F, rounded up to 20 °F.
		const fahrenheit = { min: 0, max: 20 };
		expect(
			fitSummaryScale(TEMPERATURE_LAYER, range, [result], 'range', '°F'),
		).toEqual(fahrenheit);
		const ticks = stage.lastLegend()?.scale?.ticks ?? [];
		expect(ticks.at(0)).toEqual({ label: '0', position: 0 });
		expect(ticks.at(-1)).toEqual({ label: '20', position: 100 });
		const globe = stage.shown.at(-1)?.range;
		expect(globe).toEqual(
			metricRange(TEMPERATURE_LAYER, '°F', fahrenheit, isDifferenceView(range)),
		);
		expect(globe?.min).toBe(0);
		expect(globe?.max).toBeCloseTo(100 / 9, 12);
		expect(
			toLayerUnit(TEMPERATURE_LAYER, '°F', globe?.max ?? Number.NaN, true),
		).toBeCloseTo(fahrenheit.max, 12);
	});

	it('writes the legend again in new units at once, with no new calculation', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const legends = stage.legends.length;
		const sent = stage.shown.length;
		stage.panel.setUnits(KELVIN);
		expect(stage.store.temperature.result).toBe(result);
		expect(stage.store.temperature.status).toBe('current');
		expect(stage.legends).toHaveLength(legends + 1);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in July, K',
		);
		expect(tickLabels(stage.lastLegend())).toEqual([
			'250',
			'260',
			'270',
			'280',
			'290',
		]);
		// 243.15 to 294.15 K, rounded out to 243 and 295: the ends move, so
		// the globe is given the same field on the range they cover.
		expect(stage.shown).toHaveLength(sent + 1);
		expect(stage.shown.at(-1)?.field).toBe(result.months[DEFAULT_MONTH]);
		const kelvin = stage.shown.at(-1)?.range as ValueRange;
		expect(kelvin.min).toBeCloseTo(-30.15, 9);
		expect(kelvin.max).toBeCloseTo(21.85, 9);
		// Back in °C, as before.
		stage.panel.setUnits(SYSTEM_UNITS.metric);
		expect(stage.shown.at(-1)?.range).toEqual({ min: -30, max: 21 });
		expect(tickLabels(stage.lastLegend())).toEqual([
			'−30',
			'−20',
			'−10',
			'0',
			'10',
			'20',
		]);
	});

	it('changes nothing for units that change no layer’s', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		const legends = stage.legends.length;
		const sent = stage.shown.length;
		stage.panel.setUnits({
			...SYSTEM_UNITS.metric,
			windSpeed: 'knots',
			height: 'ft',
		});
		expect(stage.legends).toHaveLength(legends);
		expect(stage.shown).toHaveLength(sent);
	});

	it('gives the globe no field again where the ends rounded in the new unit cover the same values', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		// 0 and 10 °C are 32 and 50 °F, whole in both.
		stage.arrive(resultSpanning(0, 10));
		const sent = stage.shown.length;
		stage.panel.setUnits(IMPERIAL);
		expect(stage.shown.at(-1)?.range).toEqual({ min: 0, max: 10 });
		expect(stage.shown).toHaveLength(sent);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in July, °F',
		);
		expect(tickLabels(stage.lastLegend())).toEqual(['35', '40', '45', '50']);
	});

	it('fits the seasonal range from zero in °F by the scale alone, marked every 10', () => {
		const stage = createStage({ units: IMPERIAL });
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'range');
		// Each cell's range of the seasons is 11 °C, 19.8 °F.
		stage.arrive(resultWith());
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Seasonal range: difference between the warmest and coldest months, °F',
		);
		expect(tickLabels(stage.lastLegend())).toEqual(['0', '10', '20']);
		expect(stage.shown.at(-1)?.range).toEqual({ min: 0, max: 20 / 1.8 });
	});

	it('draws the difference on a scale symmetric about zero in the unit, with its own reach and step, and figures in it', async () => {
		const { stage, result, observed, grid, choose } = createEarthStage();
		await choose('difference');
		const figures = compareField(
			result.months[DEFAULT_MONTH] as Float32Array,
			observed[DEFAULT_MONTH] as Float32Array,
			grid,
		);
		const cases = [
			[IMPERIAL, '°F', 40, ['−40', '−20', '0', '20', '40'], 1.8],
			[KELVIN, 'K', 20, ['−20', '−10', '0', '10', '20'], 1],
			[SYSTEM_UNITS.metric, '°C', 20, ['−20', '−10', '0', '10', '20'], 1],
		] as const;
		for (const [units, label, halfSpan, ticks, scale] of cases) {
			stage.panel.setUnits(units);
			const range = stage.shown.at(-1)?.range as ValueRange;
			expect(range.min, label).toBeCloseTo(-halfSpan / scale, 12);
			expect(range.max, label).toBeCloseTo(halfSpan / scale, 12);
			expect(range.min).toBe(-range.max);
			const legend = stage.lastLegend();
			expect(legend?.scale?.caption).toBe(
				`Simulated less observed in July, ${label}`,
			);
			expect(tickLabels(legend), label).toEqual(ticks);
			expect(legend?.scale?.figures, label).toBe(
				formatFigures(
					{
						meanDifference: figures.meanDifference * scale,
						rmsDifference: figures.rmsDifference * scale,
					},
					label,
				),
			);
		}
	});
});

describe('createLayerPanel, the pressure in inHg', () => {
	it('fits the pressure about its mean in inHg, to ends and ticks of two decimals', () => {
		const stage = createStage({ units: SYSTEM_UNITS.imperial });
		stage.panel.setLayer('pressure');
		stage.store.markWindsCalculating();
		stage.store.setWindsResult(pressureWinds(), true);
		// The months run from 1000 to 1031 hPa about a mean of 1015.5:
		// 29.53 to 30.44 inHg about 29.99.
		const legend = stage.lastLegend();
		expect(legend?.scale?.caption).toBe('Sea-level pressure in July, inHg');
		const labels = tickLabels(legend) ?? [];
		expect(labels.length).toBeGreaterThanOrEqual(2);
		expect(
			labels.every((label) => /^\d\d\.\d\d$/.test(label)),
			`${labels}`,
		).toBe(true);
		const range = stage.shown.at(-1)?.range as ValueRange;
		expect(range.min).toBeLessThanOrEqual(1000);
		expect(range.max).toBeGreaterThanOrEqual(1031);
	});

	it('draws the pressure’s difference ±0.6 inHg, marked every 0.3', async () => {
		const stage = createStage({ units: SYSTEM_UNITS.imperial });
		const deferred = createDeferredLoader();
		stage.setLoader(deferred.loader);
		stage.panel.setLayer('pressure');
		stage.panel.newWorld(64);
		const cells = getGrid(64).cellCount;
		const solved = pressureWinds();
		const months = solved.winds.pressure.map((month) =>
			new Float32Array(cells).fill(month[0] as number),
		);
		stage.store.markWindsCalculating();
		stage.store.setWindsResult(
			{ ...solved, winds: { ...solved.winds, pressure: months } },
			true,
		);
		stage.panel.setSource('difference');
		deferred.last().resolve(months.map((month) => month.map((v) => v - 3)));
		await settle();
		expect(tickLabels(stage.lastLegend())).toEqual([
			'−0.60',
			'−0.30',
			'0.00',
			'0.30',
			'0.60',
		]);
		const range = stage.shown.at(-1)?.range as ValueRange;
		expect(range.max).toBeCloseTo(0.6 * 33.8638866667, 9);
		expect(range.min).toBe(-range.max);
		expect(stage.lastLegend()?.scale?.figures).toBe(
			'Mean +0.089 inHg · RMS 0.089 inHg',
		);
	});
});
