import {
	AddEquation,
	CustomBlending,
	OneFactor,
	OneMinusSrcAlphaFactor,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PLANET,
	PLANET_LIMITS,
	type Rgb,
	SUN_LONGITUDE_DEG,
	sunColour,
	sunDrawnSize,
} from '../../core/index';
import { createCameraState } from './camera';
import {
	createSunMaterial,
	MAX_SUN_GLOW_RADIUS_DEG,
	quadHalfSize,
	SUN_DISTANCE,
	SUN_GLOW_TIMES_DISC,
	shapeSun,
	sunGlowRadius,
	sunPosition,
	sunShape,
} from './sun';

const DEG = Math.PI / 180;

/** The largest sun the settings draw: the heaviest star, nearest. */
const LARGEST_SIZE_DEG = sunDrawnSize({
	...DEFAULT_PLANET,
	starMass: PLANET_LIMITS.starMass.max,
	orbitDistanceAu: PLANET_LIMITS.orbitDistanceAu.min,
});

/** The smallest sun the settings draw: the lightest star, farthest. */
const SMALLEST_SIZE_DEG = sunDrawnSize({
	...DEFAULT_PLANET,
	starMass: PLANET_LIMITS.starMass.min,
	orbitDistanceAu: PLANET_LIMITS.orbitDistanceAu.max,
});

const WHITE: Rgb = [1, 1, 1];

describe('the sun’s place', () => {
	it('is 60° west of the longitude the opening view faces', () => {
		const opening = createCameraState().longitude / DEG;
		expect(opening).toBe(0);
		expect(SUN_LONGITUDE_DEG).toBe(opening - 60);
	});
});

describe('quadHalfSize', () => {
	it('spans the angle from the square’s centre to a side at its distance', () => {
		expect(quadHalfSize(45, 2)).toBeCloseTo(2, 12);
		expect(quadHalfSize(0, 2)).toBe(0);
		expect(quadHalfSize(10, 1)).toBeCloseTo(Math.tan(10 * DEG), 12);
		expect(quadHalfSize(10, 3)).toBeCloseTo(3 * quadHalfSize(10, 1), 12);
	});
});

describe('sunGlowRadius', () => {
	it('is three times the disc’s radius', () => {
		expect(SUN_GLOW_TIMES_DISC).toBe(3);
		expect(sunGlowRadius(2.7)).toBeCloseTo(4.05, 12);
		expect(sunGlowRadius(SMALLEST_SIZE_DEG)).toBeCloseTo(
			1.5 * SMALLEST_SIZE_DEG,
			12,
		);
	});

	it('is capped for the largest sun the settings draw', () => {
		expect(MAX_SUN_GLOW_RADIUS_DEG).toBe(12);
		expect(LARGEST_SIZE_DEG).toBeGreaterThan(9);
		expect(sunGlowRadius(LARGEST_SIZE_DEG)).toBe(MAX_SUN_GLOW_RADIUS_DEG);
		expect(sunGlowRadius(LARGEST_SIZE_DEG)).toBeGreaterThan(
			LARGEST_SIZE_DEG / 2,
		);
	});
});

describe('sunPosition', () => {
	it('is the camera’s position moved along the sun’s direction', () => {
		expect(sunPosition([0, 0, 3.8], [1, 0, 0])).toEqual([SUN_DISTANCE, 0, 3.8]);
		expect(sunPosition([1, 2, 3], [0, 0.6, 0.8], 5)).toEqual([1, 5, 7]);
	});

	it('moves with the camera, so the sun never shifts against the globe', () => {
		const direction = [0.6, -0.8, 0] as const;
		const from = (eye: readonly [number, number, number]) => {
			const at = sunPosition(eye, direction);
			return [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
		};
		const near = from([3.8, 0, 0]);
		from([0, -2, 1.5]).forEach((component, index) => {
			expect(component).toBeCloseTo(near[index] as number, 12);
		});
		expect(near[0]).toBeCloseTo(0.6 * SUN_DISTANCE, 12);
	});
});

describe('sunShape', () => {
	it('sizes the square to hold the glow, the disc a share of it', () => {
		const shape = sunShape(2.7);
		expect(shape.halfSize).toBeCloseTo(SUN_DISTANCE * Math.tan(4.05 * DEG), 12);
		expect(shape.discRadius).toBeCloseTo(
			Math.tan(1.35 * DEG) / Math.tan(4.05 * DEG),
			12,
		);
	});

	it('keeps the disc inside the glow at every size the settings draw', () => {
		for (const size of [SMALLEST_SIZE_DEG, 2.7, LARGEST_SIZE_DEG]) {
			const { discRadius, halfSize } = sunShape(size);
			expect(discRadius).toBeGreaterThan(0);
			expect(discRadius).toBeLessThan(0.5);
			expect(Number.isFinite(halfSize) && halfSize > 0).toBe(true);
		}
	});

	it.each([
		0,
		-1,
		MAX_SUN_GLOW_RADIUS_DEG,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])('refuses a size of %s', (size) => {
		expect(() => sunShape(size)).toThrow(RangeError);
	});
});

describe('createSunMaterial', () => {
	it('starts on the size and colour given', () => {
		const { uniforms } = createSunMaterial(2.7, [1, 0.5, 0.25]);
		expect(uniforms.uHalfSize.value).toBe(sunShape(2.7).halfSize);
		expect(uniforms.uDiscRadius.value).toBe(sunShape(2.7).discRadius);
		expect(uniforms.uSunColour.value.toArray()).toEqual([1, 0.5, 0.25]);
	});

	it('is drawn after the globe, tested against its depth without writing any', () => {
		const { material } = createSunMaterial(2.7, WHITE);
		expect(material.transparent).toBe(true);
		expect(material.depthTest).toBe(true);
		expect(material.depthWrite).toBe(false);
	});

	it('blends premultiplied colour over what is there', () => {
		const { material } = createSunMaterial(2.7, WHITE);
		expect(material.blending).toBe(CustomBlending);
		expect(material.blendEquation).toBe(AddEquation);
		expect(material.blendSrc).toBe(OneFactor);
		expect(material.blendDst).toBe(OneMinusSrcAlphaFactor);
		expect(material.fragmentShader).toContain(
			'fragColour = vec4(uSunColour * alpha, alpha);',
		);
	});

	it('is drawn at the far plane, whatever its distance', () => {
		const { material } = createSunMaterial(2.7, WHITE);
		expect(material.vertexShader).toContain(
			'gl_Position.z = gl_Position.w * SUN_DEPTH;',
		);
	});
});

describe('shapeSun', () => {
	it('sets the size and the colour of the star of a planet', () => {
		const { uniforms } = createSunMaterial(2.7, WHITE);
		const planet = { ...DEFAULT_PLANET, starMass: 2, starBrightness: 5 };
		const size = sunDrawnSize(planet);
		shapeSun(uniforms, size, sunColour(planet));
		expect(uniforms.uHalfSize.value).toBe(sunShape(size).halfSize);
		expect(uniforms.uDiscRadius.value).toBe(sunShape(size).discRadius);
		expect(uniforms.uSunColour.value.toArray()).toEqual([...sunColour(planet)]);
	});

	it.each([
		['a size it cannot draw', 0, WHITE],
		['a channel above 1', 2.7, [1.2, 1, 1]],
		['a channel below 0', 2.7, [1, -0.1, 1]],
		['a channel that is NaN', 2.7, [1, 1, Number.NaN]],
	] as const)('refuses %s, changing nothing', (_name, size, colour) => {
		const { uniforms } = createSunMaterial(2.7, [1, 0.5, 0.25]);
		expect(() => shapeSun(uniforms, size, colour)).toThrow(RangeError);
		expect(uniforms.uHalfSize.value).toBe(sunShape(2.7).halfSize);
		expect(uniforms.uSunColour.value.toArray()).toEqual([1, 0.5, 0.25]);
	});
});
