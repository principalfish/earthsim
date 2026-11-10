import { describe, expect, it } from 'vitest';
import { wheelPixels } from './input';

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
