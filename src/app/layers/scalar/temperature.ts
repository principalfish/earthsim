/** The temperature layer: its settings, its words and its description. */

import { summariseTemperature } from '../../../core/index';
import {
	DIFFERENCE_RAMP,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from '../../globe/ramp';
import type { UnitOf } from '../../settings/units';
import { loadObservedTemperature } from '../observedData';
import { MONTH_NAMES, SUMMARY_LABELS, type Summary } from '../view';
import { formatTick, MIN_FITTED_SPAN_C } from './fit';
import { formatInUnit } from './inUnit';
import type {
	ObservedComparison,
	ScalarLayerSpec,
	ScalarSummarySpec,
	ScaleFit,
} from './spec';

/** The step, in degrees Celsius, the seasonal range's legend is marked at. */
export const SEASONAL_RANGE_TICK_STEP = 5;

/**
 * The step the seasonal range's legend is marked at in each unit:
 * {@link SEASONAL_RANGE_TICK_STEP} degrees Celsius, 10 °F and 5 K.
 */
export const SEASONAL_RANGE_TICK_STEPS = {
	'°C': SEASONAL_RANGE_TICK_STEP,
	'°F': 10,
	K: 5,
} as const satisfies Record<UnitOf<'temperature'>, number>;

/**
 * The narrowest span the temperature's scales are fitted to in each unit:
 * {@link MIN_FITTED_SPAN_C} degrees Celsius, 4 °F and 2 K.
 */
export const TEMPERATURE_MIN_SPANS = {
	'°C': MIN_FITTED_SPAN_C,
	'°F': 4,
	K: 2,
} as const satisfies Record<UnitOf<'temperature'>, number>;

/**
 * How far the temperature difference's scale reaches either side of zero,
 * in degrees Celsius: the same for every month and summary, the seasonal
 * range's included.
 */
export const DIFFERENCE_HALF_SPAN_C = 20;

/**
 * How far the temperature difference's scale reaches either side of zero
 * in each unit: {@link DIFFERENCE_HALF_SPAN_C} degrees Celsius, 40 °F and
 * 20 K.
 */
export const DIFFERENCE_HALF_SPANS = {
	'°C': DIFFERENCE_HALF_SPAN_C,
	'°F': 40,
	K: 20,
} as const satisfies Record<UnitOf<'temperature'>, number>;

/**
 * The step, in degrees Celsius, the temperature difference's legend is
 * marked at.
 */
export const DIFFERENCE_TICK_STEP = 10;

/**
 * The step the temperature difference's legend is marked at in each unit:
 * {@link DIFFERENCE_TICK_STEP} degrees Celsius, 20 °F and 10 K.
 */
export const DIFFERENCE_TICK_STEPS = {
	'°C': DIFFERENCE_TICK_STEP,
	'°F': 20,
	K: 10,
} as const satisfies Record<UnitOf<'temperature'>, number>;

/** What the comparison's line says while the observed temperature loads. */
export const OBSERVED_LOADING_TEXT = 'Loading observed temperature';

/** What the comparison's line says when the observed temperature failed. */
export const OBSERVED_FAILED_TEXT = 'Observed temperature could not be loaded';

/** What the legend says once no temperature can be calculated. */
export const TEMPERATURE_UNAVAILABLE_TEXT = 'Temperature unavailable';

/**
 * What the legend says when the temperature is current but the globe shows
 * none of it, as when the globe refused its first field.
 */
export const TEMPERATURE_NOT_SHOWN_TEXT = 'Temperature could not be shown';

/** A scale fitted to the whole year, from end to end. */
const END_TO_END: ScaleFit = { kind: 'endToEnd' };

/** A scale from zero up to the largest value of the field shown. */
const FROM_ZERO: ScaleFit = { kind: 'fromZero' };

/** A view of the temperature's year, drawn in the temperature's colours. */
const temperatureSummary = (
	id: Exclude<Summary, 'month' | 'range'>,
	subject: string,
): ScalarSummarySpec => ({
	id,
	label: SUMMARY_LABELS[id],
	subject: () => subject,
	comparedSubject: () => `, ${subject}`,
	ramp: TEMPERATURE_RAMP,
	scale: END_TO_END,
});

/**
 * The temperature's comparison with the observed Earth: its observed year
 * from `OBSERVED_DATA_PATH`, and its difference drawn as far either side of
 * zero as {@link DIFFERENCE_HALF_SPANS} says for the unit, marked at the
 * step {@link DIFFERENCE_TICK_STEPS} says: ±20 °C every 10, ±40 °F every 20
 * or ±20 K every 10.
 */
export const TEMPERATURE_OBSERVED: ObservedComparison = {
	load: loadObservedTemperature,
	loadingText: OBSERVED_LOADING_TEXT,
	failedText: OBSERVED_FAILED_TEXT,
	difference: {
		halfSpan: DIFFERENCE_HALF_SPANS,
		ramp: DIFFERENCE_RAMP,
		tickStep: DIFFERENCE_TICK_STEPS,
	},
};

/**
 * The near-surface air temperature, held in degrees Celsius.
 *
 * @remarks
 * Its five views are the month on screen, the annual average, the warmest
 * and the coldest month, all four in {@link TEMPERATURE_RAMP} on one scale
 * fitted to the whole year, and the seasonal range, the warmest less the
 * coldest, a difference of temperatures, in {@link SEASONAL_RANGE_RAMP} on
 * a scale of its own from zero, marked at the step
 * {@link SEASONAL_RANGE_TICK_STEPS} gives the unit. Its scales are at least
 * as wide as {@link TEMPERATURE_MIN_SPANS} says. Its values and ticks are
 * whole numbers in every unit, but for a tick of a narrow scale. On the
 * measured Earth it is compared with the observed temperature, as
 * {@link TEMPERATURE_OBSERVED} says. It is read from the store's
 * temperature, whose calculation tells its years, and is calculated by the
 * temperature. Over it, sunlight is shown as the line between day and
 * night.
 */
export const TEMPERATURE_LAYER: ScalarLayerSpec = {
	id: 'temperature',
	label: 'Temperature',
	quantity: 'temperature',
	formatValue: formatInUnit('temperature'),
	formatTick: (value) => formatTick(value),
	unavailableText: TEMPERATURE_UNAVAILABLE_TEXT,
	notShownText: TEMPERATURE_NOT_SHOWN_TEXT,
	yearProgress: true,
	summaries: [
		{
			id: 'month',
			label: SUMMARY_LABELS.month,
			subject: (month) => `air temperature in ${MONTH_NAMES[month]}`,
			comparedSubject: (month) => ` in ${MONTH_NAMES[month]}`,
			ramp: TEMPERATURE_RAMP,
			scale: END_TO_END,
		},
		temperatureSummary('annualMean', 'annual average air temperature'),
		temperatureSummary('warmest', 'air temperature in the warmest month'),
		temperatureSummary('coldest', 'air temperature in the coldest month'),
		{
			id: 'range',
			label: SUMMARY_LABELS.range,
			// Says that it is a difference of temperatures, so that it is not
			// read as one.
			subject: () =>
				'seasonal range: difference between the warmest and coldest months',
			comparedSubject: () => ', seasonal range',
			ramp: SEASONAL_RANGE_RAMP,
			scale: FROM_ZERO,
			tickStep: SEASONAL_RANGE_TICK_STEPS,
		},
	],
	summarise: summariseTemperature,
	minSpan: TEMPERATURE_MIN_SPANS,
	observed: TEMPERATURE_OBSERVED,
	read: ({ temperature }) => ({
		status: temperature.status,
		result: temperature.result,
		months: temperature.result?.months ?? null,
		progress: temperature.progress,
	}),
	sunlightStyle: 'line',
	summaryControlId: 'temperature-view',
};
