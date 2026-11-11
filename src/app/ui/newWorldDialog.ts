/**
 * The new-world dialog: which world to start, and the reading of what was
 * entered into the choice it stands for.
 *
 * Reading the form is a pure function of its values, which are text from
 * the page and so are not trusted. The dialog itself is built here rather
 * than declared in the page's markup, like the panels, so that the
 * resolutions it offers are the ones the core supports.
 */

import {
	createBlankWorld,
	DEFAULT_RESOLUTION,
	generateWorld,
	isSeed,
	MAX_SEED,
	type Resolution,
	randomSeed,
	SUPPORTED_RESOLUTIONS,
	type World,
} from '../../core/index';
import { createButton, createElement, createRangeField } from './fields';

/** The least land the slider can be set to, as a percentage. */
export const MIN_LAND_PERCENT = 0;

/** The most land the slider can be set to, as a percentage. */
export const MAX_LAND_PERCENT = 100;

/** The step between the amounts of land the slider can be set to. */
export const LAND_SLIDER_STEP_PERCENT = 1;

/** The land the slider shows when no generated world says otherwise. */
export const DEFAULT_LAND_PERCENT = 30;

/**
 * What the dialog's controls hold: text and numbers as the page has them,
 * before any of it has been checked.
 */
export type NewWorldValues = {
	/** The chosen resolution, as the text of a whole number. */
	readonly resolution: string;
	/** How the world starts: `blank` or `generated`. */
	readonly kind: string;
	/** What the seed field holds; blank for a seed chosen at random. */
	readonly seed: string;
	/** Where the land slider stands, from 0 to 100. */
	readonly landPercent: string | number;
};

/** A world to start: what a valid form asks for. */
export type NewWorldChoice =
	| {
			/** A uniform ocean with no land. */
			readonly kind: 'blank';
			/** Cells along a face edge of the grid. */
			readonly resolution: Resolution;
	  }
	| {
			/** Continents shaped by seeded noise. */
			readonly kind: 'generated';
			/** Cells along a face edge of the grid. */
			readonly resolution: Resolution;
			/** The seed that selects the continents. */
			readonly seed: number;
			/** Share of the surface to make land, 0 to 1. */
			readonly landFraction: number;
	  };

/** The control of the dialog a rejected value belongs to. */
export type NewWorldField = 'resolution' | 'kind' | 'seed' | 'landPercent';

/** The outcome of reading the dialog's values. */
export type NewWorldParse =
	| {
			readonly ok: true;
			/** The world the values ask for. */
			readonly choice: NewWorldChoice;
	  }
	| {
			readonly ok: false;
			/** The control whose value was rejected. */
			readonly field: NewWorldField;
			/** What to tell the person; never contains the rejected value. */
			readonly message: string;
	  };

/** Where {@link parseNewWorldValues} gets what the form does not say. */
export type NewWorldSources = {
	/** Chooses the seed when the field is blank; the core's by default. */
	readonly randomSeed?: () => number;
};

/**
 * What the dialog holds when the page opens: one press of its button away
 * from generated continents on the default grid, with a seed chosen at
 * random.
 */
export const FIRST_NEW_WORLD_VALUES: NewWorldValues = {
	resolution: String(DEFAULT_RESOLUTION),
	kind: 'generated',
	seed: '',
	landPercent: DEFAULT_LAND_PERCENT,
};

/** Said when no supported resolution is chosen. */
export const RESOLUTION_MESSAGE = 'Choose one of the resolutions.';

/** Said when neither way of starting a world is chosen. */
export const KIND_MESSAGE = 'Choose how the world starts.';

/**
 * Said when the seed field holds anything but a seed. The limit is written
 * without grouping, as it has to be typed.
 */
export const SEED_MESSAGE = `Enter a whole number from 0 to ${MAX_SEED}, or leave the field blank for a random seed.`;

/** Said when the land is outside the range of the slider. */
export const LAND_MESSAGE = `Land must be from ${MIN_LAND_PERCENT}% to ${MAX_LAND_PERCENT}%.`;

/** Said in the dialog when building the world failed. */
export const CREATE_FAILED_MESSAGE =
	'The new world could not be created. The current world has not been changed.';

/** What the confirm button says. */
export const CONFIRM_LABEL = 'Create world';

/** What the confirm button says while continents are being generated. */
export const GENERATING_LABEL = 'Generating…';

/** How large a cell of each resolution is, as the dialog says it. */
export const RESOLUTION_HINTS: Readonly<Record<Resolution, string>> = {
	64: 'about 150 km cells',
	128: 'about 75 km cells',
	256: 'about 40 km cells',
};

/** The name each way of starting a world goes by in the dialog. */
export const START_LABELS: Readonly<Record<NewWorldChoice['kind'], string>> = {
	blank: 'Blank ocean',
	generated: 'Generated continents',
};

/** Digits 0 to 9 and nothing else: no sign, point, exponent or prefix. */
const WHOLE_NUMBER = /^[0-9]+$/;

/** A plain decimal number without a sign or an exponent. */
const PLAIN_DECIMAL = /^[0-9]+(\.[0-9]+)?$/;

const reject = (field: NewWorldField, message: string): NewWorldParse => ({
	ok: false,
	field,
	message,
});

/** The land percentage a value stands for, or NaN when it is not one. */
const landPercentOf = (value: string | number): number => {
	if (typeof value === 'number') {
		return value;
	}
	const text = value.trim();
	return PLAIN_DECIMAL.test(text) ? Number(text) : Number.NaN;
};

/**
 * Reads the dialog's values into the world they ask for.
 *
 * @remarks
 * The resolution must be the text of a supported resolution exactly. For a
 * blank world nothing else is read, so whatever the seed field and the
 * slider were left holding cannot stand in the way.
 *
 * For a generated world the seed is the field's text without the white
 * space around it: digits 0 to 9 only, standing for a whole number from 0
 * to {@link MAX_SEED}. Signs, decimal points, exponents, prefixes such as
 * `0x`, digits of other scripts and digit grouping are all rejected rather
 * than guessed at. A field that is empty or holds only white space asks for
 * a seed chosen at random. The land fraction is the percentage divided by
 * 100, which is the fraction a world's description is written back from.
 *
 * The first value found wanting is reported, in the order resolution, kind,
 * seed, land.
 *
 * @param values - What the dialog's controls hold.
 * @param sources - Where a random seed comes from.
 * @returns The choice, or the control at fault and what to say about it.
 */
export const parseNewWorldValues = (
	values: NewWorldValues,
	sources: NewWorldSources = {},
): NewWorldParse => {
	const resolution = SUPPORTED_RESOLUTIONS.find(
		(supported) => String(supported) === values.resolution,
	);
	if (resolution === undefined) {
		return reject('resolution', RESOLUTION_MESSAGE);
	}
	if (values.kind === 'blank') {
		return { ok: true, choice: { kind: 'blank', resolution } };
	}
	if (values.kind !== 'generated') {
		return reject('kind', KIND_MESSAGE);
	}

	const seedText = values.seed.trim();
	let seed: number;
	if (seedText === '') {
		seed = (sources.randomSeed ?? randomSeed)();
	} else if (WHOLE_NUMBER.test(seedText) && isSeed(Number(seedText))) {
		seed = Number(seedText);
	} else {
		return reject('seed', SEED_MESSAGE);
	}

	const landPercent = landPercentOf(values.landPercent);
	if (!(landPercent >= MIN_LAND_PERCENT && landPercent <= MAX_LAND_PERCENT)) {
		return reject('landPercent', LAND_MESSAGE);
	}
	return {
		ok: true,
		choice: {
			kind: 'generated',
			resolution,
			seed,
			landFraction: landPercent / 100,
		},
	};
};

/**
 * What the dialog holds when it is opened on a world: the values that
 * would start that world again.
 *
 * @remarks
 * A blank world leaves the seed blank and the land at
 * {@link DEFAULT_LAND_PERCENT}, ready for a change to generated continents.
 * The land of a generated world is shown to the slider's nearest step.
 *
 * @param world - The world being edited.
 */
export const newWorldValuesFor = (world: World): NewWorldValues => {
	const { origin } = world;
	const resolution = String(world.resolution);
	switch (origin.kind) {
		case 'blank':
			return {
				resolution,
				kind: 'blank',
				seed: '',
				landPercent: DEFAULT_LAND_PERCENT,
			};
		case 'generated':
			return {
				resolution,
				kind: 'generated',
				seed: String(origin.seed),
				landPercent: Math.min(
					MAX_LAND_PERCENT,
					Math.max(MIN_LAND_PERCENT, Math.round(origin.landFraction * 100)),
				),
			};
	}
};

/**
 * Builds the world a choice asks for.
 *
 * @remarks
 * Generating continents takes time in proportion to the number of cells:
 * about half a second at the highest resolution.
 *
 * @param choice - A blank ocean or generated continents, and its options.
 * @returns A new world with the default sea level.
 */
export const worldFromChoice = (choice: NewWorldChoice): World =>
	choice.kind === 'blank'
		? createBlankWorld(choice.resolution)
		: generateWorld({
				resolution: choice.resolution,
				seed: choice.seed,
				landFraction: choice.landFraction,
			});

/**
 * A land percentage as the dialog shows it, such as `30%`.
 *
 * @param percent - The percentage; rounded to a whole number.
 */
export const formatPercent = (percent: number): string =>
	`${Math.round(percent)}%`;

/** What the new-world dialog shows and whom it tells. */
export type NewWorldDialogOptions = {
	/**
	 * What the controls hold when the dialog opens: values the controls can
	 * be set to, such as {@link newWorldValuesFor} gives.
	 */
	readonly values: NewWorldValues;
	/**
	 * Builds the world that was chosen. Called once the confirm button has
	 * been seen to change, since it may take a while. If it throws, the
	 * dialog stays open and says the world could not be created.
	 */
	readonly createWorld: (choice: NewWorldChoice) => World;
	/**
	 * Called with the new world, for the page to make it the one being
	 * edited. The dialog closes afterwards, whether or not this throws.
	 */
	readonly onWorld: (world: World) => void;
	/** Where the dialog is added to the page; the body by default. */
	readonly parent?: HTMLElement;
};

const TITLE_ID = 'new-world-title';
const SEED_ID = 'new-world-seed';
const SEED_HINT_ID = 'new-world-seed-hint';
const SEED_ERROR_ID = 'new-world-seed-error';
const LAND_ID = 'new-world-land';

/** Class of a button sized by its label rather than by the row it is in. */
const COMPACT_BUTTON_CLASS = 'button--compact';

/** One of the radio buttons of a group. */
type ChoiceOption = {
	readonly value: string;
	readonly label: string;
	/** Said after the label, in a quieter voice. */
	readonly hint?: string;
};

/** What a group of radio buttons is built from. */
type ChoiceGroupOptions = {
	/** The group's caption. */
	readonly legend: string;
	/** The name the radio buttons share. */
	readonly name: string;
	readonly options: readonly ChoiceOption[];
	/** The value of the option chosen at first. */
	readonly value: string;
};

/** A group of radio buttons in the dialog. */
type ChoiceGroup = {
	readonly element: HTMLFieldSetElement;
	/** The radio button chosen now, if any is. */
	checked(): HTMLInputElement | undefined;
};

/** Radio buttons listed under a caption, one to a line. */
const createChoiceGroup = (options: ChoiceGroupOptions): ChoiceGroup => {
	const group = createElement('fieldset', 'choice');
	const legend = createElement('legend', 'choice__legend');
	legend.textContent = options.legend;
	group.append(legend);

	const inputs = options.options.map((option) => {
		const row = createElement('label', 'choice__option');

		const input = createElement('input', 'choice__input');
		input.type = 'radio';
		input.name = options.name;
		input.value = option.value;
		input.checked = option.value === options.value;

		const label = createElement('span', 'choice__label');
		label.textContent = option.label;
		row.append(input, label);

		if (option.hint !== undefined) {
			const hint = createElement('span', 'choice__hint');
			hint.textContent = option.hint;
			row.append(hint);
		}
		group.append(row);
		return input;
	});

	return {
		element: group,
		checked: () => inputs.find((input) => input.checked),
	};
};

/**
 * Resolves when the page has drawn what it shows now.
 *
 * @remarks
 * The first frame draws the page as it stands; the second only begins once
 * that drawing is done. A page that is not visible draws no frames, so this
 * waits until it is visible again.
 */
const afterNextPaint = (): Promise<void> =>
	new Promise((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});

/** What {@link runCreate} does to the dialog and the page, step by step. */
export type CreateSteps = {
	/** Builds the world that was chosen; may throw. */
	createWorld(choice: NewWorldChoice): World;
	/** Hands the new world over to the page; may throw. */
	onWorld(world: World): void;
	/** Resolves when the page has drawn what it shows now. */
	afterPaint(): Promise<void>;
	/**
	 * Disables the dialog's controls or brings them back, and sets what the
	 * confirm button says.
	 */
	setBusy(busy: boolean, label: string): void;
	/** Says in the dialog what went wrong, and focuses the confirm button. */
	fail(message: string): void;
	/** Closes the dialog. */
	close(): void;
	/** Reports an error that was caught, for whoever debugs the page. */
	logError(error: unknown): void;
};

/**
 * Builds the world a valid form asks for and hands it over, in the order
 * that lets the page be seen to be busy first.
 *
 * @remarks
 * The controls are disabled, with the confirm button saying
 * {@link GENERATING_LABEL} for generated continents and
 * {@link CONFIRM_LABEL} for a blank ocean, and that is drawn before the
 * world is built. The new world is handed over, one more drawing is waited
 * for, and the dialog is closed.
 *
 * If building the world throws, the error is logged, the controls come
 * back under {@link CONFIRM_LABEL}, {@link CREATE_FAILED_MESSAGE} is said,
 * and nothing is handed over or closed. If handing the world over throws,
 * the error is logged and the dialog still closes after the drawing.
 *
 * @param choice - The world to build.
 * @param steps - What each step does.
 * @returns A promise that resolves when the last step is done; it never
 * rejects because `createWorld` or `onWorld` threw.
 */
export const runCreate = async (
	choice: NewWorldChoice,
	steps: CreateSteps,
): Promise<void> => {
	steps.setBusy(
		true,
		choice.kind === 'generated' ? GENERATING_LABEL : CONFIRM_LABEL,
	);
	await steps.afterPaint();
	let world: World;
	try {
		world = steps.createWorld(choice);
	} catch (error) {
		steps.logError(error);
		steps.setBusy(false, CONFIRM_LABEL);
		steps.fail(CREATE_FAILED_MESSAGE);
		return;
	}
	try {
		steps.onWorld(world);
	} catch (error) {
		steps.logError(error);
	}
	await steps.afterPaint();
	steps.close();
};

/**
 * Opens the dialog that starts a new world.
 *
 * @remarks
 * The dialog is modal: the rest of the page cannot be used, sculpted or
 * scrolled while it is open, and the keyboard's focus stays inside it. It
 * is added to the page when opened and taken out again when closed, after
 * which the focus is back where it was.
 *
 * The seed, its Random button and the land slider belong to generated
 * continents and are disabled while a blank ocean is chosen. Random fills
 * the seed field with a fresh seed.
 *
 * Confirming, by the button or by Enter in any control, reads the form
 * with {@link parseNewWorldValues}. A value that is rejected is explained
 * beside the seed field or above the buttons, as text, and the dialog stays
 * open with the focus on the seed field when the seed is at fault.
 * Otherwise every control is disabled, the confirm button says
 * {@link GENERATING_LABEL} for generated continents, and the world is built
 * only after the page has drawn that, because building it keeps the page
 * from drawing anything until it is done.
 *
 * Cancel and Escape close the dialog with nothing changed. Once the world
 * is being built there is no cancelling: Escape is ignored and the buttons
 * are disabled until the dialog closes on the new world. Should the browser
 * close the dialog all the same, the world is still built and handed over.
 * The dialog stays open, and the page behind it out of reach, for one more
 * frame after the world is handed over, so that clicks and keys made while
 * the page was busy land on the dialog and not on the new world.
 *
 * @param options - The starting values and the callbacks.
 * @returns The dialog, already open.
 */
export const openNewWorldDialog = (
	options: NewWorldDialogOptions,
): HTMLDialogElement => {
	const { values } = options;
	let busy = false;

	const dialog = createElement('dialog', 'dialog');
	dialog.setAttribute('aria-labelledby', TITLE_ID);
	const form = createElement('form', 'dialog__form');
	form.method = 'dialog';
	form.noValidate = true;

	const title = createElement('h2', 'dialog__title');
	title.id = TITLE_ID;
	title.textContent = 'New world';

	const resolution = createChoiceGroup({
		legend: 'Resolution',
		name: 'resolution',
		options: SUPPORTED_RESOLUTIONS.map((supported) => ({
			value: String(supported),
			label: String(supported),
			hint: RESOLUTION_HINTS[supported],
		})),
		value: values.resolution,
	});
	const kind = createChoiceGroup({
		legend: 'Start with',
		name: 'kind',
		options: [
			{ value: 'blank', label: START_LABELS.blank },
			{ value: 'generated', label: START_LABELS.generated },
		],
		value: values.kind,
	});

	const generated = createElement('fieldset', 'new-world__generated');
	const generatedLegend = createElement('legend', 'u-visually-hidden');
	generatedLegend.textContent = START_LABELS.generated;
	const syncGenerated = (): void => {
		generated.disabled = kind.checked()?.value !== 'generated';
	};

	const seedField = createElement('div', 'field');
	const seedLabel = createElement('label', 'field__label');
	seedLabel.htmlFor = SEED_ID;
	seedLabel.textContent = 'Seed';
	const seed = createElement('input', 'text-input');
	seed.id = SEED_ID;
	seed.type = 'text';
	seed.name = 'seed';
	seed.inputMode = 'numeric';
	seed.autocomplete = 'off';
	seed.spellcheck = false;
	seed.value = values.seed;
	seed.setAttribute('aria-describedby', `${SEED_HINT_ID} ${SEED_ERROR_ID}`);
	const seedHint = createElement('p', 'field__hint');
	seedHint.id = SEED_HINT_ID;
	seedHint.textContent = 'Leave blank for a random seed.';
	const seedError = createElement('p', 'field__error');
	seedError.id = SEED_ERROR_ID;
	seedError.setAttribute('role', 'alert');
	seedError.hidden = true;

	const setSeedError = (message: string | null): void => {
		seedError.textContent = message ?? '';
		seedError.hidden = message === null;
		if (message === null) {
			seed.removeAttribute('aria-invalid');
		} else {
			seed.setAttribute('aria-invalid', 'true');
		}
	};
	seed.addEventListener('input', () => setSeedError(null));
	// A change of a radio button is reported to the group it is in.
	kind.element.addEventListener('change', () => {
		syncGenerated();
		setSeedError(null);
	});
	const random = createButton({
		label: 'Random',
		title: 'Fill in a random seed',
		onClick: () => {
			seed.value = String(randomSeed());
			setSeedError(null);
		},
	});
	random.classList.add(COMPACT_BUTTON_CLASS);
	const seedRow = createElement('div', 'new-world__seed-row');
	seedRow.append(seed, random);
	seedField.append(seedLabel, seedRow, seedHint, seedError);

	let landPercent = landPercentOf(values.landPercent);
	const land = createRangeField({
		id: LAND_ID,
		label: 'Land',
		min: MIN_LAND_PERCENT,
		max: MAX_LAND_PERCENT,
		step: LAND_SLIDER_STEP_PERCENT,
		value: landPercent,
		format: formatPercent,
		onInput: (percent) => {
			landPercent = percent;
		},
	});
	generated.append(generatedLegend, seedField, land.element);
	syncGenerated();

	const warning = createElement('p', 'dialog__warning');
	warning.textContent = 'This replaces the current world and cannot be undone.';
	const failure = createElement('p', 'dialog__error');
	failure.setAttribute('role', 'alert');
	failure.hidden = true;
	const setFailure = (message: string | null): void => {
		failure.textContent = message ?? '';
		failure.hidden = message === null;
	};

	const cancel = createButton({
		label: 'Cancel',
		onClick: () => {
			if (!busy) {
				dialog.close();
			}
		},
	});
	cancel.classList.add(COMPACT_BUTTON_CLASS);
	const confirm = createElement(
		'button',
		`button button--primary ${COMPACT_BUTTON_CLASS}`,
	);
	confirm.type = 'submit';
	confirm.textContent = CONFIRM_LABEL;
	const actions = createElement('div', 'dialog__actions');
	actions.append(cancel, confirm);

	/** Disables every control while a world is built, or brings them back. */
	const setBusy = (next: boolean, label: string): void => {
		busy = next;
		for (const control of [
			resolution.element,
			kind.element,
			generated,
			cancel,
			confirm,
		]) {
			control.disabled = next;
		}
		confirm.textContent = label;
		if (!next) {
			syncGenerated();
		}
	};

	const steps: CreateSteps = {
		createWorld: options.createWorld,
		onWorld: options.onWorld,
		afterPaint: afterNextPaint,
		setBusy,
		fail: (message) => {
			setFailure(message);
			confirm.focus();
		},
		close: () => dialog.close(),
		logError: (error) => console.error(error),
	};

	form.addEventListener('submit', (event) => {
		// The dialog closes only once the world has been made, not on submit.
		event.preventDefault();
		if (busy) {
			return;
		}
		setSeedError(null);
		setFailure(null);
		const parsed = parseNewWorldValues({
			resolution: resolution.checked()?.value ?? '',
			kind: kind.checked()?.value ?? '',
			seed: seed.value,
			landPercent,
		});
		if (parsed.ok) {
			void runCreate(parsed.choice, steps);
		} else if (parsed.field === 'seed') {
			setSeedError(parsed.message);
			seed.focus();
		} else {
			setFailure(parsed.message);
		}
	});
	dialog.addEventListener('cancel', (event) => {
		if (busy) {
			event.preventDefault();
		}
	});
	dialog.addEventListener('close', () => dialog.remove());

	form.append(
		title,
		resolution.element,
		kind.element,
		generated,
		warning,
		failure,
		actions,
	);
	dialog.append(form);
	(options.parent ?? document.body).append(dialog);

	// Without this the first radio button takes the focus, chosen or not.
	const first = resolution.checked();
	if (first !== undefined) {
		first.autofocus = true;
	}
	dialog.showModal();
	return dialog;
};
