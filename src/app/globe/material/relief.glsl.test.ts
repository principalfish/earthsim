import { describe, expect, it } from 'vitest';
import { glslFunction, SAMPLING_FUNCTIONS } from '../../testing/glsl';
import { MAX_RAMP_STOPS } from '../ramp';
import { createGlobeMaterial } from './globeMaterial';

describe('the sampling of per-cell values', () => {
	const { material } = createGlobeMaterial();

	it.each([
		['vertex', material.vertexShader],
		['fragment', material.fragmentShader],
	])('reads only the texture it is handed, in the %s shader', (_, source) => {
		for (const name of SAMPLING_FUNCTIONS) {
			const body = glslFunction(source, name);
			expect(body).not.toContain('uElevation');
			expect(body).not.toContain('uLayer');
		}
		for (const name of ['cellValue', 'smoothValue', 'linearValue']) {
			expect(glslFunction(source, name)).toMatch(
				new RegExp(`^float ${name}\\(samplerCube field, `),
			);
		}
	});

	it('is what reads the elevation in both shaders', () => {
		for (const source of [material.vertexShader, material.fragmentShader]) {
			expect(glslFunction(source, 'elevationAt')).toContain(
				'return smoothValue(uElevation, d, 0.0);',
			);
			expect(glslFunction(source, 'elevationLinear')).toContain(
				'return linearValue(uElevation, d);',
			);
		}
	});

	it('is what reads the data layer, in the fragment shader alone', () => {
		expect(glslFunction(material.fragmentShader, 'layerColour')).toContain(
			'smoothValue(uLayer, d, 0.0)',
		);
		expect(material.vertexShader).not.toContain('uLayer');
		expect(material.vertexShader).not.toContain('uRamp');
	});

	it('leaves the height colours to the terrain while no layer is shown', () => {
		expect(glslFunction(material.fragmentShader, 'main')).toContain(
			'vec3 colour = uLayerShown ? layerColour(d) : surfaceColour(above, land);',
		);
	});

	it('has room in the shader for the most stops a ramp may have', () => {
		expect(material.fragmentShader).toContain(
			`const int MAX_RAMP_STOPS = ${MAX_RAMP_STOPS};`,
		);
	});
});
