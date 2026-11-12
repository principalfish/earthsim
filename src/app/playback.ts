/**
 * Playing through the year: the month on screen moving on by itself, one
 * month at a time, round and round.
 */

import { MONTH_NAMES } from './view';

/** How long each month stays on screen while the year plays, in ms. */
export const PLAYBACK_STEP_MS = 1000;

/** What playback starts on, how it waits and whom it tells. */
export type PlaybackOptions = {
	/** The month it starts on, from January at 0 to December at 11. */
	readonly month: number;
	/** Called with the month each time playback moves on to it. */
	readonly onMonth: (month: number) => void;
	/** Called whenever playback starts or stops. */
	readonly onPlayingChange: (playing: boolean) => void;
	/** Calls back once after a wait, returning a handle to cancel it. */
	readonly setTimer: (callback: () => void, delayMs: number) => number;
	/** Cancels a wait that has not yet run out. */
	readonly clearTimer: (handle: number) => void;
};

/** Playback through the year. */
export type Playback = {
	/** The month on screen, from January at 0 to December at 11. */
	readonly month: number;
	/** Whether the year is playing. */
	readonly playing: boolean;
	/** Starts playing from the month on screen; nothing if already playing. */
	play(): void;
	/** Stops playing, on the month on screen; nothing if already stopped. */
	pause(): void;
	/**
	 * Puts another month on screen, as a move of the slider does.
	 * `onMonth` is not called.
	 *
	 * @param month - The month, from 0 to 11.
	 * @throws RangeError if it is not a whole number from 0 to 11.
	 */
	setMonth(month: number): void;
};

/** Checks that a month is one of the twelve. */
const checkMonth = (month: number): number => {
	if (!Number.isInteger(month) || month < 0 || month >= MONTH_NAMES.length) {
		throw new RangeError(
			`A month is a whole number from 0 to ${MONTH_NAMES.length - 1}; got ${month}`,
		);
	}
	return month;
};

/**
 * Makes playback through the year, stopped on the month it is given.
 *
 * @remarks
 * While playing, the month moves on by one every {@link PLAYBACK_STEP_MS},
 * from December back to January. A month put on screen while playing, as
 * by each move of the slider, is where playback carries on from: it
 * restarts the wait of a whole step, so the month chosen is seen for a full
 * step before playback moves on. Nothing else holds playback back, so a
 * slider held still for longer than a step is moved on like any other.
 *
 * The next step is waited for before `onMonth` hears of this one, so one
 * that throws does not stop the year playing.
 *
 * @param options - The starting month, the timers and whom to tell.
 * @returns The playback, stopped.
 * @throws RangeError if the starting month is not a whole number from 0
 * to 11.
 */
export const createPlayback = (options: PlaybackOptions): Playback => {
	let month = checkMonth(options.month);
	let timer: number | null = null;

	const wait = (): void => {
		timer = options.setTimer(step, PLAYBACK_STEP_MS);
	};
	const step = (): void => {
		month = (month + 1) % MONTH_NAMES.length;
		wait();
		options.onMonth(month);
	};
	const stopWaiting = (): void => {
		if (timer !== null) {
			options.clearTimer(timer);
			timer = null;
		}
	};

	return {
		get month() {
			return month;
		},
		get playing() {
			return timer !== null;
		},
		play: () => {
			if (timer !== null) {
				return;
			}
			wait();
			options.onPlayingChange(true);
		},
		pause: () => {
			if (timer === null) {
				return;
			}
			stopWaiting();
			options.onPlayingChange(false);
		},
		setMonth: (next) => {
			month = checkMonth(next);
			if (timer !== null) {
				stopWaiting();
				wait();
			}
		},
	};
};
