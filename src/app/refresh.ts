/**
 * Deciding when to ask the simulation worker for something again: a short
 * while after the last change, however many changes came together.
 */

import type { LatestOutcome } from '../worker/client';

/**
 * How long the statistics wait after the last change before they are asked
 * for, in milliseconds. With the time the worker takes this keeps the
 * readout within about a quarter of a second of an edit.
 */
export const STATS_DEBOUNCE_MS = 150;

/** What a refresh scheduler asks for, when, and whom it tells. */
export type RefreshOptions<T, H> = {
	/**
	 * Asks for the result as things stand at the moment it is called, as a
	 * client's latest-wins request does: an answer overtaken by a newer
	 * request comes back marked as superseded.
	 */
	readonly request: () => Promise<LatestOutcome<T>>;
	/** How long to wait after the last change, in milliseconds. */
	readonly debounceMs: number;
	/** Starts a timer, as `setTimeout` does, and returns its handle. */
	readonly setTimer: (callback: () => void, delayMs: number) => H;
	/** Cancels a timer by its handle, as `clearTimeout` does. */
	readonly clearTimer: (handle: H) => void;
	/**
	 * Whether what the result is computed from is in the middle of being
	 * changed, as terrain is during a brush stroke. While it is, a wait
	 * that ends starts again instead of making the request. Left out, the
	 * request is always made when the wait ends.
	 */
	readonly isBusy?: () => boolean;
	/** Called with each result that no newer request has overtaken. */
	readonly onResult: (result: T) => void;
	/** Called with what went wrong when a request fails. */
	readonly onError: (error: unknown) => void;
	/**
	 * Called when `reset` leaves the result on show describing something
	 * that is no longer there, with the next result still to come. Left out,
	 * nobody is told.
	 */
	readonly onPending?: () => void;
	/**
	 * Called when `markUnavailable` says that no request can be answered
	 * any more, and again for every `refresh` after that.
	 */
	readonly onUnavailable: () => void;
};

/** Keeps a computed result up to date with what it is computed from. */
export type RefreshScheduler = {
	/**
	 * Says that what the result is computed from has changed. The request
	 * is made once no further change has come for the debounce time, or
	 * later if `isBusy` says a change is under way when that time is up.
	 */
	refresh(): void;
	/**
	 * Says that what the result is computed from has been replaced by
	 * something else, as a world is by another. The answer to a request
	 * already made, whether a result or an error, is dropped when it
	 * arrives, and `onPending` is called. A request that is waiting to be
	 * made still is: it describes things as they are when it is made. Once
	 * marked unavailable, this does nothing.
	 */
	reset(): void;
	/**
	 * Says that no request can be answered from now on, as when the worker
	 * that answers them is gone. `onUnavailable` is called, now and for
	 * every `refresh` afterwards, and no request is made again; one that is
	 * waiting to be made is cancelled, and a result still on its way is
	 * dropped. There is no way back.
	 */
	markUnavailable(): void;
	/**
	 * Cancels a request that is waiting to be made and stops reporting: no
	 * callback is called again, and the other methods do nothing.
	 */
	dispose(): void;
};

/**
 * Asks for a result again after changes, once they have stopped coming.
 *
 * @remarks
 * Every `refresh` restarts the wait, so a run of changes closer together
 * than the debounce time, such as a slider being dragged, leads to one
 * request when it pauses or ends. The request is made when the wait is
 * over and so describes things as they are then, not as they were when
 * `refresh` was called.
 *
 * A wait can end while the next change is already under way: the wait left
 * by one brush stroke can end during the stroke after it. With `isBusy`
 * given, the request is not made then, since it would describe a change
 * half made. The wait starts again, for the debounce time each time, until
 * it ends with nothing under way, so the request is put off and never
 * dropped.
 *
 * A request already under way is not waited for: the next is made on time
 * and the earlier one comes back superseded, which is not an error and is
 * reported to nobody. A result is therefore never replaced by an older one.
 *
 * A request that fails is reported and forgotten: the next `refresh` asks
 * again. Only `markUnavailable` stops the asking for good.
 *
 * @param options - The request, the wait, the timers and the callbacks.
 * @returns The scheduler.
 */
export const createRefreshScheduler = <T, H>(
	options: RefreshOptions<T, H>,
): RefreshScheduler => {
	let timer: { readonly handle: H } | null = null;
	let disposed = false;
	let unavailable = false;
	/** Counts the calls of `reset`: an answer is wanted only by its own. */
	let generation = 0;

	// As an async function, so that a request that throws instead of
	// returning a promise is reported like one that rejects.
	const ask = async (): Promise<LatestOutcome<T>> => options.request();

	const send = (): void => {
		const asked = generation;
		const wanted = (): boolean => !disposed && asked === generation;
		ask().then(
			(outcome) => {
				if (wanted() && !unavailable && !outcome.superseded) {
					options.onResult(outcome.result);
				}
			},
			(error: unknown) => {
				if (wanted()) {
					options.onError(error);
				}
			},
		);
	};

	const cancel = (): void => {
		if (timer !== null) {
			options.clearTimer(timer.handle);
			timer = null;
		}
	};

	const arm = (): void => {
		timer = { handle: options.setTimer(fire, options.debounceMs) };
	};

	const fire = (): void => {
		timer = null;
		if (options.isBusy?.() === true) {
			arm();
			return;
		}
		send();
	};

	return {
		refresh: () => {
			if (disposed) {
				return;
			}
			if (unavailable) {
				options.onUnavailable();
				return;
			}
			cancel();
			arm();
		},
		reset: () => {
			if (disposed || unavailable) {
				return;
			}
			generation++;
			options.onPending?.();
		},
		markUnavailable: () => {
			if (disposed) {
				return;
			}
			unavailable = true;
			cancel();
			options.onUnavailable();
		},
		dispose: () => {
			disposed = true;
			cancel();
		},
	};
};
