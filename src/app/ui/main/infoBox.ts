/**
 * The info box over the globe's bottom-right corner: one box saying what
 * the colours mean, where the calculation stands and what lies under the
 * pointer. It is made of blocks, each shown only while it applies: the
 * legend of the computed layer on screen, one status line for the
 * calculation, the layer and the winds, and the pointer's read-out while
 * the pointer is over the globe.
 *
 * The legend and the winds are each told what they show, with a line of
 * its own, and the calculation of the climate, the temperature and the
 * winds together, which goes on whatever is on screen, has a line too;
 * {@link infoStatus} picks the one line the box shows of the three.
 */

import type { TemperatureProgress } from '../../../core/index';
import type { LayerStatus, TemperatureLayer } from '../../layers/layers';
import { createElement } from '../fields';
import { createReadoutBlock, type ReadoutText } from './cursorReadout';
import {
	createLegend,
	LEGEND_EMPTY_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
	type LegendContent,
} from './legend';
import type { WindKeyContent } from './windKey';

/** What is said while the first pass of the climate is being calculated. */
export const CALCULATING_CLIMATE_TEXT = 'Calculating climate';

/**
 * What is said while a later pass of the climate is being calculated,
 * refining the one on show.
 *
 * @param pass - The pass under way, from 2.
 */
export const refiningClimateText = (pass: number): string =>
	`Refining climate (pass ${pass})`;

/** What is said when the climate can no longer be calculated. */
export const CLIMATE_UNAVAILABLE_TEXT = 'Climate unavailable';

/**
 * What is said while the calculation is paused with a result that does
 * not describe the world as it is, or with none.
 */
export const PAUSED_TEXT = 'Paused';

/**
 * Where the line the box says stands: where a layer's result stands, or
 * `paused` while the calculation is paused with a result that is not
 * current or with none.
 */
export type InfoState = LayerStatus | 'paused';

/**
 * Where the calculation of the climate stands, for the box's status line,
 * whatever is on screen.
 */
export type CalculationContent = {
	/** Where it stands. */
	readonly state: InfoState;
	/** What is said of it, or null while its results are current. */
	readonly status: string | null;
	/**
	 * The progress bar, shown while it is being calculated: its fraction
	 * done, or null while that is not known. Null when no bar is shown.
	 */
	readonly bar: { readonly fraction: number | null } | null;
};

/** The one status line of the box. */
export type InfoStatus = {
	/** What the line says, or null when there is nothing to say. */
	readonly text: string | null;
	/**
	 * The progress bar under the line, shown while the line is of a layer
	 * being calculated: its fraction done, or null while that is not known.
	 * Null when no bar is shown.
	 */
	readonly bar: { readonly fraction: number | null } | null;
};

/** The states a line can stand for, the worst first. */
const WORST_FIRST: readonly InfoState[] = [
	'unavailable',
	'calculating',
	'paused',
	'outOfDate',
	'empty',
	'current',
];

/** How bad a state is: the higher, the worse. */
const severity = (state: InfoState): number =>
	WORST_FIRST.length - WORST_FIRST.indexOf(state);

/** A status line with nothing to say. */
const NOTHING_TO_SAY: InfoStatus = { text: null, bar: null };

/** The calculation with its results current: nothing to say. */
const CALCULATED: CalculationContent = {
	state: 'current',
	status: null,
	bar: null,
};

/**
 * What is said of a result that is not being calculated and does not
 * describe the world as it is: that the calculation is paused while it
 * is, and otherwise that the result is out of date, or that there is none.
 */
const waiting = (
	status: 'outOfDate' | 'empty',
	paused: boolean,
): CalculationContent => {
	if (paused) {
		return { state: 'paused', status: PAUSED_TEXT, bar: null };
	}
	return {
		state: status,
		status:
			status === 'outOfDate' ? LEGEND_OUT_OF_DATE_TEXT : LEGEND_EMPTY_TEXT,
		bar: null,
	};
};

/**
 * How much of a pass's temperature solve is done.
 *
 * @param progress - How far the solve has come, or null before its first
 * year is done.
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

/**
 * How much of the climate is done, for the bar under its line: the first
 * pass's temperature solve, as {@link progressFraction} gives it, and then
 * the whole bar for every later pass.
 *
 * @remarks
 * The first pass, from nothing or from the last settled climate, is most
 * of the work, and the later passes refine what it shows, each carried on
 * from the one before and so much shorter, with no telling how many there
 * will be. So the bar fills with the first pass and stays full while the
 * climate is refined: it never goes back, from one pass to the next.
 *
 * @param temperature - The temperature's progress and the pass under way.
 */
export const climateFraction = (
	temperature: Pick<TemperatureLayer, 'progress' | 'pass'>,
): number | null =>
	temperature.pass !== null && temperature.pass > 1
		? 1
		: progressFraction(temperature.progress);

/**
 * Where the calculation of the climate stands, the temperature and the
 * winds worked out together in passes, which the temperature layer tells.
 *
 * @remarks
 * While the climate's first pass is being calculated the line is
 * {@link CALCULATING_CLIMATE_TEXT}, and while a later one is,
 * {@link refiningClimateText} with the pass, each with a bar of
 * {@link climateFraction}, which never goes back between passes. A result
 * that is out of date, or none at all, is {@link PAUSED_TEXT} while paused,
 * and in the legend's words otherwise; one that can no longer be
 * calculated is {@link CLIMATE_UNAVAILABLE_TEXT}. A calculation under way
 * while paused is said as calculating, since it goes on to the end of its
 * pass under way.
 *
 * @param temperature - Where the temperature stands, its progress and the
 * pass under way; the winds stand with it, being worked out in the same
 * passes.
 * @param paused - Whether the calculation is paused.
 */
export const calculationContent = (
	temperature: Pick<TemperatureLayer, 'status' | 'progress' | 'pass'>,
	paused: boolean,
): CalculationContent => {
	switch (temperature.status) {
		case 'unavailable':
			return {
				state: 'unavailable',
				status: CLIMATE_UNAVAILABLE_TEXT,
				bar: null,
			};
		case 'calculating':
			return {
				state: 'calculating',
				status:
					temperature.pass !== null && temperature.pass > 1
						? refiningClimateText(temperature.pass)
						: CALCULATING_CLIMATE_TEXT,
				bar: { fraction: climateFraction(temperature) },
			};
		case 'outOfDate':
		case 'empty':
			return waiting(temperature.status, paused);
		case 'current':
			return CALCULATED;
	}
};

/**
 * The one line the box says of the legend's line, the calculation's and
 * the winds'.
 *
 * @remarks
 * The worst of the three is said, by the state each gives, in this order
 * from the worst: unavailable, calculating, paused, out of date, not
 * calculated yet. Between lines as bad, the legend's is said first, then
 * the calculation's, whose bar the winds' line never has, and then the
 * winds'; but a legend being calculated comes after the calculation's
 * line, so whatever is on screen, the climate being calculated is said by
 * its pass. While all three are current there is nothing to say, but for a
 * line said of the winds while they are current, such as that the
 * observed winds are loading or could not be loaded.
 *
 * @param legend - What the legend is shown, or null while it is hidden.
 * @param windKey - What is shown of the winds, or null while they are not
 * shown.
 * @param calculation - Where the calculation stands.
 * @returns The line, with the bar of the line said.
 */
export const infoStatus = (
	legend: LegendContent | null,
	windKey: WindKeyContent | null,
	calculation: CalculationContent,
): InfoStatus => {
	const legendLines: readonly CalculationContent[] =
		legend === null ? [] : [legend];
	const legendFirst = legend !== null && legend.state !== 'calculating';
	const lines: readonly CalculationContent[] = [
		...(legendFirst ? legendLines : []),
		calculation,
		...(legendFirst ? [] : legendLines),
		...(windKey === null ? [] : [{ ...windKey, bar: null }]),
	];
	let worst: CalculationContent | null = null;
	for (const line of lines) {
		if (
			line.state !== 'current' &&
			(worst === null || severity(line.state) > severity(worst.state))
		) {
			worst = line;
		}
	}
	if (worst !== null) {
		return { text: worst.status, bar: worst.bar };
	}
	if (windKey !== null && windKey.status !== null) {
		return { text: windKey.status, bar: null };
	}
	return NOTHING_TO_SAY;
};

/** The info box on the page. */
export type InfoBox = {
	/** The box, to put in the info region over the globe. */
	readonly element: HTMLElement;
	/** Shows the legend, or hides it for null. */
	showLegend(content: LegendContent | null): void;
	/**
	 * Says on the status line what is said of the winds, or nothing of them
	 * for null.
	 */
	showWindKey(content: WindKeyContent | null): void;
	/** Says on the status line where the calculation stands. */
	showCalculation(content: CalculationContent): void;
	/**
	 * Shows what lies under the pointer, or hides it for null, while the
	 * pointer is off the globe.
	 */
	showReadout(text: ReadoutText | null): void;
};

/**
 * Creates the info box, hidden until one of its blocks has something to
 * show.
 *
 * @remarks
 * The blocks come in this order: the legend's scale, built by
 * {@link createLegend}; the status line, with the progress bar under it;
 * and the pointer's read-out, built by {@link createReadoutBlock}. The
 * legend shows while it is given a scale, the read-out while it is given
 * text, and the status line while {@link infoStatus} has something to say
 * of what the legend, the winds and the calculation are given; the box is
 * hidden while none of them shows. The calculation counts as current until
 * it is first given.
 *
 * The status line is the box's one polite live region, so a screen reader
 * announces where the calculation stands without the focus moving. It is
 * rewritten only when its words change, so the same words are not
 * announced again, and it is never hidden on its own, only left empty when
 * there is nothing to say, since many screen readers do not announce words
 * written into a region that is hidden at the time; the stylesheet keeps
 * no room for it while it is empty. The read-out is hidden from screen
 * readers, as it changes with every movement of the pointer.
 *
 * @returns The box.
 */
export const createInfoBox = (): InfoBox => {
	const box = createElement('div', 'info-box');
	box.hidden = true;
	const legend = createLegend();
	const status = createElement('p', 'info-box__status');
	status.setAttribute('aria-live', 'polite');
	const bar = createElement('progress', 'info-box__bar');
	bar.max = 1;
	bar.setAttribute('aria-label', 'Calculation progress');
	bar.hidden = true;
	const readout = createReadoutBlock();
	box.append(legend.element, status, bar, readout.element);

	/** What the legend was last given, or null while it is hidden. */
	let legendShown: LegendContent | null = null;
	/** What the winds were last given, or null while they are not shown. */
	let windsShown: WindKeyContent | null = null;
	/** What the calculation was last given. */
	let calculationShown: CalculationContent = CALCULATED;
	/** Whether the read-out was last given text. */
	let readoutShown = false;

	/** Brings the status line, its bar and the box's being shown up to date. */
	const update = (): void => {
		const line = infoStatus(legendShown, windsShown, calculationShown);
		const text = line.text ?? '';
		if (status.textContent !== text) {
			status.textContent = text;
		}
		bar.hidden = line.bar === null;
		if (line.bar !== null) {
			// A bar without a value is drawn as one that does not know how
			// far it has come.
			if (line.bar.fraction === null) {
				bar.removeAttribute('value');
			} else {
				bar.value = line.bar.fraction;
			}
		}
		box.hidden = legend.element.hidden && !readoutShown && text === '';
	};

	return {
		element: box,
		showLegend: (content) => {
			legendShown = content;
			legend.show(content);
			update();
		},
		showWindKey: (content) => {
			windsShown = content;
			update();
		},
		showCalculation: (content) => {
			calculationShown = content;
			update();
		},
		showReadout: (text) => {
			readoutShown = text !== null;
			readout.show(text);
			update();
		},
	};
};
