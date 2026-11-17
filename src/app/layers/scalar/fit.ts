/**
 * The fitting of a scale to the fields it shows: from end to end of the
 * middle of the world by area, from zero, or about a centre, in a unit and
 * rounded in it, with the weights the cells count for and the writing of a
 * value marked on it.
 */

import {
	getGrid,
	isSupportedResolution,
	weightedQuantiles,
} from '../../../core/index';
import type { ValueRange } from '../../globe/ramp';
import type { UnitSpec } from '../../settings/units';

/**
 * The narrowest range a scale is fitted to unless it is given another: the
 * temperature's, in degrees Celsius. A field that varies less than this, or
 * not at all, is shown over at least this much, about its middle, so that
 * the ramp is not stretched over a sliver.
 */
export const MIN_FITTED_SPAN_C = 2;

/**
 * The share of a year's weight, by area, a scale fitted to a year leaves
 * out at each end: half a percent, so that the scale spans the middle 99%
 * of the world.
 */
export const FIT_TAIL_SHARE = 0.005;

/**
 * The unit a scale is fitted in: how a value converts to it, as
 * {@link UnitSpec} gives it, and to how many decimals its ends are
 * rounded.
 */
export type ScaleUnit = Pick<UnitSpec, 'scale' | 'offset' | 'decimals'>;

/** Values fitted as they are, to whole numbers. */
export const AS_GIVEN: ScaleUnit = { scale: 1, offset: 0, decimals: 0 };

/**
 * A value as a count of steps of a tenth to the power of the decimals,
 * rounded down: the largest count whose value is at or below it, though
 * the value times the steps in one rounds up to a whole number.
 */
const countDown = (value: number, decimals: number): number => {
	const factor = 10 ** decimals;
	const count = Math.floor(value * factor);
	return count / factor > value ? count - 1 : count;
};

/**
 * A value as a count of steps of a tenth to the power of the decimals,
 * rounded up: the smallest count whose value is at or above it.
 */
const countUp = (value: number, decimals: number): number => {
	const factor = 10 ** decimals;
	const count = Math.ceil(value * factor);
	return count / factor < value ? count + 1 : count;
};

/**
 * What each cell of a field counts for when a scale is fitted to it.
 *
 * @remarks
 * A field with as many cells as one of the grids is weighted by that grid's
 * cell areas, since cells differ in area and a scale is to describe the
 * world by area, not by the count of its cells. A field of any other
 * length, which no world has but a test can make, has every cell counted
 * the same.
 *
 * @param cellCount - The cells in the field.
 * @returns One weight per cell: the grid's own areas, which must not be
 * changed, or ones.
 */
export const cellWeights = (cellCount: number): ArrayLike<number> => {
	const n = Math.round(Math.sqrt(cellCount / 6));
	if (isSupportedResolution(n) && 6 * n * n === cellCount) {
		return getGrid(n).areas;
	}
	return new Float64Array(cellCount).fill(1);
};

/**
 * The scale a year of a layer, such as the temperature, is fitted to from
 * end to end, the same in every month so that a colour means the same in
 * each, and spanning the middle 99% of the world by area.
 *
 * @remarks
 * Its ends are the weighted quantiles {@link FIT_TAIL_SHARE} in from either
 * end of every value in the fields together, each weighted by its cell's
 * weight, as a cell-month by its cell's area: so a peak or a pole that
 * covers little of the world does not stretch the scale and squeeze the
 * rest into a few colours. Values beyond the ends take the end colours.
 * The ends are converted to the unit given, and the rest is done in it:
 * before they are rounded, they are widened about their middle to the
 * smallest span if they are closer than that. They are then rounded
 * outward to the unit's decimals, whole numbers for most, the low end down
 * and the high end up, so that the range holds every value between the
 * two quantiles.
 *
 * @param months - The fields, such as the twelve months of a year, each one
 * value per cell. Values that are not numbers or are infinite are passed
 * over.
 * @param weights - What each cell counts for, one per cell, as from
 * {@link cellWeights}.
 * @param minSpan - The smallest span of the scale, above zero, in the
 * unit; {@link MIN_FITTED_SPAN_C} when left out.
 * @param unit - The unit to fit the scale in; the values' own, to whole
 * numbers, when left out.
 * @returns The range in the unit, at least `minSpan` wide with ends of the
 * unit's decimals.
 * @throws RangeError if no field holds a finite value, or a field or the
 * weights are not as {@link weightedQuantiles} takes them.
 */
export const fitRange = (
	months: readonly Float32Array[],
	weights: ArrayLike<number>,
	minSpan: number = MIN_FITTED_SPAN_C,
	unit: ScaleUnit = AS_GIVEN,
): ValueRange => {
	const cuts = weightedQuantiles(months, weights, FIT_TAIL_SHARE);
	let low = cuts.low * unit.scale + unit.offset;
	let high = cuts.high * unit.scale + unit.offset;
	if (high - low < minSpan) {
		const middle = (low + high) / 2;
		low = middle - minSpan / 2;
		high = middle + minSpan / 2;
	}
	const factor = 10 ** unit.decimals;
	return {
		min: countDown(low, unit.decimals) / factor,
		max: countUp(high, unit.decimals) / factor,
	};
};

/**
 * The range a scale of sizes is fitted to, such as the seasonal range: from
 * zero up to the largest value in the field, in the unit given, rounded up
 * to the unit's decimals.
 *
 * @remarks
 * A size is a difference of two values, so it converts by the unit's scale
 * alone: a range of 10 °C is one of 18 °F.
 *
 * @param field - The values, none below zero.
 * @param minSpan - The smallest span of the scale, above zero, in the
 * unit; {@link MIN_FITTED_SPAN_C} when left out.
 * @param unit - The unit to fit the scale in; the values' own, to whole
 * numbers, when left out.
 * @returns From 0 to the largest finite value in the unit, rounded up to
 * its decimals, or to `minSpan` if that is larger. Values that are not
 * numbers or are infinite are passed over.
 * @throws RangeError if the field holds no finite value.
 */
export const fitRangeFromZero = (
	field: Float32Array,
	minSpan: number = MIN_FITTED_SPAN_C,
	unit: ScaleUnit = AS_GIVEN,
): ValueRange => {
	let max = Number.NEGATIVE_INFINITY;
	for (const value of field) {
		if (Number.isFinite(value)) {
			max = Math.max(max, value);
		}
	}
	if (!Number.isFinite(max)) {
		throw new RangeError('A scale needs at least one finite value to fit');
	}
	const largest =
		countUp(max * unit.scale, unit.decimals) / 10 ** unit.decimals;
	return { min: 0, max: Math.max(minSpan, largest) };
};

/**
 * The scale a year of a layer is fitted to about a centre, such as the
 * planet's mean pressure: reaching as far either side of it, the same in
 * every month, and spanning the middle 99% of the world by area.
 *
 * @remarks
 * The centre and the quantiles are converted to the unit given, and the
 * rest is done in it. The centre is rounded to the unit's decimals first,
 * a whole number for most. The scale then reaches either way as far as the
 * further of the weighted quantiles {@link FIT_TAIL_SHARE} in from either
 * end of every value, as for {@link fitRange}, and at least half the
 * smallest span, rounded up to the unit's decimals, so that its ends are
 * of those decimals too. Values beyond the ends take the end colours.
 *
 * @param months - The fields, such as the twelve months of a year, each one
 * value per cell. Values that are not numbers or are infinite are passed
 * over.
 * @param weights - What each cell counts for, one per cell, as from
 * {@link cellWeights}.
 * @param centre - The value the scale is centred on, in the values' own
 * unit; finite.
 * @param minSpan - The smallest span of the scale, above zero, in the
 * unit; {@link MIN_FITTED_SPAN_C} when left out.
 * @param unit - The unit to fit the scale in; the values' own, to whole
 * numbers, when left out.
 * @returns The range in the unit, centred on the rounded centre and at
 * least `minSpan` wide.
 * @throws RangeError if the centre is not finite, if no field holds a
 * finite value, or if a field or the weights are not as
 * {@link weightedQuantiles} takes them.
 */
export const fitRangeCentred = (
	months: readonly Float32Array[],
	weights: ArrayLike<number>,
	centre: number,
	minSpan: number = MIN_FITTED_SPAN_C,
	unit: ScaleUnit = AS_GIVEN,
): ValueRange => {
	if (!Number.isFinite(centre)) {
		throw new RangeError(
			`A scale must be centred on a finite value; got ${centre}`,
		);
	}
	const cuts = weightedQuantiles(months, weights, FIT_TAIL_SHARE);
	const { scale, offset, decimals } = unit;
	const factor = 10 ** decimals;
	// The centre and the reach are counted in steps of the unit's decimals,
	// so that the ends are exactly the decimals they are written as.
	const middleCount = Math.round((centre * scale + offset) * factor);
	const middle = middleCount / factor;
	const reachCount = countUp(
		Math.max(
			middle - (cuts.low * scale + offset),
			cuts.high * scale + offset - middle,
			minSpan / 2,
		),
		decimals,
	);
	return {
		min: (middleCount - reachCount) / factor,
		max: (middleCount + reachCount) / factor,
	};
};

/**
 * A value marked on the scale as the legend writes it, such as `−20`, `0`
 * or `14.5`.
 *
 * @param value - The value; written with up to two decimals.
 */
export const formatTick = (value: number): string => {
	const rounded = Number(value.toFixed(2));
	const digits = Math.abs(rounded).toLocaleString('en-GB', {
		maximumFractionDigits: 2,
	});
	return `${rounded < 0 ? '−' : ''}${digits}`;
};
