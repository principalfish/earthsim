/**
 * The date line under the world's description: the world's age and, in
 * Temperature view, the month on screen or the summary shown, such as
 * `Year 0 · July`, and in Terrain view the month on screen while the globe
 * is lit by the sun.
 */

import {
	MONTH_NAMES,
	offersMonth,
	type PageView,
	TEMPERATURE_VIEW_LABELS,
} from '../view';

/** What separates the parts of the date line. */
const PART_SEPARATOR = ' · ';

/** The first age written as years gone by rather than as a year. */
const YEARS_FROM = 10_000;

/** The first age written in millions of years. */
const MILLIONS_FROM = 1_000_000;

/** The first age written in billions of years. */
const BILLIONS_FROM = 1_000_000_000;

/**
 * A number with its digits grouped in threes and at most one decimal, such
 * as `12,345` or `2.4`.
 */
const grouped = (value: number): string =>
	value.toLocaleString('en-GB', { maximumFractionDigits: 1 });

/**
 * A world's age as the date line writes it.
 *
 * @remarks
 * Below ten thousand years the age is a year, counted from Year 0, the
 * world's first: `Year 0`, `Year 1,234`. From there to a million it is the
 * whole years gone by, `12,345 years`; then millions of years to a tenth,
 * `2.4 million years`, and from a thousand million, billions to a tenth,
 * `4.5 billion years`. Each is rounded down, so an age is never written as
 * one it has not reached: 2,499,999 years is `2.4 million years`, and
 * 999,999 years is not yet `1 million years`.
 *
 * @param years - The age, a finite number of years from zero up.
 */
export const formatWorldAge = (years: number): string => {
	if (years < YEARS_FROM) {
		return `Year ${grouped(Math.floor(years))}`;
	}
	if (years < MILLIONS_FROM) {
		return `${grouped(Math.floor(years))} years`;
	}
	// Millions and billions alike are divided down to tenths first, so that
	// a tenth is counted whole rather than as a binary fraction just short
	// of it.
	if (years < BILLIONS_FROM) {
		return `${grouped(Math.floor(years / (MILLIONS_FROM / 10)) / 10)} million years`;
	}
	return `${grouped(Math.floor(years / (BILLIONS_FROM / 10)) / 10)} billion years`;
};

/**
 * The date line for a world's age and what the globe shows.
 *
 * @param years - The world's age, as for {@link formatWorldAge}.
 * @param view - What the globe shows.
 * @returns The age and the month on screen, `Year 0 · July`, wherever the
 * month can be chosen, as {@link offersMonth} says: in the Month view, and
 * in Terrain view while the globe is lit by the sun. Otherwise in
 * Temperature view the age and the summary shown, `Year 0 · Annual
 * average`, and in Terrain view the age alone, `Year 0`.
 */
export const dateLineText = (years: number, view: PageView): string => {
	const age = formatWorldAge(years);
	if (offersMonth(view)) {
		return [age, MONTH_NAMES[view.month]].join(PART_SEPARATOR);
	}
	if (view.layer !== 'temperature') {
		return age;
	}
	return [age, TEMPERATURE_VIEW_LABELS[view.temperatureView]].join(
		PART_SEPARATOR,
	);
};

/** What the date line starts on and where it is written. */
export type DateLineOptions = {
	/** The world's age at first. */
	readonly years: number;
	/** What the globe shows at first. */
	readonly view: PageView;
	/** Writes the line on the page. */
	readonly show: (text: string) => void;
};

/** The date line, kept up to date with the world's age and the view. */
export type DateLine = {
	/** Takes the world's age, as when another world arrives. */
	setYears(years: number): void;
	/** Takes what the globe shows, as when the month on screen moves on. */
	setView(view: PageView): void;
};

/**
 * Keeps the date line up to date, writing it at once.
 *
 * @remarks
 * The line is written again only when its words change, so the month
 * moving on rewrites it but a view setting it does not mention, such as
 * the month while a summary is shown, does not.
 *
 * @param options - The starting age and view, and where to write the line.
 * @returns The date line.
 */
export const createDateLine = (options: DateLineOptions): DateLine => {
	let { years, view } = options;
	let written: string | null = null;
	const write = (): void => {
		const text = dateLineText(years, view);
		if (text !== written) {
			written = text;
			options.show(text);
		}
	};
	write();
	return {
		setYears: (next) => {
			years = next;
			write();
		},
		setView: (next) => {
			view = next;
			write();
		},
	};
};
