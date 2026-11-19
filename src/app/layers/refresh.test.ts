import { describe, expect, it } from 'vitest';
import {
	type ClimateProgress,
	type ClimateStart,
	type ClimateSummary,
	createBlankWorld,
	type World,
} from '../../core/index';
import { climatePassOf } from '../../core/testing/climateFixtures';
import { progressOf } from '../../core/testing/temperatureFixtures';
import { createFakeTimers, type FakeTimers } from '../testing/fakeTimers';
import { settle } from '../testing/settle';
import {
	CALCULATING_CLIMATE_TEXT,
	type CalculationContent,
	calculationContent,
	PAUSED_TEXT,
	refiningClimateText,
} from '../ui/main/infoBox';
import {
	createLayerStore,
	type LayerStatus,
	type LayerStore,
	type SolvedWinds,
} from './layers';
import {
	CLIMATE_DEBOUNCE_MS,
	type ClimateCallbacks,
	type ClimateScheduler,
	createClimateScheduler,
	createRefreshScheduler,
	type LatestOutcome,
	type RefreshScheduler,
	STATS_DEBOUNCE_MS,
} from './refresh';

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
	options: {
		readonly isBusy?: () => boolean;
		readonly oneAtATime?: boolean;
	} = {},
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

describe('createRefreshScheduler one request at a time', () => {
	const oneAtATime = (isBusy?: () => boolean) =>
		createHarness({ oneAtATime: true, ...(isBusy ? { isBusy } : {}) });

	it('holds back the requests of waits that end while one is under way, then asks once, dropping the answer it overtook', async () => {
		const { scheduler, timers, asked, results } = oneAtATime();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		for (let change = 0; change < 3; change++) {
			scheduler.refresh();
			timers.advance(DEBOUNCE_MS);
		}
		scheduler.refreshNow();
		await settle();
		expect(asked).toHaveLength(1);

		asked[0]?.resolve(done(1));
		await settle();
		expect(asked).toHaveLength(2);
		expect(results).toEqual([]);
		asked[1]?.resolve(done(2));
		await settle();
		expect(results).toEqual([2]);
		expect(asked).toHaveLength(2);
	});

	it('drops the error of a request it overtook, and asks after it', async () => {
		const { scheduler, timers, asked, errors } = oneAtATime();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		scheduler.refreshNow();
		asked[0]?.reject(new Error('lost'));
		await settle();
		expect(errors).toEqual([]);
		expect(asked).toHaveLength(2);
	});

	it('reports the answer and asks nothing more when the request held back is cancelled', async () => {
		const { scheduler, timers, asked, results } = oneAtATime();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		scheduler.refreshNow();
		scheduler.cancel();
		asked[0]?.resolve(done(1));
		await settle();
		expect(results).toEqual([1]);
		timers.advance(DEBOUNCE_MS * 2);
		await settle();
		expect(asked).toHaveLength(1);
	});

	it('asks when both the wait of a later change and the answer are over', async () => {
		const { scheduler, timers, asked } = oneAtATime();
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		scheduler.refresh();
		asked[0]?.resolve(done(1));
		await settle();
		expect(asked).toHaveLength(1);
		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(2);
	});

	it('makes no held request while a change is under way when the answer arrives, and asks once after it', async () => {
		let busy = false;
		const { scheduler, timers, asked } = oneAtATime(() => busy);
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		scheduler.refreshNow();
		busy = true;
		asked[0]?.resolve(done(1));
		await settle();
		timers.advance(DEBOUNCE_MS * 3);
		await settle();
		expect(asked).toHaveLength(1);

		busy = false;
		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(2);
		timers.advance(DEBOUNCE_MS * 3);
		await settle();
		expect(asked).toHaveLength(2);
	});
});

describe('createRefreshScheduler one request at a time, interrupted', () => {
	const holding = () => {
		const harness = createHarness({ oneAtATime: true });
		harness.scheduler.refresh();
		harness.timers.advance(DEBOUNCE_MS);
		harness.scheduler.refreshNow();
		return harness;
	};

	it('drops the old answer after a reset but still makes the request held back, and is not left under way', async () => {
		const { scheduler, timers, asked, results } = holding();
		scheduler.reset();
		asked[0]?.resolve(done(1));
		await settle();
		expect(results).toEqual([]);
		expect(asked).toHaveLength(2);
		asked[1]?.resolve(done(2));
		await settle();
		expect(results).toEqual([2]);

		scheduler.refresh();
		timers.advance(DEBOUNCE_MS);
		expect(asked).toHaveLength(3);
	});

	it('makes no request held back once marked unavailable, and reports nothing', async () => {
		const { scheduler, timers, asked, results, notices } = holding();
		scheduler.markUnavailable();
		asked[0]?.resolve(done(1));
		await settle();
		timers.advance(DEBOUNCE_MS * 3);
		await settle();
		expect(asked).toHaveLength(1);
		expect(results).toEqual([]);
		expect(notices).toEqual(['unavailable']);
	});

	it('makes no request held back once disposed, and reports nothing', async () => {
		const { scheduler, timers, asked, results, errors } = holding();
		scheduler.dispose();
		asked[0]?.resolve(done(1));
		await settle();
		timers.advance(DEBOUNCE_MS * 3);
		await settle();
		expect(asked).toHaveLength(1);
		expect(results).toEqual([]);
		expect(errors).toEqual([]);
	});
});

describe('createRefreshScheduler asked at once', () => {
	it('asks with no wait, cancelling one under way', async () => {
		const { scheduler, timers, asked, results } = createHarness();
		scheduler.refresh();
		scheduler.refreshNow();
		expect(asked).toHaveLength(1);
		expect(timers.pending()).toBe(0);
		asked[0]?.resolve(done(4));
		await settle();
		expect(results).toEqual([4]);

		timers.advance(DEBOUNCE_MS * 2);
		await settle();
		expect(asked).toHaveLength(1);
	});

	it('waits as for a change while one is under way, and asks once it is over', async () => {
		let busy = true;
		const { scheduler, timers, asked } = createHarness({ isBusy: () => busy });
		scheduler.refreshNow();
		expect(asked).toHaveLength(0);
		expect(timers.pending()).toBe(1);
		busy = false;
		timers.advance(DEBOUNCE_MS);
		await settle();
		expect(asked).toHaveLength(1);
	});

	it('says it is unavailable instead once marked so, and does nothing once disposed', () => {
		const { scheduler, asked, notices } = createHarness();
		scheduler.markUnavailable();
		scheduler.refreshNow();
		expect(notices).toEqual(['unavailable', 'unavailable']);

		scheduler.dispose();
		scheduler.refreshNow();
		expect(notices).toHaveLength(2);
		expect(asked).toHaveLength(0);
	});
});

/** A climate request the test answers by hand. */
type ClimateAsked = {
	readonly world: World;
	readonly start: ClimateStart | undefined;
	readonly callbacks: ClimateCallbacks;
	resolve(outcome: LatestOutcome<ClimateSummary>): void;
	reject(error: unknown): void;
};

type ClimateHarness = {
	readonly scheduler: ClimateScheduler;
	readonly store: LayerStore;
	readonly timers: FakeTimers;
	readonly asked: ClimateAsked[];
	readonly errors: unknown[];
	/** Every error a listener of the store threw, as the store reported it. */
	readonly reported: unknown[];
	/** How many times the request under way was ended. */
	readonly cancelled: () => number;
	/** Puts another world in the place of the one being edited. */
	setWorld(world: World): void;
};

const WAIT_MS = CLIMATE_DEBOUNCE_MS;

const createClimateHarness = (
	options: { readonly isBusy?: () => boolean } = {},
): ClimateHarness => {
	const timers = createFakeTimers();
	const reported: unknown[] = [];
	const store = createLayerStore((error) => reported.push(error));
	const asked: ClimateAsked[] = [];
	const errors: unknown[] = [];
	let cancels = 0;
	let world = createBlankWorld(64);
	const scheduler = createClimateScheduler<number>({
		request: (asking, start, callbacks) =>
			new Promise((resolve, reject) => {
				asked.push({ world: asking, start, callbacks, resolve, reject });
			}),
		// As the worker service does: the newest request is answered as
		// superseded, at once.
		cancel: () => {
			cancels++;
			asked.at(-1)?.resolve({ superseded: true });
		},
		currentWorld: () => world,
		store,
		debounceMs: WAIT_MS,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		onError: (error) => errors.push(error),
		...options,
	});
	return {
		scheduler,
		store,
		timers,
		asked,
		errors,
		reported,
		cancelled: () => cancels,
		setWorld: (next) => {
			world = next;
		},
	};
};

/** What the store keeps of a pass of the blank world, of 24-hour days. */
const solvedOf = (pass: ClimateProgress): SolvedWinds => ({
	temperature: pass.temperature,
	winds: pass.winds,
	currents: pass.currents,
	dayLengthHours: 24,
});

/** Where a climate carries on from a pass: all it needs, and no more. */
const startOf = (pass: ClimateProgress): ClimateStart => ({
	temperature: {
		months: pass.temperature.months,
		seaMonths: pass.temperature.seaMonths,
		state: pass.temperature.state,
		solvedFor: pass.temperature.solvedFor,
	},
	winds: { east: pass.winds.east, north: pass.winds.north },
	currents: {
		flows: pass.currents.flows,
		streamfunction: pass.currents.streamfunction,
	},
	dayLengthHours: 24,
});

/**
 * Tells a request of a pass, as the worker does when the pass finishes.
 *
 * @returns The pass told.
 */
const tellPass = (
	asked: ClimateAsked | undefined,
	pass: number,
	options: { last?: boolean; settled?: boolean } = {},
): ClimateProgress => {
	const told = climatePassOf(pass, options);
	asked?.callbacks.onPass(told);
	return told;
};

/**
 * Answers a request as the worker does: its last pass, then the summary,
 * and lets what follows run.
 *
 * @param pass - The number of the last pass, which tells it apart.
 * @returns The last pass.
 */
const finish = async (
	asked: ClimateAsked | undefined,
	pass = 1,
	{ settled = true }: { settled?: boolean } = {},
): Promise<ClimateProgress> => {
	const last = tellPass(asked, pass, { last: true, settled });
	asked?.resolve({
		superseded: false,
		result: { dayLengthHours: 24, passes: pass, settled, changeC: 0 },
	});
	await settle();
	return last;
};

/** Moves the clock past the wait and lets what follows run. */
const wait = async (harness: ClimateHarness): Promise<void> => {
	harness.timers.advance(WAIT_MS);
	await settle();
};

/**
 * A harness whose first request, for a new world, has been answered with a
 * current climate that settled, with the pass given.
 */
const createAnsweredHarness = async (
	pass = 1,
): Promise<ClimateHarness & { readonly first: ClimateProgress }> => {
	const harness = createClimateHarness();
	harness.scheduler.refreshNow();
	const first = await finish(harness.asked[0], pass);
	return { ...harness, first };
};

/** The temperature layer with nothing on hand. */
const EMPTY_TEMPERATURE = {
	status: 'empty',
	result: null,
	progress: null,
	pass: null,
} as const;

describe('CLIMATE_DEBOUNCE_MS', () => {
	it('waits longer than the statistics, and well under a second', () => {
		expect(CLIMATE_DEBOUNCE_MS).toBeGreaterThan(STATS_DEBOUNCE_MS);
		expect(CLIMATE_DEBOUNCE_MS).toBeLessThan(1000);
	});
});

describe('createClimateScheduler as it starts', () => {
	it('asks for nothing until it is told of a change', async () => {
		const harness = createClimateHarness();
		await wait(harness);
		expect(harness.asked).toHaveLength(0);
		expect(harness.timers.started()).toBe(0);
		expect(harness.store.temperature.status).toBe('empty');
	});

	it('asks after the wait for a change, for the world of the moment, without being told that anything is on screen', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refresh();
		harness.timers.advance(WAIT_MS - 1);
		await settle();
		expect(harness.asked).toHaveLength(0);

		const world = createBlankWorld(64);
		harness.setWorld(world);
		harness.timers.advance(1);
		await settle();
		expect(harness.asked).toHaveLength(1);
		expect(harness.asked[0]?.world).toBe(world);
		expect(harness.asked[0]?.start).toBeUndefined();
		expect(harness.store.temperature.status).toBe('calculating');
		expect(harness.store.winds.status).toBe('calculating');
	});

	it('asks at once for a new world, without being told that anything is on screen', () => {
		const harness = createClimateHarness();
		harness.scheduler.reset();
		harness.scheduler.refreshNow();
		expect(harness.asked).toHaveLength(1);
		expect(harness.asked[0]?.start).toBeUndefined();
		expect(harness.store.temperature).toEqual({
			status: 'calculating',
			result: null,
			progress: null,
			pass: 1,
		});
		expect(harness.store.winds).toEqual({
			status: 'calculating',
			result: null,
		});
		expect(harness.timers.started()).toBe(0);
	});
});

describe('createClimateScheduler showing its passes', () => {
	it('shows each pass at once, both layers from the same pass, and neither current until the answer', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		const asked = harness.asked[0];

		const first = tellPass(asked, 1);
		expect(harness.store.temperature).toEqual({
			status: 'calculating',
			result: first.temperature,
			progress: null,
			pass: 2,
		});
		expect(harness.store.winds).toEqual({
			status: 'calculating',
			result: solvedOf(first),
		});

		const second = tellPass(asked, 2);
		expect(harness.store.temperature.result).toBe(second.temperature);
		expect(harness.store.winds.result?.winds).toBe(second.winds);
		expect(harness.store.winds.result?.temperature).toBe(second.temperature);
		expect(harness.store.temperature.pass).toBe(3);

		const last = await finish(asked, 3);
		expect(harness.store.temperature).toEqual({
			status: 'current',
			result: last.temperature,
			progress: null,
			pass: null,
		});
		expect(harness.store.winds).toEqual({
			status: 'current',
			result: solvedOf(last),
		});
	});

	it('keeps the progress of the pass under way, with its pass', () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		const asked = harness.asked[0];
		asked?.callbacks.onProgress(progressOf(2), 1);
		expect(harness.store.temperature).toMatchObject({
			progress: progressOf(2),
			pass: 1,
		});
		tellPass(asked, 1);
		expect(harness.store.temperature.progress).toBeNull();
		asked?.callbacks.onProgress(progressOf(1), 2);
		expect(harness.store.temperature).toMatchObject({
			progress: progressOf(1),
			pass: 2,
		});
	});

	it('keeps the winds with the day length of the world it asked for', async () => {
		const harness = createClimateHarness();
		const blankWorld = createBlankWorld(64);
		const world = {
			...blankWorld,
			planet: { ...blankWorld.planet, dayLengthHours: 10 },
		};
		harness.setWorld(world);
		harness.scheduler.refreshNow();
		harness.setWorld(createBlankWorld(64));
		await finish(harness.asked[0]);
		expect(harness.store.winds.result?.dayLengthHours).toBe(10);
	});

	it('answers an answer that came with no pass as a failure', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.asked[0]?.resolve({
			superseded: false,
			result: { dayLengthHours: 24, passes: 1, settled: true, changeC: 0 },
		});
		await settle();
		expect(harness.errors).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('empty');
		expect(harness.store.winds.status).toBe('empty');
	});
});

describe('createClimateScheduler starting from a settled climate only', () => {
	it('starts from the last pass of the last climate that settled, kept apart from the store', async () => {
		const { scheduler, asked, first, store } = await createAnsweredHarness(4);
		scheduler.refreshNow();
		expect(asked[1]?.start).toEqual(startOf(first));
		// The store holds the passes of the climate under way, not the start.
		tellPass(asked[1], 1);
		expect(store.temperature.result).not.toBe(first.temperature);
		scheduler.refreshNow();
		expect(asked[2]?.start).toEqual(startOf(first));
	});

	it('hands on the temperature’s months (the air’s and the sea’s), state and record, the eastward and northward winds, the currents’ flows and streamfunction and the day length, and nothing else', async () => {
		const { scheduler, asked, first } = await createAnsweredHarness();
		scheduler.refreshNow();
		const start = asked[1]?.start;
		expect(Object.keys(start ?? {}).sort()).toEqual([
			'currents',
			'dayLengthHours',
			'temperature',
			'winds',
		]);
		expect(Object.keys(start?.currents ?? {}).sort()).toEqual([
			'flows',
			'streamfunction',
		]);
		expect(start?.currents?.flows).toBe(first.currents.flows);
		expect(start?.currents?.streamfunction).toBe(first.currents.streamfunction);
		expect(Object.keys(start?.temperature ?? {}).sort()).toEqual([
			'months',
			'seaMonths',
			'solvedFor',
			'state',
		]);
		expect(Object.keys(start?.winds ?? {}).sort()).toEqual(['east', 'north']);
		expect(start?.temperature.state).toBe(first.temperature.state);
		expect(start?.temperature.months).toBe(first.temperature.months);
		expect(start?.temperature.seaMonths).toBe(first.temperature.seaMonths);
		expect(start?.winds.east).toBe(first.winds.east);
		expect(start?.dayLengthHours).toBe(24);
	});

	it('leaves the currents out of the start when the pass it is carried on from has none', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		const asked = harness.asked[0];
		asked?.callbacks.onPass({
			...climatePassOf(1, { last: true, settled: true }),
			currents: undefined as never,
		});
		asked?.resolve({
			superseded: false,
			result: { dayLengthHours: 24, passes: 1, settled: true, changeC: 0 },
		});
		await settle();
		harness.scheduler.refreshNow();
		const start = harness.asked[1]?.start;
		expect(start).toBeDefined();
		expect('currents' in (start ?? {})).toBe(false);
	});

	it('shows a climate that ended unsettled as current, but starts the next from the settled one before it', async () => {
		const { scheduler, asked, first, store } = await createAnsweredHarness(1);
		scheduler.refreshNow();
		const unsettled = await finish(asked[1], 8, { settled: false });
		expect(store.temperature).toMatchObject({
			status: 'current',
			result: unsettled.temperature,
		});
		scheduler.refreshNow();
		expect(asked[2]?.start).toEqual(startOf(first));
	});

	it('starts from nothing when no climate has settled', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		await finish(harness.asked[0], 8, { settled: false });
		harness.scheduler.refreshNow();
		expect(harness.asked[1]?.start).toBeUndefined();
	});
});

describe('createClimateScheduler while paused', () => {
	it('asks for nothing, however many changes come', async () => {
		const harness = createClimateHarness();
		harness.scheduler.setRunning(false);
		harness.scheduler.refresh();
		harness.scheduler.refresh();
		harness.scheduler.refreshNow();
		expect(harness.timers.pending()).toBe(0);
		await wait(harness);
		expect(harness.asked).toHaveLength(0);
		expect(harness.store.temperature.status).toBe('empty');
	});

	it('only marks the results on hand out of date', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.setRunning(false);
		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('outOfDate');
		expect(harness.store.winds.status).toBe('outOfDate');
	});

	it('only marks the results on hand out of date for a change asked for at once', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.setRunning(false);
		harness.scheduler.refreshNow();
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('outOfDate');

		harness.scheduler.setRunning(true);
		expect(harness.asked).toHaveLength(2);
	});

	it('leaves a new world unsolved, with the store empty, until it runs again', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.setRunning(false);
		harness.scheduler.reset();
		harness.scheduler.refreshNow();
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature).toEqual(EMPTY_TEMPERATURE);
		expect(harness.store.winds).toEqual({ status: 'empty', result: null });

		harness.scheduler.setRunning(true);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toBeUndefined();
		expect(harness.store.temperature.status).toBe('calculating');
	});
});

describe('createClimateScheduler paused', () => {
	it('cancels a request waiting for the wait to end', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.refresh();
		harness.scheduler.setRunning(false);
		expect(harness.timers.pending()).toBe(0);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('outOfDate');
	});

	it('cancels a request waiting for a stroke, and asks it when run again', async () => {
		let busy = true;
		const harness = createClimateHarness({ isBusy: () => busy });
		harness.scheduler.refreshNow();
		harness.scheduler.setRunning(false);
		busy = false;
		await wait(harness);
		expect(harness.asked).toHaveLength(0);

		harness.scheduler.setRunning(true);
		expect(harness.asked).toHaveLength(1);
	});

	it('lets the pass under way finish, shows it, and then ends the climate, both layers out of date', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		const asked = harness.asked[0];
		tellPass(asked, 1);
		harness.scheduler.setRunning(false);
		expect(harness.cancelled()).toBe(0);
		expect(harness.store.temperature.status).toBe('calculating');

		const reached = tellPass(asked, 2);
		expect(harness.cancelled()).toBe(1);
		expect(harness.store.temperature).toEqual({
			status: 'outOfDate',
			result: reached.temperature,
			progress: null,
			pass: null,
		});
		expect(harness.store.winds).toEqual({
			status: 'outOfDate',
			result: solvedOf(reached),
		});

		// The ended request's later passes, if any came, are not kept.
		tellPass(asked, 3);
		asked?.callbacks.onProgress(progressOf(1), 4);
		await settle();
		expect(harness.store.temperature.result).toBe(reached.temperature);
		expect(harness.store.temperature.progress).toBeNull();
		expect(harness.errors).toEqual([]);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('carries on from the pass reached when run again, at once', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		tellPass(harness.asked[0], 1);
		harness.scheduler.setRunning(false);
		const reached = tellPass(harness.asked[0], 2);
		await settle();

		harness.scheduler.setRunning(true);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toEqual(startOf(reached));
		expect(harness.store.temperature).toMatchObject({
			status: 'calculating',
			result: reached.temperature,
			pass: 3,
		});
		expect(harness.timers.started()).toBe(0);

		// Only once: the request after it starts from a settled climate.
		const last = await finish(harness.asked[1], 1);
		expect(harness.store.temperature.status).toBe('current');
		harness.scheduler.refreshNow();
		expect(harness.asked[2]?.start).toEqual(startOf(last));
		expect(harness.store.temperature.pass).toBe(1);
	});

	it('numbers the passes of a climate carried on after a pause on from the pass reached, each time it is paused', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		tellPass(harness.asked[0], 1);
		harness.scheduler.setRunning(false);
		tellPass(harness.asked[0], 2);
		await settle();

		harness.scheduler.setRunning(true);
		const resumed = harness.asked[1];
		// The worker counts this request's passes from 1 again.
		resumed?.callbacks.onProgress(progressOf(1), 1);
		expect(harness.store.temperature.pass).toBe(3);
		tellPass(resumed, 1);
		expect(harness.store.temperature.pass).toBe(4);
		harness.scheduler.setRunning(false);
		tellPass(resumed, 2);
		await settle();

		// Stopped after its pass 4: the next carries on as pass 5.
		harness.scheduler.setRunning(true);
		expect(harness.store.temperature.pass).toBe(5);
		harness.asked[2]?.callbacks.onProgress(progressOf(2), 1);
		expect(harness.store.temperature.pass).toBe(5);
		tellPass(harness.asked[2], 1, { last: true, settled: true });
		expect(harness.store.temperature.pass).toBe(5);
	});

	it('says the climate is refined, by the pass after the one reached, with a bar that never falls, across a pause and the resume', async () => {
		const harness = createClimateHarness();
		const said: CalculationContent[] = [];
		const tell = (paused: boolean): void => {
			said.push(calculationContent(harness.store.temperature, paused));
		};
		harness.scheduler.refreshNow();
		tell(false);
		harness.asked[0]?.callbacks.onProgress(
			{ ...progressOf(3), estimatedYearsLeft: 1 },
			1,
		);
		tell(false);
		tellPass(harness.asked[0], 1);
		tell(false);
		harness.scheduler.setRunning(false);
		tell(true);
		tellPass(harness.asked[0], 2);
		await settle();
		tell(true);
		harness.scheduler.setRunning(true);
		tell(false);
		harness.asked[1]?.callbacks.onProgress(
			{ ...progressOf(1), estimatedYearsLeft: 4 },
			1,
		);
		tell(false);

		expect(said.map((content) => content.status)).toEqual([
			CALCULATING_CLIMATE_TEXT,
			CALCULATING_CLIMATE_TEXT,
			refiningClimateText(2),
			refiningClimateText(2),
			PAUSED_TEXT,
			refiningClimateText(3),
			refiningClimateText(3),
		]);
		// The bar never falls back: once there is a number, every line but
		// the paused one has a bar whose fraction is a number no smaller
		// than the one before.
		let before: number | null = null;
		for (const content of said) {
			if (content.status === PAUSED_TEXT) {
				continue;
			}
			if (before === null) {
				before = content.bar?.fraction ?? null;
				continue;
			}
			expect(content.bar).not.toBeNull();
			const fraction = content.bar?.fraction ?? null;
			expect(fraction).not.toBeNull();
			expect(fraction ?? 0).toBeGreaterThanOrEqual(before);
			before = fraction ?? before;
		}
		expect(said.at(-1)?.bar).toEqual({ fraction: 1 });
	});

	it('starts from the settled climate, not the pass reached, when the world changed while paused', async () => {
		const { scheduler, asked, first, store } = await createAnsweredHarness();
		scheduler.refreshNow();
		scheduler.setRunning(false);
		tellPass(asked[1], 1);
		await settle();
		scheduler.refresh();

		scheduler.setRunning(true);
		expect(asked).toHaveLength(3);
		expect(asked[2]?.start).toEqual(startOf(first));
		// Its passes are counted from 1 again, not from the pass reached.
		expect(store.temperature.pass).toBe(1);
	});

	it('starts from the settled climate when the world changed between the request and its pass', async () => {
		const { scheduler, asked, first, store } = await createAnsweredHarness();
		scheduler.refreshNow();
		scheduler.setRunning(false);
		scheduler.refresh();
		const reached = tellPass(asked[1], 1);
		await settle();
		expect(store.temperature).toMatchObject({
			status: 'outOfDate',
			result: reached.temperature,
		});

		scheduler.setRunning(true);
		expect(asked[2]?.start).toEqual(startOf(first));
		expect(store.temperature.pass).toBe(1);
	});

	it('keeps the answer as current when the pass under way is the last, and asks nothing when run again', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		tellPass(harness.asked[0], 1);
		harness.scheduler.setRunning(false);

		const last = await finish(harness.asked[0], 2);
		expect(harness.cancelled()).toBe(0);
		expect(harness.store.temperature).toMatchObject({
			status: 'current',
			result: last.temperature,
		});
		expect(harness.store.winds.status).toBe('current');
		harness.scheduler.setRunning(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('keeps that answer as out of date if the world changed meanwhile, and asks again from it when run again', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.setRunning(false);
		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.asked).toHaveLength(1);

		const last = await finish(harness.asked[0], 1);
		expect(harness.store.temperature).toMatchObject({
			status: 'outOfDate',
			result: last.temperature,
		});

		harness.scheduler.setRunning(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toEqual(startOf(last));
	});

	it('carries on, asking nothing, when run again before the pass under way has finished', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		tellPass(harness.asked[0], 1);
		harness.scheduler.setRunning(false);
		harness.scheduler.setRunning(true);

		const second = tellPass(harness.asked[0], 2);
		expect(harness.cancelled()).toBe(0);
		expect(harness.store.temperature).toMatchObject({
			status: 'calculating',
			result: second.temperature,
			pass: 3,
		});
		await finish(harness.asked[0], 3);
		expect(harness.store.temperature.status).toBe('current');
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('asks again at once when run again before the pass has finished, if the world changed meanwhile', () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.setRunning(false);
		harness.scheduler.refresh();
		harness.scheduler.setRunning(true);
		expect(harness.asked).toHaveLength(2);
		// The first, overtaken, is ended by the service, not stopped here.
		tellPass(harness.asked[0], 1);
		expect(harness.cancelled()).toBe(0);
	});

	it('ends a climate under way at once for a new world', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.setRunning(false);
		harness.scheduler.reset();
		expect(harness.cancelled()).toBe(1);
		tellPass(harness.asked[0], 1);
		await settle();
		expect(harness.store.temperature).toEqual(EMPTY_TEMPERATURE);
		expect(harness.store.winds).toEqual({ status: 'empty', result: null });
	});
});

describe('createClimateScheduler run again after a pause', () => {
	it('asks once, at once, with no wait, when there is no result yet', async () => {
		const harness = createClimateHarness();
		harness.scheduler.setRunning(false);
		harness.scheduler.refresh();
		harness.scheduler.setRunning(true);
		// Before anything else runs: the climate never reads as not
		// calculated once the calculation runs again.
		expect(harness.asked).toHaveLength(1);
		expect(harness.asked[0]?.start).toBeUndefined();
		expect(harness.store.temperature).toMatchObject({
			status: 'calculating',
			result: null,
		});
		expect(harness.timers.started()).toBe(0);

		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('waits for a stroke under way, and asks when it is over', async () => {
		let busy = true;
		const harness = createClimateHarness({ isBusy: () => busy });
		harness.scheduler.setRunning(false);
		harness.scheduler.refresh();
		harness.scheduler.setRunning(true);
		expect(harness.asked).toHaveLength(0);
		await wait(harness);
		expect(harness.asked).toHaveLength(0);

		busy = false;
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('asks once for every change made meanwhile, at once, starting from the settled climate', async () => {
		const { scheduler, asked, first, timers } = await createAnsweredHarness();
		scheduler.setRunning(false);
		scheduler.refresh();
		scheduler.refresh();
		scheduler.refreshNow();

		scheduler.setRunning(true);
		expect(asked).toHaveLength(2);
		expect(asked[1]?.start).toEqual(startOf(first));
		timers.advance(WAIT_MS * 2);
		await settle();
		expect(asked).toHaveLength(2);
	});

	it('asks nothing when nothing changed meanwhile', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.setRunning(false);
		harness.scheduler.setRunning(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('current');
	});

	it('does nothing for being told what is already so', async () => {
		const harness = createClimateHarness();
		harness.scheduler.setRunning(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(0);

		harness.scheduler.refreshNow();
		harness.scheduler.setRunning(true);
		expect(harness.asked).toHaveLength(1);
		harness.scheduler.setRunning(false);
		harness.scheduler.setRunning(false);
		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.timers.started()).toBe(0);
	});

	it('asks once for being paused and run again twice in quick succession', async () => {
		const harness = createClimateHarness();
		harness.scheduler.setRunning(false);
		harness.scheduler.refresh();
		harness.scheduler.setRunning(true);
		harness.scheduler.setRunning(false);
		harness.scheduler.setRunning(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('calculating');
	});
});

describe('createClimateScheduler while running', () => {
	it('asks once after a run of changes, starting from the settled climate, the last pass on show meanwhile', async () => {
		const { scheduler, asked, first, timers, store } =
			await createAnsweredHarness();
		scheduler.refresh();
		expect(store.temperature.status).toBe('outOfDate');
		expect(store.winds.status).toBe('outOfDate');
		timers.advance(WAIT_MS / 2);
		scheduler.refresh();
		timers.advance(WAIT_MS / 2);
		await settle();
		expect(asked).toHaveLength(1);

		timers.advance(WAIT_MS / 2);
		await settle();
		expect(asked).toHaveLength(2);
		expect(asked[1]?.start).toEqual(startOf(first));
		expect(store.temperature).toMatchObject({
			status: 'calculating',
			result: first.temperature,
		});
		expect(store.winds).toEqual({
			status: 'calculating',
			result: solvedOf(first),
		});
	});

	it('holds a request during a stroke and makes it once after', async () => {
		let busy = true;
		const harness = createClimateHarness({ isBusy: () => busy });
		harness.scheduler.refresh();
		await wait(harness);
		await wait(harness);
		expect(harness.asked).toHaveLength(0);

		busy = false;
		await wait(harness);
		await wait(harness);
		expect(harness.asked).toHaveLength(1);
	});

	it('starts again for an edit mid-loop: the climate under way is overtaken, and its passes are not kept once it is', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		const old = harness.asked[0];
		tellPass(old, 1);
		harness.scheduler.refresh();
		// Until the new request is made, the climate under way goes on.
		const second = tellPass(old, 2);
		expect(harness.store.temperature).toMatchObject({
			status: 'calculating',
			result: second.temperature,
		});

		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.store.temperature.pass).toBe(1);
		old?.resolve({ superseded: true });
		tellPass(old, 3);
		await settle();
		expect(harness.store.temperature.result).toBe(second.temperature);
		expect(harness.cancelled()).toBe(0);

		const last = await finish(harness.asked[1], 2);
		expect(harness.store.temperature).toMatchObject({
			status: 'current',
			result: last.temperature,
		});
	});

	it('keeps a climate that a later change overtook as out of date, then asks from it', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.refresh();
		const early = await finish(harness.asked[0], 2);
		expect(harness.store.temperature).toMatchObject({
			status: 'outOfDate',
			result: early.temperature,
		});
		expect(harness.store.winds.status).toBe('outOfDate');

		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toEqual(startOf(early));
	});

	it('keeps only the newest climate: an overtaken request changes nothing', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.refresh();
		await wait(harness);
		harness.asked[0]?.resolve({ superseded: true });
		await settle();
		expect(harness.store.temperature).toMatchObject({
			status: 'calculating',
			result: null,
		});

		const newest = await finish(harness.asked[1], 4);
		expect(harness.store.temperature).toMatchObject({
			status: 'current',
			result: newest.temperature,
		});
	});

	it('keeps the progress and the passes of the newest request only', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.asked[0]?.callbacks.onProgress(progressOf(1), 1);
		expect(harness.store.temperature.progress).toEqual(progressOf(1));

		harness.scheduler.refresh();
		await wait(harness);
		expect(harness.store.temperature.progress).toBeNull();
		harness.asked[0]?.callbacks.onProgress(progressOf(2), 1);
		tellPass(harness.asked[0], 1);
		expect(harness.store.temperature).toMatchObject({
			progress: null,
			result: null,
			pass: 1,
		});
		harness.asked[1]?.callbacks.onProgress(progressOf(1), 1);
		expect(harness.store.temperature.progress).toEqual(progressOf(1));
	});

	it('marks both results out of date on a failure, keeps them, records why and asks again at the next change', async () => {
		const { scheduler, asked, first, store, errors, timers } =
			await createAnsweredHarness();
		scheduler.refresh();
		timers.advance(WAIT_MS);
		await settle();
		const failure = new Error('the climate failed');
		asked[1]?.reject(failure);
		await settle();
		expect(store.temperature).toEqual({
			status: 'outOfDate',
			result: first.temperature,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({
			status: 'outOfDate',
			result: solvedOf(first),
		});
		expect(errors).toEqual([failure]);

		scheduler.refresh();
		timers.advance(WAIT_MS);
		await settle();
		expect(asked).toHaveLength(3);
		expect(asked[2]?.start).toEqual(startOf(first));
	});

	it('asks again when run again after a failure', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.asked[0]?.reject(new Error('no'));
		await settle();
		harness.scheduler.setRunning(false);
		harness.scheduler.setRunning(true);
		await wait(harness);
		expect(harness.asked).toHaveLength(2);
	});
});

describe('createClimateScheduler told the world was replaced', () => {
	it('leaves the store empty, then calculating once asked, from nothing', async () => {
		const harness = await createAnsweredHarness();
		const statuses: string[] = [];
		harness.store.addListener((layer) => statuses.push(layer.status));

		harness.scheduler.reset();
		expect(harness.store.temperature).toEqual(EMPTY_TEMPERATURE);
		expect(harness.store.winds).toEqual({ status: 'empty', result: null });
		harness.scheduler.refresh();
		await wait(harness);
		expect(statuses).toEqual(['empty', 'calculating']);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toBeUndefined();
	});

	it('drops the answer, the passes and the progress of a request made before, while none is under way', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.reset();

		harness.asked[0]?.callbacks.onProgress(progressOf(3), 1);
		tellPass(harness.asked[0], 1);
		await finish(harness.asked[0], 2);
		expect(harness.store.temperature).toEqual(EMPTY_TEMPERATURE);
		expect(harness.store.winds).toEqual({ status: 'empty', result: null });
		expect(harness.cancelled()).toBe(0);
	});

	it('drops the answer, the passes and the progress of a request made before, once the next is under way', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.reset();
		harness.scheduler.refresh();
		await wait(harness);

		harness.asked[0]?.callbacks.onProgress(progressOf(3), 1);
		await finish(harness.asked[0], 9);
		expect(harness.store.temperature).toEqual({
			status: 'calculating',
			result: null,
			progress: null,
			pass: 1,
		});
	});

	it('drops the answer of a climate under way while paused, and keeps the store empty', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.setRunning(false);
		harness.scheduler.reset();
		harness.scheduler.refreshNow();

		await finish(harness.asked[0], 9);
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('empty');
	});

	it('forgets the settled climate and the pass reached, so the new world starts from nothing', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.setRunning(false);
		tellPass(harness.asked[1], 1);
		harness.scheduler.reset();
		harness.scheduler.setRunning(true);
		expect(harness.asked).toHaveLength(3);
		expect(harness.asked[2]?.start).toBeUndefined();
		expect(harness.store.temperature.pass).toBe(1);
	});
});

describe('createClimateScheduler told of a change to ask for at once', () => {
	it('asks at once, with no wait, starting from the settled climate', async () => {
		const { scheduler, asked, first, store, timers } =
			await createAnsweredHarness();
		const started = timers.started();

		scheduler.refreshNow();
		expect(asked).toHaveLength(2);
		expect(asked[1]?.start).toEqual(startOf(first));
		expect(store.temperature.status).toBe('calculating');
		expect(timers.started()).toBe(started);

		timers.advance(WAIT_MS);
		await settle();
		expect(asked).toHaveLength(2);
	});

	it('leaves the store empty and then calculating, with nothing between, for a world replaced', async () => {
		const harness = await createAnsweredHarness();
		const statuses: string[] = [];
		harness.store.addListener((layer) => statuses.push(layer.status));

		harness.scheduler.reset();
		harness.scheduler.refreshNow();
		expect(statuses).toEqual(['empty', 'calculating']);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toBeUndefined();
	});

	it('ends with the last world’s climate alone as current, for two worlds replaced in a row', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.reset();
		harness.scheduler.refreshNow();
		harness.scheduler.reset();
		harness.scheduler.refreshNow();
		expect(harness.asked).toHaveLength(3);

		// The first new world's answer is for a world that is gone.
		await finish(harness.asked[1], 8);
		expect(harness.store.temperature).toMatchObject({
			status: 'calculating',
			result: null,
		});

		const last = await finish(harness.asked[2], 9);
		expect(harness.store.temperature).toMatchObject({
			status: 'current',
			result: last.temperature,
		});
		await wait(harness);
		expect(harness.asked).toHaveLength(3);
	});

	it('takes the place of a wait under way, so that one request is made', async () => {
		const harness = await createAnsweredHarness();
		harness.scheduler.refresh();
		harness.scheduler.refreshNow();
		expect(harness.asked).toHaveLength(2);
		await wait(harness);
		expect(harness.asked).toHaveLength(2);
	});

	it('waits for a stroke under way, as a change does', async () => {
		let busy = false;
		const harness = createClimateHarness({ isBusy: () => busy });
		harness.scheduler.refreshNow();
		expect(harness.asked).toHaveLength(1);

		busy = true;
		harness.scheduler.refreshNow();
		expect(harness.asked).toHaveLength(1);
		expect(harness.store.temperature.status).toBe('calculating');
		busy = false;
		await wait(harness);
		expect(harness.asked).toHaveLength(2);
	});
});

describe('createClimateScheduler marked unavailable', () => {
	it('marks both layers so, keeps their results, and asks nothing again', async () => {
		const { scheduler, asked, first, store, timers } =
			await createAnsweredHarness();
		scheduler.refresh();
		scheduler.markUnavailable();
		timers.advance(WAIT_MS);
		await settle();
		scheduler.setRunning(false);
		scheduler.setRunning(true);
		scheduler.refresh();
		timers.advance(WAIT_MS);
		await settle();
		expect(asked).toHaveLength(1);
		expect(store.temperature).toMatchObject({
			status: 'unavailable',
			result: first.temperature,
		});
		expect(store.winds).toEqual({
			status: 'unavailable',
			result: solvedOf(first),
		});
	});

	it('keeps no pass or answer still on its way', async () => {
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		harness.scheduler.markUnavailable();
		tellPass(harness.asked[0], 1);
		await finish(harness.asked[0], 2);
		expect(harness.store.temperature).toMatchObject({
			status: 'unavailable',
			result: null,
		});
		expect(harness.store.winds).toEqual({
			status: 'unavailable',
			result: null,
		});
	});
});

describe('createClimateScheduler with a store listener that throws', () => {
	/** Has the store's listener throw on each change to that status. */
	const throwOn = (harness: ClimateHarness, status: LayerStatus): Error => {
		const failure = new Error(`could not show ${status}`);
		harness.store.addListener((layer) => {
			if (layer.status === status) {
				throw failure;
			}
		});
		return failure;
	};

	it('still schedules and makes exactly one request after a change that marks the results out of date', async () => {
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
		const harness = createClimateHarness();
		harness.scheduler.refreshNow();
		const failure = throwOn(harness, 'empty');

		harness.scheduler.reset();
		harness.scheduler.refresh();
		await finish(harness.asked[0], 9);
		expect(harness.store.temperature).toEqual(EMPTY_TEMPERATURE);

		await wait(harness);
		expect(harness.asked).toHaveLength(2);
		expect(harness.asked[1]?.start).toBeUndefined();
		expect(harness.reported).toEqual([failure]);
	});

	it('still asks for the climate and keeps its passes and answer when the listener throws on calculating', async () => {
		const harness = createClimateHarness();
		const failure = throwOn(harness, 'calculating');
		harness.scheduler.refreshNow();
		expect(harness.asked).toHaveLength(1);

		const last = await finish(harness.asked[0], 2);
		expect(harness.store.temperature).toMatchObject({
			status: 'current',
			result: last.temperature,
		});
		// Told once as it was asked for and once for the pass it showed.
		expect(harness.reported).toEqual([failure, failure]);
		expect(harness.errors).toEqual([]);
	});
});
