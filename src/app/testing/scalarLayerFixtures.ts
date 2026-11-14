/**
 * A made-up layer of one value per cell for tests, described as the page
 * describes the temperature but differing from it in everything a
 * description holds: a test that shows it shows that the legend, the
 * readout, the comparison controls and the layer panel follow the
 * description and know nothing of the temperature.
 *
 * It is shaped like a sea-level pressure: its months come from the store's
 * winds, it offers the Month and the Annual average alone, its scale is
 * centred on the year's mean by area, its unit is hPa, it has no observed
 * year to compare with and its calculation tells nothing of its progress.
 */

import { temperatureOf } from '../../core/testing/temperatureFixtures';
import type { SolvedWinds } from '../layers';
import {
	formatWhole,
	type ScalarLayerSpec,
	type ScalarSummarySpec,
} from '../scalarLayer';
import type { ScalarLayerId } from '../view';
import { SEVEN_STOP_RAMP } from './rampFixtures';

/**
 * The made-up layer's id. No layer the page offers goes by it, so it is
 * taken to be one only for the tests.
 */
export const MADE_UP_ID = 'madeUp' as ScalarLayerId;

/**
 * The mean of every value in some fields, each weighted by its cell's
 * weight.
 */
export const weightedMean = (
	months: readonly Float32Array[],
	weights: ArrayLike<number>,
): number => {
	let total = 0;
	let weight = 0;
	for (const month of months) {
		month.forEach((value, cell) => {
			total += value * (weights[cell] as number);
			weight += weights[cell] as number;
		});
	}
	return total / weight;
};

/** The made-up layer's scale: centred on the year's mean. */
const CENTRED: ScalarSummarySpec['scale'] = {
	kind: 'centred',
	centre: weightedMean,
};

/** The mean of twelve months, cell by cell. */
const meanOf = (months: readonly Float32Array[]): Float32Array => {
	const mean = new Float32Array(months[0]?.length ?? 0);
	for (const month of months) {
		month.forEach((value, cell) => {
			mean[cell] = (mean[cell] as number) + value / months.length;
		});
	}
	return mean;
};

/** The made-up layer: a pressure-like layer worked out with the winds. */
export const MADE_UP_LAYER: ScalarLayerSpec = {
	id: MADE_UP_ID,
	label: 'Made-up pressure',
	unit: 'hPa',
	formatValue: formatWhole,
	formatTick: (value) => `≈${formatWhole(value, false)}`,
	unavailableText: 'Made-up pressure unavailable',
	notShownText: 'Made-up pressure could not be shown',
	yearProgress: false,
	summaries: [
		{
			id: 'month',
			label: 'This month',
			subject: (month) => `made-up pressure in month ${month + 1}`,
			comparedSubject: (month) => ` in month ${month + 1}`,
			ramp: SEVEN_STOP_RAMP,
			scale: CENTRED,
		},
		{
			id: 'annualMean',
			label: 'Yearly mean',
			subject: () => 'yearly mean made-up pressure',
			comparedSubject: () => ', yearly mean',
			ramp: SEVEN_STOP_RAMP,
			scale: CENTRED,
		},
	],
	summarise: (months) => ({ annualMean: meanOf(months) }),
	minSpan: 10,
	observed: null,
	read: ({ winds }) => ({
		status: winds.status,
		result: winds.result,
		months: winds.result?.winds.pressure ?? null,
		progress: null,
	}),
	scheduler: 'winds',
	sunlightStyle: 'darkened',
	summaryControlId: 'made-up-view',
};

/**
 * A solved year of winds over two cells whose pressure differs from month
 * to month: month m holds 1000 + m in the first cell and 1020 + m in the
 * second, so the year's mean is 1015.5.
 */
export const pressureWinds = (offset = 0): SolvedWinds => {
	const months = Array.from({ length: 12 }, (_, m) => m);
	return {
		winds: {
			east: months.map(() => Float32Array.of(1, 0)),
			north: months.map(() => Float32Array.of(0, 1)),
			pressure: months.map((m) =>
				Float32Array.of(1000 + m + offset, 1020 + m + offset),
			),
		},
		temperature: temperatureOf(1),
		dayLengthHours: 24,
	};
};
