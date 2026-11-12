/**
 * The page's side of the channel to the simulation worker: sends requests
 * and hands each answer to whoever asked for it.
 *
 * It runs on the main thread and needs only the few members of a worker it
 * uses, so anything shaped like one will do.
 */

import {
	isSimProgress,
	isSimResponse,
	type SimKind,
	type SimPayload,
	type SimRequest,
	type SimResults,
	type TemperatureProgress,
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

/** What a request may be given besides what it carries to the worker. */
export type RequestOptions = {
	/**
	 * Told how far the computation has come, each time the worker says so
	 * before it answers. Only a temperature solve says so; for anything
	 * else this is never called.
	 */
	readonly onProgress?: (progress: TemperatureProgress) => void;
};

/** The channel to one simulation worker. */
export type SimClient = {
	/**
	 * Asks the worker for one computation on a world.
	 *
	 * @remarks
	 * The worker is sent a copy of what the request carries as it is now.
	 * The caller's world, elevation array included, and any start stay its
	 * own to go on editing or to send again, and later edits do not reach a
	 * request already sent. The result arrives as the worker transferred
	 * it, and is the caller's alone.
	 *
	 * @param kind - What to compute.
	 * @param payload - What the request carries: the world to compute for,
	 * and for a temperature solve, where to start from.
	 * @param options - Whom to tell of the progress.
	 * @returns The result. Rejects with an `Error` if the worker answers
	 * that it could not compute it, if the worker reports an error before
	 * answering, if the request cannot be sent, or if the client is or
	 * becomes disposed.
	 */
	request<K extends SimKind>(
		kind: K,
		payload: SimPayload<K>,
		options?: RequestOptions,
	): Promise<SimResults[K]>;
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
	readonly onProgress: RequestOptions['onProgress'];
};

const asError = (thrown: unknown): Error =>
	thrown instanceof Error ? thrown : new Error(String(thrown));

/**
 * Opens the channel to a simulation worker.
 *
 * @remarks
 * Each request is posted with an id of its own, and the response carrying
 * that id settles it, whatever order responses arrive in. A message about
 * progress goes to whoever waits on its id and settles nothing. A response
 * or a message about progress whose id nobody is waiting on, and a message
 * that is neither, are ignored.
 *
 * Requests are posted without a transfer list, so the worker receives a
 * structured clone of the world and of any start. Transferring their
 * buffers instead would avoid the copy but empty the caller's arrays: the
 * terrain being edited, and the last result, which stays on show and is
 * the start of the request after. The worker transfers its results back.
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
		if (isSimProgress(response)) {
			waiting.get(response.id)?.onProgress?.(response.progress);
			return;
		}
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

	return {
		request: (kind, payload, options = {}) =>
			new Promise((resolve, reject) => {
				const id = nextId++;
				if (disposed) {
					reject(new Error('The simulation client has been disposed'));
					return;
				}
				// The worker answers a request with the result of the request's
				// own kind, which is what lets a waiter for one kind sit among
				// waiters for any.
				waiting.set(id, {
					resolve: resolve as (result: SimResults[SimKind]) => void,
					reject,
					onProgress: options.onProgress,
				});
				try {
					// The payload is the one for this kind, so with the kind and
					// id it makes a request of that kind.
					worker.postMessage({ id, kind, ...payload } as SimRequest);
				} catch (error) {
					waiting.delete(id);
					reject(asError(error));
				}
			}),
		dispose: () => {
			if (disposed) {
				return;
			}
			disposed = true;
			rejectAll(new Error('The simulation client has been disposed'));
			worker.removeEventListener('message', onMessage);
			worker.removeEventListener('error', onError);
			worker.removeEventListener('messageerror', onMessageError);
			worker.terminate?.();
		},
	};
};
