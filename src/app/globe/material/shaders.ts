/** The globe's vertex and fragment shaders. */

import { MAX_RAMP_STOPS } from '../ramp';
import {
	COAST_MIN_CHANGE_M,
	NIGHT_BRIGHTNESS,
	TWILIGHT_HALF_WIDTH_DEG,
} from './constants';
import { glslFloat, glslRamp } from './glsl';
import { LAND_RAMP, OCEAN_RAMP } from './heightRamps';
import { ELEVATION_GLSL, RELIEF_GLSL } from './relief.glsl';

/**
 * Raises each vertex by the relief rule. `position` is a unit vector in
 * core coordinates; the model matrix turns it into the scene's frame.
 */
export const VERTEX_GLSL = /* glsl */ `
${RELIEF_GLSL}
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;

out vec3 vSurface;

void main() {
	vSurface = raisedSurface(normalize(position));
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
export const FRAGMENT_GLSL = /* glsl */ `
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
