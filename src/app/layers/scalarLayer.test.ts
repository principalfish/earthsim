import { describe, expect, it } from 'vitest';
import { getGrid, summariseWinds, weightedQuantiles } from '../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../core/testing/temperatureFixtures';
import {
	DIFFERENCE_RAMP,
	PRESSURE_RAMP,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from '../globe/ramp';
import { SYSTEM_UNITS } from '../settings/units';
import {
	earthLikePressure,
	earthLikeTemperature,
} from '../testing/earthLikeFixtures';
import {
	MADE_UP_LAYER,
	pressureWinds,
	weightedMean,
} from '../testing/scalarLayerFixtures';
import {
	cellWeights,
	FIT_TAIL_SHARE,
	fitRange,
	fitRangeCentred,
	legendTicks,
} from '../ui/legend';
import { createLayerStore } from './layers';
import { loadObservedPressure, loadObservedTemperature } from './observedData';
import {
	DIFFERENCE_HALF_SPAN_C,
	DIFFERENCE_TICK_STEP,
	fitSummaryScale,
	formatWhole,
	inUnit,
	isDifferenceView,
	layerCaption,
	layerUnit,
	loadLayerObserved,
	meanOfMonths,
	metricRange,
	metricUnit,
	offersSummary,
	PRESSURE_DIFFERENCE_HALF_SPAN_HPA,
	PRESSURE_DIFFERENCE_TICK_STEP_HPA,
	PRESSURE_LAYER,
	PRESSURE_OBSERVED,
	SCALAR_LAYER_SPECS,
	SCALAR_LAYERS,
	SEASONAL_RANGE_TICK_STEPS,
	scalarLayerOf,
	summaryOf,
	TEMPERATURE_LAYER,
	TEMPERATURE_OBSERVED,
	toLayerUnit,
	windsStatus,
	yearField,
	yearSummaries,
} from './scalarLayer';
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
		expect(TEMPERATURE_LAYER.quantity).toBe('temperature');
		expect(TEMPERATURE_LAYER.unavailableText).toBe('Temperature unavailable');
		expect(TEMPERATURE_LAYER.notShownText).toBe(
			'Temperature could not be shown',
		);
		expect(TEMPERATURE_LAYER.yearProgress).toBe(true);
		expect(TEMPERATURE_LAYER.summaryControlId).toBe('temperature-view');
		expect(TEMPERATURE_LAYER.sunlightStyle).toBe('line');
		expect(TEMPERATURE_LAYER.minSpan['°C']).toBe(2);
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
			['range', SEASONAL_RANGE_RAMP, 'fromZero', SEASONAL_RANGE_TICK_STEPS],
		]);
	});

	it('is compared with the observed temperature, its difference ±20 °C marked every 10', () => {
		expect(TEMPERATURE_LAYER.observed).toBe(TEMPERATURE_OBSERVED);
		expect(TEMPERATURE_OBSERVED).toEqual({
			load: loadObservedTemperature,
			loadingText: 'Loading observed temperature',
			failedText: 'Observed temperature could not be loaded',
			difference: {
				halfSpan: { '°C': 20, '°F': 40, K: 20 },
				ramp: DIFFERENCE_RAMP,
				tickStep: { '°C': 10, '°F': 20, K: 10 },
			},
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
		expect(TEMPERATURE_LAYER.formatTick(-20, '°C')).toBe('−20');
		expect(TEMPERATURE_LAYER.formatTick(14.5, '°C')).toBe('14.5');
	});
});

describe('the pressure layer', () => {
	it('is the Pressure, in hPa, with the pressure’s wording', () => {
		expect(PRESSURE_LAYER.id).toBe('pressure');
		expect(PRESSURE_LAYER.label).toBe('Pressure');
		expect(PRESSURE_LAYER.quantity).toBe('pressure');
		expect(PRESSURE_LAYER.unavailableText).toBe('Pressure unavailable');
		expect(PRESSURE_LAYER.notShownText).toBe('Pressure could not be shown');
		expect(PRESSURE_LAYER.yearProgress).toBe(false);
		expect(PRESSURE_LAYER.summaryControlId).toBe('pressure-view');
		expect(PRESSURE_LAYER.sunlightStyle).toBe(TEMPERATURE_LAYER.sunlightStyle);
		expect(PRESSURE_LAYER.minSpan.hPa).toBe(10);
		expect(PRESSURE_LAYER.observed).toBe(PRESSURE_OBSERVED);
	});

	it('is compared with the observed pressure, its difference ±20 hPa marked every 10 in the difference colours', () => {
		expect(PRESSURE_OBSERVED).toEqual({
			load: loadObservedPressure,
			loadingText: 'Loading observed pressure',
			failedText: 'Observed pressure could not be loaded',
			difference: {
				halfSpan: { hPa: 20, inHg: 0.6 },
				ramp: DIFFERENCE_RAMP,
				tickStep: { hPa: 10, inHg: 0.3 },
			},
		});
		expect(PRESSURE_OBSERVED.difference.ramp).toBe(
			TEMPERATURE_OBSERVED.difference.ramp,
		);
		expect([
			PRESSURE_DIFFERENCE_HALF_SPAN_HPA,
			PRESSURE_DIFFERENCE_TICK_STEP_HPA,
		]).toEqual([20, 10]);
	});

	it('words its observed and difference captions in the temperature’s pattern', () => {
		expect(layerCaption(PRESSURE_LAYER, 'month', 6, 'simulated')).toBe(
			'Simulated sea-level pressure in July, hPa',
		);
		expect(layerCaption(PRESSURE_LAYER, 'month', 6, 'observed')).toBe(
			'Observed sea-level pressure in July, hPa',
		);
		expect(layerCaption(PRESSURE_LAYER, 'month', 6, 'difference')).toBe(
			'Simulated less observed in July, hPa',
		);
		expect(layerCaption(PRESSURE_LAYER, 'annualMean', 6, 'observed')).toBe(
			'Observed annual average sea-level pressure, hPa',
		);
		expect(layerCaption(PRESSURE_LAYER, 'annualMean', 6, 'difference')).toBe(
			'Simulated less observed, annual average sea-level pressure, hPa',
		);
		// The temperature's, built the same way.
		expect(layerCaption(TEMPERATURE_LAYER, 'month', 6, 'difference')).toBe(
			'Simulated less observed in July, °C',
		);
		expect(layerCaption(TEMPERATURE_LAYER, 'annualMean', 6, 'difference')).toBe(
			'Simulated less observed, annual average air temperature, °C',
		);
	});

	it('loads its observed year through its own loader', () => {
		expect(PRESSURE_LAYER.observed?.load).toBe(loadObservedPressure);
		expect(PRESSURE_LAYER.observed?.load).not.toBe(loadObservedTemperature);
	});

	it('offers the Month and the Annual average alone, both centred in its colours', () => {
		expect(
			PRESSURE_LAYER.summaries.map(({ id, label, ramp, scale, tickStep }) => [
				id,
				label,
				ramp,
				scale.kind,
				tickStep,
			]),
		).toEqual([
			['month', 'Month', PRESSURE_RAMP, 'centred', undefined],
			['annualMean', 'Annual average', PRESSURE_RAMP, 'centred', undefined],
		]);
		for (const summary of ['warmest', 'coldest', 'range'] as const) {
			expect(offersSummary(PRESSURE_LAYER, summary)).toBe(false);
		}
	});

	it('writes its values and ticks as whole numbers, grouped, with a true minus and no −0', () => {
		expect(PRESSURE_LAYER.formatValue(1018.4, 'hPa', false)).toBe('1,018');
		expect(PRESSURE_LAYER.formatTick(1018, 'hPa')).toBe('1,018');
		expect(PRESSURE_LAYER.formatTick(996, 'hPa')).toBe('996');
		expect(PRESSURE_LAYER.formatTick(-4, 'hPa')).toBe('−4');
		expect(PRESSURE_LAYER.formatTick(-0, 'hPa')).toBe('0');
		expect(PRESSURE_LAYER.formatValue(-0.2, 'hPa', false)).toBe('0');
	});

	it('words its captions as sea-level pressure in hPa', () => {
		expect(layerCaption(PRESSURE_LAYER, 'month', 6)).toBe(
			'Sea-level pressure in July, hPa',
		);
		expect(layerCaption(PRESSURE_LAYER, 'month', 0)).toBe(
			'Sea-level pressure in January, hPa',
		);
		expect(layerCaption(PRESSURE_LAYER, 'annualMean', 6)).toBe(
			'Annual average sea-level pressure, hPa',
		);
		// In the pattern of the temperature's annual average.
		expect(layerCaption(TEMPERATURE_LAYER, 'annualMean', 6)).toBe(
			'Annual average air temperature, °C',
		);
	});

	it('reads the store’s winds, their months of pressure and no progress', () => {
		const store = createLayerStore(() => {});
		expect(PRESSURE_LAYER.read(store)).toEqual({
			status: 'empty',
			result: null,
			months: null,
			progress: null,
		});
		store.markCalculating();
		store.setProgress(progressOf(2));
		store.markWindsCalculating();
		expect(PRESSURE_LAYER.read(store).status).toBe('calculating');
		expect(PRESSURE_LAYER.read(store).progress).toBeNull();
		const solved = pressureWinds();
		store.setWindsResult(solved, true);
		const reading = PRESSURE_LAYER.read(store);
		expect(reading.status).toBe('current');
		expect(reading.result).toBe(solved);
		expect(reading.months).toBe(solved.winds.pressure);
		// The temperature is not the pressure's.
		store.setResult(temperatureOf(1), true);
		expect(PRESSURE_LAYER.read(store).months).toBe(solved.winds.pressure);
	});

	it('is being calculated before the first winds while the temperature they wait for is', () => {
		const store = createLayerStore(() => {});
		expect(PRESSURE_LAYER.read(store).status).toBe('empty');
		// The winds are not asked for until there is a temperature.
		store.markCalculating();
		expect(store.winds.status).toBe('empty');
		expect(PRESSURE_LAYER.read(store)).toEqual({
			status: 'calculating',
			result: null,
			months: null,
			progress: null,
		});
		// With a temperature and still no winds, nothing is under way yet.
		store.setResult(temperatureOf(1), true);
		expect(PRESSURE_LAYER.read(store).status).toBe('empty');
		store.markWindsCalculating();
		expect(PRESSURE_LAYER.read(store).status).toBe('calculating');
	});

	it('stands as the winds stand for showing, by the rule the key to the arrows shares', () => {
		expect(windsStatus('calculating', 'empty')).toBe('calculating');
		expect(windsStatus('empty', 'empty')).toBe('empty');
		expect(windsStatus('current', 'empty')).toBe('empty');
		expect(windsStatus('calculating', 'current')).toBe('current');
		expect(windsStatus('calculating', 'outOfDate')).toBe('outOfDate');
		expect(windsStatus('unavailable', 'unavailable')).toBe('unavailable');
		const store = createLayerStore(() => {});
		store.markCalculating();
		expect(PRESSURE_LAYER.read(store).status).toBe(
			windsStatus(store.temperature.status, store.winds.status),
		);
	});

	it('averages months cell by cell as the winds’ own annual mean does, to the bit', () => {
		const solved = pressureWinds(0.3);
		expect(meanOfMonths(solved.winds.east)).toEqual(
			summariseWinds(solved.winds).east,
		);
		expect(meanOfMonths(solved.winds.pressure)).toEqual(
			summariseWinds(solved.winds).pressure,
		);
	});

	it('cannot be calculated once the temperature cannot, as the winds cannot', () => {
		const store = createLayerStore(() => {});
		store.markCalculating();
		store.markUnavailable();
		expect(store.winds.status).toBe('unavailable');
		expect(PRESSURE_LAYER.read(store).status).toBe('unavailable');
	});

	it('stands where the winds do once there are winds, whatever the temperature', () => {
		const store = createLayerStore(() => {});
		store.setResult(temperatureOf(1), true);
		const solved = pressureWinds();
		store.setWindsResult(solved, true);
		store.markCalculating();
		// The winds it has are still the latest worked out.
		expect(PRESSURE_LAYER.read(store).status).toBe(store.winds.status);
		expect(PRESSURE_LAYER.read(store).status).not.toBe('empty');
	});

	it('takes its annual average as the winds’ mean pressure, worked out once for each year', () => {
		const solved = pressureWinds();
		const year = { months: solved.winds.pressure };
		const mean = yearField(PRESSURE_LAYER, year, 'annualMean');
		expect(mean).toEqual(summariseWinds(solved.winds).pressure);
		expect(Array.from(mean)).toEqual([1005.5, 1025.5]);
		expect(yearField(PRESSURE_LAYER, year, 'annualMean')).toBe(mean);
		expect(yearField(PRESSURE_LAYER, year, 3)).toBe(solved.winds.pressure[3]);
	});
});

describe('the pressure layer’s scale', () => {
	const grid = getGrid(64);
	/** The cells of the grid, smallest first. */
	const bySize = Array.from(grid.areas.keys()).sort(
		(a, b) => (grid.areas[a] as number) - (grid.areas[b] as number),
	);
	/** The mean of some fields, each cell weighted by the grid's area. */
	const areaMean = (months: readonly Float32Array[]): number => {
		let total = 0;
		let area = 0;
		for (const month of months) {
			month.forEach((value, cell) => {
				total += value * (grid.areas[cell] as number);
				area += grid.areas[cell] as number;
			});
		}
		return total / area;
	};
	/**
	 * A year on the 64 grid whose pressure rises with a cell's area, from
	 * 990 hPa in the smallest cell to 1040 hPa in the largest, so that its
	 * mean by area is above its mean by cell, and moves with the month, 2 hPa
	 * a month either side of the year's mean, the same for the whole year.
	 * Its smallest cells, half as many as the share of the cells clipped at
	 * either end and less of the area, are 300 hPa below the rest, and its
	 * largest cell 300 hPa above.
	 */
	const yearOnGrid = (): Float32Array[] => {
		const smallest = grid.areas[bySize[0] as number] as number;
		const largest = grid.areas[bySize.at(-1) as number] as number;
		const low = new Set(
			bySize.slice(0, Math.floor(grid.cellCount * FIT_TAIL_SHARE * 0.5)),
		);
		const high = bySize.at(-1) as number;
		return Array.from({ length: 12 }, (_, m) => {
			const month = new Float32Array(grid.cellCount);
			for (let cell = 0; cell < grid.cellCount; cell++) {
				const area = grid.areas[cell] as number;
				const base = 990 + (50 * (area - smallest)) / (largest - smallest);
				const tail = low.has(cell) ? -300 : cell === high ? 300 : 0;
				month[cell] = base + tail + 2 * (m - 5.5);
			}
			return month;
		});
	};

	it('is centred on the mean of the whole year by area, the same for every month and the annual average', () => {
		const months = yearOnGrid();
		const year = { months };
		const centre = Math.round(areaMean(months));
		// By cell alone the mean is another.
		const byCell =
			months.reduce((sum, month) => sum + month.reduce((a, b) => a + b, 0), 0) /
			(12 * grid.cellCount);
		expect(Math.round(byCell)).not.toBe(centre);
		const month = summaryOf(PRESSURE_LAYER, 'month');
		const annual = summaryOf(PRESSURE_LAYER, 'annualMean');
		const scales = [
			fitSummaryScale(PRESSURE_LAYER, month, [year], 0),
			fitSummaryScale(PRESSURE_LAYER, month, [year], 6),
			fitSummaryScale(PRESSURE_LAYER, month, [year], 11),
			fitSummaryScale(PRESSURE_LAYER, annual, [year], 'annualMean'),
		];
		for (const scale of scales) {
			expect(scale).toEqual(scales[0]);
			expect((scale.min + scale.max) / 2).toBe(centre);
		}
		expect(scales[0]).toEqual(
			fitRangeCentred(months, grid.areas, areaMean(months), 10),
		);
	});

	it('is symmetric about the mean and clips the far tails at either end', () => {
		const months = yearOnGrid();
		const view = summaryOf(PRESSURE_LAYER, 'month');
		const range = fitSummaryScale(PRESSURE_LAYER, view, [{ months }], 6);
		const centre = Math.round(areaMean(months));
		expect(centre - range.min).toBe(range.max - centre);
		// The tails 300 hPa out do not stretch it; they take the end colours.
		expect(range.min).toBeGreaterThan(900);
		expect(range.max).toBeLessThan(1100);
	});

	it('is never narrower than 10 hPa, for a nearly uniform year', () => {
		const months = Array.from({ length: 12 }, (_, m) =>
			new Float32Array(grid.cellCount).fill(1013 + 0.01 * m),
		);
		const view = summaryOf(PRESSURE_LAYER, 'annualMean');
		const range = fitSummaryScale(
			PRESSURE_LAYER,
			view,
			[{ months }],
			'annualMean',
		);
		expect(range).toEqual({ min: 1008, max: 1018 });
	});
});

describe('the layers the page offers', () => {
	it('are the Temperature and the Pressure, in that order, after Terrain', () => {
		expect(LAYERS).toEqual(['terrain', 'temperature', 'pressure']);
		expect(SCALAR_LAYERS).toEqual([TEMPERATURE_LAYER, PRESSURE_LAYER]);
	});

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
		expect(scalarLayerOf('pressure')).toBe(PRESSURE_LAYER);
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
		expect(own).toEqual({ min: 0, max: 11 });
		const shared = fitSummaryScale(
			TEMPERATURE_LAYER,
			view,
			[year, wider],
			'range',
		);
		expect(shared.min).toBe(0);
		expect(shared.max).toBeGreaterThan(11);
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
				MADE_UP_LAYER.minSpan.hPa,
			),
		);
		expect((scale.min + scale.max) / 2).toBe(1016);
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

/** Whether a number is written exactly with no more than two decimals. */
const hasTwoDecimals = (value: number): boolean =>
	Number(value.toFixed(2)) === value;

describe('the layers in each unit', () => {
	it('gives each of its quantity’s units a round setting of its own, not converted', () => {
		expect(TEMPERATURE_LAYER.minSpan).toEqual({ '°C': 2, '°F': 4, K: 2 });
		expect(PRESSURE_LAYER.minSpan).toEqual({ hPa: 10, inHg: 0.3 });
		expect(summaryOf(TEMPERATURE_LAYER, 'range').tickStep).toEqual({
			'°C': 5,
			'°F': 10,
			K: 5,
		});
		expect(TEMPERATURE_OBSERVED.difference.halfSpan).toEqual({
			'°C': 20,
			'°F': 40,
			K: 20,
		});
		expect(TEMPERATURE_OBSERVED.difference.tickStep).toEqual({
			'°C': 10,
			'°F': 20,
			K: 10,
		});
		expect(PRESSURE_OBSERVED.difference.halfSpan).toEqual({
			hPa: 20,
			inHg: 0.6,
		});
		expect(PRESSURE_OBSERVED.difference.tickStep).toEqual({
			hPa: 10,
			inHg: 0.3,
		});
	});

	it('reads a setting in a unit, and refuses a unit it gives nothing for', () => {
		expect(inUnit(TEMPERATURE_LAYER.minSpan, '°F')).toBe(4);
		expect(inUnit(PRESSURE_LAYER.minSpan, 'inHg')).toBe(0.3);
		expect(() => inUnit(TEMPERATURE_LAYER.minSpan, 'hPa')).toThrow(RangeError);
	});

	it('marks only the seasonal range as a view of differences', () => {
		expect(
			[...TEMPERATURE_LAYER.summaries, ...PRESSURE_LAYER.summaries]
				.filter(isDifferenceView)
				.map((view) => view.id),
		).toEqual(['range']);
		expect(isDifferenceView({ scale: { kind: 'fromZero' } })).toBe(true);
		expect(isDifferenceView({ scale: { kind: 'endToEnd' } })).toBe(false);
		expect(
			isDifferenceView({ scale: { kind: 'centred', centre: () => 0 } }),
		).toBe(false);
	});

	it('takes its unit from those chosen, and its metric unit from its quantity', () => {
		const imperial = SYSTEM_UNITS.imperial;
		expect(layerUnit(TEMPERATURE_LAYER, imperial)).toBe('°F');
		expect(layerUnit(PRESSURE_LAYER, imperial)).toBe('inHg');
		expect(metricUnit(TEMPERATURE_LAYER)).toBe('°C');
		expect(metricUnit(PRESSURE_LAYER)).toBe('hPa');
	});

	it('converts a value with the offset and a difference by the scale alone', () => {
		expect(toLayerUnit(TEMPERATURE_LAYER, '°F', 10, false)).toBe(50);
		expect(toLayerUnit(TEMPERATURE_LAYER, '°F', 10, true)).toBe(18);
		expect(toLayerUnit(TEMPERATURE_LAYER, 'K', 10, true)).toBe(10);
		expect(toLayerUnit(TEMPERATURE_LAYER, 'K', 0, false)).toBe(273.15);
		expect(toLayerUnit(PRESSURE_LAYER, 'hPa', 1013, false)).toBe(1013);
	});

	it('gives a range in a unit back as the metric values the globe colours by', () => {
		const fahrenheit = metricRange(
			TEMPERATURE_LAYER,
			'°F',
			{ min: -40, max: 104 },
			false,
		);
		expect(fahrenheit.min).toBeCloseTo(-40, 12);
		expect(fahrenheit.max).toBeCloseTo(40, 12);
		expect(
			metricRange(TEMPERATURE_LAYER, '°F', { min: -36, max: 36 }, true),
		).toEqual({ min: -20, max: 20 });
		const kelvin = metricRange(
			TEMPERATURE_LAYER,
			'K',
			{ min: 223, max: 313 },
			false,
		);
		expect(kelvin.min).toBeCloseTo(-50.15, 12);
		expect(kelvin.max).toBeCloseTo(39.85, 12);
		const range = { min: -12, max: 31 };
		expect(metricRange(TEMPERATURE_LAYER, '°C', range, false)).toEqual(range);
		expect(
			metricRange(PRESSURE_LAYER, 'inHg', { min: 0, max: 1 }, true).max,
		).toBeCloseTo(33.8638866667, 9);
	});

	it('names the unit in the caption', () => {
		expect(layerCaption(TEMPERATURE_LAYER, 'month', 6, undefined, '°F')).toBe(
			'Air temperature in July, °F',
		);
		expect(layerCaption(TEMPERATURE_LAYER, 'range', 6, 'difference', 'K')).toBe(
			'Simulated less observed, seasonal range, K',
		);
		expect(
			layerCaption(PRESSURE_LAYER, 'annualMean', 6, 'observed', 'inHg'),
		).toBe('Observed annual average sea-level pressure, inHg');
		expect(() =>
			layerCaption(TEMPERATURE_LAYER, 'month', 6, undefined, 'inHg'),
		).toThrow(RangeError);
	});

	it('writes its values and ticks to the unit’s decimals', () => {
		expect(TEMPERATURE_LAYER.formatValue(64.4, '°F', false)).toBe('64');
		expect(TEMPERATURE_LAYER.formatValue(3.6, 'K', true)).toBe('+4');
		expect(TEMPERATURE_LAYER.formatTick(-40, '°F')).toBe('−40');
		expect(PRESSURE_LAYER.formatValue(29.921, 'inHg', false)).toBe('29.92');
		expect(PRESSURE_LAYER.formatValue(-0.126, 'inHg', true)).toBe('−0.13');
		expect(PRESSURE_LAYER.formatValue(0.004, 'inHg', true)).toBe('0.00');
		expect(PRESSURE_LAYER.formatTick(30, 'inHg')).toBe('30.00');
		expect(PRESSURE_LAYER.formatTick(29.7, 'inHg')).toBe('29.70');
		expect(() => PRESSURE_LAYER.formatTick(30, '°F')).toThrow(RangeError);
	});
});

describe('fitSummaryScale in a unit, on an Earth-like year', () => {
	const temperature = { months: earthLikeTemperature() };
	const pressure = { months: earthLikePressure() };
	const weights = cellWeights(temperature.months[0]?.length ?? 0);
	/** The values between the two quantiles a scale spans, in a unit. */
	const cutsIn = (
		months: readonly Float32Array[],
		toUnit: (value: number) => number,
	) => {
		const cuts = weightedQuantiles(months, weights, FIT_TAIL_SHARE);
		return { low: toUnit(cuts.low), high: toUnit(cuts.high) };
	};

	it.each([
		['°F', 4],
		['K', 2],
	] as const)(
		'fits July’s temperature in %s to whole ends that hold every value, marked at whole ticks',
		(unit, minSpan) => {
			const view = summaryOf(TEMPERATURE_LAYER, 'month');
			const range = fitSummaryScale(
				TEMPERATURE_LAYER,
				view,
				[temperature],
				6,
				unit,
			);
			expect(Number.isInteger(range.min), `${range.min}`).toBe(true);
			expect(Number.isInteger(range.max), `${range.max}`).toBe(true);
			expect(range.max - range.min).toBeGreaterThanOrEqual(minSpan);
			const cuts = cutsIn(temperature.months, (value) =>
				toLayerUnit(TEMPERATURE_LAYER, unit, value, false),
			);
			expect(range.min).toBeLessThanOrEqual(cuts.low);
			expect(range.max).toBeGreaterThanOrEqual(cuts.high);
			// Rounded outward by less than a whole unit.
			expect(cuts.low - range.min).toBeLessThan(1);
			expect(range.max - cuts.high).toBeLessThan(1);
			const ticks = legendTicks(range.min, range.max);
			expect(ticks.every(Number.isInteger), `${ticks}`).toBe(true);
		},
	);

	it('fits the temperature’s range of the seasons in °F by the scale alone, holding every value', () => {
		const view = summaryOf(TEMPERATURE_LAYER, 'range');
		const celsius = fitSummaryScale(
			TEMPERATURE_LAYER,
			view,
			[temperature],
			'range',
		);
		const fahrenheit = fitSummaryScale(
			TEMPERATURE_LAYER,
			view,
			[temperature],
			'range',
			'°F',
		);
		const field = yearField(TEMPERATURE_LAYER, temperature, 'range');
		const largest = Math.max(...field);
		expect(celsius).toEqual({ min: 0, max: Math.ceil(largest) });
		expect(fahrenheit).toEqual({ min: 0, max: Math.ceil(largest * 1.8) });
		expect(
			legendTicks(0, fahrenheit.max, inUnit(view.tickStep ?? {}, '°F')),
		).toEqual(
			Array.from(
				{ length: Math.floor(fahrenheit.max / 10) + 1 },
				(_, k) => k * 10,
			),
		);
	});

	it('fits July’s pressure in inHg about the year’s mean, to ends and ticks of two decimals that hold every value', () => {
		const view = summaryOf(PRESSURE_LAYER, 'month');
		const range = fitSummaryScale(PRESSURE_LAYER, view, [pressure], 6, 'inHg');
		expect(hasTwoDecimals(range.min), `${range.min}`).toBe(true);
		expect(hasTwoDecimals(range.max), `${range.max}`).toBe(true);
		const middle = (range.min + range.max) / 2;
		const mean = toLayerUnit(
			PRESSURE_LAYER,
			'inHg',
			weightedMean(pressure.months, weights),
			false,
		);
		expect(Math.abs(middle - mean)).toBeLessThanOrEqual(0.005 + 1e-9);
		const cuts = cutsIn(pressure.months, (value) =>
			toLayerUnit(PRESSURE_LAYER, 'inHg', value, false),
		);
		expect(range.min).toBeLessThanOrEqual(cuts.low);
		expect(range.max).toBeGreaterThanOrEqual(cuts.high);
		const ticks = legendTicks(range.min, range.max, undefined, 2);
		expect(ticks.every(hasTwoDecimals), `${ticks}`).toBe(true);
		expect(
			ticks.map((tick) => PRESSURE_LAYER.formatTick(tick, 'inHg')),
		).toEqual(ticks.map((tick) => tick.toFixed(2)));
	});

	it('fits the pressure in hPa as it always has', () => {
		const view = summaryOf(PRESSURE_LAYER, 'month');
		expect(fitSummaryScale(PRESSURE_LAYER, view, [pressure], 6, 'hPa')).toEqual(
			fitSummaryScale(PRESSURE_LAYER, view, [pressure], 6),
		);
	});

	it('refuses a unit of another quantity', () => {
		const view = summaryOf(PRESSURE_LAYER, 'month');
		expect(() =>
			fitSummaryScale(PRESSURE_LAYER, view, [pressure], 6, '°F'),
		).toThrow(RangeError);
	});
});
