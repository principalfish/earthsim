/**
 * The services the page runs on simulation workers, the statistics, the
 * temperature and the winds, each on a worker of its own: starting a
 * worker and its client, keeping only the newest answer, starting the
 * worker afresh when a slow computation is overtaken in the services that
 * restart it, and what follows when a worker cannot be had.
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
} from '../core/index';
import {
	createSimClient,
	type RequestOptions,
	type SimClient,
	type WorkerLike,
} from '../worker/client';
import type { LayerStore } from './layers';
import {
	createRefreshScheduler,
	createTemperatureScheduler,
	createWindsScheduler,
	type LatestOutcome,
	type RefreshScheduler,
	STATS_DEBOUNCE_MS,
	TEMPERATURE_DEBOUNCE_MS,
	type TemperatureScheduler,
	type WindsScheduler,
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
	 * Whether a request that overtakes one still under way ends the worker
	 * computing that one and starts a fresh worker for itself, rather than
	 * waiting behind it. False when left out.
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
	 * @param options - Whom to tell of the progress.
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
 * time, as the statistics and the winds do through their schedulers
 * (`oneAtATime` of {@link createRefreshScheduler}). With
 * `restartWhenOvertaken`, a request that overtakes one still under way
 * first ends the worker, which drops the older request's answer for good,
 * and then starts a fresh one: the newest request never waits behind a
 * stale one. A worker that
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

	return {
		latest: (kind, payload, requestOptions) => {
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
			if (current === null) {
				return Promise.reject(new Error(NO_WORKER_MESSAGE));
			}
			const { client } = current;
			return new Promise((resolve, reject) => {
				const mine = { supersede: () => resolve({ superseded: true }) };
				running = mine;
				client.request(kind, payload, requestOptions).then(
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

/** What the page's temperature, or its winds, are made from. */
export type TemperatureServiceOptions<H> = Omit<
	StatisticsServiceOptions<H>,
	'readout'
> & {
	/** Where the result, its status and the progress are kept. */
	readonly store: LayerStore;
};

/**
 * Starts a simulation worker for the temperature and keeps the store up to
 * date with the world while the temperature is showing.
 *
 * @remarks
 * A solve takes seconds, so one that a newer request overtakes is not
 * waited for: its worker is ended and a fresh one started (see
 * {@link createWorkerService}). Whatever goes wrong with the worker costs
 * only the temperature: the store says it is unavailable, keeping what it
 * had, and nothing more is asked. A request that fails is recorded, and
 * the store keeps the last result, marked out of date.
 *
 * @param options - The worker, the world, the store and the timers.
 * @returns The scheduler, with the temperature not yet showing.
 */
export const createTemperatureService = <H>(
	options: TemperatureServiceOptions<H>,
): TemperatureScheduler => {
	const service = createWorkerService({
		createWorker: options.createWorker,
		createClient: options.createClient,
		restartWhenOvertaken: true,
		logError: options.logError,
	});
	const scheduler = createTemperatureScheduler<H>({
		request: (start, onProgress) =>
			service.latest(
				'temperature',
				{ world: options.currentWorld(), start },
				{ onProgress },
			),
		store: options.store,
		debounceMs: TEMPERATURE_DEBOUNCE_MS,
		setTimer: options.setTimer,
		clearTimer: options.clearTimer,
		isBusy: options.isStrokeActive,
		onError: options.logError,
	});
	service.onUnavailable(scheduler.markUnavailable);
	return scheduler;
};

/**
 * Starts a simulation worker for the winds and keeps the store's winds up
 * to date with its temperature and the world while the winds are showing.
 *
 * @remarks
 * Unlike the temperature's, a wind solve is never cut short: the worker is
 * kept, with the grid tables it has built, which a fresh worker would have
 * to build again and so make the next solve slower. The scheduler asks for
 * one solve at a time, and asks again once it is answered if things have
 * moved on meanwhile, the answer so overtaken kept by nobody (see
 * {@link createWindsScheduler}). Whatever goes wrong with the worker costs
 * only the winds: the store says they are unavailable, keeping what it
 * had, and nothing more is asked. A request that fails is recorded, and
 * the store keeps the last winds, marked out of date, or stays empty if
 * there were none.
 *
 * The winds are asked for after a change of the day length with the
 * temperature's wait, {@link TEMPERATURE_DEBOUNCE_MS}; see
 * {@link createWindsScheduler} for the rest.
 *
 * @param options - The worker, the world, the store and the timers.
 * @returns The scheduler, with the winds not yet showing.
 */
export const createWindsService = <H>(
	options: TemperatureServiceOptions<H>,
): WindsScheduler => {
	const service = createWorkerService({
		createWorker: options.createWorker,
		createClient: options.createClient,
		logError: options.logError,
	});
	const scheduler = createWindsScheduler<H>({
		request: (world, temperature) =>
			service.latest('winds', { world, temperatures: temperature.months }),
		currentWorld: options.currentWorld,
		store: options.store,
		debounceMs: TEMPERATURE_DEBOUNCE_MS,
		setTimer: options.setTimer,
		clearTimer: options.clearTimer,
		isBusy: options.isStrokeActive,
		onError: options.logError,
	});
	service.onUnavailable(scheduler.markUnavailable);
	return scheduler;
};
