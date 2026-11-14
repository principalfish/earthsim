/**
 * Deciding when to ask the simulation worker for something again: a short
 * while after the last change, however many changes came together.
 *
 * The refresh scheduler does that for any result. The temperature
 * scheduler is built on it: it asks only while the temperature is showing,
 * starts each request from the last completed result, and keeps the
 * result, where it stands against the world and the progress of the
 * calculation under way in the page's layer store. The winds scheduler is
 * built on it too: it asks only while the winds are showing, as soon as
 * each new temperature result arrives and after a change of the day
 * length, and keeps the winds beside the temperature in the store.
 */

import type {
	TemperatureProgress,
	TemperatureResult,
	TemperatureStart,
	WindResult,
	World,
} from '../core/index';
import type { LayerStore, SolvedWinds } from './layers';

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
	/**
	 * Whether a request waits for the one under way to be answered rather
	 * than being made beside it. When true, a wait that ends while a
	 * request is under way makes no request then: the answer of the one
	 * under way is dropped when it arrives, and the request is made then,
	 * as a wait ending then would make it. False when left out.
	 */
	readonly oneAtATime?: boolean;
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
	 * Says that what the result is computed from has changed, and asks at
	 * once rather than after the debounce time: a wait under way is
	 * cancelled. If `isBusy` says a change is under way, it waits as
	 * `refresh` does instead, and with `oneAtATime` a request under way is
	 * answered first. Once marked unavailable, it does what `refresh` does
	 * then.
	 */
	refreshNow(): void;
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
	 * none is made until the next `refresh`, whether it waits for the
	 * debounce time or for the answer to the one under way. A request
	 * already made is left to finish, and its answer is reported as usual.
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
 * Without `oneAtATime`, a request already under way is not waited for: the
 * next is made on time and the earlier one comes back superseded, which is
 * not an error and is reported to nobody. A result is therefore never
 * replaced by an older one.
 *
 * With `oneAtATime`, at most one request is under way. A wait that ends, or
 * a `refreshNow`, while one is under way makes no request then, and the
 * request under way is overtaken: its answer, a result or an error, is
 * reported to nobody when it arrives. The request held back is then made
 * as if the wait had ended at that moment: `isBusy` is asked first, so
 * nothing is asked partway through a change, and the request describes
 * things as they are then, all of it read at once by `request`. A
 * `refresh` meanwhile starts the wait again, so the request is made when
 * both the wait and the answer are over, and its answer is then reported
 * as usual; `cancel` drops the request held back. So a worker is never
 * asked for more than one computation at a time, nor for one already
 * overtaken.
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
	/** With `oneAtATime`, whether a request is under way. */
	let underWay = false;
	/**
	 * With `oneAtATime`, whether a request is to be made once the one under
	 * way is answered.
	 */
	let held = false;

	// As an async function, so that a request that throws instead of
	// returning a promise is reported like one that rejects.
	const ask = async (): Promise<LatestOutcome<T>> => options.request();

	/**
	 * The request under way has been answered and reported: the one held
	 * back, if any, is made now, as a wait ending now would make it.
	 */
	const answered = (): void => {
		underWay = false;
		if (held) {
			held = false;
			fire();
		}
	};

	const send = (): void => {
		const asked = generation;
		const wanted = (): boolean => !disposed && asked === generation;
		underWay = options.oneAtATime === true;
		ask().then(
			(outcome) => {
				try {
					// An answer arriving with a newer request held back for it
					// has been overtaken, as a superseded one has.
					if (wanted() && !unavailable && !held && !outcome.superseded) {
						options.onResult(outcome.result);
					}
				} finally {
					answered();
				}
			},
			(error: unknown) => {
				try {
					if (wanted() && !held) {
						options.onError(error);
					}
				} finally {
					answered();
				}
			},
		);
	};

	const cancel = (): void => {
		held = false;
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
		if (disposed || unavailable) {
			return;
		}
		if (options.isBusy?.() === true) {
			arm();
			return;
		}
		if (underWay) {
			held = true;
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
		refreshNow: () => {
			if (disposed) {
				return;
			}
			if (unavailable) {
				options.onUnavailable();
				return;
			}
			cancel();
			fire();
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
	 * @param start - Where the solve starts from: the state of the last
	 * result to be completed and the sea level and planet it was solved for,
	 * without its months, or nothing if there is none.
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
 * Each request starts from the last result to be completed, so that a
 * solve after a small edit settles in fewer years: its state and its
 * record of the sea level and planet it was solved for are handed on, and
 * its months are not, since a start has no use for them and they are the
 * bulk of a result (about 19 MB on a world of 256 cells per face edge),
 * which a request would copy to the worker. The solver itself sets the
 * start aside after a change of sea level or planet, or once the terrain
 * has drifted far enough. That result stays on hand, in the store, until a
 * newer one is completed: a request that is overtaken or fails costs
 * nothing of it. After `reset` there is none, so the first solve of a new
 * world starts from nothing.
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
			const start: TemperatureStart | undefined =
				previous === null
					? undefined
					: { state: previous.state, solvedFor: previous.solvedFor };
			return options.request(start, (progress) => {
				if (mine === asked) {
					store.setProgress(progress);
				}
			});
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

/** What a winds scheduler asks for, when, and where it keeps it. */
export type WindsSchedulerOptions<H> = {
	/**
	 * Asks for the winds of a world from a temperature result's months, as
	 * a worker service's latest-wins request does. It must copy what it
	 * sends before it returns, as posting to a worker does, so that the
	 * world solved is the world as it was when asked.
	 *
	 * @param world - The world as it is at the moment of asking.
	 * @param temperature - The current temperature result, whose months the
	 * winds are worked out from.
	 */
	readonly request: (
		world: World,
		temperature: TemperatureResult,
	) => Promise<LatestOutcome<WindResult>>;
	/** The world being edited, at the time it is asked. */
	readonly currentWorld: () => World;
	/**
	 * Where the temperature is read from and the winds, their status
	 * included, are kept.
	 */
	readonly store: LayerStore;
	/**
	 * How long to wait after a change of the day length, in milliseconds.
	 * A new temperature result is not waited after.
	 */
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

/**
 * Keeps the winds up to date with the temperature and the day length while
 * they are showing.
 */
export type WindsScheduler = {
	/**
	 * Says that the day length has changed. The winds on hand are out of
	 * date from now on. While they are showing, they are asked for again
	 * once no further change has come for the debounce time, if the
	 * temperature is current then; while they are not, nothing is asked for.
	 */
	refresh(): void;
	/**
	 * Says that the world has been replaced by another. The store's winds
	 * describe a world that is gone and are dropped, as is the answer to any
	 * winds request already made; the temperature is left to its own
	 * scheduler.
	 */
	reset(): void;
	/**
	 * Says whether the winds are showing. Switched on, they are asked for if
	 * there are none for the current temperature and day length, on hand or
	 * on their way, after the debounce time as for a change, or when the
	 * temperature they need arrives; winds on hand that are marked out of
	 * date but were worked out from the current temperature and day length,
	 * as after a change since undone, are marked current instead. Switched
	 * off, a request waiting to be made is cancelled. Saying what is already
	 * so does nothing.
	 *
	 * @remarks
	 * The winds are worked out from the temperature, which this does not
	 * ask for: whoever switches the winds on also says that the temperature
	 * is needed.
	 */
	setShowing(showing: boolean): void;
	/**
	 * Says that no request can be answered from now on, as when the worker
	 * is gone: the store marks the winds unavailable, and nothing is asked
	 * for again.
	 */
	markUnavailable(): void;
};

/** Nothing was asked: an outcome that is reported to nobody. */
const NOTHING_ASKED = { superseded: true } as const;

/**
 * Asks for the winds whenever what they are worked out from changes, while
 * they are showing, and keeps what comes back in the store.
 *
 * @remarks
 * The winds are worked out from the current temperature result and the
 * world as it is when asked, its day length among the rest. They are
 * asked for as soon as a new temperature result arrives in the store as
 * current, with no wait: the temperature has already waited for the
 * changes to stop. A change of the day length, which the temperature does
 * not depend on, asks after the debounce time instead, as a change does
 * for the temperature. Nothing is asked for while the temperature on hand
 * is not current, as after an edit until its next result: that result asks
 * when it comes.
 *
 * Each result is kept with the temperature result and the day length it
 * was worked out from ({@link SolvedWinds}). It is kept as current only if,
 * when it arrives, that temperature result is still the store's and still
 * current and the world's day length is still that one; otherwise it is
 * kept as out of date. So an answer for an older temperature or an older
 * day length is never shown as current. When the temperature goes out of
 * date, so do the winds, which the store sees to.
 *
 * One request is under way at a time (`oneAtATime` of
 * {@link createRefreshScheduler}), since a wind solve is left to finish
 * once asked. A new temperature or a change of the day length that comes
 * while one is under way is asked for once its answer has arrived, and
 * that answer, overtaken, is reported to nobody. Then the world, the
 * temperature and the day length are read together, at the moment the
 * request is sent, and the answer is kept with what was read then.
 * Nothing is asked then during a stroke, without a current temperature or
 * once the winds are switched off. Nor is anything asked when the winds on
 * hand are current again, as after a change of the day length undone
 * within the wait: they are marked current instead. A change made while
 * the winds are not showing asks for nothing, and switching them off
 * leaves a request already made to finish, its result kept and judged as
 * any other.
 *
 * @param options - The request, the world, the store, the wait and the
 * timers.
 * @returns The scheduler, with the winds not showing.
 */
export const createWindsScheduler = <H>(
	options: WindsSchedulerOptions<H>,
): WindsScheduler => {
	const { store } = options;
	let showing = false;
	/**
	 * What the newest request made was for, or null if there has been none
	 * since the last failure or replacement of the world.
	 */
	let askedFor: Omit<SolvedWinds, 'winds'> | null = null;
	/** The newest temperature result seen in the store as current. */
	let seen: TemperatureResult | null = null;
	/**
	 * Whether the answer to the last request sent is still to come, whether
	 * or not it will then be dropped.
	 */
	let awaiting = false;

	/** The store's temperature result, if it is current; otherwise null. */
	const currentTemperature = (): TemperatureResult | null =>
		store.currentTemperature;

	/** The world's day length, as it is now. */
	const dayLength = (): number => options.currentWorld().planet.dayLengthHours;

	/** Whether winds of that temperature and day length would be current. */
	const isCurrent = (made: Omit<SolvedWinds, 'winds'>): boolean =>
		made.temperature === currentTemperature() &&
		made.dayLengthHours === dayLength();

	const scheduler = createRefreshScheduler<SolvedWinds, H>({
		// The world, the temperature and the day length are read here, at the
		// moment the request is sent and the world copied for the worker, so
		// the answer is kept with what it was worked out from.
		request: () => {
			const temperature = currentTemperature();
			if (temperature === null) {
				// The winds need a current temperature, and its next result
				// asks for them when it arrives. Winds left calculating by a
				// request whose answer was dropped for this one are not.
				if (store.winds.status === 'calculating') {
					store.markWindsFailed();
				}
				return Promise.resolve(NOTHING_ASKED);
			}
			const held = store.winds.result;
			if (held !== null && isCurrent(held)) {
				// Marked out of date by a change since undone: current again,
				// with no solve needed.
				store.setWindsResult(held, true);
				return Promise.resolve(NOTHING_ASKED);
			}
			const world = options.currentWorld();
			const made = { temperature, dayLengthHours: world.planet.dayLengthHours };
			askedFor = made;
			store.markWindsCalculating();
			awaiting = true;
			return options
				.request(world, temperature)
				.then((outcome) =>
					outcome.superseded
						? outcome
						: { superseded: false, result: { ...made, winds: outcome.result } },
				)
				.finally(() => {
					awaiting = false;
				});
		},
		debounceMs: options.debounceMs,
		setTimer: options.setTimer,
		clearTimer: options.clearTimer,
		isBusy: options.isBusy,
		oneAtATime: true,
		onResult: (result) => store.setWindsResult(result, isCurrent(result)),
		onError: (error) => {
			// Asked for again at the next change, or when switched on.
			askedFor = null;
			store.markWindsFailed();
			options.onError(error);
		},
		onUnavailable: store.markWindsUnavailable,
	});

	store.addListener(() => {
		const temperature = currentTemperature();
		if (temperature === null || temperature === seen) {
			return;
		}
		seen = temperature;
		if (showing) {
			scheduler.refreshNow();
		}
	});

	return {
		refresh: () => {
			store.markWindsOutOfDate();
			if (showing) {
				scheduler.refresh();
			}
		},
		reset: () => {
			askedFor = null;
			// Whatever temperature is on hand is the old world's until its own
			// scheduler drops it, and is not a new result to ask winds for.
			seen = currentTemperature();
			store.clearWinds();
			scheduler.reset();
		},
		setShowing: (next) => {
			if (next === showing) {
				return;
			}
			showing = next;
			if (!showing) {
				scheduler.cancel();
				return;
			}
			const { status, result } = store.winds;
			if (status === 'calculating' && awaiting) {
				if (askedFor === null || !isCurrent(askedFor)) {
					scheduler.refresh();
				}
				// Otherwise the answer on its way is for things as they are.
				return;
			}
			if (result !== null && isCurrent(result)) {
				// The winds on hand were marked out of date by a change since
				// undone, such as a day length changed and changed back: they
				// are current again, and need no solve.
				store.setWindsResult(result, true);
				return;
			}
			scheduler.refresh();
		},
		markUnavailable: scheduler.markUnavailable,
	};
};
