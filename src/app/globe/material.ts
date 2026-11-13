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
 */

import {
	CubeTexture,
	DataTexture,
	FloatType,
	GLSL3,
	type IUniform,
	NearestFilter,
	RawShaderMaterial,
	RedFormat,
	Vector2,
	Vector3,
} from 'three';
import {
	FACE_COUNT,
	latLonToDirection,
	normaliseSeaLevel,
	PLANET_RADIUS_KM,
	SUN_LONGITUDE_DEG,
	type Vec3,
} from '../../core/index';
import {
	type ColourRamp,
	checkRamp,
	MAX_RAMP_STOPS,
	type ValueRange,
} from './ramp';

/** The lowest relief exaggeration the view offers: true scale. */
export const MIN_EXAGGERATION = 1;

/** The highest relief exaggeration the view offers. */
export const MAX_EXAGGERATION = 100;

/** The relief exaggeration a new view starts with. */
export const DEFAULT_EXAGGERATION = 40;

/** The lowest sea level the globe draws, in metres against the datum. */
export const MIN_DRAWN_SEA_LEVEL_M = -6000;

/** The highest sea level the globe draws, in metres against the datum. */
export const MAX_DRAWN_SEA_LEVEL_M = 6000;

/**
 * The change in the surface's height above sea level, in metres a pixel,
 * below which the coastline drawn over a data layer counts the surface as
 * level and draws no line there.
 *
 * @remarks
 * While a layer is shown, the height above sea level is blended from each
 * cell's own height above it, so a stretch of cells all at the sea level,
 * such as a blank world with the sea level moved to its floor, comes out as
 * exactly zero, with no change from pixel to pixel at all, and has no coast
 * to draw. A level stretch a little above or below the sea level has none
 * either, but its height still changes from pixel to pixel by rounding,
 * about a ten-millionth of the height, so the test is a floor on the change
 * rather than a test for no change at all. The floor is far below the
 * change a pixel across any real shore: even one rising a centimetre a cell
 * changes by tens of times the floor a pixel when the view is as close as
 * it goes.
 */
export const COAST_MIN_CHANGE_M = 1e-6;

/**
 * The sea level the globe draws for a sea level it is given.
 *
 * @remarks
 * Land is raised by its height above the drawn sea level, so the lower
 * bound is what limits how tall the drawn relief can be.
 *
 * @param metres - Sea level in metres against the datum; may be infinite.
 * @returns The single-precision number nearest to the value, or the nearer
 * of {@link MIN_DRAWN_SEA_LEVEL_M} and {@link MAX_DRAWN_SEA_LEVEL_M} if the
 * value lies outside them.
 * @throws RangeError if `metres` is NaN.
 */
export const drawnSeaLevel = (metres: number): number =>
	Math.min(
		MAX_DRAWN_SEA_LEVEL_M,
		Math.max(MIN_DRAWN_SEA_LEVEL_M, normaliseSeaLevel(metres)),
	);

/**
 * The brightness of the night side while the globe is lit by the sun, as a
 * share of the day side's.
 */
export const NIGHT_BRIGHTNESS = 0.3;

/**
 * Half the width of the band over which day turns to night while the globe
 * is lit by the sun, in degrees of the sun's height either side of the
 * horizon.
 */
export const TWILIGHT_HALF_WIDTH_DEG = 6;

/** One colour of a ramp and the value it sits at. */
export type RampStop = {
	/** Where the colour sits along the ramp, in metres. */
	readonly at: number;
	/** The colour as a display (sRGB) value, `0xrrggbb`. */
	readonly colour: number;
};

/** Land colours by height above sea level, lowest first. */
export const LAND_RAMP: readonly RampStop[] = [
	{ at: 0, colour: 0x5f9a4e },
	{ at: 300, colour: 0x86ad5a },
	{ at: 900, colour: 0xc2b877 },
	{ at: 1800, colour: 0xa98a5c },
	{ at: 3000, colour: 0x8a6f58 },
	{ at: 4200, colour: 0xa9a29c },
	{ at: 5500, colour: 0xf4f5f7 },
];

/** Sea colours by depth below sea level, shallowest first. */
export const OCEAN_RAMP: readonly RampStop[] = [
	{ at: 0, colour: 0x7cc4de },
	{ at: 150, colour: 0x4fa3d3 },
	{ at: 1000, colour: 0x2f7cbf },
	{ at: 2500, colour: 0x1f5aa3 },
	{ at: 4000, colour: 0x143f80 },
	{ at: 6000, colour: 0x0c2a5e },
	{ at: 9000, colour: 0x081a3f },
];

/** A number as a GLSL float literal. */
const glslFloat = (value: number): string => {
	const text = String(value);
	return /[.e]/.test(text) ? text : `${text}.0`;
};

/** A `0xrrggbb` colour as a GLSL `vec3` of components from 0 to 1. */
const glslColour = (colour: number): string => {
	const channel = (shift: number): string =>
		(((colour >> shift) & 0xff) / 255).toFixed(4);
	return `vec3(${channel(16)}, ${channel(8)}, ${channel(0)})`;
};

/**
 * GLSL source for a function mapping a value to a colour along a ramp.
 *
 * @remarks
 * The function is `vec3 name(float x)`. Between two stops the colour is
 * blended linearly; below the first stop and above the last it is the
 * colour of that stop.
 *
 * @param name - Name of the GLSL function.
 * @param stops - At least one stop, in strictly increasing order of `at`.
 * @throws RangeError if there are no stops or they are out of order.
 */
export const glslRamp = (name: string, stops: readonly RampStop[]): string => {
	const [first, ...rest] = stops;
	if (first === undefined) {
		throw new RangeError('A colour ramp needs at least one stop');
	}
	const lines = [
		`vec3 ${name}(float x) {`,
		`\tvec3 colour = ${glslColour(first.colour)};`,
	];
	let previous = first;
	for (const stop of rest) {
		if (!(stop.at > previous.at)) {
			throw new RangeError(
				`Colour ramp stops must increase; ${stop.at} follows ${previous.at}`,
			);
		}
		const span = glslFloat(stop.at - previous.at);
		lines.push(
			`\tcolour = mix(colour, ${glslColour(stop.colour)}, clamp((x - ${glslFloat(previous.at)}) / ${span}, 0.0, 1.0));`,
		);
		previous = stop;
	}
	lines.push('\treturn colour;', '}');
	return lines.join('\n');
};

/**
 * Declarations and the sampling of per-cell values shared by both shaders.
 *
 * The sampling functions read whichever cube texture they are handed, laid
 * out one texel per cell as the elevation is, so a data layer is blended
 * across cube edges and corners exactly as the elevation is.
 * `elevationAt` and `elevationLinear` are those functions on the elevation.
 *
 * `faceOf` finds the cube face a direction passes through. The two in-face
 * axes it returns are not the grid's `u` and `v`: every use below treats
 * the two axes alike and is unchanged by flipping or swapping them, so any
 * pair will do.
 *
 * `cellValue` reads one cell, addressed by whole steps along those axes
 * from the face's low corner. A cube lookup is linear in texels along each
 * face axis, so aiming at a texel centre needs no trigonometry. A cell one
 * step past an edge is the neighbouring face's nearest cell in the same
 * row: seen from this face, it lies at the edge along the axis that
 * overshot and one texel in from it along the normal.
 *
 * Where three faces meet there is no cell diagonally past the corner. Both
 * samplers put the mean of the three corner cells there, which is the same
 * from all three faces and keeps the surface continuous.
 *
 * The grid's rows bend where two faces meet, so a neighbouring face's cells
 * do not sit where this face's rows would carry on to: they are shifted
 * along the edge, by nothing at its middle and by half a cell at its ends.
 * Blending them as if they were in line leaves a crease in the surface
 * along every cube edge, plain to see once slopes are shaded. `edgeShift`
 * gives the shift, and both samplers first move the point along the edge by
 * the shift times the weight the borrowed cells will get. To first order
 * that puts every cell where it really is, and it comes out the same from
 * both sides of an edge, so the surface stays continuous. The correction
 * fades out over the last cell before a corner, where the corrections for
 * the two edges meeting there would disagree.
 */
const ELEVATION_GLSL = /* glsl */ `
precision highp float;
precision highp samplerCube;

const float QUARTER_PI = 0.7853981633974483;
const float PLANET_RADIUS_M = ${glslFloat(PLANET_RADIUS_KM * 1000)};
// Distance from a cube corner, in cells along an edge, over which the
// correction for the bend in the grid at that edge fades in.
const float CORNER_FADE_CELLS = 1.0;

uniform samplerCube uElevation;
uniform float uResolution;
uniform float uSeaLevel;
uniform float uExaggeration;

void faceOf(vec3 d, out vec3 n, out vec3 u, out vec3 v, out vec2 q) {
	vec3 a = abs(d);
	if (a.x >= a.y && a.x >= a.z) {
		n = vec3(sign(d.x), 0.0, 0.0);
		u = vec3(0.0, 1.0, 0.0);
		v = vec3(0.0, 0.0, 1.0);
	} else if (a.y >= a.z) {
		n = vec3(0.0, sign(d.y), 0.0);
		u = vec3(0.0, 0.0, 1.0);
		v = vec3(1.0, 0.0, 0.0);
	} else {
		n = vec3(0.0, 0.0, sign(d.z));
		u = vec3(1.0, 0.0, 0.0);
		v = vec3(0.0, 1.0, 0.0);
	}
	q = vec2(dot(d, u), dot(d, v)) / dot(d, n);
}

// Position on a face in cells from its low corner along each axis: whole
// numbers on cell boundaries, from 0 to the resolution.
vec2 cellPosition(vec2 q) {
	return (atan(q) / QUARTER_PI + 1.0) * 0.5 * uResolution;
}

float cellValue(samplerCube field, vec3 n, vec3 u, vec3 v, vec2 cell) {
	vec2 w = (2.0 * cell + 1.0) / uResolution - 1.0;
	vec2 over = max(abs(w) - 1.0, 0.0);
	vec3 lookup = (1.0 - max(over.x, over.y)) * n
		+ clamp(w.x, -1.0, 1.0) * u
		+ clamp(w.y, -1.0, 1.0) * v;
	return textureLod(field, lookup, 0.0).r;
}

// How far, in cells, the neighbouring face's cells sit along an edge from
// the rows and columns of this face that run into them, for a point at p
// (in cells from the centre of the face's first cell). Component x is the
// shift along the x axis, met when crossing an edge in y, and the reverse.
vec2 edgeShift(vec2 p) {
	vec2 w = (2.0 * p + 1.0) / uResolution - 1.0;
	float beyond = tan(QUARTER_PI * (1.0 + 1.0 / uResolution));
	vec2 there = atan(tan(w * QUARTER_PI) / beyond) / QUARTER_PI;
	vec2 toCorner = min(p + 0.5, uResolution - 0.5 - p);
	return (w - there) * 0.5 * uResolution
		* smoothstep(0.0, CORNER_FADE_CELLS, toCorner);
}

// A field's value less 'offset' as a smooth surface through the cells: a
// quadratic B-spline over the 3 x 3 cells around the point, with a
// continuous slope. The offset is taken from each cell before the cells are
// blended, so where every cell equals it the result is exactly zero; an
// offset of 0.0 leaves each cell, and so the result, exactly as it is.
float smoothValue(samplerCube field, vec3 d, float offset) {
	vec3 n, u, v;
	vec2 q;
	faceOf(d, n, u, v, q);
	vec2 p = cellPosition(q) - 0.5;
	vec2 last = vec2(uResolution - 1.0);
	vec2 c = clamp(floor(p + 0.5), vec2(0.0), last);
	vec2 f = p - c;
	// The weight of the column and of the row taken from a neighbouring
	// face, if any, decides how far the point moves along the edge.
	vec2 borrowed = vec2(lessThan(c, vec2(0.5))) * 0.5 * (0.5 - f) * (0.5 - f)
		+ vec2(greaterThan(c, last - 0.5)) * 0.5 * (0.5 + f) * (0.5 + f);
	if (borrowed.x + borrowed.y > 0.0) {
		p -= borrowed.yx * edgeShift(p);
	}

	c = clamp(floor(p + 0.5), vec2(0.0), last);
	f = p - c;
	vec2 wl = 0.5 * (0.5 - f) * (0.5 - f);
	vec2 wm = 0.75 - f * f;
	vec2 wh = 0.5 * (0.5 + f) * (0.5 + f);

	float mm = cellValue(field, n, u, v, c) - offset;
	float lm = cellValue(field, n, u, v, c + vec2(-1.0, 0.0)) - offset;
	float hm = cellValue(field, n, u, v, c + vec2(1.0, 0.0)) - offset;
	float ml = cellValue(field, n, u, v, c + vec2(0.0, -1.0)) - offset;
	float mh = cellValue(field, n, u, v, c + vec2(0.0, 1.0)) - offset;
	float ll = cellValue(field, n, u, v, c + vec2(-1.0, -1.0)) - offset;
	float hl = cellValue(field, n, u, v, c + vec2(1.0, -1.0)) - offset;
	float lh = cellValue(field, n, u, v, c + vec2(-1.0, 1.0)) - offset;
	float hh = cellValue(field, n, u, v, c + vec2(1.0, 1.0)) - offset;

	bvec2 low = lessThan(c, vec2(0.5));
	bvec2 high = greaterThan(c, last - 0.5);
	if (low.x && low.y) ll = (mm + lm + ml) / 3.0;
	if (high.x && low.y) hl = (mm + hm + ml) / 3.0;
	if (low.x && high.y) lh = (mm + lm + mh) / 3.0;
	if (high.x && high.y) hh = (mm + hm + mh) / 3.0;

	return wl.y * (wl.x * ll + wm.x * ml + wh.x * hl)
		+ wm.y * (wl.x * lm + wm.x * mm + wh.x * hm)
		+ wh.y * (wl.x * lh + wm.x * mh + wh.x * hh);
}

// A field's value blended linearly between the four nearest cell centres:
// continuous, cheaper than smoothValue, with a slope that jumps.
float linearValue(samplerCube field, vec3 d) {
	vec3 n, u, v;
	vec2 q;
	faceOf(d, n, u, v, q);
	vec2 p = cellPosition(q) - 0.5;
	vec2 last = vec2(uResolution - 1.0);
	vec2 c = floor(p);
	vec2 f = p - c;
	vec2 borrowed = vec2(lessThan(c, vec2(-0.5))) * (1.0 - f)
		+ vec2(greaterThan(c, last - 0.5)) * f;
	if (borrowed.x + borrowed.y > 0.0) {
		p -= borrowed.yx * edgeShift(p);
	}

	c = floor(p);
	f = p - c;
	float ll = cellValue(field, n, u, v, c);
	float hl = cellValue(field, n, u, v, c + vec2(1.0, 0.0));
	float lh = cellValue(field, n, u, v, c + vec2(0.0, 1.0));
	float hh = cellValue(field, n, u, v, c + vec2(1.0, 1.0));

	bvec2 low = lessThan(c, vec2(-0.5));
	bvec2 high = greaterThan(c, last - 0.5);
	if (low.x && low.y) ll = (hl + lh + hh) / 3.0;
	if (high.x && low.y) hl = (ll + lh + hh) / 3.0;
	if (low.x && high.y) lh = (ll + hl + hh) / 3.0;
	if (high.x && high.y) hh = (ll + hl + lh) / 3.0;

	return mix(mix(ll, hl, f.x), mix(lh, hh, f.x), f.y);
}

// Elevation in metres, smooth.
float elevationAt(vec3 d) {
	return smoothValue(uElevation, d, 0.0);
}

// Elevation in metres, blended linearly.
float elevationLinear(vec3 d) {
	return linearValue(uElevation, d);
}
`;

/**
 * Raises each vertex by its height above the sea, times the exaggeration,
 * so land stands up and the sea stays a sphere. `position` is a unit vector
 * in core coordinates; the model matrix turns it into the scene's frame.
 */
const VERTEX_GLSL = /* glsl */ `
${ELEVATION_GLSL}
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;

out vec3 vSurface;

void main() {
	vec3 direction = normalize(position);
	float raised = max(elevationAt(direction) - uSeaLevel, 0.0);
	vSurface = direction * (1.0 + raised * uExaggeration / PLANET_RADIUS_M);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(vSurface, 1.0);
}
`;

/**
 * Colours and shades one point of the surface.
 *
 * The coast is decided per fragment from the smooth elevation against the
 * sea level, softened over about a pixel. An elevation equal to the sea
 * level is sea, as in the core.
 *
 * The slope that shades the land is measured by sampling the elevation a
 * little to each side of the point in direction space rather than in face
 * coordinates, whose axes bend where faces meet; measured this way it is
 * continuous across cube edges. Half a cell to each side of a linear blend
 * gives a slope with no jumps.
 *
 * Relief is shaded the way a printed map does it, by a light at the same
 * height above the horizon everywhere, shining from the upper left of the
 * screen; a real sun would flatten the relief beneath it. A second, gentle
 * term darkens the globe away from that side so it still reads as a ball.
 * Both are fixed to the camera.
 *
 * Sunlight is drawn in one of two ways, as `uSunlightAsLine` says. Drawn
 * as shade, the second term gives way to day and night from the sun's
 * direction, `uSunDirection`: the side facing the sun is evenly lit, the
 * side facing away is drawn at {@link NIGHT_BRIGHTNESS} of that, and the
 * change between them is softened over a band about 12° wide centred on
 * the line where the sun is on the horizon. The map-style relief shading
 * stays as it is. Drawn as a line, the colours are shaded exactly as with
 * sunlight off, since over a data layer a darkened colour would read as
 * another value, and the line between day and night is drawn instead, a
 * light line with a dark edge on each side like the brush outline, as wide
 * in pixels wherever it lies, under the brush outline. Which of the two is
 * drawn is set apart from whether a data layer is shown: the line can be
 * drawn over the height colours too. With sunlight off, every step is as
 * it is without sunlight at all.
 *
 * Grid lines are drawn where the cell position is a whole number. Their
 * width in pixels comes from the screen derivative of the direction, which
 * is continuous everywhere, carried through the face mapping by hand: the
 * derivative of the cell position itself jumps at cube edges.
 *
 * The brush outline is a ring where the angle from the brush's centre equals
 * its radius. It is worked out from the direction alone, so it crosses cube
 * edges unbroken and lies on the relief like a line drawn on the ground.
 * The line is light with a dark edge on each side, so it shows against both
 * sea and snow.
 *
 * While a data layer is shown, its value sets the colour in place of the
 * height, through the ramp in the `uRamp` uniforms stretched over
 * `uLayerRange`, and is shaded as the height colours are, so the relief
 * still reads. The sea no longer differs in colour from the land there, so
 * the coast is drawn as a thin line where the smooth elevation crosses the
 * sea level, dark over light colours and light over dark ones. For the line,
 * the height above sea level is blended from each cell's own height above
 * it rather than found by taking the sea level from the blended elevation:
 * where every cell is at the sea level it is then exactly zero, not rounding
 * noise about zero that would speckle the line over the whole stretch, and
 * where the surface changes by less than {@link COAST_MIN_CHANGE_M} a pixel
 * it is level, with no crossing to mark, and gets no line. That height also
 * decides what is land there; it differs from the terrain's only by
 * rounding. With no layer shown, every step is as it was without one: the
 * terrain is drawn exactly as before.
 */
const FRAGMENT_GLSL = /* glsl */ `
${ELEVATION_GLSL}
uniform mat3 normalMatrix;
uniform float uGridOpacity;
uniform vec3 uBrushCentre;
uniform float uBrushRadius;

const int MAX_RAMP_STOPS = ${MAX_RAMP_STOPS};

uniform bool uSunlight;
uniform bool uSunlightAsLine;
uniform vec3 uSunDirection;

uniform bool uLayerShown;
uniform samplerCube uLayer;
uniform vec2 uLayerRange;
uniform int uRampCount;
uniform float uRampAt[MAX_RAMP_STOPS];
uniform vec3 uRampColour[MAX_RAMP_STOPS];

in vec3 vSurface;

out vec4 fragColour;

// Distance to each side at which the slope is sampled, in cell widths.
const float SLOPE_STEP_CELLS = 0.5;
// Screen direction the relief light comes from, in view space.
const vec3 RELIEF_LIGHT = vec3(-0.7071, 0.7071, 0.0);
// Direction of the light that rounds the globe, in view space.
const vec3 GLOBE_LIGHT = vec3(-0.4264, 0.5685, 0.7035);
// Tangent of the relief light's angle from straight overhead.
const float RELIEF_LIGHT_SLANT = 1.4;
// Brightness of the globe on the side facing away from GLOBE_LIGHT.
const float GLOBE_SHADE = 0.58;
// How strongly slopes brighten and darken the land, 0 to 1.
const float RELIEF_STRENGTH = 0.8;
// Half the width of a grid line and the cell sizes over which the grid
// fades in, all in pixels.
const float GRID_HALF_WIDTH = 0.6;
const float GRID_FADE_FROM = 2.5;
const float GRID_FADE_TO = 7.0;
// Half the width of the brush outline's light line, the width of the dark
// edge on each side of it, both in pixels, and how dark that edge is.
const float BRUSH_LINE_HALF_WIDTH = 0.75;
const float BRUSH_EDGE_WIDTH = 1.0;
const float BRUSH_EDGE_OPACITY = 0.55;
// Half the width of the coastline drawn over a data layer, in pixels, how
// strongly it shows, and the brightness above which it is drawn dark.
const float COAST_HALF_WIDTH = 0.6;
const float COAST_OPACITY = 0.8;
const float COAST_DARK_ABOVE = 0.45;
// Change in the height above sea level, in metres a pixel, below which the
// surface is level and the coastline is not drawn.
const float COAST_MIN_CHANGE = ${glslFloat(COAST_MIN_CHANGE_M)};
// Brightness of the night side under sunlight, against the day side's 1.
const float NIGHT_BRIGHTNESS = ${glslFloat(NIGHT_BRIGHTNESS)};
// Sine of half the width of the band over which day turns to night: 6°.
const float TWILIGHT_HALF_WIDTH = ${glslFloat(Math.sin((TWILIGHT_HALF_WIDTH_DEG * Math.PI) / 180))};
// Half the width of the light line between day and night drawn over a data
// layer, the width of the dark edge on each side of it, both in pixels, and
// how strongly each shows.
const float TERMINATOR_LINE_HALF_WIDTH = 0.6;
const float TERMINATOR_EDGE_WIDTH = 1.0;
const float TERMINATOR_LINE_OPACITY = 0.85;
const float TERMINATOR_EDGE_OPACITY = 0.5;

${glslRamp('landColour', LAND_RAMP)}

${glslRamp('oceanColour', OCEAN_RAMP)}

// Colour of the surface where it is 'above' metres above sea level and
// 'land' of the fragment, 0 to 1, is land.
vec3 surfaceColour(float above, float land) {
	return mix(oceanColour(-above), landColour(above), land);
}

// Colour along the data ramp at t, 0 at the low end and 1 at the high end,
// blended between the stops as glslRamp's functions are.
vec3 rampColour(float t) {
	vec3 colour = uRampColour[0];
	for (int i = 1; i < MAX_RAMP_STOPS; i++) {
		if (i >= uRampCount) {
			break;
		}
		float span = uRampAt[i] - uRampAt[i - 1];
		colour = mix(colour, uRampColour[i], clamp((t - uRampAt[i - 1]) / span, 0.0, 1.0));
	}
	return colour;
}

// Colour of the data layer at d.
vec3 layerColour(vec3 d) {
	float value = smoothValue(uLayer, d, 0.0);
	return rampColour((value - uLayerRange.x) / (uLayerRange.y - uLayerRange.x));
}

// How much of the fragment the coastline covers, 0 to 1, where the surface
// is 'above' metres above sea level, changing by 'change' metres a pixel.
// The line is the same width in pixels on any slope, however gentle; a
// surface changing by less than COAST_MIN_CHANGE is level, with no crossing
// to mark, and gets none.
float coastCoverage(float above, float change) {
	if (change < COAST_MIN_CHANGE) {
		return 0.0;
	}
	float pixels = abs(above) / change;
	return 1.0 - smoothstep(COAST_HALF_WIDTH - 0.5, COAST_HALF_WIDTH + 0.5, pixels);
}

// Unit normal of the exaggerated terrain at d, in core coordinates.
vec3 reliefNormal(vec3 d) {
	vec3 east = cross(vec3(0.0, 0.0, 1.0), d);
	float eastLength = dot(east, east);
	east = eastLength > 1e-10 ? east * inversesqrt(eastLength) : vec3(1.0, 0.0, 0.0);
	vec3 north = cross(d, east);
	float reach = SLOPE_STEP_CELLS * 2.0 * QUARTER_PI / uResolution;
	vec2 rise = vec2(
		elevationLinear(d + reach * east) - elevationLinear(d - reach * east),
		elevationLinear(d + reach * north) - elevationLinear(d - reach * north)
	);
	vec2 slope = rise * (uExaggeration / (2.0 * reach * PLANET_RADIUS_M));
	return normalize(d - slope.x * east - slope.y * north);
}

// Brightness of the land at d from its slope: 1 on level ground.
float reliefShade(vec3 d) {
	vec3 up = normalize(normalMatrix * d);
	vec3 normal = normalize(normalMatrix * reliefNormal(d));
	vec3 along = RELIEF_LIGHT - up * dot(RELIEF_LIGHT, up);
	vec3 light = normalize(up + RELIEF_LIGHT_SLANT * along);
	return max(dot(normal, light), 0.0) / dot(up, light);
}

// How much of the fragment a grid line covers, 0 to 1.
float gridCoverage(vec3 d) {
	vec3 n, u, v;
	vec2 q;
	faceOf(d, n, u, v, q);
	float along = dot(d, n);
	vec3 dx = dFdx(d);
	vec3 dy = dFdy(d);
	vec2 qx = (vec2(dot(dx, u), dot(dx, v)) - q * dot(dx, n)) / along;
	vec2 qy = (vec2(dot(dy, u), dot(dy, v)) - q * dot(dy, n)) / along;
	vec2 cellsPerQ = 0.5 * uResolution / (QUARTER_PI * (1.0 + q * q));
	vec2 cellsPerPixel = max(cellsPerQ * sqrt(qx * qx + qy * qy), 1e-6);
	vec2 cell = cellPosition(q);
	vec2 pixels = abs(fract(cell + 0.5) - 0.5) / cellsPerPixel;
	vec2 line = 1.0 - smoothstep(GRID_HALF_WIDTH - 0.5, GRID_HALF_WIDTH + 0.5, pixels);
	line *= smoothstep(GRID_FADE_FROM, GRID_FADE_TO, 1.0 / cellsPerPixel);
	return max(line.x, line.y);
}

// How much of the day the point at d has, 0 on the night side to 1 on the
// day side.
float daylight(vec3 d) {
	return smoothstep(-TWILIGHT_HALF_WIDTH, TWILIGHT_HALF_WIDTH, dot(d, uSunDirection));
}

// How much of the fragment the line between day and night covers, 0 to 1:
// x for its light line alone and y for the line together with its dark
// edges. Near the line the sine of the sun's height is its angle, so the
// line is as wide in pixels wherever it lies.
vec2 terminatorCoverage(vec3 d) {
	float height = dot(d, uSunDirection);
	float perPixel = max(length(vec2(dFdx(height), dFdy(height))), 1e-7);
	float pixels = abs(height) / perPixel;
	vec2 halfWidth = TERMINATOR_LINE_HALF_WIDTH + vec2(0.0, TERMINATOR_EDGE_WIDTH);
	return 1.0 - smoothstep(halfWidth - 0.5, halfWidth + 0.5, vec2(pixels));
}

// How much of the fragment the brush outline covers, 0 to 1: x for its
// light line alone and y for the line together with its dark edges.
vec2 brushCoverage(vec3 d) {
	// The arctangent keeps its precision for the small angles of a narrow
	// brush, where an arccosine of the dot product would not.
	float angle = atan(length(cross(d, uBrushCentre)), dot(d, uBrushCentre));
	float perPixel = max(length(vec2(dFdx(angle), dFdy(angle))), 1e-7);
	float pixels = abs(angle - uBrushRadius) / perPixel;
	vec2 halfWidth = BRUSH_LINE_HALF_WIDTH + vec2(0.0, BRUSH_EDGE_WIDTH);
	return 1.0 - smoothstep(halfWidth - 0.5, halfWidth + 0.5, vec2(pixels));
}

void main() {
	vec3 d = normalize(vSurface);
	// Over a data layer the sea level is taken from each cell before they
	// are blended, so a stretch at the sea level is exactly zero.
	float above;
	if (uLayerShown) {
		above = smoothValue(uElevation, d, uSeaLevel);
	} else {
		above = elevationAt(d) - uSeaLevel;
	}
	float change = fwidth(above);
	float perPixel = max(change, 1e-4);
	float land = clamp(above / perPixel, 0.0, 1.0);

	vec3 colour = uLayerShown ? layerColour(d) : surfaceColour(above, land);

	float shade = 1.0;
	if (land > 0.0) {
		shade = mix(1.0, reliefShade(d), land * RELIEF_STRENGTH);
	}
	if (uSunlight && !uSunlightAsLine) {
		shade *= mix(NIGHT_BRIGHTNESS, 1.0, daylight(d));
	} else {
		float facing = 0.5 + 0.5 * dot(normalize(normalMatrix * d), GLOBE_LIGHT);
		shade *= mix(GLOBE_SHADE, 1.0, facing);
	}
	colour *= shade;

	if (uLayerShown) {
		float brightness = dot(colour, vec3(0.2126, 0.7152, 0.0722));
		vec3 ink = vec3(brightness > COAST_DARK_ABOVE ? 0.0 : 1.0);
		colour = mix(colour, ink, COAST_OPACITY * coastCoverage(above, change));
	}

	if (uGridOpacity > 0.0) {
		// Light lines over the sea and dark ones over the land.
		colour = mix(colour, vec3(1.0 - land), uGridOpacity * gridCoverage(d));
	}

	if (uSunlight && uSunlightAsLine) {
		vec2 terminator = terminatorCoverage(d);
		colour = mix(colour, vec3(0.0), TERMINATOR_EDGE_OPACITY * terminator.y);
		colour = mix(colour, vec3(1.0), TERMINATOR_LINE_OPACITY * terminator.x);
	}

	if (uBrushRadius > 0.0) {
		vec2 outline = brushCoverage(d);
		colour = mix(colour, vec3(0.0), BRUSH_EDGE_OPACITY * outline.y);
		colour = mix(colour, vec3(1.0), outline.x);
	}

	// A little noise, less than one step of the display's colour depth,
	// keeps the slow gradients of the open sea from showing as bands.
	float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
	colour += (grain - 0.5) / 255.0;

	fragColour = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
`;

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

/** Per-cell values as a cube texture, and the views it uploads from. */
export type CellTexture = {
	readonly texture: CubeTexture;
	/** Cells along a face edge. */
	readonly resolution: number;
	/** Each face's cells: a view into the values given, not a copy. */
	readonly faces: readonly Float32Array[];
};

/**
 * Makes the cube texture the shaders read per-cell values from, one texel
 * per cell.
 *
 * @remarks
 * The grid lays its faces out as a cube map in core coordinates, so the
 * faces go in as they are, in order and unflipped: cell (face, i, j) is
 * texel (i, j) of that face. The texture keeps hold of the values without
 * copying them, and is uploaded when it is next drawn.
 *
 * @param values - One value per cell of the grid, in cell order.
 * @param resolution - Cells along a face edge.
 * @returns The texture, with the views of each face.
 * @throws RangeError if `values` does not hold exactly one value per cell.
 */
export const createCellTexture = (
	values: Float32Array,
	resolution: number,
): CellTexture => {
	const n = resolution;
	if (values.length !== FACE_COUNT * n * n) {
		throw new RangeError(
			`Per-cell values for resolution ${n} need ${FACE_COUNT * n * n} values; got ${values.length}`,
		);
	}
	const faces: Float32Array[] = [];
	for (let face = 0; face < FACE_COUNT; face++) {
		faces.push(values.subarray(face * n * n, (face + 1) * n * n));
	}
	const texture = new CubeTexture(
		faces.map((data) => new DataTexture(data, n, n, RedFormat, FloatType)),
	);
	texture.format = RedFormat;
	texture.type = FloatType;
	// Linear filtering of float textures is an optional extension, and its
	// blend weights are too coarse for a cell magnified over many pixels.
	texture.magFilter = NearestFilter;
	texture.minFilter = NearestFilter;
	texture.generateMipmaps = false;
	texture.flipY = false;
	texture.needsUpdate = true;
	return { texture, resolution: n, faces };
};

/** A data layer made ready for the shaders. */
export type PreparedLayer = CellTexture & {
	/** The values the ramp is stretched over. */
	readonly range: ValueRange;
	/** The ramp it is drawn with. */
	readonly ramp: ColourRamp;
};

/**
 * Checks a data layer and makes its texture.
 *
 * @param field - One value per cell, in cell order; kept, not copied.
 * @param resolution - Cells along a face edge of the world on show.
 * @param range - The values the ramp is stretched over.
 * @param ramp - The ramp to draw it with.
 * @returns The layer, ready for {@link showLayer}.
 * @throws RangeError if the range or the ramp is missing, if the range's
 * ends are not finite with `min` below `max`, if the ramp fails
 * {@link checkRamp}, or if the field does not hold one value per cell.
 */
export const prepareLayer = (
	field: Float32Array,
	resolution: number,
	range: ValueRange | undefined,
	ramp: ColourRamp | undefined,
): PreparedLayer => {
	if (range === undefined || ramp === undefined) {
		throw new RangeError('A data layer needs a range and a ramp');
	}
	if (
		!Number.isFinite(range.min) ||
		!Number.isFinite(range.max) ||
		!(range.min < range.max)
	) {
		throw new RangeError(
			`A data layer's range must run up from one finite value to another; got ${range.min} to ${range.max}`,
		);
	}
	checkRamp(ramp);
	return {
		...createCellTexture(field, resolution),
		range: { min: range.min, max: range.max },
		ramp,
	};
};

/**
 * Sets the uniforms that draw a data layer, or that draw the height
 * colours instead.
 *
 * @param uniforms - The globe's uniforms.
 * @param layer - The layer to show, or null to show none.
 */
export const showLayer = (
	uniforms: GlobeUniforms,
	layer: PreparedLayer | null,
): void => {
	if (layer === null) {
		uniforms.uLayerShown.value = false;
		uniforms.uLayer.value = null;
		return;
	}
	uniforms.uLayerShown.value = true;
	uniforms.uLayer.value = layer.texture;
	uniforms.uLayerRange.value.set(layer.range.min, layer.range.max);
	const { stops } = layer.ramp;
	uniforms.uRampCount.value = stops.length;
	uniforms.uRampAt.value.fill(0);
	uniforms.uRampColour.value.fill(0);
	stops.forEach((stop, index) => {
		uniforms.uRampAt.value[index] = stop.at;
		uniforms.uRampColour.value.set(
			[16, 8, 0].map((shift) => ((stop.colour >> shift) & 0xff) / 255),
			index * 3,
		);
	});
};

/**
 * Puts a data layer on show in place of the one shown, or shows none.
 *
 * @remarks
 * The new layer is checked and made before anything else is touched, so a
 * layer that is refused leaves the one shown as it was: still shown, its
 * texture whole. Only once the new layer is made is the old one's texture
 * disposed of, once, and the new one shown.
 *
 * @param uniforms - The globe's uniforms.
 * @param shown - The layer on show, or null for none.
 * @param resolution - Cells along a face edge of the world on show, or null
 * before any world is shown.
 * @param field - One value per cell, in cell order, kept, not copied; or
 * null to show no layer.
 * @param range - The values the ramp is stretched over. Needed with a field.
 * @param ramp - The ramp to draw it with. Needed with a field.
 * @returns The layer now on show, or null for none.
 * @throws RangeError for a field before any world is shown, and whenever
 * {@link prepareLayer} refuses the field, the range or the ramp.
 */
export const replaceLayer = (
	uniforms: GlobeUniforms,
	shown: PreparedLayer | null,
	resolution: number | null,
	field: Float32Array | null,
	range?: ValueRange,
	ramp?: ColourRamp,
): PreparedLayer | null => {
	let next: PreparedLayer | null = null;
	if (field !== null) {
		if (resolution === null) {
			throw new RangeError('A data layer needs a world to be shown first');
		}
		next = prepareLayer(field, resolution, range, ramp);
	}
	shown?.texture.dispose();
	showLayer(uniforms, next);
	return next;
};

/**
 * How the globe is lit: `'off'`, as without the sun; `'darkened'`, by the
 * sun, with the side facing away from it darkened; or `'line'`, with the
 * colours shaded as without the sun and the line between day and night
 * drawn over them.
 */
export type SunlightStyle = 'off' | 'darkened' | 'line';

/**
 * Sets how the globe is lit by the sun, or that it is lit as without it.
 *
 * @param uniforms - The globe's uniforms.
 * @param style - How the globe is lit.
 */
export const showSunlight = (
	uniforms: GlobeUniforms,
	style: SunlightStyle,
): void => {
	uniforms.uSunlight.value = style !== 'off';
	uniforms.uSunlightAsLine.value = style === 'line';
};

/**
 * The sun's direction as a unit vector.
 *
 * @param direction - Any finite, non-zero vector.
 * @returns The vector scaled to length 1.
 * @throws RangeError for a zero or non-finite vector.
 */
export const unitSunDirection = (direction: Vec3): Vec3 => {
	const length = Math.hypot(...direction);
	if (!(length > 0 && Number.isFinite(length))) {
		throw new RangeError(
			`The sun's direction must be a finite, non-zero vector; got ${direction.join(', ')}`,
		);
	}
	return [direction[0] / length, direction[1] / length, direction[2] / length];
};

/**
 * Sets the direction the sunlight comes from.
 *
 * @param uniforms - The globe's uniforms.
 * @param direction - The sun's direction in core coordinates: any finite,
 * non-zero vector; it is normalised.
 * @throws RangeError as {@link unitSunDirection} does; the direction is
 * then left as it was.
 */
export const aimSunlight = (uniforms: GlobeUniforms, direction: Vec3): void => {
	uniforms.uSunDirection.value.set(...unitSunDirection(direction));
};
