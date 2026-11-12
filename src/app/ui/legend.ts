/**
 * The legend of a data layer: its colour ramp with the values marked at
 * round numbers, and a line saying whether what is on the globe describes
 * the world as it is, with the progress of a calculation under way.
 */

import type { TemperatureProgress } from '../../core/index';
import { type ColourRamp, rampGradient, type ValueRange } from '../globe/ramp';
import type { TemperatureLayer } from '../layers';
import { createElement } from './fields';

/**
 * The narrowest range a scale is fitted to, in degrees Celsius. A field
 * that varies less than this, or not at all, is shown over this much,
 * centred on its middle, so that the ramp is not stretched over a sliver.
 */
export const MIN_FITTED_SPAN_C = 2;

/** The most values {@link legendTicks} marks along a scale. */
export const MAX_LEGEND_TICKS = 6;

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

/**
 * The range a scale is fitted to: from the coldest value to the hottest in
 * any of the fields, so that a colour means the same in every month.
 *
 * @param months - The fields, such as the twelve months of a year.
 * @returns The lowest and highest finite value in any field, widened about
 * its middle to {@link MIN_FITTED_SPAN_C} if narrower. Values that are not
 * numbers or are infinite are passed over.
 * @throws RangeError if no field holds a finite value.
 */
export const fitRange = (months: readonly Float32Array[]): ValueRange => {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const field of months) {
		for (const value of field) {
			if (Number.isFinite(value)) {
				min = Math.min(min, value);
				max = Math.max(max, value);
			}
		}
	}
	if (!Number.isFinite(min) || !Number.isFinite(max)) {
		throw new RangeError('A scale needs at least one finite value to fit');
	}
	if (max - min < MIN_FITTED_SPAN_C) {
		const middle = (min + max) / 2;
		return {
			min: middle - MIN_FITTED_SPAN_C / 2,
			max: middle + MIN_FITTED_SPAN_C / 2,
		};
	}
	return { min, max };
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
 * @returns The values, lowest first: from two to {@link MAX_LEGEND_TICKS}.
 * @throws RangeError unless both ends are finite and `min` is below `max`,
 * and for a range that cannot be marked at two round values, as above.
 */
export const legendTicks = (min: number, max: number): number[] => {
	if (!Number.isFinite(min) || !Number.isFinite(max) || !(min < max)) {
		throw new RangeError(
			`A scale must run up from one finite value to another; got ${min} to ${max}`,
		);
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
			// A little room either way, so that an end that is a multiple of
			// the step is counted although its division falls just short.
			const low = min / step;
			const high = max / step;
			const first = Math.ceil(low - Math.abs(low) * TICK_SLACK);
			const last = Math.floor(high + Math.abs(high) * TICK_SLACK);
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
	/** The ramp as a CSS gradient from left to right. */
	readonly gradient: string;
	/** The values marked along it. */
	readonly ticks: readonly LegendTick[];
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
 * @param range - The range the globe is showing the layer on, or null when
 * it shows no scale.
 * @param ramp - The ramp the globe is showing it with.
 * @param showsResult - Whether what the globe shows is the layer's own
 * result, and not an earlier one it kept when it refused this one. False
 * whenever it shows no scale.
 * @returns The scale whenever the globe shows one, with a line and, while
 * calculating, a bar. A current result has no line while the globe shows
 * it. While the globe does not, the line is {@link LEGEND_OUT_OF_DATE_TEXT}
 * over the earlier result's scale, which is what the globe then shows, and
 * {@link LEGEND_NOT_SHOWN_TEXT} when there is no scale at all.
 */
export const legendContent = (
	layer: TemperatureLayer,
	range: ValueRange | null,
	ramp: ColourRamp,
	showsResult: boolean,
): LegendContent => {
	const scale =
		range === null
			? null
			: {
					gradient: rampGradient(ramp),
					ticks: legendTicks(range.min, range.max).map((value) => ({
						label: formatTick(value),
						position: tickPosition(value, range),
					})),
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
	/** The legend, to put in a panel. */
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
 * @param caption - What the scale measures, with its unit.
 * @returns The legend.
 */
export const createLegend = (caption: string): Legend => {
	const legend = createElement('div', 'legend');
	legend.hidden = true;

	const title = createElement('p', 'legend__caption');
	title.textContent = caption;
	const scale = createElement('div', 'legend__scale');
	const ramp = createElement('div', 'legend__ramp');
	const ticks = createElement('div', 'legend__ticks');
	scale.append(title, ramp, ticks);

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
				ramp.style.background = content.scale.gradient;
				ticks.replaceChildren(
					...content.scale.ticks.map((tick) => {
						const mark = createElement('span', 'legend__tick');
						mark.textContent = tick.label;
						mark.style.left = `${tick.position}%`;
						return mark;
					}),
				);
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
