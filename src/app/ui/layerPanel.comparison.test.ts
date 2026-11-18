import { describe, expect, it } from 'vitest';
import {
	compareFields,
	differenceField,
	type FieldDifference,
	getGrid,
	type MonthlyWind,
	summariseTemperature,
} from '../../core/index';
import { temperatureOf } from '../../core/testing/temperatureFixtures';
import {
	DIFFERENCE_RAMP,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from '../globe/ramp';
import type { SolvedWinds } from '../layers/layers';
import {
	OBSERVED_FAILED_TEXT,
	OBSERVED_LOADING_TEXT,
	OBSERVED_PRESSURE_FAILED_TEXT,
	OBSERVED_PRESSURE_LOADING_TEXT,
	PRESSURE_LAYER,
} from '../layers/scalar';
import { cellWeights, fitRange, fitRangeFromZero } from '../layers/scalar/fit';
import {
	DEFAULT_MONTH,
	type Layer,
	SOURCES,
	WIND_SOURCES,
} from '../layers/view';
import { answerWinds, climateOf } from '../testing/climateStore';
import {
	createDeferredLoader,
	createEarthStage,
	createStage,
	figuresText,
	observedFor,
	resultOnGrid,
	resultWith,
	tickLabels,
	yearRange,
} from '../testing/layerPanelStage';
import { settle } from '../testing/settle';
import type { LayerPanel } from './layerPanel';
import {
	formatFigures,
	LEGEND_CALCULATING_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
} from './main/legend';
import {
	OBSERVED_WINDS_FAILED_TEXT,
	OBSERVED_WINDS_LOADING_TEXT,
} from './main/windKey';

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
		stage.store.markClimateCalculating();
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
		stage.store.markClimateCalculating();
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
		stage.store.markClimateCalculating();
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
		stage.store.setClimateResult(climateOf(next), true);
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
		answerWinds(stage.store, solved, true);
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
