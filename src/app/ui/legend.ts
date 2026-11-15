/**
 * The legend of a data layer: its colour ramp with the values marked at
 * round numbers, and a line saying whether what is on the globe describes
 * the world as it is, with the progress of a calculation under way. The
 * legend's block in the info box draws the ramp; the box's one status line
 * says the line, unless the winds have worse to say.
 */

import {
	type FieldDifference,
	getGrid,
	isSupportedResolution,
	type TemperatureProgress,
	weightedQuantiles,
} from '../../core/index';
import { type ColourRamp, rampGradient, type ValueRange } from '../globe/ramp';
import type { LayerStatus } from '../layers';
import type { ScalarLayerReading, ScalarLayerSpec } from '../scalarLayer';
import { createElement } from './fields';

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

/** The most values {@link legendTicks} marks along a scale at its own step. */
export const MAX_LEGEND_TICKS = 6;

/**
 * The most values {@link legendTicks} marks along a scale at a step it is
 * given: room for a label every 5 degrees along a scale up to 55.
 */
export const MAX_STEPPED_TICKS = 12;

/**
 * How far, as a share of its size, a range's end divided by a step may fall
 * short of a whole number and still be taken as that number, so that an
 * end on a tick is marked: `0.3 / 0.05` is `5.999…`, not 6. A few times the
 * rounding of one division.
 */
const TICK_SLACK = 4 * Number.EPSILON;

/**
 * The largest multiple of a step {@link legendTicks} counts to. Up to it,
 * each multiple is a whole number that doubles hold exactly, and
 * {@link TICK_SLACK} of it is less than half a step.
 */
const MAX_TICK_INDEX = 2 ** 48;

/**
 * The first and last whole multiples of a step within a range, as counts
 * of the step. Each end divided by the step is given {@link TICK_SLACK} of
 * room outward, so that an end that is a multiple of the step is counted
 * although its division falls just short.
 */
const tickIndices = (
	min: number,
	max: number,
	step: number,
): { readonly first: number; readonly last: number } => {
	const low = min / step;
	const high = max / step;
	return {
		first: Math.ceil(low - Math.abs(low) * TICK_SLACK),
		last: Math.floor(high + Math.abs(high) * TICK_SLACK),
	};
};

/** What the legend says before there is a result to show. */
export const LEGEND_EMPTY_TEXT = 'Not calculated yet';

/**
 * What the legend says while the result on show is out of date: it
 * describes the world as it was, or it is an earlier result the globe kept
 * when it refused the current one.
 */
export const LEGEND_OUT_OF_DATE_TEXT = 'Out of date';

/**
 * What the legend says of a calculation that tells its years, as the
 * temperature's does, before its first year is done.
 */
export const LEGEND_FIRST_YEAR_TEXT = 'Calculating · first year';

/**
 * What the legend says of a calculation under way that tells nothing of how
 * far it has come.
 */
export const LEGEND_CALCULATING_TEXT = 'Calculating';

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
 * Before they are rounded, the ends are widened about their middle to the
 * smallest span if they are closer than that. They are then rounded
 * outward to whole numbers, the low end down and the high end up.
 *
 * @param months - The fields, such as the twelve months of a year, each one
 * value per cell. Values that are not numbers or are infinite are passed
 * over.
 * @param weights - What each cell counts for, one per cell, as from
 * {@link cellWeights}.
 * @param minSpan - The smallest span of the scale, above zero;
 * {@link MIN_FITTED_SPAN_C} when left out.
 * @returns The range, at least `minSpan` wide with whole ends.
 * @throws RangeError if no field holds a finite value, or a field or the
 * weights are not as {@link weightedQuantiles} takes them.
 */
export const fitRange = (
	months: readonly Float32Array[],
	weights: ArrayLike<number>,
	minSpan: number = MIN_FITTED_SPAN_C,
): ValueRange => {
	let { low, high } = weightedQuantiles(months, weights, FIT_TAIL_SHARE);
	if (high - low < minSpan) {
		const middle = (low + high) / 2;
		low = middle - minSpan / 2;
		high = middle + minSpan / 2;
	}
	return { min: Math.floor(low), max: Math.ceil(high) };
};

/**
 * The range a scale of sizes is fitted to, such as the seasonal range: from
 * zero up to the largest value in the field, rounded up to a whole number.
 *
 * @param field - The values, none below zero.
 * @param minSpan - The smallest span of the scale, above zero;
 * {@link MIN_FITTED_SPAN_C} when left out.
 * @returns From 0 to the largest finite value rounded up to a whole number,
 * or to `minSpan` if that is larger. Values that are not numbers or are
 * infinite are passed over.
 * @throws RangeError if the field holds no finite value.
 */
export const fitRangeFromZero = (
	field: Float32Array,
	minSpan: number = MIN_FITTED_SPAN_C,
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
	return { min: 0, max: Math.max(minSpan, Math.ceil(max)) };
};

/**
 * The scale a year of a layer is fitted to about a centre, such as the
 * planet's mean pressure: reaching as far either side of it, the same in
 * every month, and spanning the middle 99% of the world by area.
 *
 * @remarks
 * The centre is rounded to a whole number first. The scale then reaches
 * either way as far as the further of the weighted quantiles
 * {@link FIT_TAIL_SHARE} in from either end of every value, as for
 * {@link fitRange}, and at least half the smallest span, rounded up to a
 * whole number, so that its ends are whole numbers too. Values beyond the
 * ends take the end colours.
 *
 * @param months - The fields, such as the twelve months of a year, each one
 * value per cell. Values that are not numbers or are infinite are passed
 * over.
 * @param weights - What each cell counts for, one per cell, as from
 * {@link cellWeights}.
 * @param centre - The value the scale is centred on; finite.
 * @param minSpan - The smallest span of the scale, above zero;
 * {@link MIN_FITTED_SPAN_C} when left out.
 * @returns The range, centred on the rounded centre and at least `minSpan`
 * wide.
 * @throws RangeError if the centre is not finite, if no field holds a
 * finite value, or if a field or the weights are not as
 * {@link weightedQuantiles} takes them.
 */
export const fitRangeCentred = (
	months: readonly Float32Array[],
	weights: ArrayLike<number>,
	centre: number,
	minSpan: number = MIN_FITTED_SPAN_C,
): ValueRange => {
	if (!Number.isFinite(centre)) {
		throw new RangeError(
			`A scale must be centred on a finite value; got ${centre}`,
		);
	}
	const cuts = weightedQuantiles(months, weights, FIT_TAIL_SHARE);
	const middle = Math.round(centre);
	const reach = Math.ceil(
		Math.max(middle - cuts.low, cuts.high - middle, minSpan / 2),
	);
	return { min: middle - reach, max: middle + reach };
};

/**
 * The whole multiples of a whole step inside a range, or null for fewer
 * than two of them, more than {@link MAX_STEPPED_TICKS}, or multiples of
 * the step past {@link MAX_TICK_INDEX}, the most counted to for a step
 * chosen as well.
 */
const steppedTicks = (
	min: number,
	max: number,
	step: number,
): number[] | null => {
	const { first, last } = tickIndices(min, max, step);
	if (
		!(Math.abs(first) <= MAX_TICK_INDEX) ||
		!(Math.abs(last) <= MAX_TICK_INDEX) ||
		last - first + 1 > MAX_STEPPED_TICKS
	) {
		return null;
	}
	const ticks: number[] = [];
	for (let k = first; k <= last; k++) {
		const tick = k * step;
		if (tick >= min && tick <= max) {
			// Not -0, which would print as such in some places.
			ticks.push(tick === 0 ? 0 : tick);
		}
	}
	return ticks.length >= 2 ? ticks : null;
};

/**
 * Round values to mark along a scale, all inside it.
 *
 * @remarks
 * The values are the whole multiples, inside the range, of the finest step
 * of 1, 2 or 5 times a power of ten that gives no more than
 * {@link MAX_LEGEND_TICKS} of them, which always gives at least two. Each
 * is the nearest number to its decimal value, so it prints as written, and
 * a value that falls on an end of the range is marked.
 *
 * A scale can be given a step of its own instead, such as every 5 degrees
 * for the seasonal range: then the values are the whole multiples of that
 * step inside the range, ends included, so long as there are from two to
 * {@link MAX_STEPPED_TICKS} of them. For a range so wide that the step
 * gives more, or so narrow that it gives fewer than two, the step is set
 * aside and the values are chosen as above.
 *
 * Doubles cannot keep that promise for every range, so some are refused
 * rather than marked with fewer than two values: one too narrow or too
 * wide for its step to be a finite number above zero (narrower than about
 * 1e-307, or wider than the largest double), and one too narrow for its
 * distance from zero, where the step's multiples at its ends are beyond
 * {@link MAX_TICK_INDEX} (about 2.8e14), as for a range a millionth wide
 * at a billion.
 *
 * @param min - The low end of the scale.
 * @param max - The high end; above `min`.
 * @param step - A step of the scale's own to mark it at, a whole number
 * above zero; left out, the step is chosen as above.
 * @returns The values, lowest first: from two to {@link MAX_LEGEND_TICKS},
 * or to {@link MAX_STEPPED_TICKS} at a step given.
 * @throws RangeError unless both ends are finite and `min` is below `max`,
 * for a step given that is not a whole number above zero, and for a range
 * that cannot be marked at two round values, as above.
 */
export const legendTicks = (
	min: number,
	max: number,
	step?: number,
): number[] => {
	if (!Number.isFinite(min) || !Number.isFinite(max) || !(min < max)) {
		throw new RangeError(
			`A scale must run up from one finite value to another; got ${min} to ${max}`,
		);
	}
	if (step !== undefined) {
		if (!(Number.isSafeInteger(step) && step > 0)) {
			throw new RangeError(
				`A step to mark a scale at must be a whole number above zero; got ${step}`,
			);
		}
		const ticks = steppedTicks(min, max, step);
		if (ticks !== null) {
			return ticks;
		}
	}
	const unmarkable = (): RangeError =>
		new RangeError(
			`A scale from ${min} to ${max} cannot be marked at two round values`,
		);
	// A step of ten to this power gives at least as many multiples in the
	// range as the most ticks, and one of ten to the next power no more, so
	// the step is found within these two powers.
	const start = Math.floor(Math.log10((max - min) / MAX_LEGEND_TICKS));
	const ticks: number[] = [];
	search: for (let power = start; power <= start + 1; power++) {
		for (const mantissa of [1, 2, 5]) {
			// A step of mantissa times ten to the power: a negative power is
			// divided by, which lands on the nearest number to the decimal.
			const scale = 10 ** Math.abs(power);
			const value = (k: number): number =>
				power < 0 ? (k * mantissa) / scale : k * mantissa * scale;
			const step = value(1);
			if (!Number.isFinite(power) || !Number.isFinite(step) || !(step > 0)) {
				throw unmarkable();
			}
			const { first, last } = tickIndices(min, max, step);
			if (
				!(Math.abs(first) <= MAX_TICK_INDEX) ||
				!(Math.abs(last) <= MAX_TICK_INDEX)
			) {
				throw unmarkable();
			}
			if (last - first + 1 <= MAX_LEGEND_TICKS) {
				for (let k = first; k <= last; k++) {
					const tick = value(k);
					if (tick >= min && tick <= max) {
						// Not -0, which would print as such in some places.
						ticks.push(tick === 0 ? 0 : tick);
					}
				}
				break search;
			}
		}
	}
	// The step found gives at least two ticks: the first tried gives at
	// least six, and each after it is at most two and a half times one that
	// gave more than six. This holds to the promise should rounding ever
	// break that, and should the search end without a step.
	if (ticks.length < 2) {
		throw unmarkable();
	}
	return ticks;
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

/**
 * A difference to one decimal as the legend's error figures write it: a
 * true minus sign below zero, a plus sign above it, and `0.0`, with no
 * sign, for one that rounds to zero.
 */
const signedTenths = (value: number): string => {
	const tenths = Math.round(Math.abs(value) * 10);
	const digits = (tenths / 10).toFixed(1);
	if (tenths === 0) {
		return digits;
	}
	return `${value < 0 ? '−' : '+'}${digits}`;
};

/**
 * The error figures of the field on show against another, as the legend
 * writes them under its scale, such as `Mean −0.1 °C · RMS 3.9 °C`.
 *
 * @remarks
 * Both are to one decimal, a half rounded away from zero. The mean
 * difference is signed, `+0.3` above zero and `−0.1` below, and one that
 * rounds to zero is `0.0` with no sign; the root-mean-square difference is
 * never below zero and has no sign.
 *
 * @param figures - The mean and root-mean-square difference, in the
 * layer's unit.
 * @param unit - The layer's unit, such as `°C`.
 */
export const formatFigures = (figures: FieldDifference, unit: string): string =>
	`Mean ${signedTenths(figures.meanDifference)} ${unit} · RMS ${(Math.round(figures.rmsDifference * 10) / 10).toFixed(1)} ${unit}`;

/**
 * Where a value sits along the scale, as a percentage of its length from
 * the low end.
 *
 * @param value - The value.
 * @param range - The scale's range.
 */
export const tickPosition = (value: number, range: ValueRange): number =>
	((value - range.min) / (range.max - range.min)) * 100;

/**
 * The line the legend shows while a result of a layer that tells its years,
 * such as the temperature, is being calculated, such as `Calculating ·
 * year 3, about 2 to go`.
 *
 * @param progress - How far the calculation has come, or null before its
 * first year is done.
 * @returns {@link LEGEND_FIRST_YEAR_TEXT} before the first year is done;
 * the years done; and after them how many more are expected, when there is
 * an estimate, or that this year is the last.
 */
export const progressLine = (progress: TemperatureProgress | null): string => {
	if (progress === null) {
		return LEGEND_FIRST_YEAR_TEXT;
	}
	const done = `Calculating · year ${progress.yearsDone}`;
	const left = progress.estimatedYearsLeft;
	if (left === null) {
		return done;
	}
	if (left === 0) {
		return `${done}, finishing`;
	}
	return `${done}, about ${left} to go`;
};

/**
 * How much of a calculation is done, for the bar under the progress line.
 *
 * @param progress - How far the calculation has come, or null before its
 * first year is done.
 * @returns The years done over the years done and expected to go, from 0
 * to 1; or null when there is nothing to base it on, before the first year
 * and while there is no estimate of the years left.
 */
export const progressFraction = (
	progress: TemperatureProgress | null,
): number | null => {
	if (progress === null || progress.estimatedYearsLeft === null) {
		return null;
	}
	return (
		progress.yearsDone / (progress.yearsDone + progress.estimatedYearsLeft)
	);
};

/** One value marked along the scale. */
export type LegendTick = {
	/** The value as the legend writes it. */
	readonly label: string;
	/** Where it sits, in percent of the scale's length from the low end. */
	readonly position: number;
};

/** A scale the legend draws. */
export type LegendScale = {
	/** What the scale measures, with its unit. */
	readonly caption: string;
	/** The ramp as a CSS gradient from left to right. */
	readonly gradient: string;
	/** The values marked along it. */
	readonly ticks: readonly LegendTick[];
	/**
	 * The error figures of the field on show against the observed one, as
	 * {@link formatFigures} writes them, on a line under the values marked;
	 * null when there are none to show.
	 */
	readonly figures: string | null;
};

/** What the globe shows a layer with, for the legend to draw. */
export type LegendSource = {
	/** The range the layer is shown on. */
	readonly range: ValueRange;
	/** The ramp it is shown with. */
	readonly ramp: ColourRamp;
	/** What the field shown measures, with its unit. */
	readonly caption: string;
	/**
	 * A step of the scale's own to mark it at, as {@link legendTicks} takes
	 * it; left out, the legend chooses one.
	 */
	readonly tickStep?: number;
	/**
	 * The error figures of the field shown against the observed one, or
	 * null or left out when there are none to show.
	 */
	readonly figures?: FieldDifference | null;
};

/** What the legend shows at one moment. */
export type LegendContent = {
	/** The scale of the result on show, or null when there is none. */
	readonly scale: LegendScale | null;
	/**
	 * Where what the legend shows stands, which the line says: `current`
	 * while it describes the world as it is, `outOfDate` also while the
	 * globe keeps an earlier result, and `unavailable` also while the globe
	 * could not take a current one.
	 */
	readonly state: LayerStatus;
	/**
	 * What the legend says of the result, or null when it describes the
	 * world as it is.
	 */
	readonly status: string | null;
	/**
	 * The progress bar, shown while a result is being calculated: its
	 * fraction done, or null while that is not known. Null when no bar is
	 * shown.
	 */
	readonly bar: { readonly fraction: number | null } | null;
};

/**
 * What the legend shows for a layer as it stands.
 *
 * @param layer - The description of the layer chosen: its words for a
 * result that cannot be calculated or shown, and whether its calculation
 * tells its years.
 * @param reading - Where the layer's result stands and how far its
 * calculation has come, from the store.
 * @param source - The range, ramp and caption the globe is showing, or
 * null when it shows no scale.
 * @param showsResult - Whether what the globe shows is the layer's own
 * result, and not an earlier one it kept when it refused this one. False
 * whenever it shows no scale.
 * @param sourceLayer - The description of the layer the source is of: its
 * unit and how its ticks are written. It differs from `layer` only while
 * the globe keeps a field of another layer, having refused the first field
 * of the one chosen; `layer` when left out.
 * @returns The scale whenever the globe shows one, with a line and, while
 * calculating, a bar. A current result has no line while the globe shows
 * it. While the globe does not, the line is {@link LEGEND_OUT_OF_DATE_TEXT}
 * over the earlier result's scale, which is what the globe then shows, and
 * the layer's words for a result not shown when there is no scale at all.
 * While calculating, a layer that tells its years has the line of
 * {@link progressLine} and a bar of {@link progressFraction}, and any other
 * {@link LEGEND_CALCULATING_TEXT} and a bar that does not know how far it
 * has come. The scale's ticks are at its own step when it has one, written
 * as the source's layer writes them, and it gives the source's error
 * figures in that layer's unit when it has them. Values beyond the ends,
 * which the globe draws in the end colours, are not marked.
 */
export const legendContent = (
	layer: ScalarLayerSpec,
	reading: Pick<ScalarLayerReading, 'status' | 'progress'>,
	source: LegendSource | null,
	showsResult: boolean,
	sourceLayer: Pick<ScalarLayerSpec, 'formatTick' | 'unit'> = layer,
): LegendContent => {
	const scale =
		source === null
			? null
			: {
					caption: source.caption,
					gradient: rampGradient(source.ramp),
					ticks: legendTicks(
						source.range.min,
						source.range.max,
						source.tickStep,
					).map((value) => ({
						label: sourceLayer.formatTick(value),
						position: tickPosition(value, source.range),
					})),
					figures:
						source.figures === undefined || source.figures === null
							? null
							: formatFigures(source.figures, sourceLayer.unit),
				};
	switch (reading.status) {
		case 'current': {
			if (scale === null) {
				return {
					scale,
					state: 'unavailable',
					status: layer.notShownText,
					bar: null,
				};
			}
			return showsResult
				? { scale, state: 'current', status: null, bar: null }
				: {
						scale,
						state: 'outOfDate',
						status: LEGEND_OUT_OF_DATE_TEXT,
						bar: null,
					};
		}
		case 'outOfDate':
			return {
				scale,
				state: 'outOfDate',
				status: LEGEND_OUT_OF_DATE_TEXT,
				bar: null,
			};
		case 'calculating':
			return layer.yearProgress
				? {
						scale,
						state: 'calculating',
						status: progressLine(reading.progress),
						bar: { fraction: progressFraction(reading.progress) },
					}
				: {
						scale,
						state: 'calculating',
						status: LEGEND_CALCULATING_TEXT,
						bar: { fraction: null },
					};
		case 'unavailable':
			return {
				scale,
				state: 'unavailable',
				status: layer.unavailableText,
				bar: null,
			};
		case 'empty':
			return { scale, state: 'empty', status: LEGEND_EMPTY_TEXT, bar: null };
	}
};

/** The legend's block on the page. */
export type Legend = {
	/** The block, to put in the info box. */
	readonly element: HTMLElement;
	/**
	 * Shows the scale of the content given, or hides the block for null and
	 * while the content has no scale. The content's line and bar are the
	 * info box's to show.
	 */
	show(content: LegendContent | null): void;
};

/**
 * Creates the legend's block, hidden until it is given a scale to show.
 *
 * @remarks
 * The caption over the ramp is the scale's own, so it changes with what the
 * scale measures.
 *
 * The error figures, when there are any, are on a line of their own
 * under the values marked, and the line, and room for it, is there only
 * while there are.
 *
 * @returns The block.
 */
export const createLegend = (): Legend => {
	const legend = createElement('div', 'legend');
	legend.hidden = true;

	const title = createElement('p', 'legend__caption');
	const ramp = createElement('div', 'legend__ramp');
	const ticks = createElement('div', 'legend__ticks');
	const figures = createElement('p', 'legend__figures');
	figures.hidden = true;
	legend.append(title, ramp, ticks, figures);

	return {
		element: legend,
		show: (content) => {
			const scale = content?.scale ?? null;
			legend.hidden = scale === null;
			if (scale === null) {
				return;
			}
			if (title.textContent !== scale.caption) {
				title.textContent = scale.caption;
			}
			ramp.style.background = scale.gradient;
			ticks.replaceChildren(
				...scale.ticks.map((tick) => {
					const mark = createElement('span', 'legend__tick');
					mark.textContent = tick.label;
					mark.style.left = `${tick.position}%`;
					return mark;
				}),
			);
			figures.textContent = scale.figures ?? '';
			figures.hidden = scale.figures === null;
		},
	};
};
