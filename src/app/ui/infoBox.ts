/**
 * The info box over the globe's bottom-right corner: one box saying what
 * the colours mean, where the calculation stands and what lies under the
 * pointer. It is made of blocks, each shown only while it applies: the
 * legend of the computed layer on screen, one status line for the layer
 * and the winds, and the pointer's read-out while the pointer is over the
 * globe.
 *
 * The legend and the winds are told what they show as before, each with a
 * line of its own; {@link infoStatus} picks the one line the box shows of
 * the two.
 */

import type { LayerStatus } from '../layers';
import { createReadoutBlock, type ReadoutText } from './cursorReadout';
import { createElement } from './fields';
import { createLegend, type LegendContent } from './legend';
import type { WindKeyContent } from './windKey';

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

/** The statuses a line can stand for, the worst first. */
const WORST_FIRST: readonly LayerStatus[] = [
	'unavailable',
	'calculating',
	'outOfDate',
	'empty',
	'current',
];

/** How bad a status is: the higher, the worse. */
const severity = (status: LayerStatus): number =>
	WORST_FIRST.length - WORST_FIRST.indexOf(status);

/** A status line with nothing to say. */
const NOTHING_TO_SAY: InfoStatus = { text: null, bar: null };

/**
 * The one line the box says of the legend's line and the winds'.
 *
 * @remarks
 * The worse of the two is said, by the state each gives, in this order
 * from the worst: unavailable, calculating, out of date, not calculated
 * yet. Between two as bad, the legend's is said, so a temperature being
 * calculated is said with its progress, which the winds' line never has.
 * While both are current there is nothing to say, but for a line said of
 * the winds while they are current, such as that the observed winds are
 * loading or could not be loaded.
 *
 * @param legend - What the legend is shown, or null while it is hidden.
 * @param windKey - What is shown of the winds, or null while they are not
 * shown.
 * @returns The line, with the legend's bar when the line is the legend's.
 */
export const infoStatus = (
	legend: LegendContent | null,
	windKey: WindKeyContent | null,
): InfoStatus => {
	if (
		legend !== null &&
		legend.state !== 'current' &&
		(windKey === null || severity(legend.state) >= severity(windKey.state))
	) {
		return { text: legend.status, bar: legend.bar };
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
 * of what the legend and the winds are given; the box is hidden while none
 * of them shows.
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
	/** Whether the read-out was last given text. */
	let readoutShown = false;

	/** Brings the status line, its bar and the box's being shown up to date. */
	const update = (): void => {
		const line = infoStatus(legendShown, windsShown);
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
		showReadout: (text) => {
			readoutShown = text !== null;
			readout.show(text);
			update();
		},
	};
};
