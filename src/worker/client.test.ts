import { describe, expect, it } from 'vitest';
import {
	computeTerrainStats,
	createBlankWorld,
	generateWorld,
	type SimRequest,
	type SimResponse,
	simFailure,
	type TemperatureProgress,
	type TerrainStats,
	type World,
} from '../core/index';
import {
	progressMessageOf,
	temperatureOf,
} from '../core/testing/temperatureFixtures';
import { createSimClient } from './client';
import { createFakeWorker } from './testing/fakeWorker';

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

		void client.request('terrainStats', { world });
		void client.request('terrainStats', { world });

		expect(worker.posted).toHaveLength(2);
		expect(worker.posted[0]).toEqual({ id: 1, kind: 'terrainStats', world });
		expect(worker.posted[1]?.id).toBe(2);
	});

	it('resolves with the result of the response that carries its id', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const result = client.request('terrainStats', { world: blank() });
		worker.respond(success(1, 0.25));

		await expect(result).resolves.toEqual(statsOf(0.25));
	});

	it('matches responses to requests when they arrive out of order', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.request('terrainStats', { world: blank() });
		const second = client.request('terrainStats', { world: blank() });
		const third = client.request('terrainStats', { world: blank() });
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

		const result = client.request('terrainStats', { world: blank() });
		worker.respond(simFailure(1, 'terrainStats', 'the world is flat'));

		await expect(result).rejects.toThrow(new Error('the world is flat'));
	});

	it('ignores a response nobody is waiting for', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const result = client.request('terrainStats', { world: blank() });
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

		const result = client.request('terrainStats', { world: blank() });
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

		const result = client.request('terrainStats', { world });

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

		const result = client.request('terrainStats', { world });
		worker.answer(1);

		await expect(result).resolves.toEqual(computeTerrainStats(world));
	});

	it('rejects through the handler when the core refuses the world', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);
		const world = { ...blank(), elevation: new Float32Array(4) };

		const result = client.request('terrainStats', { world });
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
		await expect(
			client.request('terrainStats', { world: blank() }),
		).rejects.toThrow(new Error('could not be cloned'));
		worker.postMessage = () => {
			throw 'not an error';
		};
		await expect(
			client.request('terrainStats', { world: blank() }),
		).rejects.toThrow(new Error('not an error'));

		worker.postMessage = post;
		const result = client.request('terrainStats', { world: blank() });
		worker.respond(success(3, 0.7));
		await expect(result).resolves.toEqual(statsOf(0.7));
	});
});

describe('request for temperature', () => {
	it('sends a copy of the start with the world, leaving the caller both', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);
		const world = blank();
		const start = temperatureOf(3, 4);

		void client.request('temperature', { world, start });

		expect(worker.postCalls).toEqual([
			[{ id: 1, kind: 'temperature', world, start }],
		]);
		const posted = worker.posted[0] as SimRequest<'temperature'>;
		expect(posted.start?.state?.temperatureK).not.toBe(
			start.state.temperatureK,
		);
		expect(start.state.temperatureK.byteLength).toBe(4 * 8);
		expect(start.months[0]?.byteLength).toBe(4 * 4);
	});

	it('tells of progress for its own id, in order, and settles only on the response', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);
		const heard: TemperatureProgress[] = [];
		const other: TemperatureProgress[] = [];

		const result = client.request(
			'temperature',
			{ world: blank() },
			{ onProgress: (progress) => heard.push(progress) },
		);
		void client.request(
			'temperature',
			{ world: blank() },
			{ onProgress: (progress) => other.push(progress) },
		);
		worker.respond(progressMessageOf(1, 1));
		worker.respond(progressMessageOf(1, 2));
		expect(await stateOf(result)).toBe('pending');
		expect(heard.map((progress) => progress.yearsDone)).toEqual([1, 2]);
		expect(other).toEqual([]);

		worker.respond({
			id: 1,
			kind: 'temperature',
			ok: true,
			result: temperatureOf(2),
		});
		await expect(result).resolves.toEqual(temperatureOf(2));

		// Answered: whatever comes for it later is ignored.
		worker.respond(progressMessageOf(1, 3));
		expect(heard).toHaveLength(2);
	});

	it('ignores progress for an id nobody waits on, or with nobody to tell', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const quiet = client.request('temperature', { world: blank() });
		expect(() => worker.respond(progressMessageOf(1, 1))).not.toThrow();
		expect(() => worker.respond(progressMessageOf(99, 1))).not.toThrow();
		expect(await stateOf(quiet)).toBe('pending');

		worker.respond({
			id: 1,
			kind: 'temperature',
			ok: true,
			result: temperatureOf(1),
		});
		await expect(quiet).resolves.toEqual(temperatureOf(1));
	});
});

describe('a worker error', () => {
	it('rejects every pending request and leaves the client usable', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.request('terrainStats', { world: blank() });
		const second = client.request('terrainStats', { world: blank() });
		worker.emit('error', { message: 'Uncaught RangeError: out of memory' });

		await expect(first).rejects.toThrow(
			new Error(
				'The simulation worker reported an error: Uncaught RangeError: out of memory',
			),
		);
		await expect(second).rejects.toThrow('The simulation worker reported');

		const third = client.request('terrainStats', { world: blank() });
		expect(worker.posted).toHaveLength(3);
		worker.respond(success(3, 0.4));
		await expect(third).resolves.toEqual(statsOf(0.4));
	});

	it('drops the answer to a request it has already rejected', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.request('terrainStats', { world: blank() });
		worker.emit('error');
		await expect(first).rejects.toThrow(
			new Error('The simulation worker reported an error'),
		);

		const second = client.request('terrainStats', { world: blank() });
		worker.respond(success(1, 0.1));
		expect(await stateOf(second)).toBe('pending');
	});

	it('says nothing more when the error has no message of its own', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const empty = client.request('terrainStats', { world: blank() });
		worker.emit('error', { message: '' });
		await expect(empty).rejects.toThrow(
			new Error('The simulation worker reported an error'),
		);

		const odd = client.request('terrainStats', { world: blank() });
		worker.emit('error', { message: 404 });
		await expect(odd).rejects.toThrow(
			new Error('The simulation worker reported an error'),
		);
	});

	it('rejects every pending request when a message cannot be read', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const first = client.request('terrainStats', { world: blank() });
		const second = client.request('terrainStats', { world: blank() });
		worker.emit('messageerror');

		for (const result of [first, second]) {
			await expect(result).rejects.toThrow(
				new Error('A message from the simulation worker could not be read'),
			);
		}

		const third = client.request('terrainStats', { world: blank() });
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

describe('dispose', () => {
	it('rejects what is pending, stops listening and ends the worker', async () => {
		const worker = createFakeWorker();
		const client = createSimClient(worker);

		const plain = client.request('terrainStats', { world: blank() });
		const other = client.request('terrainStats', { world: blank() });
		client.dispose();

		for (const result of [plain, other]) {
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

		await expect(
			client.request('terrainStats', { world: blank() }),
		).rejects.toThrow(new Error('The simulation client has been disposed'));
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
