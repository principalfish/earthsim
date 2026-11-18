import { describe, expect, it } from 'vitest';
import { SYSTEM_UNITS } from '../../settings/units';
import { layerCaption } from './caption';
import {
	formatWhole,
	inUnit,
	isDifferenceView,
	layerUnit,
	metricRange,
	metricUnit,
	toLayerUnit,
} from './inUnit';
import { PRESSURE_LAYER, PRESSURE_OBSERVED } from './pressure';
import { summaryOf } from './spec';
import { TEMPERATURE_LAYER, TEMPERATURE_OBSERVED } from './temperature';

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
