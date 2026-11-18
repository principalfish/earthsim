import { describe, expect, it } from 'vitest';
import { temperatureOf } from '../../../core/testing/temperatureFixtures';
import {
	DIFFERENCE_RAMP,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from '../../globe/ramp';
import { climateOf, keepingTemperature } from '../../testing/climateStore';
import { pressureWinds } from '../../testing/scalarLayerFixtures';
import { createLayerStore } from '../layers';
import { loadObservedTemperature } from '../observedData';
import { SUMMARIES, SUMMARY_LABELS } from '../view';
import {
	DIFFERENCE_HALF_SPAN_C,
	DIFFERENCE_TICK_STEP,
	SEASONAL_RANGE_TICK_STEPS,
	TEMPERATURE_LAYER,
	TEMPERATURE_OBSERVED,
} from './temperature';

describe('the temperature layer', () => {
	it('is the Temperature, in °C, with the temperature’s wording', () => {
		expect(TEMPERATURE_LAYER.id).toBe('temperature');
		expect(TEMPERATURE_LAYER.label).toBe('Temperature');
		expect(TEMPERATURE_LAYER.quantity).toBe('temperature');
		expect(TEMPERATURE_LAYER.unavailableText).toBe('Temperature unavailable');
		expect(TEMPERATURE_LAYER.notShownText).toBe(
			'Temperature could not be shown',
		);
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

	it('reads the store’s temperature and its months', () => {
		const store = createLayerStore(() => {});
		expect(TEMPERATURE_LAYER.read(store)).toEqual({
			status: 'empty',
			result: null,
			months: null,
		});
		const result = temperatureOf(1);
		store.markClimateCalculating();
		expect(TEMPERATURE_LAYER.read(store).status).toBe('calculating');
		store.setClimateResult(climateOf(result), true);
		const reading = TEMPERATURE_LAYER.read(store);
		expect(reading.status).toBe('current');
		expect(reading.result).toBe(result);
		expect(reading.months).toBe(result.months);
		// The winds are not the temperature's.
		store.setClimateResult(keepingTemperature(store, pressureWinds()), true);
		expect(TEMPERATURE_LAYER.read(store).result).toBe(result);
	});

	it('writes its ticks as the legend always has', () => {
		expect(TEMPERATURE_LAYER.formatTick(-20, '°C')).toBe('−20');
		expect(TEMPERATURE_LAYER.formatTick(14.5, '°C')).toBe('14.5');
	});
});
