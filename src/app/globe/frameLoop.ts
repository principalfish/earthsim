/**
 * When the globe is drawn: once, at the next animation frame, after
 * something has changed; or at every frame while it is animating, as it is
 * while the wind streaks move.
 *
 * The browser's frame requests and its clock are handed in, so the
 * scheduling can be run with stand-ins that count the requests.
 */

/** What the scheduler asks of the browser, and what it draws with. */
export type FrameSchedulerOptions = {
	/**
	 * Asks for a callback at the next animation frame, as
	 * `requestAnimationFrame` does.
	 *
	 * @returns A handle that cancels the request.
	 */
	readonly requestFrame: (callback: () => void) => number;
	/** Cancels a request, as `cancelAnimationFrame` does. */
	readonly cancelFrame: (handle: number) => void;
	/** The time now, in milliseconds, as `performance.now` gives it. */
	readonly now: () => number;
	/**
	 * Draws a frame.
	 *
	 * @param seconds - While animating, the seconds since the frame before,
	 * or since the animation started for its first frame; null for a frame
	 * drawn because something changed.
	 */
	readonly draw: (seconds: number | null) => void;
};

/** The scheduling of the globe's frames. */
export type FrameScheduler = {
	/**
	 * Asks for a frame to be drawn, at most one pending at a time. Nothing
	 * more is asked for while animating: the next frame draws the change.
	 */
	invalidate(): void;
	/**
	 * Draws at once the frame that is pending, if one is, in its place. While
	 * animating, nothing: the next frame of the animation draws it, and
	 * drawing now as well would draw twice.
	 */
	flush(): void;
	/**
	 * Draws a frame at once, as after the canvas is resized, in place of any
	 * frame pending. While animating, the animation carries on.
	 */
	drawNow(): void;
	/**
	 * Starts or stops drawing at every frame. Starting cancels a frame
	 * pending and asks for the first frame of the animation; stopping
	 * cancels the next, and leaves nothing pending.
	 */
	setAnimating(on: boolean): void;
	/** Whether it is drawing at every frame. */
	readonly animating: boolean;
	/** Whether a frame has been asked for and not yet drawn or cancelled. */
	readonly pending: boolean;
	/** Cancels any frame pending and asks for none again. */
	dispose(): void;
};

/**
 * Makes the scheduling of a drawing's frames, drawing nothing until asked.
 *
 * @param options - The browser's frame requests and clock, and what draws.
 * @returns The scheduler, not animating and with nothing pending.
 */
export const createFrameScheduler = (
	options: FrameSchedulerOptions,
): FrameScheduler => {
	const { requestFrame, cancelFrame, now, draw } = options;
	/** The request pending, or 0 for none. */
	let handle = 0;
	let animating = false;
	let disposed = false;
	/** When the animation's last frame was drawn, in milliseconds. */
	let last = 0;

	const cancel = (): void => {
		if (handle !== 0) {
			cancelFrame(handle);
			handle = 0;
		}
	};

	const onChange = (): void => {
		handle = 0;
		draw(null);
	};

	const onAnimationFrame = (): void => {
		// The next frame is asked for first, so that a frame that throws does
		// not stop the animation, and a draw that stops it cancels the next.
		handle = requestFrame(onAnimationFrame);
		const time = now();
		const seconds = Math.max(0, (time - last) / 1000);
		last = time;
		draw(seconds);
	};

	return {
		invalidate: () => {
			if (!disposed && !animating && handle === 0) {
				handle = requestFrame(onChange);
			}
		},
		flush: () => {
			if (!animating && handle !== 0) {
				cancel();
				draw(null);
			}
		},
		drawNow: () => {
			if (disposed) {
				return;
			}
			if (!animating) {
				cancel();
			}
			draw(null);
		},
		setAnimating: (on) => {
			if (disposed || on === animating) {
				return;
			}
			cancel();
			animating = on;
			if (on) {
				last = now();
				handle = requestFrame(onAnimationFrame);
			}
		},
		get animating() {
			return animating;
		},
		get pending() {
			return handle !== 0;
		},
		dispose: () => {
			disposed = true;
			animating = false;
			cancel();
		},
	};
};
