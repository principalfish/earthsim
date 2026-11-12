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

/** A value marked on a slider's track, such as a reference to compare with. */
export type RangeMark = {
	/** The value marked, within the slider's range. */
	readonly value: number;
	/**
	 * What the mark stands for, shown when the cursor rests on it. A screen
	 * reader does not hear the mark, so the slider's value as written says
	 * when it is on the value marked.
	 */
	readonly title: string;
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
	/**
	 * A value marked on the track, under the slider, which stays marked
	 * through a change of scale; none when left out.
	 */
	readonly mark?: RangeMark;
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
	 * writes it unless other words are given. `onInput` is not called.
	 *
	 * @param value - The value to move to.
	 * @param text - What to write for it in place of the scale's own
	 * writing, beside the label and as what a screen reader says, for a
	 * slider that stands for something it can only come near. When the
	 * slider is next moved, its scale writes the value again.
	 */
	setValue(value: number, text?: string): void;
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

/**
 * Where a value lies along a slider's range, from 0 at its lowest to 1 at
 * its highest.
 *
 * @param value - The value, within the range.
 * @param min - The lowest value.
 * @param max - The highest value, above the lowest.
 */
export const rangeFraction = (
	value: number,
	min: number,
	max: number,
): number => (value - min) / (max - min);

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
 * A mark, if there is one, is a short line under the track, centred where
 * the middle of the slider's thumb stands at the value marked. It is
 * hidden from screen readers.
 *
 * @param options - The slider's range, starting value, wording, mark and
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
	const write = (value: number, text = format(value)): void => {
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
	/** Puts the mark, if any, where the value marked lies along a range. */
	let placeMark = (_min: number, _max: number): void => {};
	if (options.mark === undefined) {
		field.append(header, input);
	} else {
		const { value: marked, title } = options.mark;
		const track = createElement('div', 'field__track');
		const mark = createElement('span', 'field__mark');
		mark.title = title;
		mark.setAttribute('aria-hidden', 'true');
		placeMark = (min, max) => {
			// The thumb's middle travels the track less the thumb's width.
			const fraction = rangeFraction(marked, min, max);
			mark.style.left = `calc(var(--range-thumb-size) / 2 + (100% - var(--range-thumb-size)) * ${fraction})`;
		};
		placeMark(options.min, options.max);
		track.append(input, mark);
		field.append(header, track);
	}
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
			placeMark(scale.min, scale.max);
		},
		setValue: (value, text) => {
			input.value = String(value);
			write(value, text);
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

/** A segmented picker, with a way to show another choice made elsewhere. */
export type SegmentedChoice<T extends string> = {
	/** The picker, to put in a panel. */
	readonly element: HTMLElement;
	/**
	 * Shows a value as the one chosen, without calling `onChange`; a value
	 * the picker does not offer leaves no segment chosen.
	 */
	setValue(value: T): void;
};

/**
 * Creates a choice of one of a few things, drawn as one row of segments,
 * whose choice can also be set from outside.
 *
 * @remarks
 * The segments are radio buttons, so the picker is one tab stop and the
 * arrow keys move between them. The group's name is for screen readers
 * alone: it is not shown.
 *
 * @param options - What it offers, the starting choice and the callback.
 * @returns The picker and the way to set its choice.
 */
export const createSegmentedChoice = <T extends string>(
	options: SegmentedPickerOptions<T>,
): SegmentedChoice<T> => {
	const picker = createElement('fieldset', 'segmented');
	const legend = createElement('legend', 'u-visually-hidden');
	legend.textContent = options.legend;
	const row = createElement('div', 'segmented__options');
	const inputs: { readonly value: T; readonly input: HTMLInputElement }[] = [];

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
		inputs.push({ value: choice.value, input });

		const label = createElement('span', 'segmented__label');
		label.textContent = choice.label;

		option.append(input, label);
		row.append(option);
	}

	picker.append(legend, row);
	return {
		element: picker,
		setValue: (value) => {
			for (const entry of inputs) {
				entry.input.checked = entry.value === value;
			}
		},
	};
};

/**
 * Creates a choice of one of a few things, drawn as one row of segments.
 *
 * @remarks
 * As {@link createSegmentedChoice}, for a picker whose choice is made only
 * on it.
 *
 * @param options - What it offers, the starting choice and the callback.
 * @returns The picker, to put in a panel.
 */
export const createSegmentedPicker = <T extends string>(
	options: SegmentedPickerOptions<T>,
): HTMLElement => createSegmentedChoice(options).element;

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
