/**
 * The layers that colour the globe by one computed value per cell, each as
 * a description: everything the layer panel, the legend, the cursor
 * readout, the top bar's Show choice, the date line and the globe's lighting
 * need to know of a layer to show it. Each takes a description as data, so
 * that another such layer is added by describing it.
 *
 * The page offers two: the temperature, {@link TEMPERATURE_LAYER}, and the
 * sea-level pressure, {@link PRESSURE_LAYER}.
 */

import {
	type MonthlyTemperature,
	type Resolution,
	summariseTemperature,
	type TemperatureProgress,
} from '../../core/index';
import type { SunlightStyle } from '../globe/material';
import {
	type ColourRamp,
	DIFFERENCE_RAMP,
	PRESSURE_RAMP,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
	type ValueRange,
} from '../globe/ramp';
import {
	convert,
	convertDifference,
	formatNumber,
	type Quantity,
	type ResolvedUnits,
	SYSTEM_UNITS,
	type UnitOf,
	unitLabel,
	unitSpec,
} from '../settings/units';
import {
	cellWeights,
	fitRange,
	fitRangeCentred,
	fitRangeFromZero,
	formatTick,
	MIN_FITTED_SPAN_C,
} from '../ui/legend';
import type { LayerStatus, LayerStore } from './layers';
import {
	loadObservedPressure,
	loadObservedTemperature,
	type ObservedLoader,
} from './observedData';
import {
	isScalarLayer,
	type Layer,
	MONTH_NAMES,
	SCALAR_LAYER_IDS,
	type ScalarLayerId,
	type Source,
	SUMMARY_LABELS,
	type Summary,
} from './view';

/** The summaries of a year, worked out from its twelve months. */
export type YearSummary = Exclude<Summary, 'month'>;

/** The quantities the computed layers measure. */
export type LayerQuantity = Extract<Quantity, 'temperature' | 'pressure'>;

/** A unit of a quantity a computed layer measures, such as `°F` or `inHg`. */
export type LayerUnit = UnitOf<LayerQuantity>;

/**
 * A setting of a scale given for each unit of a layer's quantity, such as
 * its narrowest span: a round number in each unit, chosen for it rather
 * than converted from another, so that a scale is as round in °F or inHg
 * as in °C or hPa.
 */
export type PerUnit = Readonly<Partial<Record<LayerUnit, number>>>;

/**
 * A setting in a unit.
 *
 * @param setting - The setting, for each unit of a layer's quantity.
 * @param unit - The unit.
 * @throws RangeError if the setting gives nothing for the unit.
 */
export const inUnit = (setting: PerUnit, unit: LayerUnit): number => {
	const value = setting[unit];
	if (value === undefined) {
		throw new RangeError(`No setting is given in ${unit}`);
	}
	return value;
};

/**
 * The fields of the summaries a layer offers, each one value per cell, as
 * worked out from its year: one for each summary it offers but the Month.
 */
export type YearSummaries = Readonly<
	Partial<Record<YearSummary, Float32Array>>
>;

/**
 * How the scale a view of a layer's year is drawn on is fitted.
 *
 * - `endToEnd`: to the whole year, its twelve months together, from end to
 *   end of the middle 99% of the world by area, as `fitRange` fits it.
 * - `fromZero`: from zero up to the largest value of the field shown, as
 *   for a size such as the seasonal range.
 * - `centred`: to the whole year, as far either side of a centre worked out
 *   from it, such as the planet's mean.
 *
 * The views of a layer fitted end to end share one scale, and so do those
 * centred, so that a colour means the same in each.
 */
export type ScaleFit =
	| { readonly kind: 'endToEnd' }
	| { readonly kind: 'fromZero' }
	| {
			readonly kind: 'centred';
			/**
			 * The value the scale is centred on, from the months it is fitted to
			 * and each cell's weight by area.
			 */
			readonly centre: (
				months: readonly Float32Array[],
				weights: ArrayLike<number>,
			) => number;
	  };

/** A view of a layer's year that the layer offers. */
export type ScalarSummarySpec = {
	/** Which view it is. */
	readonly id: Summary;
	/** Its name on the page, in the Show control, the date line and the readout. */
	readonly label: string;
	/**
	 * What it shows, in lower case, for the legend's caption to name, such as
	 * `air temperature in July`.
	 *
	 * @param month - The month on screen, from January at 0.
	 */
	readonly subject: (month: number) => string;
	/**
	 * What the difference between simulated and observed is of, as the
	 * legend's caption adds it after `Simulated less observed`, such as ` in
	 * July`.
	 *
	 * @param month - The month on screen, from January at 0.
	 */
	readonly comparedSubject: (month: number) => string;
	/** The colours it is drawn in. */
	readonly ramp: ColourRamp;
	/** How its scale is fitted. */
	readonly scale: ScaleFit;
	/**
	 * A step of the scale's own to mark the legend at, in each unit; left
	 * out, the legend chooses one.
	 */
	readonly tickStep?: PerUnit;
};

/** How the difference between simulated and observed is drawn. */
export type DifferenceScale = {
	/** How far the scale reaches either side of zero, in each unit. */
	readonly halfSpan: PerUnit;
	/** The colours it is drawn in, centred on no difference. */
	readonly ramp: ColourRamp;
	/** The step its legend is marked at, in each unit. */
	readonly tickStep: PerUnit;
};

/**
 * The comparison a layer offers with the observed Earth: what loads the
 * observed year, what the page says of it and how the difference is
 * drawn.
 */
export type ObservedComparison = {
	/** Loads the observed year on a world's grid from its file. */
	readonly load: ObservedLoader;
	/** What the comparison's line says while the observed year loads. */
	readonly loadingText: string;
	/** What the comparison's line says when it could not be loaded. */
	readonly failedText: string;
	/** How the difference is drawn. */
	readonly difference: DifferenceScale;
};

/** A layer's result as the store holds it, read for showing. */
export type ScalarLayerReading = {
	/** Where the result stands against the world. */
	readonly status: LayerStatus;
	/**
	 * The store's result the months are part of: the very object, so that it
	 * can be told apart from any later result. Null when there is none.
	 */
	readonly result: object | null;
	/**
	 * The year's twelve months, January first, one value per cell in the
	 * metric unit of the layer's quantity: null exactly when the result is.
	 */
	readonly months: readonly Float32Array[] | null;
	/**
	 * How far the calculation under way has come, as last told: null for a
	 * layer whose calculation tells nothing, and as the store has it for one
	 * that tells its years.
	 */
	readonly progress: TemperatureProgress | null;
};

/** What a layer's result is read from: the page's layer store. */
export type ScalarLayerStore = Pick<LayerStore, 'temperature' | 'winds'>;

/** A layer that colours the globe by one computed value per cell. */
export type ScalarLayerSpec = {
	/** Which layer it is. */
	readonly id: ScalarLayerId;
	/** Its name on the page, in the choice of layer. */
	readonly label: string;
	/**
	 * What its values measure. They are held in the quantity's metric unit
	 * and written in the unit chosen for it.
	 */
	readonly quantity: LayerQuantity;
	/**
	 * A value as the readout writes it before the unit, such as `−18`.
	 *
	 * @param value - The value, in the unit.
	 * @param unit - The unit it is written in, one of the layer's quantity.
	 * @param signed - Whether a value above zero is written with a plus
	 * sign, as for a difference.
	 */
	readonly formatValue: (
		value: number,
		unit: LayerUnit,
		signed: boolean,
	) => string;
	/**
	 * A value marked on the legend's scale as it writes it, such as `−20`.
	 *
	 * @param value - The value, in the unit.
	 * @param unit - The unit the scale is written in, one of the layer's
	 * quantity.
	 */
	readonly formatTick: (value: number, unit: LayerUnit) => string;
	/** What the legend says once no result can be calculated. */
	readonly unavailableText: string;
	/**
	 * What the legend says when the result is current but the globe shows
	 * none of it, as when the globe refused its first field.
	 */
	readonly notShownText: string;
	/**
	 * Whether its calculation tells how far it has come, year by year, as the
	 * temperature's does: the legend then says which year it is on and how
	 * many are left, once it can tell that, and with its bar how far it has
	 * come.
	 */
	readonly yearProgress: boolean;
	/**
	 * The views of its year it offers, in the order the Show control lists
	 * them: the Month view among them, which a layer opens on.
	 */
	readonly summaries: readonly ScalarSummarySpec[];
	/**
	 * Works out the summaries it offers from a year's twelve months: new
	 * arrays, one value per cell, for every summary offered but the Month.
	 */
	readonly summarise: (months: readonly Float32Array[]) => YearSummaries;
	/** The narrowest span its scales are fitted to, in each unit. */
	readonly minSpan: PerUnit;
	/**
	 * The comparison it offers with the observed Earth, or null for none: its
	 * source is then always the simulation.
	 */
	readonly observed: ObservedComparison | null;
	/** Reads its result from the store. */
	readonly read: (store: ScalarLayerStore) => ScalarLayerReading;
	/**
	 * How the globe is lit over it while the sun lights the globe: with the
	 * line between day and night drawn over colours shaded as without the
	 * sun, so that a darkened colour is not read as another value, or with
	 * the night side darkened.
	 */
	readonly sunlightStyle: Exclude<SunlightStyle, 'off'>;
	/** The id of its Show control, the drop-down of the views it offers. */
	readonly summaryControlId: string;
};

/** Gives a layer's observed year on a world's grid. */
export type ScalarObservedLoader = (
	layer: ScalarLayerSpec,
	resolution: Resolution,
) => Promise<MonthlyTemperature>;

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

/**
 * A value rounded to a whole number, a half upwards, as the readout writes
 * it: its digits grouped in threes and a true minus sign, and, signed, a
 * plus sign above zero. A value that rounds to zero is `0`, never `−0` or
 * `+0`.
 *
 * @param value - The value.
 * @param signed - Whether a value above zero has a plus sign.
 */
export const formatWhole = (value: number, signed: boolean): string =>
	formatNumber(value, 0, signed);

/**
 * Writes a value of a quantity in one of its units, to the unit's
 * decimals, as {@link formatNumber} writes it: `−18` in °C, `1,018` in hPa
 * and `30.06` in inHg.
 *
 * @param quantity - The quantity.
 * @returns A writer of a value in a unit of the quantity, which throws a
 * RangeError for a unit of another.
 */
const formatInUnit =
	(quantity: LayerQuantity) =>
	(value: number, unit: LayerUnit, signed = false): string =>
		formatNumber(value, unitSpec(quantity, unit).decimals, signed);

/**
 * The unit a layer is written in, of those chosen.
 *
 * @param layer - The layer's description.
 * @param units - The unit chosen for each quantity.
 */
export const layerUnit = (
	layer: Pick<ScalarLayerSpec, 'quantity'>,
	units: ResolvedUnits,
): LayerUnit => units[layer.quantity];

/**
 * The metric unit of a layer's quantity, which its values are held in.
 *
 * @param layer - The layer's description.
 */
export const metricUnit = (
	layer: Pick<ScalarLayerSpec, 'quantity'>,
): LayerUnit => SYSTEM_UNITS.metric[layer.quantity];

/**
 * A value of a layer, held in its quantity's metric unit, in a unit.
 *
 * @param layer - The layer's description.
 * @param unit - The unit, one of the layer's quantity.
 * @param metricValue - The value.
 * @param isDifference - Whether it is a difference of two values, which
 * converts by the unit's scale alone.
 */
export const toLayerUnit = (
	layer: Pick<ScalarLayerSpec, 'quantity'>,
	unit: LayerUnit,
	metricValue: number,
	isDifference: boolean,
): number =>
	isDifference
		? convertDifference(layer.quantity, unit, metricValue)
		: convert(layer.quantity, unit, metricValue);

/**
 * A range in a unit as a range of the metric values a layer holds, as the
 * globe colours them by.
 *
 * @param layer - The layer's description.
 * @param unit - The unit the range is in, one of the layer's quantity.
 * @param range - The range.
 * @param isDifference - Whether its values are differences of two values,
 * which convert by the unit's scale alone.
 */
export const metricRange = (
	layer: Pick<ScalarLayerSpec, 'quantity'>,
	unit: LayerUnit,
	range: ValueRange,
	isDifference: boolean,
): ValueRange => {
	const { scale, offset } = unitSpec(layer.quantity, unit);
	const shift = isDifference ? 0 : offset;
	return { min: (range.min - shift) / scale, max: (range.max - shift) / scale };
};

/**
 * Whether a view's values are differences of its layer's quantity: those
 * of a view fitted from zero, such as the seasonal range, the warmest
 * month less the coldest. They are spans of the quantity, not values of
 * it, so they convert to another unit by its scale alone: a range of
 * 10 °C is one of 18 °F, not 50 °F. A view fitted end to end or centred
 * shows values of the quantity, as its scale, fitted over the year's
 * months, is. Its scale, its legend and the values the globe colours by
 * all convert as this says.
 *
 * @param view - The view of the year.
 */
export const isDifferenceView = (
	view: Pick<ScalarSummarySpec, 'scale'>,
): boolean => view.scale.kind === 'fromZero';

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
 * Where the winds and the pressure stand for showing, from where the
 * temperature and the winds do: what the pressure's legend and the info
 * box's status line say of them.
 *
 * @remarks
 * The winds are worked out from the temperature, and are not asked for
 * until there is one. So while there are no winds at all and the
 * temperature is being worked out, the winds are being worked out too,
 * since they follow it. Otherwise they stand where the store's winds do;
 * the store itself makes the winds unavailable when the temperature is.
 *
 * @param temperature - Where the temperature stands.
 * @param winds - Where the winds stand.
 */
export const windsStatus = (
	temperature: LayerStatus,
	winds: LayerStatus,
): LayerStatus =>
	winds === 'empty' && temperature === 'calculating' ? 'calculating' : winds;

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
 * the store's winds, whose calculation tells nothing of its progress, and
 * is calculated by the winds; before the
 * first winds it is being calculated while the temperature the winds wait
 * for is, as {@link windsStatus} says. Over it, sunlight is shown as the
 * line between day and night, as over the temperature.
 */
export const PRESSURE_LAYER: ScalarLayerSpec = {
	id: 'pressure',
	label: 'Pressure',
	quantity: 'pressure',
	formatValue: formatInUnit('pressure'),
	formatTick: (value, unit) => formatInUnit('pressure')(value, unit),
	unavailableText: PRESSURE_UNAVAILABLE_TEXT,
	notShownText: PRESSURE_NOT_SHOWN_TEXT,
	yearProgress: false,
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
	read: ({ temperature, winds }) => ({
		status: windsStatus(temperature.status, winds.status),
		result: winds.result,
		months: winds.result?.winds.pressure ?? null,
		progress: null,
	}),
	sunlightStyle: 'line',
	summaryControlId: 'pressure-view',
};

/** The description of each layer that colours the globe by a value per cell. */
export const SCALAR_LAYER_SPECS: Readonly<
	Record<ScalarLayerId, ScalarLayerSpec>
> = {
	temperature: TEMPERATURE_LAYER,
	pressure: PRESSURE_LAYER,
};

/**
 * The layers the page offers that colour the globe by a value per cell, in
 * the order the choice of layer lists them, after Terrain.
 */
export const SCALAR_LAYERS: readonly ScalarLayerSpec[] = SCALAR_LAYER_IDS.map(
	(id) => SCALAR_LAYER_SPECS[id],
);

/**
 * The description of a layer the page offers, or null for the terrain.
 *
 * @param layer - The layer.
 */
export const scalarLayerOf = (layer: Layer): ScalarLayerSpec | null =>
	isScalarLayer(layer) ? SCALAR_LAYER_SPECS[layer] : null;

/**
 * Whether a layer offers a view of its year.
 *
 * @param layer - The layer's description.
 * @param summary - The view.
 */
export const offersSummary = (
	layer: ScalarLayerSpec,
	summary: Summary,
): boolean => layer.summaries.some((offered) => offered.id === summary);

/**
 * A view of a layer's year as the layer describes it.
 *
 * @param layer - The layer's description.
 * @param summary - The view, one the layer offers.
 * @throws RangeError if the layer does not offer it.
 */
export const summaryOf = (
	layer: ScalarLayerSpec,
	summary: Summary,
): ScalarSummarySpec => {
	const found = layer.summaries.find((offered) => offered.id === summary);
	if (found === undefined) {
		throw new RangeError(`The ${layer.id} layer does not offer ${summary}`);
	}
	return found;
};

/**
 * Loads a layer's observed year through the loader its description gives.
 *
 * @param layer - The layer's description.
 * @param resolution - Cells along a face edge of the world's grid.
 * @returns The loader's promise; one that rejects for a layer with no
 * comparison.
 */
export const loadLayerObserved: ScalarObservedLoader = (layer, resolution) =>
	layer.observed === null
		? Promise.reject(
				new Error(`The ${layer.id} layer has no observed year to load`),
			)
		: layer.observed.load(resolution);

/** A text with its first letter in capitals. */
const capitalised = (text: string): string =>
	`${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * What a layer's legend says the scale measures, for a view of its year,
 * the month on screen and, where the layer is compared with the observed
 * Earth, where the field comes from.
 *
 * @param layer - The layer's description, which words what each view
 * shows.
 * @param summary - What of the year is shown, a view the layer offers.
 * @param month - The month on screen, from January at 0; read only for the
 * Month view.
 * @param source - Where the field shown comes from, when the world is one
 * the comparison is offered for; left out, the caption names no source.
 * @param unit - The unit the scale is written in, one of the layer's
 * quantity; its metric unit when left out.
 * @returns For the temperature, such as `Air temperature in July, °C`,
 * `Observed air temperature in July, °F` or `Simulated less observed in
 * July, K`. The seasonal range's, but for its difference, says that it is
 * a difference of temperatures.
 * @throws RangeError if the layer does not offer the view, or the unit is
 * not one of its quantity.
 */
export const layerCaption = (
	layer: ScalarLayerSpec,
	summary: Summary,
	month: number,
	source?: Source,
	unit: LayerUnit = metricUnit(layer),
): string => {
	const view = summaryOf(layer, summary);
	const subject = view.subject(month);
	const label = unitLabel(layer.quantity, unit);
	switch (source) {
		case undefined:
			return `${capitalised(subject)}, ${label}`;
		case 'simulated':
			return `Simulated ${subject}, ${label}`;
		case 'observed':
			return `Observed ${subject}, ${label}`;
		case 'difference':
			return `Simulated less observed${view.comparedSubject(month)}, ${label}`;
	}
};

/**
 * A field of a year: a month, from January at 0, or a summary of the
 * twelve.
 */
export type YearFieldKey = number | YearSummary;

/**
 * A year of a layer, simulated or observed, its summaries worked out when
 * first needed and then kept with it.
 */
export type LayerYear = {
	/** The twelve months, January first, one value per cell. */
	readonly months: readonly Float32Array[];
	/** Its summaries, once worked out. */
	summary?: YearSummaries;
};

/**
 * What the scale of a view of a year is kept by: the views fitted from end
 * to end share one, as do those centred; one from zero is the field's own.
 *
 * @param view - The view.
 * @param key - The field it shows.
 */
export const scaleKey = (view: ScalarSummarySpec, key: YearFieldKey): string =>
	view.scale.kind === 'fromZero' ? `fromZero ${key}` : view.scale.kind;

/**
 * The summaries of a layer's year, worked out the first time they are
 * asked for and kept with the year.
 *
 * @param layer - The layer's description, which works them out.
 * @param year - The year.
 */
export const yearSummaries = (
	layer: ScalarLayerSpec,
	year: LayerYear,
): YearSummaries => {
	year.summary ??= layer.summarise(year.months);
	return year.summary;
};

/**
 * A field of a layer's year: one of its months, or one of its summaries.
 *
 * @param layer - The layer's description.
 * @param year - The year.
 * @param key - The field.
 * @returns The year's own array for a month, and the one kept with it for
 * a summary.
 * @throws RangeError if the layer's summaries do not give the summary.
 */
export const yearField = (
	layer: ScalarLayerSpec,
	year: LayerYear,
	key: YearFieldKey,
): Float32Array => {
	if (typeof key === 'number') {
		return year.months[key] as Float32Array;
	}
	const field = yearSummaries(layer, year)[key];
	if (field === undefined) {
		throw new RangeError(`The ${layer.id} layer gives no ${key} summary`);
	}
	return field;
};

/**
 * The scale a view of a layer's year is drawn on, in a unit, fitted as the
 * view says to one year, or to a simulated and an observed year together,
 * at least the layer's smallest span in that unit wide.
 *
 * @remarks
 * The values are converted to the unit first, and the scale is fitted and
 * rounded in it, so that its ends are round in that unit: whole numbers in
 * °F and K as in °C, and of two decimals in inHg. A scale fitted end to
 * end or centred is fitted to every month of the years together, each
 * cell weighted by area as {@link cellWeights} gives it. One from zero
 * runs up to the largest of the field's in each year, as
 * {@link fitRangeFromZero} fits it. The values of a view of differences,
 * as {@link isDifferenceView} says, are converted by the unit's scale
 * alone.
 *
 * @param layer - The layer's description.
 * @param view - The view of the year.
 * @param years - The years to fit it to, each on the same grid.
 * @param key - The field the view shows.
 * @param unit - The unit, one of the layer's quantity; its metric unit
 * when left out.
 * @returns The range in the unit; {@link metricRange} gives the values the
 * globe colours by.
 * @throws RangeError if the unit is not one of the layer's quantity.
 */
export const fitSummaryScale = (
	layer: ScalarLayerSpec,
	view: ScalarSummarySpec,
	years: readonly LayerYear[],
	key: YearFieldKey,
	unit: LayerUnit = metricUnit(layer),
): ValueRange => {
	const fit = view.scale;
	const unitOf = unitSpec(layer.quantity, unit);
	const spec = isDifferenceView(view) ? { ...unitOf, offset: 0 } : unitOf;
	const minSpan = inUnit(layer.minSpan, unit);
	if (fit.kind === 'fromZero') {
		return {
			min: 0,
			max: Math.max(
				...years.map(
					(year) =>
						fitRangeFromZero(yearField(layer, year, key), minSpan, spec).max,
				),
			),
		};
	}
	const months = years.flatMap((year) => year.months);
	const weights = cellWeights(months[0]?.length ?? 0);
	return fit.kind === 'endToEnd'
		? fitRange(months, weights, minSpan, spec)
		: fitRangeCentred(
				months,
				weights,
				fit.centre(months, weights),
				minSpan,
				spec,
			);
};
