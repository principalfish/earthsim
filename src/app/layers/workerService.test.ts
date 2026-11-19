import { describe, expect, it } from 'vitest';
import {
	type ClimateSummary,
	createBlankWorld,
	type SimRequest,
	simFailure,
	solveClimate,
	type TerrainStats,
	type World,
} from '../../core/index';
import {
	climatePassOf,
	passMessageOf,
} from '../../core/testing/climateFixtures';
import { progressMessageOf } from '../../core/testing/temperatureFixtures';
import type { WorkerLike } from '../../worker/client';
import {
	createFakeWorker,
	type FakeWorker,
} from '../../worker/testing/fakeWorker';
import { createFakeTimers } from '../testing/fakeTimers';
import { settle } from '../testing/settle';
import { createLayerStore } from './layers';
import { CLIMATE_DEBOUNCE_MS, STATS_DEBOUNCE_MS } from './refresh';
import {
	createClimateService,
	createStatisticsService,
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

/** What a climate that took that many passes answers with. */
const summaryOf = (passes: number, settled = true): ClimateSummary => ({
	dayLengthHours: 24,
	passes,
	settled,
	changeC: 0,
});

const climateAnswer = (id: number, passes: number, settled = true) => ({
	id,
	kind: 'climate',
	ok: true,
	result: summaryOf(passes, settled),
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
			'climate',
			{ world: blank() },
			{ onProgress: (progress) => heard.push(progress.yearsDone) },
		);
		workers.last().respond(progressMessageOf(1, 1));
		workers.last().respond(progressMessageOf(1, 2));
		expect(heard).toEqual([1, 2]);
		expect(await stateOf(call)).toBe('pending');
	});

	it('passes the passes of a climate on, for the call it belongs to, and hears nothing more of a call that has been overtaken', async () => {
		const { service, workers } = createService();
		const first: number[] = [];
		const firstProgress: (number | undefined)[] = [];
		const second: number[] = [];
		const progressed: (number | undefined)[] = [];
		const overtaken = service.latest(
			'climate',
			{ world: blank() },
			{
				onPass: (pass) => first.push(pass.pass),
				onProgress: (_progress, pass) => firstProgress.push(pass),
			},
		);
		workers.last().respond(passMessageOf(1, 1));
		workers.last().respond(progressMessageOf(1, 1, 1));
		expect(first).toEqual([1]);
		expect(firstProgress).toEqual([1]);
		const newest = service.latest(
			'climate',
			{ world: blank() },
			{
				onPass: (pass) => second.push(pass.pass),
				onProgress: (_progress, pass) => progressed.push(pass),
			},
		);
		await expect(overtaken).resolves.toEqual({ superseded: true });
		// The overtaken call's worker goes on computing it; what it tells
		// meanwhile is not heard.
		workers.last().respond(passMessageOf(1, 2));
		workers.last().respond(progressMessageOf(1, 1, 2));
		workers.last().respond(passMessageOf(2, 1));
		workers.last().respond(progressMessageOf(2, 1, 1));
		expect(first).toEqual([1]);
		expect(firstProgress).toEqual([1]);
		expect(second).toEqual([1]);
		expect(progressed).toEqual([1]);
		expect(await stateOf(newest)).toBe('pending');
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
		const first = service.latest('climate', { world: blank() });
		const old = workers.last();
		const second = service.latest('climate', { world: blank() });

		expect(old.terminations).toBe(1);
		expect(workers.started).toHaveLength(2);
		const fresh = workers.last();
		expect(fresh).not.toBe(old);
		expect(old.posted).toHaveLength(1);
		expect(fresh.posted).toHaveLength(1);
		await expect(first).resolves.toEqual({ superseded: true });

		// The old worker's late answer is never delivered: nobody listens.
		expect(old.listenerCount('message')).toBe(0);
		old.respond(climateAnswer(1, 7));
		fresh.respond(climateAnswer(fresh.posted[0]?.id ?? -1, 2));
		await expect(second).resolves.toEqual({
			superseded: false,
			result: summaryOf(2),
		});
	});

	it('keeps a worker that answered everything it was asked', async () => {
		const { service, workers } = restarting();
		void service.latest('climate', { world: blank() });
		workers.last().respond(climateAnswer(1, 1));
		await settle();
		void service.latest('climate', { world: blank() });
		expect(workers.started).toHaveLength(1);
		expect(workers.last().terminations).toBe(0);
		expect(workers.last().posted).toHaveLength(2);
	});

	it('keeps a worker whose last request failed', async () => {
		const { service, workers } = restarting();
		const first = service.latest('climate', { world: blank() });
		workers.last().respond(simFailure(1, 'climate', 'no'));
		await expect(first).rejects.toThrow('no');
		void service.latest('climate', { world: blank() });
		expect(workers.started).toHaveLength(1);
	});

	it('becomes unavailable when the fresh worker cannot be started', async () => {
		const { service, workers, unavailable } = restarting();
		const first = service.latest('climate', { world: blank() });
		workers.failNext.push('null');
		const second = service.latest('climate', { world: blank() });

		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).rejects.toThrow(NO_WORKER_MESSAGE);
		expect(unavailable()).toBe(1);
		expect(workers.started).toHaveLength(1);
		expect(workers.last().terminations).toBe(1);

		await expect(service.latest('climate', { world: blank() })).rejects.toThrow(
			NO_WORKER_MESSAGE,
		);
		expect(workers.started).toHaveLength(1);
	});

	it('listens for errors on the fresh worker only', async () => {
		const { service, workers, unavailable } = restarting();
		void service.latest('climate', { world: blank() });
		const old = workers.last();
		const second = service.latest('climate', { world: blank() });
		expect(old.listenerCount('error')).toBe(0);
		workers.last().emit('error');
		expect(unavailable()).toBe(1);
		await expect(second).rejects.toThrow('reported an error');
	});
});

describe('createWorkerService cancelled', () => {
	it('supersedes the newest call at once and drops what its worker tells of it, keeping the worker', async () => {
		const { service, workers } = createService();
		const heard: number[] = [];
		const call = service.latest(
			'climate',
			{ world: blank() },
			{ onPass: (pass) => heard.push(pass.pass) },
		);
		workers.last().respond(passMessageOf(1, 1));
		service.cancel();
		await expect(call).resolves.toEqual({ superseded: true });
		workers.last().respond(passMessageOf(1, 2));
		workers.last().respond(climateAnswer(1, 2));
		expect(heard).toEqual([1]);
		expect(workers.started).toHaveLength(1);
		expect(workers.last().terminations).toBe(0);

		// The next call is asked of the same worker, and answered.
		const next = service.latest('climate', { world: blank() });
		workers.last().respond(climateAnswer(2, 1));
		await expect(next).resolves.toEqual({
			superseded: false,
			result: summaryOf(1),
		});
	});

	it('does nothing with no call to be answered', async () => {
		const { service, workers } = createService({ restartWhenOvertaken: true });
		service.cancel();
		const answered = service.latest('climate', { world: blank() });
		workers.last().respond(climateAnswer(1, 1));
		await settle();
		service.cancel();
		await expect(answered).resolves.toEqual({
			superseded: false,
			result: summaryOf(1),
		});
		expect(workers.started).toHaveLength(1);
		expect(workers.last().terminations).toBe(0);
	});

	it('ends the worker computing it and starts a fresh one, when restarting', async () => {
		const { service, workers } = createService({ restartWhenOvertaken: true });
		const call = service.latest('climate', { world: blank() });
		const old = workers.last();
		service.cancel();
		await expect(call).resolves.toEqual({ superseded: true });
		expect(old.terminations).toBe(1);
		expect(old.listenerCount('message')).toBe(0);
		expect(workers.started).toHaveLength(2);

		// The next call goes to the fresh worker, overtaking nothing.
		void service.latest('climate', { world: blank() });
		expect(workers.started).toHaveLength(2);
		expect(workers.last().posted).toHaveLength(1);
	});

	it('becomes unavailable when the fresh worker cannot be started', async () => {
		const { service, workers, unavailable } = createService({
			restartWhenOvertaken: true,
		});
		const call = service.latest('climate', { world: blank() });
		workers.failNext.push('null');
		service.cancel();
		await expect(call).resolves.toEqual({ superseded: true });
		expect(unavailable()).toBe(1);
		await expect(service.latest('climate', { world: blank() })).rejects.toThrow(
			NO_WORKER_MESSAGE,
		);
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

const createClimate = (workers = createWorkers()) => {
	const timers = createFakeTimers();
	const logged: unknown[] = [];
	const store = createLayerStore((error) => logged.push(error));
	let world = blank();
	const scheduler = createClimateService({
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
		wait: () => timers.advance(CLIMATE_DEBOUNCE_MS),
	};
};

/** The request a worker was posted last, as a climate request. */
const lastPosted = (worker: { readonly posted: SimRequest[] }) =>
	worker.posted.at(-1) as SimRequest<'climate'>;

describe('createClimateService', () => {
	it('asks for the climate after the wait for a change, with nothing said to be on screen, and keeps each pass and the answer', async () => {
		const climate = createClimate();
		expect(climate.workers.started).toHaveLength(1);
		climate.scheduler.refresh();
		expect(climate.workers.posted()).toHaveLength(0);

		// The world of the moment the request is made, once the wait is over,
		// not of the change or of the start.
		const world = blank();
		world.elevation[0] = 1234;
		climate.setWorld(world);
		climate.wait();
		expect(climate.workers.posted()).toEqual([
			{ id: 1, kind: 'climate', world, start: undefined },
		]);
		expect(lastPosted(climate.workers.last()).world.elevation[0]).toBe(1234);
		expect(climate.store.temperature.status).toBe('calculating');
		expect(climate.store.winds.status).toBe('calculating');

		const worker = climate.workers.last();
		worker.respond(progressMessageOf(1, 1, 1));
		expect(climate.store.temperature).toMatchObject({
			progress: { yearsDone: 1 },
			pass: 1,
		});
		worker.respond(passMessageOf(1, 1));
		expect(climate.store.temperature).toMatchObject({
			status: 'calculating',
			result: climatePassOf(1).temperature,
			pass: 2,
		});
		expect(climate.store.winds.result?.winds).toEqual(climatePassOf(1).winds);

		worker.respond(passMessageOf(1, 2, { last: true, settled: true }));
		worker.respond(climateAnswer(1, 2));
		await settle();
		expect(climate.store.temperature).toEqual({
			status: 'current',
			result: climatePassOf(2).temperature,
			progress: null,
			pass: null,
		});
		expect(climate.store.winds).toEqual({
			status: 'current',
			result: {
				temperature: climatePassOf(2).temperature,
				winds: climatePassOf(2).winds,
				currents: climatePassOf(2).currents,
				dayLengthHours: 24,
			},
		});
	});

	it('restarts a worker still solving when a newer request overtakes it, starting from the settled climate', async () => {
		const climate = createClimate();
		climate.scheduler.refreshNow();
		const first = climate.workers.last();
		first.respond(passMessageOf(1, 4, { last: true, settled: true }));
		first.respond(climateAnswer(1, 4));
		await settle();
		const kept = climate.store.temperature.result;

		climate.scheduler.refresh();
		climate.wait();
		const solving = climate.workers.last();
		solving.respond(passMessageOf(2, 1));
		climate.scheduler.refresh();
		climate.wait();

		expect(solving.terminations).toBe(1);
		expect(climate.workers.started).toHaveLength(2);
		const newest = lastPosted(climate.workers.last());
		expect(newest.start?.temperature.state).toEqual(kept?.state);
		expect(newest.start?.temperature.months).toEqual(kept?.months);
		expect(newest.start?.winds.east).toEqual(climatePassOf(4).winds.east);
		expect(newest.start?.dayLengthHours).toBe(24);

		// The ended worker's answer is never delivered.
		solving.respond(passMessageOf(2, 9, { last: true }));
		solving.respond(climateAnswer(2, 9));
		await settle();
		expect(climate.store.temperature).toMatchObject({
			status: 'calculating',
			result: climatePassOf(1).temperature,
		});
	});

	it('on Pause, lets the pass under way finish, ends the worker for a fresh one, and on running again carries on from that pass', async () => {
		const climate = createClimate();
		climate.scheduler.refreshNow();
		const worker = climate.workers.last();
		worker.respond(passMessageOf(1, 1));
		climate.scheduler.setRunning(false);
		expect(worker.terminations).toBe(0);

		worker.respond(passMessageOf(1, 2));
		expect(worker.terminations).toBe(1);
		expect(climate.workers.started).toHaveLength(2);
		expect(climate.store.temperature).toMatchObject({
			status: 'outOfDate',
			result: climatePassOf(2).temperature,
		});
		expect(climate.store.winds.status).toBe('outOfDate');
		await settle();
		expect(climate.logged).toEqual([]);

		climate.scheduler.setRunning(true);
		const fresh = climate.workers.last();
		const resumed = lastPosted(fresh);
		expect(resumed.start?.temperature.months).toEqual(
			climatePassOf(2).temperature.months,
		);
		expect(resumed.start?.winds.north).toEqual(climatePassOf(2).winds.north);
		expect(climate.store.temperature.status).toBe('calculating');
	});

	it('keeps an answer for a day length changed while it was worked out as out of date', async () => {
		const climate = createClimate();
		climate.scheduler.refreshNow();
		const world = blank();
		world.planet = { ...world.planet, dayLengthHours: 30 };
		climate.setWorld(world);
		climate.scheduler.refresh();
		const worker = climate.workers.last();
		worker.respond(passMessageOf(1, 1, { last: true, settled: true }));
		worker.respond(climateAnswer(1, 1));
		await settle();
		expect(climate.store.winds.status).toBe('outOfDate');
		expect(climate.store.winds.result?.dayLengthHours).toBe(24);

		climate.wait();
		expect(lastPosted(climate.workers.last()).world.planet.dayLengthHours).toBe(
			30,
		);
	});

	it('is unavailable, keeping the store so, when the worker cannot be started', () => {
		const workers = createWorkers();
		workers.failNext.push('throw');
		const climate = createClimate(workers);
		expect(climate.store.temperature.status).toBe('unavailable');
		expect(climate.store.winds.status).toBe('unavailable');
		climate.scheduler.refreshNow();
		climate.wait();
		expect(workers.started).toHaveLength(0);
		expect(climate.logged).toHaveLength(1);
	});

	it('is unavailable after a worker error, and asks nothing again', async () => {
		const climate = createClimate();
		climate.scheduler.refreshNow();
		climate.wait();
		climate.workers.last().emit('error');
		await settle();
		expect(climate.store.temperature.status).toBe('unavailable');
		expect(climate.store.winds.status).toBe('unavailable');
		climate.scheduler.refresh();
		climate.wait();
		await settle();
		expect(climate.workers.posted()).toHaveLength(1);
		expect(climate.workers.started).toHaveLength(1);
	});

	it('is unavailable when a fresh worker cannot be started for a newer request', async () => {
		const climate = createClimate();
		climate.scheduler.refreshNow();
		climate.wait();
		climate.workers.failNext.push('throw');
		climate.scheduler.refresh();
		climate.wait();
		await settle();
		expect(climate.store.temperature.status).toBe('unavailable');
		expect(climate.workers.started).toHaveLength(1);
	});

	it('is unavailable, keeping the pass reached, when no fresh worker can be started on Pause', async () => {
		const climate = createClimate();
		climate.scheduler.refreshNow();
		climate.scheduler.setRunning(false);
		climate.workers.failNext.push('null');
		climate.workers.last().respond(passMessageOf(1, 1));
		await settle();
		expect(climate.store.temperature).toMatchObject({
			status: 'unavailable',
			result: climatePassOf(1).temperature,
		});
		expect(climate.store.winds.status).toBe('unavailable');
		climate.scheduler.setRunning(true);
		expect(climate.workers.posted()).toHaveLength(1);
	});

	// A climate of a world that settles quickly: a few seconds, but several
	// times that under coverage.
	it('gives the store what the climate gives, through the real handler', {
		timeout: 240_000,
	}, async () => {
		// An ocean with its axis upright settles in a few years, its sea ice
		// the slowest part, and its winds carry little heat.
		const world = blank();
		world.planet = { ...world.planet, axialTiltDeg: 0 };
		const climate = createClimate();
		climate.setWorld(world);
		const passes: (number | null)[] = [];
		climate.store.addListener((layer) => {
			if (layer.status === 'calculating' && layer.progress === null) {
				passes.push(layer.pass);
			}
		});
		climate.scheduler.refreshNow();
		climate.workers.last().answer(1);
		await settle();

		const direct = solveClimate(world);
		expect(climate.store.temperature).toEqual({
			status: 'current',
			result: direct.temperature,
			progress: null,
			pass: null,
		});
		expect(climate.store.winds).toEqual({
			status: 'current',
			result: {
				temperature: direct.temperature,
				winds: direct.winds,
				currents: direct.currents,
				dayLengthHours: direct.dayLengthHours,
			},
		});
		// Each pass was under way, with no year yet done, in turn: the first
		// as the climate was asked for and each later one as the one before
		// it was shown. The last keeps its progress until the answer.
		expect(passes).toEqual(
			Array.from({ length: direct.passes }, (_, index) => index + 1),
		);
	});
});
