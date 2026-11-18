/**
 * The globe's shaders: how elevation becomes shape, colour and shading.
 *
 * Elevation reaches the GPU as a cube texture with one texel per cell (see
 * the core grid's face layout). The shaders never let the GPU filter it:
 * they read single texels and blend them themselves, in the grid's own
 * equiangular face coordinates, with full float precision. A blend that
 * reaches past a face edge reads the neighbouring face's cells, so the
 * surface is continuous over the whole sphere.
 *
 * A data layer, such as the temperature, reaches the GPU the same way, as
 * a second cube texture laid out like the elevation, and is read by the same
 * sampling functions, which take the texture to read as a parameter.
 *
 * Shape and colour are kept apart. The vertex shader raises the surface;
 * the fragment shader asks `surfaceColour` what colour a point is, or
 * `layerColour` while a data layer is shown, and then shades it the same
 * way either way.
 *
 * Colours are authored and blended as display (sRGB) values and written to
 * the canvas unchanged.
 *
 * With sunlight on, the globe is also lit by the sun, from a direction in
 * core coordinates.
 *
 * The folder holds the ranges and constants the view and the shaders share
 * (`constants.ts`), the writing of GLSL literals and ramps (`glsl.ts`), the
 * terrain's height colours (`heightRamps.ts`), the sampling of per-cell
 * values and the relief rule (`relief.glsl.ts`), the two shaders
 * (`shaders.ts`), the material and its uniforms (`globeMaterial.ts`), the
 * per-cell cube texture (`cellTexture.ts`), the data layer on show
 * (`layer.ts`) and the sunlight (`sunlight.ts`). The sampling on its own,
 * `ELEVATION_GLSL`, and the two shaders are imported from their files, not
 * from here.
 */

export { type CellTexture, createCellTexture } from './cellTexture';
export {
	COAST_MIN_CHANGE_M,
	DEFAULT_EXAGGERATION,
	drawnSeaLevel,
	MAX_DRAWN_SEA_LEVEL_M,
	MAX_EXAGGERATION,
	MIN_DRAWN_SEA_LEVEL_M,
	MIN_EXAGGERATION,
	NIGHT_BRIGHTNESS,
	TWILIGHT_HALF_WIDTH_DEG,
} from './constants';
export {
	createGlobeMaterial,
	type GlobeMaterial,
	type GlobeUniforms,
	type ReliefUniforms,
} from './globeMaterial';
export { glslColour, glslFloat, glslRamp, type RampStop } from './glsl';
export { LAND_RAMP, OCEAN_RAMP } from './heightRamps';
export {
	type PreparedLayer,
	prepareLayer,
	replaceLayer,
	showLayer,
} from './layer';
export { RELIEF_GLSL } from './relief.glsl';
export {
	aimSunlight,
	type SunlightStyle,
	showSunlight,
	unitSunDirection,
} from './sunlight';
