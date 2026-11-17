/** The globe's material and the uniforms its shaders read. */

import {
	type CubeTexture,
	GLSL3,
	type IUniform,
	RawShaderMaterial,
	Vector2,
	Vector3,
} from 'three';
import { latLonToDirection, SUN_LONGITUDE_DEG } from '../../../core/index';
import { MAX_RAMP_STOPS } from '../ramp';
import { DEFAULT_EXAGGERATION } from './constants';
import type { RELIEF_GLSL } from './relief.glsl';
import { FRAGMENT_GLSL, VERTEX_GLSL } from './shaders';

/** The values the globe's shaders read. */
export type GlobeUniforms = {
	/** Elevation in metres, one texel per cell; null until a world is set. */
	readonly uElevation: IUniform<CubeTexture | null>;
	/** Cells along a face edge of the elevation texture. */
	readonly uResolution: IUniform<number>;
	/** Sea level in metres against the datum. */
	readonly uSeaLevel: IUniform<number>;
	/** Factor by which heights above the sea and slopes are multiplied. */
	readonly uExaggeration: IUniform<number>;
	/** Opacity of the cell grid's lines, 0 (hidden) to 1. */
	readonly uGridOpacity: IUniform<number>;
	/** Centre of the brush outline: a unit vector in core coordinates. */
	readonly uBrushCentre: IUniform<Vector3>;
	/**
	 * Angular radius of the brush outline in radians; 0 when no outline is
	 * drawn.
	 */
	readonly uBrushRadius: IUniform<number>;
	/** Whether the globe is lit by the sun. */
	readonly uSunlight: IUniform<boolean>;
	/**
	 * Whether sunlight is drawn as the line between day and night over
	 * colours shaded as without it, rather than by darkening the night side.
	 */
	readonly uSunlightAsLine: IUniform<boolean>;
	/** The sun's direction: a unit vector in core coordinates. */
	readonly uSunDirection: IUniform<Vector3>;
	/** Whether a data layer colours the globe in place of the height. */
	readonly uLayerShown: IUniform<boolean>;
	/**
	 * The data layer's values, one texel per cell, laid out as the elevation
	 * is; null while no layer is shown.
	 */
	readonly uLayer: IUniform<CubeTexture | null>;
	/** The values the ramp is stretched over: x the low end, y the high. */
	readonly uLayerRange: IUniform<Vector2>;
	/** How many of the ramp's stops are in use. */
	readonly uRampCount: IUniform<number>;
	/**
	 * Where each stop of the ramp sits, 0 to 1, for {@link MAX_RAMP_STOPS}
	 * stops; those past the count are not read.
	 */
	readonly uRampAt: IUniform<Float32Array>;
	/**
	 * Each stop's colour as display (sRGB) red, green and blue from 0 to 1,
	 * one after another, for {@link MAX_RAMP_STOPS} stops.
	 */
	readonly uRampColour: IUniform<Float32Array>;
};

/**
 * The uniforms {@link RELIEF_GLSL} reads: those of the globe that shape the
 * drawn surface.
 */
export type ReliefUniforms = Pick<
	GlobeUniforms,
	'uElevation' | 'uResolution' | 'uSeaLevel' | 'uExaggeration'
>;

/** The globe's material and the uniforms that drive it. */
export type GlobeMaterial = {
	readonly material: RawShaderMaterial;
	readonly uniforms: GlobeUniforms;
};

/**
 * Creates the material that draws the globe.
 *
 * @returns The material together with its uniforms, typed. The elevation
 * texture starts empty, the grid hidden, no brush outline drawn, no data
 * layer shown and sunlight off, with the sun over the equator at
 * {@link SUN_LONGITUDE_DEG}.
 */
export const createGlobeMaterial = (): GlobeMaterial => {
	const uniforms: GlobeUniforms = {
		uElevation: { value: null },
		uResolution: { value: 1 },
		uSeaLevel: { value: 0 },
		uExaggeration: { value: DEFAULT_EXAGGERATION },
		uGridOpacity: { value: 0 },
		uBrushCentre: { value: new Vector3(1, 0, 0) },
		uBrushRadius: { value: 0 },
		uSunlight: { value: false },
		uSunlightAsLine: { value: false },
		uSunDirection: {
			value: new Vector3(...latLonToDirection(0, SUN_LONGITUDE_DEG)),
		},
		uLayerShown: { value: false },
		uLayer: { value: null },
		uLayerRange: { value: new Vector2(0, 1) },
		uRampCount: { value: 0 },
		uRampAt: { value: new Float32Array(MAX_RAMP_STOPS) },
		uRampColour: { value: new Float32Array(MAX_RAMP_STOPS * 3) },
	};
	const material = new RawShaderMaterial({
		name: 'globe',
		glslVersion: GLSL3,
		uniforms,
		vertexShader: VERTEX_GLSL,
		fragmentShader: FRAGMENT_GLSL,
	});
	return { material, uniforms };
};
