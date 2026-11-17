/**
 * The timeline: along the bottom of the globe's area, beside the dock, the
 * month on screen and the button that plays the year, shown while what is
 * on screen depends on the month.
 */

import { MONTH_NAMES, offersMonth, type PageView } from '../layers/view';
import { createElement, rangeFraction, thumbCentre } from './fields';
import { pauseIcon, playIcon } from './icons';

/** The month slider's accessible name. */
export const MONTH_LABEL = 'Month';

/** The play button's accessible name while the year is not playing. */
export const PLAY_LABEL = 'Play the year';

/** The play button's accessible name while the year is playing. */
export const PAUSE_LABEL = 'Pause the year';

/** The play button's tooltip while the year is not playing. */
const PLAY_TITLE = 'Play through the year, a month a second';

/** The play button's tooltip while the year is playing. */
const PAUSE_TITLE = 'Pause on the month shown';

/** The last month's index, December's, the slider's highest value. */
const LAST_MONTH = MONTH_NAMES.length - 1;

/** What the timeline starts with and whom it tells of a choice. */
export type TimelineOptions = {
	/** The view settings shown at first, with the year not playing. */
	readonly view: PageView;
	/**
	 * Called with the month, from January at 0, whenever the slider moves or
	 * a month's letter is clicked.
	 */
	readonly onMonth: (month: number) => void;
	/** Called when the play button is pressed, to play or to pause. */
	readonly onPlay: () => void;
};

/** The timeline on the page. */
export type Timeline = {
	/** The timeline, to put in its place over the globe. */
	readonly element: HTMLElement;
	/**
	 * Shows the view settings and whether the year is playing: the timeline
	 * where {@link offersMonth} says, the month on the slider, and the play
	 * button as Pause while the year plays. Nothing is called back.
	 */
	showView(view: PageView, playing: boolean): void;
};

/**
 * Creates the timeline, on the view given, with the year not playing.
 *
 * @remarks
 * The month is a range input from January to December, a step a month, so
 * the arrow keys move it a month at a time; a screen reader hears it by
 * its name, {@link MONTH_LABEL}, and by the month's name. Over its track
 * stand the months' first letters, each where the middle of the slider's
 * thumb stands at that month, with the month on screen boxed. The letters
 * are for the eye and the pointer only: hidden from screen readers and
 * never reached with Tab, a click on one chooses its month as moving the
 * slider there does.
 *
 * Before the slider is the play button, an icon with no words: the play
 * icon, named {@link PLAY_LABEL}, until the year plays, and the pause icon,
 * named {@link PAUSE_LABEL}, while it does, each with a tooltip saying
 * what a press does.
 *
 * The timeline is hidden while what is on screen does not depend on the
 * month, as {@link offersMonth} decides.
 *
 * @param options - The starting view settings and whom to tell of a
 * choice.
 * @returns The timeline, with its element not yet on the page.
 */
export const createTimeline = (options: TimelineOptions): Timeline => {
	const element = createElement('div', 'timeline');

	const play = createElement('button', 'timeline__play');
	play.type = 'button';
	play.addEventListener('click', options.onPlay);
	/** Whether the button shows the year playing; unset until first shown. */
	let shownPlaying: boolean | null = null;
	const showPlaying = (playing: boolean): void => {
		if (playing === shownPlaying) {
			return;
		}
		shownPlaying = playing;
		play.setAttribute('aria-label', playing ? PAUSE_LABEL : PLAY_LABEL);
		play.title = playing ? PAUSE_TITLE : PLAY_TITLE;
		play.replaceChildren(playing ? pauseIcon() : playIcon());
	};

	const slider = createElement('input', 'timeline__slider');
	slider.type = 'range';
	slider.min = '0';
	slider.max = String(LAST_MONTH);
	slider.step = '1';
	slider.setAttribute('aria-label', MONTH_LABEL);

	const months = createElement('div', 'timeline__months');
	months.setAttribute('aria-hidden', 'true');
	const letters = MONTH_NAMES.map((name, index) => {
		const letter = createElement('span', 'timeline__month');
		letter.textContent = name.charAt(0);
		letter.title = name;
		letter.style.left = thumbCentre(rangeFraction(index, 0, LAST_MONTH));
		letter.addEventListener('click', () => choose(index));
		return letter;
	});
	months.append(...letters);

	/** Puts a month on the slider and marks its letter. */
	const showMonth = (month: number): void => {
		slider.value = String(month);
		slider.setAttribute('aria-valuetext', MONTH_NAMES[month] ?? '');
		letters.forEach((letter, index) => {
			letter.classList.toggle('is-chosen', index === month);
		});
	};
	const choose = (month: number): void => {
		showMonth(month);
		options.onMonth(month);
	};
	slider.addEventListener('input', () => choose(slider.valueAsNumber));

	const track = createElement('div', 'timeline__track');
	track.append(months, slider);
	element.append(play, track);

	const showView = (view: PageView, playing: boolean): void => {
		element.hidden = !offersMonth(view);
		showMonth(view.month);
		showPlaying(playing);
	};
	showView(options.view, false);
	return { element, showView };
};
