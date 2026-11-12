/**
 * The comparison controls in the Layers section: where the temperature on
 * the globe comes from, Simulated, Observed or the Difference of the two,
 * offered only while the world is the measured Earth, with a line for what
 * the page has to say of the observed temperature.
 *
 * The controls only show what they are told and pass on what is chosen;
 * the layer panel decides when they are offered.
 */

import {
	TEMPERATURE_SOURCE_LABELS,
	TEMPERATURE_SOURCES,
	type TemperatureSource,
} from '../view';
import { createElement, createSegmentedChoice } from './fields';

/** What the comparison controls show at one moment. */
export type ComparisonContent = {
	/**
	 * Whether the choice is offered. While it is not, the controls and
	 * their line are hidden.
	 */
	readonly offered: boolean;
	/** The source shown as chosen. */
	readonly source: TemperatureSource;
	/** What the line under the choice says, or null for nothing. */
	readonly message: string | null;
};

/** What the comparison controls start with and whom they tell of a choice. */
export type ComparisonControlsOptions = {
	/** The source shown as chosen at first. */
	readonly source: TemperatureSource;
	/** Called with the source when another is chosen. */
	readonly onSource: (source: TemperatureSource) => void;
};

/** The comparison controls on the page. */
export type ComparisonControls = {
	/** The controls, as they were added to the container. */
	readonly element: HTMLElement;
	/** Shows the content given. */
	show(content: ComparisonContent): void;
};

/**
 * Adds the comparison controls to a container, hidden until they are
 * offered.
 *
 * @remarks
 * The choice is a row of three segments, built like the choice of layer,
 * whose group a screen reader names "Temperature source". The line under
 * it is a polite live region, so a screen reader announces a message such
 * as a failed load without the focus moving. It is rewritten only when its
 * words change, and while the controls show it is left empty rather than
 * hidden when there is nothing to say.
 *
 * @param container - Where to add the controls, after what it holds.
 * @param options - The starting source and whom to tell of a choice.
 * @returns The controls.
 */
export const createComparisonControls = (
	container: HTMLElement,
	options: ComparisonControlsOptions,
): ComparisonControls => {
	const element = createElement('div', 'comparison');
	element.hidden = true;
	const choice = createSegmentedChoice({
		name: 'temperature-source',
		legend: 'Temperature source',
		choices: TEMPERATURE_SOURCES.map((value) => ({
			value,
			label: TEMPERATURE_SOURCE_LABELS[value],
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
			element.hidden = !content.offered;
			choice.setValue(content.source);
			const text = content.message ?? '';
			if (message.textContent !== text) {
				message.textContent = text;
			}
		},
	};
};
