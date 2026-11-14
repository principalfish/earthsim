import { describe, expect, it } from 'vitest';
import { progressOf, temperatureOf } from '../core/testing/temperatureFixtures';
import {
	DIFFERENCE_RAMP,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from './globe/ramp';
import { createLayerStore } from './layers';
import { loadObservedTemperature } from './observedData';
import {
	DIFFERENCE_HALF_SPAN_C,
	DIFFERENCE_TICK_STEP,
	fitSummaryScale,
	formatWhole,
	layerCaption,
	loadLayerObserved,
	offersSummary,
	SCALAR_LAYER_SPECS,
	SCALAR_LAYERS,
	SEASONAL_RANGE_TICK_STEP,
	scalarLayerOf,
	summaryOf,
	TEMPERATURE_LAYER,
	TEMPERATURE_OBSERVED,
	yearField,
	yearSummaries,
} from './scalarLayer';
import {
	MADE_UP_LAYER,
	pressureWinds,
	weightedMean,
} from './testing/scalarLayerFixtures';
import {
	cellWeights,
	fitRange,
	fitRangeCentred,
	NOTHING_BEYOND,
} from './ui/legend';
import {
	DEFAULT_SUMMARY,
	LAYERS,
	SCALAR_LAYER_IDS,
	SUMMARIES,
	SUMMARY_LABELS,
} from './view';

describe('the temperature layer', () => {
	it('is the Temperature, in °C, with the temperature’s wording', () => {
		expect(TEMPERATURE_LAYER.id).toBe('temperature');
		expect(TEMPERATURE_LAYER.label).toBe('Temperature');
		expect(TEMPERATURE_LAYER.unit).toBe('°C');
		expect(TEMPERATURE_LAYER.unavailableText).toBe('Temperature unavailable');
		expect(TEMPERATURE_LAYER.notShownText).toBe(
			'Temperature could not be shown',
		);
		expect(TEMPERATURE_LAYER.yearProgress).toBe(true);
		expect(TEMPERATURE_LAYER.summaryControlId).toBe('temperature-view');
		expect(TEMPERATURE_LAYER.sunlightStyle).toBe('line');
		expect(TEMPERATURE_LAYER.scheduler).toBe('temperature');
		expect(TEMPERATURE_LAYER.minSpan).toBe(2);
	});

	it('offers the five views of the year, by their names, in order', () => {
		expect(
			TEMPERATURE_LAYER.summaries.map(({ id, label }) => [id, label]),
		).toEqual(SUMMARIES.map((id) => [id, SUMMARY_LABELS[id]]));
	});

	it('draws four temperatures on the year’s scale and the range from zero, each in its colours', () => {
		expect(
			TEMPERATURE_LAYER.summaries.map(({ id, ramp, scale, tickStep }) => [
				id,
				ramp,
				scale.kind,
				tickStep,
			]),
		).toEqual([
			['month', TEMPERATURE_RAMP, 'endToEnd', undefined],
			['annualMean', TEMPERATURE_RAMP, 'endToEnd', undefined],
			['warmest', TEMPERATURE_RAMP, 'endToEnd', undefined],
			['coldest', TEMPERATURE_RAMP, 'endToEnd', undefined],
			['range', SEASONAL_RANGE_RAMP, 'fromZero', SEASONAL_RANGE_TICK_STEP],
		]);
	});

	it('is compared with the observed temperature, its difference ±20 °C marked every 10', () => {
		expect(TEMPERATURE_LAYER.observed).toBe(TEMPERATURE_OBSERVED);
		expect(TEMPERATURE_OBSERVED).toEqual({
			load: loadObservedTemperature,
			loadingText: 'Loading observed temperature',
			failedText: 'Observed temperature could not be loaded',
			sourceName: 'temperature-source',
			sourceLegend: 'Temperature source',
			difference: { halfSpan: 20, ramp: DIFFERENCE_RAMP, tickStep: 10 },
		});
		expect([DIFFERENCE_HALF_SPAN_C, DIFFERENCE_TICK_STEP]).toEqual([20, 10]);
	});

	it('reads the store’s temperature, its months and its progress', () => {
		const store = createLayerStore(() => {});
		expect(TEMPERATURE_LAYER.read(store)).toEqual({
			status: 'empty',
			result: null,
			months: null,
			progress: null,
		});
		const result = temperatureOf(1);
		store.markCalculating();
		store.setProgress(progressOf(2));
		expect(TEMPERATURE_LAYER.read(store).progress).toEqual(progressOf(2));
		store.setResult(result, true);
		const reading = TEMPERATURE_LAYER.read(store);
		expect(reading.status).toBe('current');
		expect(reading.result).toBe(result);
		expect(reading.months).toBe(result.months);
		// The winds are not the temperature's.
		store.setWindsResult(pressureWinds(), true);
		expect(TEMPERATURE_LAYER.read(store).result).toBe(result);
	});

	it('writes its ticks as the legend always has', () => {
		expect(TEMPERATURE_LAYER.formatTick(-20)).toBe('−20');
		expect(TEMPERATURE_LAYER.formatTick(14.5)).toBe('14.5');
	});
});

describe('the layers the page offers', () => {
	it('describe every layer but the terrain, in the order of the choice', () => {
		expect(SCALAR_LAYER_IDS).toEqual(
			LAYERS.filter((layer) => layer !== 'terrain'),
		);
		expect(SCALAR_LAYERS.map((layer) => layer.id)).toEqual(SCALAR_LAYER_IDS);
		for (const id of SCALAR_LAYER_IDS) {
			expect(SCALAR_LAYER_SPECS[id].id).toBe(id);
		}
	});

	it('each offer the Month view, which a layer opens on', () => {
		for (const layer of [...SCALAR_LAYERS, MADE_UP_LAYER]) {
			expect(offersSummary(layer, DEFAULT_SUMMARY)).toBe(true);
		}
	});

	it('are found by their id, and the terrain is none', () => {
		expect(scalarLayerOf('temperature')).toBe(TEMPERATURE_LAYER);
		expect(scalarLayerOf('terrain')).toBeNull();
	});
});

describe('summaryOf', () => {
	it('gives a view a layer offers, and refuses one it does not', () => {
		expect(summaryOf(TEMPERATURE_LAYER, 'range').label).toBe('Seasonal range');
		expect(summaryOf(MADE_UP_LAYER, 'annualMean').label).toBe('Yearly mean');
		expect(offersSummary(MADE_UP_LAYER, 'range')).toBe(false);
		expect(() => summaryOf(MADE_UP_LAYER, 'range')).toThrow(RangeError);
	});
});

describe('formatWhole', () => {
	it('rounds to a whole number with its digits grouped, a true minus sign and no −0', () => {
		expect(formatWhole(1018.4, false)).toBe('1,018');
		expect(formatWhole(-31.4, false)).toBe('−31');
		expect(formatWhole(-0.5, false)).toBe('0');
		expect(formatWhole(14.5, false)).toBe('15');
	});

	it('signs a value above zero when asked, never zero', () => {
		expect(formatWhole(2.2, true)).toBe('+2');
		expect(formatWhole(-3, true)).toBe('−3');
		expect(formatWhole(0.4, true)).toBe('0');
		expect(formatWhole(2.2, false)).toBe('2');
	});
});

describe('layerCaption', () => {
	it('words the temperature’s caption as the legend always has', () => {
		expect(layerCaption(TEMPERATURE_LAYER, 'month', 6)).toBe(
			'Air temperature in July, °C',
		);
		expect(layerCaption(TEMPERATURE_LAYER, 'warmest', 6, 'difference')).toBe(
			'Simulated less observed, air temperature in the warmest month, °C',
		);
	});

	it('words another layer’s caption in its own words and unit', () => {
		expect(layerCaption(MADE_UP_LAYER, 'month', 6)).toBe(
			'Made-up pressure in month 7, hPa',
		);
		expect(layerCaption(MADE_UP_LAYER, 'annualMean', 6, 'observed')).toBe(
			'Observed yearly mean made-up pressure, hPa',
		);
		expect(layerCaption(MADE_UP_LAYER, 'month', 0, 'difference')).toBe(
			'Simulated less observed in month 1, hPa',
		);
		expect(() => layerCaption(MADE_UP_LAYER, 'range', 0)).toThrow(RangeError);
	});
});

describe('the fields of a layer’s year', () => {
	it('gives a month’s own array, and each summary worked out once', () => {
		const result = temperatureOf(1);
		const year = { months: result.months };
		expect(yearField(TEMPERATURE_LAYER, year, 3)).toBe(result.months[3]);
		const summaries = yearSummaries(TEMPERATURE_LAYER, year);
		expect(yearField(TEMPERATURE_LAYER, year, 'range')).toBe(summaries.range);
		expect(yearSummaries(TEMPERATURE_LAYER, year)).toBe(summaries);
	});

	it('works out another layer’s summaries as it says, and refuses one it gives none of', () => {
		const year = { months: pressureWinds().winds.pressure };
		expect(Array.from(yearField(MADE_UP_LAYER, year, 'annualMean'))).toEqual([
			1005.5, 1025.5,
		]);
		expect(() => yearField(MADE_UP_LAYER, year, 'warmest')).toThrow(RangeError);
	});
});

describe('fitSummaryScale', () => {
	const { months } = temperatureOf(1);
	months.forEach((month, m) => {
		month.set([m - 30, m + 10]);
	});
	const year = { months };

	it('fits a view end to end to the whole year, as fitRange does', () => {
		const view = summaryOf(TEMPERATURE_LAYER, 'warmest');
		expect(fitSummaryScale(TEMPERATURE_LAYER, view, [year], 'warmest')).toEqual(
			fitRange(months, cellWeights(2)),
		);
	});

	it('fits a view end to end to two years together', () => {
		const other = { months: months.map((month) => month.map((v) => v + 5)) };
		const view = summaryOf(TEMPERATURE_LAYER, 'month');
		expect(fitSummaryScale(TEMPERATURE_LAYER, view, [year, other], 0)).toEqual(
			fitRange([...months, ...other.months], cellWeights(2)),
		);
	});

	it('fits a view from zero to the largest of its field in every year', () => {
		const view = summaryOf(TEMPERATURE_LAYER, 'range');
		const wider = {
			months: months.map((month, m) => month.map((v) => v * (m + 1))),
		};
		const own = fitSummaryScale(TEMPERATURE_LAYER, view, [year], 'range');
		expect(own).toEqual({ range: { min: 0, max: 11 }, beyond: NOTHING_BEYOND });
		const shared = fitSummaryScale(
			TEMPERATURE_LAYER,
			view,
			[year, wider],
			'range',
		);
		expect(shared.range.min).toBe(0);
		expect(shared.range.max).toBeGreaterThan(11);
	});

	it('fits a centred view about the centre the layer works out, at least its smallest span', () => {
		const pressure = { months: pressureWinds().winds.pressure };
		const view = summaryOf(MADE_UP_LAYER, 'month');
		const scale = fitSummaryScale(MADE_UP_LAYER, view, [pressure], 4);
		expect(scale).toEqual(
			fitRangeCentred(
				pressure.months,
				cellWeights(2),
				weightedMean(pressure.months, cellWeights(2)),
				MADE_UP_LAYER.minSpan,
			),
		);
		expect((scale.range.min + scale.range.max) / 2).toBe(1016);
	});
});

describe('loadLayerObserved', () => {
	it('loads through the layer’s own loader', async () => {
		const months = [new Float32Array(6)];
		const layer = {
			...TEMPERATURE_LAYER,
			observed: { ...TEMPERATURE_OBSERVED, load: async () => months },
		};
		await expect(loadLayerObserved(layer, 64)).resolves.toBe(months);
	});

	it('rejects for a layer with no observed year', async () => {
		await expect(loadLayerObserved(MADE_UP_LAYER, 64)).rejects.toThrow(
			'no observed year',
		);
	});
});
