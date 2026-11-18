/**
 * The sea-level pressure layer: its settings, its words and its
 * description.
 */

import { DIFFERENCE_RAMP, PRESSURE_RAMP } from '../../globe/ramp';
import type { UnitOf } from '../../settings/units';
import { loadObservedPressure } from '../observedData';
import { MONTH_NAMES, SUMMARY_LABELS } from '../view';
import { formatInUnit } from './inUnit';
import type { ObservedComparison, ScalarLayerSpec, ScaleFit } from './spec';

/** What the legend says once no pressure can be calculated. */
export const PRESSURE_UNAVAILABLE_TEXT = 'Pressure unavailable';

/**
 * What the legend says when the pressure is current but the globe shows
 * none of it, as when the globe refused its first field.
 */
export const PRESSURE_NOT_SHOWN_TEXT = 'Pressure could not be shown';

/** The narrowest span, in hectopascals, the pressure's scale is fitted to. */
export const MIN_PRESSURE_SPAN_HPA = 10;

/**
 * The narrowest span the pressure's scale is fitted to in each unit:
 * {@link MIN_PRESSURE_SPAN_HPA} hectopascals and 0.3 inHg.
 */
export const PRESSURE_MIN_SPANS = {
	hPa: MIN_PRESSURE_SPAN_HPA,
	inHg: 0.3,
} as const satisfies Record<UnitOf<'pressure'>, number>;

/**
 * How far the pressure difference's scale reaches either side of zero, in
 * hectopascals: the same for every month and the annual average.
 */
export const PRESSURE_DIFFERENCE_HALF_SPAN_HPA = 20;

/**
 * How far the pressure difference's scale reaches either side of zero in
 * each unit: {@link PRESSURE_DIFFERENCE_HALF_SPAN_HPA} hectopascals and
 * 0.6 inHg.
 */
export const PRESSURE_DIFFERENCE_HALF_SPANS = {
	hPa: PRESSURE_DIFFERENCE_HALF_SPAN_HPA,
	inHg: 0.6,
} as const satisfies Record<UnitOf<'pressure'>, number>;

/** The step, in hectopascals, the pressure difference's legend is marked at. */
export const PRESSURE_DIFFERENCE_TICK_STEP_HPA = 10;

/**
 * The step the pressure difference's legend is marked at in each unit:
 * {@link PRESSURE_DIFFERENCE_TICK_STEP_HPA} hectopascals and 0.3 inHg.
 */
export const PRESSURE_DIFFERENCE_TICK_STEPS = {
	hPa: PRESSURE_DIFFERENCE_TICK_STEP_HPA,
	inHg: 0.3,
} as const satisfies Record<UnitOf<'pressure'>, number>;

/** What the comparison's line says while the observed pressure loads. */
export const OBSERVED_PRESSURE_LOADING_TEXT = 'Loading observed pressure';

/** What the comparison's line says when the observed pressure failed. */
export const OBSERVED_PRESSURE_FAILED_TEXT =
	'Observed pressure could not be loaded';

/**
 * The pressure's comparison with the observed Earth: its observed year
 * from `OBSERVED_PRESSURE_PATH`, and its difference drawn as far either
 * side of zero as {@link PRESSURE_DIFFERENCE_HALF_SPANS} says for the unit,
 * marked at the step {@link PRESSURE_DIFFERENCE_TICK_STEPS} says: ±20 hPa
 * every 10 or ±0.6 inHg every 0.3, in the temperature difference's
 * colours.
 */
export const PRESSURE_OBSERVED: ObservedComparison = {
	load: loadObservedPressure,
	loadingText: OBSERVED_PRESSURE_LOADING_TEXT,
	failedText: OBSERVED_PRESSURE_FAILED_TEXT,
	difference: {
		halfSpan: PRESSURE_DIFFERENCE_HALF_SPANS,
		ramp: DIFFERENCE_RAMP,
		tickStep: PRESSURE_DIFFERENCE_TICK_STEPS,
	},
};

/**
 * The mean of every value of some fields, each weighted by its cell's
 * weight, as the planet's mean over a year is by area.
 */
const weightedMeanOf = (
	months: readonly Float32Array[],
	weights: ArrayLike<number>,
): number => {
	let total = 0;
	let weight = 0;
	for (const month of months) {
		for (let cell = 0; cell < month.length; cell++) {
			const w = weights[cell] as number;
			total += (month[cell] as number) * w;
			weight += w;
		}
	}
	return total / weight;
};

/**
 * The mean of some months cell by cell, as a new field: the annual average
 * of a year's twelve. The total is kept in double precision and divided
 * once, as the winds' own annual mean is, so the two agree to the bit.
 *
 * @param months - The months, each one value per cell. Not changed.
 */
export const meanOfMonths = (months: readonly Float32Array[]): Float32Array => {
	const mean = new Float32Array(months[0]?.length ?? 0);
	for (let cell = 0; cell < mean.length; cell++) {
		let total = 0;
		for (const month of months) {
			total += month[cell] as number;
		}
		mean[cell] = total / months.length;
	}
	return mean;
};

/**
 * A scale centred on the mean of the whole year, its twelve months, over
 * the whole surface by area: one for every month and the annual average.
 */
const CENTRED_ON_YEAR_MEAN: ScaleFit = {
	kind: 'centred',
	centre: weightedMeanOf,
};

/**
 * The sea-level pressure, held in hectopascals, of the winds' calculation.
 *
 * @remarks
 * Its two views are the month on screen and the annual average, the mean
 * of the twelve months cell by cell, both in
 * {@link PRESSURE_RAMP} on one scale centred on the planet's mean over the
 * whole year by area, so that a colour means the same in every month and
 * the near white of the middle is that mean; the far tails are clipped as
 * the centred fit clips them, and the scale is at least as wide as
 * {@link PRESSURE_MIN_SPANS} says. Values and ticks are whole numbers in
 * hectopascals, such as `1,018`, and have two decimals in inHg, such as
 * `30.06`. On the measured Earth it is compared with the observed
 * sea-level pressure, as {@link PRESSURE_OBSERVED} says. It is read from
 * the store's winds, whose status it has, and is calculated with them in
 * the climate's passes. Over it, sunlight is shown as the line between day
 * and night, as over the temperature.
 */
export const PRESSURE_LAYER: ScalarLayerSpec = {
	id: 'pressure',
	label: 'Pressure',
	quantity: 'pressure',
	formatValue: formatInUnit('pressure'),
	formatTick: (value, unit) => formatInUnit('pressure')(value, unit),
	unavailableText: PRESSURE_UNAVAILABLE_TEXT,
	notShownText: PRESSURE_NOT_SHOWN_TEXT,
	summaries: [
		{
			id: 'month',
			label: SUMMARY_LABELS.month,
			subject: (month) => `sea-level pressure in ${MONTH_NAMES[month]}`,
			comparedSubject: (month) => ` in ${MONTH_NAMES[month]}`,
			ramp: PRESSURE_RAMP,
			scale: CENTRED_ON_YEAR_MEAN,
		},
		{
			id: 'annualMean',
			label: SUMMARY_LABELS.annualMean,
			subject: () => 'annual average sea-level pressure',
			comparedSubject: () => ', annual average sea-level pressure',
			ramp: PRESSURE_RAMP,
			scale: CENTRED_ON_YEAR_MEAN,
		},
	],
	summarise: (months) => ({ annualMean: meanOfMonths(months) }),
	minSpan: PRESSURE_MIN_SPANS,
	observed: PRESSURE_OBSERVED,
	read: ({ winds }) => ({
		status: winds.status,
		result: winds.result,
		months: winds.result?.winds.pressure ?? null,
	}),
	sunlightStyle: 'line',
	summaryControlId: 'pressure-view',
};
