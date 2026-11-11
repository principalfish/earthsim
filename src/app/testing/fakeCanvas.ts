/**
 * Stand-ins for the tests of what listens to the canvas: a canvas that
 * needs no document, and animation frames that run when a test says.
 *
 * Nothing on the page imports this module.
 */

/** The fields of a pointer or wheel event a test may set. */
export type EventFields = {
	readonly pointerId?: number;
	/** The button that went down or up. */
	readonly button?: number;
	/** One bit for each button held. */
	readonly buttons?: number;
	readonly clientX?: number;
	readonly clientY?: number;
	/** From the canvas's left edge; `clientX` when left out. */
	readonly offsetX?: number;
	/** From the canvas's top edge; `clientY` when left out. */
	readonly offsetY?: number;
	readonly deltaY?: number;
	readonly deltaMode?: number;
};

/** A canvas that is only an event target with the few members used. */
export type FakeCanvas = {
	/** The stand-in, as the canvas it stands for. */
	readonly canvas: HTMLCanvasElement;
	/** The pointers the canvas has captured now. */
	readonly captured: ReadonlySet<number>;
	/** The classes the canvas carries now. */
	readonly classes: ReadonlySet<string>;
	/**
	 * Sends the canvas an event, as the browser would.
	 *
	 * @remarks
	 * As in a browser, a pointer whose capture was released since the last
	 * event is first sent `lostpointercapture`, and a pointer still captured
	 * when it goes up or is cancelled loses its capture, and is told so,
	 * straight afterwards.
	 *
	 * @param type - The event's type, such as `pointerdown`.
	 * @param fields - The fields to give it; the rest are zero.
	 * @returns The event, to see whether its default was prevented.
	 */
	dispatch(type: string, fields?: EventFields): Event;
	/**
	 * Takes a pointer's capture away without the canvas having released it,
	 * as the browser does when the pointer is captured elsewhere, and tells
	 * the canvas with `lostpointercapture`.
	 */
	loseCapture(pointerId: number): void;
};

/** The size a fake canvas has unless told otherwise, in CSS pixels. */
const DEFAULT_WIDTH_PX = 800;
const DEFAULT_HEIGHT_PX = 600;

/**
 * Makes a stand-in for the canvas, with its top left corner at the top left
 * of the window.
 *
 * @param widthPx - Its width in CSS pixels.
 * @param heightPx - Its height in CSS pixels.
 */
export const createFakeCanvas = (
	widthPx: number = DEFAULT_WIDTH_PX,
	heightPx: number = DEFAULT_HEIGHT_PX,
): FakeCanvas => {
	const target = new EventTarget();
	const captured = new Set<number>();
	const classes = new Set<string>();
	/** Pointers whose capture was released and that have not been told. */
	const released = new Set<number>();

	const send = (type: string, fields: EventFields): Event => {
		const event = new Event(type, { cancelable: true });
		const clientX = fields.clientX ?? 0;
		const clientY = fields.clientY ?? 0;
		Object.assign(event, {
			pointerId: 0,
			button: 0,
			buttons: 0,
			deltaY: 0,
			deltaMode: 0,
			offsetX: clientX,
			offsetY: clientY,
			...fields,
			clientX,
			clientY,
		});
		target.dispatchEvent(event);
		return event;
	};

	const tellReleased = (): void => {
		for (const pointerId of [...released]) {
			released.delete(pointerId);
			send('lostpointercapture', { pointerId });
		}
	};

	const canvas = Object.assign(target, {
		clientWidth: widthPx,
		clientHeight: heightPx,
		classList: {
			add: (name: string): void => {
				classes.add(name);
			},
			remove: (name: string): void => {
				classes.delete(name);
			},
			toggle: (name: string, force?: boolean): boolean => {
				const on = force ?? !classes.has(name);
				if (on) {
					classes.add(name);
				} else {
					classes.delete(name);
				}
				return on;
			},
			contains: (name: string): boolean => classes.has(name),
		},
		setPointerCapture: (pointerId: number): void => {
			released.delete(pointerId);
			captured.add(pointerId);
		},
		releasePointerCapture: (pointerId: number): void => {
			if (captured.delete(pointerId)) {
				released.add(pointerId);
			}
		},
		hasPointerCapture: (pointerId: number): boolean => captured.has(pointerId),
	});

	return {
		canvas: canvas as unknown as HTMLCanvasElement,
		captured,
		classes,
		dispatch: (type, fields = {}) => {
			tellReleased();
			const event = send(type, fields);
			const pointerId = fields.pointerId ?? 0;
			if (
				(type === 'pointerup' || type === 'pointercancel') &&
				captured.delete(pointerId)
			) {
				released.add(pointerId);
			}
			tellReleased();
			return event;
		},
		loseCapture: (pointerId) => {
			captured.delete(pointerId);
			released.delete(pointerId);
			send('lostpointercapture', { pointerId });
		},
	};
};

/** Animation frames and a clock that move only when a test moves them. */
export type FakeFrames = {
	/** Stands in for `requestAnimationFrame`. */
	readonly request: (callback: () => void) => number;
	/** Stands in for `cancelAnimationFrame`. */
	readonly cancel: (handle: number) => void;
	/** Stands in for `performance.now`: the time, in milliseconds. */
	readonly now: () => number;
	/** How many frames have been asked for and neither run nor cancelled. */
	pending(): number;
	/** Moves the clock on without running a frame. */
	advance(ms: number): void;
	/**
	 * Moves the clock on and runs the frames asked for before now. A frame
	 * asked for while they run waits for the next call.
	 */
	runFrame(ms: number): void;
};

/** Makes the animation frames and the clock, with the clock at zero. */
export const createFakeFrames = (): FakeFrames => {
	const callbacks = new Map<number, () => void>();
	let nextHandle = 1;
	let nowMs = 0;
	return {
		request: (callback) => {
			callbacks.set(nextHandle, callback);
			return nextHandle++;
		},
		cancel: (handle) => {
			callbacks.delete(handle);
		},
		now: () => nowMs,
		pending: () => callbacks.size,
		advance: (ms) => {
			nowMs += ms;
		},
		runFrame: (ms) => {
			nowMs += ms;
			const due = [...callbacks.values()];
			callbacks.clear();
			for (const callback of due) {
				callback();
			}
		},
	};
};
