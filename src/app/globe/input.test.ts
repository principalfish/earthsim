import { describe, expect, it } from 'vitest';
import {
	isButtonHeld,
	MAIN_BUTTON,
	SECONDARY_BUTTON,
	wheelPixels,
} from './input';

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
