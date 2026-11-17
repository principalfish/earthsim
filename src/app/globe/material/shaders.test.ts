import { describe, expect, it } from 'vitest';
import { glslFunction } from '../../testing/glsl';
import { rampColourAt, SEASONAL_RANGE_RAMP, TEMPERATURE_RAMP } from '../ramp';
import {
	COAST_MIN_CHANGE_M,
	MAX_DRAWN_SEA_LEVEL_M,
	MIN_DRAWN_SEA_LEVEL_M,
} from './constants';
import { createGlobeMaterial } from './globeMaterial';

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
