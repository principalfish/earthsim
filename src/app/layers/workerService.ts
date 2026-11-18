/**
 * The services the page runs on simulation workers, the statistics and the
 * climate, each on a worker of its own: starting a worker and its client,
 * keeping only the newest answer, starting the worker afresh when a slow
 * computation is overtaken or cancelled in the service that restarts it,
 * and what follows when a worker cannot be had.
 *
 * Nothing here starts a real worker or a real timer: each is handed in, so
 * that all of it can be run with stand-ins.
 */

import type {
	SimKind,
	SimPayload,
	SimResults,
	TerrainStats,
	World,
} from '../../core/index';
import {
	createSimClient,
	type RequestOptions,
	type SimClient,
	type WorkerLike,
} from '../../worker/client';
import type { LayerStore } from './layers';
import {
	CLIMATE_DEBOUNCE_MS,
	type ClimateScheduler,
	createClimateScheduler,
	createRefreshScheduler,
	type LatestOutcome,
	type RefreshScheduler,
	STATS_DEBOUNCE_MS,
} from './refresh';

/** The error a request to a service that has no worker rejects with. */
export const NO_WORKER_MESSAGE = 'There is no simulation worker to ask';

/** How a worker service is started. */
export type WorkerServiceOptions = {
	/**
	 * Starts a simulation worker. It may throw, or give null, when there
	 * cannot be one.
	 */
	readonly createWorker: () => WorkerLike | null;
	/**
	 * Opens the channel to a worker; it may throw. Left out, it is
	 * {@link createSimClient}.
	 */
	readonly createClient?: (worker: WorkerLike) => SimClient;
	/**
	 * Whether a request that overtakes one still under way, or a `cancel`
	 * of one, ends the worker computing it and starts a fresh worker, rather
	 * than leaving it to compute what nobody wants. False when left out.
	 */
	readonly restartWhenOvertaken?: boolean;
	/** Records why a worker could not be started. */
	readonly logError: (error: unknown) => void;
};

/** A computation the page asks of a simulation worker, newest first. */
export type WorkerService = {
	/**
	 * Asks for one computation, for a caller who only ever wants the answer
	 * to its newest question.
	 *
	 * @remarks
	 * Of several calls that overlap, only the newest gets a result. Each
	 * earlier one resolves, as soon as the next call is made, to an outcome
	 * marked as superseded, and whatever its worker later answers is
	 * dropped. Being superseded is an outcome and not a failure, so every
	 * call settles and none rejects on that account. A call made after the
	 * one before was answered supersedes nothing.
	 *
	 * @param kind - What to compute.
	 * @param payload - What the request carries.
	 * @param options - Whom to tell of the progress and of each pass of a
	 * climate, while the call is the newest.
	 * @returns The result, or that the call was superseded. Rejects as
	 * {@link SimClient.request} does, and with {@link NO_WORKER_MESSAGE} once
	 * the service is unavailable, without asking any worker.
	 */
	latest<K extends SimKind>(
		kind: K,
		payload: SimPayload<K>,
		options?: RequestOptions,
	): Promise<LatestOutcome<SimResults[K]>>;
	/**
	 * Ends the newest call, if it is still to be answered, as a newer call
	 * would: it resolves at once to an outcome marked as superseded, and
	 * whatever its worker later tells of it is dropped. With
	 * `restartWhenOvertaken` the worker computing it is ended and a fresh
	 * one started, so that the computation stops; if none can be started
	 * the service becomes unavailable. With no call to be answered it does
	 * nothing.
	 */
	cancel(): void;
	/**
	 * Has a listener called once, when the service becomes unavailable, or
	 * at once if it already is.
	 */
	onUnavailable(listener: () => void): void;
};

/** A worker that has been started, and the channel to it. */
type Started = {
	readonly worker: WorkerLike;
	readonly client: SimClient;
	readonly onError: () => void;
};

/**
 * Starts a service on a simulation worker of its own.
 *
 * @remarks
 * The service is unavailable, for good, when its worker cannot be started
 * (`createWorker` throws or gives null), when the channel to it cannot be
 * opened (`createClient` throws), and when the worker reports an `error`
 * event. The worker answers every message it is sent, failures included,
 * so that event means its script could not be loaded or has stopped: it
 * says so once, perhaps before anything has been asked of it, and then
 * never answers. Once unavailable the service asks no worker anything
 * again, and its listeners are told, once.
 *
 * Without `restartWhenOvertaken`, a request that is overtaken still runs
 * to the end on the worker, which answers the newer one after it. Every
 * call is posted, and so copied for the worker, when it is made; a caller
 * that wants no requests queued behind a computation makes one call at a
 * time, as the statistics do through their scheduler
 * (`oneAtATime` of {@link createRefreshScheduler}). With
 * `restartWhenOvertaken`, a request that overtakes one still under way
 * first ends the worker, which drops the older request's answer for good,
 * and then starts a fresh one: the newest request never waits behind a
 * stale one; `cancel` ends the worker in the same way. A worker that
 * answered everything it was asked is kept. If the fresh worker cannot be
 * started, the service becomes unavailable, and the request rejects.
 *
 * @param options - How to start a worker and its client, and whether to
 * start afresh when overtaken.
 * @returns The service.
 */
export const createWorkerService = (
	options: WorkerServiceOptions,
): WorkerService => {
	const { logError, restartWhenOvertaken = false } = options;
	const createClient = options.createClient ?? createSimClient;
	const listeners: (() => void)[] = [];
	let told = false;
	/** The newest call, while it is still to be settled. */
	let running: { supersede(): void } | null = null;

	const stop = (started: Started): void => {
		started.worker.removeEventListener('error', started.onError);
		started.client.dispose();
	};

	const becomeUnavailable = (): void => {
		if (current !== null) {
			stop(current);
			current = null;
		}
		if (!told) {
			told = true;
			for (const listener of [...listeners]) {
				listener();
			}
		}
	};

	const start = (): Started | null => {
		let worker: WorkerLike | null;
		try {
			worker = options.createWorker();
		} catch (error) {
			logError(error);
			return null;
		}
		if (worker === null) {
			return null;
		}
		try {
			const client = createClient(worker);
			const onError = (): void => becomeUnavailable();
			worker.addEventListener('error', onError);
			return { worker, client, onError };
		} catch (error) {
			logError(error);
			worker.terminate?.();
			return null;
		}
	};

	let current: Started | null = start();

	/**
	 * Supersedes the newest call, if it is still to be answered, and ends
	 * its worker for a fresh one in the services that restart it.
	 */
	const overtake = (): void => {
		const overtaken = running;
		running = null;
		overtaken?.supersede();
		if (overtaken !== null && restartWhenOvertaken && current !== null) {
			stop(current);
			current = start();
			if (current === null) {
				becomeUnavailable();
			}
		}
	};

	return {
		latest: (kind, payload, requestOptions) => {
			overtake();
			if (current === null) {
				return Promise.reject(new Error(NO_WORKER_MESSAGE));
			}
			const { client } = current;
			return new Promise((resolve, reject) => {
				const mine = { supersede: () => resolve({ superseded: true }) };
				running = mine;
				// What a call that is no longer the newest hears of its computation
				// is dropped, as its result is.
				const whileNewest = <A extends unknown[]>(
					tell: ((...args: A) => void) | undefined,
				): ((...args: A) => void) | undefined =>
					tell === undefined
						? undefined
						: (...args) => {
								if (running === mine) {
									tell(...args);
								}
							};
				client
					.request(kind, payload, {
						...requestOptions,
						onProgress: whileNewest(requestOptions?.onProgress),
						onPass: whileNewest(requestOptions?.onPass),
					})
					.then(
						(result) => {
							if (running === mine) {
								running = null;
								resolve({ superseded: false, result });
							}
						},
						(error: unknown) => {
							if (running === mine) {
								running = null;
								reject(error);
							}
						},
					);
			});
		},
		cancel: overtake,
		onUnavailable: (listener) => {
			if (current === null) {
				listener();
				return;
			}
			listeners.push(listener);
		},
	};
};

/** The readout the statistics are shown in. */
export type StatisticsReadout = {
	/** Shows the statistics. */
	show(stats: TerrainStats): void;
	/** Says that the statistics on show are no longer those of the world. */
	showPending(): void;
	/** Says that there are no statistics to show. */
	showUnavailable(): void;
};

/** What the page's statistics are made from. */
export type StatisticsServiceOptions<H> = {
	/** Starts a simulation worker; may throw or give null. */
	readonly createWorker: () => WorkerLike | null;
	/** Opens the channel to a worker. Left out, {@link createSimClient}. */
	readonly createClient?: (worker: WorkerLike) => SimClient;
	/** The world to compute for, at the time it is asked. */
	readonly currentWorld: () => World;
	/** Whether a brush stroke is under way. */
	readonly isStrokeActive: () => boolean;
	/** Where the statistics are shown. */
	readonly readout: StatisticsReadout;
	/** Starts a timer, as `setTimeout` does. */
	readonly setTimer: (callback: () => void, delayMs: number) => H;
	/** Cancels a timer, as `clearTimeout` does. */
	readonly clearTimer: (handle: H) => void;
	/** Records what went wrong. */
	readonly logError: (error: unknown) => void;
};

/**
 * Starts a simulation worker for the terrain statistics and has the readout
 * follow them.
 *
 * @remarks
 * Whatever goes wrong with the worker costs only the statistics: the
 * readout says there are none, and from then on goes on saying so, and
 * nothing more is asked. A request that fails is recorded and the readout
 * says there are none until the next change asks again.
 *
 * One request is asked at a time: a change made while one is being
 * answered is asked for once that answer arrives, with the world as it is
 * then, and that answer, overtaken, is shown to nobody (see
 * {@link createRefreshScheduler}).
 *
 * @param options - The worker, the world, the readout and the timers.
 * @returns What to tell whenever the terrain or the sea level has changed,
 * and whenever the world has been replaced.
 */
export const createStatisticsService = <H>(
	options: StatisticsServiceOptions<H>,
): RefreshScheduler => {
	const { readout, logError } = options;
	const service = createWorkerService({
		createWorker: options.createWorker,
		createClient: options.createClient,
		logError,
	});
	const scheduler = createRefreshScheduler<TerrainStats, H>({
		request: () =>
			service.latest('terrainStats', { world: options.currentWorld() }),
		oneAtATime: true,
		debounceMs: STATS_DEBOUNCE_MS,
		setTimer: options.setTimer,
		clearTimer: options.clearTimer,
		isBusy: options.isStrokeActive,
		onResult: readout.show,
		onError: (error) => {
			logError(error);
			readout.showUnavailable();
		},
		onPending: readout.showPending,
		onUnavailable: readout.showUnavailable,
	});
	service.onUnavailable(scheduler.markUnavailable);
	return scheduler;
};

/** What the page's climate is made from. */
export type ClimateServiceOptions<H> = Omit<
	StatisticsServiceOptions<H>,
	'readout'
> & {
	/**
	 * Where the temperature and the winds, their statuses, the progress and
	 * the pass under way are kept.
	 */
	readonly store: LayerStore;
};

/**
 * Starts a simulation worker for the climate, the temperature and the
 * winds solved together, and keeps the store up to date with the world
 * while the scheduler is running, as it is unless paused.
 *
 * @remarks
 * A climate takes seconds, so one that a newer request overtakes is not
 * waited for: its worker is ended and a fresh one started (see
 * {@link createWorkerService}), and so is one that pausing ends once its
 * pass under way has finished. Whatever goes wrong with the worker costs
 * only the climate: the store says both layers are unavailable, keeping
 * what it had, and nothing more is asked. A request that fails is
 * recorded, and the store keeps the last results, marked out of date.
 *
 * The climate is asked for after a change with the wait
 * {@link CLIMATE_DEBOUNCE_MS}; see {@link createClimateScheduler} for the
 * rest.
 *
 * @param options - The worker, the world, the store and the timers.
 * @returns The scheduler, running.
 */
export const createClimateService = <H>(
	options: ClimateServiceOptions<H>,
): ClimateScheduler => {
	const service = createWorkerService({
		createWorker: options.createWorker,
		createClient: options.createClient,
		restartWhenOvertaken: true,
		logError: options.logError,
	});
	const scheduler = createClimateScheduler<H>({
		request: (world, start, callbacks) =>
			service.latest('climate', { world, start }, callbacks),
		cancel: service.cancel,
		currentWorld: options.currentWorld,
		store: options.store,
		debounceMs: CLIMATE_DEBOUNCE_MS,
		setTimer: options.setTimer,
		clearTimer: options.clearTimer,
		isBusy: options.isStrokeActive,
		onError: options.logError,
	});
	service.onUnavailable(scheduler.markUnavailable);
	return scheduler;
};
