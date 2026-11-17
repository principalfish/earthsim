import { describe, expect, it } from 'vitest';
import { temperatureOf } from '../../../core/testing/temperatureFixtures';
import {
	MADE_UP_LAYER,
	pressureWinds,
	weightedMean,
} from '../../testing/scalarLayerFixtures';
import { cellWeights, fitRange, fitRangeCentred } from './fit';
import { summaryOf } from './spec';
import { TEMPERATURE_LAYER } from './temperature';
import { fitSummaryScale, yearField, yearSummaries } from './yearScale';

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
