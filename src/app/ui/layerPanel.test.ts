import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	compareField,
	compareFields,
	differenceField,
	type FieldDifference,
	getGrid,
	type MonthlyTemperature,
	summariseTemperature,
	type TemperatureResult,
} from '../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../core/testing/temperatureFixtures';
import {
	type ColourRamp,
	DIFFERENCE_RAMP,
	rampGradient,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
	type ValueRange,
} from '../globe/ramp';
import { createLayerStore, type LayerStore } from '../layers';
import type { ObservedLoader } from '../observedData';
import { PLAYBACK_STEP_MS } from '../playback';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { createFakeTimers } from '../testing/fakeTimers';
import { settle } from '../testing/settle';
import {
	DEFAULT_MONTH,
	DEFAULT_PAGE_VIEW,
	type PageView,
	type TemperatureSource,
} from '../view';
import type { ComparisonContent } from './comparison';
import {
	createLayerControls,
	createLayerPanel,
	type LayerControlsOptions,
	type LayerPanel,
	OBSERVED_FAILED_TEXT,
	OBSERVED_LOADING_TEXT,
	SEASONAL_RANGE_TICK_STEP,
	temperatureCaption,
} from './layerPanel';
import {
	cellWeights,
	FIT_TAIL_SHARE,
	fitRange,
	fitRangeFromZero,
	formatFigures,
	formatTick,
	LEGEND_EMPTY_TEXT,
	LEGEND_FIRST_YEAR_TEXT,
	LEGEND_NOT_SHOWN_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
	LEGEND_UNAVAILABLE_TEXT,
	type LegendContent,
} from './legend';

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
	fitRange(result.months, cellWeights(result.months[0]?.length ?? 0)).range;

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

/** The layer panel on a real store, with stand-ins for everything else. */
const createStage = () => {
	const errors: unknown[] = [];
	/** What the panel reported as errors of its own. */
	const reported: unknown[] = [];
	const store: LayerStore = createLayerStore((error) => errors.push(error));
	const shown: Shown[] = [];
	const showing: boolean[] = [];
	const legends: (LegendContent | null)[] = [];
	/** What the comparison controls were told to show. */
	const comparisons: ComparisonContent[] = [];
	/** The observed temperature's loader, as each test sets it. */
	let loadObserved: ObservedLoader = () =>
		Promise.reject(new Error('The observed temperature is not asked for'));
	/** What the controls were told to show: the view settings and playing. */
	const views: { readonly view: PageView; readonly playing: boolean }[] = [];
	/** What the panel told of the view settings. */
	const told: PageView[] = [];
	const timers = createFakeTimers();
	let controls: LayerControlsOptions | undefined;
	/** What the globe throws when next asked to show something, if anything. */
	let failure: Error | null = null;
	/** What reporting an error throws, once it has taken the error, if anything. */
	let reportFailure: Error | null = null;
	const panel: LayerPanel = createLayerPanel({
		store,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		onView: (view) => told.push(view),
		loadObserved: (resolution) => loadObserved(resolution),
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
		},
		temperature: { setShowing: (next) => showing.push(next) },
		createControls: (options) => {
			controls = options;
			return {
				showLegend: (content) => legends.push(content),
				showView: (view, playing) => views.push({ view, playing }),
				showComparison: (content) => comparisons.push(content),
			};
		},
	});
	const required = (): LayerControlsOptions => {
		if (controls === undefined) {
			throw new Error('The panel made no controls');
		}
		return controls;
	};
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
		showing,
		legends,
		comparisons,
		views,
		told,
		timers,
		panel,
		get controls() {
			return required();
		},
		arrive,
		lastLegend: () => legends.at(-1),
		/** What the controls were last told to show. */
		lastView: () => views.at(-1),
		/** Has the globe throw this the next time it is asked to show something. */
		failNext: (error: Error): void => {
			failure = error;
		},
		/** Has the observed temperature come from this loader from now on. */
		setLoader: (loader: ObservedLoader): void => {
			loadObserved = loader;
		},
		/** What the comparison controls were last told to show. */
		lastComparison: () => comparisons.at(-1),
		/** Has every report of an error throw this, once the error is taken. */
		failReports: (error: Error): void => {
			reportFailure = error;
		},
	};
};

describe('createLayerPanel', () => {
	it('opens on the terrain, asking nothing of the globe or the temperature', () => {
		const stage = createStage();
		expect(stage.controls.view).toEqual(DEFAULT_PAGE_VIEW);
		expect(stage.shown).toEqual([]);
		expect(stage.showing).toEqual([]);
		expect(stage.legends).toEqual([null]);
	});

	it('leaves the globe on the terrain while a result arrives in Terrain view', () => {
		const stage = createStage();
		stage.arrive(resultWith());
		expect(stage.shown).toEqual([]);
		expect(stage.legends.every((legend) => legend === null)).toBe(true);
	});

	it('switches the temperature on when chosen, and says nothing is there yet', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		expect(stage.showing).toEqual([true]);
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
	});

	it("shows July's field once a result arrives, on the year's fitted range and the ramp", () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
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
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.controls.onLayer('terrain');
		stage.controls.onLayer('temperature');
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
			null,
			result.months[DEFAULT_MONTH],
		]);
		expect(stage.shown[2]?.field).toBe(result.months[DEFAULT_MONTH]);
		expect(stage.showing).toEqual([true, false, true]);
	});

	it('goes back to the height colours and switches the temperature off for Terrain', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.controls.onLayer('terrain');
		expect(stage.shown.at(-1)).toEqual({
			field: null,
			range: undefined,
			ramp: undefined,
		});
		expect(stage.showing).toEqual([true, false]);
		expect(stage.lastLegend()).toBeNull();
	});

	it('asks nothing for a layer chosen again that is already on show', () => {
		const stage = createStage();
		stage.controls.onLayer('terrain');
		stage.controls.onLayer('temperature');
		stage.controls.onLayer('temperature');
		expect(stage.showing).toEqual([true]);
	});

	it('sends each new result to the globe, on its own range', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		const next = resultWith(5);
		stage.arrive(next);
		expect(stage.shown).toHaveLength(2);
		expect(stage.shown[1]?.field).toBe(next.months[DEFAULT_MONTH]);
		expect(stage.shown[1]?.range).toEqual({ min: -25, max: 26 });
	});

	it('keeps the previous field on the globe while it is out of date or calculated again', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
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
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.store.clear();
		expect(stage.shown.at(-1)?.field).toBeNull();
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
		// The choice is kept: the new world's result is shown when it comes.
		const next = resultWith(1);
		stage.arrive(next);
		expect(stage.shown.at(-1)?.field).toBe(next.months[DEFAULT_MONTH]);
		expect(stage.showing).toEqual([true]);
	});

	it('fits a result afresh that comes again after the store dropped it', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
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
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.store.markUnavailable();
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
		]);
		expect(stage.lastLegend()?.status).toBe(LEGEND_UNAVAILABLE_TEXT);
		expect(stage.lastLegend()?.scale).not.toBeNull();
	});

	it('says the temperature is unavailable with no result, leaving the terrain', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.store.markUnavailable();
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_UNAVAILABLE_TEXT,
			bar: null,
		});
	});

	it('records what the globe throws, still updates the legend, and shows the next result', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const failure = new RangeError('The field is not one value per cell');
		stage.failNext(failure);
		stage.arrive(resultWith());
		expect(stage.errors).toEqual([failure]);
		// The globe was left on the terrain, so the legend has no scale, and
		// it says the temperature could not be shown, not that it is still
		// being calculated.
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()?.status).toBe(LEGEND_NOT_SHOWN_TEXT);
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
		stage.controls.onLayer('temperature');
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
		stage.controls.onLayer('temperature');
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
		stage.controls.onLayer('temperature');
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
		stage.controls.onLayer('terrain');
		stage.controls.onLayer('temperature');
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
		stage.controls.onLayer('temperature');
		stage.failNext(new RangeError('Refused once'));
		stage.store.markCalculating();
		stage.store.setResult(resultSpanning(-10, 10), false);
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_OUT_OF_DATE_TEXT,
			bar: null,
		});
	});

	it('says a current first result the globe refused could not be shown, until it takes one', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.failNext(new RangeError('Refused once'));
		stage.arrive(resultSpanning(-10, 10));
		expect(stage.store.temperature.status).toBe('current');
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_NOT_SHOWN_TEXT,
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
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.store.markOutOfDate();
		stage.store.clear();
		expect(stage.errors).toEqual([]);
	});

	it("fits the year's scale to the middle 99% of a real grid by area, saying what lies beyond", () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultOnGrid();
		stage.arrive(result);
		// By area the cold cells and the hot one are left out; counted by
		// cell-months, the cold cells would take the scale below zero.
		expect(stage.shown.at(-1)?.range).toEqual({ min: 10, max: 54 });
		const evenly = new Float64Array(getGrid(64).cellCount).fill(1);
		expect(fitRange(result.months, evenly).range.min).toBe(-16);
		const legend = stage.lastLegend();
		expect(legend?.scale?.below).toBe('10 and below');
		expect(legend?.scale?.above).toBe('54 and above');
	});

	it('fits the year once per result, on one scale through every month, summary and change of status', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultOnGrid();
		stage.arrive(result);
		const scale = stage.shown.at(-1)?.range;
		stage.store.markOutOfDate();
		stage.store.markCalculating();
		stage.store.setProgress(progressOf(1));
		stage.controls.onMonth(0);
		for (const view of ['annualMean', 'warmest', 'coldest'] as const) {
			stage.controls.onTemperatureView(view);
			expect(stage.shown.at(-1)?.range).toBe(scale);
			// The warmest and coldest months hold values beyond the scale
			// too, which take its end colours, and the legend says so.
			expect(stage.lastLegend()?.scale?.below).toBe('10 and below');
			expect(stage.lastLegend()?.scale?.above).toBe('54 and above');
		}
		stage.controls.onTemperatureView('month');
		expect(stage.shown.every((shown) => shown.range === scale)).toBe(true);
		// A new result is fitted afresh.
		stage.arrive(resultOnGrid());
		expect(stage.shown.at(-1)?.range).not.toBe(scale);
	});

	it('captions the legend with the month on screen', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in July, °C',
		);
		stage.controls.onMonth(0);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in January, °C',
		);
	});
});

describe('createLayerPanel, the month', () => {
	it('shows the month the slider is moved to, on the same scale as July', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const ticks = tickLabels(stage.lastLegend());
		stage.controls.onMonth(0);
		stage.controls.onMonth(11);
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
			temperatureView: 'month',
			source: 'simulated',
			month: 11,
		});
	});

	it('asks nothing for the month already on screen', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		const told = stage.told.length;
		stage.controls.onMonth(DEFAULT_MONTH);
		expect(stage.shown).toHaveLength(1);
		expect(stage.told).toHaveLength(told);
	});

	it('keeps the month across a switch to the terrain and back', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.controls.onMonth(2);
		stage.controls.onLayer('terrain');
		stage.controls.onLayer('temperature');
		expect(stage.shown.at(-1)?.field).toBe(result.months[2]);
	});

	it('keeps the month and the view for a new result, as after an edit', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.controls.onMonth(2);
		const next = resultWith(5);
		stage.arrive(next);
		expect(stage.shown.at(-1)?.field).toBe(next.months[2]);
		expect(stage.lastView()?.view.month).toBe(2);
	});

	it('puts July back on screen and stops playing for a new world, keeping the view', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.controls.onMonth(2);
		stage.controls.onPlay();
		stage.panel.newWorld(null);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				temperatureView: 'month',
				source: 'simulated',
				month: 6,
			},
			playing: false,
		});
		expect(stage.told.at(-1)?.month).toBe(DEFAULT_MONTH);
		expect(stage.shown.at(-1)?.field).toBe(result.months[DEFAULT_MONTH]);
		expect(stage.timers.pending()).toBe(0);
	});

	it('stops playing for a new world on July, sending nothing more', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.controls.onPlay();
		const shown = stage.shown.length;
		stage.panel.newWorld(null);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				temperatureView: 'month',
				source: 'simulated',
				month: 6,
			},
			playing: false,
		});
		expect(stage.shown).toHaveLength(shown);
	});

	it('keeps a summary chosen when a new world puts July back', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.controls.onTemperatureView('range');
		stage.controls.onMonth(2);
		stage.panel.newWorld(null);
		expect(stage.lastView()?.view).toEqual({
			layer: 'temperature',
			temperatureView: 'range',
			source: 'simulated',
			month: DEFAULT_MONTH,
		});
	});
});

describe('createLayerPanel, playing the year', () => {
	/** A stage in the Month view with a result on show, playing from a month. */
	const playingFrom = (month: number) => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.controls.onMonth(month);
		stage.controls.onPlay();
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
				temperatureView: 'month',
				source: 'simulated',
				month: 7,
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
		stage.controls.onPlay();
		expect(stage.lastView()?.playing).toBe(false);
		const shown = stage.shown.length;
		stage.timers.advance(5 * PLAYBACK_STEP_MS);
		expect(stage.shown).toHaveLength(shown);
		expect(stage.lastView()?.view.month).toBe(DEFAULT_MONTH);
	});

	it('stops when the view leaves the Month view', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		stage.controls.onTemperatureView('annualMean');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
		stage.controls.onTemperatureView('month');
		expect(stage.lastView()?.playing).toBe(false);
	});

	it('stops when the layer leaves Temperature', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		stage.controls.onLayer('terrain');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.lastView()?.view.month).toBe(DEFAULT_MONTH);
		stage.controls.onLayer('temperature');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
	});

	it('keeps playing when the Month view is chosen again', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		const views = stage.views.length;
		stage.controls.onTemperatureView('month');
		expect(stage.views).toHaveLength(views);
		expect(stage.timers.pending()).toBe(1);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[7]);
		expect(stage.lastView()?.playing).toBe(true);
	});

	it('carries on from a month the slider is moved to, a whole step later', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		stage.timers.advance(PLAYBACK_STEP_MS - 10);
		stage.controls.onMonth(3);
		expect(stage.shown.at(-1)?.field).toBe(result.months[3]);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				temperatureView: 'month',
				source: 'simulated',
				month: 3,
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
				temperatureView: 'month',
				source: 'simulated',
				month: 7,
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
				temperatureView: 'month',
				source: 'simulated',
				month: 7,
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
		expect(() => stage.controls.onMonth(3)).toThrow(failure);
		expect(stage.reported).toEqual([]);
		expect(stage.lastView()?.playing).toBe(true);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[4]);
	});

	it('moves the month on before there is a result, and shows it once there is', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.controls.onPlay();
		stage.timers.advance(2 * PLAYBACK_STEP_MS);
		expect(stage.shown).toEqual([]);
		const result = resultWith();
		stage.arrive(result);
		expect(stage.shown.at(-1)?.field).toBe(result.months[8]);
	});
});

describe('createLayerPanel, the summaries', () => {
	it.each([
		['annualMean', 'Annual average air temperature, °C'],
		['warmest', 'Air temperature in the warmest month, °C'],
		['coldest', 'Air temperature in the coldest month, °C'],
	] as const)("shows the %s on the year's scale and ramp", (view, caption) => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.controls.onTemperatureView(view);
		const summary = summariseTemperature(result.months);
		const last = stage.shown.at(-1);
		expect(last?.field).toEqual(summary[view]);
		expect(last?.range).toBe(stage.shown[0]?.range);
		expect(last?.range).toEqual(yearRange(result));
		expect(last?.ramp).toBe(TEMPERATURE_RAMP);
		expect(stage.lastLegend()?.scale?.caption).toBe(caption);
		expect(temperatureCaption(view, 0)).toBe(caption);
		expect(stage.told.at(-1)?.temperatureView).toBe(view);
	});

	it('gives the expected values for each summary', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		const fieldFor = (
			view: Parameters<typeof stage.controls.onTemperatureView>[0],
		) => {
			stage.controls.onTemperatureView(view);
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
		stage.controls.onLayer('temperature');
		const result = resultWith();
		result.months[0]?.set([-40.5, 10]);
		stage.arrive(result);
		stage.controls.onTemperatureView('range');
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
		stage.controls.onTemperatureView('month');
		expect(stage.shown.at(-1)?.range).toEqual(yearRange(result));
		expect(stage.shown.at(-1)?.ramp).toBe(TEMPERATURE_RAMP);
	});

	it('marks the seasonal range every 5 degrees, with no words at its ends', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultOnGrid());
		expect(stage.lastLegend()?.scale?.below).not.toBeNull();
		stage.controls.onTemperatureView('range');
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
		expect(legend?.scale?.below).toBeNull();
		expect(legend?.scale?.above).toBeNull();
	});

	it('asks nothing for the temperature view already chosen', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.controls.onTemperatureView('range');
		const counts = () => [
			stage.shown.length,
			stage.views.length,
			stage.told.length,
			stage.legends.length,
		];
		const before = counts();
		stage.controls.onTemperatureView('range');
		expect(counts()).toEqual(before);
	});

	it('works each summary out once per result, giving the same arrays again', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.controls.onTemperatureView('annualMean');
		const mean = stage.shown.at(-1)?.field;
		const sent = stage.shown.length;
		stage.store.markOutOfDate();
		stage.store.markCalculating();
		stage.store.setProgress(progressOf(1));
		expect(stage.shown).toHaveLength(sent);
		stage.controls.onTemperatureView('range');
		const range = stage.shown.at(-1)?.field;
		const rangeScale = stage.shown.at(-1)?.range;
		stage.controls.onTemperatureView('annualMean');
		expect(stage.shown.at(-1)?.field).toBe(mean);
		stage.controls.onTemperatureView('range');
		expect(stage.shown.at(-1)?.field).toBe(range);
		expect(stage.shown.at(-1)?.range).toBe(rangeScale);
		// A new result has summaries of its own.
		stage.arrive(resultWith(5));
		expect(stage.shown.at(-1)?.field).not.toBe(range);
		expect(Array.from(stage.shown.at(-1)?.field ?? [])).toEqual([11, 11]);
	});

	it('works the summaries out afresh for a result that comes again after the store dropped it', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.controls.onTemperatureView('annualMean');
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
		stage.controls.onLayer('temperature');
		stage.controls.onTemperatureView('range');
		stage.arrive(resultWith());
		stage.store.clear();
		expect(stage.shown.at(-1)?.field).toBeNull();
		expect(stage.lastLegend()?.scale).toBeNull();
	});

	it('says a seasonal range the globe refused could not be shown, and sends it at the next change', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.controls.onTemperatureView('range');
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		const result = resultWith();
		stage.arrive(result);
		expect(stage.errors).toEqual([failure]);
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_NOT_SHOWN_TEXT,
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
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		// From a control, the error reaches whoever made the choice.
		expect(() => stage.controls.onTemperatureView('range')).toThrow(failure);
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
		]);
		const legend = stage.lastLegend();
		expect(legend?.scale?.caption).toBe('Air temperature in July, °C');
		expect(legend?.scale?.gradient).toBe(rampGradient(TEMPERATURE_RAMP));
		expect(legend?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		// The view is chosen all the same, and its field sent at the next
		// change.
		expect(stage.lastView()?.view.temperatureView).toBe('range');
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
		stage.controls.onLayer('temperature');
		stage.store.clear();
		expect(stage.panel.shown()).toBeNull();
		stage.store.markCalculating();
		expect(stage.panel.shown()).toBeNull();
	});

	it('gives the field the globe was last given, with its month, current', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const shown = stage.panel.shown();
		expect(shown).toEqual({
			field: result.months[DEFAULT_MONTH],
			view: 'month',
			month: DEFAULT_MONTH,
			source: 'simulated',
			current: true,
		});
		expect(shown?.field).toBe(stage.shown.at(-1)?.field);

		stage.controls.onMonth(2);
		expect(stage.panel.shown()?.month).toBe(2);
		expect(stage.panel.shown()?.field).toBe(result.months[2]);
	});

	it('names the summary on show, with the array sent to the globe', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		for (const view of ['annualMean', 'warmest', 'coldest', 'range'] as const) {
			stage.controls.onTemperatureView(view);
			expect(stage.panel.shown()?.view).toBe(view);
			expect(stage.panel.shown()?.field).toBe(stage.shown.at(-1)?.field);
			expect(stage.panel.shown()?.current).toBe(true);
		}
	});

	it('is not current while the result is out of date, calculated again or no longer calculable', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
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
		expect(stage.lastLegend()?.status).toBe(LEGEND_UNAVAILABLE_TEXT);
		expect(stage.panel.shown()).toMatchObject({ field, current: false });
	});

	it('keeps the earlier field and its month, not current, while the globe refuses the one chosen', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const first = resultWith();
		stage.arrive(first);

		stage.failNext(new RangeError('Refused once'));
		const second = resultWith(5);
		stage.store.markCalculating();
		stage.store.setResult(second, true);
		expect(stage.store.temperature.status).toBe('current');
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shown()).toEqual({
			field: first.months[DEFAULT_MONTH],
			view: 'month',
			month: DEFAULT_MONTH,
			source: 'simulated',
			current: false,
		});

		stage.failNext(new RangeError('Refused again'));
		expect(() => stage.controls.onMonth(0)).toThrow('Refused again');
		expect(stage.panel.shown()).toMatchObject({
			field: first.months[DEFAULT_MONTH],
			month: DEFAULT_MONTH,
			current: false,
		});

		stage.controls.onMonth(1);
		expect(stage.panel.shown()).toEqual({
			field: second.months[1],
			view: 'month',
			month: 1,
			source: 'simulated',
			current: true,
		});
	});

	it('shows nothing again once the globe is back on the height colours', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.controls.onLayer('terrain');
		expect(stage.panel.shown()).toBeNull();
		stage.controls.onLayer('temperature');
		expect(stage.panel.shown()).not.toBeNull();
		stage.store.clear();
		expect(stage.panel.shown()).toBeNull();
	});
});

/** A loader of the observed temperature that answers when a test says. */
const createDeferredLoader = () => {
	const calls: {
		readonly resolution: number;
		resolve(months: MonthlyTemperature): void;
		reject(error: unknown): void;
	}[] = [];
	const loader: ObservedLoader = (resolution) =>
		new Promise((resolve, reject) => {
			calls.push({ resolution, resolve, reject });
		});
	/** The call made last, which must have been made. */
	const last = () => {
		const call = calls.at(-1);
		if (call === undefined) {
			throw new Error('The observed temperature was not asked for');
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
	stage.controls.onLayer('temperature');
	stage.panel.newWorld(64);
	const result = resultOnGrid();
	stage.arrive(result);
	const observed = observedFor(result);
	const grid = getGrid(64);
	/** Chooses a source and has the observed temperature arrive. */
	const choose = async (source: TemperatureSource): Promise<void> => {
		const before = deferred.calls.length;
		stage.controls.onSource(source);
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
): string => formatFigures(compareField(a, b, grid));

describe('createLayerPanel, the comparison', () => {
	it('is offered only in Temperature view on the measured Earth', () => {
		const stage = createStage();
		// The controls start hidden, and are told nothing until it changes.
		expect(stage.lastComparison()).toBeUndefined();
		stage.panel.setEarth(64);
		// Terrain view: not offered.
		expect(stage.lastComparison()?.offered).toBe(false);
		stage.controls.onLayer('temperature');
		expect(stage.lastComparison()).toEqual({
			offered: true,
			source: 'simulated',
			message: null,
		});
		stage.controls.onLayer('terrain');
		expect(stage.lastComparison()?.offered).toBe(false);
		stage.controls.onLayer('temperature');
		stage.panel.setEarth(null);
		expect(stage.lastComparison()?.offered).toBe(false);
		stage.panel.newWorld(64);
		expect(stage.lastComparison()?.offered).toBe(true);
		stage.panel.newWorld(null);
		expect(stage.lastComparison()?.offered).toBe(false);
	});

	it('names no source in the caption until it is offered, and the source from then on', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
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
		stage.controls.onSource('observed');
		expect(deferred.calls).toHaveLength(0);
		expect(stage.lastComparison()?.source).toBe('simulated');
		expect(stage.told.at(-1)?.source).toBe('simulated');
		expect(stage.told.length).toBe(told + 1);
	});

	it('asks for the observed temperature once, and keeps the simulated on the globe until it arrives', async () => {
		const { stage, deferred, result, observed } = createEarthStage();
		const sent = stage.shown.length;
		stage.controls.onSource('observed');
		expect(deferred.calls.map((call) => call.resolution)).toEqual([64]);
		expect(stage.lastComparison()).toEqual({
			offered: true,
			source: 'observed',
			message: OBSERVED_LOADING_TEXT,
		});
		expect(stage.told.at(-1)?.source).toBe('observed');
		expect(stage.shown).toHaveLength(sent);
		expect(stage.panel.shown()?.source).toBe('simulated');
		stage.controls.onSource('difference');
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
		stage.controls.onSource('observed');
		expect(stage.shown.at(-1)?.field).toBe(observed[DEFAULT_MONTH]);
		expect(deferred.calls).toHaveLength(1);
	});

	it('keeps saying the observed temperature is loading whatever is chosen until it arrives', async () => {
		const { stage, deferred, result, observed } = createEarthStage();
		stage.controls.onSource('observed');
		stage.controls.onSource('difference');
		expect(stage.lastComparison()).toEqual({
			offered: true,
			source: 'difference',
			message: OBSERVED_LOADING_TEXT,
		});
		stage.controls.onSource('simulated');
		expect(stage.lastComparison()?.message).toBe(OBSERVED_LOADING_TEXT);
		stage.controls.onSource('difference');
		expect(stage.lastComparison()?.message).toBe(OBSERVED_LOADING_TEXT);
		expect(deferred.calls).toHaveLength(1);
		expect(stage.panel.shown()?.source).toBe('simulated');

		deferred.last().resolve(observed);
		await settle();
		expect(stage.lastComparison()).toEqual({
			offered: true,
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
		expect(shared.range).not.toEqual(own);
		const last = stage.shown.at(-1);
		expect(last?.field).toBe(observed[DEFAULT_MONTH]);
		expect(last?.range).toEqual(shared.range);
		expect(last?.ramp).toBe(TEMPERATURE_RAMP);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Observed air temperature in July, °C',
		);
		expect(stage.lastLegend()?.scale?.below).toBe(
			shared.beyond.below ? `${formatTick(shared.range.min)} and below` : null,
		);

		const theirs = summariseTemperature(observed);
		for (const view of ['annualMean', 'warmest', 'coldest'] as const) {
			stage.controls.onTemperatureView(view);
			expect(stage.shown.at(-1)?.field, view).toEqual(theirs[view]);
			expect(stage.shown.at(-1)?.range, view).toEqual(shared.range);
		}
		stage.controls.onTemperatureView('range');
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
		stage.controls.onSource('simulated');
		expect(stage.shown.at(-1)?.range).toEqual(stage.shown.at(-2)?.range);
		stage.controls.onTemperatureView('month');
		expect(stage.shown.at(-1)?.field).toBe(result.months[DEFAULT_MONTH]);
		expect(stage.shown.at(-1)?.range).toEqual(shared.range);
		stage.controls.onMonth(0);
		expect(stage.shown.at(-1)?.range).toEqual(shared.range);
	});

	it('gives the simulated year its own scale again once the world stops being the measured Earth, and the shared one when it is again', async () => {
		const { stage, result, observed, choose } = createEarthStage();
		await choose('observed');
		const shared = fitRange(
			[...result.months, ...observed],
			cellWeights(observed[0]?.length ?? 0),
		).range;
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
			offered: true,
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
		stage.controls.onSource('observed');
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
			expect(scale?.below).toBe('−20 and below');
			expect(scale?.above).toBe('20 and above');
		};
		expectFixed('Simulated less observed in July, °C');
		stage.controls.onMonth(0);
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
			stage.controls.onTemperatureView(view);
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
			stage.controls.onSource(source);
			stage.controls.onTemperatureView('month');
			for (const month of [0, 6, 11]) {
				stage.controls.onMonth(month);
				expect(stage.lastLegend()?.scale?.figures, `${source} ${month}`).toBe(
					formatFigures(months[month] as FieldDifference),
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
				stage.controls.onTemperatureView(view);
				expect(stage.lastLegend()?.scale?.figures, `${source} ${view}`).toBe(
					figuresText(ours[view], theirs[view]),
				);
			}
		}
		// The figures differ by month, so a wrong month would be seen.
		expect(formatFigures(months[0] as FieldDifference)).not.toBe(
			formatFigures(months[11] as FieldDifference),
		);
	});

	it('makes each derived field once for each result, and drops the differences with it', async () => {
		const { stage, choose } = createEarthStage();
		await choose('difference');
		const july = stage.shown.at(-1)?.field;
		stage.controls.onMonth(0);
		const january = stage.shown.at(-1)?.field;
		stage.controls.onMonth(DEFAULT_MONTH);
		expect(stage.shown.at(-1)?.field).toBe(july);
		stage.controls.onTemperatureView('warmest');
		const warmest = stage.shown.at(-1)?.field;
		stage.controls.onTemperatureView('month');
		stage.controls.onTemperatureView('warmest');
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
		stage.controls.onTemperatureView('month');
		expect(stage.shown.at(-1)?.field).not.toBe(july);
		stage.controls.onMonth(0);
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

		stage.controls.onSource('difference');
		expect(stage.lastLegend()?.status).toBe(LEGEND_FIRST_YEAR_TEXT);
		expect(stage.lastLegend()?.bar).not.toBeNull();
		expect(stage.panel.shown()).toMatchObject({
			source: 'difference',
			current: false,
		});
		stage.controls.onSource('simulated');
		expect(stage.lastLegend()?.status).toBe(LEGEND_FIRST_YEAR_TEXT);
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
		stage.controls.onSource('difference');
		expect(stage.lastLegend()?.scale?.figures).not.toBeNull();
		expect(stage.lastLegend()?.status).toBe(LEGEND_FIRST_YEAR_TEXT);
		stage.controls.onSource('simulated');
		expect(stage.lastLegend()?.scale?.figures).not.toBeNull();
		stage.controls.onSource('observed');
		expect(stage.lastLegend()?.scale?.figures).toBeNull();

		const next = resultOnGrid();
		stage.store.setResult(next, true);
		const { months } = compareFields(next.months, observed, grid);
		expect(stage.lastLegend()?.scale?.figures).toBe(
			formatFigures(months[DEFAULT_MONTH] as FieldDifference),
		);
		stage.controls.onTemperatureView('annualMean');
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
		stage.controls.onSource('simulated');
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shown()?.current).toBe(false);
	});

	it('marks the observed temperature out of date only while the globe keeps an earlier field', async () => {
		const { stage, choose } = createEarthStage();
		await choose('observed');
		stage.failNext(new Error('Refused'));
		expect(() => stage.controls.onMonth(0)).toThrow('Refused');
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shown()).toMatchObject({
			source: 'observed',
			month: DEFAULT_MONTH,
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
		stage.controls.onSource('observed');
		deferred.last().reject(error);
		await settle();
		expect(stage.reported).toEqual([error]);
		expect(stage.lastComparison()).toEqual({
			offered: true,
			source: 'simulated',
			message: OBSERVED_FAILED_TEXT,
		});
		expect(OBSERVED_FAILED_TEXT).toBe(
			'Observed temperature could not be loaded',
		);
		expect(stage.told.at(-1)?.source).toBe('simulated');
		// The simulated temperature goes on working.
		expect(stage.panel.shown()?.source).toBe('simulated');
		stage.controls.onMonth(0);
		expect(stage.shown.at(-1)?.field).toBe(result.months[0]);
		expect(stage.shown.at(-1)?.range).toEqual(yearRange(result));
		expect(stage.lastLegend()?.scale?.figures).toBeNull();

		stage.controls.onSource('difference');
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
			stage.controls.onSource('observed');
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
		stage.controls.onSource('observed');
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
		stage.controls.onLayer('temperature');
		stage.panel.newWorld(64);
		stage.controls.onSource('observed');
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
		stage.controls.onSource('simulated');
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

describe('temperatureCaption', () => {
	it('names no source unless given one', () => {
		expect(temperatureCaption('month', 0)).toBe(
			'Air temperature in January, °C',
		);
		expect(temperatureCaption('range', 0)).toBe(
			'Seasonal range: difference between the warmest and coldest months, °C',
		);
	});

	it('names the simulated and the observed source', () => {
		expect(temperatureCaption('annualMean', 0, 'simulated')).toBe(
			'Simulated annual average air temperature, °C',
		);
		expect(temperatureCaption('coldest', 0, 'observed')).toBe(
			'Observed air temperature in the coldest month, °C',
		);
	});

	it('names the difference after what it is a difference of', () => {
		expect(temperatureCaption('month', 6, 'difference')).toBe(
			'Simulated less observed in July, °C',
		);
		expect(temperatureCaption('range', 6, 'difference')).toBe(
			'Simulated less observed, seasonal range, °C',
		);
	});
});

describe('createLayerControls', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (view: Partial<PageView> = {}) => {
		const chosen: string[] = [];
		const panel = fake.createElement('aside');
		const controls = createLayerControls(panel as unknown as HTMLElement, {
			view: { ...DEFAULT_PAGE_VIEW, ...view },
			onLayer: (next) => chosen.push(next),
			onTemperatureView: (next) => chosen.push(next),
			onMonth: (next) => chosen.push(`month ${next}`),
			onPlay: () => chosen.push('play'),
			onSource: (next) => chosen.push(next),
		});
		const [section] = panel.children as [FakeElement];
		const radios = (name: string): FakeElement[] =>
			byClass(section, 'segmented__input').filter(
				(input) => input.name === name,
			);
		return { controls, chosen, section, radios };
	};

	it('adds a Layers section with Terrain chosen and the legend hidden', () => {
		const { section, radios } = make();
		expect(oneByClass(section, 'panel__heading').textContent).toBe('Layers');
		expect(
			radios('layer').map((radio) => [radio.value, radio.checked]),
		).toEqual([
			['terrain', true],
			['temperature', false],
		]);
		expect(
			byClass(section, 'segmented__label').map((label) => label.textContent),
		).toEqual([
			'Terrain',
			'Temperature',
			'Simulated',
			'Observed',
			'Difference',
		]);
		expect(oneByClass(section, 'legend').hidden).toBe(true);
		expect(oneByClass(section, 'temperature-view').hidden).toBe(true);
		expect(oneByClass(section, 'comparison').hidden).toBe(true);
	});

	it('puts the comparison controls under the Show control, above the month, and shows them as told', () => {
		const { controls, chosen, section, radios } = make({
			layer: 'temperature',
		});
		const temperature = oneByClass(section, 'temperature-view');
		expect(temperature.children.map((child) => child.className)).toEqual([
			'field',
			'comparison',
			'month-controls',
		]);
		const comparison = oneByClass(section, 'comparison');
		expect(comparison.hidden).toBe(true);
		controls.showComparison({
			offered: true,
			source: 'observed',
			message: 'm',
		});
		expect(comparison.hidden).toBe(false);
		expect(
			radios('temperature-source').map((radio) => [radio.value, radio.checked]),
		).toEqual([
			['simulated', false],
			['observed', true],
			['difference', false],
		]);
		fake.pick(radios('temperature-source')[2] as FakeElement);
		expect(chosen).toEqual(['difference']);
	});

	it('starts on the layer it is given', () => {
		const { radios } = make({ layer: 'temperature' });
		expect(
			radios('layer').map((radio) => [radio.value, radio.checked]),
		).toEqual([
			['terrain', false],
			['temperature', true],
		]);
	});

	it('passes on the layer chosen', () => {
		const { radios, chosen } = make();
		fake.pick(radios('layer')[1] as FakeElement);
		fake.pick(radios('layer')[0] as FakeElement);
		expect(chosen).toEqual(['temperature', 'terrain']);
	});

	it('shows the legend it is given', () => {
		const { controls, section } = make();
		controls.showLegend({ scale: null, status: 'x', bar: null });
		expect(oneByClass(section, 'legend').hidden).toBe(false);
		controls.showLegend(null);
		expect(oneByClass(section, 'legend').hidden).toBe(true);
	});
	it('shows the temperature controls in Temperature view only', () => {
		const { controls, section } = make();
		const temperature = oneByClass(section, 'temperature-view');
		controls.showView({ ...DEFAULT_PAGE_VIEW, layer: 'temperature' }, false);
		expect(temperature.hidden).toBe(false);
		controls.showView(DEFAULT_PAGE_VIEW, false);
		expect(temperature.hidden).toBe(true);
	});

	it('shows the month controls for the Month view only', () => {
		const { controls, section } = make({ layer: 'temperature' });
		const month = oneByClass(section, 'month-controls');
		expect(month.hidden).toBe(false);
		controls.showView(
			{
				...DEFAULT_PAGE_VIEW,
				layer: 'temperature',
				temperatureView: 'warmest',
			},
			false,
		);
		expect(month.hidden).toBe(true);
	});

	it('offers the five views in a labelled drop-down, on the one given', () => {
		const { section, chosen } = make({
			layer: 'temperature',
			temperatureView: 'coldest',
		});
		const select = oneByClass(section, 'field__select');
		expect(select.tagName).toBe('SELECT');
		const label = byClass(section, 'field__label').find(
			(element) => element.htmlFor === select.id,
		);
		expect(label?.textContent).toBe('Show');
		expect(
			select.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['month', 'Month'],
			['annualMean', 'Annual average'],
			['warmest', 'Warmest month'],
			['coldest', 'Coldest month'],
			['range', 'Seasonal range'],
		]);
		expect(select.value).toBe('coldest');
		select.value = 'range';
		select.fire('change');
		expect(chosen).toEqual(['range']);
	});

	it('offers a twelve-step month slider named by the month', () => {
		const { section, chosen } = make({ layer: 'temperature' });
		const slider = oneByClass(section, 'field__range');
		expect([slider.type, slider.min, slider.max, slider.step]).toEqual([
			'range',
			'0',
			'11',
			'1',
		]);
		expect(slider.value).toBe('6');
		const value = oneByClass(section, 'field__value');
		expect(value.textContent).toBe('July');
		// Not read out as the year plays; the slider says the month.
		expect(value.getAttribute('aria-live')).toBe('off');
		expect(slider.getAttribute('aria-valuetext')).toBe('July');
		slider.value = '0';
		slider.fire('input');
		expect(chosen).toEqual(['month 0']);
		expect(oneByClass(section, 'field__value').textContent).toBe('January');
	});

	it('moves the slider to the month it is told of', () => {
		const { controls, section } = make({ layer: 'temperature' });
		controls.showView(
			{ ...DEFAULT_PAGE_VIEW, layer: 'temperature', month: 11 },
			true,
		);
		const slider = oneByClass(section, 'field__range');
		expect(slider.value).toBe('11');
		expect(slider.getAttribute('aria-valuetext')).toBe('December');
	});

	it('has a play button whose pressed state says whether the year is playing', () => {
		const { controls, section, chosen } = make({ layer: 'temperature' });
		const play = byClass(section, 'button').find(
			(button) => button.textContent === 'Play',
		) as FakeElement;
		expect(play.tagName).toBe('BUTTON');
		expect(play.type).toBe('button');
		expect(play.getAttribute('aria-pressed')).toBe('false');
		play.fire('click');
		expect(chosen).toEqual(['play']);
		controls.showView({ ...DEFAULT_PAGE_VIEW, layer: 'temperature' }, true);
		expect(play.getAttribute('aria-pressed')).toBe('true');
		controls.showView({ ...DEFAULT_PAGE_VIEW, layer: 'temperature' }, false);
		expect(play.getAttribute('aria-pressed')).toBe('false');
	});
});
