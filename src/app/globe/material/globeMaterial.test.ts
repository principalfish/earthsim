import { describe, expect, it } from 'vitest';
import { directionToLatLon, SUN_LONGITUDE_DEG } from '../../../core/index';
import { glslFunction } from '../../testing/glsl';
import { MAX_RAMP_STOPS } from '../ramp';
import {
	DEFAULT_EXAGGERATION,
	NIGHT_BRIGHTNESS,
	TWILIGHT_HALF_WIDTH_DEG,
} from './constants';
import { createGlobeMaterial } from './globeMaterial';
import { RELIEF_GLSL } from './relief.glsl';

describe('createGlobeMaterial', () => {
	it('starts with no elevation, the default exaggeration and no grid', () => {
		const { material, uniforms } = createGlobeMaterial();
		expect(uniforms.uElevation.value).toBeNull();
		expect(uniforms.uExaggeration.value).toBe(DEFAULT_EXAGGERATION);
		expect(uniforms.uGridOpacity.value).toBe(0);
		expect(material.uniforms).toBe(uniforms);
	});

	it('starts with no brush outline, centred on a unit vector', () => {
		const { uniforms } = createGlobeMaterial();
		expect(uniforms.uBrushRadius.value).toBe(0);
		expect(uniforms.uBrushCentre.value.length()).toBe(1);
	});

	it('draws the brush outline in the fragment shader alone', () => {
		const { material } = createGlobeMaterial();
		expect(material.fragmentShader).toContain('vec2 brushCoverage(vec3 d)');
		expect(material.fragmentShader).toContain('uniform float uBrushRadius;');
		expect(material.fragmentShader).toContain('uniform vec3 uBrushCentre;');
		expect(material.vertexShader).not.toContain('uBrush');
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

	it('raises the surface by the relief rule it shares, raising land alone by its height above the sea times the exaggeration', () => {
		const { material } = createGlobeMaterial();
		expect(material.vertexShader).toContain(RELIEF_GLSL);
		expect(glslFunction(material.vertexShader, 'main')).toContain(
			'vSurface = raisedSurface(normalize(position));',
		);
		expect(glslFunction(RELIEF_GLSL, 'raisedSurface')).toContain(
			'max(elevationAt(d) - uSeaLevel, 0.0)',
		);
		expect(glslFunction(RELIEF_GLSL, 'raisedSurface')).toContain(
			'd * (1.0 + raised * uExaggeration / PLANET_RADIUS_M)',
		);
	});
});

describe('createGlobeMaterial, for a data layer', () => {
	it('starts with no layer shown', () => {
		const { uniforms } = createGlobeMaterial();
		expect(uniforms.uLayerShown.value).toBe(false);
		expect(uniforms.uLayer.value).toBeNull();
		expect(uniforms.uRampAt.value).toHaveLength(MAX_RAMP_STOPS);
		expect(uniforms.uRampColour.value).toHaveLength(MAX_RAMP_STOPS * 3);
	});
});

describe('createGlobeMaterial, for sunlight', () => {
	it('starts with sunlight off, the sun over the equator at its longitude', () => {
		const { uniforms } = createGlobeMaterial();
		expect(uniforms.uSunlight.value).toBe(false);
		expect(uniforms.uSunlightAsLine.value).toBe(false);
		const direction = uniforms.uSunDirection.value;
		expect(direction.length()).toBeCloseTo(1, 12);
		const place = directionToLatLon([direction.x, direction.y, direction.z]);
		expect(place.latitudeDeg).toBeCloseTo(0, 12);
		expect(place.longitudeDeg).toBeCloseTo(SUN_LONGITUDE_DEG, 12);
	});

	it('leaves night at 30% of the day, the change softened over 12°', () => {
		expect(NIGHT_BRIGHTNESS).toBe(0.3);
		expect(TWILIGHT_HALF_WIDTH_DEG).toBe(6);
		const { material } = createGlobeMaterial();
		expect(material.fragmentShader).toContain(
			'const float NIGHT_BRIGHTNESS = 0.3;',
		);
		const written = /const float TWILIGHT_HALF_WIDTH = ([\d.]+);/.exec(
			material.fragmentShader,
		);
		expect(Number(written?.[1])).toBeCloseTo(Math.sin(6 * (Math.PI / 180)), 15);
	});

	it('reads the sun in the fragment shader alone', () => {
		const { material } = createGlobeMaterial();
		expect(material.fragmentShader).toContain('uniform bool uSunlight;');
		expect(material.fragmentShader).toContain('uniform bool uSunlightAsLine;');
		expect(material.fragmentShader).toContain('uniform vec3 uSunDirection;');
		expect(material.vertexShader).not.toContain('uSun');
	});

	describe('in the shader', () => {
		const main = glslFunction(
			createGlobeMaterial().material.fragmentShader,
			'main',
		);

		it('keeps the shading fixed to the camera unless the night side is darkened', () => {
			expect(main).toContain(
				[
					'\tif (uSunlight && !uSunlightAsLine) {',
					'\t\tshade *= mix(NIGHT_BRIGHTNESS, 1.0, daylight(d));',
					'\t} else {',
					'\t\tfloat facing = 0.5 + 0.5 * dot(normalize(normalMatrix * d), GLOBE_LIGHT);',
					'\t\tshade *= mix(GLOBE_SHADE, 1.0, facing);',
					'\t}',
					'\tcolour *= shade;',
				].join('\n'),
			);
		});

		it('keeps the relief shading under sunlight', () => {
			expect(main.indexOf('reliefShade(d)')).toBeGreaterThan(-1);
			expect(main.indexOf('reliefShade(d)')).toBeLessThan(
				main.indexOf('daylight(d)'),
			);
		});

		it('draws the line between day and night when asked for it, over the coastline and under the brush outline', () => {
			const line = main.indexOf('terminatorCoverage(d)');
			expect(main).toContain('if (uSunlight && uSunlightAsLine) {');
			expect(line).toBeGreaterThan(
				main.indexOf('coastCoverage(above, change)'),
			);
			expect(line).toBeLessThan(main.indexOf('brushCoverage(d)'));
		});

		it('chooses how the sunlight is drawn whether or not a layer is shown', () => {
			expect(main).not.toMatch(/uSunlight\b[^;{]*uLayerShown/);
		});
	});
});
