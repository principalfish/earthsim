/**
 * Timers for tests of whatever waits: they run only when the test moves the
 * clock on, in the order they fall due.
 */

/** Timers that run only when the test moves the clock on. */
export type FakeTimers = {
	readonly setTimer: (callback: () => void, delayMs: number) => number;
	readonly clearTimer: (handle: number) => void;
	/** How many timers are waiting. */
	pending(): number;
	/** How many timers have been started so far, cancelled or not. */
	started(): number;
	/** Moves the clock on, running the timers that fall due, in order. */
	advance(ms: number): void;
};

/** Makes fake timers, with the clock at zero and nothing waiting. */
export const createFakeTimers = (): FakeTimers => {
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
