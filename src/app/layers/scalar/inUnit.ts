/**
 * A layer's values in the units chosen: a setting given for each unit,
 * the writing of a value in a unit, and the conversion of values and ranges
 * between a unit and the metric one the values are held in.
 */

import type { ValueRange } from '../../globe/ramp';
import {
	convert,
	convertDifference,
	formatNumber,
	type ResolvedUnits,
	SYSTEM_UNITS,
	unitSpec,
} from '../../settings/units';
import type {
	LayerQuantity,
	LayerUnit,
	PerUnit,
	ScalarLayerSpec,
	ScalarSummarySpec,
} from './spec';

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
export const formatInUnit =
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
