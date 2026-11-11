/**
 * The page's side of the channel to the simulation worker: sends requests
 * and hands each answer to whoever asked for it.
 *
 * It runs on the main thread and needs only the few members of a worker it
 * uses, so anything shaped like one will do.
 */

import {
	isSimResponse,
	type SimKind,
	type SimRequest,
	type SimResults,
	type World,
} from '../core/index';

/** The events of a worker the client listens for. */
export type WorkerEventType = 'message' | 'error' | 'messageerror';

/** What the client reads from a worker's events. Every DOM event fits. */
export type WorkerEventLike = {
	/** For a `message` event, what the worker posted. */
	readonly data?: unknown;
	/** For an `error` event, what went wrong, where the worker says. */
	readonly message?: unknown;
};

/** The members of a worker the client uses. A DOM `Worker` fits. */
export type WorkerLike = {
	postMessage(message: SimRequest): void;
	addEventListener(
		type: WorkerEventType,
		listener: (event: WorkerEventLike) => void,
	): void;
	removeEventListener(
		type: WorkerEventType,
		listener: (event: WorkerEventLike) => void,
	): void;
	terminate?(): void;
};

/**
 * How a latest-wins request ended, short of failing: with its result, or
 * superseded by a newer request of the same kind before it was answered.
 */
export type LatestOutcome<T> =
	| {
			readonly superseded: false;
			/** What the worker computed. */
			readonly result: T;
	  }
	| { readonly superseded: true };

/** The channel to one simulation worker. */
export type SimClient = {
	/**
	 * Asks the worker for one computation on a world.
	 *
	 * @remarks
	 * The worker is sent a copy of the world as it is now. The caller's
	 * world, elevation array included, stays its own to go on editing, and
	 * later edits do not reach a request already sent.
	 *
	 * @param kind - What to compute.
	 * @param world - The world to compute it for.
	 * @returns The result. Rejects with an `Error` if the worker answers
	 * that it could not compute it, if the worker reports an error before
	 * answering, if the world cannot be sent, or if the client is or
	 * becomes disposed.
	 */
	request<K extends SimKind>(kind: K, world: World): Promise<SimResults[K]>;
	/**
	 * Asks as {@link SimClient.request} does, for a caller who only ever
	 * wants the answer to its newest question of a kind.
	 *
	 * @remarks
	 * Of several calls for one kind that overlap, only the newest gets a
	 * result. Each earlier one resolves, as soon as the next call is made,
	 * to an outcome marked as superseded, and whatever the worker later
	 * answers it is dropped. Being superseded is an outcome and not a
	 * failure, so every call settles and none rejects on that account.
	 * Calls made through `request` are not superseded and supersede
	 * nothing.
	 *
	 * The worker still computes a superseded request: it cannot be told
	 * to stop.
	 *
	 * @param kind - What to compute.
	 * @param world - The world to compute it for.
	 * @returns The result, or that the call was superseded. Rejects as
	 * `request` does.
	 */
	latest<K extends SimKind>(
		kind: K,
		world: World,
	): Promise<LatestOutcome<SimResults[K]>>;
	/**
	 * Stops using the worker: rejects every request not yet answered,
	 * stops listening to the worker and terminates it if it can be.
	 * Requests made afterwards reject. Calling it again does nothing.
	 */
	dispose(): void;
};

/** Whoever is waiting for the answer to one request. */
type Waiter = {
	resolve(result: SimResults[SimKind]): void;
	reject(error: Error): void;
};

/** The newest latest-wins request of a kind. */
type Newest = {
	readonly id: number;
	/** Tells its caller that a newer request has taken its place. */
	supersede(): void;
};

const asError = (thrown: unknown): Error =>
	thrown instanceof Error ? thrown : new Error(String(thrown));

/**
 * Opens the channel to a simulation worker.
 *
 * @remarks
 * Each request is posted with an id of its own, and the response carrying
 * that id settles it, whatever order responses arrive in. A response whose
 * id nobody is waiting on, and a message that is not a response at all,
 * are ignored.
 *
 * Requests are posted without a transfer list, so the worker receives a
 * structured clone of the world. Transferring the elevation buffer instead
 * would avoid the copy but empty the caller's array, which is the terrain
 * being edited.
 *
 * When the worker reports an `error` or a `messageerror` there is no
 * telling which request it belongs to, so every request waiting at that
 * moment rejects. The client carries on: the next request is posted as
 * usual. There is no time limit, so a request to a worker that never
 * answers and never reports an error stays pending; a worker whose script
 * failed to load reports that once, to whatever is waiting then.
 *
 * @param worker - The worker to talk to, already started.
 * @returns The client.
 */
export const createSimClient = (worker: WorkerLike): SimClient => {
	const waiting = new Map<number, Waiter>();
	const newest = new Map<SimKind, Newest>();
	let nextId = 1;
	let disposed = false;

	const rejectAll = (error: Error): void => {
		const waiters = [...waiting.values()];
		waiting.clear();
		for (const waiter of waiters) {
			waiter.reject(error);
		}
	};

	const onMessage = (event: WorkerEventLike): void => {
		const response = event.data;
		if (!isSimResponse(response) || response.id === null) {
			return;
		}
		const waiter = waiting.get(response.id);
		if (waiter === undefined) {
			return;
		}
		waiting.delete(response.id);
		if (response.ok) {
			waiter.resolve(response.result);
		} else {
			waiter.reject(new Error(response.error));
		}
	};
	const onError = (event: WorkerEventLike): void => {
		const detail =
			typeof event.message === 'string' && event.message !== ''
				? `: ${event.message}`
				: '';
		rejectAll(new Error(`The simulation worker reported an error${detail}`));
	};
	const onMessageError = (): void => {
		rejectAll(
			new Error('A message from the simulation worker could not be read'),
		);
	};
	worker.addEventListener('message', onMessage);
	worker.addEventListener('error', onError);
	worker.addEventListener('messageerror', onMessageError);

	/**
	 * Posts a request and registers who waits for its answer.
	 *
	 * @returns The request's id; the waiter has already been rejected if
	 * the request could not be posted.
	 */
	const post = <K extends SimKind>(
		kind: K,
		world: World,
		resolve: (result: SimResults[K]) => void,
		reject: (error: Error) => void,
	): number => {
		const id = nextId++;
		if (disposed) {
			reject(new Error('The simulation client has been disposed'));
			return id;
		}
		// The worker answers a request with the result of the request's own
		// kind, which is what lets a waiter for one kind sit among waiters
		// for any.
		waiting.set(id, {
			resolve: resolve as (result: SimResults[SimKind]) => void,
			reject,
		});
		try {
			worker.postMessage({ id, kind, world });
		} catch (error) {
			waiting.delete(id);
			reject(asError(error));
		}
		return id;
	};

	return {
		request: (kind, world) =>
			new Promise((resolve, reject) => {
				post(kind, world, resolve, reject);
			}),
		latest: (kind, world) =>
			new Promise((resolve, reject) => {
				const previous = newest.get(kind);
				// Still waiting means still unanswered: one that has
				// settled already has nothing left to supersede.
				if (previous !== undefined && waiting.delete(previous.id)) {
					previous.supersede();
				}
				const id = post(
					kind,
					world,
					(result) => resolve({ superseded: false, result }),
					reject,
				);
				newest.set(kind, {
					id,
					supersede: () => resolve({ superseded: true }),
				});
			}),
		dispose: () => {
			if (disposed) {
				return;
			}
			disposed = true;
			rejectAll(new Error('The simulation client has been disposed'));
			newest.clear();
			worker.removeEventListener('message', onMessage);
			worker.removeEventListener('error', onError);
			worker.removeEventListener('messageerror', onMessageError);
			worker.terminate?.();
		},
	};
};
