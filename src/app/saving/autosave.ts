/**
 * Deciding when to save the world: a short while after the last change,
 * and at once when the page is about to go.
 */

/**
 * How long a save waits after the last change, in milliseconds: long enough
 * for a run of strokes or a slider being dragged to be saved once, short
 * enough that little is lost if the browser goes down.
 */
export const AUTOSAVE_DELAY_MS = 1000;

/**
 * How the last save went: `saved` if the world is stored, `unavailable` if
 * the browser would not store it.
 */
export type AutosaveState = 'saved' | 'unavailable';

/** What an autosave saves with, when, and whom it tells. */
export type AutosaveOptions<H> = {
	/**
	 * Saves the world as it is at the moment this is called, and settles
	 * once it is stored or could not be. `flush` may call it while an
	 * earlier save is still being stored: of two such saves, the one made
	 * later must be the one that stays.
	 */
	readonly save: () => Promise<void>;
	/** How long to wait after the last change, in milliseconds. */
	readonly delayMs: number;
	/** Starts a timer, as `setTimeout` does, and returns its handle. */
	readonly setTimer: (callback: () => void, delayMs: number) => H;
	/** Cancels a timer by its handle, as `clearTimeout` does. */
	readonly clearTimer: (handle: H) => void;
	/**
	 * Whether the world is in the middle of being changed, as terrain is
	 * during a brush stroke. While it is, a wait that ends starts again
	 * instead of saving. Left out, the world is always saved when the wait
	 * ends.
	 */
	readonly isBusy?: () => boolean;
	/** Called with how each save went, once it has settled. */
	readonly onState: (state: AutosaveState) => void;
	/** Called with what went wrong when a save fails, before `onState`. */
	readonly onError?: (error: unknown) => void;
};

/** Keeps the saved world up to date with the one being edited. */
export type Autosave = {
	/**
	 * Lets saving begin, once the world on the page is one that may take
	 * the place of the saved one. Until it is called, `markChanged` and
	 * `flush` do nothing and nothing is remembered: a change made before
	 * it is never saved, not even after it is called. Calling it again
	 * does nothing.
	 */
	start(): void;
	/**
	 * Says that the world has changed. It is saved once no further change
	 * has come for the delay, or later if `isBusy` says a change is under
	 * way when that time is up. Does nothing before `start`.
	 */
	markChanged(): void;
	/**
	 * Saves at once whatever has not been saved, for a page that is being
	 * hidden or closed and may get no later chance: `save` is called
	 * before this returns, even while an earlier save is still being
	 * stored. Does nothing if no change is under way and the world has not
	 * changed since the last save began, unless that save failed. Does
	 * nothing before `start`.
	 */
	flush(): void;
};

/**
 * Saves the world after changes, once they have stopped coming.
 *
 * @remarks
 * Nothing is saved, and no change is taken note of, until `start` is
 * called. The page calls it once it knows what was saved before, so that
 * the world it opens on can never be saved over that one.
 *
 * Every `markChanged` restarts the wait, so a run of changes closer
 * together than the delay leads to one save when it pauses or ends. The
 * save is made when the wait is over and so holds the world as it is then,
 * not as it was when `markChanged` was called.
 *
 * A wait can end during a change that takes a while, as the wait left by
 * one brush stroke can end during the next. With `isBusy` given, nothing is
 * saved then: the wait starts again, for the whole delay each time, until
 * it ends with nothing under way. `flush` is the exception. It saves the
 * world as it stands even with a change under way, and even if only that
 * change is unsaved, since a page being closed has no later.
 *
 * The saves made when a wait ends never overlap. One that falls due while
 * another is still being stored waits for it, and then a single save is
 * made, of the world as it is by then, however many fell due meanwhile. If
 * a change is under way at that moment the wait starts again instead. A
 * save that begins takes every change up to that moment with it, so a wait
 * still running is dropped.
 *
 * `flush` does not wait for a save that is being stored either: it makes
 * its own at once, alongside, because a save put off until the other is
 * done would never be made by a page that is closing. The save made last
 * holds the newest world and is the one that counts: it is the one `save`
 * must leave stored, and once it has settled, how an earlier one went is
 * no longer reported.
 *
 * A save that fails is reported through `onError` and `onState` and never
 * thrown. Nothing is retried on its own: the world it held counts as
 * unsaved, unless a later save has taken it, and the next change or
 * `flush` tries again.
 *
 * @param options - The save, the delay, the timers and the callbacks.
 * @returns The autosave.
 */
export const createAutosave = <H>(options: AutosaveOptions<H>): Autosave => {
	/** Whether `start` has been called. */
	let started = false;
	let timer: { readonly handle: H } | null = null;
	/**
	 * Whether the world holds something no save has taken: a change since
	 * the last save began, or what a save that failed was storing.
	 */
	let changed = false;
	/** How many saves are being stored now. */
	let storing = 0;
	/** How many saves have been begun. */
	let begun = 0;
	/** Of the saves that have settled, the place of the one begun last. */
	let latestSettled = 0;
	/** Whether a save fell due while another was being stored. */
	let queued = false;

	const isBusy = (): boolean => options.isBusy?.() === true;

	// As an async function, so that a save that throws instead of returning
	// a promise is reported like one that rejects. It still calls `save`
	// before it returns.
	const store = async (): Promise<void> => options.save();

	const cancel = (): void => {
		if (timer !== null) {
			options.clearTimer(timer.handle);
			timer = null;
		}
	};

	const arm = (): void => {
		timer = { handle: options.setTimer(fire, options.delayMs) };
	};

	const finish = (order: number, state: AutosaveState): void => {
		storing--;
		if (order > latestSettled) {
			latestSettled = order;
			options.onState(state);
		}
		if (!queued || storing > 0) {
			return;
		}
		queued = false;
		if (isBusy()) {
			cancel();
			arm();
		} else {
			begin();
		}
	};

	const begin = (): void => {
		cancel();
		changed = false;
		// Whatever was waiting its turn is in this save too.
		queued = false;
		storing++;
		const order = ++begun;
		store().then(
			() => finish(order, 'saved'),
			(error: unknown) => {
				options.onError?.(error);
				// Only `flush` and the next change act on this: no wait is
				// started, so a save that keeps failing is not made again
				// and again. A save begun later holds all that this one
				// did, and says for itself whether it is stored.
				if (order === begun) {
					changed = true;
				}
				finish(order, 'unavailable');
			},
		);
	};

	/** Saves now, or as soon as the save being stored is done. */
	const save = (): void => {
		if (storing > 0) {
			queued = true;
		} else {
			begin();
		}
	};

	const fire = (): void => {
		timer = null;
		if (isBusy()) {
			arm();
			return;
		}
		save();
	};

	return {
		start: () => {
			started = true;
		},
		markChanged: () => {
			if (!started) {
				return;
			}
			changed = true;
			cancel();
			arm();
		},
		flush: () => {
			if (started && (changed || isBusy())) {
				begin();
			}
		},
	};
};
