/**
 * Mouse control of the globe's view: dragging turns it and the wheel zooms.
 *
 * This is the only place that moves the camera from a gesture. Which mouse
 * button turns the globe can be changed, so that the other is free for a
 * tool. The camera's maths lives with the camera and knows nothing of
 * pointers.
 */

import type { Globe } from './renderer';

/** The main mouse button, as pointer events number it: usually the left. */
export const MAIN_BUTTON = 0;

/** The secondary mouse button: usually the right. */
export const SECONDARY_BUTTON = 2;

/** A mouse button whose drag can turn the globe. */
export type RotateButton = typeof MAIN_BUTTON | typeof SECONDARY_BUTTON;

/** The main button's bit in the buttons a pointer event reports as held. */
const MAIN_BUTTON_BIT = 1;

/** The secondary button's bit in the buttons a pointer event reports as held. */
const SECONDARY_BUTTON_BIT = 2;

/**
 * Whether a mouse button is among those a pointer event reports as held.
 *
 * @remarks
 * Pressing or letting go of one button while another is held is reported as
 * a move of the pointer, not as it going down or up, so a gesture can tell
 * that its button was let go only from the buttons a move still reports.
 *
 * @param buttons - The event's `buttons`: one bit for each button held.
 * @param button - The button to look for.
 */
export const isButtonHeld = (buttons: number, button: RotateButton): boolean =>
	(buttons &
		(button === MAIN_BUTTON ? MAIN_BUTTON_BIT : SECONDARY_BUTTON_BIT)) !==
	0;

/** The mouse's control of the view, once attached. */
export type ViewInput = {
	/**
	 * Chooses the mouse button whose drag turns the globe. A drag that is
	 * turning the globe when the button changes stops there.
	 */
	setRotateButton(button: RotateButton): void;
	/** Removes the controls again. */
	dispose(): void;
};

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
 * Lets the mouse move the globe's camera: a drag with one button turns the
 * globe, and the wheel zooms.
 *
 * @remarks
 * A drag turns the globe only if it began with the rotate button, so a drag
 * begun with another button is left to whatever else listens on the canvas.
 * The browser's context menu is turned off over the canvas, where the
 * secondary button is a drag like any other.
 *
 * @param canvas - The canvas the globe is drawn on.
 * @param globe - The globe to control.
 * @param rotateButton - The button whose drag turns the globe at first; the
 * main button by default.
 * @param onCameraMove - Called after each turn and zoom, so that what
 * follows a still pointer can look again; optional.
 * @returns The controls, to change the button or remove them again.
 */
export const attachViewInput = (
	canvas: HTMLCanvasElement,
	globe: Globe,
	rotateButton: RotateButton = MAIN_BUTTON,
	onCameraMove?: () => void,
): ViewInput => {
	const controller = new AbortController();
	const { signal } = controller;
	let button = rotateButton;
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
			if (event.button !== button || dragPointer !== null) {
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
			// Letting go of the drag's button while another is held is
			// reported as a move, not as the pointer going up.
			if (!isButtonHeld(event.buttons, button)) {
				stopDrag();
				return;
			}
			globe.rotateBy(event.clientX - lastX, event.clientY - lastY);
			lastX = event.clientX;
			lastY = event.clientY;
			onCameraMove?.();
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
			onCameraMove?.();
		},
		{ signal, passive: false },
	);
	canvas.addEventListener('contextmenu', (event) => event.preventDefault(), {
		signal,
	});

	return {
		setRotateButton: (next) => {
			if (next !== button) {
				button = next;
				stopDrag();
			}
		},
		dispose: () => {
			controller.abort();
			// A drag under way would otherwise keep the pointer captured.
			stopDrag();
		},
	};
};
