import { NearestFilter } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MAX_ELEVATION_M, MIN_ELEVATION_M } from '../../core/index';
import { SEVEN_STOP_RAMP } from '../testing/rampFixtures';
import {
	COAST_MIN_CHANGE_M,
	createCellTexture,
	createGlobeMaterial,
	DEFAULT_EXAGGERATION,
	drawnSeaLevel,
	type GlobeUniforms,
	glslRamp,
	LAND_RAMP,
	MAX_DRAWN_SEA_LEVEL_M,
	MAX_EXAGGERATION,
	MIN_DRAWN_SEA_LEVEL_M,
	MIN_EXAGGERATION,
	OCEAN_RAMP,
	prepareLayer,
	replaceLayer,
	showLayer,
} from './material';
import {
	MAX_RAMP_STOPS,
	rampColourAt,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from './ramp';

/**
 * The source of a GLSL function, from its signature to its closing brace,
 * found by its name.
 */
const glslFunction = (source: string, name: string): string => {
	const start = source.search(new RegExp(`\\n\\w+ ${name}\\(`));
	if (start < 0) {
		throw new Error(`No function ${name} in the shader`);
	}
	let depth = 0;
	for (let i = source.indexOf('{', start); i < source.length; i++) {
		if (source[i] === '{') {
			depth++;
		} else if (source[i] === '}') {
			depth--;
			if (depth === 0) {
				return source.slice(start + 1, i + 1);
			}
		}
	}
	throw new Error(`The function ${name} is not closed`);
};

/** The functions that read per-cell values, with whatever they call. */
const SAMPLING_FUNCTIONS = [
	'faceOf',
	'cellPosition',
	'cellValue',
	'edgeShift',
	'smoothValue',
	'linearValue',
];

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
});

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

describe('a data value beyond the range', () => {
	const { material } = createGlobeMaterial();

	it('takes the colour of the end it is beyond, in the shader', () => {
		// The value's place along the ramp is not kept within it, but each
		// stop's blend is, so past either end the end colour is all there is.
		expect(glslFunction(material.fragmentShader, 'layerColour')).toContain(
			'return rampColour((value - uLayerRange.x) / (uLayerRange.y - uLayerRange.x));',
		);
		expect(glslFunction(material.fragmentShader, 'rampColour')).toContain(
			'colour = mix(colour, uRampColour[i], clamp((t - uRampAt[i - 1]) / span, 0.0, 1.0));',
		);
	});

	it.each([
		['temperature', TEMPERATURE_RAMP],
		['seasonal range', SEASONAL_RANGE_RAMP],
	])(
		'takes the colour of the end it is beyond, as the %s ramp is drawn',
		(_, ramp) => {
			for (const t of [-0.001, -0.5, -40]) {
				expect(rampColourAt(ramp, t)).toEqual(rampColourAt(ramp, 0));
			}
			for (const t of [1.001, 1.5, 40]) {
				expect(rampColourAt(ramp, t)).toEqual(rampColourAt(ramp, 1));
			}
		},
	);
});

describe('the coastline over a data layer', () => {
	const { material } = createGlobeMaterial();
	const main = glslFunction(material.fragmentShader, 'main');

	it('measures the height above sea level per cell over a layer alone', () => {
		expect(main).toContain(
			[
				'\tfloat above;',
				'\tif (uLayerShown) {',
				'\t\tabove = smoothValue(uElevation, d, uSeaLevel);',
				'\t} else {',
				'\t\tabove = elevationAt(d) - uSeaLevel;',
				'\t}',
				'\tfloat change = fwidth(above);',
				'\tfloat perPixel = max(change, 1e-4);',
				'\tfloat land = clamp(above / perPixel, 0.0, 1.0);',
			].join('\n'),
		);
		// The screen derivative is taken once, after the branch, so every
		// pixel takes it.
		expect(main.match(/fwidth/g)).toHaveLength(1);
		expect(main).toContain('coastCoverage(above, change)');
	});

	it('takes the offset from each of the nine cells before blending them', () => {
		const smooth = glslFunction(material.fragmentShader, 'smoothValue');
		expect(smooth).toMatch(
			/^float smoothValue\(samplerCube field, vec3 d, float offset\) \{/,
		);
		const reads = smooth.match(/= cellValue\([^;]*;/g) ?? [];
		expect(reads).toHaveLength(9);
		for (const read of reads) {
			expect(read).toMatch(/\) - offset;$/);
		}
		expect(smooth).not.toMatch(/return[^;]*offset/);
	});

	it('is not drawn where the surface changes by less than the named floor', () => {
		expect(COAST_MIN_CHANGE_M).toBe(1e-6);
		expect(material.fragmentShader).toContain(
			'const float COAST_MIN_CHANGE = 0.000001;',
		);
		const coast = glslFunction(material.fragmentShader, 'coastCoverage');
		expect(coast).toMatch(
			/^float coastCoverage\(float above, float change\) \{\n\tif \(change < COAST_MIN_CHANGE\) \{\n\t\treturn 0\.0;\n\t\}\n\tfloat pixels = abs\(above\) \/ change;/,
		);
	});

	describe('in single precision, over cells all at the sea level', () => {
		const f32 = Math.fround;
		/** The B-spline weights of the shader's smooth sampler at f. */
		const weights = (f: number): [number, number, number] => [
			f32(f32(0.5 * f32(0.5 - f)) * f32(0.5 - f)),
			f32(0.75 - f32(f * f)),
			f32(f32(0.5 * f32(0.5 + f)) * f32(0.5 + f)),
		];
		/** The shader's blend of nine cells of one value, rounded as it goes. */
		const blend = (fx: number, fy: number, cell: number): number => {
			const [xl, xm, xh] = weights(fx);
			const [yl, ym, yh] = weights(fy);
			const row = f32(f32(f32(xl * cell) + f32(xm * cell)) + f32(xh * cell));
			return f32(f32(f32(yl * row) + f32(ym * row)) + f32(yh * row));
		};
		/** Points across a cell, off any round fraction. */
		const points = Array.from({ length: 65 * 65 }, (_, i) => [
			f32(-0.5 + Math.floor(i / 65) / 64 + 0.003),
			f32(-0.5 + (i % 65) / 64 + 0.007),
		]);
		const levels = [
			MIN_DRAWN_SEA_LEVEL_M,
			-4000,
			f32(-120.1),
			MAX_DRAWN_SEA_LEVEL_M,
		];

		it('has weights that do not always sum to exactly one', () => {
			const off = points.filter(([fx = 0, fy = 0]) => {
				const sum = (w: number[]): number =>
					w.reduce((total, weight) => f32(total + weight), 0);
				return sum(weights(fx)) !== 1 || sum(weights(fy)) !== 1;
			});
			expect(off.length).toBeGreaterThan(0);
		});

		it.each(levels)(
			'is exactly zero blended per cell, but not always blended first, at %d m',
			(level) => {
				const sea = f32(level);
				const perCell = points.map(([fx = 0, fy = 0]) =>
					blend(fx, fy, f32(sea - sea)),
				);
				const blendedFirst = points.map(([fx = 0, fy = 0]) =>
					f32(blend(fx, fy, sea) - sea),
				);
				expect(perCell.every((above) => above === 0)).toBe(true);
				expect(blendedFirst.some((above) => above !== 0)).toBe(true);
			},
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

describe('createCellTexture', () => {
	it('lays six faces out from views into the values, unfiltered', () => {
		const values = Float32Array.from({ length: 6 * 4 }, (_, i) => i);
		const { texture, resolution, faces } = createCellTexture(values, 2);
		expect(resolution).toBe(2);
		expect(faces).toHaveLength(6);
		faces.forEach((face, index) => {
			expect(face.buffer).toBe(values.buffer);
			expect(Array.from(face)).toEqual([0, 1, 2, 3].map((k) => index * 4 + k));
		});
		expect(texture.images).toHaveLength(6);
		expect(texture.magFilter).toBe(NearestFilter);
		expect(texture.minFilter).toBe(NearestFilter);
		expect(texture.generateMipmaps).toBe(false);
		expect(texture.flipY).toBe(false);
	});

	it('refuses values that are not one per cell', () => {
		expect(() => createCellTexture(new Float32Array(23), 2)).toThrow(
			RangeError,
		);
	});
});

describe('prepareLayer', () => {
	const field = new Float32Array(6 * 4);
	const range = { min: -40, max: 35 };

	it('makes the texture and keeps a copy of the range and the ramp', () => {
		const layer = prepareLayer(field, 2, range, TEMPERATURE_RAMP);
		expect(layer.faces[0]?.buffer).toBe(field.buffer);
		expect(layer.range).toEqual(range);
		expect(layer.range).not.toBe(range);
		expect(layer.ramp).toBe(TEMPERATURE_RAMP);
	});

	it.each([
		['no range', undefined, TEMPERATURE_RAMP],
		['no ramp', range, undefined],
		[
			'a range that is not a number',
			{ min: Number.NaN, max: 1 },
			TEMPERATURE_RAMP,
		],
		[
			'an infinite range',
			{ min: 0, max: Number.POSITIVE_INFINITY },
			TEMPERATURE_RAMP,
		],
		['a range with no width', { min: 3, max: 3 }, TEMPERATURE_RAMP],
		['a range the wrong way round', { min: 3, max: 1 }, TEMPERATURE_RAMP],
		['a ramp it cannot draw', range, { name: 'x', stops: [] }],
	])('refuses %s', (_, badRange, badRamp) => {
		expect(() => prepareLayer(field, 2, badRange, badRamp)).toThrow(RangeError);
	});

	it('refuses a field of another resolution', () => {
		expect(() => prepareLayer(field, 4, range, TEMPERATURE_RAMP)).toThrow(
			RangeError,
		);
	});
});

describe('showLayer', () => {
	it('sets the texture, the range and the ramp for the shaders', () => {
		const { uniforms } = createGlobeMaterial();
		const layer = prepareLayer(
			new Float32Array(6),
			1,
			{ min: -40, max: 35 },
			TEMPERATURE_RAMP,
		);
		showLayer(uniforms, layer);
		expect(uniforms.uLayerShown.value).toBe(true);
		expect(uniforms.uLayer.value).toBe(layer.texture);
		expect(uniforms.uLayerRange.value.toArray()).toEqual([-40, 35]);
		expect(uniforms.uRampCount.value).toBe(TEMPERATURE_RAMP.stops.length);
		expect(Array.from(uniforms.uRampAt.value.slice(0, 6))).toEqual(
			TEMPERATURE_RAMP.stops.map((stop) => Math.fround(stop.at)),
		);
		expect(Array.from(uniforms.uRampColour.value.slice(0, 3))).toEqual(
			[0x0b, 0x1d, 0x51].map((c) => Math.fround(c / 255)),
		);
		expect(Array.from(uniforms.uRampColour.value.slice(15, 18))).toEqual(
			[0xfd, 0xe9, 0xa9].map((c) => Math.fround(c / 255)),
		);
	});

	it('clears the stops a shorter ramp leaves over', () => {
		const { uniforms } = createGlobeMaterial();
		const field = new Float32Array(6);
		const range = { min: 0, max: 1 };
		showLayer(uniforms, prepareLayer(field, 1, range, SEVEN_STOP_RAMP));
		expect(uniforms.uRampAt.value[6]).toBe(1);
		showLayer(uniforms, prepareLayer(field, 1, range, TEMPERATURE_RAMP));
		expect(uniforms.uRampCount.value).toBe(6);
		expect(uniforms.uRampAt.value[6]).toBe(0);
		expect(Array.from(uniforms.uRampColour.value.slice(18, 21))).toEqual([
			0, 0, 0,
		]);
	});

	it('goes back to the height colours for no layer', () => {
		const { uniforms } = createGlobeMaterial();
		showLayer(
			uniforms,
			prepareLayer(
				new Float32Array(6),
				1,
				{ min: 0, max: 1 },
				TEMPERATURE_RAMP,
			),
		);
		showLayer(uniforms, null);
		expect(uniforms.uLayerShown.value).toBe(false);
		expect(uniforms.uLayer.value).toBeNull();
	});
});

describe('replaceLayer', () => {
	const range = { min: -40, max: 35 };

	/** A layer on show for a world of resolution 1, its disposal watched. */
	const onShow = (uniforms: GlobeUniforms) => {
		const layer = prepareLayer(new Float32Array(6), 1, range, TEMPERATURE_RAMP);
		const dispose = vi.spyOn(layer.texture, 'dispose');
		showLayer(uniforms, layer);
		return { layer, dispose };
	};

	it('refuses a field before any world is shown, leaving the layer on show', () => {
		const { uniforms } = createGlobeMaterial();
		const old = onShow(uniforms);
		expect(() =>
			replaceLayer(
				uniforms,
				old.layer,
				null,
				new Float32Array(6),
				range,
				TEMPERATURE_RAMP,
			),
		).toThrow(RangeError);
		expect(old.dispose).not.toHaveBeenCalled();
		expect(uniforms.uLayerShown.value).toBe(true);
		expect(uniforms.uLayer.value).toBe(old.layer.texture);
	});

	it('leaves the layer on show as it was when the new one is refused', () => {
		const { uniforms } = createGlobeMaterial();
		const old = onShow(uniforms);
		// One value short of a cell each for resolution 1.
		expect(() =>
			replaceLayer(
				uniforms,
				old.layer,
				1,
				new Float32Array(5),
				range,
				SEVEN_STOP_RAMP,
			),
		).toThrow(RangeError);
		expect(old.dispose).not.toHaveBeenCalled();
		expect(uniforms.uLayerShown.value).toBe(true);
		expect(uniforms.uLayer.value).toBe(old.layer.texture);
		expect(uniforms.uRampCount.value).toBe(TEMPERATURE_RAMP.stops.length);
	});

	it('disposes of the old texture once and shows the new layer', () => {
		const { uniforms } = createGlobeMaterial();
		const old = onShow(uniforms);
		const field = new Float32Array(6);
		const next = replaceLayer(
			uniforms,
			old.layer,
			1,
			field,
			range,
			SEVEN_STOP_RAMP,
		);
		expect(next).not.toBeNull();
		expect(next?.faces[0]?.buffer).toBe(field.buffer);
		expect(next?.ramp).toBe(SEVEN_STOP_RAMP);
		expect(old.dispose).toHaveBeenCalledTimes(1);
		expect(uniforms.uLayerShown.value).toBe(true);
		expect(uniforms.uLayer.value).toBe(next?.texture);
		expect(uniforms.uRampCount.value).toBe(SEVEN_STOP_RAMP.stops.length);
	});

	it('shows a first layer with none on show before', () => {
		const { uniforms } = createGlobeMaterial();
		const next = replaceLayer(
			uniforms,
			null,
			1,
			new Float32Array(6),
			range,
			TEMPERATURE_RAMP,
		);
		expect(uniforms.uLayer.value).toBe(next?.texture);
	});

	it('disposes of the old texture and shows none for no field', () => {
		const { uniforms } = createGlobeMaterial();
		const old = onShow(uniforms);
		expect(replaceLayer(uniforms, old.layer, 1, null)).toBeNull();
		expect(old.dispose).toHaveBeenCalledTimes(1);
		expect(uniforms.uLayerShown.value).toBe(false);
		expect(uniforms.uLayer.value).toBeNull();
		// With no world, as well: no field needs none.
		expect(replaceLayer(uniforms, null, null, null)).toBeNull();
	});
});
