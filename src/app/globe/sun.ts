/**
 * The star in the scene: a glowing disc in the sun's direction, drawn on a
 * square that always faces the camera.
 *
 * The square is placed at a fixed distance from the camera along the sun's
 * direction, so it moves with the camera and never shifts against the globe
 * as the view turns, as a body infinitely far away would. Its depth is
 * forced to just inside the far plane, so the planet, relief included,
 * hides it and nothing else does, whatever the camera's far plane.
 *
 * The canvas is see-through and composited over the page with premultiplied
 * alpha, so the sun writes premultiplied colour and blends to match: its
 * glow fades into whatever lies behind the canvas with no dark fringe.
 */

import {
	AddEquation,
	CustomBlending,
	DoubleSide,
	GLSL3,
	type IUniform,
	OneFactor,
	OneMinusSrcAlphaFactor,
	RawShaderMaterial,
	Vector3,
} from 'three';
import type { Rgb, Vec3 } from '../../core/index';

/**
 * How far the sun's square is drawn from the camera, in planet radii. Any
 * distance draws the same picture, since the size goes with it and the
 * depth is forced to the far plane.
 */
export const SUN_DISTANCE = 1;

/** The glow's angular radius as a multiple of the disc's. */
export const SUN_GLOW_TIMES_DISC = 3;

/**
 * The largest angular radius the glow is drawn to, in degrees, so that a
 * large sun's glow does not fill the view.
 */
export const MAX_SUN_GLOW_RADIUS_DEG = 12;

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * Half the side of a square facing the camera that spans an angle from its
 * centre.
 *
 * @param angularRadiusDeg - The angle from the square's centre to the
 * middle of a side, seen from the camera, in degrees; from 0 to under 90.
 * @param distance - How far the square is from the camera.
 * @returns Half the side, in the units of the distance.
 */
export const quadHalfSize = (
	angularRadiusDeg: number,
	distance: number,
): number => distance * Math.tan(angularRadiusDeg * RADIANS_PER_DEGREE);

/**
 * The angular radius the sun's glow reaches to.
 *
 * @param sizeDeg - The sun's drawn diameter, in degrees.
 * @returns {@link SUN_GLOW_TIMES_DISC} times the disc's radius, but no more
 * than {@link MAX_SUN_GLOW_RADIUS_DEG}, in degrees.
 */
export const sunGlowRadius = (sizeDeg: number): number =>
	Math.min((SUN_GLOW_TIMES_DISC * sizeDeg) / 2, MAX_SUN_GLOW_RADIUS_DEG);

/**
 * Where the sun's square is drawn.
 *
 * @param eye - The camera's position.
 * @param direction - The sun's direction: a unit vector, in the frame of
 * the camera's position.
 * @param distance - How far from the camera to draw it.
 * @returns The square's centre, in the same frame.
 */
export const sunPosition = (
	eye: Vec3,
	direction: Vec3,
	distance: number = SUN_DISTANCE,
): Vec3 => [
	eye[0] + direction[0] * distance,
	eye[1] + direction[1] * distance,
	eye[2] + direction[2] * distance,
];

/** How the sun's square is sized and its disc and glow laid out on it. */
export type SunShape = {
	/** Half the square's side, at {@link SUN_DISTANCE}. */
	readonly halfSize: number;
	/**
	 * The disc's radius as a share of half the square's side; the glow
	 * reaches the middle of each side, at 1.
	 */
	readonly discRadius: number;
};

/**
 * How the sun is drawn at a drawn diameter.
 *
 * @remarks
 * The square just holds the glow, which reaches the middle of each side
 * and is nothing beyond, so its corners are clear.
 *
 * @param sizeDeg - The sun's drawn diameter in degrees; positive, finite
 * and less than {@link MAX_SUN_GLOW_RADIUS_DEG}.
 * @returns The square's half-side and the disc's share of it.
 * @throws RangeError for any other diameter.
 */
export const sunShape = (sizeDeg: number): SunShape => {
	if (!(sizeDeg > 0 && sizeDeg < MAX_SUN_GLOW_RADIUS_DEG)) {
		throw new RangeError(
			`A sun's drawn size must be more than 0 and less than ${MAX_SUN_GLOW_RADIUS_DEG} degrees; got ${sizeDeg}`,
		);
	}
	const glow = sunGlowRadius(sizeDeg);
	const halfSize = quadHalfSize(glow, SUN_DISTANCE);
	return {
		halfSize,
		discRadius: quadHalfSize(sizeDeg / 2, SUN_DISTANCE) / halfSize,
	};
};

/**
 * Places the corners of a square of side 2 centred on the origin, facing
 * the camera, around the sun's position, and pushes it to the far plane.
 */
const SUN_VERTEX_GLSL = /* glsl */ `
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uHalfSize;

in vec3 position;

out vec2 vOffset;

// Where in the depth range the sun is drawn: just inside the far plane, so
// that it is never clipped by it and anything drawn is in front of it.
const float SUN_DEPTH = 0.999999;

void main() {
	vOffset = position.xy;
	vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
	gl_Position = projectionMatrix * (centre + vec4(position.xy * uHalfSize, 0.0, 0.0));
	gl_Position.z = gl_Position.w * SUN_DEPTH;
}
`;

/**
 * The disc, its edge softened over about a pixel, and a glow around it
 * that falls smoothly from the disc's edge to nothing at the middle of each
 * side of the square, so the square itself never shows. The colour is
 * written premultiplied by its opacity.
 */
const SUN_FRAGMENT_GLSL = /* glsl */ `
precision highp float;

uniform vec3 uSunColour;
uniform float uDiscRadius;

in vec2 vOffset;

out vec4 fragColour;

// How opaque the glow is at the disc's edge.
const float GLOW_OPACITY = 0.5;

void main() {
	float r = length(vOffset);
	float perPixel = max(fwidth(r), 1e-6);
	float disc = 1.0 - smoothstep(uDiscRadius - 0.5 * perPixel, uDiscRadius + 0.5 * perPixel, r);
	float fade = 1.0 - clamp((r - uDiscRadius) / (1.0 - uDiscRadius), 0.0, 1.0);
	float glow = GLOW_OPACITY * fade * fade * fade;
	float alpha = disc + (1.0 - disc) * glow;
	fragColour = vec4(uSunColour * alpha, alpha);
}
`;

/** The values the sun's shaders read. */
export type SunUniforms = {
	/** Half the side of the square, in the scene's units. */
	readonly uHalfSize: IUniform<number>;
	/** The disc's radius as a share of half the square's side. */
	readonly uDiscRadius: IUniform<number>;
	/** The star's tint as red, green and blue from 0 to 1. */
	readonly uSunColour: IUniform<Vector3>;
};

/** The sun's material and the uniforms that drive it. */
export type SunMaterial = {
	readonly material: RawShaderMaterial;
	readonly uniforms: SunUniforms;
};

/**
 * Sets how the sun is drawn: its size and its colour.
 *
 * @param uniforms - The sun's uniforms.
 * @param sizeDeg - The drawn diameter in degrees, as {@link sunShape}
 * takes it.
 * @param colour - The tint, each channel from 0 to 1.
 * @throws RangeError if {@link sunShape} refuses the size, or a channel is
 * outside 0 to 1 or NaN; the uniforms are then left as they were.
 */
export const shapeSun = (
	uniforms: SunUniforms,
	sizeDeg: number,
	colour: Rgb,
): void => {
	const shape = sunShape(sizeDeg);
	if (!colour.every((channel) => channel >= 0 && channel <= 1)) {
		throw new RangeError(
			`A sun's colour must have channels from 0 to 1; got ${colour.join(', ')}`,
		);
	}
	uniforms.uHalfSize.value = shape.halfSize;
	uniforms.uDiscRadius.value = shape.discRadius;
	uniforms.uSunColour.value.set(colour[0], colour[1], colour[2]);
};

/**
 * Creates the material that draws the sun.
 *
 * @remarks
 * Drawn after the globe as a transparent object, testing depth without
 * writing it, and blending premultiplied colour over what is there.
 *
 * @param sizeDeg - The drawn diameter it starts with, in degrees.
 * @param colour - The tint it starts with.
 * @returns The material together with its uniforms, typed.
 */
export const createSunMaterial = (
	sizeDeg: number,
	colour: Rgb,
): SunMaterial => {
	const uniforms: SunUniforms = {
		uHalfSize: { value: 0 },
		uDiscRadius: { value: 0 },
		uSunColour: { value: new Vector3() },
	};
	shapeSun(uniforms, sizeDeg, colour);
	const material = new RawShaderMaterial({
		name: 'sun',
		glslVersion: GLSL3,
		uniforms,
		vertexShader: SUN_VERTEX_GLSL,
		fragmentShader: SUN_FRAGMENT_GLSL,
		transparent: true,
		depthTest: true,
		depthWrite: false,
		side: DoubleSide,
		blending: CustomBlending,
		blendEquation: AddEquation,
		blendSrc: OneFactor,
		blendDst: OneMinusSrcAlphaFactor,
	});
	return { material, uniforms };
};
