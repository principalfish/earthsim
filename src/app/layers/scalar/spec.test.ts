import { describe, expect, it } from 'vitest';
import { MADE_UP_LAYER } from '../../testing/scalarLayerFixtures';
import { offersSummary, summaryOf } from './spec';
import { TEMPERATURE_LAYER } from './temperature';

describe('summaryOf', () => {
	it('gives a view a layer offers, and refuses one it does not', () => {
		expect(summaryOf(TEMPERATURE_LAYER, 'range').label).toBe('Seasonal range');
		expect(summaryOf(MADE_UP_LAYER, 'annualMean').label).toBe('Yearly mean');
		expect(offersSummary(MADE_UP_LAYER, 'range')).toBe(false);
		expect(() => summaryOf(MADE_UP_LAYER, 'range')).toThrow(RangeError);
	});
});
