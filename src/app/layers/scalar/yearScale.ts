/**
 * A year of a layer: its fields, its summaries worked out once, and the
 * scale a view of it is drawn on.
 */

import type { ValueRange } from '../../globe/ramp';
import { unitSpec } from '../../settings/units';
import {
	cellWeights,
	fitRange,
	fitRangeCentred,
	fitRangeFromZero,
} from './fit';
import {
	inUnit,
	isDifferenceView,
	type metricRange,
	metricUnit,
} from './inUnit';
import type {
	LayerUnit,
	ScalarLayerSpec,
	ScalarSummarySpec,
	YearSummaries,
	YearSummary,
} from './spec';

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
