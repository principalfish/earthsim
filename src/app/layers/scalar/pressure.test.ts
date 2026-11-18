import { describe, expect, it } from 'vitest';
import { getGrid, summariseWinds } from '../../../core/index';
import { temperatureOf } from '../../../core/testing/temperatureFixtures';
import { DIFFERENCE_RAMP, PRESSURE_RAMP } from '../../globe/ramp';
import { pressureWinds } from '../../testing/scalarLayerFixtures';
import { createLayerStore } from '../layers';
import { loadObservedPressure, loadObservedTemperature } from '../observedData';
import { layerCaption } from './caption';
import { FIT_TAIL_SHARE, fitRangeCentred } from './fit';
import {
	meanOfMonths,
	PRESSURE_DIFFERENCE_HALF_SPAN_HPA,
	PRESSURE_DIFFERENCE_TICK_STEP_HPA,
	PRESSURE_LAYER,
	PRESSURE_OBSERVED,
} from './pressure';
import { offersSummary, summaryOf } from './spec';
import { TEMPERATURE_LAYER, TEMPERATURE_OBSERVED } from './temperature';
import { fitSummaryScale, yearField } from './yearScale';

describe('the pressure layer', () => {
	it('is the Pressure, in hPa, with the pressure’s wording', () => {
		expect(PRESSURE_LAYER.id).toBe('pressure');
		expect(PRESSURE_LAYER.label).toBe('Pressure');
		expect(PRESSURE_LAYER.quantity).toBe('pressure');
		expect(PRESSURE_LAYER.unavailableText).toBe('Pressure unavailable');
		expect(PRESSURE_LAYER.notShownText).toBe('Pressure could not be shown');
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

	it('reads the store’s winds, their status and their months of pressure', () => {
		const store = createLayerStore(() => {});
		expect(PRESSURE_LAYER.read(store)).toEqual({
			status: 'empty',
			result: null,
			months: null,
		});
		store.markClimateCalculating();
		expect(PRESSURE_LAYER.read(store)).toEqual({
			status: 'calculating',
			result: null,
			months: null,
		});
		const solved = { ...pressureWinds(), temperature: temperatureOf(1) };
		store.setPass(solved, 1);
		expect(PRESSURE_LAYER.read(store)).toEqual({
			status: 'calculating',
			result: solved,
			months: solved.winds.pressure,
		});
		store.setClimateResult(solved, true);
		const reading = PRESSURE_LAYER.read(store);
		expect(reading.status).toBe('current');
		expect(reading.result).toBe(solved);
		expect(reading.months).toBe(solved.winds.pressure);
		store.markOutOfDate();
		expect(PRESSURE_LAYER.read(store).status).toBe('outOfDate');
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
		store.markClimateCalculating();
		store.markUnavailable();
		expect(store.winds.status).toBe('unavailable');
		expect(PRESSURE_LAYER.read(store).status).toBe('unavailable');
	});

	it('keeps the winds it has while the next climate is worked out', () => {
		const store = createLayerStore(() => {});
		const solved = { ...pressureWinds(), temperature: temperatureOf(1) };
		store.markClimateCalculating();
		store.setClimateResult(solved, true);
		store.markClimateCalculating();
		expect(PRESSURE_LAYER.read(store)).toMatchObject({
			status: 'calculating',
			result: solved,
		});
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
