/**
 * The labelled controls the panels are built from.
 */

/** The values a slider offers, the one it shows and how that is written. */
export type RangeScale = {
	readonly min: number;
	readonly max: number;
	readonly step: number;
	/** The value shown until the slider moves. */
	readonly value: number;
	/** How a value is written beside the label. */
	readonly format: (value: number) => string;
};

/** What a slider is built from. */
export type RangeFieldOptions = RangeScale & {
	/** The slider's `id`, unique on the page. */
	readonly id: string;
	/** The text of the slider's label. */
	readonly label: string;
	/** Called with the new value whenever the slider moves. */
	readonly onInput: (value: number) => void;
	/**
	 * Whether a screen reader is kept from reading out the value beside the
	 * label each time it changes, for a slider moved often by the page
	 * itself; false when left out. The slider still says its value.
	 */
	readonly quietValue?: boolean;
};

/** A slider on the page. */
export type RangeField = {
	/** The slider with its label and value, to put in a panel. */
	readonly element: HTMLElement;
	/**
	 * Gives the slider another range, value and way of writing it, for a
	 * control that sets one of several things. `onInput` is not called.
	 */
	setScale(scale: RangeScale): void;
	/**
	 * Moves the slider to a value within its range, written as its scale
	 * writes it. `onInput` is not called.
	 */
	setValue(value: number): void;
	/** Greys the slider out so that it cannot be moved, or brings it back. */
	setDisabled(disabled: boolean): void;
};

/** What a checkbox is built from. */
export type CheckFieldOptions = {
	/** The checkbox's `id`, unique on the page. */
	readonly id: string;
	/** The text of the checkbox's label. */
	readonly label: string;
	/** Whether it starts ticked. */
	readonly checked: boolean;
	/** Called when the checkbox is ticked or cleared. */
	readonly onChange: (checked: boolean) => void;
};

/** What a button is built from. */
export type ButtonOptions = {
	/** The text on the button, which is also its accessible name. */
	readonly label: string;
	/** A longer description shown when the cursor rests on the button. */
	readonly title?: string;
	/** Whether it starts greyed out; false when left out. */
	readonly disabled?: boolean;
	/** Called when the button is pressed. */
	readonly onClick: () => void;
};

/** One of the things a picker offers. */
export type Choice<T extends string> = {
	/** What choosing it gives. */
	readonly value: T;
	/** The text it is shown with. */
	readonly label: string;
};

/** What a segmented picker is built from. */
export type SegmentedPickerOptions<T extends string> = {
	/** The name of its group of radio buttons, unique on the page. */
	readonly name: string;
	/** What is being chosen, as a screen reader names the group. */
	readonly legend: string;
	/** What it offers, in the order the segments show them. */
	readonly choices: readonly Choice<T>[];
	/** The value chosen at first. */
	readonly value: T;
	/** Called with the value when another is chosen. */
	readonly onChange: (value: T) => void;
};

/** What a drop-down choice is built from. */
export type SelectFieldOptions<T extends string> = {
	/** The drop-down's `id`, unique on the page. */
	readonly id: string;
	/** The text of its label. */
	readonly label: string;
	/** What it offers, in the order the list shows them. */
	readonly choices: readonly Choice<T>[];
	/** The value chosen at first; one of the choices. */
	readonly value: T;
	/** Called with the value when another is chosen. */
	readonly onChange: (value: T) => void;
};

/** Class a field carries while its control cannot be used. */
const DISABLED_CLASS = 'is-disabled';

/**
 * Creates an element with a class.
 *
 * @param tag - The element's tag name.
 * @param className - Its class attribute.
 */
export const createElement = <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className: string,
): HTMLElementTagNameMap[K] => {
	const element = document.createElement(tag);
	element.className = className;
	return element;
};

/**
 * Creates a labelled slider with its current value written beside the
 * label.
 *
 * @remarks
 * The value as written is also what a screen reader says of the slider, so
 * that it hears "July" or "30%" rather than the bare number. The value
 * beside the label is an `<output>`, which a screen reader reads out
 * whenever it changes unless `quietValue` is set, when it is marked
 * `aria-live="off"`.
 *
 * @param options - The slider's range, starting value, wording and
 * callback.
 */
export const createRangeField = (options: RangeFieldOptions): RangeField => {
	const field = createElement('div', 'field');
	const header = createElement('div', 'field__header');
	let { format } = options;

	const label = createElement('label', 'field__label');
	label.htmlFor = options.id;
	label.textContent = options.label;

	const output = createElement('output', 'field__value');
	output.htmlFor.add(options.id);
	if (options.quietValue === true) {
		output.setAttribute('aria-live', 'off');
	}

	const input = createElement('input', 'field__range');
	input.id = options.id;
	input.type = 'range';
	input.min = String(options.min);
	input.max = String(options.max);
	input.step = String(options.step);
	/** Writes a value beside the label and as what a screen reader says. */
	const write = (value: number): void => {
		const text = format(value);
		output.textContent = text;
		input.setAttribute('aria-valuetext', text);
	};
	input.value = String(options.value);
	write(options.value);
	input.addEventListener('input', () => {
		const value = input.valueAsNumber;
		write(value);
		options.onInput(value);
	});

	header.append(label, output);
	field.append(header, input);
	return {
		element: field,
		setScale: (scale) => {
			// The range goes first: a value outside the range the slider
			// has at the time would be brought within it.
			input.min = String(scale.min);
			input.max = String(scale.max);
			input.step = String(scale.step);
			input.value = String(scale.value);
			format = scale.format;
			write(scale.value);
		},
		setValue: (value) => {
			input.value = String(value);
			write(value);
		},
		setDisabled: (disabled) => {
			input.disabled = disabled;
			field.classList.toggle(DISABLED_CLASS, disabled);
		},
	};
};

/**
 * Creates a labelled checkbox.
 *
 * @param options - The checkbox's starting state, wording and callback.
 * @returns The checkbox with its label, to put in a panel.
 */
export const createCheckField = (options: CheckFieldOptions): HTMLElement => {
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
 * Creates a labelled drop-down choice of one of several things, for
 * choices whose labels are too long or too many for a row of segments.
 *
 * @param options - What it offers, the starting choice and the callback.
 * @returns The drop-down with its label, to put in a panel.
 */
export const createSelectField = <T extends string>(
	options: SelectFieldOptions<T>,
): HTMLElement => {
	const field = createElement('div', 'field');

	const label = createElement('label', 'field__label');
	label.htmlFor = options.id;
	label.textContent = options.label;

	const select = createElement('select', 'field__select');
	select.id = options.id;
	for (const choice of options.choices) {
		const option = createElement('option', 'field__option');
		option.value = choice.value;
		option.textContent = choice.label;
		select.append(option);
	}
	// Once the options are in: a value is chosen from among them.
	select.value = options.value;
	select.addEventListener('change', () => {
		const chosen = options.choices.find(
			(choice) => choice.value === select.value,
		);
		if (chosen !== undefined) {
			options.onChange(chosen.value);
		}
	});

	field.append(label, select);
	return field;
};

/**
 * Creates a choice of one of a few things, drawn as one row of segments.
 *
 * @remarks
 * The segments are radio buttons, so the picker is one tab stop and the
 * arrow keys move between them. The group's name is for screen readers
 * alone: it is not shown.
 *
 * @param options - What it offers, the starting choice and the callback.
 * @returns The picker, to put in a panel.
 */
export const createSegmentedPicker = <T extends string>(
	options: SegmentedPickerOptions<T>,
): HTMLElement => {
	const picker = createElement('fieldset', 'segmented');
	const legend = createElement('legend', 'u-visually-hidden');
	legend.textContent = options.legend;
	const row = createElement('div', 'segmented__options');

	for (const choice of options.choices) {
		const option = createElement('label', 'segmented__option');

		const input = createElement('input', 'segmented__input');
		input.type = 'radio';
		input.name = options.name;
		input.value = choice.value;
		input.checked = choice.value === options.value;
		input.addEventListener('change', () => {
			if (input.checked) {
				options.onChange(choice.value);
			}
		});

		const label = createElement('span', 'segmented__label');
		label.textContent = choice.label;

		option.append(input, label);
		row.append(option);
	}

	picker.append(legend, row);
	return picker;
};

/**
 * Creates a button that does something on the page.
 *
 * @param options - The button's wording, starting state and callback.
 * @returns The button, to put in a panel. Setting its `disabled` property
 * greys it out and brings it back.
 */
export const createButton = (options: ButtonOptions): HTMLButtonElement => {
	const button = createElement('button', 'button');
	button.type = 'button';
	button.textContent = options.label;
	if (options.title !== undefined) {
		button.title = options.title;
	}
	button.disabled = options.disabled ?? false;
	button.addEventListener('click', options.onClick);
	return button;
};
