import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createBlankWorld,
	deserializeWorld,
	generateWorld,
	MAX_WORLD_FILE_BYTES,
	MAX_WORLD_FILE_HEADER_BYTES,
	normaliseSeaLevel,
	SUPPORTED_RESOLUTIONS,
	serializeWorld,
	WORLD_FILE_PREFIX_BYTES,
	type World,
} from '../core/index';
import {
	DOWNLOAD_URL_LIFETIME_MS,
	downloadBlob,
	exportWorldFile,
	importWorldFile,
	loadCurrent,
	openWorldStore,
	SAVE_DATABASE_NAME,
	SAVE_DATABASE_VERSION,
	SAVE_KEY,
	SAVE_STORE_NAME,
	saveCurrent,
	WORLD_FILE_EXTENSION,
	WORLD_FILE_NAME,
} from './storage';

/** A world with terrain, a sea level and a negative zero in it. */
const sculptedWorld = (resolution: number): World => {
	const world = generateWorld({ resolution, seed: 1977, landFraction: 0.3 });
	world.seaLevel = normaliseSeaLevel(-250);
	world.elevation[0] = -0;
	world.elevation[1] = 11_999.5;
	return world;
};

/** Whether two worlds are the same in every setting and every bit. */
const sameWorld = (a: World, b: World): boolean =>
	a.resolution === b.resolution &&
	Object.is(a.seaLevel, b.seaLevel) &&
	JSON.stringify(a.origin) === JSON.stringify(b.origin) &&
	a.elevation.length === b.elevation.length &&
	a.elevation.every((value, cell) => Object.is(value, b.elevation[cell]));

/** A request of the database settled as a promise. */
const settled = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

/** Opens the save database as the page would, making its store if needed. */
const openSaves = (factory: IDBFactory): Promise<IDBDatabase> => {
	const request = factory.open(SAVE_DATABASE_NAME, SAVE_DATABASE_VERSION);
	request.onupgradeneeded = () => {
		request.result.createObjectStore(SAVE_STORE_NAME);
	};
	return settled(request);
};

/** Puts a value straight into the slot, whatever it is. */
const putRaw = async (factory: IDBFactory, value: unknown): Promise<void> => {
	const database = await openSaves(factory);
	await settled(
		database
			.transaction(SAVE_STORE_NAME, 'readwrite')
			.objectStore(SAVE_STORE_NAME)
			.put(value, SAVE_KEY),
	);
	database.close();
};

/** Everything in the store, by key. */
const readAll = async (
	factory: IDBFactory,
): Promise<Map<IDBValidKey, unknown>> => {
	const database = await openSaves(factory);
	const store = database
		.transaction(SAVE_STORE_NAME, 'readonly')
		.objectStore(SAVE_STORE_NAME);
	const keys = await settled(store.getAllKeys());
	const values: unknown[] = await settled(store.getAll());
	database.close();
	return new Map(keys.map((key, index) => [key, values[index]]));
};

/**
 * An IndexedDB that counts the connections opened on it and closed, and
 * writes down what is asked of them.
 */
type Watched = {
	readonly factory: IDBFactory;
	opened: number;
	closed: number;
	/** The connections opened so far, in order. */
	readonly databases: IDBDatabase[];
	/**
	 * What has been asked so far, in order: `open`, and on a connection
	 * `transaction`, `put`, `get` and `commit`.
	 */
	readonly asked: string[];
};

const watch = (real: IDBFactory): Watched => {
	const watched: Watched = {
		opened: 0,
		closed: 0,
		databases: [],
		asked: [],
		factory: {
			open: (name: string, version?: number) => {
				watched.asked.push('open');
				const request = real.open(name, version);
				request.addEventListener('success', () => {
					watched.opened++;
					const database = request.result;
					watched.databases.push(database);
					const close = database.close.bind(database);
					database.close = () => {
						watched.closed++;
						close();
					};
					const begin = database.transaction.bind(database);
					database.transaction = (...given) => {
						watched.asked.push('transaction');
						const transaction = begin(...given);
						const store = transaction.objectStore.bind(transaction);
						transaction.objectStore = (name) => {
							const found = store(name);
							const put = found.put.bind(found);
							found.put = (...value) => {
								watched.asked.push('put');
								return put(...value);
							};
							const get = found.get.bind(found);
							found.get = (key) => {
								watched.asked.push('get');
								return get(key);
							};
							return found;
						};
						const commit = transaction.commit.bind(transaction);
						transaction.commit = () => {
							watched.asked.push('commit');
							commit();
						};
						return transaction;
					};
				});
				return request;
			},
		} as IDBFactory,
	};
	return watched;
};

/** The handlers storage sets on a request to open the database. */
type OpenRequestStub = {
	result?: unknown;
	error?: unknown;
	onupgradeneeded?: () => void;
	onblocked?: () => void;
	onerror?: () => void;
	onsuccess?: () => void;
};

/** An IndexedDB whose one request to open is settled by the test. */
const stubFactory = (request: OpenRequestStub): IDBFactory =>
	({ open: () => request }) as unknown as IDBFactory;

/** An IndexedDB that hands out the given requests to open, one per call. */
const stubFactoryOf = (requests: OpenRequestStub[]): IDBFactory => {
	let next = 0;
	return { open: () => requests[next++] } as unknown as IDBFactory;
};

/** The handlers storage sets on a transaction. */
type TransactionStub = {
	error?: unknown;
	oncomplete?: () => void;
	onerror?: () => void;
	onabort?: () => void;
	objectStore(): { put(): { error?: unknown }; get(): { error?: unknown } };
	commit(): void;
};

/** A database that hands out one transaction and counts being closed. */
type DatabaseStub = {
	closed: number;
	transaction(): TransactionStub;
	close(): void;
};

const stubDatabase = (transaction: () => TransactionStub): DatabaseStub => {
	const database: DatabaseStub = {
		closed: 0,
		transaction,
		close: () => {
			database.closed++;
		},
	};
	return database;
};

/** An IndexedDB that opens at once on a database made by hand. */
const factoryOpening = (database: DatabaseStub): IDBFactory => {
	const request: OpenRequestStub = { result: database };
	queueMicrotask(() => request.onsuccess?.());
	return stubFactory(request);
};

/** Lets every promise that is already settled run its reactions. */
const settle = async (): Promise<void> => {
	for (let turn = 0; turn < 10; turn++) {
		await Promise.resolve();
	}
};

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('loadCurrent', () => {
	it('finds nothing when nothing has been saved', async () => {
		const factory = new FakeIDBFactory();
		expect(await loadCurrent(factory)).toEqual({ kind: 'empty' });
		// Looking made the database, and put nothing in it.
		expect(await readAll(factory)).toEqual(new Map());
		expect(await loadCurrent(factory)).toEqual({ kind: 'empty' });
	});

	it.each(SUPPORTED_RESOLUTIONS)(
		'brings back the world that was saved at %i',
		async (resolution) => {
			const factory = new FakeIDBFactory();
			const world = sculptedWorld(resolution);
			await saveCurrent(world, factory);
			const outcome = await loadCurrent(factory);
			if (outcome.kind !== 'world') {
				throw new Error(`Expected a world, got ${outcome.kind}`);
			}
			expect(outcome.world.resolution).toBe(resolution);
			expect(outcome.world.seaLevel).toBe(-250);
			expect(outcome.world.origin).toEqual(world.origin);
			expect(sameWorld(outcome.world, world)).toBe(true);
			expect(outcome.world.elevation).not.toBe(world.elevation);
		},
	);

	it('brings back a blank ocean', async () => {
		const factory = new FakeIDBFactory();
		const world = createBlankWorld(128);
		await saveCurrent(world, factory);
		expect(await loadCurrent(factory)).toEqual({ kind: 'world', world });
	});

	it('gives a world of its own each time', async () => {
		const factory = new FakeIDBFactory();
		await saveCurrent(sculptedWorld(64), factory);
		const first = await loadCurrent(factory);
		const second = await loadCurrent(factory);
		if (first.kind !== 'world' || second.kind !== 'world') {
			throw new Error('Expected two worlds');
		}
		first.world.elevation.fill(0);
		expect(second.world.elevation[1]).toBe(11_999.5);
	});

	it('reports a stored value that is not bytes, and does not load it', async () => {
		for (const value of [
			'EARTHSIM',
			42,
			null,
			{ resolution: 64 },
			[1, 2, 3],
			createBlankWorld(64),
			serializeWorld(createBlankWorld(64)).buffer,
			new Float32Array(8),
			new Blob(['EARTHSIM']),
		]) {
			const factory = new FakeIDBFactory();
			await putRaw(factory, value);
			expect(await loadCurrent(factory)).toEqual({
				kind: 'corrupt',
				reason: 'not-bytes',
			});
		}
	});

	it('reports stored bytes that are not a world, with the reason', async () => {
		const good = serializeWorld(sculptedWorld(64));
		const newer = good.slice();
		newer[8] = 2;
		const notFinite = good.slice();
		notFinite.fill(0xff, good.length - 4);
		const cases = [
			[new Uint8Array(0), 'truncated'],
			[Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9), 'bad-marker'],
			[good.slice(0, good.length - 1), 'truncated'],
			[newer, 'unknown-version'],
			[notFinite, 'not-finite'],
		] as const;
		for (const [bytes, reason] of cases) {
			const factory = new FakeIDBFactory();
			await putRaw(factory, bytes);
			expect(await loadCurrent(factory)).toEqual({ kind: 'corrupt', reason });
			// What could not be read is left where it was.
			expect((await readAll(factory)).get(SAVE_KEY)).toEqual(bytes);
		}
	});

	it('closes its connection whatever it finds', async () => {
		const watched = watch(new FakeIDBFactory());
		await loadCurrent(watched.factory);
		await putRaw(watched.factory, 'not bytes');
		await loadCurrent(watched.factory);
		await saveCurrent(createBlankWorld(64), watched.factory);
		await loadCurrent(watched.factory);
		// The test's own write and the save each opened and closed one too.
		expect(watched.opened).toBe(5);
		expect(watched.closed).toBe(5);
	});
});

describe('saveCurrent', () => {
	it('stores the bytes of the world file under the one key', async () => {
		const factory = new FakeIDBFactory();
		const world = sculptedWorld(64);
		await saveCurrent(world, factory);
		const stored = await readAll(factory);
		expect([...stored.keys()]).toEqual([SAVE_KEY]);
		const bytes = stored.get(SAVE_KEY);
		expect(bytes).toBeInstanceOf(Uint8Array);
		expect(bytes).toEqual(serializeWorld(world));
	});

	it('overwrites what was saved before, so the last save wins', async () => {
		const factory = new FakeIDBFactory();
		await saveCurrent(sculptedWorld(128), factory);
		const last = createBlankWorld(64);
		last.seaLevel = normaliseSeaLevel(900);
		await saveCurrent(last, factory);

		expect((await readAll(factory)).size).toBe(1);
		expect(await loadCurrent(factory)).toEqual({ kind: 'world', world: last });
	});

	it('overwrites a stored value that could not be read', async () => {
		const factory = new FakeIDBFactory();
		await putRaw(factory, 'garbage');
		const world = createBlankWorld(64);
		await saveCurrent(world, factory);
		expect(await loadCurrent(factory)).toEqual({ kind: 'world', world });
	});

	it('saves the world as it was when asked, whatever is done to it meanwhile', async () => {
		const factory = new FakeIDBFactory();
		const world = createBlankWorld(64);
		const before = world.elevation.slice();
		const saving = saveCurrent(world, factory);
		world.elevation.fill(1234);
		world.seaLevel = normaliseSeaLevel(500);
		await saving;

		const outcome = await loadCurrent(factory);
		if (outcome.kind !== 'world') {
			throw new Error(`Expected a world, got ${outcome.kind}`);
		}
		expect(outcome.world.elevation).toEqual(before);
		expect(outcome.world.seaLevel).toBe(0);
	});

	it('leaves the world as it was and closes its connection', async () => {
		const watched = watch(new FakeIDBFactory());
		const world = sculptedWorld(64);
		const copy = structuredClone(world);
		await saveCurrent(world, watched.factory);
		expect(world).toEqual(copy);
		expect(watched.opened).toBe(1);
		expect(watched.closed).toBe(1);
	});

	it('rejects for a world that cannot be written out, storing nothing', async () => {
		const factory = new FakeIDBFactory();
		const world: World = { ...createBlankWorld(64), seaLevel: Number.NaN };
		await expect(saveCurrent(world, factory)).rejects.toThrow(RangeError);
		expect(await loadCurrent(factory)).toEqual({ kind: 'empty' });
	});

	it('keeps separate storages apart', async () => {
		const first = new FakeIDBFactory();
		const second = new FakeIDBFactory();
		await saveCurrent(createBlankWorld(64), first);
		expect(await loadCurrent(second)).toEqual({ kind: 'empty' });
	});
});

describe('storage that does not work', () => {
	it('rejects, and does not throw, when there is no IndexedDB at all', async () => {
		expect(globalThis.indexedDB).toBeUndefined();
		let saving: Promise<void> | undefined;
		expect(() => {
			saving = saveCurrent(createBlankWorld(64));
		}).not.toThrow();
		await expect(saving).rejects.toThrow('IndexedDB is not available');
		await expect(loadCurrent()).rejects.toThrow('IndexedDB is not available');
	});

	it('uses the browser’s IndexedDB when given none', async () => {
		const factory = new FakeIDBFactory();
		vi.stubGlobal('indexedDB', factory);
		const world = createBlankWorld(64);
		await saveCurrent(world);
		expect(await loadCurrent()).toEqual({ kind: 'world', world });
		expect((await readAll(factory)).size).toBe(1);
	});

	it('rejects when even reading the browser’s IndexedDB is forbidden', async () => {
		const denied = new Error('The operation is insecure');
		Object.defineProperty(globalThis, 'indexedDB', {
			configurable: true,
			get: () => {
				throw denied;
			},
		});
		try {
			let loading: Promise<unknown> | undefined;
			expect(() => {
				loading = loadCurrent();
			}).not.toThrow();
			await expect(loading).rejects.toBe(denied);
			await expect(saveCurrent(createBlankWorld(64))).rejects.toBe(denied);
		} finally {
			Reflect.deleteProperty(globalThis, 'indexedDB');
		}
	});

	it('rejects when opening the database throws', async () => {
		const denied = new Error('storage is forbidden');
		const factory = {
			open: () => {
				throw denied;
			},
		} as unknown as IDBFactory;
		let saving: Promise<void> | undefined;
		expect(() => {
			saving = saveCurrent(createBlankWorld(64), factory);
		}).not.toThrow();
		await expect(saving).rejects.toBe(denied);
		await expect(loadCurrent(factory)).rejects.toBe(denied);
	});

	it('rejects when opening the database fails', async () => {
		const request: OpenRequestStub = {};
		const loading = loadCurrent(stubFactory(request));
		request.error = new Error('the disk is failing');
		request.onerror?.();
		await expect(loading).rejects.toBe(request.error);
	});

	it('rejects when the database was made by a later layout', async () => {
		const factory = new FakeIDBFactory();
		const later = await settled(
			factory.open(SAVE_DATABASE_NAME, SAVE_DATABASE_VERSION + 1),
		);
		later.close();
		await expect(loadCurrent(factory)).rejects.toMatchObject({
			name: 'VersionError',
		});
		await expect(
			saveCurrent(createBlankWorld(64), factory),
		).rejects.toMatchObject({ name: 'VersionError' });
	});

	it('rejects when the database is held open elsewhere, and closes a connection that comes too late', async () => {
		const request: OpenRequestStub = {};
		const saving = saveCurrent(createBlankWorld(64), stubFactory(request));
		request.onblocked?.();
		await expect(saving).rejects.toThrow('held open elsewhere');

		const late = stubDatabase(() => {
			throw new Error('nothing should be asked of a late connection');
		});
		request.result = late;
		request.onsuccess?.();
		await settle();
		expect(late.closed).toBe(1);
	});

	it('rejects and closes its connection when the store is missing', async () => {
		const real = new FakeIDBFactory();
		// The database at the right version, made without its store.
		(
			await settled(real.open(SAVE_DATABASE_NAME, SAVE_DATABASE_VERSION))
		).close();
		const watched = watch(real);
		await expect(loadCurrent(watched.factory)).rejects.toMatchObject({
			name: 'NotFoundError',
		});
		await expect(
			saveCurrent(createBlankWorld(64), watched.factory),
		).rejects.toMatchObject({ name: 'NotFoundError' });
		expect(watched.opened).toBe(2);
		expect(watched.closed).toBe(2);
	});

	it('rejects and closes its connection when the transaction is aborted', async () => {
		const transaction: TransactionStub = {
			objectStore: () => ({ put: () => ({}), get: () => ({}) }),
			commit: () => {},
		};
		const database = stubDatabase(() => transaction);
		const saving = saveCurrent(createBlankWorld(64), factoryOpening(database));
		await settle();
		expect(database.closed).toBe(0);
		transaction.error = new Error('no room left');
		transaction.onabort?.();
		await expect(saving).rejects.toBe(transaction.error);
		expect(database.closed).toBe(1);
	});

	it('rejects and closes its connection when the request fails', async () => {
		const failure = new Error('the value could not be read');
		const transaction: TransactionStub = {
			objectStore: () => ({
				put: () => ({ error: failure }),
				get: () => ({ error: failure }),
			}),
			commit: () => {},
		};
		const database = stubDatabase(() => transaction);
		const loading = loadCurrent(factoryOpening(database));
		await settle();
		transaction.onerror?.();
		// The abort that follows a failed request changes nothing.
		transaction.error = new Error('aborted');
		transaction.onabort?.();
		await expect(loading).rejects.toBe(failure);
		expect(database.closed).toBe(1);
	});
});

describe('openWorldStore', () => {
	it('opens nothing until it is used, and then keeps one connection', async () => {
		const watched = watch(new FakeIDBFactory());
		const store = openWorldStore(watched.factory);
		await settle();
		expect(watched.asked).toEqual([]);

		const world = sculptedWorld(64);
		expect(await store.load()).toEqual({ kind: 'empty' });
		await store.save(world);
		await store.save(world);
		const outcome = await store.load();
		expect(outcome.kind === 'world' && sameWorld(outcome.world, world)).toBe(
			true,
		);
		expect(watched.opened).toBe(1);
		expect(watched.closed).toBe(0);
		store.close();
	});

	it('hands a save to the open connection, and commits it, before it returns', async () => {
		const watched = watch(new FakeIDBFactory());
		const store = openWorldStore(watched.factory);
		await store.load();
		watched.asked.length = 0;

		const world = sculptedWorld(64);
		const saving = store.save(world);
		expect(watched.asked).toEqual(['transaction', 'put', 'commit']);
		await saving;
		expect(await store.load()).toEqual({ kind: 'world', world });
		store.close();
	});

	it('has to open a connection first when it has none', async () => {
		const watched = watch(new FakeIDBFactory());
		const store = openWorldStore(watched.factory);
		const world = createBlankWorld(64);
		const saving = store.save(world);
		expect(watched.asked).toEqual(['open']);
		await saving;
		expect(watched.asked).toEqual(['open', 'transaction', 'put', 'commit']);
		store.close();
	});

	it('leaves the later of two overlapping saves stored', async () => {
		const watched = watch(new FakeIDBFactory());
		const store = openWorldStore(watched.factory);
		const first = sculptedWorld(64);
		const second = createBlankWorld(128);

		// Before there is a connection: both wait for the one being opened.
		await Promise.all([store.save(first), store.save(second)]);
		expect(watched.opened).toBe(1);
		expect(await store.load()).toEqual({ kind: 'world', world: second });

		// And on the open connection.
		await Promise.all([store.save(second), store.save(first)]);
		const outcome = await store.load();
		expect(outcome.kind === 'world' && sameWorld(outcome.world, first)).toBe(
			true,
		);
		expect(watched.opened).toBe(1);
		store.close();
	});

	it('closes its connection when asked, and opens another when next used', async () => {
		const watched = watch(new FakeIDBFactory());
		const store = openWorldStore(watched.factory);
		const world = createBlankWorld(64);
		await store.save(world);
		store.close();
		expect(watched.closed).toBe(1);
		// Closing again finds nothing to close.
		store.close();
		expect(watched.closed).toBe(1);

		expect(await store.load()).toEqual({ kind: 'world', world });
		expect(watched.opened).toBe(2);
		store.close();
		expect(watched.closed).toBe(2);
	});

	it('lets go when another page needs the database to itself, and reopens for the next save', async () => {
		const real = new FakeIDBFactory();
		const watched = watch(real);
		const store = openWorldStore(watched.factory);
		await store.save(sculptedWorld(64));

		// Deleting waits for every connection to be closed.
		await settled(real.deleteDatabase(SAVE_DATABASE_NAME));
		expect(watched.closed).toBe(1);

		const world = createBlankWorld(64);
		await store.save(world);
		expect(watched.opened).toBe(2);
		expect(await store.load()).toEqual({ kind: 'world', world });
		expect(watched.opened).toBe(2);
		store.close();
	});

	it('reopens for the next save when the browser has closed the connection', async () => {
		const watched = watch(new FakeIDBFactory());
		const store = openWorldStore(watched.factory);
		await store.load();
		const database = watched.databases[0];
		database?.close();
		database?.onclose?.(new Event('close'));
		watched.asked.length = 0;

		const world = createBlankWorld(64);
		await store.save(world);
		expect(watched.asked).toEqual(['open', 'transaction', 'put', 'commit']);
		expect(await store.load()).toEqual({ kind: 'world', world });
		store.close();
	});

	it('takes no notice of an old connection being closed once it has another', async () => {
		const watched = watch(new FakeIDBFactory());
		const store = openWorldStore(watched.factory);
		await store.load();
		store.close();
		await store.load();
		const [old, current] = watched.databases;
		old?.onclose?.(new Event('close'));
		old?.onversionchange?.(new Event('versionchange') as IDBVersionChangeEvent);
		watched.asked.length = 0;

		await store.save(createBlankWorld(64));
		expect(watched.asked).toEqual(['transaction', 'put', 'commit']);
		expect(watched.databases).toEqual([old, current]);
		store.close();
	});

	it('rejects a save on a connection that has died unannounced, and reopens for the next', async () => {
		const watched = watch(new FakeIDBFactory());
		const store = openWorldStore(watched.factory);
		await store.load();
		watched.databases[0]?.close();

		const world = createBlankWorld(64);
		let saving: Promise<void> | undefined;
		expect(() => {
			saving = store.save(world);
		}).not.toThrow();
		await expect(saving).rejects.toMatchObject({ name: 'InvalidStateError' });

		await store.save(world);
		expect(watched.opened).toBe(2);
		expect(await store.load()).toEqual({ kind: 'world', world });
		store.close();
	});

	it('keeps its connection through a save that fails, and uses it for the next', async () => {
		const transactions: TransactionStub[] = [];
		const database = stubDatabase(() => {
			const transaction: TransactionStub = {
				objectStore: () => ({ put: () => ({}), get: () => ({}) }),
				commit: () => {},
			};
			transactions.push(transaction);
			return transaction;
		});
		const store = openWorldStore(factoryOpening(database));
		const world = createBlankWorld(64);
		const failing = store.save(world);
		await settle();
		const [first] = transactions;
		if (first === undefined) {
			throw new Error('Expected a transaction');
		}
		first.error = new Error('no room left');
		first.onabort?.();
		await expect(failing).rejects.toBe(first.error);
		expect(database.closed).toBe(0);

		// The next save is on its way before `save` returns.
		const saving = store.save(world);
		expect(transactions).toHaveLength(2);
		transactions[1]?.oncomplete?.();
		await expect(saving).resolves.toBeUndefined();
		expect(database.closed).toBe(0);
	});

	it('closes a connection that arrives after the store was closed, and fails what waited for it', async () => {
		const late = stubDatabase(() => {
			throw new Error('nothing should be asked of a late connection');
		});
		const first: OpenRequestStub = {};
		const transaction: TransactionStub = {
			objectStore: () => ({ put: () => ({}), get: () => ({}) }),
			commit: () => {},
		};
		const second: OpenRequestStub = {
			result: stubDatabase(() => transaction),
		};
		const store = openWorldStore(stubFactoryOf([first, second]));

		const loading = store.load();
		await settle();
		store.close();
		// What is asked after the close opens a connection of its own.
		const saving = store.save(createBlankWorld(64));
		await settle();

		first.result = late;
		first.onsuccess?.();
		await expect(loading).rejects.toThrow('closed while opening');
		expect(late.closed).toBe(1);

		second.onsuccess?.();
		await settle();
		transaction.oncomplete?.();
		await expect(saving).resolves.toBeUndefined();
	});

	it('leaves the connection being opened alone when one given up before it fails', async () => {
		const first: OpenRequestStub = {};
		const transactions: TransactionStub[] = [];
		const second: OpenRequestStub = {
			result: stubDatabase(() => {
				const transaction: TransactionStub = {
					objectStore: () => ({ put: () => ({}), get: () => ({}) }),
					commit: () => {},
				};
				transactions.push(transaction);
				return transaction;
			}),
		};
		const third: OpenRequestStub = {};
		const store = openWorldStore(stubFactoryOf([first, second, third]));

		const loading = store.load();
		await settle();
		store.close();
		const saving = store.save(createBlankWorld(64));
		await settle();
		first.error = new Error('the disk is failing');
		first.onerror?.();
		await expect(loading).rejects.toBe(first.error);

		// Still waiting for the second connection, not asking for a third.
		const again = store.save(createBlankWorld(64));
		await settle();
		expect(third.onsuccess).toBeUndefined();
		second.onsuccess?.();
		await settle();
		expect(transactions).toHaveLength(2);
		for (const transaction of transactions) {
			transaction.oncomplete?.();
		}
		await expect(saving).resolves.toBeUndefined();
		await expect(again).resolves.toBeUndefined();
	});

	it('tries to open again after failing to', async () => {
		const first: OpenRequestStub = {};
		const transaction: TransactionStub = {
			objectStore: () => ({ put: () => ({}), get: () => ({}) }),
			commit: () => {},
		};
		const second: OpenRequestStub = {
			result: stubDatabase(() => transaction),
		};
		const store = openWorldStore(stubFactoryOf([first, second]));

		const failing = store.save(createBlankWorld(64));
		await settle();
		first.error = new Error('the disk is failing');
		first.onerror?.();
		await expect(failing).rejects.toBe(first.error);

		const saving = store.save(createBlankWorld(64));
		await settle();
		second.onsuccess?.();
		await settle();
		transaction.oncomplete?.();
		await expect(saving).resolves.toBeUndefined();
	});
});

describe('exportWorldFile', () => {
	it('names the file world.earthsim', () => {
		expect(WORLD_FILE_NAME).toBe('world.earthsim');
		expect(WORLD_FILE_NAME.endsWith(WORLD_FILE_EXTENSION)).toBe(true);
	});

	it('hands over a file holding the world, under the name', async () => {
		const world = sculptedWorld(64);
		const downloads: { blob: Blob; name: string }[] = [];
		exportWorldFile(world, (blob, name) => downloads.push({ blob, name }));

		expect(downloads).toHaveLength(1);
		const [download] = downloads;
		expect(download?.name).toBe('world.earthsim');
		expect(download?.blob.type).toBe('application/octet-stream');
		const bytes = new Uint8Array(
			(await download?.blob.arrayBuffer()) ?? new ArrayBuffer(0),
		);
		expect(bytes).toEqual(serializeWorld(world));
		const read = deserializeWorld(bytes);
		expect(read.ok && sameWorld(read.world, world)).toBe(true);
	});

	it('throws for a world that cannot be written out, handing nothing over', () => {
		const world: World = { ...createBlankWorld(64), seaLevel: Number.NaN };
		const downloads: Blob[] = [];
		expect(() =>
			exportWorldFile(world, (blob) => downloads.push(blob)),
		).toThrow(RangeError);
		expect(downloads).toEqual([]);
	});

	it('downloads through the page when given no other way', () => {
		vi.useFakeTimers();
		const clicked: string[] = [];
		const link = {
			href: '',
			download: '',
			click: () => clicked.push(link.download),
			remove: () => {},
		};
		vi.stubGlobal('document', {
			createElement: () => link,
			body: { append: () => {} },
		});
		exportWorldFile(createBlankWorld(64));
		expect(clicked).toEqual(['world.earthsim']);
		expect(link.href.startsWith('blob:')).toBe(true);
	});
});

describe('downloadBlob', () => {
	it('clicks a link to the file while it is on the page, then gives the address up', () => {
		vi.useFakeTimers();
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		const onPage: unknown[] = [];
		const created: string[] = [];
		const clicks: { href: string; download: string; onPage: boolean }[] = [];
		const link = {
			href: '',
			download: '',
			hidden: false,
			click: () =>
				clicks.push({
					href: link.href,
					download: link.download,
					onPage: onPage.includes(link),
				}),
			remove: () => {
				onPage.splice(onPage.indexOf(link), 1);
			},
		};
		vi.stubGlobal('document', {
			createElement: (tag: string) => {
				created.push(tag);
				return link;
			},
			body: { append: (element: unknown) => onPage.push(element) },
		});

		downloadBlob(new Blob(['abc']), 'name.bin');

		expect(created).toEqual(['a']);
		expect(clicks).toHaveLength(1);
		expect(clicks[0]?.href.startsWith('blob:')).toBe(true);
		expect(clicks[0]?.download).toBe('name.bin');
		expect(clicks[0]?.onPage).toBe(true);
		expect(link.hidden).toBe(true);
		expect(onPage).toEqual([]);

		vi.advanceTimersByTime(DOWNLOAD_URL_LIFETIME_MS - 1);
		expect(revoke).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(revoke).toHaveBeenCalledTimes(1);
		expect(revoke).toHaveBeenCalledWith(clicks[0]?.href);
	});
});

describe('importWorldFile', () => {
	it('reads back a file that was exported', async () => {
		const world = sculptedWorld(64);
		const files: Blob[] = [];
		exportWorldFile(world, (blob) => files.push(blob));
		const result = await importWorldFile(files[0] as Blob);
		expect(result.ok && sameWorld(result.world, world)).toBe(true);
	});

	it.each(SUPPORTED_RESOLUTIONS)(
		'reads a world file at %i',
		async (resolution) => {
			const world = sculptedWorld(resolution);
			const result = await importWorldFile(new Blob([serializeWorld(world)]));
			expect(result.ok && sameWorld(result.world, world)).toBe(true);
		},
	);

	it('gives the reason a file is not a world', async () => {
		const good = serializeWorld(createBlankWorld(64));
		const cases = [
			[new Blob([]), 'truncated'],
			[new Blob(['just some text, nothing like a world']), 'bad-marker'],
			[new Blob([Uint8Array.of(0x89, 0x50, 0x4e, 0x47)]), 'bad-marker'],
			[new Blob([good.slice(0, 5000)]), 'truncated'],
			[new Blob([good, Uint8Array.of(0)]), 'bad-length'],
		] as const;
		for (const [file, error] of cases) {
			expect(await importWorldFile(file)).toEqual({ ok: false, error });
		}
	});

	it('reads the largest world file there can be', async () => {
		const world = sculptedWorld(256);
		const file = serializeWorld(world);
		const view = new DataView(file.buffer);
		const headerLength = view.getUint32(12, true);
		const dataOffset = WORLD_FILE_PREFIX_BYTES + headerLength;
		const largest = new Uint8Array(MAX_WORLD_FILE_BYTES).fill(0x20);
		largest.set(file.subarray(0, dataOffset));
		new DataView(largest.buffer).setUint32(
			12,
			MAX_WORLD_FILE_HEADER_BYTES,
			true,
		);
		largest.set(
			file.subarray(dataOffset),
			WORLD_FILE_PREFIX_BYTES + MAX_WORLD_FILE_HEADER_BYTES,
		);
		const result = await importWorldFile(new Blob([largest]));
		expect(result.ok && sameWorld(result.world, world)).toBe(true);
	});

	it('refuses a file too long to be a world from its first bytes alone', async () => {
		const good = serializeWorld(createBlankWorld(64));
		const newer = good.slice(0, 16);
		newer[8] = 2;
		const padding = new Uint8Array(MAX_WORLD_FILE_BYTES);
		const cases = [
			[
				new Blob([Uint8Array.of(0x89, 0x50, 0x4e, 0x47), padding]),
				'bad-marker',
			],
			[new Blob([padding, Uint8Array.of(0)]), 'bad-marker'],
			[new Blob([newer, padding]), 'unknown-version'],
			[new Blob([good, padding]), 'bad-length'],
			[new Blob([good.slice(0, 16), padding]), 'bad-length'],
		] as const;
		for (const [file, error] of cases) {
			expect(file.size).toBeGreaterThan(MAX_WORLD_FILE_BYTES);
			const whole = vi.spyOn(file, 'arrayBuffer');
			const slice = vi.spyOn(file, 'slice');
			expect(await importWorldFile(file)).toEqual({ ok: false, error });
			expect(whole).not.toHaveBeenCalled();
			expect(slice.mock.calls).toEqual([[0, 16]]);
		}
	});

	it('rejects when the file cannot be read', async () => {
		const failure = new Error('the file has gone');
		const file = {
			size: 100,
			arrayBuffer: () => Promise.reject(failure),
		} as unknown as Blob;
		await expect(importWorldFile(file)).rejects.toBe(failure);
	});
});
