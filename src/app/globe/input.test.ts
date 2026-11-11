import { describe, expect, it } from 'vitest';
import { createFakeCanvas, type FakeCanvas } from '../testing/fakeCanvas';
import {
	attachViewInput,
	isButtonHeld,
	MAIN_BUTTON,
	type RotateButton,
	SECONDARY_BUTTON,
	type ViewInput,
	wheelPixels,
} from './input';
import type { Globe } from './renderer';

describe('wheelPixels', () => {
	it('passes a movement in pixels through', () => {
		expect(wheelPixels({ deltaY: -120, deltaMode: 0 }, 800)).toBe(-120);
	});

	it('scales a movement in lines', () => {
		expect(wheelPixels({ deltaY: 3, deltaMode: 1 }, 800)).toBe(48);
	});

	it('scales a movement in pages by the page height', () => {
		expect(wheelPixels({ deltaY: -1, deltaMode: 2 }, 800)).toBe(-800);
	});
});

describe('the mouse buttons', () => {
	it('are numbered as pointer events number them', () => {
		expect(MAIN_BUTTON).toBe(0);
		expect(SECONDARY_BUTTON).toBe(2);
	});
});

describe('isButtonHeld', () => {
	it('finds the main button by the first bit', () => {
		expect(isButtonHeld(1, MAIN_BUTTON)).toBe(true);
		expect(isButtonHeld(2, MAIN_BUTTON)).toBe(false);
	});

	it('finds the secondary button by the second bit', () => {
		expect(isButtonHeld(2, SECONDARY_BUTTON)).toBe(true);
		expect(isButtonHeld(1, SECONDARY_BUTTON)).toBe(false);
	});

	it('finds either button while both are held', () => {
		expect(isButtonHeld(3, MAIN_BUTTON)).toBe(true);
		expect(isButtonHeld(3, SECONDARY_BUTTON)).toBe(true);
	});

	it('finds neither once it is let go, whatever else is held', () => {
		// 4 is the middle button.
		for (const buttons of [0, 4]) {
			expect(isButtonHeld(buttons, MAIN_BUTTON)).toBe(false);
			expect(isButtonHeld(buttons, SECONDARY_BUTTON)).toBe(false);
		}
		expect(isButtonHeld(6, MAIN_BUTTON)).toBe(false);
		expect(isButtonHeld(5, SECONDARY_BUTTON)).toBe(false);
	});
});

/** The class the canvas carries while a drag turns the globe. */
const DRAGGING = 'is-dragging';

/** The bits of the main and the secondary button among those held. */
const MAIN_HELD = 1;
const SECONDARY_HELD = 2;

/** The view's input attached to a stand-in canvas and globe. */
type Stage = {
	readonly fake: FakeCanvas;
	readonly input: ViewInput;
	/** Every turn the globe was asked for, as `[dx, dy]` in pixels. */
	readonly turns: [number, number][];
	/** Every zoom the globe was asked for, in wheel pixels. */
	readonly zooms: number[];
};

const createStage = (rotateButton?: RotateButton): Stage => {
	const fake = createFakeCanvas(800, 600);
	const turns: [number, number][] = [];
	const zooms: number[] = [];
	const globe = {
		rotateBy: (dx: number, dy: number) => turns.push([dx, dy]),
		zoomBy: (pixels: number) => zooms.push(pixels),
	} as unknown as Globe;
	const input =
		rotateButton === undefined
			? attachViewInput(fake.canvas, globe)
			: attachViewInput(fake.canvas, globe, rotateButton);
	return { fake, input, turns, zooms };
};

describe('attachViewInput dragging', () => {
	it('turns the globe by each move of a drag with the main button', () => {
		const { fake, turns } = createStage();
		fake.dispatch('pointerdown', {
			pointerId: 1,
			button: MAIN_BUTTON,
			buttons: MAIN_HELD,
			clientX: 100,
			clientY: 100,
		});
		expect(fake.captured.has(1)).toBe(true);
		expect(fake.classes.has(DRAGGING)).toBe(true);
		expect(turns).toEqual([]);

		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 110,
			clientY: 95,
		});
		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 104,
			clientY: 120,
		});
		expect(turns).toEqual([
			[10, -5],
			[-6, 25],
		]);
	});

	it('ends the drag when the button is let go', () => {
		const { fake, turns } = createStage();
		fake.dispatch('pointerdown', { pointerId: 1, buttons: MAIN_HELD });
		fake.dispatch('pointerup', { pointerId: 1, clientX: 30 });
		expect(fake.captured.size).toBe(0);
		expect(fake.classes.has(DRAGGING)).toBe(false);

		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 60,
		});
		expect(turns).toEqual([]);
	});

	it('ends the drag when the pointer is cancelled', () => {
		const { fake, turns } = createStage();
		fake.dispatch('pointerdown', { pointerId: 1, buttons: MAIN_HELD });
		fake.dispatch('pointercancel', { pointerId: 1 });
		expect(fake.captured.size).toBe(0);
		expect(fake.classes.has(DRAGGING)).toBe(false);

		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 60,
		});
		expect(turns).toEqual([]);
	});

	it('leaves a drag begun with another button alone', () => {
		const { fake, turns } = createStage();
		fake.dispatch('pointerdown', {
			pointerId: 1,
			button: SECONDARY_BUTTON,
			buttons: SECONDARY_HELD,
		});
		expect(fake.captured.size).toBe(0);
		expect(fake.classes.has(DRAGGING)).toBe(false);

		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: SECONDARY_HELD,
			clientX: 50,
		});
		expect(turns).toEqual([]);
	});

	it('turns the globe with the secondary button when given it', () => {
		const { fake, turns } = createStage(SECONDARY_BUTTON);
		fake.dispatch('pointerdown', {
			pointerId: 1,
			button: MAIN_BUTTON,
			buttons: MAIN_HELD,
		});
		expect(fake.captured.size).toBe(0);

		fake.dispatch('pointerup', { pointerId: 1 });
		fake.dispatch('pointerdown', {
			pointerId: 1,
			button: SECONDARY_BUTTON,
			buttons: SECONDARY_HELD,
			clientX: 10,
			clientY: 10,
		});
		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: SECONDARY_HELD,
			clientX: 13,
			clientY: 14,
		});
		expect(turns).toEqual([[3, 4]]);
	});

	it('follows only the pointer that began the drag', () => {
		const { fake, turns } = createStage();
		fake.dispatch('pointerdown', { pointerId: 1, buttons: MAIN_HELD });
		fake.dispatch('pointerdown', {
			pointerId: 2,
			buttons: MAIN_HELD,
			clientX: 500,
		});
		expect([...fake.captured]).toEqual([1]);

		fake.dispatch('pointermove', {
			pointerId: 2,
			buttons: MAIN_HELD,
			clientX: 600,
		});
		expect(turns).toEqual([]);

		// The other pointer going up or being cancelled ends nothing.
		fake.dispatch('pointerup', { pointerId: 2 });
		fake.dispatch('pointercancel', { pointerId: 2 });
		expect(fake.classes.has(DRAGGING)).toBe(true);
		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 7,
		});
		expect(turns).toEqual([[7, 0]]);
	});

	it('ends the drag at a move that no longer reports its button held', () => {
		const { fake, turns } = createStage();
		fake.dispatch('pointerdown', { pointerId: 1, buttons: MAIN_HELD });
		// The secondary button was pressed too, and then the main one let go.
		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD | SECONDARY_HELD,
			clientX: 5,
		});
		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: SECONDARY_HELD,
			clientX: 50,
		});
		expect(turns).toEqual([[5, 0]]);
		expect(fake.captured.size).toBe(0);
		expect(fake.classes.has(DRAGGING)).toBe(false);

		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 90,
		});
		expect(turns).toEqual([[5, 0]]);
	});

	it('starts each drag from where its button went down', () => {
		const { fake, turns } = createStage();
		fake.dispatch('pointerdown', { pointerId: 1, buttons: MAIN_HELD });
		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 40,
		});
		fake.dispatch('pointerup', { pointerId: 1, clientX: 40 });

		fake.dispatch('pointerdown', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 300,
			clientY: 200,
		});
		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 301,
			clientY: 202,
		});
		expect(turns).toEqual([
			[40, 0],
			[1, 2],
		]);
	});
});

describe('attachViewInput wheel and context menu', () => {
	it('zooms by the wheel, in pixels, and keeps the page from scrolling', () => {
		const { fake, zooms } = createStage();
		const pixels = fake.dispatch('wheel', { deltaY: -120, deltaMode: 0 });
		const lines = fake.dispatch('wheel', { deltaY: 3, deltaMode: 1 });
		const pages = fake.dispatch('wheel', { deltaY: 1, deltaMode: 2 });

		// A page is the height of the canvas.
		expect(zooms).toEqual([-120, 48, 600]);
		expect(pixels.defaultPrevented).toBe(true);
		expect(lines.defaultPrevented).toBe(true);
		expect(pages.defaultPrevented).toBe(true);
	});

	it('turns off the context menu over the canvas', () => {
		const { fake } = createStage();
		expect(fake.dispatch('contextmenu').defaultPrevented).toBe(true);
	});
});

describe('setRotateButton', () => {
	it('stops a drag under way when the button changes', () => {
		const { fake, input, turns } = createStage();
		fake.dispatch('pointerdown', { pointerId: 1, buttons: MAIN_HELD });
		input.setRotateButton(SECONDARY_BUTTON);
		expect(fake.captured.size).toBe(0);
		expect(fake.classes.has(DRAGGING)).toBe(false);

		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 50,
		});
		expect(turns).toEqual([]);
	});

	it('has the new button turn the globe from then on, and not the old', () => {
		const { fake, input, turns } = createStage();
		input.setRotateButton(SECONDARY_BUTTON);
		fake.dispatch('pointerdown', {
			pointerId: 1,
			button: MAIN_BUTTON,
			buttons: MAIN_HELD,
		});
		expect(fake.captured.size).toBe(0);
		fake.dispatch('pointerup', { pointerId: 1 });

		fake.dispatch('pointerdown', {
			pointerId: 1,
			button: SECONDARY_BUTTON,
			buttons: SECONDARY_HELD,
		});
		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: SECONDARY_HELD,
			clientX: 9,
		});
		expect(turns).toEqual([[9, 0]]);
	});

	it('leaves a drag alone when given the button it already has', () => {
		const { fake, input, turns } = createStage();
		fake.dispatch('pointerdown', { pointerId: 1, buttons: MAIN_HELD });
		input.setRotateButton(MAIN_BUTTON);
		expect(fake.captured.has(1)).toBe(true);
		expect(fake.classes.has(DRAGGING)).toBe(true);

		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 4,
		});
		expect(turns).toEqual([[4, 0]]);
	});
});

describe('dispose', () => {
	it('stops a drag under way and gives up the pointer', () => {
		const { fake, input } = createStage();
		fake.dispatch('pointerdown', { pointerId: 1, buttons: MAIN_HELD });
		input.dispose();
		expect(fake.captured.size).toBe(0);
		expect(fake.classes.has(DRAGGING)).toBe(false);
	});

	it('stops listening to the canvas', () => {
		const { fake, input, turns, zooms } = createStage();
		input.dispose();

		fake.dispatch('pointerdown', { pointerId: 1, buttons: MAIN_HELD });
		fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 50,
		});
		expect(fake.captured.size).toBe(0);
		expect(fake.classes.has(DRAGGING)).toBe(false);
		expect(turns).toEqual([]);

		expect(fake.dispatch('wheel', { deltaY: 100 }).defaultPrevented).toBe(
			false,
		);
		expect(zooms).toEqual([]);
		expect(fake.dispatch('contextmenu').defaultPrevented).toBe(false);
	});

	it('does nothing more when there is no drag', () => {
		const { fake, input } = createStage();
		expect(() => input.dispose()).not.toThrow();
		expect(fake.captured.size).toBe(0);
	});
});
