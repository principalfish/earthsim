/**
 * A stand-in for the simulation worker, for tests of whatever talks to it:
 * it keeps what it is sent, and answers, reports progress and fails only
 * when the test says so.
 */

import type { SimRequest } from '../../core/index';
import type { WorkerEventLike, WorkerEventType, WorkerLike } from '../client';
import { handleRequest } from '../handle';

type Listener = (event: WorkerEventLike) => void;

/** A stand-in for a worker whose answers and errors the test sends by hand. */
export type FakeWorker = WorkerLike & {
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
	/** Delivers a message as a `message` event, as the worker posts it. */
	respond(message: unknown): void;
	/**
	 * Answers the posted request with that id as the real worker would:
	 * through the handler, its messages about progress first and then its
	 * response, with the response's arrays transferred.
	 */
	answer(id: number): void;
};

/** Makes a fake worker that has been sent nothing. */
export const createFakeWorker = (): FakeWorker => {
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
		respond: (message) => fake.emit('message', { data: message }),
		answer: (id) => {
			const request = fake.posted.find((posted) => posted.id === id);
			const { response, transfer } = handleRequest(request, (progress) =>
				fake.respond(structuredClone(progress)),
			);
			fake.respond(structuredClone(response, { transfer }));
		},
	};
	return fake;
};
