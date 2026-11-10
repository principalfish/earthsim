/**
 * The view controls: how much relief is exaggerated, where the sea level
 * is, and whether the cell grid is drawn.
 */

import {
	DEFAULT_EXAGGERATION,
	MAX_DRAWN_SEA_LEVEL_M,
	MAX_EXAGGERATION,
	MIN_DRAWN_SEA_LEVEL_M,
	MIN_EXAGGERATION,
} from '../globe/material';

/** The step between sea levels the slider can be set to, in metres. */
export const SEA_LEVEL_SLIDER_STEP_M = 10;

/** What the view panel starts with and whom it tells about changes. */
export type ViewPanelOptions = {
	/** The relief exaggeration shown at first; defaults to the view's own. */
	readonly exaggeration?: number;
	/** The sea level shown at first, in metres against the datum. */
	readonly seaLevel: number;
	/** Whether the grid starts shown; hidden by default. */
	readonly gridVisible?: boolean;
	/** Called with the new factor when the exaggeration slider moves. */
	readonly onExaggeration: (factor: number) => void;
	/** Called with the new level in metres when the sea-level slider moves. */
	readonly onSeaLevel: (metres: number) => void;
	/** Called when the grid checkbox is ticked or cleared. */
	readonly onGridVisible: (visible: boolean) => void;
};

/**
 * A relief exaggeration as the panel shows it, such as `40×`.
 *
 * @param factor - The exaggeration factor.
 */
export const formatExaggeration = (factor: number): string =>
	`${Math.round(factor)}×`;

/**
 * A height in metres as the panel shows it, such as `1,250 m` or `−40 m`.
 *
 * @param metres - The height; rounded to a whole metre.
 */
export const formatMetres = (metres: number): string => {
	const rounded = Math.round(metres);
	const digits = Math.abs(rounded).toLocaleString('en-GB');
	return `${rounded < 0 ? '−' : ''}${digits} m`;
};

/** What a slider is built from. */
type RangeFieldOptions = {
	readonly id: string;
	readonly label: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly value: number;
	readonly format: (value: number) => string;
	readonly onInput: (value: number) => void;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className: string,
): HTMLElementTagNameMap[K] => {
	const element = document.createElement(tag);
	element.className = className;
	return element;
};

/** A labelled slider with its current value written beside the label. */
const createRangeField = (options: RangeFieldOptions): HTMLElement => {
	const field = createElement('div', 'field');
	const header = createElement('div', 'field__header');

	const label = createElement('label', 'field__label');
	label.htmlFor = options.id;
	label.textContent = options.label;

	const output = createElement('output', 'field__value');
	output.htmlFor.add(options.id);
	output.textContent = options.format(options.value);

	const input = createElement('input', 'field__range');
	input.id = options.id;
	input.type = 'range';
	input.min = String(options.min);
	input.max = String(options.max);
	input.step = String(options.step);
	input.value = String(options.value);
	input.addEventListener('input', () => {
		const value = input.valueAsNumber;
		output.textContent = options.format(value);
		options.onInput(value);
	});

	header.append(label, output);
	field.append(header, input);
	return field;
};

/** What a checkbox is built from. */
type CheckFieldOptions = {
	readonly id: string;
	readonly label: string;
	readonly checked: boolean;
	readonly onChange: (checked: boolean) => void;
};

/** A labelled checkbox. */
const createCheckField = (options: CheckFieldOptions): HTMLElement => {
	const field = createElement('div', 'field field--check');

	const input = createElement('input', 'field__checkbox');
	input.id = options.id;
	input.type = 'checkbox';
	input.checked = options.checked;
	input.addEventListener('change', () => options.onChange(input.checked));

	const label = createElement('label', 'field__label');
	label.htmlFor = options.id;
	label.textContent = options.label;

	field.append(input, label);
	return field;
};

/**
 * Adds the view controls to the side panel.
 *
 * @param panel - The panel to add the controls to, after what it holds.
 * @param options - The starting values and the callbacks for changes.
 * @returns The section that was added.
 */
export const createViewPanel = (
	panel: HTMLElement,
	options: ViewPanelOptions,
): HTMLElement => {
	const section = createElement('section', 'panel__section');
	const heading = createElement('h2', 'panel__heading');
	heading.textContent = 'View';

	section.append(
		heading,
		createRangeField({
			id: 'view-exaggeration',
			label: 'Relief exaggeration',
			min: MIN_EXAGGERATION,
			max: MAX_EXAGGERATION,
			step: 1,
			value: options.exaggeration ?? DEFAULT_EXAGGERATION,
			format: formatExaggeration,
			onInput: options.onExaggeration,
		}),
		createRangeField({
			id: 'view-sea-level',
			label: 'Sea level',
			min: MIN_DRAWN_SEA_LEVEL_M,
			max: MAX_DRAWN_SEA_LEVEL_M,
			step: SEA_LEVEL_SLIDER_STEP_M,
			value: options.seaLevel,
			format: formatMetres,
			onInput: options.onSeaLevel,
		}),
		createCheckField({
			id: 'view-grid',
			label: 'Show cell grid',
			checked: options.gridVisible ?? false,
			onChange: options.onGridVisible,
		}),
	);
	panel.append(section);
	return section;
};
