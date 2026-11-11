import { describe, expect, it } from 'vitest';
import type { LatestOutcome } from '../worker/client';
import {
	createRefreshScheduler,
	type RefreshScheduler,
	STATS_DEBOUNCE_MS,
} from './refresh';

/** Timers that run only when the test moves the clock on. */
type FakeTimers = {
	readonly setTimer: (callback: () => void, delayMs: number) => number;
	readonly clearTimer: (handle: number) => void;
	/** How many timers are waiting. */
	pending(): number;
	/** How many timers have been started so far, cancelled or not. */
	started(): number;
	/** Moves the clock on, running the timers that fall due, in order. */
	advance(ms: number): void;
};

const createFakeTimers = (): FakeTimers => {
	const timers = new Map<number, { at: number; callback: () => void }>();
	let now = 0;
	let nextHandle = 1;
	return {
		setTimer: (callback, delayMs) => {
			timers.set(nextHandle, { at: now + delayMs, callback });
			return nextHandle++;
		},
		clearTimer: (handle) => {
			timers.delete(handle);
		},
		pending: () => timers.size,
		started: () => nextHandle - 1,
		advance: (ms) => {
			const end = now + ms;
			for (;;) {
				const due = [...timers.entries()]
					.filter(([, timer]) => timer.at <= end)
					.sort(([, a], [, b]) => a.at - b.at)[0];
				if (due === undefined) {
					break;
				}
				const [handle, timer] = due;
				timers.delete(handle);
				now = timer.at;
				timer.callback();
			}
			now = end;
		},
	};
};

/** A request the test answers by hand. */
type Asked = {
	resolve(outcome: LatestOutcome<number>): void;
	reject(error: unknown): void;
};

type Harness = {
	readonly scheduler: RefreshScheduler;
	readonly timers: FakeTimers;
	/** Every request made so far, in order. */
	readonly asked: Asked[];
	readonly results: number[];
	readonly errors: unknown[];
};

const DEBOUNCE_MS = 150;

const createHarness = (
	options: { readonly isBusy?: () => boolean } = {},
): Harness => {
	const timers = createFakeTimers();
	const asked: Asked[] = [];
	const results: number[] = [];
	const errors: unknown[] = [];
	const scheduler = createRefreshScheduler<number, number>({
		request: () =>
			new Promise((resolve, reject) => {
				asked.push({ resolve, reject });
			}),
		debounceMs: DEBOUNCE_MS,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		onResult: (result) => results.push(result),
		onError: (error) => errors.push(error),
		...options,
	});
	return { scheduler, timers, asked, results, errors };
};

/** Lets every promise that is already settled run its reactions. */
const settle = async (): Promise<void> => {
	for (let turn = 0; turn < 5; turn++) {
		await Promise.resolve();
	}
};

const done = (result: number): LatestOutcome<number> => ({
	superseded: false,
	result,
});

describe('STATS_DEBOUNCE_MS', () => {
	it('leaves the worker time to answer within a quarter of a second', () => {
		expect(STATS_DEBOUNCE_MS).toBeGreaterThanOrEqual(100);
		expect(STATS_DEBOUNCE_MS).toBeLessThanOrEqual(200);
	});
});

describe('createRefreshScheduler', () => {
	it('asks for nothing until it is told of a change', () => {
		const { timers, asked } = createHarness();
		timers.advance(10_000);
		expect(asked).toHaveLength(0);
	});

	it('asks once the debounce time has passed, and not before', async () => {
		const { scheduler, timers, asked } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS - 1);
		await settle();
		expect(asked).toHaveLength(0);

		timers.advance(1);
		await settle();
		expect(asked).toHaveLength(1);
		expect(timers.pending()).toBe(0);
	});

	it('reports the result', async () => {
		const { scheduler, timers, asked, results, errors } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		asked[0]?.resolve(done(42));
		await settle();

		expect(results).toEqual([42]);
		expect(errors).toEqual([]);
	});

	it('folds a run of changes into one request after the last', async () => {
		const { scheduler, timers, asked } = createHarness();
		for (let change = 0; change < 20; change++) {
			scheduler.refresh();
			timers.advance(16);
		}
		await settle();
		expect(asked).toHaveLength(0);
		expect(timers.pending()).toBe(1);

		timers.advance(DEBOUNCE_MS - 17);
		await settle();
		expect(asked).toHaveLength(0);

		timers.advance(1);
		await settle();
		expect(asked).toHaveLength(1);
	});

	it('asks at the time of sending, not the time of the change', async () => {
		const timers = createFakeTimers();
		let seaLevel = 0;
		const sent: number[] = [];
		const scheduler = createRefreshScheduler<number, number>({
			request: async () => {
				sent.push(seaLevel);
				return done(seaLevel);
			},
			debounceMs: DEBOUNCE_MS,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
			onResult: () => {},
			onError: () => {},
		});

		scheduler.refresh();
		seaLevel = 500;
		timers.advance(DEBOUNCE_MS);
		await settle();

		expect(sent).toEqual([500]);
	});

	it('asks again for a change made while a request is under way', async () => {
		const { scheduler, timers, asked, results } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();

		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(2);

		// The first has been overtaken, as a latest-wins request reports.
		asked[0]?.resolve({ superseded: true });
		asked[1]?.resolve(done(2));
		await settle();
		expect(results).toEqual([2]);
	});

	it('reports a superseded request to nobody', async () => {
		const { scheduler, timers, asked, results, errors } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		asked[0]?.resolve({ superseded: true });
		await settle();

		expect(results).toEqual([]);
		expect(errors).toEqual([]);
	});

	it('reports a request that fails and carries on', async () => {
		const { scheduler, timers, asked, results, errors } = createHarness();
		const failure = new Error('The simulation worker reported an error');
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		asked[0]?.reject(failure);
		await settle();
		expect(errors).toEqual([failure]);
		expect(results).toEqual([]);

		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		asked[1]?.resolve(done(7));
		await settle();
		expect(results).toEqual([7]);
		expect(errors).toHaveLength(1);
	});

	it('reports a request that throws like one that rejects', async () => {
		const timers = createFakeTimers();
		const errors: unknown[] = [];
		const failure = new Error('no worker');
		const scheduler = createRefreshScheduler<number, number>({
			request: () => {
				throw failure;
			},
			debounceMs: DEBOUNCE_MS,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
			onResult: () => {},
			onError: (error) => errors.push(error),
		});

		scheduler.refresh();
		expect(() => timers.advance(DEBOUNCE_MS)).not.toThrow();
		await settle();

		expect(errors).toEqual([failure]);
	});

	it('cancels a waiting request when disposed', async () => {
		const { scheduler, timers, asked } = createHarness();
		scheduler.refresh();
		scheduler.dispose();
		expect(timers.pending()).toBe(0);

		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(0);
	});

	it('reports nothing that arrives after it is disposed', async () => {
		const { scheduler, timers, asked, results, errors } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();

		scheduler.dispose();
		asked[0]?.resolve(done(1));
		asked[1]?.reject(new Error('too late'));
		await settle();

		expect(results).toEqual([]);
		expect(errors).toEqual([]);
	});

	it('ignores changes once disposed', async () => {
		const { scheduler, timers, asked } = createHarness();
		scheduler.dispose();
		scheduler.dispose();
		scheduler.refresh();
		expect(timers.pending()).toBe(0);

		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(0);
	});
});

describe('createRefreshScheduler told when a change is under way', () => {
	it('waits again instead of asking when the wait ends mid-change', async () => {
		const { scheduler, timers, asked } = createHarness({
			isBusy: () => true,
		});
		scheduler.refresh();
		expect(timers.started()).toBe(1);

		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(0);
		expect(timers.started()).toBe(2);
		expect(timers.pending()).toBe(1);

		// The new wait is a whole debounce time, not what was left of one.
		timers.advance(DEBOUNCE_MS - 1);
		await settle();
		expect(timers.started()).toBe(2);
	});

	it('asks once when a wait then ends with no change under way', async () => {
		let busy = true;
		const { scheduler, timers, asked, results } = createHarness({
			isBusy: () => busy,
		});
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS * 3);
		await settle();
		expect(asked).toHaveLength(0);
		expect(timers.pending()).toBe(1);

		busy = false;
		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(1);
		expect(timers.pending()).toBe(0);

		asked[0]?.resolve(done(3));
		await settle();
		expect(results).toEqual([3]);

		timers.advance(10_000);
		await settle();
		expect(asked).toHaveLength(1);
	});

	it('restarts a wait that was started again when told of a change', async () => {
		let busy = true;
		const { scheduler, timers, asked } = createHarness({
			isBusy: () => busy,
		});
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS + 50);
		scheduler.refresh();
		expect(timers.pending()).toBe(1);

		busy = false;
		timers.advance(DEBOUNCE_MS - 1);
		await settle();
		expect(asked).toHaveLength(0);

		timers.advance(1);
		await settle();
		expect(asked).toHaveLength(1);
		expect(timers.pending()).toBe(0);
	});

	it('cancels a wait that was started again when disposed', async () => {
		let busy = true;
		const { scheduler, timers, asked, results, errors } = createHarness({
			isBusy: () => busy,
		});
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		expect(timers.pending()).toBe(1);

		scheduler.dispose();
		expect(timers.pending()).toBe(0);

		busy = false;
		timers.advance(10_000);
		await settle();
		expect(asked).toHaveLength(0);
		expect(results).toEqual([]);
		expect(errors).toEqual([]);
	});

	it('asks on time, with one timer, when it is not told', async () => {
		const { scheduler, timers, asked } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();

		expect(asked).toHaveLength(1);
		expect(timers.started()).toBe(1);
		expect(timers.pending()).toBe(0);
	});
});
