/**
 * The world controls: a line saying which world is being edited, the
 * buttons that start a new one, export it and import another, and a line
 * saying whether it has been saved.
 */

import type { World, WorldFileError, WorldFileResult } from '../../core/index';
import type { AutosaveState } from '../autosave';
import { WORLD_FILE_EXTENSION } from '../storage';
import { createButton, createElement } from './fields';

/** What separates the parts of the line that describes a world. */
const PART_SEPARATOR = ' · ';

/**
 * The significant digits a land percentage is written with when it is not a
 * whole number: enough to tell any two apart that a person would type, and
 * few enough to drop the noise of binary fractions.
 */
const LAND_PERCENT_DIGITS = 12;

/** Said once the world has been saved in the browser. */
export const SAVED_LABEL = 'Saved';

/** Said when the browser will not store the world. */
export const AUTOSAVE_UNAVAILABLE_LABEL = 'Autosave unavailable';

/** Said of a file that is no world file at all. */
export const NOT_A_WORLD_MESSAGE = 'That file is not an earth_sim world.';

/** Said of a world file that is cut short or holds what no world can. */
export const DAMAGED_FILE_MESSAGE = 'That world file is damaged or incomplete.';

/** Said of a world file in a format this page does not know. */
export const NEWER_FILE_MESSAGE =
	'That world file was made by a newer version of earth_sim.';

/** Said when the browser cannot read the file that was chosen. */
export const UNREADABLE_FILE_MESSAGE = 'That file could not be read.';

/** Said when the world could not be written out as a file. */
export const EXPORT_FAILED_MESSAGE = 'The world could not be exported.';

/** What the world panel starts with and whom it tells. */
export type WorldPanelOptions = {
	/** The line describing the world shown at first. */
	readonly description: string;
	/** Called when the button for a new world is pressed. */
	readonly onNewWorld: () => void;
	/** Called when the Export button is pressed. */
	readonly onExport: () => void;
	/**
	 * Called when the Import button is pressed, before the browser asks
	 * which file.
	 */
	readonly onImportOpen: () => void;
	/**
	 * Called with the file that was chosen to import: any file at all,
	 * whatever its name.
	 */
	readonly onImport: (file: Blob) => void;
};

/** The world controls on the page. */
export type WorldPanel = {
	/** The section that holds the controls. */
	readonly element: HTMLElement;
	/**
	 * Shows another line describing the world being edited.
	 *
	 * @param description - The line, shown as plain text: see
	 * {@link describeWorld}.
	 */
	setDescription(description: string): void;
	/**
	 * Shows how the last save went: {@link SAVED_LABEL} or
	 * {@link AUTOSAVE_UNAVAILABLE_LABEL}. Until the first call the line is
	 * empty.
	 */
	setAutosaveState(state: AutosaveState): void;
	/**
	 * Says why an import or an export did not happen, or takes back what
	 * was said.
	 *
	 * @param message - What to say, shown as plain text, or null for
	 * nothing.
	 */
	setMessage(message: string | null): void;
};

/** What {@link runImport} does to the page, step by step. */
export type ImportSteps = {
	/**
	 * Reads the file as a world, trusting nothing about it. Rejects if the
	 * file cannot be read at all.
	 */
	read(file: Blob): Promise<WorldFileResult>;
	/** Hands the world that was read over to the page; may throw. */
	onWorld(world: World): void;
	/** Says in the panel why nothing was imported. */
	showMessage(message: string): void;
	/** Reports an error that was caught, for whoever debugs the page. */
	logError(error: unknown): void;
};

/**
 * What the panel says of a file that could not be read as a world.
 *
 * @remarks
 * The wording is fixed for each reason. Nothing a file holds is ever part
 * of what is said about it.
 *
 * @param error - Why the core refused the file.
 */
export const importErrorMessage = (error: WorldFileError): string => {
	switch (error) {
		case 'bad-marker':
			return NOT_A_WORLD_MESSAGE;
		case 'unknown-version':
			return NEWER_FILE_MESSAGE;
		case 'truncated':
		case 'header-too-long':
		case 'bad-header':
		case 'bad-resolution':
		case 'bad-length':
		case 'not-finite':
			return DAMAGED_FILE_MESSAGE;
	}
};

/**
 * What the panel says about how the last save went.
 *
 * @param state - Whether the world was stored.
 */
export const autosaveLabel = (state: AutosaveState): string =>
	state === 'saved' ? SAVED_LABEL : AUTOSAVE_UNAVAILABLE_LABEL;

/**
 * Reads a file that was chosen and, if it holds a world, hands the world
 * over.
 *
 * @remarks
 * The file is read into a world of its own before anything on the page is
 * touched. If it cannot be read, or is refused, the panel says so in fixed
 * words and nothing is handed over: the page is exactly as it was. Only a
 * world that passed every check is handed over.
 *
 * If handing the world over throws, the error is logged; by then the world
 * has been replaced.
 *
 * @param file - The file that was chosen.
 * @param steps - What each step does.
 * @returns A promise that resolves when the last step is done; it never
 * rejects because `read` rejected or `onWorld` threw.
 */
export const runImport = async (
	file: Blob,
	steps: ImportSteps,
): Promise<void> => {
	let result: WorldFileResult;
	try {
		result = await steps.read(file);
	} catch (error) {
		steps.logError(error);
		steps.showMessage(UNREADABLE_FILE_MESSAGE);
		return;
	}
	if (!result.ok) {
		steps.showMessage(importErrorMessage(result.error));
		return;
	}
	try {
		steps.onWorld(result.world);
	} catch (error) {
		steps.logError(error);
	}
};

/**
 * The share of a generated world that was asked to be land, as the panel
 * shows it: `30%`.
 *
 * @remarks
 * A fraction that is exactly a whole number of hundredths, which is what
 * the new-world slider gives, is written as that whole percentage, so the
 * figure shown reproduces the world. Any other fraction is written with as
 * many decimals as it needs, to twelve significant digits, such as `12.5%`:
 * it is never rounded to a nearby whole percentage that would give another
 * world, unless it is within that precision of one.
 *
 * @param landFraction - The share, from 0 to 1.
 */
export const formatLandPercent = (landFraction: number): string => {
	const whole = Math.round(landFraction * 100);
	const percent =
		whole / 100 === landFraction
			? whole
			: Number((landFraction * 100).toPrecision(LAND_PERCENT_DIGITS));
	return `${percent}%`;
};

/**
 * One line saying how a world started: `Blank ocean · 128`, or
 * `Generated · 64 · seed 1977 · 30% land`.
 *
 * @remarks
 * The number after the first part is the resolution, in cells along a face
 * edge. The seed is written with no grouping of its digits, so that it can
 * be copied from the line into the new-world dialog as it stands. The line
 * describes the start only: sculpting and the sea level do not change it.
 *
 * @param world - The world to describe.
 */
export const describeWorld = (world: World): string => {
	const { origin, resolution } = world;
	switch (origin.kind) {
		case 'blank':
			return ['Blank ocean', resolution].join(PART_SEPARATOR);
		case 'generated':
			return [
				'Generated',
				resolution,
				`seed ${origin.seed}`,
				`${formatLandPercent(origin.landFraction)} land`,
			].join(PART_SEPARATOR);
	}
};

/**
 * Adds the world controls to the side panel.
 *
 * @remarks
 * The line describing the world is ordinary text, so the seed in it can be
 * selected and copied.
 *
 * Import asks the browser for a file, offering those named as world files
 * are; whichever file is chosen is passed on, and the same file can be
 * chosen again straight away.
 *
 * Under the buttons are two lines, each empty until there is something to
 * say: what went wrong with an import or an export, and how the last save
 * went. Both are set as plain text.
 *
 * @param panel - The panel to add the controls to, after what it holds.
 * @param options - The starting line and the callbacks for the buttons.
 * @returns The controls that were added.
 */
export const createWorldPanel = (
	panel: HTMLElement,
	options: WorldPanelOptions,
): WorldPanel => {
	const section = createElement('section', 'panel__section');
	const heading = createElement('h2', 'panel__heading');
	heading.textContent = 'World';

	const description = createElement('p', 'world-summary');
	description.textContent = options.description;

	// Out of sight: the Import button stands in for it.
	const chooser = createElement('input', 'world-file');
	chooser.type = 'file';
	chooser.accept = WORLD_FILE_EXTENSION;
	chooser.hidden = true;
	chooser.addEventListener('change', () => {
		const file = chooser.files?.[0];
		// Emptied, so that choosing the same file again is a change too.
		chooser.value = '';
		if (file !== undefined) {
			options.onImport(file);
		}
	});

	const buttons = createElement('div', 'button-row button-row--three');
	buttons.append(
		createButton({
			label: 'New world',
			title: 'Replace this world with a new one',
			onClick: options.onNewWorld,
		}),
		createButton({
			label: 'Export',
			title: 'Download this world as a file',
			onClick: options.onExport,
		}),
		createButton({
			label: 'Import',
			title: 'Replace this world with one from a file',
			onClick: () => {
				options.onImportOpen();
				chooser.click();
			},
		}),
	);

	const status = createElement('div', 'world-status');
	const message = createElement('p', 'world-status__message');
	message.setAttribute('role', 'alert');
	const autosave = createElement('p', 'world-status__autosave');
	autosave.setAttribute('aria-live', 'polite');
	status.append(message, autosave);

	section.append(heading, description, buttons, chooser, status);
	panel.append(section);
	return {
		element: section,
		setDescription: (text) => {
			description.textContent = text;
		},
		setAutosaveState: (state) => {
			// Left alone when it already says so, so that a screen reader
			// is not told "Saved" again after every stroke.
			const label = autosaveLabel(state);
			if (autosave.textContent !== label) {
				autosave.textContent = label;
			}
		},
		setMessage: (text) => {
			message.textContent = text ?? '';
		},
	};
};
