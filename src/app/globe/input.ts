/**
 * Mouse control of the globe's view: dragging turns it and the wheel zooms.
 *
 * This is the only place that decides which gesture does what. The camera's
 * maths lives with the camera and knows nothing of pointers.
 */

import type { Globe } from './renderer';

/** The mouse button that turns the globe: the main (left) button. */
const ROTATE_BUTTON = 0;

/** Pixels a wheel reports per line when it scrolls in lines. */
const WHEEL_LINE_PX = 16;

/** Class the canvas carries while a drag is turning the globe. */
const DRAGGING_CLASS = 'is-dragging';

/** The parts of a wheel event that say how far it scrolled. */
export type WheelMovement = {
	/** Vertical scroll amount, in the unit `deltaMode` names. */
	readonly deltaY: number;
	/** The unit: 0 for pixels, 1 for lines, 2 for pages. */
	readonly deltaMode: number;
};

/**
 * How far a wheel event scrolled, in pixels.
 *
 * @param movement - The event's vertical amount and its unit.
 * @param pagePx - Height of a page in pixels, for wheels that scroll in
 * pages.
 * @returns The distance in pixels, positive when scrolling down.
 */
export const wheelPixels = (
	movement: WheelMovement,
	pagePx: number,
): number => {
	if (movement.deltaMode === 1) {
		return movement.deltaY * WHEEL_LINE_PX;
	}
	if (movement.deltaMode === 2) {
		return movement.deltaY * pagePx;
	}
	return movement.deltaY;
};

/**
 * Lets the mouse move the globe's camera: a drag with the main button
 * turns the globe, and the wheel zooms.
 *
 * @param canvas - The canvas the globe is drawn on.
 * @param globe - The globe to control.
 * @returns A function that removes the controls again.
 */
export const attachViewInput = (
	canvas: HTMLCanvasElement,
	globe: Globe,
): (() => void) => {
	const controller = new AbortController();
	const { signal } = controller;
	let dragPointer: number | null = null;
	let lastX = 0;
	let lastY = 0;

	const stopDrag = (): void => {
		if (dragPointer === null) {
			return;
		}
		const pointerId = dragPointer;
		dragPointer = null;
		canvas.classList.remove(DRAGGING_CLASS);
		if (canvas.hasPointerCapture(pointerId)) {
			canvas.releasePointerCapture(pointerId);
		}
	};

	const endDrag = (event: PointerEvent): void => {
		if (event.pointerId === dragPointer) {
			stopDrag();
		}
	};

	canvas.addEventListener(
		'pointerdown',
		(event) => {
			if (event.button !== ROTATE_BUTTON || dragPointer !== null) {
				return;
			}
			dragPointer = event.pointerId;
			lastX = event.clientX;
			lastY = event.clientY;
			canvas.setPointerCapture(event.pointerId);
			canvas.classList.add(DRAGGING_CLASS);
		},
		{ signal },
	);
	canvas.addEventListener(
		'pointermove',
		(event) => {
			if (event.pointerId !== dragPointer) {
				return;
			}
			globe.rotateBy(event.clientX - lastX, event.clientY - lastY);
			lastX = event.clientX;
			lastY = event.clientY;
		},
		{ signal },
	);
	canvas.addEventListener('pointerup', endDrag, { signal });
	canvas.addEventListener('pointercancel', endDrag, { signal });
	canvas.addEventListener(
		'wheel',
		(event) => {
			// The page itself never scrolls; without this a pinch on a
			// touchpad would zoom the whole page instead.
			event.preventDefault();
			globe.zoomBy(wheelPixels(event, canvas.clientHeight));
		},
		{ signal, passive: false },
	);

	return () => {
		controller.abort();
		// A drag under way would otherwise keep the pointer captured.
		stopDrag();
	};
};
