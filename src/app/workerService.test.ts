import { describe, expect, it } from 'vitest';
import {
	createBlankWorld,
	type SimRequest,
	simFailure,
	solveTemperature,
	solveWinds,
	type TemperatureResult,
	type TerrainStats,
	type World,
} from '../core/index';
import {
	progressMessageOf,
	temperatureOf,
} from '../core/testing/temperatureFixtures';
import { windResultOf } from '../core/testing/windFixtures';
import type { WorkerLike } from '../worker/client';
import {
	createFakeWorker,
	type FakeWorker,
} from '../worker/testing/fakeWorker';
import { createLayerStore } from './layers';
import { STATS_DEBOUNCE_MS, TEMPERATURE_DEBOUNCE_MS } from './refresh';
import { createFakeTimers } from './testing/fakeTimers';
import { settle } from './testing/settle';
import {
	createStatisticsService,
	createTemperatureService,
	createWindsService,
	createWorkerService,
	NO_WORKER_MESSAGE,
	type StatisticsReadout,
	type WorkerServiceOptions,
} from './workerService';

/** What a promise has come to, without waiting for it any longer than now. */
const stateOf = async (promise: Promise<unknown>): Promise<string> => {
	const pending = Symbol('pending');
	try {
		const value = await Promise.race([promise, Promise.resolve(pending)]);
		return value === pending ? 'pending' : 'resolved';
	} catch {
		return 'rejected';
	}
};

/** Starts fake workers on demand and keeps every one it started. */
type Workers = {
	readonly started: FakeWorker[];
	readonly create: () => WorkerLike | null;
	/** The worker started last. */
	last(): FakeWorker;
	/** Every request posted to any of them, in order. */
	posted(): SimRequest[];
	/** What the next calls of `create` do instead of starting a worker. */
	failNext: ('throw' | 'null')[];
};

const createWorkers = (): Workers => {
	const workers: Workers = {
		started: [],
		failNext: [],
		create: () => {
			const failure = workers.failNext.shift();
			if (failure === 'throw') {
				throw new Error('Workers are not allowed here');
			}
			if (failure === 'null') {
				return null;
			}
			const worker = createFakeWorker();
			workers.started.push(worker);
			return worker;
		},
		last: () => {
			const worker = workers.started.at(-1);
			if (worker === undefined) {
				throw new Error('No worker was started');
			}
			return worker;
		},
		posted: () => workers.started.flatMap((worker) => worker.posted),
	};
	return workers;
};

const statsOf = (landFraction: number): TerrainStats => ({
	landFraction,
	landAreaKm2: 0,
	seaAreaKm2: 0,
	highestM: 0,
	deepestM: 0,
	meanLandHeightM: 0,
	meanOceanDepthM: 0,
});

const statsAnswer = (id: number, landFraction: number) => ({
	id,
	kind: 'terrainStats',
	ok: true,
	result: statsOf(landFraction),
});

const temperatureAnswer = (id: number, yearsRun: number) => ({
	id,
	kind: 'temperature',
	ok: true,
	result: temperatureOf(yearsRun),
});

const blank = (): World => createBlankWorld(64);

/** A service on fake workers, with what it logged and whom it told. */
const createService = (
	options: Partial<WorkerServiceOptions> = {},
	workers = createWorkers(),
) => {
	const logged: unknown[] = [];
	let unavailable = 0;
	const service = createWorkerService({
		createWorker: workers.create,
		logError: (error) => logged.push(error),
		...options,
	});
	service.onUnavailable(() => unavailable++);
	return { service, workers, logged, unavailable: () => unavailable };
};

describe('createWorkerService with no worker', () => {
	it('is unavailable when the worker cannot be started, and asks nothing', async () => {
		const workers = createWorkers();
		workers.failNext.push('throw');
		const { service, logged, unavailable } = createService({}, workers);

		expect(unavailable()).toBe(1);
		expect(logged).toEqual([new Error('Workers are not allowed here')]);
		await expect(
			service.latest('terrainStats', { world: blank() }),
		).rejects.toThrow(NO_WORKER_MESSAGE);
		expect(workers.started).toHaveLength(0);

		// A listener added later is told at once.
		let late = 0;
		service.onUnavailable(() => late++);
		expect(late).toBe(1);
	});

	it('is unavailable when there is no worker to be had', async () => {
		const workers = createWorkers();
		workers.failNext.push('null');
		const { service, logged, unavailable } = createService({}, workers);

		expect(unavailable()).toBe(1);
		expect(logged).toEqual([]);
		await expect(
			service.latest('terrainStats', { world: blank() }),
		).rejects.toThrow(NO_WORKER_MESSAGE);
	});

	it('is unavailable when there is no client, ending the worker', async () => {
		const failure = new Error('no channel');
		const { service, workers, logged, unavailable } = createService({
			createClient: () => {
				throw failure;
			},
		});

		expect(unavailable()).toBe(1);
		expect(logged).toEqual([failure]);
		expect(workers.last().terminations).toBe(1);
		await expect(
			service.latest('terrainStats', { world: blank() }),
		).rejects.toThrow(NO_WORKER_MESSAGE);
		expect(workers.last().posted).toEqual([]);
	});
});

describe('createWorkerService after a worker error event', () => {
	it('rejects what was waiting, becomes unavailable once and never asks again', async () => {
		const { service, workers, unavailable } = createService();
		const worker = workers.last();
		const pending = service.latest('terrainStats', { world: blank() });
		expect(unavailable()).toBe(0);

		worker.emit('error', { message: 'Failed to load the script' });
		await expect(pending).rejects.toThrow('Failed to load the script');
		expect(unavailable()).toBe(1);
		expect(worker.terminations).toBe(1);
		expect(worker.listenerCount('error')).toBe(0);

		await expect(
			service.latest('terrainStats', { world: blank() }),
		).rejects.toThrow(NO_WORKER_MESSAGE);
		expect(worker.posted).toHaveLength(1);
		expect(workers.started).toHaveLength(1);
		worker.emit('error');
		expect(unavailable()).toBe(1);
	});

	it('becomes unavailable on an error before anything was asked', () => {
		const { workers, unavailable } = createService();
		workers.last().emit('error');
		expect(unavailable()).toBe(1);
	});
});

describe('createWorkerService latest', () => {
	it('posts the kind and payload, and resolves with the result', async () => {
		const { service, workers } = createService();
		const world = blank();
		const only = service.latest('terrainStats', { world });
		expect(workers.last().posted).toEqual([
			{ id: 1, kind: 'terrainStats', world },
		]);
		workers.last().respond(statsAnswer(1, 0.3));
		await expect(only).resolves.toEqual({
			superseded: false,
			result: statsOf(0.3),
		});
	});

	it('resolves only the newest of several overlapping calls', async () => {
		const { service, workers } = createService();
		const first = service.latest('terrainStats', { world: blank() });
		const second = service.latest('terrainStats', { world: blank() });
		const third = service.latest('terrainStats', { world: blank() });
		const worker = workers.last();
		expect(worker.posted.map((request) => request.id)).toEqual([1, 2, 3]);

		// The older two settle at once, before the worker has answered.
		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).resolves.toEqual({ superseded: true });
		expect(await stateOf(third)).toBe('pending');

		// Their answers, in any order, change nothing.
		worker.respond(statsAnswer(2, 0.2));
		worker.respond(statsAnswer(3, 0.3));
		worker.respond(statsAnswer(1, 0.1));
		await expect(third).resolves.toEqual({
			superseded: false,
			result: statsOf(0.3),
		});
	});

	it('does not supersede a call that was already answered', async () => {
		const { service, workers } = createService();
		const first = service.latest('terrainStats', { world: blank() });
		workers.last().respond(statsAnswer(1, 0.1));
		await settle();
		const second = service.latest('terrainStats', { world: blank() });
		workers.last().respond(statsAnswer(2, 0.2));
		await expect(first).resolves.toEqual({
			superseded: false,
			result: statsOf(0.1),
		});
		await expect(second).resolves.toEqual({
			superseded: false,
			result: statsOf(0.2),
		});
	});

	it('rejects when the worker answers the newest with a failure', async () => {
		const { service, workers } = createService();
		const first = service.latest('terrainStats', { world: blank() });
		const second = service.latest('terrainStats', { world: blank() });
		workers.last().respond(simFailure(2, 'terrainStats', 'no statistics'));
		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).rejects.toThrow(new Error('no statistics'));
	});

	it('supersedes the one before even when the new one cannot be posted', async () => {
		const { service, workers } = createService();
		const first = service.latest('terrainStats', { world: blank() });
		workers.last().postMessage = () => {
			throw new Error('could not be cloned');
		};
		const second = service.latest('terrainStats', { world: blank() });
		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).rejects.toThrow('could not be cloned');
	});

	it('passes progress on, for the call it belongs to, without settling it', async () => {
		const { service, workers } = createService();
		const heard: number[] = [];
		const call = service.latest(
			'temperature',
			{ world: blank() },
			{ onProgress: (progress) => heard.push(progress.yearsDone) },
		);
		workers.last().respond(progressMessageOf(1, 1));
		workers.last().respond(progressMessageOf(1, 2));
		expect(heard).toEqual([1, 2]);
		expect(await stateOf(call)).toBe('pending');
	});

	it('keeps its worker when overtaken, without restarting', async () => {
		const { service, workers } = createService();
		void service.latest('terrainStats', { world: blank() });
		void service.latest('terrainStats', { world: blank() });
		expect(workers.started).toHaveLength(1);
		expect(workers.last().terminations).toBe(0);
		expect(workers.last().posted).toHaveLength(2);
	});
});

describe('createWorkerService restarting when overtaken', () => {
	const restarting = () => createService({ restartWhenOvertaken: true });

	it('ends a worker still computing and asks a fresh one, once each', async () => {
		const { service, workers } = restarting();
		const first = service.latest('temperature', { world: blank() });
		const old = workers.last();
		const second = service.latest('temperature', { world: blank() });

		expect(old.terminations).toBe(1);
		expect(workers.started).toHaveLength(2);
		const fresh = workers.last();
		expect(fresh).not.toBe(old);
		expect(old.posted).toHaveLength(1);
		expect(fresh.posted).toHaveLength(1);
		await expect(first).resolves.toEqual({ superseded: true });

		// The old worker's late answer is never delivered: nobody listens.
		expect(old.listenerCount('message')).toBe(0);
		old.respond(temperatureAnswer(1, 7));
		fresh.respond(temperatureAnswer(fresh.posted[0]?.id ?? -1, 2));
		await expect(second).resolves.toEqual({
			superseded: false,
			result: temperatureOf(2),
		});
	});

	it('keeps a worker that answered everything it was asked', async () => {
		const { service, workers } = restarting();
		void service.latest('temperature', { world: blank() });
		workers.last().respond(temperatureAnswer(1, 1));
		await settle();
		void service.latest('temperature', { world: blank() });
		expect(workers.started).toHaveLength(1);
		expect(workers.last().terminations).toBe(0);
		expect(workers.last().posted).toHaveLength(2);
	});

	it('keeps a worker whose last request failed', async () => {
		const { service, workers } = restarting();
		const first = service.latest('temperature', { world: blank() });
		workers.last().respond(simFailure(1, 'temperature', 'no'));
		await expect(first).rejects.toThrow('no');
		void service.latest('temperature', { world: blank() });
		expect(workers.started).toHaveLength(1);
	});

	it('becomes unavailable when the fresh worker cannot be started', async () => {
		const { service, workers, unavailable } = restarting();
		const first = service.latest('temperature', { world: blank() });
		workers.failNext.push('null');
		const second = service.latest('temperature', { world: blank() });

		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).rejects.toThrow(NO_WORKER_MESSAGE);
		expect(unavailable()).toBe(1);
		expect(workers.started).toHaveLength(1);
		expect(workers.last().terminations).toBe(1);

		await expect(
			service.latest('temperature', { world: blank() }),
		).rejects.toThrow(NO_WORKER_MESSAGE);
		expect(workers.started).toHaveLength(1);
	});

	it('listens for errors on the fresh worker only', async () => {
		const { service, workers, unavailable } = restarting();
		void service.latest('temperature', { world: blank() });
		const old = workers.last();
		const second = service.latest('temperature', { world: blank() });
		expect(old.listenerCount('error')).toBe(0);
		workers.last().emit('error');
		expect(unavailable()).toBe(1);
		await expect(second).rejects.toThrow('reported an error');
	});
});

/** A readout that writes what it is told into a log. */
const createReadout = (log: string[]): StatisticsReadout => ({
	show: (stats) => log.push(`show ${stats.landFraction}`),
	showPending: () => log.push('showPending'),
	showUnavailable: () => log.push('showUnavailable'),
});

const createStatistics = (workers = createWorkers()) => {
	const timers = createFakeTimers();
	const log: string[] = [];
	const logged: unknown[] = [];
	let world = blank();
	let stroke = false;
	const scheduler = createStatisticsService({
		createWorker: workers.create,
		currentWorld: () => world,
		isStrokeActive: () => stroke,
		readout: createReadout(log),
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		logError: (error) => logged.push(error),
	});
	return {
		scheduler,
		workers,
		timers,
		log,
		logged,
		setWorld: (next: World) => {
			world = next;
		},
		setStroke: (active: boolean) => {
			stroke = active;
		},
	};
};

describe('createStatisticsService', () => {
	it('asks for the statistics of the world of the moment after the wait, and shows them', async () => {
		const stats = createStatistics();
		// Told apart from the world the service started on, and from the
		// world as it was when the change was told.
		const next = blank();
		next.seaLevel = -1500;
		stats.scheduler.refresh();
		stats.setWorld(next);
		stats.timers.advance(STATS_DEBOUNCE_MS - 1);
		expect(stats.workers.posted()).toHaveLength(0);
		stats.timers.advance(1);
		expect(stats.workers.posted()).toEqual([
			{ id: 1, kind: 'terrainStats', world: next },
		]);
		const [posted] = stats.workers.posted() as SimRequest<'terrainStats'>[];
		expect(posted?.world.seaLevel).toBe(-1500);
		stats.workers.last().respond(statsAnswer(1, 0.4));
		await settle();
		expect(stats.log).toEqual(['show 0.4']);
	});

	it('holds a request during a stroke', async () => {
		const stats = createStatistics();
		stats.setStroke(true);
		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS * 3);
		expect(stats.workers.posted()).toHaveLength(0);
		stats.setStroke(false);
		stats.timers.advance(STATS_DEBOUNCE_MS);
		expect(stats.workers.posted()).toHaveLength(1);
	});

	it('says the figures are pending when the world is replaced, and drops the old answer', async () => {
		const stats = createStatistics();
		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS);
		stats.scheduler.reset();
		stats.workers.last().respond(statsAnswer(1, 0.9));
		await settle();
		expect(stats.log).toEqual(['showPending']);
	});

	it('records a request that fails, says there are none, and asks again at the next change', async () => {
		const stats = createStatistics();
		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS);
		stats.workers.last().respond(simFailure(1, 'terrainStats', 'no'));
		await settle();
		expect(stats.log).toEqual(['showUnavailable']);
		expect(stats.logged).toEqual([new Error('no')]);

		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS);
		expect(stats.workers.posted()).toHaveLength(2);
	});

	it('asks one request at a time, without restarting its worker: a change meanwhile is asked for once the answer arrives, with the world then', async () => {
		const stats = createStatistics();
		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS);
		for (let change = 0; change < 3; change++) {
			stats.scheduler.refresh();
			stats.timers.advance(STATS_DEBOUNCE_MS);
		}
		await settle();
		expect(stats.workers.started).toHaveLength(1);
		expect(stats.workers.last().posted).toHaveLength(1);

		const later = blank();
		later.elevation[0] = 77;
		stats.setWorld(later);
		stats.workers.last().respond(statsAnswer(1, 0.1));
		await settle();
		const posted = stats.workers.last().posted as SimRequest<'terrainStats'>[];
		expect(posted).toHaveLength(2);
		expect(posted[1]?.world.elevation[0]).toBe(77);
		expect(stats.workers.last().terminations).toBe(0);
		// The answer the newer request overtook is not shown.
		expect(stats.log).toEqual([]);
		stats.workers.last().respond(statsAnswer(2, 0.2));
		await settle();
		expect(stats.log).toEqual(['show 0.2']);
	});

	it('posts no request held back whose turn comes during a stroke, and asks once after it', async () => {
		const stats = createStatistics();
		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS);
		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS);
		stats.setStroke(true);
		stats.workers.last().respond(statsAnswer(1, 0.1));
		await settle();
		stats.timers.advance(STATS_DEBOUNCE_MS * 3);
		await settle();
		expect(stats.workers.last().posted).toHaveLength(1);

		// The stroke's end is a change, as the page says.
		stats.setStroke(false);
		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS);
		await settle();
		expect(stats.workers.last().posted).toHaveLength(2);
		stats.timers.advance(STATS_DEBOUNCE_MS * 3);
		await settle();
		expect(stats.workers.last().posted).toHaveLength(2);
	});

	it.each([
		['the worker cannot be started', 'throw'],
		['there is no worker', 'null'],
	] as const)(
		'says there are none, now and at every change, when %s',
		async (_, failure) => {
			const workers = createWorkers();
			workers.failNext.push(failure);
			const stats = createStatistics(workers);
			expect(stats.log).toEqual(['showUnavailable']);
			stats.scheduler.refresh();
			stats.timers.advance(STATS_DEBOUNCE_MS);
			await settle();
			expect(stats.log).toEqual(['showUnavailable', 'showUnavailable']);
			expect(workers.started).toHaveLength(0);
		},
	);

	it('says there are none after a worker error, and never asks again', async () => {
		const stats = createStatistics();
		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS);
		stats.workers.last().emit('error', { message: 'script failed' });
		await settle();
		expect(stats.log).toContain('showUnavailable');
		expect(stats.logged).toHaveLength(1);

		stats.scheduler.refresh();
		stats.timers.advance(STATS_DEBOUNCE_MS);
		await settle();
		expect(stats.workers.posted()).toHaveLength(1);
		expect(stats.log.at(-1)).toBe('showUnavailable');
	});
});

const createTemperature = (workers = createWorkers()) => {
	const timers = createFakeTimers();
	const logged: unknown[] = [];
	const store = createLayerStore((error) => logged.push(error));
	let world = blank();
	const scheduler = createTemperatureService({
		createWorker: workers.create,
		currentWorld: () => world,
		isStrokeActive: () => false,
		store,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		logError: (error) => logged.push(error),
	});
	return {
		scheduler,
		workers,
		timers,
		store,
		logged,
		setWorld: (next: World) => {
			world = next;
		},
		/** Moves past the wait, so that the request waiting is made. */
		wait: () => timers.advance(TEMPERATURE_DEBOUNCE_MS),
	};
};

describe('createTemperatureService', () => {
	it('asks for the temperature once it is showing, and keeps the result', async () => {
		const temperature = createTemperature();
		temperature.scheduler.refresh();
		temperature.wait();
		expect(temperature.workers.started).toHaveLength(1);
		expect(temperature.workers.posted()).toHaveLength(0);

		// The world of the moment the request is made, not of the change, of
		// the switching on or of the start.
		temperature.scheduler.setShowing(true);
		const world = blank();
		world.elevation[0] = 1234;
		temperature.setWorld(world);
		temperature.wait();
		expect(temperature.workers.posted()).toEqual([
			{ id: 1, kind: 'temperature', world, start: undefined },
		]);
		const [posted] =
			temperature.workers.posted() as SimRequest<'temperature'>[];
		expect(posted?.world.elevation[0]).toBe(1234);
		expect(temperature.store.temperature.status).toBe('calculating');

		temperature.workers.last().respond(progressMessageOf(1, 1));
		expect(temperature.store.temperature.progress?.yearsDone).toBe(1);
		await settle();
		expect(temperature.store.temperature.status).toBe('calculating');

		temperature.workers.last().respond(temperatureAnswer(1, 3));
		await settle();
		expect(temperature.store.temperature).toEqual({
			status: 'current',
			result: temperatureOf(3),
			progress: null,
		});
	});

	it('restarts a worker still solving when a newer request overtakes it, and keeps the last result', async () => {
		const temperature = createTemperature();
		temperature.scheduler.setShowing(true);
		temperature.wait();
		temperature.workers.last().respond(temperatureAnswer(1, 4));
		await settle();
		const kept = temperature.store.temperature.result;

		temperature.scheduler.refresh();
		temperature.wait();
		const solving = temperature.workers.last();
		temperature.scheduler.refresh();
		temperature.wait();

		expect(solving.terminations).toBe(1);
		expect(temperature.workers.started).toHaveLength(2);
		// The ended solve cost nothing of the last result, which is where
		// the newest request starts from.
		expect(temperature.store.temperature).toMatchObject({
			status: 'calculating',
			result: kept,
		});
		const newest = temperature.workers.last()
			.posted[0] as SimRequest<'temperature'>;
		expect(newest.start).toEqual({
			state: kept?.state,
			solvedFor: kept?.solvedFor,
		});

		// The ended worker's answer is never delivered.
		solving.respond(temperatureAnswer(2, 99));
		await settle();
		expect(temperature.store.temperature.result).toBe(kept);
	});

	it('is unavailable, keeping the store so, when the worker cannot be started', () => {
		const workers = createWorkers();
		workers.failNext.push('throw');
		const temperature = createTemperature(workers);
		expect(temperature.store.temperature.status).toBe('unavailable');
		temperature.scheduler.setShowing(true);
		temperature.wait();
		expect(workers.started).toHaveLength(0);
		expect(temperature.logged).toHaveLength(1);
	});

	it('is unavailable after a worker error, and asks nothing again', async () => {
		const temperature = createTemperature();
		temperature.scheduler.setShowing(true);
		temperature.wait();
		temperature.workers.last().emit('error');
		await settle();
		expect(temperature.store.temperature.status).toBe('unavailable');
		temperature.scheduler.refresh();
		temperature.wait();
		await settle();
		expect(temperature.workers.posted()).toHaveLength(1);
		expect(temperature.workers.started).toHaveLength(1);
	});

	it('is unavailable when a fresh worker cannot be started', async () => {
		const temperature = createTemperature();
		temperature.scheduler.setShowing(true);
		temperature.wait();
		temperature.workers.failNext.push('throw');
		temperature.scheduler.refresh();
		temperature.wait();
		await settle();
		expect(temperature.store.temperature.status).toBe('unavailable');
		expect(temperature.workers.started).toHaveLength(1);
	});

	// Two solves of a world that settles in its first year: well under a
	// second, but several times that under coverage.
	it('gives the store what the solver gives, through the real handler', {
		timeout: 30_000,
	}, async () => {
		// An ocean with its axis upright settles in its first year.
		const world = blank();
		world.planet = { ...world.planet, axialTiltDeg: 0 };
		const temperature = createTemperature();
		temperature.setWorld(world);
		const years: number[] = [];
		temperature.store.addListener((layer) => {
			if (layer.progress !== null) {
				years.push(layer.progress.yearsDone);
			}
		});
		temperature.scheduler.setShowing(true);
		temperature.wait();
		temperature.workers.last().answer(1);
		await settle();

		const direct = solveTemperature(world);
		expect(temperature.store.temperature).toEqual({
			status: 'current',
			result: direct,
			progress: null,
		});
		expect(years).toEqual(
			Array.from({ length: direct.yearsRun }, (_, year) => year + 1),
		);
	});
});

const createWinds = (workers = createWorkers()) => {
	const timers = createFakeTimers();
	const logged: unknown[] = [];
	const store = createLayerStore((error) => logged.push(error));
	let world = blank();
	const scheduler = createWindsService({
		createWorker: workers.create,
		currentWorld: () => world,
		isStrokeActive: () => false,
		store,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		logError: (error) => logged.push(error),
	});
	return {
		scheduler,
		workers,
		timers,
		store,
		logged,
		setWorld: (next: World) => {
			world = next;
		},
		/**
		 * Has the store take a current temperature result, as the
		 * temperature's scheduler would after an edit, and lets what follows
		 * run.
		 */
		arrive: async (temperature: TemperatureResult) => {
			store.markOutOfDate();
			store.markCalculating();
			store.setResult(temperature, true);
			await settle();
		},
	};
};

const windsAnswer = (id: number, value: number) => ({
	id,
	kind: 'winds',
	ok: true,
	result: windResultOf(value),
});

describe('createWindsService', () => {
	it('asks for the winds of a new temperature from its months and the world of the moment, and keeps them', async () => {
		const winds = createWinds();
		winds.scheduler.setShowing(true);
		const world = blank();
		world.elevation[0] = 1234;
		winds.setWorld(world);
		const temperature = temperatureOf(1);
		await winds.arrive(temperature);

		expect(winds.workers.posted()).toEqual([
			{ id: 1, kind: 'winds', world, temperatures: temperature.months },
		]);
		// A copy is sent: the store keeps the temperature's months whole.
		expect(temperature.months[0]?.byteLength).toBe(2 * 4);
		expect(winds.store.winds.status).toBe('calculating');

		winds.workers.last().respond(windsAnswer(1, 3));
		await settle();
		expect(winds.store.winds).toEqual({
			status: 'current',
			result: { winds: windResultOf(3), temperature, dayLengthHours: 24 },
		});
	});

	it('leaves an overtaken solve to finish on its worker, ignoring its answer, and asks the same worker next', async () => {
		const winds = createWinds();
		winds.scheduler.setShowing(true);
		await winds.arrive(temperatureOf(1));
		const newer = temperatureOf(2);
		await winds.arrive(newer);

		expect(winds.workers.started).toHaveLength(1);
		expect(winds.workers.last().terminations).toBe(0);
		expect(winds.workers.posted().map((posted) => posted.id)).toEqual([1]);

		winds.workers.last().respond(windsAnswer(1, 1));
		await settle();
		expect(winds.store.winds).toEqual({ status: 'calculating', result: null });
		expect(winds.workers.posted().map((posted) => posted.id)).toEqual([1, 2]);
		expect(winds.workers.posted()[1]).toMatchObject({
			temperatures: newer.months,
		});

		winds.workers.last().respond(windsAnswer(2, 2));
		await settle();
		expect(winds.store.winds).toEqual({
			status: 'current',
			result: {
				winds: windResultOf(2),
				temperature: newer,
				dayLengthHours: 24,
			},
		});
	});

	it('records a request that fails and keeps no winds', async () => {
		const winds = createWinds();
		winds.scheduler.setShowing(true);
		await winds.arrive(temperatureOf(1));
		winds.workers.last().respond(simFailure(1, 'winds', 'too calm'));
		await settle();
		expect(winds.logged).toEqual([new Error('too calm')]);
		expect(winds.store.winds).toEqual({ status: 'empty', result: null });
	});

	it('is unavailable, keeping the store so, when the worker cannot be started, and the temperature carries on', async () => {
		const workers = createWorkers();
		workers.failNext.push('null');
		const winds = createWinds(workers);
		expect(winds.store.winds.status).toBe('unavailable');
		winds.scheduler.setShowing(true);
		const temperature = temperatureOf(1);
		await winds.arrive(temperature);
		winds.timers.advance(TEMPERATURE_DEBOUNCE_MS);
		await settle();
		expect(workers.started).toHaveLength(0);
		expect(winds.store.winds.status).toBe('unavailable');
		expect(winds.store.temperature).toMatchObject({
			status: 'current',
			result: temperature,
		});
	});

	it('is unavailable after a worker error, and asks nothing again', async () => {
		const winds = createWinds();
		winds.scheduler.setShowing(true);
		await winds.arrive(temperatureOf(1));
		winds.workers.last().emit('error');
		await settle();
		expect(winds.store.winds.status).toBe('unavailable');
		await winds.arrive(temperatureOf(2));
		expect(winds.workers.posted()).toHaveLength(1);
		expect(winds.workers.started).toHaveLength(1);
	});

	// Two wind solves: about a second each, but several times that under
	// coverage.
	it('gives the store what the solver gives, through the real handler', {
		timeout: 60_000,
	}, async () => {
		const winds = createWinds();
		const world = blank();
		winds.setWorld(world);
		winds.scheduler.setShowing(true);
		const temperature = temperatureOf(1, world.elevation.length);
		for (const [index, month] of temperature.months.entries()) {
			month.fill(index);
		}
		await winds.arrive(temperature);
		winds.workers.last().answer(1);
		await settle();

		expect(winds.store.winds).toEqual({
			status: 'current',
			result: {
				winds: solveWinds(world, temperature.months),
				temperature,
				dayLengthHours: 24,
			},
		});
	});
});

describe('createWindsService with changes while a solve runs', () => {
	/**
	 * A winds service showing the winds on a world whose day length the
	 * test changes in place, as the planet controls do, with its first
	 * solve, for 24 hours, under way.
	 */
	const createRunning = async () => {
		const winds = createWinds();
		const world = blank();
		winds.setWorld(world);
		winds.scheduler.setShowing(true);
		await winds.arrive(temperatureOf(1));
		const setDayLength = (hours: number): void => {
			world.planet = { ...world.planet, dayLengthHours: hours };
			winds.scheduler.refresh();
		};
		/** Answers the newest request, with a value telling it apart. */
		const answerNewest = async (): Promise<void> => {
			const request = winds.workers.posted().at(-1);
			if (request === undefined) {
				throw new Error('nothing was posted');
			}
			winds.workers
				.last()
				.respond(windsAnswer(request.id, request.world.planet.dayLengthHours));
			await settle();
		};
		const wait = async (): Promise<void> => {
			winds.timers.advance(TEMPERATURE_DEBOUNCE_MS);
			await settle();
		};
		/** The day length each request posted was solved for, in order. */
		const postedDays = () =>
			winds.workers
				.posted()
				.map((request) => request.world.planet.dayLengthHours);
		return { ...winds, world, setDayLength, answerNewest, wait, postedDays };
	};

	/**
	 * Whether the winds kept are current only if solved for the day length
	 * set now: the fixture's answers hold the day length they were posted
	 * with in every value.
	 */
	const expectHonest = (winds: Awaited<ReturnType<typeof createRunning>>) => {
		const { status, result } = winds.store.winds;
		if (result !== null) {
			expect(result.winds.east[0]?.[0]).toBe(result.dayLengthHours);
		}
		if (status === 'current') {
			expect(result?.dayLengthHours).toBe(winds.world.planet.dayLengthHours);
		}
	};

	it('never keeps winds solved for one day length as current for another', async () => {
		const winds = await createRunning();
		winds.setDayLength(30);
		await winds.wait();
		winds.setDayLength(40);
		await winds.answerNewest();
		expectHonest(winds);
		await winds.wait();
		expect(winds.postedDays()).toEqual([24, 40]);
		winds.setDayLength(30);
		await winds.answerNewest();
		expectHonest(winds);
		expect(winds.store.winds.status).toBe('outOfDate');

		await winds.wait();
		expect(winds.postedDays()).toEqual([24, 40, 30]);
		await winds.answerNewest();
		expect(winds.store.winds).toMatchObject({
			status: 'current',
			result: { dayLengthHours: 30 },
		});
		expectHonest(winds);
		await winds.wait();
		expect(winds.postedDays()).toHaveLength(3);
	});

	it('does not either when switched off and on while the solve runs', async () => {
		const winds = await createRunning();
		winds.setDayLength(30);
		await winds.wait();
		winds.setDayLength(40);
		await winds.answerNewest();
		await winds.wait();
		winds.setDayLength(30);
		winds.scheduler.setShowing(false);
		await winds.answerNewest();
		expectHonest(winds);
		winds.scheduler.setShowing(true);
		expectHonest(winds);
		expect(winds.store.winds.status).not.toBe('current');

		await winds.wait();
		expect(winds.postedDays()).toEqual([24, 40, 30]);
		await winds.answerNewest();
		expect(winds.store.winds).toMatchObject({
			status: 'current',
			result: { dayLengthHours: 30 },
		});
		expectHonest(winds);
	});

	it('posts a request held back for a solve once it is answered, with the world as it is then', async () => {
		const winds = await createRunning();
		winds.setDayLength(30);
		await winds.wait();
		expect(winds.postedDays()).toEqual([24]);
		winds.world.planet = { ...winds.world.planet, dayLengthHours: 30 };
		await winds.answerNewest();
		expect(winds.postedDays()).toEqual([24, 30]);
		// The answer it overtook is dropped.
		expect(winds.store.winds).toEqual({ status: 'calculating', result: null });
		await winds.answerNewest();
		expect(winds.store.winds).toMatchObject({
			status: 'current',
			result: { dayLengthHours: 30 },
		});
	});

	it('posts nothing held back whose turn comes during a stroke, and asks once after it', async () => {
		let stroke = false;
		const workers = createWorkers();
		const timers = createFakeTimers();
		const store = createLayerStore(() => {});
		const world = blank();
		const scheduler = createWindsService({
			createWorker: workers.create,
			currentWorld: () => world,
			isStrokeActive: () => stroke,
			store,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
			logError: () => {},
		});
		scheduler.setShowing(true);
		store.markCalculating();
		store.setResult(temperatureOf(1), true);
		await settle();
		world.planet = { ...world.planet, dayLengthHours: 30 };
		scheduler.refresh();
		timers.advance(TEMPERATURE_DEBOUNCE_MS);
		await settle();

		stroke = true;
		workers.last().respond(windsAnswer(1, 1));
		await settle();
		timers.advance(TEMPERATURE_DEBOUNCE_MS * 3);
		await settle();
		expect(workers.posted()).toHaveLength(1);

		// The stroke's end changes the world, which the temperature's
		// result then leads to winds for.
		stroke = false;
		store.markOutOfDate();
		timers.advance(TEMPERATURE_DEBOUNCE_MS);
		await settle();
		expect(workers.posted()).toHaveLength(1);
		expect(store.winds.status).toBe('empty');
		store.markCalculating();
		store.setResult(temperatureOf(2), true);
		await settle();
		timers.advance(TEMPERATURE_DEBOUNCE_MS * 3);
		await settle();
		expect(workers.posted()).toHaveLength(2);
		expect(store.winds.status).toBe('calculating');
	});

	it('posts nothing held back once the winds are switched off, or the world replaced', async () => {
		const hidden = await createRunning();
		hidden.setDayLength(30);
		await hidden.wait();
		hidden.scheduler.setShowing(false);
		await hidden.answerNewest();
		await hidden.wait();
		expect(hidden.postedDays()).toEqual([24]);
		expect(hidden.store.winds.status).toBe('outOfDate');

		const replaced = await createRunning();
		replaced.setDayLength(30);
		await replaced.wait();
		replaced.store.clear();
		replaced.scheduler.reset();
		await replaced.answerNewest();
		await replaced.wait();
		expect(replaced.postedDays()).toEqual([24]);
		expect(replaced.store.winds).toEqual({ status: 'empty', result: null });
	});
});
