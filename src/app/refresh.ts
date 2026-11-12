/**
 * Deciding when to ask the simulation worker for something again: a short
 * while after the last change, however many changes came together.
 *
 * The refresh scheduler does that for any result. The temperature
 * scheduler is built on it: it asks only while the temperature is showing,
 * starts each request from the last completed result, and keeps the
 * result, where it stands against the world and the progress of the
 * calculation under way in the page's layer store.
 */

import type {
	TemperatureProgress,
	TemperatureResult,
	TemperatureStart,
} from '../core/index';
import type { LayerStore } from './layers';

/**
 * How long the statistics wait after the last change before they are asked
 * for, in milliseconds. With the time the worker takes this keeps the
 * readout within about a quarter of a second of an edit.
 */
export const STATS_DEBOUNCE_MS = 150;

/**
 * How long the temperature waits after the last change before it is asked
 * for, in milliseconds.
 *
 * @remarks
 * Longer than the statistics' wait, because asking again costs more: a
 * solve takes from a fraction of a second to several seconds, and a
 * request that overtakes one still running ends that worker and starts
 * another, which builds its grid afresh. A slider being dragged sends a
 * change every frame and pauses for a moment now and then; this is long
 * enough that most such pauses send nothing, and short against the solve
 * that follows, so the wait adds little to the time a result takes.
 */
export const TEMPERATURE_DEBOUNCE_MS = 400;

/**
 * How a latest-wins request ended, short of failing: with its result, or
 * superseded by a newer request before it was answered.
 */
export type LatestOutcome<T> =
	| {
			readonly superseded: false;
			/** What the worker computed. */
			readonly result: T;
	  }
	| { readonly superseded: true };

/** What a refresh scheduler asks for, when, and whom it tells. */
export type RefreshOptions<T, H> = {
	/**
	 * Asks for the result as things stand at the moment it is called, as a
	 * worker service's latest-wins request does: an answer overtaken by a
	 * newer request comes back marked as superseded.
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
	 * Cancels a request that is waiting to be made, if there is one, so that
	 * none is made until the next `refresh`. A request already made is left
	 * to finish, and its answer is reported as usual.
	 */
	cancel(): void;
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
		cancel,
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

/** What a temperature scheduler asks for, when, and where it keeps it. */
export type TemperatureSchedulerOptions<H> = {
	/**
	 * Asks for the temperature of the world as it is at the moment it is
	 * called, as a worker service's latest-wins request does.
	 *
	 * @param start - Where the solve starts from: the last result to be
	 * completed, its months and state, or nothing if there is none.
	 * @param onProgress - To be told how far the solve has come.
	 */
	readonly request: (
		start: TemperatureStart | undefined,
		onProgress: (progress: TemperatureProgress) => void,
	) => Promise<LatestOutcome<TemperatureResult>>;
	/** Where the result, its status and the progress are kept. */
	readonly store: LayerStore;
	/** How long to wait after the last change, in milliseconds. */
	readonly debounceMs: number;
	/** Starts a timer, as `setTimeout` does, and returns its handle. */
	readonly setTimer: (callback: () => void, delayMs: number) => H;
	/** Cancels a timer by its handle, as `clearTimeout` does. */
	readonly clearTimer: (handle: H) => void;
	/** Whether a brush stroke is under way; see {@link RefreshOptions}. */
	readonly isBusy?: () => boolean;
	/** Called with what went wrong when a request fails. */
	readonly onError: (error: unknown) => void;
};

/** Keeps the temperature up to date with the world while it is showing. */
export type TemperatureScheduler = {
	/**
	 * Says that the world has changed. The result on hand is out of date
	 * from now on. While the temperature is showing, it is asked for again
	 * once no further change has come for the debounce time, and later if a
	 * stroke is under way then; while it is not, nothing is asked for.
	 */
	refresh(): void;
	/**
	 * Says that the world has been replaced by another. The result on hand
	 * describes a world that is gone and is dropped, as is the answer to any
	 * request already made; the store is left `empty` until the next
	 * request is made. The next request starts from nothing.
	 */
	reset(): void;
	/**
	 * Says whether the temperature is showing. Switched on, it is asked for
	 * if the result on hand is out of date or there is none, after the
	 * debounce time as for a change; switched off, a request waiting to be
	 * made is cancelled. Saying what is already so does nothing.
	 */
	setShowing(showing: boolean): void;
	/**
	 * Says that no request can be answered from now on, as when the worker
	 * is gone: the store is marked unavailable, and nothing is asked for
	 * again.
	 */
	markUnavailable(): void;
};

/**
 * Asks for the temperature again after changes, while it is showing, and
 * keeps what comes back in the store.
 *
 * @remarks
 * The waiting, the putting off during a stroke, the dropping of answers
 * that a newer request has overtaken, and the dropping of answers to
 * requests made before `reset` are those of
 * {@link createRefreshScheduler}, which this is built on.
 *
 * A change made while the temperature is not showing asks for nothing: a
 * solve can take seconds, and nobody is looking. The result on hand is
 * marked out of date instead, and the temperature is asked for once when
 * it is switched on again. Switching it off while a solve is under way
 * leaves that solve to finish, since its work is already paid for: its
 * result is kept, as current if nothing has changed since it was asked
 * for and as out of date if something has.
 *
 * Each request starts from the last result to be completed, its months
 * and state whole, so that a solve after a small edit settles in fewer
 * years. That result stays on hand, in the store, until a newer one is
 * completed: a request that is overtaken or fails costs nothing of it.
 * After `reset` there is none, so the first solve of a new world starts
 * from nothing.
 *
 * In the store, the status becomes `calculating` when a request is made
 * and the progress follows the solve of the newest request. Progress from
 * a request that a newer one has overtaken is not kept, and nor is any
 * that comes while the status is not `calculating`, as after `reset`
 * until the next request is made.
 *
 * @param options - The request, the store, the wait and the timers.
 * @returns The scheduler, with the temperature not showing.
 */
export const createTemperatureScheduler = <H>(
	options: TemperatureSchedulerOptions<H>,
): TemperatureScheduler => {
	const { store } = options;
	let showing = false;
	/**
	 * Whether the world has changed since the last request was made, or
	 * there has been none, so that the result on hand, or the one on its
	 * way, does not take the change in.
	 */
	let stale = true;
	/** Counts requests: only the newest request's progress is kept. */
	let asked = 0;

	const scheduler = createRefreshScheduler<TemperatureResult, H>({
		request: () => {
			stale = false;
			const mine = ++asked;
			store.markCalculating();
			const previous = store.temperature.result;
			return options.request(
				previous === null
					? undefined
					: { months: previous.months, state: previous.state },
				(progress) => {
					if (mine === asked) {
						store.setProgress(progress);
					}
				},
			);
		},
		debounceMs: options.debounceMs,
		setTimer: options.setTimer,
		clearTimer: options.clearTimer,
		isBusy: options.isBusy,
		onResult: (result) => store.setResult(result, !stale),
		onError: (error) => {
			// Asked for again at the next change, or when it is switched on.
			stale = true;
			store.markFailed();
			options.onError(error);
		},
		onUnavailable: store.markUnavailable,
	});

	return {
		refresh: () => {
			stale = true;
			store.markOutOfDate();
			if (showing) {
				scheduler.refresh();
			}
		},
		reset: () => {
			stale = true;
			store.clear();
			scheduler.reset();
		},
		setShowing: (next) => {
			if (next === showing) {
				return;
			}
			showing = next;
			if (!showing) {
				scheduler.cancel();
			} else if (stale) {
				scheduler.refresh();
			}
		},
		markUnavailable: scheduler.markUnavailable,
	};
};
