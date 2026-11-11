import { describe, expect, it } from 'vitest';
import {
	computeTerrainStats,
	createBlankWorld,
	generateWorld,
	type SimRequest,
	type SimResponse,
	simFailure,
	type TerrainStats,
	type World,
} from '../core/index';
import {
	createSimClient,
	type LatestOutcome,
	type WorkerEventLike,
	type WorkerEventType,
	type WorkerLike,
} from './client';
import { handleRequest } from './handle';

type Listener = (event: WorkerEventLike) => void;

/** A stand-in for a worker whose answers and errors the test sends by hand. */
type FakeWorker = WorkerLike & {
	/** A copy of each request posted, in order, as a worker would get it. */
	readonly posted: SimRequest[];
	/** Every argument list `postMessage` was called with. */
	readonly postCalls: unknown[][];
	/** How many times `terminate` was called. */
	terminations: number;
	/** How many listeners the worker has for a type of event. */
	listenerCount(type: WorkerEventType): number;
	/** Delivers an event to the listeners for its type. */
	emit(type: WorkerEventType, event?: WorkerEventLike): void;
	/** Delivers a response as a `message` event. */
	respond(response: unknown): void;
	/** Answers the posted request with that id as the real handler would. */
	answer(id: number): void;
};

const createFakeWorker = (): FakeWorker => {
	const listeners = new Map<WorkerEventType, Set<Listener>>();
	const of = (type: WorkerEventType): Set<Listener> => {
		let set = listeners.get(type);
		if (set === undefined) {
			set = new Set();
			listeners.set(type, set);
		}
		return set;
	};
	const fake: FakeWorker = {
		posted: [],
		postCalls: [],
		terminations: 0,
		postMessage: (...args: unknown[]) => {
			fake.postCalls.push(args);
			fake.posted.push(structuredClone(args[0]) as SimRequest);
		},
		addEventListener: (type, listener) => {
			of(type).add(listener);
		},
		removeEventListener: (type, listener) => {
			of(type).delete(listener);
		},
		terminate: () => {
			fake.terminations++;
		},
		listenerCount: (type) => of(type).size,
		emit: (type, event = {}) => {
			for (const listener of [...of(type)]) {
				listener(event);
			}
		},
		respond: (response) => fake.emit('message', { data: response }),
		answer: (id) => {
			const request = fake.posted.find((posted) => posted.id === id);
			fake.respond(structuredClone(handleRequest(request)));
		},
	};
	return fake;
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

const success = (id: number, landFraction: number): SimResponse => ({
	id,
	kind: 'terrainStats',
	ok: true,
	result: statsOf(landFraction),
});

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

const blank = (): World => createBlankWorld(64);

describe('createSimClient', () => {
	it('listens for messages and both kinds of error', () => {
		const worker = createFakeWorker();
		createSimClient(worker);
		expect(worker.listenerCount('message')).toBe(1);
		expect(worker.listenerCount('error')).toBe(1);
		expect(worker.listenerCount('messageerror')).toBe(1);
	});
});

describe('request', () => {
	it('posts the kind and the world under an id of its own', () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);
		const world = blank();

		void client.request('terrainStats', world);
		void client.request('terrainStats', world);

		expect(worker.posted).toHaveLength(2);
		expect(worker.posted[0]).toEqual({ id: 1, kind: 'terrainStats', world });
		expect(worker.posted[1]?.id).toBe(2);
	});

	it('resolves with the result of the response that carries its id', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const result = client.request('terrainStats', blank());
		worker.respond(success(1, 0.25));

		await expect(result).resolves.toEqual(statsOf(0.25));
	});

	it('matches responses to requests when they arrive out of order', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.request('terrainStats', blank());
		const second = client.request('terrainStats', blank());
		const third = client.request('terrainStats', blank());
		worker.respond(success(3, 0.3));
		worker.respond(success(1, 0.1));

		await expect(third).resolves.toEqual(statsOf(0.3));
		await expect(first).resolves.toEqual(statsOf(0.1));
		expect(await stateOf(second)).toBe('pending');

		worker.respond(success(2, 0.2));
		await expect(second).resolves.toEqual(statsOf(0.2));
	});

	it('rejects with the reason when the worker answers with a failure', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const result = client.request('terrainStats', blank());
		worker.respond(simFailure(1, 'terrainStats', 'the world is flat'));

		await expect(result).rejects.toThrow(new Error('the world is flat'));
	});

	it('ignores a response nobody is waiting for', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const result = client.request('terrainStats', blank());
		worker.respond(success(99, 0.9));
		worker.respond(simFailure(null, null, 'A request must be an object'));
		expect(await stateOf(result)).toBe('pending');

		worker.respond(success(1, 0.5));
		worker.respond(success(1, 0.6));
		await expect(result).resolves.toEqual(statsOf(0.5));
	});

	it('ignores a message that is not a response', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const result = client.request('terrainStats', blank());
		for (const data of [undefined, null, 'hello', 1, { id: 1 }]) {
			worker.respond(data);
		}
		worker.emit('message');

		expect(await stateOf(result)).toBe('pending');
	});

	it('sends a copy, leaving the caller its elevation array', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);
		const world = generateWorld({
			resolution: 64,
			seed: 1977,
			landFraction: 0.3,
		});
		const before = world.elevation.slice();

		const result = client.request('terrainStats', world);

		// A second argument would be a transfer list, which empties the
		// arrays it names.
		expect(worker.postCalls).toEqual([
			[{ id: 1, kind: 'terrainStats', world }],
		]);
		expect(worker.posted[0]?.world.elevation).not.toBe(world.elevation);
		expect(worker.posted[0]?.world.elevation.buffer).not.toBe(
			world.elevation.buffer,
		);

		// Whatever the worker does to its copy stays with the worker.
		worker.posted[0]?.world.elevation.fill(9000);
		world.elevation[0] = 1234;
		worker.answer(1);
		await result;

		expect(world.elevation.byteLength).toBe(before.byteLength);
		expect(world.elevation[0]).toBe(1234);
		expect(world.elevation.subarray(1)).toEqual(before.subarray(1));
	});

	it('gives the statistics the core computes directly, through the handler', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);
		const world = generateWorld({ resolution: 64, seed: 5, landFraction: 0.4 });
		world.seaLevel = 300;

		const result = client.request('terrainStats', world);
		worker.answer(1);

		await expect(result).resolves.toEqual(computeTerrainStats(world));
	});

	it('rejects through the handler when the core refuses the world', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);
		const world = { ...blank(), elevation: new Float32Array(4) };

		const result = client.request('terrainStats', world);
		worker.answer(1);

		await expect(result).rejects.toThrow(
			'A world of resolution 64 has 24576 cells; its elevation holds 4',
		);
	});

	it('rejects when the request cannot be posted, and carries on', async () => {
		const worker = createFakeWorker();
		const post = worker.postMessage;
		const client = createSimClient(worker);

		worker.postMessage = () => {
			throw new Error('could not be cloned');
		};
		await expect(client.request('terrainStats', blank())).rejects.toThrow(
			new Error('could not be cloned'),
		);
		worker.postMessage = () => {
			throw 'not an error';
		};
		await expect(client.request('terrainStats', blank())).rejects.toThrow(
			new Error('not an error'),
		);

		worker.postMessage = post;
		const result = client.request('terrainStats', blank());
		worker.respond(success(3, 0.7));
		await expect(result).resolves.toEqual(statsOf(0.7));
	});
});

describe('a worker error', () => {
	it('rejects every pending request and leaves the client usable', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.request('terrainStats', blank());
		const second = client.request('terrainStats', blank());
		worker.emit('error', { message: 'Uncaught RangeError: out of memory' });

		await expect(first).rejects.toThrow(
			new Error(
				'The simulation worker reported an error: Uncaught RangeError: out of memory',
			),
		);
		await expect(second).rejects.toThrow('The simulation worker reported');

		const third = client.request('terrainStats', blank());
		expect(worker.posted).toHaveLength(3);
		worker.respond(success(3, 0.4));
		await expect(third).resolves.toEqual(statsOf(0.4));
	});

	it('drops the answer to a request it has already rejected', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.request('terrainStats', blank());
		worker.emit('error');
		await expect(first).rejects.toThrow(
			new Error('The simulation worker reported an error'),
		);

		const second = client.request('terrainStats', blank());
		worker.respond(success(1, 0.1));
		expect(await stateOf(second)).toBe('pending');
	});

	it('says nothing more when the error has no message of its own', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const empty = client.request('terrainStats', blank());
		worker.emit('error', { message: '' });
		await expect(empty).rejects.toThrow(
			new Error('The simulation worker reported an error'),
		);

		const odd = client.request('terrainStats', blank());
		worker.emit('error', { message: 404 });
		await expect(odd).rejects.toThrow(
			new Error('The simulation worker reported an error'),
		);
	});

	it('rejects every pending request when a message cannot be read', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.request('terrainStats', blank());
		const second = client.latest('terrainStats', blank());
		worker.emit('messageerror');

		for (const result of [first, second]) {
			await expect(result).rejects.toThrow(
				new Error('A message from the simulation worker could not be read'),
			);
		}

		const third = client.request('terrainStats', blank());
		worker.respond(success(3, 0.4));
		await expect(third).resolves.toEqual(statsOf(0.4));
	});

	it('does nothing when no request is pending', () => {
		const worker = createFakeWorker();
		createSimClient(worker);
		expect(() => worker.emit('error', { message: 'late' })).not.toThrow();
		expect(() => worker.emit('messageerror')).not.toThrow();
	});
});

describe('latest', () => {
	const result = (landFraction: number): LatestOutcome<TerrainStats> => ({
		superseded: false,
		result: statsOf(landFraction),
	});

	it('resolves with the result when nothing newer is asked', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const only = client.latest('terrainStats', blank());
		worker.respond(success(1, 0.3));

		await expect(only).resolves.toEqual(result(0.3));
	});

	it('resolves only the newest of several overlapping requests', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.latest('terrainStats', blank());
		const second = client.latest('terrainStats', blank());
		const third = client.latest('terrainStats', blank());
		expect(worker.posted.map((request) => request.id)).toEqual([1, 2, 3]);

		// The older two settle at once, before the worker has answered.
		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).resolves.toEqual({ superseded: true });
		expect(await stateOf(third)).toBe('pending');

		// Their answers, in any order, change nothing.
		worker.respond(success(2, 0.2));
		worker.respond(success(3, 0.3));
		worker.respond(success(1, 0.1));

		await expect(third).resolves.toEqual(result(0.3));
		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).resolves.toEqual({ superseded: true });
	});

	it('does not supersede a request that was already answered', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.latest('terrainStats', blank());
		worker.respond(success(1, 0.1));
		const second = client.latest('terrainStats', blank());
		worker.respond(success(2, 0.2));

		await expect(first).resolves.toEqual(result(0.1));
		await expect(second).resolves.toEqual(result(0.2));
	});

	it('rejects when the worker answers the newest with a failure', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.latest('terrainStats', blank());
		const second = client.latest('terrainStats', blank());
		worker.respond(simFailure(2, 'terrainStats', 'no statistics today'));

		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).rejects.toThrow(new Error('no statistics today'));
	});

	it('rejects the newest on a worker error and serves the next call', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.latest('terrainStats', blank());
		worker.emit('error', { message: 'boom' });
		await expect(first).rejects.toThrow('boom');

		const second = client.latest('terrainStats', blank());
		worker.respond(success(2, 0.2));
		await expect(second).resolves.toEqual(result(0.2));
	});

	it('leaves plain requests alone and is left alone by them', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const plain = client.request('terrainStats', blank());
		const first = client.latest('terrainStats', blank());
		const other = client.request('terrainStats', blank());
		expect(await stateOf(first)).toBe('pending');

		const second = client.latest('terrainStats', blank());
		worker.respond(success(1, 0.1));
		worker.respond(success(3, 0.3));
		worker.respond(success(4, 0.4));

		await expect(plain).resolves.toEqual(statsOf(0.1));
		await expect(other).resolves.toEqual(statsOf(0.3));
		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).resolves.toEqual(result(0.4));
	});

	it('supersedes the one before even when the new one cannot be posted', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.latest('terrainStats', blank());
		worker.postMessage = () => {
			throw new Error('could not be cloned');
		};
		const second = client.latest('terrainStats', blank());

		await expect(first).resolves.toEqual({ superseded: true });
		await expect(second).rejects.toThrow('could not be cloned');
	});
});

describe('dispose', () => {
	it('rejects what is pending, stops listening and ends the worker', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const plain = client.request('terrainStats', blank());
		const newest = client.latest('terrainStats', blank());
		client.dispose();

		for (const result of [plain, newest]) {
			await expect(result).rejects.toThrow(
				new Error('The simulation client has been disposed'),
			);
		}
		expect(worker.listenerCount('message')).toBe(0);
		expect(worker.listenerCount('error')).toBe(0);
		expect(worker.listenerCount('messageerror')).toBe(0);
		expect(worker.terminations).toBe(1);
	});

	it('rejects requests made afterwards without posting them', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);
		client.dispose();

		await expect(client.request('terrainStats', blank())).rejects.toThrow(
			new Error('The simulation client has been disposed'),
		);
		await expect(client.latest('terrainStats', blank())).rejects.toThrow(
			'disposed',
		);
		expect(worker.posted).toHaveLength(0);
	});

	it('does nothing the second time', () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);
		client.dispose();
		client.dispose();
		expect(worker.terminations).toBe(1);
	});

	it('manages with a worker that cannot be terminated', () => {
		const { terminate: _terminate, ...worker } = createFakeWorker();
		const client = createSimClient(worker);
		expect(() => client.dispose()).not.toThrow();
	});
});
