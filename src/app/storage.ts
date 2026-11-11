/**
 * Keeping the world outside the page: one slot in the browser's IndexedDB
 * that holds the world as it was last saved, and world files that are
 * downloaded and read back.
 *
 * Both hold the same bytes, those of the core's world file. Whatever is
 * read back, from the slot or from a file, is checked from scratch by the
 * core before it is taken for a world.
 */

import {
	deserializeWorld,
	MAX_WORLD_FILE_BYTES,
	serializeWorld,
	WORLD_FILE_PREFIX_BYTES,
	type World,
	type WorldFileError,
	type WorldFileResult,
} from '../core/index';

/** The name an exported world is downloaded under. */
export const WORLD_FILE_NAME = 'world.earthsim';

/** The ending of a world file's name, as a file chooser filters on it. */
export const WORLD_FILE_EXTENSION = '.earthsim';

/** The IndexedDB database the world is saved in. */
export const SAVE_DATABASE_NAME = 'earth_sim';

/** The version of the database's layout: one object store. */
export const SAVE_DATABASE_VERSION = 1;

/** The object store that holds the saved world. */
export const SAVE_STORE_NAME = 'worlds';

/** The key of the one saved world, which every save overwrites. */
export const SAVE_KEY = 'current';

/**
 * How long the address of a download is kept alive, in milliseconds. The
 * browser reads the file from it some time after the click, so it cannot be
 * given up at once; by now the largest world has long been handed over.
 */
export const DOWNLOAD_URL_LIFETIME_MS = 30_000;

/** What reading the saved world gives, when the storage itself works. */
export type LoadOutcome =
	| {
			/** Nothing has been saved. */
			readonly kind: 'empty';
	  }
	| {
			/** The world that was saved, with an elevation array of its own. */
			readonly kind: 'world';
			readonly world: World;
	  }
	| {
			/** Something is saved that cannot be read as a world. */
			readonly kind: 'corrupt';
			/**
			 * Why not: what is saved is not bytes at all, or the reason the
			 * core gives for refusing the bytes.
			 */
			readonly reason: 'not-bytes' | WorldFileError;
	  };

/** Hands a file to the person using the page, under a name. */
export type Download = (blob: Blob, name: string) => void;

/**
 * Opens the database, making its object store the first time.
 *
 * @param storage - The IndexedDB to use; the browser's own when left out.
 * @returns The open database, for the caller to close. The promise rejects
 * if there is no IndexedDB, if opening it throws or fails, or if another
 * page holds the database at an older layout and will not let go.
 */
const openDatabase = (storage: IDBFactory | undefined): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		// Reading the global can itself throw where storage is forbidden;
		// in here that rejects the promise like any other failure.
		const factory: IDBFactory | undefined = storage ?? globalThis.indexedDB;
		if (factory === undefined) {
			throw new Error('IndexedDB is not available here');
		}
		const request = factory.open(SAVE_DATABASE_NAME, SAVE_DATABASE_VERSION);
		let blocked = false;
		request.onupgradeneeded = () => {
			request.result.createObjectStore(SAVE_STORE_NAME);
		};
		request.onblocked = () => {
			blocked = true;
			reject(new Error('The saved-world database is held open elsewhere'));
		};
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			// A blocked request still succeeds once the other page lets go,
			// by which time nobody is waiting for the connection.
			if (blocked) {
				request.result.close();
				return;
			}
			resolve(request.result);
		};
	});

/**
 * The slot the saved world is kept in, on a connection to the database
 * that is opened when first needed and then kept.
 */
export type WorldStore = {
	/**
	 * Saves a world as the one to bring back when the page is next opened,
	 * in place of whatever was saved before.
	 *
	 * @remarks
	 * The world is written out as bytes before this returns, so what is
	 * saved is the world as it was when this was called, whatever is done
	 * to it while the browser stores them.
	 *
	 * With the connection already open, the bytes are also handed to the
	 * browser before this returns, and the browser is told at once that
	 * nothing more is coming. A save made as the page is being closed can
	 * therefore be stored although the page never hears of it, though a
	 * browser may still drop one made in the page's very last moment.
	 * Without a connection one is opened first, which a page being closed
	 * does not live to see.
	 *
	 * Saves may overlap. They are stored in the order they were made, so
	 * the last one made is the one that stays.
	 *
	 * Every page of the site shares the one slot, and the last to save
	 * wins.
	 *
	 * @param world - The world to save. It is not changed.
	 * @returns A promise that resolves once the world is stored. It
	 * rejects, with whatever went wrong, if the world cannot be written
	 * out or the browser has no storage, refuses it or fails. Nothing is
	 * ever thrown from the call itself.
	 */
	save(world: World): Promise<void>;
	/**
	 * Reads the world that was last saved.
	 *
	 * @remarks
	 * What is stored is trusted no more than a file would be: it must be
	 * bytes, and the bytes must pass every check of
	 * {@link deserializeWorld}. Whatever is stored is left as it is,
	 * readable or not.
	 *
	 * @returns A promise of the saved world, of the fact that nothing is
	 * saved, or of the fact that what is saved cannot be read as a world.
	 * It rejects, with whatever went wrong, if the browser has no storage,
	 * refuses it or fails. Nothing is ever thrown from the call itself.
	 */
	load(): Promise<LoadOutcome>;
	/**
	 * Closes the connection, and has one that is still being opened closed
	 * as soon as it is open, failing whatever was waiting for it. The store
	 * can still be used: it opens another connection when next asked.
	 */
	close(): void;
};

/**
 * Makes the store the saved world is kept in. Nothing is opened yet.
 *
 * @remarks
 * The connection is kept so that a save can be handed to the browser from
 * inside the event that says the page is going. It is given up, for the
 * next save or read to open another, when another page needs the database
 * to itself, when the browser closes it, and when it turns out not to
 * work. A save or a read that merely fails, as a save does when there is
 * no room left, leaves it open.
 *
 * @param storage - The IndexedDB to keep the world in; the browser's own
 * when left out. A browser with none, or one that forbids it, shows only
 * when the store is used.
 * @returns The store.
 */
export const openWorldStore = (storage?: IDBFactory): WorldStore => {
	let connection: IDBDatabase | null = null;
	let opening: Promise<IDBDatabase> | null = null;
	/** How many times the store has been closed. */
	let closes = 0;

	const forget = (database: IDBDatabase): void => {
		if (connection === database) {
			connection = null;
		}
	};

	const connect = (): Promise<IDBDatabase> => {
		if (opening !== null) {
			return opening;
		}
		const closesBefore = closes;
		const mine = openDatabase(storage).then(
			(database) => {
				if (closes !== closesBefore) {
					database.close();
					throw new Error('The saved-world store was closed while opening');
				}
				opening = null;
				// Another page wants to change the database's layout or to
				// delete it, and waits for as long as this one holds on.
				database.onversionchange = () => {
					database.close();
					forget(database);
				};
				// The browser has closed the connection itself, as it does
				// when the site's data is cleared.
				database.onclose = () => forget(database);
				connection = database;
				return database;
			},
			(error: unknown) => {
				// After a close, what is being opened now is another
				// connection, not this one.
				if (closes === closesBefore) {
					opening = null;
				}
				throw error;
			},
		);
		opening = mine;
		return mine;
	};

	/**
	 * Makes one request of the object store, in a transaction of its own.
	 * The request is made before this returns.
	 */
	const ask = <T>(
		database: IDBDatabase,
		mode: IDBTransactionMode,
		make: (store: IDBObjectStore) => IDBRequest<T>,
	): Promise<T> =>
		new Promise((resolve, reject) => {
			let transaction: IDBTransaction;
			let request: IDBRequest<T>;
			try {
				transaction = database.transaction(SAVE_STORE_NAME, mode);
				request = make(transaction.objectStore(SAVE_STORE_NAME));
			} catch (error) {
				// The connection has been closed, or the database lacks its
				// store: either way this one is of no more use.
				database.close();
				forget(database);
				reject(error);
				return;
			}
			transaction.oncomplete = () => resolve(request.result);
			transaction.onerror = () => reject(request.error);
			transaction.onabort = () => reject(transaction.error);
			if (mode === 'readwrite') {
				// Otherwise the browser waits to tell the page how the
				// request went before it commits, and gives the transaction
				// up if the page has gone by then.
				transaction.commit();
			}
		});

	const requestOfStore = <T>(
		mode: IDBTransactionMode,
		make: (store: IDBObjectStore) => IDBRequest<T>,
	): Promise<T> =>
		connection === null
			? connect().then((database) => ask(database, mode, make))
			: ask(connection, mode, make);

	return {
		// Not an async function, which would be free to put the request
		// off until after it had returned.
		save: (world) => {
			let bytes: Uint8Array;
			try {
				bytes = serializeWorld(world);
			} catch (error) {
				return Promise.reject(error);
			}
			return requestOfStore('readwrite', (store) =>
				store.put(bytes, SAVE_KEY),
			).then(() => {});
		},
		load: async () => {
			const stored: unknown = await requestOfStore('readonly', (store) =>
				store.get(SAVE_KEY),
			);
			if (stored === undefined) {
				return { kind: 'empty' };
			}
			if (!(stored instanceof Uint8Array)) {
				return { kind: 'corrupt', reason: 'not-bytes' };
			}
			const result = deserializeWorld(stored);
			return result.ok
				? { kind: 'world', world: result.world }
				: { kind: 'corrupt', reason: result.error };
		},
		close: () => {
			closes++;
			opening = null;
			connection?.close();
			connection = null;
		},
	};
};

/**
 * Saves a world as {@link WorldStore.save} does, on a connection opened
 * for the one save and closed after it.
 *
 * @param world - The world to save. It is not changed.
 * @param storage - The IndexedDB to save in; the browser's own when left
 * out.
 * @returns A promise that resolves once the world is stored, and rejects
 * as {@link WorldStore.save} does. Nothing is ever thrown from the call
 * itself.
 */
export const saveCurrent = async (
	world: World,
	storage?: IDBFactory,
): Promise<void> => {
	const store = openWorldStore(storage);
	try {
		await store.save(world);
	} finally {
		store.close();
	}
};

/**
 * Reads the world that was last saved as {@link WorldStore.load} does, on
 * a connection opened for the one read and closed after it.
 *
 * @param storage - The IndexedDB to read; the browser's own when left out.
 * @returns A promise of what {@link WorldStore.load} gives, which rejects
 * as it does. Nothing is ever thrown from the call itself.
 */
export const loadCurrent = async (
	storage?: IDBFactory,
): Promise<LoadOutcome> => {
	const store = openWorldStore(storage);
	try {
		return await store.load();
	} finally {
		store.close();
	}
};

/**
 * Has the browser download a file, as a link with a `download` name does
 * when it is clicked.
 *
 * @remarks
 * The file is reached through a temporary address, which is given up after
 * {@link DOWNLOAD_URL_LIFETIME_MS}. The link is on the page only for the
 * click.
 *
 * @param blob - What the file holds.
 * @param name - The name to save it under.
 */
export const downloadBlob: Download = (blob, name) => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
};

/**
 * Downloads a world as a world file named {@link WORLD_FILE_NAME}.
 *
 * @param world - The world to export, as it is now. It is not changed.
 * @param download - Hands the file over; the browser's download when left
 * out.
 * @throws RangeError if the world cannot be written out: see
 * {@link serializeWorld}.
 */
export const exportWorldFile = (
	world: World,
	download: Download = downloadBlob,
): void => {
	download(
		new Blob([serializeWorld(world)], { type: 'application/octet-stream' }),
		WORLD_FILE_NAME,
	);
};

/** The bytes a file holds. */
const bytesOf = async (file: Blob): Promise<Uint8Array> =>
	new Uint8Array(await file.arrayBuffer());

/**
 * Reads a file as a world, trusting nothing about it.
 *
 * @remarks
 * A file longer than the largest world file there can be is refused from
 * its first few bytes, without the rest being read: as `bad-marker` or
 * `unknown-version` if they say so, and otherwise as `bad-length`.
 *
 * Nothing but the file is touched: the caller decides what to do with the
 * world, and has nothing to undo when there is none.
 *
 * @param file - The file that was chosen: any file at all.
 * @returns A promise of the world, or of the reason the core gives for
 * there being none. It rejects only if the browser cannot read the file.
 */
export const importWorldFile = async (file: Blob): Promise<WorldFileResult> => {
	if (file.size <= MAX_WORLD_FILE_BYTES) {
		return deserializeWorld(await bytesOf(file));
	}
	const start = deserializeWorld(
		await bytesOf(file.slice(0, WORLD_FILE_PREFIX_BYTES)),
	);
	return !start.ok &&
		(start.error === 'bad-marker' || start.error === 'unknown-version')
		? start
		: { ok: false, error: 'bad-length' };
};
