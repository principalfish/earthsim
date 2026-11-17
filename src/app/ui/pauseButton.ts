/**
 * The Pause button: in the top-right corner of the globe's area, the
 * switch that stops the temperature and the winds being worked out after
 * each change of the world, and lets them catch up again.
 */

import { createElement } from './fields';
import { pauseIcon, playIcon } from './icons';

/**
 * The button's accessible name, whether pressed or not, and its word and
 * tooltip while the calculation runs.
 */
export const PAUSE_BUTTON_LABEL = 'Pause';

/** The button's word and tooltip while the calculation is paused. */
export const RESUME_BUTTON_LABEL = 'Resume';

/** Whom the Pause button tells of a press. */
export type PauseButtonOptions = {
	/** Called with whether the calculation is now to be paused. */
	readonly onPause: (paused: boolean) => void;
};

/** The Pause button on the page. */
export type PauseButton = {
	/** The button, to put in the corner over the globe. */
	readonly element: HTMLButtonElement;
};

/**
 * Creates the Pause button, not pressed.
 *
 * @remarks
 * It is a toggle button, pressed while the calculation is paused, and
 * pressed or released with a click, Space or Enter, each press telling
 * `onPause`. Released, it shows the pause icon and the word
 * {@link PAUSE_BUTTON_LABEL}; pressed, the play icon and
 * {@link RESUME_BUTTON_LABEL}, the word being its tooltip too. Its
 * accessible name is {@link PAUSE_BUTTON_LABEL} in both states, set apart
 * from the word, with `aria-pressed` telling whether it is pressed; so the
 * name holds whether or not the stylesheet shows the word, as in a narrow
 * window it does not. The icon is hidden from screen readers. Nothing
 * remembers it: a page always starts with the button released.
 *
 * @param options - Whom to tell of a press.
 * @returns The button, not yet on the page.
 */
export const createPauseButton = (options: PauseButtonOptions): PauseButton => {
	const element = createElement('button', 'pause-button');
	element.type = 'button';
	element.setAttribute('aria-label', PAUSE_BUTTON_LABEL);
	const label = createElement('span', 'pause-button__label');
	let paused = false;
	const show = (): void => {
		const word = paused ? RESUME_BUTTON_LABEL : PAUSE_BUTTON_LABEL;
		element.setAttribute('aria-pressed', String(paused));
		element.title = word;
		label.textContent = word;
		element.replaceChildren(paused ? playIcon() : pauseIcon(), label);
	};
	show();
	element.addEventListener('click', () => {
		paused = !paused;
		show();
		options.onPause(paused);
	});
	return { element };
};
