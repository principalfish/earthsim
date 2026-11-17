import { describe, expect, it } from 'vitest';
import { glslRamp } from './glsl';
import { LAND_RAMP, OCEAN_RAMP } from './heightRamps';

describe('the colour ramps', () => {
	it.each([
		['land', LAND_RAMP],
		['ocean', OCEAN_RAMP],
	])('start at sea level and increase: %s', (_name, ramp) => {
		expect(ramp[0]?.at).toBe(0);
		expect(() => glslRamp('tint', ramp)).not.toThrow();
	});
});
