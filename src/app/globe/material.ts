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
 * Shape and colour are kept apart. The vertex shader raises the surface;
 * the fragment shader asks `surfaceColour` what colour a point is and then
 * shades it. A different colour source can replace `surfaceColour` without
 * touching the rest.
 *
 * Colours are authored and blended as display (sRGB) values and written to
 * the canvas unchanged.
 */

import {
	type CubeTexture,
	GLSL3,
	type IUniform,
	RawShaderMaterial,
	Vector3,
} from 'three';
import { normaliseSeaLevel, PLANET_RADIUS_KM } from '../../core/index';

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
 * Declarations and elevation sampling shared by both shaders.
 *
 * `faceOf` finds the cube face a direction passes through. The two in-face
 * axes it returns are not the grid's `u` and `v`: every use below treats
 * the two axes alike and is unchanged by flipping or swapping them, so any
 * pair will do.
 *
 * `cellElevation` reads one cell, addressed by whole steps along those axes
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

float cellElevation(vec3 n, vec3 u, vec3 v, vec2 cell) {
	vec2 w = (2.0 * cell + 1.0) / uResolution - 1.0;
	vec2 over = max(abs(w) - 1.0, 0.0);
	vec3 lookup = (1.0 - max(over.x, over.y)) * n
		+ clamp(w.x, -1.0, 1.0) * u
		+ clamp(w.y, -1.0, 1.0) * v;
	return textureLod(uElevation, lookup, 0.0).r;
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

// Elevation in metres as a smooth surface through the cells: a quadratic
// B-spline over the 3 x 3 cells around the point, with a continuous slope.
float elevationAt(vec3 d) {
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

	float mm = cellElevation(n, u, v, c);
	float lm = cellElevation(n, u, v, c + vec2(-1.0, 0.0));
	float hm = cellElevation(n, u, v, c + vec2(1.0, 0.0));
	float ml = cellElevation(n, u, v, c + vec2(0.0, -1.0));
	float mh = cellElevation(n, u, v, c + vec2(0.0, 1.0));
	float ll = cellElevation(n, u, v, c + vec2(-1.0, -1.0));
	float hl = cellElevation(n, u, v, c + vec2(1.0, -1.0));
	float lh = cellElevation(n, u, v, c + vec2(-1.0, 1.0));
	float hh = cellElevation(n, u, v, c + vec2(1.0, 1.0));

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

// Elevation in metres blended linearly between the four nearest cell
// centres: continuous, cheaper than elevationAt, with a slope that jumps.
float elevationLinear(vec3 d) {
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
	float ll = cellElevation(n, u, v, c);
	float hl = cellElevation(n, u, v, c + vec2(1.0, 0.0));
	float lh = cellElevation(n, u, v, c + vec2(0.0, 1.0));
	float hh = cellElevation(n, u, v, c + vec2(1.0, 1.0));

	bvec2 low = lessThan(c, vec2(-0.5));
	bvec2 high = greaterThan(c, last - 0.5);
	if (low.x && low.y) ll = (hl + lh + hh) / 3.0;
	if (high.x && low.y) hl = (ll + lh + hh) / 3.0;
	if (low.x && high.y) lh = (ll + hl + hh) / 3.0;
	if (high.x && high.y) hh = (ll + hl + lh) / 3.0;

	return mix(mix(ll, hl, f.x), mix(lh, hh, f.x), f.y);
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
 */
const FRAGMENT_GLSL = /* glsl */ `
${ELEVATION_GLSL}
uniform mat3 normalMatrix;
uniform float uGridOpacity;
uniform vec3 uBrushCentre;
uniform float uBrushRadius;

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

${glslRamp('landColour', LAND_RAMP)}

${glslRamp('oceanColour', OCEAN_RAMP)}

// Colour of the surface where it is 'above' metres above sea level and
// 'land' of the fragment, 0 to 1, is land.
vec3 surfaceColour(float above, float land) {
	return mix(oceanColour(-above), landColour(above), land);
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
	float above = elevationAt(d) - uSeaLevel;
	float land = clamp(above / max(fwidth(above), 1e-4), 0.0, 1.0);

	vec3 colour = surfaceColour(above, land);

	float shade = 1.0;
	if (land > 0.0) {
		shade = mix(1.0, reliefShade(d), land * RELIEF_STRENGTH);
	}
	float facing = 0.5 + 0.5 * dot(normalize(normalMatrix * d), GLOBE_LIGHT);
	shade *= mix(GLOBE_SHADE, 1.0, facing);
	colour *= shade;

	if (uGridOpacity > 0.0) {
		// Light lines over the sea and dark ones over the land.
		colour = mix(colour, vec3(1.0 - land), uGridOpacity * gridCoverage(d));
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
 * texture starts empty, the grid hidden and no brush outline drawn.
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
