/**
 * The winds on the globe as streaks: many short trails, each carried along
 * by the wind where it is, faster and so longer where the wind is stronger,
 * fading towards its tail, as on weather maps.
 *
 * The trails live on the unit sphere and move on the CPU, a step for each
 * frame, by the time since the frame before; nothing here reads a clock.
 * New trails start at places spread evenly over the part of the globe in
 * view, drawn from a seeded pseudo-random source, so the same seed, winds,
 * camera and time steps always give the same trails. Every number a trail
 * holds is in typed arrays made once, for {@link STREAK_CAP} trails, laid
 * out as the GPU reads them, so a step makes nothing new.
 *
 * {@link createWindStreaks} only hands the trails to the GPU: one geometry
 * drawn twice, a light line under a dark one, as thin ribbons facing the
 * screen at a constant width. Like the arrows, they are raised onto the
 * drawn relief by the globe's own rule ({@link RELIEF_GLSL}) and faded out
 * as the surface under them turns away from the camera, which hides the far
 * side; they are not hidden by the relief.
 */

import {
	BufferAttribute,
	DynamicDrawUsage,
	GLSL3,
	InstancedBufferGeometry,
	InstancedInterleavedBuffer,
	InterleavedBufferAttribute,
	type IUniform,
	Mesh,
	RawShaderMaterial,
	Vector2,
} from 'three';
import {
	type CellFrames,
	cellAt,
	cellFrames,
	type Grid,
	getGrid,
	type Vec3,
} from '../../core/index';
import { verticalFovDeg } from './camera';
import {
	glslColour,
	glslFloat,
	RELIEF_GLSL,
	type ReliefUniforms,
} from './material';
import {
	ARROW_CAP_SPEED,
	ARROW_CLEARANCE,
	ARROW_EDGE_COLOUR,
	ARROW_EDGE_PX,
	ARROW_FILL_COLOUR,
	CALM_SPEED,
	pixelsPerRadian,
	type WindField,
} from './wind';

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * The wind speed the streaks' lengths and numbers are set for, in metres a
 * second: the speed at which an arrow is drawn at its longest.
 */
export const STREAK_REFERENCE_SPEED = ARROW_CAP_SPEED;

/**
 * How fast a trail's head moves for each metre a second of wind, in
 * radians of arc a second: 5° a second at {@link STREAK_REFERENCE_SPEED},
 * so a 10 m/s wind carries it about 15° in three seconds, and a wind half
 * as strong half as far.
 */
export const STREAK_SPEED_SCALE =
	(5 * RADIANS_PER_DEGREE) / STREAK_REFERENCE_SPEED;

/** The points along each trail, its head first. */
export const STREAK_POINTS = 12;

/**
 * The time between one point of a trail and the next behind it, in
 * seconds. A trail runs back over where its head has been for
 * `STREAK_POINTS - 1` of these, 0.66 s, so a trail in a 10 m/s wind is
 * about 3.3° long, and one in a wind half as strong half as long.
 */
export const STREAK_POINT_INTERVAL_S = 0.06;

/**
 * The length of a trail in a wind of {@link STREAK_REFERENCE_SPEED}, in
 * radians of arc, once it has grown to its full length.
 */
export const STREAK_REFERENCE_LENGTH =
	STREAK_SPEED_SCALE *
	STREAK_REFERENCE_SPEED *
	(STREAK_POINTS - 1) *
	STREAK_POINT_INTERVAL_S;

/** How long a trail lives, on average, before it starts afresh elsewhere. */
export const STREAK_LIFE_S = 4;

/**
 * How far one trail's life is from {@link STREAK_LIFE_S}, as a share of it,
 * at most: each lives a time drawn evenly from (1 − this) to (1 + this)
 * times it, so that trails do not all start afresh at once.
 */
export const STREAK_LIFE_SPREAD = 0.25;

/** How long a new trail takes to fade in from nothing, in seconds. */
export const STREAK_FADE_IN_S = 0.4;

/**
 * How long a trail takes to fade out to nothing at the end of its life, in
 * seconds, and once it has stalled in calm air.
 */
export const STREAK_FADE_OUT_S = 0.6;

/**
 * How long a trail stays in calm air, a wind under {@link CALM_SPEED},
 * before it starts to fade out, in seconds.
 */
export const STREAK_CALM_LIMIT_S = 0.5;

/**
 * The longest time step a trail is moved by, in seconds: a longer gap
 * between frames, as after a hidden tab or a slow frame, moves it by this,
 * so trails never jump.
 */
export const STREAK_MAX_STEP_S = 0.1;

/** The most trails there ever are. */
export const STREAK_CAP = 3000;

/**
 * How closely trails lie on the screen, in CSS pixels: there are as many
 * trails as fill the globe's area on the screen with lines of their length
 * at full growth in a {@link STREAK_REFERENCE_SPEED} wind, this far apart
 * on average, up to {@link STREAK_CAP}.
 */
export const STREAK_SPACING_PX = 12;

/** The width of a trail's dark line, in CSS pixels. */
export const STREAK_WIDTH_PX = 1.5;

/**
 * How far the light line under a trail shows each side of its dark line,
 * in CSS pixels: as wide as the arrows' light edge.
 */
export const STREAK_EDGE_PX = ARROW_EDGE_PX;

/** The width of a trail's light line, in CSS pixels. */
export const STREAK_EDGE_WIDTH_PX = STREAK_WIDTH_PX + 2 * STREAK_EDGE_PX;

/** The colour of a trail's dark line: the inside of an arrow. */
export const STREAK_COLOUR = ARROW_FILL_COLOUR;

/** The colour of the light line under it: the edge of an arrow. */
export const STREAK_EDGE_COLOUR = ARROW_EDGE_COLOUR;

/** The opacity of a trail's dark line at its head, at full life. */
export const STREAK_OPACITY = 0.9;

/** The opacity of the light line under it at its head, at full life. */
export const STREAK_EDGE_OPACITY = 0.6;

/** How far a trail is lifted above the drawn surface: as the arrows are. */
export const STREAK_CLEARANCE = ARROW_CLEARANCE;

/** What of the camera the trails follow. */
export type StreakView = {
	/**
	 * Where the camera is, in core coordinates, in planet radii from the
	 * centre; farther than 1.
	 */
	readonly eye: Vec3;
	/** The view's width, in CSS pixels. */
	readonly widthPx: number;
	/** The view's height, in CSS pixels. */
	readonly heightPx: number;
};

/**
 * A pseudo-random source: the same seed always gives the same numbers.
 *
 * @remarks
 * Mulberry32: 32 bits of state, quick, and plenty for spreading trails.
 *
 * @param seed - Any number; its low 32 bits are taken.
 * @returns A function giving the next number, from 0 up to but not
 * including 1, at each call.
 */
export const createRandom = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/** The half-angle of the view's height, in radians. */
const halfFov = (view: StreakView): number =>
	(verticalFovDeg(view.widthPx / view.heightPx) * RADIANS_PER_DEGREE) / 2;

/**
 * The part of the globe trails start in and live in: the cap around the
 * point nearest the camera that holds all of the globe the view shows, as
 * the cosine of its angular radius at the centre.
 *
 * @remarks
 * Zoomed out, it is all of the globe the camera sees, out to the limb.
 * Zoomed in, it is narrower: out to where the corners of the view meet the
 * globe, so trails are not spent off the screen. Either way it lies within
 * the half of the globe facing the camera.
 *
 * @param view - The camera.
 * @returns The cosine, from `1 / distance` up to 1.
 */
export const streakRegionCos = (view: StreakView): number => {
	const [x, y, z] = view.eye;
	const distance = Math.hypot(x, y, z);
	const limb = 1 / distance;
	if (!(view.widthPx > 0 && view.heightPx > 0)) {
		return limb;
	}
	// The angle from the view's axis to its corners, as the camera sees it.
	const corner = Math.atan(
		(Math.tan(halfFov(view)) * Math.hypot(view.widthPx, view.heightPx)) /
			view.heightPx,
	);
	const reach = distance * Math.sin(corner);
	if (reach >= 1) {
		return limb;
	}
	// The angle at the centre between the nearest point and where the line
	// of sight to a corner meets the sphere.
	return Math.max(limb, Math.cos(Math.asin(reach) - corner));
};

/**
 * The area of the part of a disc that lies in a rectangle, both centred on
 * the same point.
 *
 * @param radius - The disc's radius.
 * @param width - The rectangle's width.
 * @param height - The rectangle's height.
 */
export const discInRectArea = (
	radius: number,
	width: number,
	height: number,
): number => {
	if (!(radius > 0 && width > 0 && height > 0)) {
		return 0;
	}
	const halfWidth = width / 2;
	const halfHeight = height / 2;
	// A quarter of it: under the arc of the circle, or the rectangle's top
	// where that is lower, from x = 0 to the nearer of the two right edges.
	const end = Math.min(halfWidth, radius);
	const flatTo = Math.min(
		end,
		Math.sqrt(Math.max(0, radius * radius - halfHeight * halfHeight)),
	);
	const underArc = (at: number): number =>
		(at * Math.sqrt(radius * radius - at * at) +
			radius * radius * Math.asin(at / radius)) /
		2;
	return 4 * (halfHeight * flatTo + underArc(end) - underArc(flatTo));
};

/**
 * How many trails there are for a view: enough to fill the globe's area on
 * the screen with trails {@link STREAK_SPACING_PX} apart, each at its
 * length in a {@link STREAK_REFERENCE_SPEED} wind; no more than
 * {@link STREAK_CAP}.
 *
 * @remarks
 * A trail keeps its length on the globe, so it is longer on the screen the
 * closer the camera. Zooming in from far out, the globe grows on the
 * screen faster than the trails do and there are more of them, up to the
 * cap; once the globe fills the view, the trails grow longer while the
 * area stays, and there are fewer.
 *
 * @param view - The camera.
 * @returns A whole number from 0 to {@link STREAK_CAP}.
 */
export const streakCountFor = (view: StreakView): number => {
	const { widthPx, heightPx } = view;
	if (!(widthPx > 0 && heightPx > 0)) {
		return 0;
	}
	const [x, y, z] = view.eye;
	const distance = Math.hypot(x, y, z);
	const regionCos = streakRegionCos(view);
	// The angle from the view's axis to the region's edge, as the camera
	// sees it, and so the region's radius on the screen.
	const edge = Math.atan2(
		Math.sqrt(Math.max(0, 1 - regionCos * regionCos)),
		distance - regionCos,
	);
	const radiusPx = ((heightPx / 2) * Math.tan(edge)) / Math.tan(halfFov(view));
	const area = discInRectArea(radiusPx, widthPx, heightPx);
	const lengthPx =
		STREAK_REFERENCE_LENGTH *
		pixelsPerRadian(distance, heightPx, widthPx / heightPx);
	return Math.min(
		STREAK_CAP,
		Math.round(area / (STREAK_SPACING_PX * lengthPx)),
	);
};

/**
 * How opaque a trail is at one of its points, before the light and dark
 * lines' own opacities and the fade towards the globe's edge: from 1 at
 * the head to 0 at the tail, in even steps, times its fade in over
 * {@link STREAK_FADE_IN_S} at the start of its life and out over
 * {@link STREAK_FADE_OUT_S} at the end.
 *
 * @param age - How long the trail has lived, in seconds.
 * @param life - How long it is to live, in seconds.
 * @param index - The point, from 0 at the head to `STREAK_POINTS - 1` at
 * the tail.
 * @returns From 0 to 1.
 */
export const streakOpacity = (
	age: number,
	life: number,
	index: number,
): number => livingOpacity(age, life) * (ALONG_OPACITY[index] as number);

/** How opaque a trail is for its age, from 0 to 1. */
const livingOpacity = (age: number, life: number): number =>
	Math.max(
		0,
		Math.min(1, age / STREAK_FADE_IN_S, (life - age) / STREAK_FADE_OUT_S),
	);

/** How opaque a trail is at each of its points for its place along it. */
const ALONG_OPACITY = Float32Array.from(
	{ length: STREAK_POINTS },
	(_, index) => 1 - index / (STREAK_POINTS - 1),
);

/** A direction handed to {@link cellAt}, filled afresh for each lookup. */
const PROBE: [number, number, number] = [0, 0, 1];

/**
 * Moves a point of the sphere along the wind where it is, for a time.
 *
 * @remarks
 * The wind is that of the cell the point is in, made a vector from its
 * eastward and northward parts and the directions east and north at the
 * cell's centre, as the arrows' winds are; what of it stands off the
 * sphere at the point is dropped. The point moves along the great circle
 * that vector points along, by {@link STREAK_SPEED_SCALE} times its length
 * times the time. Taking the cell's vector rather than its parts against
 * east and north at the point itself keeps a point at or by a pole right,
 * where east and north turn right round over a short way. A wind that is
 * not a number does not move the point.
 *
 * @param grid - The world's grid.
 * @param field - The wind at each cell, one value of each part per cell.
 * @param point - Where the point is: a unit vector, x, y and z from `at`;
 * written over with where it moves to.
 * @param at - Where in `point` the point starts.
 * @param seconds - How long it moves for; 0 or more.
 * @param frames - The directions east and north at the grid's cells, as
 * {@link cellFrames} gives them; fetched for the grid when left out.
 * @returns The wind's speed in its cell, in metres a second, or 0 for a
 * wind that is not a number.
 */
export const moveAlongWind = (
	grid: Grid,
	field: WindField,
	point: Float64Array,
	at: number,
	seconds: number,
	frames: CellFrames = cellFrames(grid),
): number => {
	const x = point[at] as number;
	const y = point[at + 1] as number;
	const z = point[at + 2] as number;
	PROBE[0] = x;
	PROBE[1] = y;
	PROBE[2] = z;
	const cell = cellAt(grid, PROBE);
	const u = field.east[cell] as number;
	const v = field.north[cell] as number;
	if (!(Number.isFinite(u) && Number.isFinite(v))) {
		return 0;
	}
	const { east, north } = frames;
	const wx = u * (east.x[cell] as number) + v * (north.x[cell] as number);
	const wy = u * (east.y[cell] as number) + v * (north.y[cell] as number);
	const wz = v * (north.z[cell] as number);
	const up = wx * x + wy * y + wz * z;
	const tx = wx - up * x;
	const ty = wy - up * y;
	const tz = wz - up * z;
	const along = Math.sqrt(tx * tx + ty * ty + tz * tz);
	if (along > 0 && seconds > 0) {
		const angle = along * STREAK_SPEED_SCALE * seconds;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle) / along;
		const nx = x * cos + tx * sin;
		const ny = y * cos + ty * sin;
		const nz = z * cos + tz * sin;
		const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
		point[at] = nx / length;
		point[at + 1] = ny / length;
		point[at + 2] = nz / length;
	}
	return Math.sqrt(u * u + v * v);
};

/** The trails, as they move. */
export type Streaks = {
	/** How many trails there can be: the length the arrays are made for. */
	readonly capacity: number;
	/**
	 * Each trail's points, head first: {@link STREAK_POINTS} unit vectors in
	 * core coordinates, three numbers each, for each trail in turn. Those of
	 * a trail that is not alive are left as they were.
	 */
	readonly points: Float32Array;
	/**
	 * How opaque each trail is at each of its points, as
	 * {@link streakOpacity} gives it, in the order of {@link Streaks.points};
	 * 0 throughout for a trail that is not alive.
	 */
	readonly opacity: Float32Array;
	/** How long each trail has lived, in seconds. */
	readonly ages: Float32Array;
	/** How long each trail is to live, in seconds. */
	readonly lives: Float32Array;
	/** Whether each trail is alive: 1 if it is, 0 if not. */
	readonly alive: Uint8Array;
	/**
	 * How many trails, from the first, the arrays hold anything for: every
	 * trail alive comes before it.
	 */
	readonly slots: number;
	/**
	 * Takes the grid of a world. A grid of another resolution starts the
	 * trails afresh; either way the winds are dropped, until the world's are
	 * set, and the trails start afresh then.
	 *
	 * @param resolution - Cells along a face edge of the world's grid.
	 */
	setWorld(resolution: number): void;
	/**
	 * Takes the winds the trails move in, or none. The trails carry on from
	 * where they are in new winds that take the place of others; winds given
	 * after none start them afresh, so none is left where it stopped.
	 *
	 * @param field - One value of each part per cell of the world's grid;
	 * kept, not copied. Null stops the trails where they are.
	 * @throws RangeError if the field does not hold one value of each part
	 * per cell, or no world has been set; the winds are then left as they
	 * were.
	 */
	setWinds(field: WindField | null): void;
	/**
	 * Moves the trails on.
	 *
	 * @remarks
	 * Each trail alive ages by the time, its head moves along the wind as
	 * {@link moveAlongWind} moves it, and every {@link STREAK_POINT_INTERVAL_S}
	 * the points behind it move back one, the first taking where the head
	 * was. A trail starts afresh, at a new place in the region
	 * {@link streakRegionCos} gives and with its points all there, when it
	 * has lived its life or its head has left that region. One that has
	 * stalled in calm air for longer than {@link STREAK_CALM_LIMIT_S} fades
	 * out, as at the end of its life. There are as many trails as
	 * {@link streakCountFor} says: new ones start, at an age drawn evenly
	 * over their life, so they do not all end together; ones beyond it fade
	 * out and are not started again. With no world or no winds, nothing
	 * changes.
	 *
	 * @param seconds - The time since the step before, in seconds; brought
	 * to 0 if it is not a positive number, and to no more than
	 * {@link STREAK_MAX_STEP_S}.
	 * @param view - The camera; read during the call and not kept, so the
	 * caller may fill the same object in again for the next step.
	 */
	step(seconds: number, view: StreakView): void;
};

/** What the trails are made with. */
export type StreaksOptions = {
	/** The seed of the trails' pseudo-random source; 1 when left out. */
	readonly seed?: number;
	/** How many trails there can be; {@link STREAK_CAP} when left out. */
	readonly capacity?: number;
};

/**
 * Makes the trails, with none alive until a world and its winds are set and
 * they are stepped.
 *
 * @param options - The seed and the capacity.
 * @returns The trails.
 */
export const createStreaks = (options: StreaksOptions = {}): Streaks => {
	const capacity = options.capacity ?? STREAK_CAP;
	const random = createRandom(options.seed ?? 1);
	const points = new Float32Array(capacity * STREAK_POINTS * 3);
	const opacity = new Float32Array(capacity * STREAK_POINTS);
	const ages = new Float32Array(capacity);
	const lives = new Float32Array(capacity);
	const alive = new Uint8Array(capacity);
	/** How long each trail has been in calm air, in seconds. */
	const calm = new Float32Array(capacity);
	/** Each trail's head, in full precision, x, y and z in turn. */
	const heads = new Float64Array(capacity * 3);
	let grid: Grid | null = null;
	/** The directions east and north at the cells of the grid. */
	let frames: CellFrames | null = null;
	let field: WindField | null = null;
	let slots = 0;
	/** The time since the points behind the heads last moved back. */
	let sinceShift = 0;
	// The camera of the step under way: its direction from the centre and
	// two directions across it, and the region's cosine.
	let eyeX = 0;
	let eyeY = 0;
	let eyeZ = 1;
	let acrossX = 1;
	let acrossY = 0;
	let acrossZ = 0;
	let crossX = 0;
	let crossY = 1;
	let crossZ = 0;
	let regionCos = 0;

	/** Stops every trail, as when there are none. */
	const clear = (): void => {
		alive.fill(0);
		opacity.fill(0);
		slots = 0;
		sinceShift = 0;
	};

	/**
	 * Starts a trail afresh at a place drawn evenly by area from the region,
	 * all its points there.
	 *
	 * @param trail - Which trail.
	 * @param anyAge - Whether it starts at an age drawn over its life, rather
	 * than new.
	 */
	const start = (trail: number, anyAge: boolean): void => {
		const cosAngle = 1 - random() * (1 - regionCos);
		const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle));
		const turn = 2 * Math.PI * random();
		const a = Math.cos(turn) * sinAngle;
		const b = Math.sin(turn) * sinAngle;
		let x = eyeX * cosAngle + acrossX * a + crossX * b;
		let y = eyeY * cosAngle + acrossY * a + crossY * b;
		let z = eyeZ * cosAngle + acrossZ * a + crossZ * b;
		const length = Math.sqrt(x * x + y * y + z * z);
		x /= length;
		y /= length;
		z /= length;
		heads[3 * trail] = x;
		heads[3 * trail + 1] = y;
		heads[3 * trail + 2] = z;
		const from = trail * STREAK_POINTS * 3;
		for (let at = from; at < from + STREAK_POINTS * 3; at += 3) {
			points[at] = x;
			points[at + 1] = y;
			points[at + 2] = z;
		}
		lives[trail] =
			STREAK_LIFE_S *
			(1 - STREAK_LIFE_SPREAD + 2 * STREAK_LIFE_SPREAD * random());
		ages[trail] = anyAge ? random() * (lives[trail] as number) : 0;
		calm[trail] = 0;
		alive[trail] = 1;
	};

	/** Writes a trail's opacity at each of its points. */
	const writeOpacity = (trail: number): void => {
		const living = livingOpacity(ages[trail] as number, lives[trail] as number);
		const from = trail * STREAK_POINTS;
		for (let index = 0; index < STREAK_POINTS; index++) {
			opacity[from + index] = living * (ALONG_OPACITY[index] as number);
		}
	};

	/** Takes the camera of a step. */
	const aim = (view: StreakView): void => {
		const [x, y, z] = view.eye;
		const distance = Math.hypot(x, y, z);
		eyeX = x / distance;
		eyeY = y / distance;
		eyeZ = z / distance;
		// Any direction across the eye's will do: crossed with whichever axis
		// stands farther from it.
		const helperZ = Math.abs(eyeZ) < 0.9 ? 1 : 0;
		const helperX = 1 - helperZ;
		acrossX = eyeY * helperZ;
		acrossY = eyeZ * helperX - eyeX * helperZ;
		acrossZ = -eyeY * helperX;
		const across = Math.hypot(acrossX, acrossY, acrossZ);
		acrossX /= across;
		acrossY /= across;
		acrossZ /= across;
		crossX = eyeY * acrossZ - eyeZ * acrossY;
		crossY = eyeZ * acrossX - eyeX * acrossZ;
		crossZ = eyeX * acrossY - eyeY * acrossX;
		regionCos = streakRegionCos(view);
	};

	return {
		capacity,
		points,
		opacity,
		ages,
		lives,
		alive,
		get slots() {
			return slots;
		},
		setWorld: (resolution) => {
			const next = getGrid(resolution);
			if (next !== grid) {
				grid = next;
				frames = cellFrames(next);
				clear();
			}
			field = null;
		},
		setWinds: (next) => {
			if (next !== null) {
				if (grid === null) {
					throw new RangeError('Winds need a world to be shown first');
				}
				const { cellCount } = grid;
				if (next.east.length !== cellCount || next.north.length !== cellCount) {
					throw new RangeError(
						`Winds for a world of ${cellCount} cells need ${cellCount} values of each part; got ${next.east.length} and ${next.north.length}`,
					);
				}
				if (field === null) {
					clear();
				}
			}
			field = next;
		},
		step: (seconds, view) => {
			if (grid === null || frames === null || field === null) {
				return;
			}
			const dt = seconds > 0 ? Math.min(seconds, STREAK_MAX_STEP_S) : 0;
			aim(view);
			const wanted = Math.min(capacity, streakCountFor(view));
			sinceShift += dt;
			const shift = sinceShift >= STREAK_POINT_INTERVAL_S;
			if (shift) {
				sinceShift = Math.min(
					sinceShift - STREAK_POINT_INTERVAL_S,
					STREAK_POINT_INTERVAL_S,
				);
			}
			const through = Math.max(slots, wanted);
			let last = -1;
			for (let trail = 0; trail < through; trail++) {
				if (alive[trail] === 0) {
					if (trail >= wanted) {
						continue;
					}
					start(trail, true);
				} else {
					const from = trail * STREAK_POINTS * 3;
					if (shift) {
						points.copyWithin(from + 3, from, from + (STREAK_POINTS - 1) * 3);
					}
					const speed = moveAlongWind(
						grid,
						field,
						heads,
						3 * trail,
						dt,
						frames,
					);
					const x = heads[3 * trail] as number;
					const y = heads[3 * trail + 1] as number;
					const z = heads[3 * trail + 2] as number;
					points[from] = x;
					points[from + 1] = y;
					points[from + 2] = z;
					const age = (ages[trail] as number) + dt;
					ages[trail] = age;
					calm[trail] = speed < CALM_SPEED ? (calm[trail] as number) + dt : 0;
					if (
						(calm[trail] as number) > STREAK_CALM_LIMIT_S ||
						trail >= wanted
					) {
						lives[trail] = Math.min(
							lives[trail] as number,
							age + STREAK_FADE_OUT_S,
						);
					}
					const inRegion = x * eyeX + y * eyeY + z * eyeZ >= regionCos;
					if (age >= (lives[trail] as number) || !inRegion) {
						if (trail >= wanted) {
							alive[trail] = 0;
							opacity.fill(
								0,
								trail * STREAK_POINTS,
								(trail + 1) * STREAK_POINTS,
							);
							continue;
						}
						start(trail, false);
					}
				}
				writeOpacity(trail);
				last = trail;
			}
			slots = last + 1;
		},
	};
};

/**
 * Places a corner of one segment of a trail, between two of its points:
 * the corner's end raised onto the drawn relief by the globe's rule and
 * lifted by {@link STREAK_CLEARANCE}, and moved across the segment's
 * direction on the screen by half the line's width, so the line is as wide
 * on the screen wherever it is. It fades out as the surface under it turns
 * away from the camera, as the arrows do, which hides the far side.
 *
 * `position` is a corner of the segment's quad: x 0 at its start and 1 at
 * its end, y −1 and 1 at the sides. Each trail's points follow one
 * another, so the segment after a trail's last point, which would join it
 * to the next trail, is not drawn, nor is one with nothing to show.
 */
const streakVertexGlsl = (halfWidth: number): string => /* glsl */ `
${RELIEF_GLSL}
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform vec2 uViewport;

in vec3 position;
in vec3 aStart;
in vec3 aEnd;
in float aOpacityStart;
in float aOpacityEnd;

out float vAcross;
out float vOpacity;

const int POINTS = ${STREAK_POINTS};
const float CLEARANCE = ${glslFloat(STREAK_CLEARANCE)};
const float HALF_WIDTH = ${glslFloat(halfWidth)};
// How far past the line's edge the quad reaches, in CSS pixels, for the
// edge to be softened over.
const float MARGIN = 1.0;
// As for the arrows: how squarely the surface faces the camera, over which
// trails fade in.
const float FADE_FROM = 0.12;
const float FADE_TO = 0.35;

void hide() {
	// Outside the clip volume, so nothing is drawn.
	gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
	vAcross = 0.0;
	vOpacity = 0.0;
}

void main() {
	if (gl_InstanceID % POINTS == POINTS - 1 || max(aOpacityStart, aOpacityEnd) <= 0.0) {
		hide();
		return;
	}
	vec3 here = normalize(position.x < 0.5 ? aStart : aEnd);
	vec3 surface = raisedSurface(here) + CLEARANCE * here;
	vec4 view = modelViewMatrix * vec4(surface, 1.0);
	vec4 clip = projectionMatrix * view;
	vec4 ahead = projectionMatrix * (modelViewMatrix * vec4(surface + (aEnd - aStart), 1.0));
	vec2 moved = (ahead.xy / ahead.w - clip.xy / clip.w) * 0.5 * uViewport;
	float movedLength = length(moved);
	if (movedLength <= 0.0) {
		hide();
		return;
	}
	vec2 across = vec2(-moved.y, moved.x) / movedLength;
	vAcross = position.y * (HALF_WIDTH + MARGIN);
	gl_Position = clip + vec4(across * vAcross * 2.0 / uViewport * clip.w, 0.0, 0.0);
	float facing = dot(normalize(normalMatrix * here), normalize(-view.xyz));
	vOpacity = mix(aOpacityStart, aOpacityEnd, position.x) * smoothstep(FADE_FROM, FADE_TO, facing);
}
`;

/**
 * Colours a trail's line by its distance from the line's middle, in CSS
 * pixels, softened over about a pixel at its edge.
 */
const streakFragmentGlsl = (
	halfWidth: number,
	colour: number,
	opacity: number,
): string => /* glsl */ `
precision highp float;

in float vAcross;
in float vOpacity;

out vec4 fragColour;

const float HALF_WIDTH = ${glslFloat(halfWidth)};
const vec3 COLOUR = ${glslColour(colour)};
const float OPACITY = ${glslFloat(opacity)};

void main() {
	float cover = 1.0 - smoothstep(HALF_WIDTH - 0.5, HALF_WIDTH + 0.5, abs(vAcross));
	float alpha = cover * vOpacity * OPACITY;
	if (alpha <= 0.0) {
		discard;
	}
	fragColour = vec4(COLOUR, alpha);
}
`;

/** The values the streaks' shaders read besides the globe's relief. */
export type WindStreakUniforms = ReliefUniforms & {
	/** The view's width and height, in CSS pixels. */
	readonly uViewport: IUniform<Vector2>;
};

/** The streaks on the globe. */
export type WindStreaks = {
	/**
	 * The meshes, for the scene, in the order they are drawn: the light
	 * lines, then the dark lines over them. Their model matrices are to be
	 * the globe's.
	 */
	readonly meshes: readonly [Mesh, Mesh];
	/**
	 * Takes the grid of a new world, as {@link Streaks.setWorld} does, and
	 * draws nothing until the world's winds are set and the trails are moved
	 * on.
	 */
	setWorld(resolution: number): void;
	/**
	 * Takes the winds, as {@link Streaks.setWinds} does. For none, it draws
	 * nothing from then on, until winds are set and the trails moved on.
	 */
	setWinds(field: WindField | null): void;
	/** Takes the view's size in CSS pixels, which the lines are sized in. */
	setViewport(widthPx: number, heightPx: number): void;
	/**
	 * Moves the trails on, as {@link Streaks.step} does, and hands them to
	 * the GPU; with no winds, it draws nothing.
	 */
	update(seconds: number, view: StreakView): void;
	/** Frees what the streaks hold on the GPU. */
	dispose(): void;
};

/** The corners of the quad each segment is drawn in, as two triangles. */
const QUAD_CORNERS = Float32Array.of(0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0);
const QUAD_TRIANGLES = Uint16Array.of(0, 1, 2, 0, 2, 3);

/**
 * Creates the streaks, showing none until a world and its winds are set and
 * they are moved on.
 *
 * @remarks
 * One geometry holds every segment of every trail, one instance a segment,
 * reading its two ends from the trails' own arrays: the start at a point
 * and the end at the next. Each step marks only the trails in use for
 * upload. It is drawn twice, blended over the globe, neither testing depth
 * nor writing it: first {@link STREAK_EDGE_WIDTH_PX} wide in
 * {@link STREAK_EDGE_COLOUR}, then {@link STREAK_WIDTH_PX} wide in
 * {@link STREAK_COLOUR} over it.
 *
 * @param relief - The globe's uniforms that shape the drawn surface: the
 * very objects, not copies, so the streaks follow every change of them.
 * @param options - The trails' seed and capacity.
 * @returns The streaks, their meshes hidden.
 */
export const createWindStreaks = (
	relief: ReliefUniforms,
	options: StreaksOptions = {},
): WindStreaks => {
	const streaks = createStreaks(options);
	const uniforms: WindStreakUniforms = {
		uElevation: relief.uElevation,
		uResolution: relief.uResolution,
		uSeaLevel: relief.uSeaLevel,
		uExaggeration: relief.uExaggeration,
		uViewport: { value: new Vector2(1, 1) },
	};

	const geometry = new InstancedBufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(QUAD_CORNERS, 3));
	geometry.setIndex(new BufferAttribute(QUAD_TRIANGLES, 1));
	const pointBuffer = new InstancedInterleavedBuffer(streaks.points, 3, 1);
	const opacityBuffer = new InstancedInterleavedBuffer(streaks.opacity, 1, 1);
	pointBuffer.setUsage(DynamicDrawUsage);
	opacityBuffer.setUsage(DynamicDrawUsage);
	// Each segment starts at a point and ends at the next: the same array,
	// read one point on.
	geometry.setAttribute(
		'aStart',
		new InterleavedBufferAttribute(pointBuffer, 3, 0),
	);
	geometry.setAttribute(
		'aEnd',
		new InterleavedBufferAttribute(pointBuffer, 3, 3),
	);
	geometry.setAttribute(
		'aOpacityStart',
		new InterleavedBufferAttribute(opacityBuffer, 1, 0),
	);
	geometry.setAttribute(
		'aOpacityEnd',
		new InterleavedBufferAttribute(opacityBuffer, 1, 1),
	);
	geometry.instanceCount = 0;

	const lineMaterial = (
		name: string,
		width: number,
		colour: number,
		opacity: number,
	): RawShaderMaterial =>
		new RawShaderMaterial({
			name,
			glslVersion: GLSL3,
			uniforms,
			vertexShader: streakVertexGlsl(width / 2),
			fragmentShader: streakFragmentGlsl(width / 2, colour, opacity),
			transparent: true,
			depthTest: false,
			depthWrite: false,
		});
	const materials = [
		lineMaterial(
			'wind streak edges',
			STREAK_EDGE_WIDTH_PX,
			STREAK_EDGE_COLOUR,
			STREAK_EDGE_OPACITY,
		),
		lineMaterial(
			'wind streaks',
			STREAK_WIDTH_PX,
			STREAK_COLOUR,
			STREAK_OPACITY,
		),
	] as const;
	const meshes = [
		new Mesh(geometry, materials[0]),
		new Mesh(geometry, materials[1]),
	] as const;
	meshes.forEach((mesh, index) => {
		mesh.matrixAutoUpdate = false;
		// Placed in the vertex shader, so their bounds say nothing. Drawn
		// after the globe and the sun, the dark lines last.
		mesh.frustumCulled = false;
		mesh.renderOrder = 2 + index;
		mesh.visible = false;
	});

	/** Whether there are winds to draw the trails from. */
	let hasWinds = false;

	/** Draws nothing, leaving the trails' arrays as they are. */
	const hide = (): void => {
		geometry.instanceCount = 0;
		for (const mesh of meshes) {
			mesh.visible = false;
		}
	};

	/** Hands what the trails hold now to the GPU. */
	const upload = (): void => {
		const { slots } = streaks;
		pointBuffer.clearUpdateRanges();
		pointBuffer.addUpdateRange(0, slots * STREAK_POINTS * 3);
		pointBuffer.needsUpdate = true;
		opacityBuffer.clearUpdateRanges();
		opacityBuffer.addUpdateRange(0, slots * STREAK_POINTS);
		opacityBuffer.needsUpdate = true;
		geometry.instanceCount = Math.max(0, slots * STREAK_POINTS - 1);
		for (const mesh of meshes) {
			mesh.visible = slots > 0;
		}
	};

	return {
		meshes,
		setWorld: (resolution) => {
			streaks.setWorld(resolution);
			hasWinds = false;
			hide();
		},
		setWinds: (field) => {
			streaks.setWinds(field);
			hasWinds = field !== null;
			if (!hasWinds) {
				hide();
			}
		},
		setViewport: (widthPx, heightPx) => {
			uniforms.uViewport.value.set(widthPx, heightPx);
		},
		update: (seconds, view) => {
			streaks.step(seconds, view);
			if (hasWinds) {
				upload();
			} else {
				hide();
			}
		},
		dispose: () => {
			geometry.dispose();
			for (const material of materials) {
				material.dispose();
			}
		},
	};
};
