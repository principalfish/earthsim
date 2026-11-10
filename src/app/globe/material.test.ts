import { describe, expect, it } from 'vitest';
import { MAX_ELEVATION_M, MIN_ELEVATION_M } from '../../core/index';
import {
	createGlobeMaterial,
	DEFAULT_EXAGGERATION,
	drawnSeaLevel,
	glslRamp,
	LAND_RAMP,
	MAX_DRAWN_SEA_LEVEL_M,
	MAX_EXAGGERATION,
	MIN_DRAWN_SEA_LEVEL_M,
	MIN_EXAGGERATION,
	OCEAN_RAMP,
} from './material';

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

describe('the colour ramps', () => {
	it.each([
		['land', LAND_RAMP],
		['ocean', OCEAN_RAMP],
	])('start at sea level and increase: %s', (_name, ramp) => {
		expect(ramp[0]?.at).toBe(0);
		expect(() => glslRamp('tint', ramp)).not.toThrow();
	});
});

describe('the exaggeration range', () => {
	it('runs from true scale and holds the default', () => {
		expect(MIN_EXAGGERATION).toBe(1);
		expect(DEFAULT_EXAGGERATION).toBeGreaterThan(MIN_EXAGGERATION);
		expect(DEFAULT_EXAGGERATION).toBeLessThan(MAX_EXAGGERATION);
	});
});

describe('the drawn sea-level range', () => {
	it('stays within the limits a sea level can have and spans the datum', () => {
		expect(MIN_DRAWN_SEA_LEVEL_M).toBeGreaterThanOrEqual(MIN_ELEVATION_M);
		expect(MAX_DRAWN_SEA_LEVEL_M).toBeLessThanOrEqual(MAX_ELEVATION_M);
		expect(MIN_DRAWN_SEA_LEVEL_M).toBeLessThan(0);
		expect(MAX_DRAWN_SEA_LEVEL_M).toBeGreaterThan(0);
	});

	it('has ends that single precision holds exactly', () => {
		expect(Math.fround(MIN_DRAWN_SEA_LEVEL_M)).toBe(MIN_DRAWN_SEA_LEVEL_M);
		expect(Math.fround(MAX_DRAWN_SEA_LEVEL_M)).toBe(MAX_DRAWN_SEA_LEVEL_M);
	});
});

describe('drawnSeaLevel', () => {
	it('leaves a level within the range at single precision', () => {
		expect(drawnSeaLevel(0)).toBe(0);
		expect(drawnSeaLevel(-120.1)).toBe(Math.fround(-120.1));
		expect(drawnSeaLevel(MIN_DRAWN_SEA_LEVEL_M)).toBe(MIN_DRAWN_SEA_LEVEL_M);
		expect(drawnSeaLevel(MAX_DRAWN_SEA_LEVEL_M)).toBe(MAX_DRAWN_SEA_LEVEL_M);
	});

	it('brings a level outside the range to the nearer end', () => {
		expect(drawnSeaLevel(MIN_DRAWN_SEA_LEVEL_M - 0.5)).toBe(
			MIN_DRAWN_SEA_LEVEL_M,
		);
		expect(drawnSeaLevel(MIN_ELEVATION_M)).toBe(MIN_DRAWN_SEA_LEVEL_M);
		expect(drawnSeaLevel(Number.NEGATIVE_INFINITY)).toBe(MIN_DRAWN_SEA_LEVEL_M);
		expect(drawnSeaLevel(MAX_ELEVATION_M)).toBe(MAX_DRAWN_SEA_LEVEL_M);
		expect(drawnSeaLevel(Number.POSITIVE_INFINITY)).toBe(MAX_DRAWN_SEA_LEVEL_M);
	});

	it('rejects NaN', () => {
		expect(() => drawnSeaLevel(Number.NaN)).toThrow(RangeError);
	});
});

describe('createGlobeMaterial', () => {
	it('starts with no elevation, the default exaggeration and no grid', () => {
		const { material, uniforms } = createGlobeMaterial();
		expect(uniforms.uElevation.value).toBeNull();
		expect(uniforms.uExaggeration.value).toBe(DEFAULT_EXAGGERATION);
		expect(uniforms.uGridOpacity.value).toBe(0);
		expect(material.uniforms).toBe(uniforms);
	});

	it('gives both shaders the elevation sampling and both ramps', () => {
		const { material } = createGlobeMaterial();
		expect(material.vertexShader).toContain('float elevationAt(vec3 d)');
		expect(material.fragmentShader).toContain('float elevationAt(vec3 d)');
		expect(material.fragmentShader).toContain('vec3 landColour(float x)');
		expect(material.fragmentShader).toContain('vec3 oceanColour(float x)');
		expect(material.fragmentShader).toContain(
			'const float PLANET_RADIUS_M = 6371000.0;',
		);
	});
});
