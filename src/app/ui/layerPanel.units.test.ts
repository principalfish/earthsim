import { describe, expect, it } from 'vitest';
import {
	compareField,
	differenceField,
	getGrid,
	summariseWinds,
} from '../../core/index';
import { temperatureOf } from '../../core/testing/temperatureFixtures';
import {
	DIFFERENCE_RAMP,
	PRESSURE_RAMP,
	rampGradient,
	type ValueRange,
} from '../globe/ramp';
import type { SolvedWinds } from '../layers/layers';
import {
	fitSummaryScale,
	isDifferenceView,
	metricRange,
	OBSERVED_PRESSURE_FAILED_TEXT,
	OBSERVED_PRESSURE_LOADING_TEXT,
	PRESSURE_LAYER,
	summaryOf,
	TEMPERATURE_LAYER,
	toLayerUnit,
} from '../layers/scalar';
import { cellWeights, fitRangeCentred } from '../layers/scalar/fit';
import { DEFAULT_MONTH, SOURCES } from '../layers/view';
import { SYSTEM_UNITS } from '../settings/units';
import {
	createDeferredLoader,
	createEarthStage,
	createStage,
	resultSpanning,
	resultWith,
	solvedWinds,
	tickLabels,
} from '../testing/layerPanelStage';
import { pressureWinds, weightedMean } from '../testing/scalarLayerFixtures';
import { settle } from '../testing/settle';
import { CALCULATING_WINDS_TEXT } from './main/infoBox';
import {
	formatFigures,
	LEGEND_CALCULATING_TEXT,
	LEGEND_EMPTY_TEXT,
} from './main/legend';

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
