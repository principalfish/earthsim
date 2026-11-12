/**
 * The legend of a data layer: its colour ramp with the values marked at
 * round numbers, and a line saying whether what is on the globe describes
 * the world as it is, with the progress of a calculation under way.
 */

import {
	type FieldDifference,
	getGrid,
	isSupportedResolution,
	type TemperatureProgress,
	weightedQuantiles,
} from '../../core/index';
import { type ColourRamp, rampGradient, type ValueRange } from '../globe/ramp';
import type { TemperatureLayer } from '../layers';
import { createElement } from './fields';

/**
 * The narrowest range a scale is fitted to, in degrees Celsius. A field
 * that varies less than this, or not at all, is shown over at least this
 * much, about its middle, so that the ramp is not stretched over a sliver.
 */
export const MIN_FITTED_SPAN_C = 2;

/**
 * The share of a year's weight, by area, a temperature scale leaves out at
 * each end: half a percent, so that the scale spans the middle 99% of the
 * world.
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

/** What the legend says once no result can be calculated. */
export const LEGEND_UNAVAILABLE_TEXT = 'Temperature unavailable';

/**
 * What the legend says when the result is current but the globe shows none
 * of it, as when the globe refused its first field.
 */
export const LEGEND_NOT_SHOWN_TEXT = 'Temperature could not be shown';

/** What the legend says of the calculation before its first year is done. */
export const LEGEND_FIRST_YEAR_TEXT = 'Calculating · first year';

/** Whether a field shown on a scale holds values beyond either of its ends. */
export type ValuesBeyond = {
	/** Whether some value lies below the scale's low end. */
	readonly below: boolean;
	/** Whether some value lies above the scale's high end. */
	readonly above: boolean;
};

/** No value beyond either end of a scale. */
export const NOTHING_BEYOND: ValuesBeyond = { below: false, above: false };

/** A scale fitted to some fields, and whether it leaves values out. */
export type FittedScale = {
	/** The range the scale spans. */
	readonly range: ValueRange;
	/** Whether the fields hold values beyond either end of the range. */
	readonly beyond: ValuesBeyond;
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
 * The scale a year of temperatures is fitted to, the same in every month
 * so that a colour means the same in each, and spanning the middle 99% of
 * the world by area.
 *
 * @remarks
 * Its ends are the weighted quantiles {@link FIT_TAIL_SHARE} in from either
 * end of every value in the fields together, each weighted by its cell's
 * weight, as a cell-month by its cell's area: so a peak or a pole that
 * covers little of the world does not stretch the scale and squeeze the
 * rest into a few colours. Values beyond the ends take the end colours.
 * Before they are rounded, the ends are widened about their middle to
 * {@link MIN_FITTED_SPAN_C} if they are closer than that. They are then
 * rounded outward to whole degrees, the low end down and the high end up,
 * so that the legend's words for what lies beyond them are whole numbers.
 *
 * @param months - The fields, such as the twelve months of a year, each one
 * value per cell. Values that are not numbers or are infinite are passed
 * over.
 * @param weights - What each cell counts for, one per cell, as from
 * {@link cellWeights}.
 * @returns The range, at least {@link MIN_FITTED_SPAN_C} wide with whole
 * ends, and whether any finite value lies below its low end or above its
 * high end.
 * @throws RangeError if no field holds a finite value, or a field or the
 * weights are not as {@link weightedQuantiles} takes them.
 */
export const fitRange = (
	months: readonly Float32Array[],
	weights: ArrayLike<number>,
): FittedScale => {
	const cuts = weightedQuantiles(months, weights, FIT_TAIL_SHARE);
	let { low, high } = cuts;
	if (high - low < MIN_FITTED_SPAN_C) {
		const middle = (low + high) / 2;
		low = middle - MIN_FITTED_SPAN_C / 2;
		high = middle + MIN_FITTED_SPAN_C / 2;
	}
	const range = { min: Math.floor(low), max: Math.ceil(high) };
	return {
		range,
		beyond: {
			below: cuts.lowest < range.min,
			above: cuts.highest > range.max,
		},
	};
};

/**
 * The range a scale of sizes is fitted to, such as the seasonal range: from
 * zero up to the largest value in the field, rounded up to a whole number.
 *
 * @param field - The values, none below zero.
 * @returns From 0 to the largest finite value rounded up to a whole number,
 * or to {@link MIN_FITTED_SPAN_C} if that is smaller. Values that are not
 * numbers or are infinite are passed over.
 * @throws RangeError if the field holds no finite value.
 */
export const fitRangeFromZero = (field: Float32Array): ValueRange => {
	let max = Number.NEGATIVE_INFINITY;
	for (const value of field) {
		if (Number.isFinite(value)) {
			max = Math.max(max, value);
		}
	}
	if (!Number.isFinite(max)) {
		throw new RangeError('A scale needs at least one finite value to fit');
	}
	return { min: 0, max: Math.max(MIN_FITTED_SPAN_C, Math.ceil(max)) };
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
 * @param figures - The mean and root-mean-square difference, in degrees.
 */
export const formatFigures = (figures: FieldDifference): string =>
	`Mean ${signedTenths(figures.meanDifference)} °C · RMS ${(Math.round(figures.rmsDifference * 10) / 10).toFixed(1)} °C`;

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
 * The line the legend shows while a result is being calculated, such as
 * `Calculating · year 3, about 2 to go`.
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
	 * What the legend says at the scale's low end, such as `−34 and below`,
	 * when there are values below it that take its first colour; null when
	 * there are none.
	 */
	readonly below: string | null;
	/**
	 * What the legend says at the scale's high end, such as `29 and above`,
	 * when there are values above it that take its last colour; null when
	 * there are none.
	 */
	readonly above: string | null;
	/**
	 * The error figures of the field on show against the observed one, as
	 * {@link formatFigures} writes them, on a line under the ends; null when
	 * there are none to show.
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
	/** Whether there are values beyond either end of the range. */
	readonly beyond: ValuesBeyond;
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
 * What the legend shows for the temperature layer as it stands.
 *
 * @param layer - The layer, from the store.
 * @param source - The range, ramp and caption the globe is showing the
 * layer with, or null when it shows no scale.
 * @param showsResult - Whether what the globe shows is the layer's own
 * result, and not an earlier one it kept when it refused this one. False
 * whenever it shows no scale.
 * @returns The scale whenever the globe shows one, with a line and, while
 * calculating, a bar. A current result has no line while the globe shows
 * it. While the globe does not, the line is {@link LEGEND_OUT_OF_DATE_TEXT}
 * over the earlier result's scale, which is what the globe then shows, and
 * {@link LEGEND_NOT_SHOWN_TEXT} when there is no scale at all. The scale's
 * ticks are at its own step when it has one, and it says what its end
 * colours stand for at each end that has values beyond it, and gives the
 * source's error figures when it has them.
 */
export const legendContent = (
	layer: TemperatureLayer,
	source: LegendSource | null,
	showsResult: boolean,
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
						label: formatTick(value),
						position: tickPosition(value, source.range),
					})),
					below: source.beyond.below
						? `${formatTick(source.range.min)} and below`
						: null,
					above: source.beyond.above
						? `${formatTick(source.range.max)} and above`
						: null,
					figures:
						source.figures === undefined || source.figures === null
							? null
							: formatFigures(source.figures),
				};
	switch (layer.status) {
		case 'current': {
			if (scale === null) {
				return { scale, status: LEGEND_NOT_SHOWN_TEXT, bar: null };
			}
			return {
				scale,
				status: showsResult ? null : LEGEND_OUT_OF_DATE_TEXT,
				bar: null,
			};
		}
		case 'outOfDate':
			return { scale, status: LEGEND_OUT_OF_DATE_TEXT, bar: null };
		case 'calculating':
			return {
				scale,
				status: progressLine(layer.progress),
				bar: { fraction: progressFraction(layer.progress) },
			};
		case 'unavailable':
			return { scale, status: LEGEND_UNAVAILABLE_TEXT, bar: null };
		case 'empty':
			return { scale, status: LEGEND_EMPTY_TEXT, bar: null };
	}
};

/** The legend on the page. */
export type Legend = {
	/** The legend, to put in its place over the globe. */
	readonly element: HTMLElement;
	/** Shows the content given, or hides the legend for null. */
	show(content: LegendContent | null): void;
};

/**
 * Creates a legend, hidden until it is given something to show.
 *
 * @remarks
 * The status line is a polite live region, so a screen reader announces
 * that the result is out of date or being calculated, without the focus
 * moving. The line is rewritten only when its words change, so the same
 * words are not announced again. While the legend shows, the line is never
 * hidden on its own, only left empty when there is nothing to say, since
 * many screen readers do not announce words written into a region that is
 * hidden at the time; the page keeps room for its line either way. It is
 * hidden only with the whole legend, when the legend is given nothing to
 * show.
 *
 * The caption over the ramp is the scale's own, so it changes with what the
 * scale measures, and is hidden with the scale.
 *
 * What the end colours stand for, such as `−34 and below` and `29 and
 * above`, is on a line of its own under the values marked, each part at its
 * own end, so that it never runs into a value marked near that end. The
 * line, and room for it, is there only while at least one part shows.
 *
 * The error figures, when there are any, are on a line of their own
 * directly under that, and the line, and room for it, is there only while
 * there are.
 *
 * @returns The legend.
 */
export const createLegend = (): Legend => {
	const legend = createElement('div', 'legend');
	legend.hidden = true;

	const title = createElement('p', 'legend__caption');
	const scale = createElement('div', 'legend__scale');
	const ramp = createElement('div', 'legend__ramp');
	const ticks = createElement('div', 'legend__ticks');
	const ends = createElement('p', 'legend__ends');
	const below = createElement('span', 'legend__end legend__end--low');
	const above = createElement('span', 'legend__end legend__end--high');
	ends.append(below, above);
	const figures = createElement('p', 'legend__figures');
	figures.hidden = true;
	scale.append(title, ramp, ticks, ends, figures);

	const status = createElement('p', 'legend__status');
	status.setAttribute('aria-live', 'polite');
	const bar = createElement('progress', 'legend__bar');
	bar.max = 1;
	bar.setAttribute('aria-label', 'Calculation progress');

	legend.append(scale, status, bar);

	return {
		element: legend,
		show: (content) => {
			legend.hidden = content === null;
			if (content === null) {
				return;
			}
			scale.hidden = content.scale === null;
			if (content.scale !== null) {
				if (title.textContent !== content.scale.caption) {
					title.textContent = content.scale.caption;
				}
				ramp.style.background = content.scale.gradient;
				ticks.replaceChildren(
					...content.scale.ticks.map((tick) => {
						const mark = createElement('span', 'legend__tick');
						mark.textContent = tick.label;
						mark.style.left = `${tick.position}%`;
						return mark;
					}),
				);
				below.textContent = content.scale.below ?? '';
				below.hidden = content.scale.below === null;
				above.textContent = content.scale.above ?? '';
				above.hidden = content.scale.above === null;
				ends.hidden =
					content.scale.below === null && content.scale.above === null;
				figures.textContent = content.scale.figures ?? '';
				figures.hidden = content.scale.figures === null;
			}
			const text = content.status ?? '';
			if (status.textContent !== text) {
				status.textContent = text;
			}
			bar.hidden = content.bar === null;
			if (content.bar !== null) {
				// A bar without a value is drawn as one that does not know
				// how far it has come.
				if (content.bar.fraction === null) {
					bar.removeAttribute('value');
				} else {
					bar.value = content.bar.fraction;
				}
			}
		},
	};
};
