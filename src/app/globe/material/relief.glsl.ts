/**
 * The shaders' sampling of per-cell values and the globe's relief rule.
 */

import { PLANET_RADIUS_KM } from '../../../core/index';
import type { GlobeUniforms, ReliefUniforms } from './globeMaterial';
import { glslFloat } from './glsl';

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
export const ELEVATION_GLSL = /* glsl */ `
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
 * The globe's relief rule, for any shader that places something on the
 * drawn surface: the sampling of {@link GlobeUniforms.uElevation} and
 * `raisedSurface`, which raises a point of the sphere by its height above
 * the sea, times the exaggeration, so land stands up and the sea stays a
 * sphere.
 *
 * @remarks
 * A shader built on this reads the elevation, the resolution, the sea level
 * and the exaggeration from uniforms of the names in {@link ReliefUniforms}.
 * Handed the globe's own uniform objects, it follows every change of the
 * terrain and of the view with nothing more done.
 */
export const RELIEF_GLSL = /* glsl */ `
${ELEVATION_GLSL}
// The drawn surface over the unit direction d, in planet radii from the
// centre, in core coordinates.
vec3 raisedSurface(vec3 d) {
	float raised = max(elevationAt(d) - uSeaLevel, 0.0);
	return d * (1.0 + raised * uExaggeration / PLANET_RADIUS_M);
}
`;
