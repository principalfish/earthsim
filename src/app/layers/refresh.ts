/**
 * Deciding when to ask the simulation worker for something again: a short
 * while after the last change, however many changes came together.
 *
 * The refresh scheduler does that for any result. The climate scheduler is
 * built on it: it asks after every change of the world while it is
 * running, as it is unless paused, for the temperature and the winds solved
 * together in a loop of passes, starts each request from the last climate
 * that settled, and keeps each pass as it finishes, the answer, where they
 * stand against the world and the progress of the pass under way in the
 * page's layer store. It asks with nothing on screen in mind: the climate
 * is worked out whatever the page shows.
 */

import type {
	ClimateProgress,
	ClimateStart,
	ClimateSummary,
	TemperatureProgress,
	World,
} from '../../core/index';
import type { LayerStore, SolvedWinds } from './layers';

/**
 * How long the statistics wait after the last change before they are asked
 * for, in milliseconds. With the time the worker takes this keeps the
 * readout within about a quarter of a second of an edit.
 */
export const STATS_DEBOUNCE_MS = 150;

/**
 * How long the climate waits after the last change before it is asked
 * for, in milliseconds.
 *
 * @remarks
 * Longer than the statistics' wait, because asking again costs more: a
 * pass takes from a fraction of a second to several seconds, and a
 * request that overtakes one still running ends that worker and starts
 * another, which builds its grid afresh. A slider being dragged sends a
 * change every frame and pauses for a moment now and then; this is long
 * enough that most such pauses send nothing, and short against the solve
 * that follows, so the wait adds little to the time a result takes.
 */
export const CLIMATE_DEBOUNCE_MS = 400;

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

/** Whom a climate request tells of its progress and of each pass. */
export type ClimateCallbacks = {
	/**
	 * Told how far the year's solve under way has come, with the pass of the
	 * loop it is in.
	 */
	readonly onProgress: (progress: TemperatureProgress, pass: number) => void;
	/** Told of each pass of the loop as it finishes, in order. */
	readonly onPass: (pass: ClimateProgress) => void;
};

/** What a climate scheduler asks for, when, and where it keeps it. */
export type ClimateSchedulerOptions<H> = {
	/**
	 * Asks for the climate of a world, as a worker service's latest-wins
	 * request does: an answer overtaken by a newer request, or ended by
	 * `cancel`, comes back marked as superseded. It must copy what it sends
	 * before it returns, as posting to a worker does, so that the world
	 * solved is the world as it was when asked.
	 *
	 * @param world - The world as it is at the moment of asking.
	 * @param start - Where the loop starts from (see
	 * {@link createClimateScheduler}), or nothing to start from nothing.
	 * @param callbacks - Whom to tell of the progress and of each pass.
	 * @returns What the climate came to, without its arrays, which are its
	 * last pass's.
	 */
	readonly request: (
		world: World,
		start: ClimateStart | undefined,
		callbacks: ClimateCallbacks,
	) => Promise<LatestOutcome<ClimateSummary>>;
	/**
	 * Ends the computation of the request under way, if there is one, so
	 * that it is answered as superseded, as a worker service's `cancel`
	 * does.
	 */
	readonly cancel: () => void;
	/** The world being edited, at the time it is asked. */
	readonly currentWorld: () => World;
	/**
	 * Where the temperature and the winds, their statuses, the progress and
	 * the pass under way are kept.
	 */
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

/**
 * Keeps the climate, the temperature and the winds together, up to date
 * with the world while it is running.
 */
export type ClimateScheduler = {
	/**
	 * Says that the world has changed, its day length included. The results
	 * on hand are out of date from now on. While the scheduler is running,
	 * the climate is asked for again once no further change has come for the
	 * debounce time, and later if a stroke is under way then; while it is
	 * not, nothing is asked for.
	 */
	refresh(): void;
	/**
	 * Says that the world has changed, as `refresh` does, and asks at once
	 * rather than after the debounce time: for a change that is whole when
	 * it is made, as a new world is, with no run of changes to wait out. A
	 * wait under way is cancelled; if a stroke is under way, it waits as
	 * `refresh` does instead. While the scheduler is not running, nothing
	 * is asked for.
	 */
	refreshNow(): void;
	/**
	 * Says that the world has been replaced by another. The results on hand
	 * describe a world that is gone and are dropped, as are the passes and
	 * the answer of any request already made; the store is left `empty`
	 * until the next request is made, which starts from nothing. While the
	 * scheduler is not running, a request under way is ended at once.
	 */
	reset(): void;
	/**
	 * Says whether the scheduler is running, as it is from the start.
	 *
	 * Stopped, a request waiting to be made is cancelled, and none is made
	 * until it runs again. A climate under way is left to finish the pass
	 * under way, which is kept and shown as the others are, and is then
	 * ended, its results kept out of date; if that pass is its last, the
	 * climate's answer is kept as usual. Run again, the climate is asked for
	 * if the world has changed since the last request was made, if that
	 * request was ended or failed, or if there has been none: once, whatever
	 * the changes meanwhile, and at once, with no debounce time, unless a
	 * stroke is under way, which it waits for as a change does. A climate
	 * ended by pausing, with nothing changed since, is carried on from the
	 * pass it reached, its passes numbered on from that one, with as many
	 * passes again as a request may take. Run again before the pass under
	 * way has finished, the climate carries on, and is asked for again only
	 * if the world has changed meanwhile. Saying what is already so does
	 * nothing.
	 */
	setRunning(running: boolean): void;
	/**
	 * Says that no request can be answered from now on, as when the worker
	 * is gone: the store is marked unavailable, and nothing is asked for
	 * again.
	 */
	markUnavailable(): void;
};

/** Where a climate is carried on from: the pass it reached. */
const startFrom = (solved: SolvedWinds): ClimateStart => ({
	temperature: {
		months: solved.temperature.months,
		seaMonths: solved.temperature.seaMonths,
		state: solved.temperature.state,
		solvedFor: solved.temperature.solvedFor,
	},
	winds: { east: solved.winds.east, north: solved.winds.north },
	...(solved.currents === undefined
		? {}
		: {
				currents: {
					flows: solved.currents.flows,
					streamfunction: solved.currents.streamfunction,
				},
			}),
	dayLengthHours: solved.dayLengthHours,
});

/** A climate's answer: its last pass, and whether it settled. */
type ClimateAnswer = {
	readonly solved: SolvedWinds;
	readonly settled: boolean;
};

/**
 * Asks for the climate again after every change while running, and keeps
 * each pass and the answer in the store.
 *
 * @remarks
 * The waiting, the putting off during a stroke, the dropping of answers
 * that a newer request has overtaken, and the dropping of answers to
 * requests made before `reset` are those of
 * {@link createRefreshScheduler}, which this is built on. A request that
 * overtakes one under way does not wait for it: the worker service ends
 * that one, so an edit or a new world mid-loop starts the loop again.
 *
 * It runs from the start, so a change asks whatever is on screen. A change
 * made while it is not running asks for nothing: the results on hand are
 * marked out of date instead, or the store left empty after `reset`, and
 * the climate is asked for once when it runs again, with no wait: running
 * again is one change, not a run of them, taking in every change made
 * meanwhile. A change of the day length is a change like any other, since
 * the winds and so the temperature depend on it.
 *
 * In the store, both layers become `calculating` when a request is made.
 * Each pass of the newest request is kept there as it finishes, the
 * temperature and the winds together ({@link LayerStore.setPass}), so the
 * first pass shows the world at once and the later ones refine it, and
 * the progress follows the solve of the pass under way. Neither is
 * `current` until the answer arrives, which keeps the last pass as both
 * results, current if nothing has changed since the request was made and
 * out of date if something has. Passes and progress from a request that a
 * newer one has overtaken, or made before `reset`, are not kept.
 *
 * Each request starts from the last climate whose loop settled, its last
 * pass's temperature (months, state and record) and winds (eastward and
 * northward) and the day length, kept here rather than read from the
 * store, which also holds passes not settled. A loop that ended on its most
 * passes, unsettled, is shown but not carried on from, so a later request
 * starts from the settled climate before it, if any. The one other start is
 * the pass a climate stopped by pausing had reached: running again carries
 * on from there, since it is as good a start as a settled one, unless the
 * world has changed since that request was made. The climate carried on
 * goes on counting its passes from there, so its first is shown as the one
 * after the pass reached; the most passes a loop may take are counted by
 * the worker for each request, so a climate carried on after a pause may
 * take that many more. After `reset` there is neither start, so the first
 * climate of a new world starts from nothing. The solver itself sets a
 * start aside that does not suit the world.
 *
 * The worker cannot be interrupted partway through a pass, so pausing
 * waits for the pass under way, keeps it as the others are kept, and then
 * ends the request (`cancel`), marking both layers out of date, unless that
 * pass was the last, whose answer is kept as usual.
 *
 * A request that fails leaves both layers' results out of date, or empty
 * if there were none, and the next change or running again asks again.
 *
 * @param options - The request, the world, the store, the wait and the
 * timers.
 * @returns The scheduler, running.
 */
export const createClimateScheduler = <H>(
	options: ClimateSchedulerOptions<H>,
): ClimateScheduler => {
	const { store } = options;
	let running = true;
	/**
	 * Whether a climate is needed: the world has changed since the last
	 * request was made, that request was ended or failed, or there has been
	 * none, so that the results on hand, or those on their way, do not take
	 * the world in.
	 */
	let stale = true;
	/**
	 * The newest request, whose passes and progress are kept; null once a
	 * reset or a stop has set it aside.
	 */
	let wanted: object | null = null;
	/** The request whose answer is still to come, if any. */
	let underWay: object | null = null;
	/** Whether the request under way is to be ended after its pass under way. */
	let stopping = false;
	/** Where the last climate that settled ended, since the world was made. */
	let settled: ClimateStart | undefined;
	/**
	 * Where a climate ended by pausing had reached, for running again, and
	 * the number of the pass it reached, counted as shown.
	 */
	let reached: { readonly start: ClimateStart; readonly pass: number } | null =
		null;

	/**
	 * Ends the request under way once a pass has finished, keeping that pass
	 * out of date and where it reached, if nothing has changed since it was
	 * asked for.
	 *
	 * @param solved - The pass that finished, with the temperature and winds
	 * it gave.
	 * @param pass - The pass that finished, counted as shown.
	 */
	const stop = (solved: SolvedWinds, pass: number): void => {
		stopping = false;
		wanted = null;
		reached = stale ? null : { start: startFrom(solved), pass };
		stale = true;
		options.cancel();
		store.markClimateStopped();
	};

	const scheduler = createRefreshScheduler<ClimateAnswer, H>({
		request: async () => {
			stale = false;
			stopping = false;
			const mine = {};
			wanted = mine;
			underWay = mine;
			try {
				const world = options.currentWorld();
				const { dayLengthHours } = world.planet;
				const start = reached?.start ?? settled;
				// A climate carried on goes on counting its passes from the
				// one it reached; the worker counts each request's from 1.
				const before = reached?.pass ?? 0;
				reached = null;
				store.markClimateCalculating(before + 1);
				// In an object, since the passes come in callbacks.
				const kept: { last: SolvedWinds | null } = { last: null };
				const outcome = await options.request(world, start, {
					onProgress: (progress, pass) => {
						if (wanted === mine) {
							store.setProgress(progress, before + pass);
						}
					},
					onPass: (pass) => {
						const solved: SolvedWinds = {
							temperature: pass.temperature,
							winds: pass.winds,
							currents: pass.currents,
							dayLengthHours,
						};
						kept.last = solved;
						if (wanted !== mine) {
							return;
						}
						store.setPass(solved, before + pass.pass, pass.last);
						if (stopping && !pass.last) {
							stop(solved, before + pass.pass);
						}
					},
				});
				if (outcome.superseded) {
					return outcome;
				}
				if (kept.last === null) {
					throw new Error('The climate was answered without a single pass');
				}
				return {
					superseded: false,
					result: { solved: kept.last, settled: outcome.result.settled },
				};
			} finally {
				if (underWay === mine) {
					underWay = null;
					stopping = false;
				}
			}
		},
		debounceMs: options.debounceMs,
		setTimer: options.setTimer,
		clearTimer: options.clearTimer,
		isBusy: options.isBusy,
		onResult: ({ solved, settled: hasSettled }) => {
			store.setClimateResult(solved, !stale);
			if (hasSettled) {
				settled = startFrom(solved);
			}
		},
		onError: (error) => {
			// Asked for again at the next change, or when it runs again.
			stale = true;
			store.markClimateStopped();
			options.onError(error);
		},
		onUnavailable: store.markUnavailable,
	});

	/** Says the world has changed: what was reached is no start for it. */
	const changed = (): void => {
		stale = true;
		reached = null;
		store.markOutOfDate();
	};

	return {
		refresh: () => {
			changed();
			if (running) {
				scheduler.refresh();
			}
		},
		refreshNow: () => {
			changed();
			if (running) {
				scheduler.refreshNow();
			}
		},
		reset: () => {
			stale = true;
			reached = null;
			settled = undefined;
			wanted = null;
			stopping = false;
			if (!running && underWay !== null) {
				// Nothing of it is wanted, and nothing will overtake it until
				// the scheduler runs again.
				options.cancel();
			}
			store.clear();
			scheduler.reset();
		},
		setRunning: (next) => {
			if (next === running) {
				return;
			}
			running = next;
			if (!running) {
				scheduler.cancel();
				stopping = underWay !== null && underWay === wanted;
				return;
			}
			// Run again before the pass under way finished: the climate under
			// way carries on, unless something has changed since it was asked.
			stopping = false;
			if (stale) {
				scheduler.refreshNow();
			}
		},
		markUnavailable: scheduler.markUnavailable,
	};
};
