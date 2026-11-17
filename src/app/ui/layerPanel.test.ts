import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGrid, summariseWinds } from '../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../core/testing/temperatureFixtures';
import { rampGradient, TEMPERATURE_RAMP } from '../globe/ramp';
import {
	createLayerStore,
	type LayerStore,
	type SolvedWinds,
} from '../layers/layers';
import {
	layerCaption,
	TEMPERATURE_LAYER,
	TEMPERATURE_NOT_SHOWN_TEXT,
	TEMPERATURE_UNAVAILABLE_TEXT,
} from '../layers/scalar';
import { cellWeights, fitRange, fitRangeCentred } from '../layers/scalar/fit';
import {
	DEFAULT_MONTH,
	DEFAULT_PAGE_VIEW,
	DEFAULT_SOURCE,
	DEFAULT_SUMMARY,
	type Layer,
	type PageView,
	SOURCES,
	type StoredView,
	WIND_SOURCES,
} from '../layers/view';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { createFakeTimers } from '../testing/fakeTimers';
import {
	createStage,
	resultOnGrid,
	resultSpanning,
	resultWith,
	type Shown,
	solvedWinds,
	tickLabels,
	yearRange,
} from '../testing/layerPanelStage';
import { SEVEN_STOP_RAMP } from '../testing/rampFixtures';
import {
	MADE_UP_ID,
	MADE_UP_LAYER,
	pressureWinds,
	weightedMean,
} from '../testing/scalarLayerFixtures';
import { createLayerPanel } from './layerPanel';
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
	LEGEND_CALCULATING_TEXT,
	LEGEND_EMPTY_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
	type LegendContent,
	legendContent,
} from './main/legend';
import { WINDS_CALCULATING_TEXT } from './main/windKey';

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
