import { describe, expect, it } from 'vitest';
import type {
	TemperatureProgress,
	TemperatureResult,
	TemperatureStart,
} from '../core/index';
import { progressOf, temperatureOf } from '../core/testing/temperatureFixtures';
import {
	createLayerStore,
	type LayerStore,
	type TemperatureStatus,
} from './layers';
import {
	createRefreshScheduler,
	createTemperatureScheduler,
	type LatestOutcome,
	type RefreshScheduler,
	STATS_DEBOUNCE_MS,
	TEMPERATURE_DEBOUNCE_MS,
	type TemperatureScheduler,
} from './refresh';
import { createFakeTimers, type FakeTimers } from './testing/fakeTimers';
import { settle } from './testing/settle';

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
	/** What the scheduler said besides, in order. */
	readonly notices: ('pending' | 'unavailable')[];
};

const DEBOUNCE_MS = 150;

const createHarness = (
	options: { readonly isBusy?: () => boolean } = {},
): Harness => {
	const timers = createFakeTimers();
	const asked: Asked[] = [];
	const results: number[] = [];
	const errors: unknown[] = [];
	const notices: ('pending' | 'unavailable')[] = [];
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
		onPending: () => notices.push('pending'),
		onUnavailable: () => notices.push('unavailable'),
		...options,
	});
	return { scheduler, timers, asked, results, errors, notices };
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
			onUnavailable: () => {},
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
			onUnavailable: () => {},
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

describe('createRefreshScheduler told that its subject was replaced', () => {
	it('drops a result that arrives after the reset', async () => {
		const { scheduler, timers, asked, results, errors, notices } =
			createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();

		scheduler.reset();
		expect(notices).toEqual(['pending']);
		asked[0]?.resolve(done(1));
		await settle();

		expect(results).toEqual([]);
		expect(errors).toEqual([]);
	});

	it('shows the result of the request made after the reset', async () => {
		const { scheduler, timers, asked, results } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();

		scheduler.reset();
		scheduler.refresh();
		// The old answer lands inside the wait for the new request.
		timers.advance(DEBOUNCE_MS - 1);
		asked[0]?.resolve(done(1));
		await settle();
		expect(results).toEqual([]);

		timers.advance(1);
		await settle();
		expect(asked).toHaveLength(2);
		asked[1]?.resolve(done(2));
		await settle();
		expect(results).toEqual([2]);
	});

	it('drops an error that arrives after the reset', async () => {
		const { scheduler, timers, asked, results, errors } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();

		scheduler.reset();
		asked[0]?.reject(new Error('too late'));
		await settle();

		expect(errors).toEqual([]);
		expect(results).toEqual([]);
	});

	it('still makes a request that was waiting, and shows its result', async () => {
		const { scheduler, timers, asked, results } = createHarness();
		scheduler.refresh();
		scheduler.reset();
		timers.advance(DEBOUNCE_MS);
		await settle();

		expect(asked).toHaveLength(1);
		asked[0]?.resolve(done(7));
		await settle();
		expect(results).toEqual([7]);
	});

	it('says the result is pending each time, and only then', async () => {
		const { scheduler, timers, notices } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(notices).toEqual([]);

		scheduler.reset();
		scheduler.reset();
		expect(notices).toEqual(['pending', 'pending']);
	});

	it('needs nobody to tell that the result is pending', () => {
		const timers = createFakeTimers();
		const scheduler = createRefreshScheduler<number, number>({
			request: () => new Promise(() => {}),
			debounceMs: DEBOUNCE_MS,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
			onResult: () => {},
			onError: () => {},
			onUnavailable: () => {},
		});
		expect(() => scheduler.reset()).not.toThrow();
	});

	it('does nothing once disposed', async () => {
		const { scheduler, notices } = createHarness();
		scheduler.dispose();
		scheduler.reset();
		expect(notices).toEqual([]);
	});
});

describe('createRefreshScheduler marked unavailable', () => {
	it('says so at once', () => {
		const { scheduler, notices } = createHarness();
		scheduler.markUnavailable();
		expect(notices).toEqual(['unavailable']);
	});

	it('asks for nothing afterwards, and says so again at every change', async () => {
		const { scheduler, timers, asked, notices } = createHarness();
		scheduler.markUnavailable();

		scheduler.refresh();
		expect(notices).toEqual(['unavailable', 'unavailable']);
		expect(timers.pending()).toBe(0);
		timers.advance(10_000);
		await settle();
		expect(asked).toHaveLength(0);

		scheduler.refresh();
		expect(notices).toEqual(['unavailable', 'unavailable', 'unavailable']);
		expect(timers.started()).toBe(0);
	});

	it('does not say the result is pending when its subject is replaced', async () => {
		const { scheduler, timers, asked, notices } = createHarness();
		scheduler.markUnavailable();

		scheduler.reset();
		scheduler.refresh();
		timers.advance(10_000);
		await settle();

		expect(notices).toEqual(['unavailable', 'unavailable']);
		expect(asked).toHaveLength(0);
	});

	it('cancels a request that was waiting to be made', async () => {
		const { scheduler, timers, asked } = createHarness();
		scheduler.refresh();
		scheduler.markUnavailable();
		expect(timers.pending()).toBe(0);
		timers.advance(10_000);
		await settle();
		expect(asked).toHaveLength(0);
	});

	it('drops a result still on its way, and reports an error', async () => {
		const first = createHarness();
		first.scheduler.refresh();
		first.timers.advance(DEBOUNCE_MS);
		await settle();
		first.scheduler.markUnavailable();
		first.asked[0]?.resolve(done(3));
		await settle();
		expect(first.results).toEqual([]);
		expect(first.errors).toEqual([]);

		const second = createHarness();
		second.scheduler.refresh();
		second.timers.advance(DEBOUNCE_MS);
		await settle();
		second.scheduler.markUnavailable();
		const failure = new Error('the worker is gone');
		second.asked[0]?.reject(failure);
		await settle();
		expect(second.errors).toEqual([failure]);
		expect(second.results).toEqual([]);
	});

	it('is not what a request that fails does: the next change asks again', async () => {
		const { scheduler, timers, asked, results, errors, notices } =
			createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		asked[0]?.reject(new Error('could not compute'));
		await settle();
		expect(errors).toHaveLength(1);

		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(2);
		asked[1]?.resolve(done(9));
		await settle();

		expect(results).toEqual([9]);
		expect(notices).toEqual([]);
	});

	it('does nothing once disposed', () => {
		const { scheduler, notices } = createHarness();
		scheduler.dispose();
		scheduler.markUnavailable();
		scheduler.refresh();
		expect(notices).toEqual([]);
	});
});

describe('createRefreshScheduler cancelled', () => {
	it('makes no request that was waiting, until the next change', async () => {
		const { scheduler, timers, asked } = createHarness();
		scheduler.refresh();
		scheduler.cancel();
		expect(timers.pending()).toBe(0);
		timers.advance(DEBOUNCE_MS * 2);
		await settle();
		expect(asked).toHaveLength(0);

		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(1);
	});

	it('leaves a request already made to finish and be reported', async () => {
		const { scheduler, timers, asked, results } = createHarness();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		scheduler.cancel();
		asked[0]?.resolve(done(8));
		await settle();
		expect(results).toEqual([8]);
	});

	it('does nothing when nothing is waiting', () => {
		const { scheduler, timers } = createHarness();
		expect(() => scheduler.cancel()).not.toThrow();
		expect(timers.pending()).toBe(0);
	});
});

/** A temperature request the test answers by hand. */
type TemperatureAsked = {
	readonly start: TemperatureStart | undefined;
	readonly onProgress: (progress: TemperatureProgress) => void;
	resolve(outcome: LatestOutcome<TemperatureResult>): void;
	reject(error: unknown): void;
};

type TemperatureHarness = {
	readonly scheduler: TemperatureScheduler;
	readonly store: LayerStore;
	readonly timers: FakeTimers;
	readonly asked: TemperatureAsked[];
	readonly errors: unknown[];
	/** Every error a listener of the store threw, as the store reported it. */
	readonly reported: unknown[];
};

const WAIT_MS = TEMPERATURE_DEBOUNCE_MS;

const createTemperatureHarness = (
	options: { readonly isBusy?: () => boolean } = {},
): TemperatureHarness => {
	const timers = createFakeTimers();
	const reported: unknown[] = [];
	const store = createLayerStore((error) => reported.push(error));
	const asked: TemperatureAsked[] = [];
	const errors: unknown[] = [];
	const scheduler = createTemperatureScheduler<number>({
		request: (start, onProgress) =>
			new Promise((resolve, reject) => {
				asked.push({ start, onProgress, resolve, reject });
			}),
		store,
		debounceMs: WAIT_MS,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		onError: (error) => errors.push(error),
		...options,
	});
	return { scheduler, store, timers, asked, errors, reported };
};

const solved = (
	result: TemperatureResult,
): LatestOutcome<TemperatureResult> => ({ superseded: false, result });

/** The start a result makes: its state and its record, and nothing more. */
const startOf = (result: TemperatureResult): TemperatureStart => ({
	state: result.state,
	solvedFor: result.solvedFor,
});

/** Moves the clock past the wait and lets what follows run. */
const wait = async (harness: TemperatureHarness): Promise<void> => {
	harness.timers.advance(WAIT_MS);
	await settle();
};

/**
 * A harness showing the temperature, whose first request has been answered
 * with a current result.
 */
const createAnsweredHarness = async (
	result = temperatureOf(1),
): Promise<TemperatureHarness> => {
	const harness = createTemperatureHarness();
	harness.scheduler.setShowing(true);
	await wait(harness);
	harness.asked[0]?.resolve(solved(result));
	await settle();
	return harness;
};

describe('TEMPERATURE_DEBOUNCE_MS', () => {
	it('waits longer than the statistics, and well under a second', () => {
		expect(TEMPERATURE_DEBOUNCE_MS).toBeGreaterThan(STATS_DEBOUNCE_MS);
		expect(TEMPERATURE_DEBOUNCE_MS).toBeLessThan(1000);
	});
});

describe('createTemperatureScheduler while the temperature is not showing', () => {
	it('asks for nothing, however many changes come', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.refresh();
		harness.scheduler.refresh();
		expect(harness.timers.pending()).toBe(0);
		await wait(harness);
		expect(harness.asked).toHaveLength(0);
		expect(harness.store.temperature.status).toBe('empty');
	});

	it('only marks the result on hand out of date', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.setShowing(false);
		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('outOfDate');
	});
});

describe('createTemperatureScheduler switched on', () => {
	it('asks once, after the wait, when there is no result yet', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		harness.timers.advance(WAIT_MS - 1);
		await settle();
		expect(harness.asked).toHaveLength(0);
		harness.timers.advance(1);
		await settle();
		expect(harness.asked).toHaveLength(1);
		expect(harness.asked[0]?.start).toBeUndefined();
		expect(harness.store.temperature).toMatchObject({
			status: 'calculating',
			result: null,
		});

		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('asks once when the result is out of date, starting from it', async () => {
		const first = temperatureOf(1);
		const harness = await createAnsweredHarness(first);
		harness.scheduler.setShowing(false);
		harness.scheduler.refresh();
		harness.scheduler.refresh();

		harness.scheduler.setShowing(true);
		await wait(harness);
		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toEqual(startOf(first));
	});

	it('asks nothing when the result is current', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.setShowing(false);
		harness.scheduler.setShowing(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('current');
	});

	it('asks nothing more for being told it is showing again', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		harness.timers.advance(WAIT_MS / 2);
		harness.scheduler.setShowing(true);
		harness.timers.advance(WAIT_MS / 2);
		await settle();
		expect(harness.asked).toHaveLength(1);
		expect(harness.timers.started()).toBe(1);
	});
});

describe('createTemperatureScheduler switched off', () => {
	it('cancels a request waiting to be made, and asks it when switched on again', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		harness.scheduler.setShowing(false);
		await wait(harness);
		expect(harness.asked).toHaveLength(0);

		harness.scheduler.setShowing(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('lets a solve under way finish and keeps its result as current', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		await wait(harness);
		harness.scheduler.setShowing(false);

		const result = temperatureOf(3);
		harness.asked[0]?.resolve(solved(result));
		await settle();
		expect(harness.store.temperature).toMatchObject({
			status: 'current',
			result,
		});
		harness.scheduler.setShowing(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('keeps that result as out of date if the world changed meanwhile, and asks again from it when switched on', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		await wait(harness);
		harness.scheduler.setShowing(false);
		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.asked).toHaveLength(1);

		const result = temperatureOf(3);
		harness.asked[0]?.resolve(solved(result));
		await settle();
		expect(harness.store.temperature).toMatchObject({
			status: 'outOfDate',
			result,
		});

		harness.scheduler.setShowing(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start?.state).toBe(result.state);
	});
});

describe('createTemperatureScheduler while showing', () => {
	it('asks once after a run of changes, starting from the last result', async () => {
		const first = temperatureOf(1);
		const harness = await createAnsweredHarness(first);
		harness.scheduler.refresh();
		expect(harness.store.temperature.status).toBe('outOfDate');
		harness.timers.advance(WAIT_MS / 2);
		harness.scheduler.refresh();
		harness.timers.advance(WAIT_MS / 2);
		await settle();
		expect(harness.asked).toHaveLength(1);

		harness.timers.advance(WAIT_MS / 2);
		await settle();
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toEqual(startOf(first));
		expect(harness.store.temperature).toMatchObject({
			status: 'calculating',
			result: first,
		});
	});

	it("hands on the last result's state and record without its months", async () => {
		const first = temperatureOf(1);
		const harness = await createAnsweredHarness(first);
		harness.scheduler.refresh();
		await wait(harness);
		const start = harness.asked[1]?.start;
		expect(start).toBeDefined();
		expect(Object.keys(start ?? {}).sort()).toEqual(['solvedFor', 'state']);
		expect(start).not.toHaveProperty('months');
		expect(start?.state).toBe(first.state);
		expect(start?.solvedFor).toBe(first.solvedFor);
	});

	it('holds a request during a stroke and makes it once after', async () => {
		let busy = true;
		const harness = createTemperatureHarness({ isBusy: () => busy });
		harness.scheduler.setShowing(true);
		harness.scheduler.refresh();
		await wait(harness);
		await wait(harness);
		expect(harness.asked).toHaveLength(0);

		busy = false;
		await wait(harness);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('keeps a result that a later change overtook as out of date, then asks from it', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		await wait(harness);
		harness.scheduler.refresh();
		const early = temperatureOf(2);
		harness.asked[0]?.resolve(solved(early));
		await settle();
		expect(harness.store.temperature).toMatchObject({
			status: 'outOfDate',
			result: early,
		});

		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toEqual(startOf(early));
	});

	it('keeps only the newest result: an overtaken request changes nothing', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		await wait(harness);
		harness.scheduler.refresh();
		await wait(harness);
		harness.asked[0]?.resolve({ superseded: true });
		await settle();
		expect(harness.store.temperature).toMatchObject({
			status: 'calculating',
			result: null,
		});

		const newest = temperatureOf(4);
		harness.asked[1]?.resolve(solved(newest));
		await settle();
		expect(harness.store.temperature).toMatchObject({
			status: 'current',
			result: newest,
		});
	});

	it('keeps the progress of the newest request only', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		await wait(harness);
		harness.asked[0]?.onProgress(progressOf(1));
		expect(harness.store.temperature.progress).toEqual(progressOf(1));

		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.store.temperature.progress).toBeNull();
		harness.asked[0]?.onProgress(progressOf(2));
		expect(harness.store.temperature.progress).toBeNull();
		harness.asked[1]?.onProgress(progressOf(1));
		expect(harness.store.temperature.progress).toEqual(progressOf(1));
	});

	it('marks the result out of date on a failure, keeps it, records why and asks again at the next change', async () => {
		const first = temperatureOf(1);
		const harness = await createAnsweredHarness(first);
		harness.scheduler.refresh();
		await wait(harness);
		const failure = new Error('the solve failed');
		harness.asked[1]?.reject(failure);
		await settle();
		expect(harness.store.temperature).toEqual({
			status: 'outOfDate',
			result: first,
			progress: null,
		});
		expect(harness.errors).toEqual([failure]);

		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.asked).toHaveLength(3);
		expect(harness.asked[2]?.start?.state).toBe(first.state);
	});

	it('asks again when switched on after a failure', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		await wait(harness);
		harness.asked[0]?.reject(new Error('no'));
		await settle();
		harness.scheduler.setShowing(false);
		harness.scheduler.setShowing(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(2);
	});
});

describe('createTemperatureScheduler told the world was replaced', () => {
	it('leaves the store empty, then calculating once asked, from nothing', async () => {
		const harness = await createAnsweredHarness();
		const statuses: string[] = [];
		harness.store.addListener((layer) => statuses.push(layer.status));

		harness.scheduler.reset();
		expect(harness.store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
		});
		harness.scheduler.refresh();
		await wait(harness);
		expect(statuses).toEqual(['empty', 'calculating']);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toBeUndefined();
	});

	it('drops the answer and the progress of a request made before, while none is under way', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		await wait(harness);
		harness.scheduler.reset();

		harness.asked[0]?.onProgress(progressOf(3));
		harness.asked[0]?.resolve(solved(temperatureOf(9)));
		await settle();
		expect(harness.store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
		});
	});

	it('drops the answer and the progress of a request made before, once the next is under way', async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		await wait(harness);
		harness.scheduler.reset();
		harness.scheduler.refresh();
		await wait(harness);

		harness.asked[0]?.onProgress(progressOf(3));
		harness.asked[0]?.resolve(solved(temperatureOf(9)));
		await settle();
		expect(harness.store.temperature).toEqual({
			status: 'calculating',
			result: null,
			progress: null,
		});
	});

	it('asks nothing for it while not showing', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.setShowing(false);
		harness.scheduler.reset();
		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('empty');

		harness.scheduler.setShowing(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toBeUndefined();
	});
});

describe('createTemperatureScheduler marked unavailable', () => {
	it('marks the store so, keeps its result, and asks nothing again', async () => {
		const first = temperatureOf(1);
		const harness = await createAnsweredHarness(first);
		harness.scheduler.refresh();
		harness.scheduler.markUnavailable();
		await wait(harness);
		harness.scheduler.setShowing(false);
		harness.scheduler.setShowing(true);
		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature).toMatchObject({
			status: 'unavailable',
			result: first,
		});
	});
});

describe('createTemperatureScheduler with a store listener that throws', () => {
	/** Has the store's listener throw on each change to that status. */
	const throwOn = (
		harness: TemperatureHarness,
		status: TemperatureStatus,
	): Error => {
		const failure = new Error(`could not show ${status}`);
		harness.store.addListener((layer) => {
			if (layer.status === status) {
				throw failure;
			}
		});
		return failure;
	};

	it('still schedules and makes exactly one request after a change that marks the result out of date', async () => {
		const harness = await createAnsweredHarness();
		const failure = throwOn(harness, 'outOfDate');

		harness.scheduler.refresh();
		expect(harness.store.temperature.status).toBe('outOfDate');
		expect(harness.timers.pending()).toBe(1);
		await wait(harness);
		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.reported).toEqual([failure]);
	});

	it("still drops the old world's answer when it arrives early after a replacement", async () => {
		const harness = createTemperatureHarness();
		harness.scheduler.setShowing(true);
		await wait(harness);
		const failure = throwOn(harness, 'empty');

		harness.scheduler.reset();
		harness.scheduler.refresh();
		harness.asked[0]?.resolve(solved(temperatureOf(9)));
		await settle();
		expect(harness.store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
		});

		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toBeUndefined();
		expect(harness.reported).toEqual([failure]);
	});

	it('still asks for the solve and keeps its result when the listener throws on calculating', async () => {
		const harness = createTemperatureHarness();
		const failure = throwOn(harness, 'calculating');
		harness.scheduler.setShowing(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);

		const result = temperatureOf(2);
		harness.asked[0]?.resolve(solved(result));
		await settle();
		expect(harness.store.temperature).toMatchObject({
			status: 'current',
			result,
		});
		expect(harness.reported).toEqual([failure]);
		expect(harness.errors).toEqual([]);
	});
});
