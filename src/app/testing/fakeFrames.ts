/**
 * Animation frames for tests of whatever draws at them: a request is
 * answered only when the test runs a frame, and every request is counted.
 */

/** Animation frames that come only when the test runs one. */
export type FakeFrames = {
	/** Asks for a callback at the next frame, as `requestAnimationFrame` does. */
	readonly requestFrame: (callback: () => void) => number;
	/** Cancels a request, as `cancelAnimationFrame` does. */
	readonly cancelFrame: (handle: number) => void;
	/** The clock, in milliseconds, as `performance.now` gives it. */
	readonly now: () => number;
	/** How many frames have been asked for so far, cancelled or not. */
	requested(): number;
	/** How many requests are waiting for a frame. */
	pending(): number;
	/**
	 * Moves the clock on and runs a frame: every request waiting when it
	 * starts, in the order made. A request made during the frame waits for
	 * the next.
	 */
	runFrame(ms?: number): void;
};

/**
 * Makes fake animation frames, with the clock at zero and nothing waiting.
 *
 * @param frameMs - How far each frame moves the clock on when no time is
 * given; a sixtieth of a second when left out.
 */
export const createFakeFrames = (frameMs = 1000 / 60): FakeFrames => {
	const waiting = new Map<number, () => void>();
	let time = 0;
	let nextHandle = 1;
	return {
		requestFrame: (callback) => {
			waiting.set(nextHandle, callback);
			return nextHandle++;
		},
		cancelFrame: (handle) => {
			waiting.delete(handle);
		},
		now: () => time,
		requested: () => nextHandle - 1,
		pending: () => waiting.size,
		runFrame: (ms = frameMs) => {
			time += ms;
			// One cancelled by an earlier callback of the frame does not run.
			for (const handle of [...waiting.keys()]) {
				const callback = waiting.get(handle);
				if (callback !== undefined) {
					waiting.delete(handle);
					callback();
				}
			}
		},
	};
};
