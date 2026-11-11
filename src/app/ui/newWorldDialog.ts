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
	type EarthData,
	earthWorld,
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
	/** How the world starts: `blank`, `generated` or `earth`. */
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
	  }
	| {
			/** The real Earth, from its measured elevation. */
			readonly kind: 'earth';
			/** Cells along a face edge of the grid. */
			readonly resolution: Resolution;
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

/** Said when no way of starting a world is chosen. */
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

/** What the confirm button says while the Earth's data is being fetched. */
export const LOADING_EARTH_LABEL = 'Loading Earth…';

/** Said in the dialog when the Earth's data could not be fetched. */
export const EARTH_FAILED_MESSAGE =
	"Earth's elevation data could not be loaded. Check your connection and try again. The current world has not been changed.";

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
	earth: 'Earth',
};

/** What the dialog says after the name of the Earth start. */
export const EARTH_HINT = 'real elevation';

/** What the confirm button says while a world of each kind is made. */
const BUSY_LABELS: Readonly<Record<NewWorldChoice['kind'], string>> = {
	blank: CONFIRM_LABEL,
	generated: GENERATING_LABEL,
	earth: LOADING_EARTH_LABEL,
};

/** What the dialog says when a world of each kind could not be made. */
const FAILURE_MESSAGES: Readonly<Record<NewWorldChoice['kind'], string>> = {
	blank: CREATE_FAILED_MESSAGE,
	generated: CREATE_FAILED_MESSAGE,
	earth: EARTH_FAILED_MESSAGE,
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
 * blank world and for the Earth nothing else is read, so whatever the seed
 * field and the slider were left holding cannot stand in the way.
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
	if (values.kind === 'blank' || values.kind === 'earth') {
		return { ok: true, choice: { kind: values.kind, resolution } };
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
 * A blank world and an Earth world leave the seed blank and the land at
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
		case 'earth':
			return {
				resolution,
				kind: origin.kind,
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

/** Where the worlds that are not worked out on the spot come from. */
export type WorldSources = {
	/** Gives the Earth's elevation data, fetching it if need be. */
	readonly loadEarth: () => Promise<EarthData>;
};

/**
 * Builds the world a choice asks for.
 *
 * @remarks
 * Generating continents takes time in proportion to the number of cells:
 * about half a second at the highest resolution. The Earth takes as long as
 * its data takes to arrive the first time, and a few milliseconds after
 * that.
 *
 * @param choice - A blank ocean, generated continents or the Earth, and its
 * options.
 * @param sources - Where the Earth's data comes from. It is asked only for
 * an Earth world.
 * @returns A promise of a new world with the default sea level. It rejects
 * if the Earth's data cannot be had.
 */
export const worldFromChoice = async (
	choice: NewWorldChoice,
	sources: WorldSources,
): Promise<World> => {
	switch (choice.kind) {
		case 'blank':
			return createBlankWorld(choice.resolution);
		case 'generated':
			return generateWorld({
				resolution: choice.resolution,
				seed: choice.seed,
				landFraction: choice.landFraction,
			});
		case 'earth':
			return earthWorld(await sources.loadEarth(), choice.resolution);
	}
};

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
	 * Builds the world that was chosen, at once or in a while. Called once
	 * the confirm button has been seen to change, since it may take a while.
	 * If it throws or rejects, the dialog stays open and says that there is
	 * no new world.
	 */
	readonly createWorld: (choice: NewWorldChoice) => World | Promise<World>;
	/**
	 * Called with the new world, for the page to make it the one being
	 * edited. The dialog closes afterwards, whether or not this throws. Not
	 * called if the dialog closed while the world was being built.
	 */
	readonly onWorld: (world: World) => void;
	/**
	 * What went wrong that the dialog is opening because of, said under the
	 * title as plain text for as long as the dialog is open. Left out,
	 * nothing is said.
	 */
	readonly notice?: string;
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
	/** Builds the world that was chosen; may throw or reject. */
	createWorld(choice: NewWorldChoice): World | Promise<World>;
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
 * {@link GENERATING_LABEL} for generated continents,
 * {@link LOADING_EARTH_LABEL} for the Earth and {@link CONFIRM_LABEL} for a
 * blank ocean, and that is drawn before the world is built. Building may
 * take a while without holding the page up, as fetching the Earth's data
 * does; the controls stay disabled until it is over. The new world is
 * handed over, one more drawing is waited for, and the dialog is closed.
 *
 * If building the world fails, the error is logged, the controls come back
 * under {@link CONFIRM_LABEL}, and the dialog says
 * {@link EARTH_FAILED_MESSAGE} for the Earth, whose data did not arrive,
 * and {@link CREATE_FAILED_MESSAGE} otherwise; nothing is handed over or
 * closed. If handing the world over throws, the error is logged and the
 * dialog still closes after the drawing.
 *
 * @param choice - The world to build.
 * @param steps - What each step does.
 * @returns A promise that resolves when the last step is done; it never
 * rejects because `createWorld` or `onWorld` failed.
 */
export const runCreate = async (
	choice: NewWorldChoice,
	steps: CreateSteps,
): Promise<void> => {
	steps.setBusy(true, BUSY_LABELS[choice.kind]);
	await steps.afterPaint();
	let world: World;
	try {
		world = await steps.createWorld(choice);
	} catch (error) {
		steps.logError(error);
		steps.setBusy(false, CONFIRM_LABEL);
		steps.fail(FAILURE_MESSAGES[choice.kind]);
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
 * The steps for a dialog that may close while its world is being built: once
 * it has closed, the world is not handed over and a failure is not said.
 *
 * @remarks
 * A browser may close a dialog that asked to stay open, as a Chromium
 * browser does at a second Escape, and fetching the Earth's data can take a
 * minute. Whoever
 * closed the dialog takes the current world to be staying, so a world that
 * arrives afterwards is dropped; and a failure has no dialog left to be
 * said in.
 *
 * @param steps - The steps to take while the dialog is open.
 * @param isClosed - Whether the dialog has closed.
 * @returns `steps`, but with an `onWorld` and a `fail` that do nothing once
 * `isClosed` gives true.
 */
export const stepsUntilClosed = (
	steps: CreateSteps,
	isClosed: () => boolean,
): CreateSteps => ({
	...steps,
	onWorld: (world) => {
		if (!isClosed()) {
			steps.onWorld(world);
		}
	},
	fail: (message) => {
		if (!isClosed()) {
			steps.fail(message);
		}
	},
});

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
 * continents and are disabled while a blank ocean or the Earth is chosen.
 * Random fills the seed field with a fresh seed.
 *
 * Confirming, by the button or by Enter in any control, reads the form
 * with {@link parseNewWorldValues}. A value that is rejected is explained
 * beside the seed field or above the buttons, as text, and the dialog stays
 * open with the focus on the seed field when the seed is at fault.
 * Otherwise every control is disabled, the confirm button says
 * {@link GENERATING_LABEL} for generated continents or
 * {@link LOADING_EARTH_LABEL} for the Earth, and the world is built only
 * after the page has drawn that, because generating keeps the page from
 * drawing anything until it is done. The Earth's data is fetched the first
 * time an Earth world is made; if it does not arrive, the dialog says so
 * above the buttons and its controls come back for another try.
 *
 * Cancel and Escape close the dialog with nothing changed. Once the world
 * is being built there is no cancelling: Escape is ignored and the buttons
 * are disabled until the dialog closes on the new world. Should the browser
 * close the dialog all the same, as it may at a second Escape, the world
 * being built is dropped when it arrives and the current world stays; if
 * building it fails, the error is logged and nothing is said.
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
	let closed = false;

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
			{ value: 'earth', label: START_LABELS.earth, hint: EARTH_HINT },
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

	const steps = stepsUntilClosed(
		{
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
		},
		() => closed,
	);

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
	dialog.addEventListener('close', () => {
		closed = true;
		dialog.remove();
	});

	form.append(title);
	if (options.notice !== undefined) {
		const notice = createElement('p', 'dialog__error');
		notice.setAttribute('role', 'alert');
		notice.textContent = options.notice;
		form.append(notice);
	}
	form.append(
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
