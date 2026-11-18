import { describe, expect, it } from 'vitest';
import {
	AUTOSAVE_DELAY_MS,
	type Autosave,
	type AutosaveState,
	createAutosave,
} from './autosave';

/** Timers that run only when the test moves the clock on. */
type FakeTimers = {
	readonly setTimer: (callback: () => void, delayMs: number) => number;
	readonly clearTimer: (handle: number) => void;
	/** How many timers are waiting. */
	pending(): number;
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

/** A save the test settles by hand. */
type Save = {
	/** What the world held when the save was made. */
	readonly world: number;
	resolve(): void;
	reject(error: unknown): void;
};

type Harness = {
	readonly autosave: Autosave;
	readonly timers: FakeTimers;
	/** Every save made so far, in order. */
	readonly saves: Save[];
	readonly states: AutosaveState[];
	readonly errors: unknown[];
	/** Stands for the world: a number the test changes. */
	world: number;
	/** Whether a change is under way. */
	busy: boolean;
};

const DELAY_MS = 1000;

/**
 * An autosave over fake timers and saves settled by hand, already started
 * unless `started` is false.
 */
const createHarness = ({
	started = true,
}: {
	readonly started?: boolean;
} = {}): Harness => {
	const timers = createFakeTimers();
	const harness: Harness = {
		timers,
		saves: [],
		states: [],
		errors: [],
		world: 0,
		busy: false,
		autosave: createAutosave<number>({
			save: () =>
				new Promise((resolve, reject) => {
					harness.saves.push({ world: harness.world, resolve, reject });
				}),
			delayMs: DELAY_MS,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
			isBusy: () => harness.busy,
			onState: (state) => harness.states.push(state),
			onError: (error) => harness.errors.push(error),
		}),
	};
	if (started) {
		harness.autosave.start();
	}
	return harness;
};

/** Lets every promise that is already settled run its reactions. */
const settle = async (): Promise<void> => {
	for (let turn = 0; turn < 5; turn++) {
		await Promise.resolve();
	}
};

describe('AUTOSAVE_DELAY_MS', () => {
	it('is about a second', () => {
		expect(AUTOSAVE_DELAY_MS).toBe(1000);
	});
});

describe('createAutosave', () => {
	it('saves nothing until it is told of a change', async () => {
		const { timers, saves, states } = createHarness();
		timers.advance(60_000);
		await settle();
		expect(saves).toHaveLength(0);
		expect(states).toEqual([]);
	});

	it('saves once the delay has passed, and not before', async () => {
		const { autosave, timers, saves } = createHarness();
		autosave.markChanged();
		timers.advance(DELAY_MS - 1);
		await settle();
		expect(saves).toHaveLength(0);

		timers.advance(1);
		await settle();
		expect(saves).toHaveLength(1);
		expect(timers.pending()).toBe(0);
	});

	it('says the world is saved once the save is stored, and not before', async () => {
		const { autosave, timers, saves, states, errors } = createHarness();
		autosave.markChanged();
		timers.advance(DELAY_MS);
		await settle();
		expect(states).toEqual([]);

		saves[0]?.resolve();
		await settle();
		expect(states).toEqual(['saved']);
		expect(errors).toEqual([]);
	});

	it('folds a run of changes into one save after the last', async () => {
		const { autosave, timers, saves } = createHarness();
		for (let change = 0; change < 20; change++) {
			autosave.markChanged();
			timers.advance(DELAY_MS - 100);
		}
		await settle();
		expect(saves).toHaveLength(0);
		expect(timers.pending()).toBe(1);

		timers.advance(100);
		await settle();
		expect(saves).toHaveLength(1);
	});

	it('saves the world as it is when the wait ends', async () => {
		const harness = createHarness();
		harness.world = 1;
		harness.autosave.markChanged();
		harness.world = 2;
		harness.timers.advance(DELAY_MS);
		harness.world = 3;
		await settle();
		expect(harness.saves.map((save) => save.world)).toEqual([2]);
	});

	it('says storage is unavailable when a save fails, and passes the error on', async () => {
		const { autosave, timers, saves, states, errors } = createHarness();
		const failure = new Error('no room left');
		autosave.markChanged();
		timers.advance(DELAY_MS);
		saves[0]?.reject(failure);
		await settle();
		expect(states).toEqual(['unavailable']);
		expect(errors).toEqual([failure]);
	});

	it('reports a save that throws like one that fails', async () => {
		const timers = createFakeTimers();
		const states: AutosaveState[] = [];
		const errors: unknown[] = [];
		const failure = new Error('storage is forbidden');
		const autosave = createAutosave<number>({
			save: () => {
				throw failure;
			},
			delayMs: DELAY_MS,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
			onState: (state) => states.push(state),
			onError: (error) => errors.push(error),
		});
		autosave.start();
		autosave.markChanged();
		expect(() => timers.advance(DELAY_MS)).not.toThrow();
		await settle();
		expect(states).toEqual(['unavailable']);
		expect(errors).toEqual([failure]);
		expect(() => autosave.flush()).not.toThrow();
	});

	it('works with nobody to pass errors on to and nothing ever under way', async () => {
		const timers = createFakeTimers();
		const states: AutosaveState[] = [];
		let outcome: 'fail' | 'store' = 'fail';
		const autosave = createAutosave<number>({
			save: () =>
				outcome === 'fail'
					? Promise.reject(new Error('refused'))
					: Promise.resolve(),
			delayMs: DELAY_MS,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
			onState: (state) => states.push(state),
		});
		autosave.start();
		autosave.markChanged();
		timers.advance(DELAY_MS);
		await settle();
		expect(states).toEqual(['unavailable']);

		outcome = 'store';
		autosave.markChanged();
		autosave.flush();
		await settle();
		expect(states).toEqual(['unavailable', 'saved']);
	});

	it('tries again at the next change after a failure, and not before', async () => {
		const { autosave, timers, saves, states } = createHarness();
		autosave.markChanged();
		timers.advance(DELAY_MS);
		saves[0]?.reject(new Error('refused'));
		await settle();
		timers.advance(60_000);
		await settle();
		expect(saves).toHaveLength(1);

		autosave.markChanged();
		timers.advance(DELAY_MS);
		saves[1]?.resolve();
		await settle();
		expect(states).toEqual(['unavailable', 'saved']);
	});

	it('does not try a failed save again by itself, however often it fails', async () => {
		const { autosave, timers, saves, states } = createHarness();
		autosave.markChanged();
		timers.advance(DELAY_MS);
		saves[0]?.reject(new Error('refused'));
		await settle();
		expect(timers.pending()).toBe(0);

		// Each flush makes one attempt, and a failed one leaves no wait.
		for (let attempt = 1; attempt <= 3; attempt++) {
			autosave.flush();
			expect(saves).toHaveLength(attempt + 1);
			saves[attempt]?.reject(new Error('refused'));
			await settle();
			timers.advance(60_000);
			await settle();
			expect(saves).toHaveLength(attempt + 1);
			expect(timers.pending()).toBe(0);
		}
		expect(states).toEqual([
			'unavailable',
			'unavailable',
			'unavailable',
			'unavailable',
		]);
	});

	it('puts a save off while a change is under way', async () => {
		const harness = createHarness();
		const { autosave, timers, saves } = harness;
		autosave.markChanged();
		harness.busy = true;
		timers.advance(DELAY_MS * 5);
		await settle();
		expect(saves).toHaveLength(0);
		expect(timers.pending()).toBe(1);

		// The wait that was running when the change ended runs its course.
		harness.busy = false;
		harness.world = 7;
		timers.advance(DELAY_MS - 1);
		expect(saves).toHaveLength(0);
		timers.advance(1);
		await settle();
		expect(saves.map((save) => save.world)).toEqual([7]);
		expect(timers.pending()).toBe(0);
	});

	it('never has two saves being stored at once', async () => {
		const harness = createHarness();
		const { autosave, timers, saves, states } = harness;
		harness.world = 1;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		expect(saves).toHaveLength(1);

		// Several more fall due while the first is still being stored.
		for (let change = 2; change <= 4; change++) {
			harness.world = change;
			autosave.markChanged();
			timers.advance(DELAY_MS);
			await settle();
		}
		expect(saves).toHaveLength(1);
		expect(states).toEqual([]);

		// One save follows the first, of the world as it is by then.
		harness.world = 5;
		saves[0]?.resolve();
		await settle();
		expect(saves.map((save) => save.world)).toEqual([1, 5]);
		expect(states).toEqual(['saved']);

		saves[1]?.resolve();
		await settle();
		timers.advance(60_000);
		await settle();
		expect(saves).toHaveLength(2);
		expect(states).toEqual(['saved', 'saved']);
	});

	it('follows a failed save with the one that fell due meanwhile', async () => {
		const { autosave, timers, saves, states } = createHarness();
		autosave.markChanged();
		timers.advance(DELAY_MS);
		autosave.markChanged();
		timers.advance(DELAY_MS);
		saves[0]?.reject(new Error('refused'));
		await settle();
		expect(saves).toHaveLength(2);
		saves[1]?.resolve();
		await settle();
		expect(states).toEqual(['unavailable', 'saved']);
	});

	it('leaves a change made during a save to its own wait', async () => {
		const harness = createHarness();
		const { autosave, timers, saves } = harness;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		harness.world = 9;
		autosave.markChanged();
		saves[0]?.resolve();
		await settle();
		expect(saves).toHaveLength(1);

		timers.advance(DELAY_MS);
		await settle();
		expect(saves.map((save) => save.world)).toEqual([0, 9]);
	});

	it('drops a wait still running when a save that fell due begins', async () => {
		const harness = createHarness();
		const { autosave, timers, saves } = harness;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		// One falls due during the first save, and a later change starts
		// a wait of its own.
		autosave.markChanged();
		timers.advance(DELAY_MS);
		harness.world = 4;
		autosave.markChanged();
		expect(timers.pending()).toBe(1);

		saves[0]?.resolve();
		await settle();
		expect(saves.map((save) => save.world)).toEqual([0, 4]);
		expect(timers.pending()).toBe(0);
	});

	it('puts off a save that fell due if a change is under way when its turn comes', async () => {
		const harness = createHarness();
		const { autosave, timers, saves } = harness;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		autosave.markChanged();
		timers.advance(DELAY_MS);
		harness.busy = true;
		saves[0]?.resolve();
		await settle();
		expect(saves).toHaveLength(1);
		expect(timers.pending()).toBe(1);

		timers.advance(DELAY_MS);
		expect(saves).toHaveLength(1);
		harness.busy = false;
		timers.advance(DELAY_MS);
		await settle();
		expect(saves).toHaveLength(2);
		expect(timers.pending()).toBe(0);
	});

	it('restarts a wait that is running when a put-off save is put off again', async () => {
		const harness = createHarness();
		const { autosave, timers, saves } = harness;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		autosave.markChanged();
		timers.advance(DELAY_MS);
		autosave.markChanged();
		harness.busy = true;
		saves[0]?.resolve();
		await settle();
		expect(saves).toHaveLength(1);
		expect(timers.pending()).toBe(1);
	});
});

describe('flush', () => {
	it('saves at once a change that is still waiting', async () => {
		const harness = createHarness();
		const { autosave, timers, saves, states } = harness;
		harness.world = 3;
		autosave.markChanged();
		timers.advance(200);
		autosave.flush();
		expect(saves.map((save) => save.world)).toEqual([3]);
		expect(timers.pending()).toBe(0);

		saves[0]?.resolve();
		await settle();
		timers.advance(60_000);
		await settle();
		expect(saves).toHaveLength(1);
		expect(states).toEqual(['saved']);
	});

	it('does nothing when nothing has changed', async () => {
		const { autosave, timers, saves } = createHarness();
		autosave.flush();
		expect(saves).toHaveLength(0);

		autosave.markChanged();
		timers.advance(DELAY_MS);
		saves[0]?.resolve();
		await settle();
		autosave.flush();
		autosave.flush();
		expect(saves).toHaveLength(1);
	});

	it('saves again what a failed save held, with no change since', async () => {
		const harness = createHarness();
		const { autosave, timers, saves, states } = harness;
		harness.world = 5;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		saves[0]?.reject(new Error('refused'));
		await settle();
		expect(states).toEqual(['unavailable']);

		autosave.flush();
		expect(saves.map((save) => save.world)).toEqual([5, 5]);
		saves[1]?.resolve();
		await settle();
		expect(states).toEqual(['unavailable', 'saved']);

		// What was unsaved is saved now, so there is nothing left to flush.
		autosave.flush();
		expect(saves).toHaveLength(2);
	});

	it('does nothing more while the save that holds every change is being stored', () => {
		const { autosave, timers, saves } = createHarness();
		autosave.markChanged();
		timers.advance(DELAY_MS);
		autosave.flush();
		expect(saves).toHaveLength(1);
		expect(timers.pending()).toBe(0);
	});

	it('saves a change waiting out a change that is under way', () => {
		const harness = createHarness();
		const { autosave, timers, saves } = harness;
		autosave.markChanged();
		harness.busy = true;
		timers.advance(DELAY_MS * 2);
		expect(saves).toHaveLength(0);
		autosave.flush();
		expect(saves).toHaveLength(1);
		expect(timers.pending()).toBe(0);
	});

	it('saves the world as it stands when only a change under way is unsaved', () => {
		const harness = createHarness();
		harness.busy = true;
		harness.world = 8;
		harness.autosave.flush();
		expect(harness.saves.map((save) => save.world)).toEqual([8]);
	});

	it('calls save before it returns', () => {
		const timers = createFakeTimers();
		let calls = 0;
		const autosave = createAutosave<number>({
			save: () => {
				calls++;
				return Promise.resolve();
			},
			delayMs: DELAY_MS,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
			onState: () => {},
		});
		autosave.start();
		autosave.markChanged();
		autosave.flush();
		expect(calls).toBe(1);
	});

	it('saves at once alongside a save being stored, and once only', async () => {
		const harness = createHarness();
		const { autosave, timers, saves, states } = harness;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		harness.world = 6;
		autosave.markChanged();
		autosave.flush();
		expect(saves.map((save) => save.world)).toEqual([0, 6]);
		expect(timers.pending()).toBe(0);
		autosave.flush();
		expect(saves).toHaveLength(2);

		saves[0]?.resolve();
		await settle();
		saves[1]?.resolve();
		await settle();
		timers.advance(60_000);
		await settle();
		expect(saves).toHaveLength(2);
		expect(states).toEqual(['saved', 'saved']);
	});

	it('takes with it a save that was waiting for the one being stored', async () => {
		const harness = createHarness();
		const { autosave, timers, saves } = harness;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		// One falls due during the first save, and waits for it.
		autosave.markChanged();
		timers.advance(DELAY_MS);
		expect(saves).toHaveLength(1);

		autosave.flush();
		expect(saves).toHaveLength(2);
		saves[0]?.resolve();
		await settle();
		saves[1]?.resolve();
		await settle();
		expect(saves).toHaveLength(2);
	});

	it('has a save that falls due during two wait for both', async () => {
		const harness = createHarness();
		const { autosave, timers, saves } = harness;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		autosave.markChanged();
		autosave.flush();
		harness.world = 3;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		expect(saves).toHaveLength(2);

		saves[0]?.resolve();
		await settle();
		expect(saves).toHaveLength(2);
		saves[1]?.resolve();
		await settle();
		expect(saves.map((save) => save.world)).toEqual([0, 0, 3]);
	});

	it('goes by the later of two saves when the earlier one fails', async () => {
		const { autosave, timers, saves, states, errors } = createHarness();
		const failure = new Error('refused');
		autosave.markChanged();
		timers.advance(DELAY_MS);
		autosave.markChanged();
		autosave.flush();
		saves[0]?.reject(failure);
		await settle();
		saves[1]?.resolve();
		await settle();
		expect(states).toEqual(['unavailable', 'saved']);
		expect(errors).toEqual([failure]);

		// The later save holds all that the failed one did.
		autosave.flush();
		expect(saves).toHaveLength(2);
	});

	it('does not report an earlier save that settles after a later one', async () => {
		const { autosave, timers, saves, states, errors } = createHarness();
		const failure = new Error('refused');
		autosave.markChanged();
		timers.advance(DELAY_MS);
		autosave.markChanged();
		autosave.flush();
		saves[1]?.resolve();
		await settle();
		saves[0]?.reject(failure);
		await settle();
		expect(states).toEqual(['saved']);
		expect(errors).toEqual([failure]);
		autosave.flush();
		expect(saves).toHaveLength(2);
	});

	it('saves again after the later of two saves fails', async () => {
		const harness = createHarness();
		const { autosave, timers, saves, states } = harness;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		harness.world = 2;
		autosave.markChanged();
		autosave.flush();
		saves[0]?.resolve();
		await settle();
		saves[1]?.reject(new Error('refused'));
		await settle();
		expect(states).toEqual(['saved', 'unavailable']);

		autosave.flush();
		expect(saves.map((save) => save.world)).toEqual([0, 2, 2]);
	});
});

describe('start', () => {
	it('keeps a change made before it from ever being saved', async () => {
		const { autosave, timers, saves, states } = createHarness({
			started: false,
		});
		autosave.markChanged();
		expect(timers.pending()).toBe(0);
		timers.advance(60_000);
		autosave.flush();
		await settle();
		expect(saves).toHaveLength(0);

		autosave.start();
		timers.advance(60_000);
		autosave.flush();
		await settle();
		expect(saves).toHaveLength(0);
		expect(timers.pending()).toBe(0);
		expect(states).toEqual([]);
	});

	it('keeps flush from saving before it, even with a change under way', async () => {
		const harness = createHarness({ started: false });
		harness.busy = true;
		harness.autosave.flush();
		await settle();
		expect(harness.saves).toHaveLength(0);
	});

	it('saves nothing by itself', async () => {
		const { autosave, timers, saves, states } = createHarness({
			started: false,
		});
		autosave.start();
		timers.advance(60_000);
		autosave.flush();
		await settle();
		expect(saves).toHaveLength(0);
		expect(states).toEqual([]);
	});

	it('lets the changes that follow it be saved', async () => {
		const harness = createHarness({ started: false });
		const { autosave, timers, saves, states } = harness;
		harness.world = 1;
		autosave.markChanged();
		autosave.start();
		// Calling it again changes nothing.
		autosave.start();
		harness.world = 2;
		autosave.markChanged();
		timers.advance(DELAY_MS);
		expect(saves.map((save) => save.world)).toEqual([2]);
		saves[0]?.resolve();
		await settle();
		expect(states).toEqual(['saved']);
	});
});
