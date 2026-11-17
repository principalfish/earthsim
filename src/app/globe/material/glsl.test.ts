import { describe, expect, it } from 'vitest';
import { glslRamp } from './glsl';

describe('glslRamp', () => {
	it('writes a function that starts from the first colour', () => {
		const source = glslRamp('tint', [{ at: 0, colour: 0xff8000 }]);
		expect(source).toBe(
			[
				'vec3 tint(float x) {',
				'\tvec3 colour = vec3(1.0000, 0.5020, 0.0000);',
				'\treturn colour;',
				'}',
			].join('\n'),
		);
	});

	it('blends towards each later stop over the span before it', () => {
		const source = glslRamp('tint', [
			{ at: -50, colour: 0x000000 },
			{ at: 150, colour: 0xffffff },
			{ at: 150.5, colour: 0x0000ff },
		]);
		expect(source).toContain(
			'colour = mix(colour, vec3(1.0000, 1.0000, 1.0000), clamp((x - -50.0) / 200.0, 0.0, 1.0));',
		);
		expect(source).toContain(
			'colour = mix(colour, vec3(0.0000, 0.0000, 1.0000), clamp((x - 150.0) / 0.5, 0.0, 1.0));',
		);
	});

	it('rejects a ramp with no stops', () => {
		expect(() => glslRamp('tint', [])).toThrow(RangeError);
	});

	it('rejects stops that do not increase', () => {
		const stops = [
			{ at: 0, colour: 0 },
			{ at: 0, colour: 1 },
		];
		expect(() => glslRamp('tint', stops)).toThrow(RangeError);
	});
});
