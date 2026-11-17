/**
 * The comparison control in the top bar over the globe: where the layer on
 * screen and the winds come from, Simulated, Observed or the Difference of
 * the two, offered only while the world is the measured Earth, with a line
 * for what the page has to say of the observed year.
 *
 * The control only shows what it is told and passes on what is chosen; the
 * layer panel decides what it offers.
 */

import { SOURCE_LABELS, SOURCES, type Source } from '../layers/view';
import { createElement, createSegmentedChoice } from './fields';

/** The name of the comparison's group of radio buttons. */
export const COMPARISON_NAME = 'source';

/** What a screen reader names the comparison's group by. */
export const COMPARISON_LEGEND = 'Source';

/** What the comparison control shows at one moment. */
export type ComparisonContent = {
	/**
	 * The sources offered, in the order of {@link SOURCES}. While none is,
	 * the control and its line are hidden.
	 */
	readonly offered: readonly Source[];
	/** The source shown as chosen. */
	readonly source: Source;
	/** What the line under the choice says, or null for nothing. */
	readonly message: string | null;
};

/** What the comparison control starts with and whom it tells of a choice. */
export type ComparisonControlsOptions = {
	/** The source shown as chosen at first. */
	readonly source: Source;
	/** Called with the source when another is chosen. */
	readonly onSource: (source: Source) => void;
};

/** The comparison control on the page. */
export type ComparisonControls = {
	/** The control, as it was added to the container. */
	readonly element: HTMLElement;
	/** Shows the content given. */
	show(content: ComparisonContent): void;
};

/**
 * Adds the comparison control to a container, hidden until something is
 * offered.
 *
 * @remarks
 * The choice is a row of three segments, built like a choice of layer,
 * named {@link COMPARISON_NAME}, whose group a screen reader names
 * {@link COMPARISON_LEGEND}. A source not offered has its segment hidden
 * and out of reach, so that over the terrain with the winds on the row
 * holds Simulated and Observed alone. The line under it is a polite live
 * region, so a screen reader announces a message such as a failed load
 * without the focus moving. It is rewritten only when its words change,
 * and while the control shows it is left empty rather than hidden when
 * there is nothing to say.
 *
 * @param container - Where to add the control, after what it holds.
 * @param options - The starting source and whom to tell of a choice.
 * @returns The control.
 */
export const createComparisonControls = (
	container: HTMLElement,
	options: ComparisonControlsOptions,
): ComparisonControls => {
	const element = createElement('div', 'comparison');
	element.hidden = true;
	const choice = createSegmentedChoice({
		name: COMPARISON_NAME,
		legend: COMPARISON_LEGEND,
		choices: SOURCES.map((value) => ({
			value,
			label: SOURCE_LABELS[value],
		})),
		value: options.source,
		onChange: options.onSource,
	});
	const message = createElement('p', 'comparison__message');
	message.setAttribute('aria-live', 'polite');
	element.append(choice.element, message);
	container.append(element);

	return {
		element,
		show: (content) => {
			element.hidden = content.offered.length === 0;
			choice.setOffered(content.offered);
			choice.setValue(content.source);
			const text = content.message ?? '';
			if (message.textContent !== text) {
				message.textContent = text;
			}
		},
	};
};
