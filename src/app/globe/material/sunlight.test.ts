import { describe, expect, it } from 'vitest';
import { createGlobeMaterial } from './globeMaterial';
import { aimSunlight, showSunlight, unitSunDirection } from './sunlight';

describe('showSunlight', () => {
	it.each([
		['darkened', true, false],
		['line', true, true],
		['off', false, false],
	] as const)('draws the sunlight %s', (style, on, asLine) => {
		const { uniforms } = createGlobeMaterial();
		// From another style first, so that what changes is seen to change.
		showSunlight(uniforms, style === 'line' ? 'darkened' : 'line');
		showSunlight(uniforms, style);
		expect(uniforms.uSunlight.value).toBe(on);
		expect(uniforms.uSunlightAsLine.value).toBe(asLine);
	});
});

describe('aimSunlight', () => {
	it('sets the direction, normalised', () => {
		const { uniforms } = createGlobeMaterial();
		aimSunlight(uniforms, [0, 3, 4]);
		expect(uniforms.uSunDirection.value.toArray()).toEqual([0, 0.6, 0.8]);
	});

	it.each([
		['zero', [0, 0, 0]],
		['NaN', [Number.NaN, 0, 1]],
		['infinite', [Number.POSITIVE_INFINITY, 0, 0]],
	] as const)(
		'refuses a direction that is %s, changing nothing',
		(_name, direction) => {
			const { uniforms } = createGlobeMaterial();
			aimSunlight(uniforms, [1, 0, 0]);
			expect(() => aimSunlight(uniforms, direction)).toThrow(RangeError);
			expect(() => unitSunDirection(direction)).toThrow(RangeError);
			expect(uniforms.uSunDirection.value.toArray()).toEqual([1, 0, 0]);
		},
	);
});
