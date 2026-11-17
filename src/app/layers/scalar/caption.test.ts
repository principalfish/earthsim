import { describe, expect, it } from 'vitest';
import { MADE_UP_LAYER } from '../../testing/scalarLayerFixtures';
import { layerCaption } from './caption';
import { TEMPERATURE_LAYER } from './temperature';

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
