/**
 * The winds on the globe: arrows laid evenly over the sphere, each the mean
 * wind over the patch of the surface it stands for, drawn the same size on
 * the screen at every zoom.
 *
 * Where the arrows stand comes from a spiral lattice, which spreads points
 * evenly over the sphere with no lines of latitude or cube faces showing.
 * There are a few lattices, from {@link ARROW_SPACINGS_DEG}, and the zoom
 * picks one: the closer the camera, the finer the spacing, so the arrows
 * never crowd one another. Each cell of the world's grid belongs to the
 * patch of the arrow nearest its centre, and an arrow shows the mean wind
 * of its patch's cells, as vectors, weighted by their areas. The patches
 * are worked out once for each grid and spacing and kept.
 *
 * The maths is in pure functions; {@link createWindArrows} only hands what
 * they give to the GPU. The arrows are one instanced mesh, one draw for all
 * of them. Each is raised onto the drawn relief by the globe's own rule
 * ({@link RELIEF_GLSL}), reading the globe's own uniforms, and is drawn as
 * a flat shape facing the screen, dark with a thin light edge. They are not
 * hidden by the relief, only faded out towards the globe's edge, and so
 * hidden on the far side.
 */

import {
	BufferAttribute,
	DynamicDrawUsage,
	GLSL3,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	type IUniform,
	Mesh,
	RawShaderMaterial,
	Vector2,
} from 'three';
import { cellFrames, cellsWithin, type Grid, getGrid } from '../../core/index';
import { verticalFovDeg } from './camera';
import {
	glslColour,
	glslFloat,
	RELIEF_GLSL,
	type ReliefUniforms,
} from './material';

/**
 * The spacings the arrows are laid out at, in degrees of arc between
 * neighbouring arrows, coarsest first: each a little over √2 times the
 * next, so each step about doubles the number of arrows.
 */
export const ARROW_SPACINGS_DEG = [8, 5.6, 4, 2.8, 2] as const;

/**
 * The speed at and above which an arrow is drawn at its longest and
 * heaviest, in metres a second.
 */
export const ARROW_CAP_SPEED = 10;

/** The speed below which the wind is calm and no arrow is drawn, in m/s. */
export const CALM_SPEED = 0.5;

/** The length of an arrow at {@link ARROW_CAP_SPEED}, in CSS pixels. */
export const ARROW_MAX_LENGTH_PX = 26;

/** The length of an arrow just above {@link CALM_SPEED}, in CSS pixels. */
export const ARROW_MIN_LENGTH_PX = 8;

/** Half the width of the shaft of the lightest arrow, in CSS pixels. */
export const ARROW_MIN_HALF_WIDTH_PX = 0.8;

/** Half the width of the shaft at {@link ARROW_CAP_SPEED}, in CSS pixels. */
export const ARROW_MAX_HALF_WIDTH_PX = 1.7;

/** The head's half-width as a multiple of the shaft's. */
export const HEAD_WIDTH_TIMES_SHAFT = 2.8;

/** The head's length as a multiple of its half-width. */
export const HEAD_LENGTH_TIMES_WIDTH = 1.7;

/** The most of an arrow's length its head takes. */
export const HEAD_MAX_SHARE = 0.55;

/** The width of the light edge around each arrow, in CSS pixels. */
export const ARROW_EDGE_PX = 1;

/** The colour inside an arrow, as a display (sRGB) value, `0xrrggbb`. */
export const ARROW_FILL_COLOUR = 0x12141a;

/** The colour of an arrow's edge, as a display (sRGB) value. */
export const ARROW_EDGE_COLOUR = 0xf5f7fa;

/**
 * The longest arrow as a share of the spacing between arrows on the screen
 * at which the zoom still picks that spacing.
 *
 * @remarks
 * The spacing is measured at the point of the globe nearest the camera,
 * where it is widest on the screen. Neighbouring arrows of the lattice are
 * never closer than about 0.87 of the spacing, and towards the globe's
 * edge, farther from the camera, they stand closer on the screen, so the
 * share is well under 1: arrows centred on their points never touch.
 */
export const ARROW_SPACING_SHARE = 0.55;

/**
 * How far an arrow is lifted above the drawn surface, in planet radii:
 * about 6 km.
 */
export const ARROW_CLEARANCE = 0.001;

const RADIANS_PER_DEGREE = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * The number of points a lattice of a spacing has: one for each square of
 * the spacing's side on the sphere.
 */
const latticeSize = (spacingDeg: number): number =>
	Math.max(
		1,
		Math.round((4 * Math.PI) / (spacingDeg * RADIANS_PER_DEGREE) ** 2),
	);

/**
 * Where the arrows stand at a spacing: points spread evenly over the
 * sphere by a spiral lattice.
 *
 * @remarks
 * The points run from the north pole to the south in equal steps of z,
 * each turned from the one before by the golden angle, so every point
 * takes an equal area and no lines of latitude, longitude or cube faces
 * show. There are about 4π / s² of them for a spacing of s radians:
 * neighbours stand about s apart, never closer than about 0.87 s, and no
 * place is farther than about 0.75 s from a point.
 *
 * @param spacingDeg - The spacing in degrees; positive.
 * @returns Unit vectors in core coordinates, x, y and z of each point in
 * turn, in a new array.
 * @throws RangeError if the spacing is not positive and finite.
 */
export const arrowSamples = (spacingDeg: number): Float64Array => {
	if (!(spacingDeg > 0 && Number.isFinite(spacingDeg))) {
		throw new RangeError(
			`An arrow spacing must be a positive number of degrees; got ${spacingDeg}`,
		);
	}
	const count = latticeSize(spacingDeg);
	const points = new Float64Array(3 * count);
	for (let i = 0; i < count; i++) {
		const z = 1 - (2 * i + 1) / count;
		const ring = Math.sqrt(1 - z * z);
		const longitude = i * GOLDEN_ANGLE;
		points[3 * i] = ring * Math.cos(longitude);
		points[3 * i + 1] = ring * Math.sin(longitude);
		points[3 * i + 2] = z;
	}
	return points;
};

/** The arrows of one spacing on one grid, and the cells each stands for. */
export type ArrowPatches = {
	/** The spacing, in degrees. */
	readonly spacingDeg: number;
	/** Where the arrows stand, as {@link arrowSamples} gives them. */
	readonly samples: Float64Array;
	/** How many arrows there are. */
	readonly count: number;
	/** For each cell, the index of the arrow whose patch holds it. */
	readonly owner: Int32Array;
	/** For each arrow, the area of its patch on the unit sphere. */
	readonly area: Float64Array;
};

/**
 * How far from a cell's centre its nearest arrow is looked for, as a share
 * of the spacing: past the farthest any place lies from its nearest point,
 * about 0.76 of the spacing, so every cell of a real grid finds one.
 */
const PATCH_SEARCH_SHARE = 0.85;

/**
 * Shares a grid's cells out among the arrows of a spacing: each cell to the
 * arrow nearest its centre.
 *
 * @param grid - The world's grid.
 * @param spacingDeg - The arrows' spacing, in degrees.
 * @returns The patches, in new arrays.
 * @throws Error if a cell's centre has no arrow within the search radius,
 * as no real grid's has, rather than lose the cell's area.
 */
export const arrowPatches = (grid: Grid, spacingDeg: number): ArrowPatches => {
	const samples = arrowSamples(spacingDeg);
	const count = samples.length / 3;
	const { cellCount, centres, areas } = grid;
	const owner = new Int32Array(cellCount).fill(-1);
	// The squared chord to the nearest arrow found so far, for each cell.
	const nearest = new Float64Array(cellCount).fill(Number.POSITIVE_INFINITY);
	const radius = PATCH_SEARCH_SHARE * spacingDeg * RADIANS_PER_DEGREE;
	for (let sample = 0; sample < count; sample++) {
		const x = samples[3 * sample] as number;
		const y = samples[3 * sample + 1] as number;
		const z = samples[3 * sample + 2] as number;
		for (const cell of cellsWithin(grid, [x, y, z], radius)) {
			const dx = (centres[3 * cell] as number) - x;
			const dy = (centres[3 * cell + 1] as number) - y;
			const dz = (centres[3 * cell + 2] as number) - z;
			const chord = dx * dx + dy * dy + dz * dz;
			if (chord < (nearest[cell] as number)) {
				nearest[cell] = chord;
				owner[cell] = sample;
			}
		}
	}
	const area = new Float64Array(count);
	for (let cell = 0; cell < cellCount; cell++) {
		const sample = owner[cell] as number;
		if (sample < 0) {
			throw new Error(
				`Cell ${cell} has no arrow within ${PATCH_SEARCH_SHARE} of the spacing of ${spacingDeg}°`,
			);
		}
		area[sample] = (area[sample] as number) + (areas[cell] as number);
	}
	return { spacingDeg, samples, count, owner, area };
};

/** The patches of each grid and spacing, worked out once and then kept. */
const PATCHES = new Map<string, ArrowPatches>();

/**
 * The patches of a grid and a spacing, worked out on first use and then
 * shared, so they must be treated as read-only.
 *
 * @param resolution - Cells along a face edge of the world's grid.
 * @param spacingDeg - The arrows' spacing, in degrees.
 * @throws RangeError if the resolution is not supported.
 */
export const patchesFor = (
	resolution: number,
	spacingDeg: number,
): ArrowPatches => {
	const key = `${resolution}:${spacingDeg}`;
	let patches = PATCHES.get(key);
	if (patches === undefined) {
		patches = arrowPatches(getGrid(resolution), spacingDeg);
		PATCHES.set(key, patches);
	}
	return patches;
};

/** A wind at every cell: one month's, or a mean over the year. */
export type WindField = {
	/** The eastward wind at each cell's centre, in metres a second. */
	readonly east: ArrayLike<number>;
	/** The northward wind at each cell's centre, in metres a second. */
	readonly north: ArrayLike<number>;
};

/**
 * The mean wind over each arrow's patch, as a vector.
 *
 * @remarks
 * Each cell's wind is made a vector in core coordinates from its eastward
 * and northward parts and the directions east and north at its centre,
 * and the vectors of a patch's cells are averaged, weighted by their
 * areas. What of the mean stands off the sphere at the arrow's point is
 * dropped, so the vector lies flat there. Summing vectors rather than
 * eastward and northward parts keeps a patch over a pole right, where east
 * and north turn right round from one side to the other.
 *
 * @param grid - The world's grid.
 * @param patches - The arrows and their patches on that grid.
 * @param field - The wind at each cell.
 * @param out - Where to write each arrow's mean wind in core coordinates,
 * metres a second, three numbers an arrow; at least `3 * patches.count`
 * long.
 * @throws RangeError if the field does not hold one wind per cell.
 */
export const patchWinds = (
	grid: Grid,
	patches: ArrowPatches,
	field: WindField,
	out: Float64Array,
): void => {
	const { cellCount, areas } = grid;
	if (field.east.length !== cellCount || field.north.length !== cellCount) {
		throw new RangeError(
			`A wind for a grid of ${cellCount} cells needs ${cellCount} values of each part; got ${field.east.length} and ${field.north.length}`,
		);
	}
	const { east, north } = cellFrames(grid);
	const { owner, samples, count, area } = patches;
	out.fill(0, 0, 3 * count);
	for (let cell = 0; cell < cellCount; cell++) {
		const weight = areas[cell] as number;
		const u = (field.east[cell] as number) * weight;
		const v = (field.north[cell] as number) * weight;
		const at = 3 * (owner[cell] as number);
		out[at] =
			(out[at] as number) +
			u * (east.x[cell] as number) +
			v * (north.x[cell] as number);
		out[at + 1] =
			(out[at + 1] as number) +
			u * (east.y[cell] as number) +
			v * (north.y[cell] as number);
		out[at + 2] = (out[at + 2] as number) + v * (north.z[cell] as number);
	}
	for (let sample = 0; sample < count; sample++) {
		const at = 3 * sample;
		const total = area[sample] as number;
		const x = (out[at] as number) / total;
		const y = (out[at + 1] as number) / total;
		const z = (out[at + 2] as number) / total;
		const px = samples[at] as number;
		const py = samples[at + 1] as number;
		const pz = samples[at + 2] as number;
		const up = x * px + y * py + z * pz;
		out[at] = x - up * px;
		out[at + 1] = y - up * py;
		out[at + 2] = z - up * pz;
	}
};

/** How an arrow is drawn, in CSS pixels. */
export type ArrowShape = {
	/** From the tail to the tip. */
	readonly length: number;
	/** Half the width of the shaft. */
	readonly shaftHalfWidth: number;
	/** From the back of the head to the tip. */
	readonly headLength: number;
	/** Half the width of the head at its back. */
	readonly headHalfWidth: number;
};

/**
 * The head of an arrow of a length and a shaft: as wide as
 * {@link HEAD_WIDTH_TIMES_SHAFT} says and as long as
 * {@link HEAD_LENGTH_TIMES_WIDTH} says, but shrunk, shape kept, to no more
 * than {@link HEAD_MAX_SHARE} of a short arrow; the shaft then no wider than
 * half the head. The arrows' vertex shader works it out the same way.
 *
 * @param length - The arrow's length, in CSS pixels.
 * @param shaftHalfWidth - Half the shaft's width, in CSS pixels.
 */
export const arrowWithHead = (
	length: number,
	shaftHalfWidth: number,
): ArrowShape => {
	const headLength = Math.min(
		HEAD_LENGTH_TIMES_WIDTH * HEAD_WIDTH_TIMES_SHAFT * shaftHalfWidth,
		HEAD_MAX_SHARE * length,
	);
	const headHalfWidth = headLength / HEAD_LENGTH_TIMES_WIDTH;
	return {
		length,
		shaftHalfWidth: Math.min(shaftHalfWidth, 0.5 * headHalfWidth),
		headLength,
		headHalfWidth,
	};
};

/**
 * How an arrow is drawn for a wind speed, where it faces the camera.
 *
 * @remarks
 * Its length and its weight grow in step with the speed above
 * {@link CALM_SPEED}, from {@link ARROW_MIN_LENGTH_PX} to
 * {@link ARROW_MAX_LENGTH_PX} long, until {@link ARROW_CAP_SPEED}, and no
 * further. The key draws its arrows with this too.
 *
 * @param speed - The wind speed, in metres a second.
 * @returns The arrow's shape, or null for a calm, or a speed that is not a
 * number, which draws nothing.
 */
export const arrowShape = (speed: number): ArrowShape | null => {
	if (!(speed >= CALM_SPEED)) {
		return null;
	}
	const t = Math.min(1, (speed - CALM_SPEED) / (ARROW_CAP_SPEED - CALM_SPEED));
	return arrowWithHead(
		ARROW_MIN_LENGTH_PX + t * (ARROW_MAX_LENGTH_PX - ARROW_MIN_LENGTH_PX),
		ARROW_MIN_HALF_WIDTH_PX +
			t * (ARROW_MAX_HALF_WIDTH_PX - ARROW_MIN_HALF_WIDTH_PX),
	);
};

/**
 * The outline of an arrow pointing right, its tail at x = 0 and its tip at
 * its length, y downwards on the screen: the seven corners in order round.
 *
 * @param shape - The arrow.
 * @returns Seven [x, y] corners, in CSS pixels.
 */
export const arrowOutline = (
	shape: ArrowShape,
): readonly (readonly [number, number])[] => {
	const { length, shaftHalfWidth: w, headLength, headHalfWidth: h } = shape;
	const back = length - headLength;
	return [
		[0, -w],
		[back, -w],
		[back, -h],
		[length, 0],
		[back, h],
		[back, w],
		[0, w],
	];
};

/** The arrays an arrow's numbers are written into for the GPU. */
export type ArrowBuffers = {
	/** Where each arrow stands: a unit vector, three numbers an arrow. */
	readonly anchor: Float32Array;
	/**
	 * Which way each arrow points: a unit vector flat on the sphere, three
	 * numbers an arrow.
	 */
	readonly wind: Float32Array;
	/**
	 * Each arrow's length and half the width of its shaft, in CSS pixels,
	 * two numbers an arrow.
	 */
	readonly shape: Float32Array;
};

/**
 * Writes the arrows to draw for the mean winds of each patch, leaving out
 * the calm ones.
 *
 * @param patches - The arrows and their patches.
 * @param winds - Each arrow's mean wind, as {@link patchWinds} writes it.
 * @param out - Where to write them, with room for every arrow.
 * @returns How many arrows were written, from the start of each array.
 */
export const writeArrows = (
	patches: ArrowPatches,
	winds: Float64Array,
	out: ArrowBuffers,
): number => {
	const { samples, count } = patches;
	let drawn = 0;
	for (let sample = 0; sample < count; sample++) {
		const at = 3 * sample;
		const x = winds[at] as number;
		const y = winds[at + 1] as number;
		const z = winds[at + 2] as number;
		const speed = Math.hypot(x, y, z);
		const shape = arrowShape(speed);
		if (shape === null) {
			continue;
		}
		const to = 3 * drawn;
		out.anchor[to] = samples[at] as number;
		out.anchor[to + 1] = samples[at + 1] as number;
		out.anchor[to + 2] = samples[at + 2] as number;
		out.wind[to] = x / speed;
		out.wind[to + 1] = y / speed;
		out.wind[to + 2] = z / speed;
		out.shape[2 * drawn] = shape.length;
		out.shape[2 * drawn + 1] = shape.shaftHalfWidth;
		drawn++;
	}
	return drawn;
};

/**
 * How many CSS pixels a radian of arc spans on the screen at the point of
 * the globe nearest the camera, where it spans the most.
 *
 * @param distance - The camera's distance from the centre, in planet radii;
 * more than 1.
 * @param heightPx - The view's height in CSS pixels.
 * @param aspect - The view's width over its height.
 */
export const pixelsPerRadian = (
	distance: number,
	heightPx: number,
	aspect: number,
): number => {
	const halfFov = (verticalFovDeg(aspect) * RADIANS_PER_DEGREE) / 2;
	return heightPx / 2 / Math.tan(halfFov) / (distance - 1);
};

/**
 * The spacing the arrows are laid out at for a zoom: the finest of
 * {@link ARROW_SPACINGS_DEG} at which the longest arrow is no more than
 * {@link ARROW_SPACING_SHARE} of the spacing on the screen, or the coarsest
 * when none is so wide.
 *
 * @param pixelsPerRadianNearest - What {@link pixelsPerRadian} gives.
 * @returns The spacing, in degrees.
 */
export const arrowSpacingFor = (pixelsPerRadianNearest: number): number => {
	let chosen: number = ARROW_SPACINGS_DEG[0];
	for (const spacing of ARROW_SPACINGS_DEG) {
		const onScreen = spacing * RADIANS_PER_DEGREE * pixelsPerRadianNearest;
		if (ARROW_MAX_LENGTH_PX <= ARROW_SPACING_SHARE * onScreen) {
			chosen = spacing;
		}
	}
	return chosen;
};

/**
 * Places each arrow: its point raised onto the drawn relief by the globe's
 * rule and lifted by {@link ARROW_CLEARANCE}, and around it, flat on the
 * screen, a quad holding the arrow, centred on the point and turned the way
 * the wind's direction there points on the screen. The arrow is as long
 * as given where it faces the camera, and shorter in step with the
 * foreshortening of the wind's direction towards the globe's edge; its
 * width stays. It fades out as the surface under it turns away from the
 * camera, and is dropped altogether past that, which hides the far side.
 *
 * `position` is a corner of the quad: x 0 at the tail and 1 at the tip,
 * y −1 and 1 at the sides.
 */
const ARROW_VERTEX_GLSL = /* glsl */ `
${RELIEF_GLSL}
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform vec2 uViewport;

in vec3 position;
in vec3 aAnchor;
in vec3 aWind;
in vec2 aShape;

out vec2 vLocal;
flat out vec4 vArrow;
out float vOpacity;

const float CLEARANCE = ${glslFloat(ARROW_CLEARANCE)};
// How far along the wind the screen direction is measured, in radii.
const float STEP = 0.001;
const float EDGE_WIDTH = ${glslFloat(ARROW_EDGE_PX)};
const float HEAD_WIDTH_TIMES_SHAFT = ${glslFloat(HEAD_WIDTH_TIMES_SHAFT)};
const float HEAD_LENGTH_TIMES_WIDTH = ${glslFloat(HEAD_LENGTH_TIMES_WIDTH)};
const float HEAD_MAX_SHARE = ${glslFloat(HEAD_MAX_SHARE)};
// How squarely the surface faces the camera, the cosine of the angle
// between its normal and the line of sight, over which arrows fade in.
const float FADE_FROM = 0.12;
const float FADE_TO = 0.35;

void main() {
	vec3 surface = raisedSurface(aAnchor) + CLEARANCE * aAnchor;
	vec4 view = modelViewMatrix * vec4(surface, 1.0);
	vec4 clip = projectionMatrix * view;
	vec4 ahead = projectionMatrix * (modelViewMatrix * vec4(surface + STEP * aWind, 1.0));
	vec2 moved = (ahead.xy / ahead.w - clip.xy / clip.w) * 0.5 * uViewport;
	float movedLength = length(moved);
	// Pixels a unit across the line of sight spans at the arrow's depth.
	float perUnit = projectionMatrix[1][1] * 0.5 * uViewport.y / clip.w;
	float shortening = clamp(movedLength / (STEP * perUnit), 0.0, 1.0);
	vec2 along = movedLength > 0.0 ? moved / movedLength : vec2(1.0, 0.0);
	vec2 across = vec2(-along.y, along.x);

	float len = aShape.x * shortening;
	float headLength = min(HEAD_LENGTH_TIMES_WIDTH * HEAD_WIDTH_TIMES_SHAFT * aShape.y, HEAD_MAX_SHARE * len);
	float headHalf = headLength / HEAD_LENGTH_TIMES_WIDTH;
	vArrow = vec4(len, min(aShape.y, 0.5 * headHalf), headLength, headHalf);

	float margin = EDGE_WIDTH + 1.0;
	vLocal = vec2(mix(-margin, len + margin, position.x), position.y * (headHalf + margin));
	vec2 offset = along * (vLocal.x - 0.5 * len) + across * vLocal.y;
	gl_Position = clip + vec4(offset * 2.0 / uViewport * clip.w, 0.0, 0.0);

	float facing = dot(normalize(normalMatrix * aAnchor), normalize(-view.xyz));
	vOpacity = smoothstep(FADE_FROM, FADE_TO, facing);
	if (vOpacity <= 0.0) {
		// Outside the clip volume, so nothing is drawn.
		gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
	}
}
`;

/**
 * Draws the arrow in its quad from its distance to the arrow's outline, in
 * CSS pixels: dark inside, a light edge {@link ARROW_EDGE_PX} wide around
 * it, both softened over about a device pixel. The corners of the edge are
 * rounded, as an outline drawn round the shape with a round pen would be.
 */
const ARROW_FRAGMENT_GLSL = /* glsl */ `
precision highp float;

in vec2 vLocal;
flat in vec4 vArrow;
in float vOpacity;

out vec4 fragColour;

const float EDGE_WIDTH = ${glslFloat(ARROW_EDGE_PX)};
const vec3 FILL = ${glslColour(ARROW_FILL_COLOUR)};
const vec3 EDGE = ${glslColour(ARROW_EDGE_COLOUR)};

// Signed distance from p to the triangle p0 p1 p2: negative inside.
float triangleDistance(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
	vec2 e0 = p1 - p0;
	vec2 e1 = p2 - p1;
	vec2 e2 = p0 - p2;
	vec2 v0 = p - p0;
	vec2 v1 = p - p1;
	vec2 v2 = p - p2;
	vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
	vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
	vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
	float s = sign(e0.x * e2.y - e0.y * e2.x);
	vec2 d = min(min(
		vec2(dot(q0, q0), s * (v0.x * e0.y - v0.y * e0.x)),
		vec2(dot(q1, q1), s * (v1.x * e1.y - v1.y * e1.x))),
		vec2(dot(q2, q2), s * (v2.x * e2.y - v2.y * e2.x)));
	return -sqrt(d.x) * sign(d.y);
}

// Signed distance from p to the arrow: a shaft from x = 0 to the back of
// the head, and the head on to the tip.
float arrowDistance(vec2 p) {
	float len = vArrow.x;
	float shaft = vArrow.y;
	float head = vArrow.z;
	float headHalf = vArrow.w;
	float back = len - head;
	vec2 halfSize = vec2(max(0.5 * back, 0.0), shaft);
	vec2 q = abs(p - vec2(halfSize.x, 0.0)) - halfSize;
	float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
	float tip = triangleDistance(p, vec2(back, -headHalf), vec2(len, 0.0), vec2(back, headHalf));
	return min(box, tip);
}

void main() {
	float d = arrowDistance(vLocal);
	float soft = max(0.5 * fwidth(d), 1e-3);
	float cover = 1.0 - smoothstep(EDGE_WIDTH - soft, EDGE_WIDTH + soft, d);
	float alpha = cover * vOpacity;
	if (alpha <= 0.0) {
		discard;
	}
	fragColour = vec4(mix(FILL, EDGE, smoothstep(-soft, soft, d)), alpha);
}
`;

/** The values the arrows' shaders read besides the globe's relief. */
export type WindArrowUniforms = ReliefUniforms & {
	/** The view's width and height, in CSS pixels. */
	readonly uViewport: IUniform<Vector2>;
};

/**
 * Creates the material that draws the arrows.
 *
 * @remarks
 * Drawn after the globe, blended over it, neither testing depth nor
 * writing it.
 *
 * @param relief - The globe's uniforms that shape the drawn surface: the
 * very objects, not copies, so the arrows follow every change of them.
 * @returns The material together with its uniforms.
 */
export const createWindArrowMaterial = (
	relief: ReliefUniforms,
): {
	readonly material: RawShaderMaterial;
	readonly uniforms: WindArrowUniforms;
} => {
	const uniforms: WindArrowUniforms = {
		uElevation: relief.uElevation,
		uResolution: relief.uResolution,
		uSeaLevel: relief.uSeaLevel,
		uExaggeration: relief.uExaggeration,
		uViewport: { value: new Vector2(1, 1) },
	};
	const material = new RawShaderMaterial({
		name: 'wind arrows',
		glslVersion: GLSL3,
		uniforms,
		vertexShader: ARROW_VERTEX_GLSL,
		fragmentShader: ARROW_FRAGMENT_GLSL,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	});
	return { material, uniforms };
};

/** The arrows on the globe. */
export type WindArrows = {
	/** The mesh, for the scene; its model matrix is the globe's. */
	readonly mesh: Mesh;
	/**
	 * Takes the grid of a new world and drops the winds shown, which were
	 * the old world's.
	 *
	 * @param resolution - Cells along a face edge of the new world's grid.
	 */
	setWorld(resolution: number): void;
	/**
	 * Shows the wind of each cell as arrows, or none.
	 *
	 * @param field - One month's wind or a mean of the year, one value of
	 * each part per cell of the world's grid; kept, not copied. Null shows
	 * no arrows.
	 * @throws RangeError if the field does not hold one value of each part
	 * per cell, or no world has been set; the arrows shown are then left as
	 * they were.
	 */
	setWinds(field: WindField | null): void;
	/**
	 * Takes the zoom, which picks the arrows' spacing by
	 * {@link arrowSpacingFor}.
	 *
	 * @param pixelsPerRadianNearest - What {@link pixelsPerRadian} gives for
	 * the camera.
	 */
	setZoom(pixelsPerRadianNearest: number): void;
	/** Takes the view's size in CSS pixels, which the arrows are sized in. */
	setViewport(widthPx: number, heightPx: number): void;
	/** Frees what the arrows hold on the GPU. */
	dispose(): void;
};

/** The corners of the quad each arrow is drawn in, as two triangles. */
const QUAD_CORNERS = Float32Array.of(0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0);
const QUAD_TRIANGLES = Uint16Array.of(0, 1, 2, 0, 2, 3);

/**
 * Creates the arrows, showing none until a world and its winds are set.
 *
 * @param relief - The globe's uniforms that shape the drawn surface, shared
 * as {@link createWindArrowMaterial} takes them.
 * @returns The arrows, their mesh hidden.
 */
export const createWindArrows = (relief: ReliefUniforms): WindArrows => {
	const { material, uniforms } = createWindArrowMaterial(relief);
	const capacity = Math.max(
		...ARROW_SPACINGS_DEG.map((spacing) => latticeSize(spacing)),
	);
	const buffers: ArrowBuffers = {
		anchor: new Float32Array(3 * capacity),
		wind: new Float32Array(3 * capacity),
		shape: new Float32Array(2 * capacity),
	};
	const means = new Float64Array(3 * capacity);
	const geometry = new InstancedBufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(QUAD_CORNERS, 3));
	geometry.setIndex(new BufferAttribute(QUAD_TRIANGLES, 1));
	const attributes = {
		anchor: new InstancedBufferAttribute(buffers.anchor, 3),
		wind: new InstancedBufferAttribute(buffers.wind, 3),
		shape: new InstancedBufferAttribute(buffers.shape, 2),
	};
	for (const attribute of Object.values(attributes)) {
		attribute.setUsage(DynamicDrawUsage);
	}
	geometry.setAttribute('aAnchor', attributes.anchor);
	geometry.setAttribute('aWind', attributes.wind);
	geometry.setAttribute('aShape', attributes.shape);
	geometry.instanceCount = 0;

	const mesh = new Mesh(geometry, material);
	mesh.matrixAutoUpdate = false;
	// Placed in the vertex shader, so its bounds say nothing. Drawn after
	// the globe and the sun.
	mesh.frustumCulled = false;
	mesh.renderOrder = 2;
	mesh.visible = false;

	let resolution: number | null = null;
	let field: WindField | null = null;
	let spacing: number = ARROW_SPACINGS_DEG[0];

	/** Works out the arrows for the field and spacing, and hands them over. */
	const build = (): void => {
		if (field === null || resolution === null) {
			geometry.instanceCount = 0;
			mesh.visible = false;
			return;
		}
		const grid = getGrid(resolution);
		const patches = patchesFor(resolution, spacing);
		patchWinds(grid, patches, field, means);
		const drawn = writeArrows(patches, means, buffers);
		for (const [name, attribute] of Object.entries(attributes)) {
			attribute.clearUpdateRanges();
			attribute.addUpdateRange(0, drawn * (name === 'shape' ? 2 : 3));
			attribute.needsUpdate = true;
		}
		geometry.instanceCount = drawn;
		mesh.visible = drawn > 0;
	};

	return {
		mesh,
		setWorld: (next) => {
			resolution = next;
			field = null;
			build();
		},
		setWinds: (next) => {
			if (next !== null) {
				if (resolution === null) {
					throw new RangeError('Winds need a world to be shown first');
				}
				const { cellCount } = getGrid(resolution);
				if (next.east.length !== cellCount || next.north.length !== cellCount) {
					throw new RangeError(
						`Winds for a world of ${cellCount} cells need ${cellCount} values of each part; got ${next.east.length} and ${next.north.length}`,
					);
				}
			}
			field = next;
			build();
		},
		setZoom: (pixels) => {
			const next = arrowSpacingFor(pixels);
			if (next !== spacing) {
				spacing = next;
				if (field !== null) {
					build();
				}
			}
		},
		setViewport: (widthPx, heightPx) => {
			uniforms.uViewport.value.set(widthPx, heightPx);
		},
		dispose: () => {
			geometry.dispose();
			material.dispose();
		},
	};
};
