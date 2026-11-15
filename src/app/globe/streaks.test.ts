import { describe, expect, it } from 'vitest';
import {
	cellAt,
	cellFrames,
	type Grid,
	getGrid,
	latLonToDirection,
	type Vec3,
} from '../../core/index';
import {
	cameraPosition,
	DEFAULT_CAMERA_DISTANCE,
	MAX_CAMERA_DISTANCE,
	MIN_CAMERA_DISTANCE,
	viewRay,
} from './camera';
import { createGlobeMaterial } from './material';
import { raySphere } from './picking';
import {
	createRandom,
	createStreaks,
	createWindStreaks,
	discInRectArea,
	moveAlongWind,
	STREAK_CALM_LIMIT_S,
	STREAK_CAP,
	STREAK_COLOUR,
	STREAK_EDGE_COLOUR,
	STREAK_EDGE_WIDTH_PX,
	STREAK_FADE_IN_S,
	STREAK_FADE_OUT_S,
	STREAK_LIFE_S,
	STREAK_LIFE_SPREAD,
	STREAK_MAX_STEP_S,
	STREAK_POINT_INTERVAL_S,
	STREAK_POINTS,
	STREAK_REFERENCE_LENGTH,
	STREAK_SPEED_SCALE,
	STREAK_WIDTH_PX,
	type Streaks,
	type StreakView,
	streakCountFor,
	streakOpacity,
	streakRegionCos,
} from './streaks';
import {
	ARROW_EDGE_COLOUR,
	ARROW_FILL_COLOUR,
	CALM_SPEED,
	type WindField,
} from './wind';

const RADIANS_PER_DEGREE = Math.PI / 180;

/** The angle between two unit vectors held in arrays. */
const angleBetween = (
	a: ArrayLike<number>,
	aAt: number,
	b: ArrayLike<number>,
	bAt: number,
): number => {
	const ax = a[aAt] as number;
	const ay = a[aAt + 1] as number;
	const az = a[aAt + 2] as number;
	const bx = b[bAt] as number;
	const by = b[bAt + 1] as number;
	const bz = b[bAt + 2] as number;
	return Math.atan2(
		Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx),
		ax * bx + ay * by + az * bz,
	);
};

/** The dot product of two vectors held in arrays. */
const dot = (a: ArrayLike<number>, b: ArrayLike<number>): number =>
	(a[0] as number) * (b[0] as number) +
	(a[1] as number) * (b[1] as number) +
	(a[2] as number) * (b[2] as number);

/** A wind given by its eastward and northward parts at every cell. */
const uniformWind = (grid: Grid, east: number, north: number): WindField => ({
	east: new Float32Array(grid.cellCount).fill(east),
	north: new Float32Array(grid.cellCount).fill(north),
});

/** The wind that is one fixed vector everywhere, flattened onto the sphere. */
const fixedVectorWind = (grid: Grid, vector: Vec3): WindField => {
	const { east, north } = cellFrames(grid);
	const field = uniformWind(grid, 0, 0);
	const [x, y, z] = vector;
	for (let cell = 0; cell < grid.cellCount; cell++) {
		(field.east as Float32Array)[cell] =
			x * (east.x[cell] as number) + y * (east.y[cell] as number);
		(field.north as Float32Array)[cell] =
			x * (north.x[cell] as number) +
			y * (north.y[cell] as number) +
			z * (north.z[cell] as number);
	}
	return field;
};

/** A point of the sphere at a latitude and longitude, in a new array. */
const pointAt = (latitudeDeg: number, longitudeDeg: number): Float64Array =>
	Float64Array.from(latLonToDirection(latitudeDeg, longitudeDeg));

/** A view of a 1280 by 800 pixel canvas from the camera given. */
const viewFrom = (
	distance = DEFAULT_CAMERA_DISTANCE,
	latitudeDeg = 15,
	longitudeDeg = 0,
	widthPx = 1280,
	heightPx = 800,
): StreakView => ({
	eye: cameraPosition({
		latitude: latitudeDeg * RADIANS_PER_DEGREE,
		longitude: longitudeDeg * RADIANS_PER_DEGREE,
		distance,
	}),
	widthPx,
	heightPx,
});

/** The direction of a view's camera from the centre. */
const eyeOf = (view: StreakView): Float64Array => {
	const [x, y, z] = view.eye;
	const length = Math.hypot(x, y, z);
	return Float64Array.of(x / length, y / length, z / length);
};

/** Where a trail's head is, in a new array. */
const headOf = (streaks: Streaks, trail: number): Float64Array =>
	Float64Array.from(
		streaks.points.subarray(
			trail * STREAK_POINTS * 3,
			trail * STREAK_POINTS * 3 + 3,
		),
	);

/** Whether a trail's points all stand where its head is, as a new one's do. */
const isFresh = (streaks: Streaks, trail: number): boolean => {
	const from = trail * STREAK_POINTS * 3;
	for (let index = 1; index < STREAK_POINTS; index++) {
		for (let axis = 0; axis < 3; axis++) {
			if (
				streaks.points[from + 3 * index + axis] !== streaks.points[from + axis]
			) {
				return false;
			}
		}
	}
	return true;
};

/** The trails alive, by index. */
const aliveTrails = (streaks: Streaks): number[] =>
	Array.from({ length: streaks.slots }, (_, trail) => trail).filter(
		(trail) => streaks.alive[trail] === 1,
	);

/** The length of a trail along its points, in radians. */
const trailLength = (streaks: Streaks, trail: number): number => {
	let length = 0;
	const from = trail * STREAK_POINTS * 3;
	for (let index = 1; index < STREAK_POINTS; index++) {
		length += angleBetween(
			streaks.points,
			from + 3 * (index - 1),
			streaks.points,
			from + 3 * index,
		);
	}
	return length;
};

/** Trails on a 64 grid in a wind, from the seed given. */
const makeStreaks = (
	field: (grid: Grid) => WindField,
	options: { seed?: number; capacity?: number } = {},
) => {
	const grid = getGrid(64);
	const streaks = createStreaks(options);
	streaks.setWorld(64);
	streaks.setWinds(field(grid));
	return { grid, streaks };
};

/** Steps trails a number of times by the same time. */
const stepMany = (
	streaks: Streaks,
	count: number,
	seconds: number,
	view: StreakView = viewFrom(),
): void => {
	for (let step = 0; step < count; step++) {
		streaks.step(seconds, view);
	}
};

describe('the streaks’ numbers', () => {
	it('carry a 10 m/s wind about 15° of arc in three seconds', () => {
		expect((STREAK_SPEED_SCALE * 10 * 3) / RADIANS_PER_DEGREE).toBeCloseTo(
			15,
			9,
		);
	});

	it('make a trail in a 10 m/s wind a few degrees long', () => {
		const degrees = STREAK_REFERENCE_LENGTH / RADIANS_PER_DEGREE;
		expect(degrees).toBeGreaterThan(2);
		expect(degrees).toBeLessThan(5);
	});

	it('draw a dark line over a wider light one, in the arrows’ colours', () => {
		expect(STREAK_COLOUR).toBe(ARROW_FILL_COLOUR);
		expect(STREAK_EDGE_COLOUR).toBe(ARROW_EDGE_COLOUR);
		expect(STREAK_EDGE_WIDTH_PX).toBeGreaterThan(STREAK_WIDTH_PX);
	});
});

describe('createRandom', () => {
	it('gives the same numbers for the same seed, and others for another', () => {
		const take = (seed: number) => {
			const random = createRandom(seed);
			return Array.from({ length: 5 }, () => random());
		};
		expect(take(7)).toEqual(take(7));
		expect(take(7)).not.toEqual(take(8));
	});

	it('gives numbers from 0 up to 1, spread evenly', () => {
		const random = createRandom(1);
		const values = Array.from({ length: 10000 }, () => random());
		expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
		const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
		expect(mean).toBeCloseTo(0.5, 1);
	});
});

describe('moveAlongWind', () => {
	const grid = getGrid(64);

	it('moves a point east in an eastward wind and north in a northward one', () => {
		const east = pointAt(10, 20);
		moveAlongWind(grid, uniformWind(grid, 8, 0), east, 0, 1);
		const north = pointAt(10, 20);
		moveAlongWind(grid, uniformWind(grid, 0, 8), north, 0, 1);
		const longitude = (p: Float64Array) =>
			Math.atan2(p[1] as number, p[0] as number) / RADIANS_PER_DEGREE;
		const latitude = (p: Float64Array) =>
			Math.asin(p[2] as number) / RADIANS_PER_DEGREE;
		expect(longitude(east)).toBeGreaterThan(20);
		expect(latitude(east)).toBeCloseTo(10, 0);
		expect(latitude(north)).toBeGreaterThan(10);
		expect(longitude(north)).toBeCloseTo(20, 1);
	});

	it('moves it by the speed times the scale times the time, on the sphere', () => {
		const start = pointAt(0, 0);
		for (const [speed, seconds] of [
			[4, 0.5],
			[8, 0.5],
			[8, 0.25],
		] as const) {
			const point = Float64Array.from(start);
			expect(
				moveAlongWind(grid, uniformWind(grid, speed, 0), point, 0, seconds),
			).toBeCloseTo(speed, 5);
			expect(angleBetween(start, 0, point, 0)).toBeCloseTo(
				speed * STREAK_SPEED_SCALE * seconds,
				4,
			);
			expect(Math.hypot(...point)).toBeCloseTo(1, 12);
		}
	});

	it('moves it farther in a stronger wind', () => {
		const start = pointAt(30, 40);
		const moved = (speed: number) => {
			const point = Float64Array.from(start);
			moveAlongWind(grid, uniformWind(grid, speed, speed / 2), point, 0, 0.1);
			return angleBetween(start, 0, point, 0);
		};
		expect(moved(10)).toBeCloseTo(2 * moved(5), 6);
		expect(moved(5)).toBeGreaterThan(moved(1));
	});

	it('takes the wind of the cell the point is in', () => {
		const field = uniformWind(grid, 0, 0);
		const point = pointAt(45, 45);
		// Only the cell under the point has a wind.
		const probe: Vec3 = [
			point[0] as number,
			point[1] as number,
			point[2] as number,
		];
		(field.east as Float32Array)[cellAt(grid, probe)] = 6;
		expect(moveAlongWind(grid, field, point, 0, 0.01)).toBeCloseTo(6, 5);
		const elsewhere = pointAt(-45, -135);
		expect(moveAlongWind(grid, field, elsewhere, 0, 0.01)).toBe(0);
	});

	it('leaves the point where it is in calm air, for no time, and for a wind that is not a number', () => {
		for (const [field, seconds] of [
			[uniformWind(grid, 0, 0), 1],
			[uniformWind(grid, 5, 5), 0],
			[uniformWind(grid, Number.NaN, 2), 1],
		] as const) {
			const point = pointAt(12, 34);
			const before = Float64Array.from(point);
			moveAlongWind(grid, field, point, 0, seconds);
			expect(point).toEqual(before);
		}
		expect(
			moveAlongWind(
				grid,
				uniformWind(grid, Number.NaN, 2),
				pointAt(0, 0),
				0,
				1,
			),
		).toBe(0);
	});

	it('moves a point at its place in a longer array', () => {
		const points = new Float64Array(9);
		points.set(pointAt(0, 0), 3);
		moveAlongWind(grid, uniformWind(grid, 10, 0), points, 3, 1);
		expect([...points.subarray(0, 3), ...points.subarray(6)]).toEqual([
			0, 0, 0, 0, 0, 0,
		]);
		expect(points[4] as number).toBeGreaterThan(0);
	});

	it('carries a point over a pole steadily, on the sphere, never faster than the wind', () => {
		// A wind of 10 m/s blowing one way across the north pole.
		const field = fixedVectorWind(grid, [10, 0, 0]);
		const point = pointAt(89, 180);
		const step = 0.05;
		let travelled = 0;
		for (let move = 0; move < 120; move++) {
			const before = Float64Array.from(point);
			const speed = moveAlongWind(grid, field, point, 0, step);
			expect(point.every(Number.isFinite)).toBe(true);
			expect(Math.hypot(...point)).toBeCloseTo(1, 12);
			expect(speed).toBeLessThanOrEqual(10 + 1e-5);
			const most = speed * STREAK_SPEED_SCALE * step;
			const moved = angleBetween(before, 0, point, 0);
			expect(moved).toBeLessThanOrEqual(most * (1 + 1e-6));
			// Not stalled or turned about by the pole: on at nearly the speed
			// of its cell's wind, which is all but the 10 m/s by the pole.
			expect(moved).toBeGreaterThan(0.95 * most);
			if (move < 10) {
				expect(speed).toBeGreaterThan(9.9);
			}
			travelled += moved;
		}
		// Over the pole and on down the far side, near the meridian it came up.
		expect(point[0] as number).toBeGreaterThan(0);
		expect(Math.abs(point[1] as number)).toBeLessThan(0.02);
		expect(angleBetween(pointAt(89, 180), 0, point, 0)).toBeCloseTo(
			travelled,
			2,
		);
	});
});

describe('streakRegionCos', () => {
	it('reaches the limb when the whole globe is in view', () => {
		for (const distance of [
			2.5,
			DEFAULT_CAMERA_DISTANCE,
			MAX_CAMERA_DISTANCE,
		]) {
			expect(streakRegionCos(viewFrom(distance))).toBeCloseTo(1 / distance, 12);
		}
	});

	it('reaches the corners of the view when zoomed in closer', () => {
		const distance = MIN_CAMERA_DISTANCE;
		const view = viewFrom(distance);
		const regionCos = streakRegionCos(view);
		expect(regionCos).toBeGreaterThan(1 / distance);
		const state = {
			latitude: 15 * RADIANS_PER_DEGREE,
			longitude: 0,
			distance,
		};
		const { origin, direction } = viewRay(state, 1, 1, 1280 / 800);
		const corner = raySphere(origin, direction);
		expect(corner).not.toBeNull();
		expect(angleBetween(corner as Vec3, 0, eyeOf(view), 0)).toBeCloseTo(
			Math.acos(regionCos),
			9,
		);
	});

	it('lies within the half of the globe facing the camera', () => {
		for (let distance = MIN_CAMERA_DISTANCE; distance <= 5; distance += 0.1) {
			const regionCos = streakRegionCos(viewFrom(distance));
			expect(regionCos).toBeGreaterThan(0);
			expect(regionCos).toBeLessThanOrEqual(1);
		}
	});
});

describe('discInRectArea', () => {
	it('is the disc’s area when the disc lies inside, and the rectangle’s when it covers it', () => {
		expect(discInRectArea(10, 100, 50)).toBeCloseTo(Math.PI * 100, 9);
		expect(discInRectArea(100, 30, 40)).toBeCloseTo(1200, 9);
		expect(discInRectArea(25, 50, 50)).toBeCloseTo(Math.PI * 625, 9);
	});

	it('matches a count of the points of a fine lattice in both', () => {
		for (const [radius, width, height] of [
			[30, 50, 40],
			[30, 80, 20],
			[30, 20, 80],
		] as const) {
			let inside = 0;
			const step = 0.1;
			for (let x = -width / 2 + step / 2; x < width / 2; x += step) {
				for (let y = -height / 2 + step / 2; y < height / 2; y += step) {
					if (x * x + y * y <= radius * radius) {
						inside++;
					}
				}
			}
			expect(
				discInRectArea(radius, width, height) / (inside * step * step),
			).toBeCloseTo(1, 2);
		}
	});

	it('is nothing for an empty disc or rectangle', () => {
		expect(discInRectArea(0, 10, 10)).toBe(0);
		expect(discInRectArea(10, 0, 10)).toBe(0);
	});
});

describe('streakCountFor', () => {
	it('never gives more than the cap, however large the view', () => {
		expect(streakCountFor(viewFrom(2.5, 15, 0, 3840, 2160))).toBe(STREAK_CAP);
		expect(streakCountFor(viewFrom(2.5, 15, 0, 20000, 12000))).toBe(STREAK_CAP);
	});

	it('gives more trails when zoomed out while the globe fills the view, below the cap', () => {
		const counts = [MIN_CAMERA_DISTANCE, 1.4, 1.6, 1.8, 2].map((distance) =>
			streakCountFor(viewFrom(distance)),
		);
		for (let index = 1; index < counts.length; index++) {
			expect(counts[index] as number).toBeGreaterThan(
				counts[index - 1] as number,
			);
		}
		expect(Math.max(...counts)).toBeLessThan(STREAK_CAP);
	});

	it('gives fewer as the whole globe shrinks on the screen far out', () => {
		expect(streakCountFor(viewFrom(MAX_CAMERA_DISTANCE))).toBeLessThan(
			streakCountFor(viewFrom(3)),
		);
		expect(streakCountFor(viewFrom(MAX_CAMERA_DISTANCE))).toBeGreaterThan(0);
	});

	it('gives none for a view with no size', () => {
		expect(streakCountFor(viewFrom(3, 15, 0, 0, 800))).toBe(0);
		expect(streakCountFor(viewFrom(3, 15, 0, 1280, 0))).toBe(0);
	});
});

describe('streakOpacity', () => {
	const life = STREAK_LIFE_S;

	it('runs from full at the head to nothing at the tail, in even steps', () => {
		const along = Array.from({ length: STREAK_POINTS }, (_, index) =>
			streakOpacity(life / 2, life, index),
		);
		expect(along[0]).toBe(1);
		expect(along.at(-1)).toBe(0);
		for (let index = 1; index < STREAK_POINTS; index++) {
			expect(
				(along[index - 1] as number) - (along[index] as number),
			).toBeCloseTo(1 / (STREAK_POINTS - 1), 6);
		}
	});

	it('fades in from nothing at the start of a life and out to nothing at its end', () => {
		expect(streakOpacity(0, life, 0)).toBe(0);
		expect(streakOpacity(STREAK_FADE_IN_S / 2, life, 0)).toBeCloseTo(0.5, 9);
		expect(streakOpacity(STREAK_FADE_IN_S, life, 0)).toBe(1);
		expect(streakOpacity(life - STREAK_FADE_OUT_S, life, 0)).toBeCloseTo(1, 9);
		expect(streakOpacity(life - STREAK_FADE_OUT_S / 2, life, 0)).toBeCloseTo(
			0.5,
			9,
		);
		expect(streakOpacity(life, life, 0)).toBe(0);
		expect(streakOpacity(life + 1, life, 0)).toBe(0);
	});
});

describe('createStreaks', () => {
	it('has nothing alive until a world and its winds are set, and stepping without them changes nothing', () => {
		const streaks = createStreaks();
		expect(streaks.capacity).toBe(STREAK_CAP);
		streaks.step(0.1, viewFrom());
		expect(streaks.slots).toBe(0);
		streaks.setWorld(64);
		streaks.step(0.1, viewFrom());
		expect(streaks.slots).toBe(0);
		expect(streaks.alive.every((alive) => alive === 0)).toBe(true);
	});

	it('starts as many trails as the zoom asks for, all in the region in view', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 5, 0));
		const view = viewFrom();
		streaks.step(1 / 60, view);
		const wanted = streakCountFor(view);
		expect(streaks.slots).toBe(wanted);
		expect(aliveTrails(streaks)).toHaveLength(wanted);
		const eye = eyeOf(view);
		const regionCos = streakRegionCos(view);
		for (const trail of aliveTrails(streaks)) {
			const head = headOf(streaks, trail);
			expect(dot(head, eye)).toBeGreaterThanOrEqual(regionCos - 1e-6);
		}
	});

	it('spreads new trails evenly over the region, by area', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 5, 0));
		const view = viewFrom(2);
		streaks.step(0, view);
		const eye = eyeOf(view);
		const regionCos = streakRegionCos(view);
		// Half the region's area lies nearer its middle than this.
		const halfCos = (1 + regionCos) / 2;
		const trails = aliveTrails(streaks);
		const inner = trails.filter((trail) => {
			const head = headOf(streaks, trail);
			return dot(head, eye) >= halfCos;
		});
		expect(inner.length / trails.length).toBeCloseTo(0.5, 1);
	});

	it('starts trails at ages spread over their lives, each life near the average', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 5, 0));
		streaks.step(0, viewFrom());
		const trails = aliveTrails(streaks);
		const lives = trails.map((trail) => streaks.lives[trail] as number);
		expect(Math.min(...lives)).toBeGreaterThanOrEqual(
			STREAK_LIFE_S * (1 - STREAK_LIFE_SPREAD) - 1e-6,
		);
		expect(Math.max(...lives)).toBeLessThanOrEqual(
			STREAK_LIFE_S * (1 + STREAK_LIFE_SPREAD) + 1e-6,
		);
		const shares = trails.map(
			(trail) =>
				(streaks.ages[trail] as number) / (streaks.lives[trail] as number),
		);
		expect(Math.min(...shares)).toBeLessThan(0.1);
		expect(Math.max(...shares)).toBeGreaterThan(0.9);
	});

	it('moves each trail’s head along the wind at its place by the time given', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 10, 0));
		const view = viewFrom();
		streaks.step(0, view);
		const before = Float32Array.from(streaks.points);
		const ages = Float32Array.from(streaks.ages);
		streaks.step(0.05, view);
		let checked = 0;
		for (const trail of aliveTrails(streaks)) {
			if ((streaks.ages[trail] as number) < (ages[trail] as number)) {
				continue; // Started afresh.
			}
			const at = trail * STREAK_POINTS * 3;
			const moved = angleBetween(before, at, streaks.points, at);
			expect(moved / (10 * STREAK_SPEED_SCALE * 0.05)).toBeCloseTo(1, 1);
			// Eastward: about the pole's axis, anticlockwise from above.
			const cross =
				(before[at] as number) * (streaks.points[at + 1] as number) -
				(before[at + 1] as number) * (streaks.points[at] as number);
			expect(cross).toBeGreaterThan(0);
			checked++;
		}
		expect(checked).toBeGreaterThan(100);
	});

	it('makes longer trails in a stronger wind', () => {
		const meanLength = (speed: number): number => {
			const { streaks } = makeStreaks((grid) => uniformWind(grid, speed, 0), {
				seed: 5,
			});
			stepMany(streaks, 90, 1 / 60);
			// Those grown to their full length.
			const grown = aliveTrails(streaks).filter(
				(trail) =>
					(streaks.ages[trail] as number) >
					STREAK_POINTS * STREAK_POINT_INTERVAL_S,
			);
			expect(grown.length).toBeGreaterThan(100);
			return (
				grown.reduce((sum, trail) => sum + trailLength(streaks, trail), 0) /
				grown.length
			);
		};
		const gentle = meanLength(4);
		const strong = meanLength(8);
		expect(strong / gentle).toBeCloseTo(2, 1);
		expect(meanLength(10)).toBeCloseTo(STREAK_REFERENCE_LENGTH, 2);
	});

	it('keeps each point behind the head where the head was a point’s interval before', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 6, 3), {
			capacity: 1,
		});
		const view = viewFrom();
		streaks.step(0, view);
		const heads: Float64Array[] = [];
		for (let step = 0; step < 40; step++) {
			streaks.step(STREAK_POINT_INTERVAL_S, view);
			heads.push(headOf(streaks, 0));
		}
		if ((streaks.ages[0] as number) >= 40 * STREAK_POINT_INTERVAL_S) {
			for (let index = 1; index < STREAK_POINTS; index++) {
				const expected = heads.at(-1 - index) as Float64Array;
				const at = 3 * index;
				expect(angleBetween(streaks.points, at, expected, 0)).toBeLessThan(
					1e-6,
				);
			}
		}
		expect(streaks.slots).toBe(1);
	});

	it('starts a trail afresh once it has lived its life', () => {
		// A gentle wind, so it stays in view for all its life.
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 1, 0), {
			capacity: 1,
			seed: 11,
		});
		const view = viewFrom(MAX_CAMERA_DISTANCE);
		streaks.step(0, view);
		let restarted = false;
		for (let step = 0; step < 100 && !restarted; step++) {
			const age = streaks.ages[0] as number;
			const life = streaks.lives[0] as number;
			const head = headOf(streaks, 0);
			streaks.step(0.1, view);
			if ((streaks.ages[0] as number) < age) {
				restarted = true;
				expect(age + 0.1).toBeGreaterThanOrEqual(life - 1e-5);
				expect(streaks.ages[0]).toBe(0);
				expect(isFresh(streaks, 0)).toBe(true);
				expect(angleBetween(head, 0, headOf(streaks, 0), 0)).toBeGreaterThan(0);
			}
		}
		expect(restarted).toBe(true);
	});

	it('starts afresh, on the near side, every trail left out of view when the camera moves', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 5, 0));
		stepMany(streaks, 10, 1 / 60, viewFrom(3, 15, 0));
		const before = Float32Array.from(streaks.points);
		const far = viewFrom(3, -15, 180);
		streaks.step(1 / 60, far);
		const eye = eyeOf(far);
		const regionCos = streakRegionCos(far);
		const trails = aliveTrails(streaks);
		expect(trails.length).toBe(streakCountFor(far));
		for (const trail of trails) {
			const head = headOf(streaks, trail);
			expect(dot(head, eye)).toBeGreaterThanOrEqual(regionCos - 1e-6);
			expect(isFresh(streaks, trail)).toBe(true);
			expect(streaks.ages[trail]).toBe(0);
			const at = trail * STREAK_POINTS * 3;
			expect(angleBetween(before, at, streaks.points, at)).toBeGreaterThan(0.5);
		}
	});

	it('starts afresh a trail the wind carries out of view, keeping every head on the near side', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 30, 0));
		const view = viewFrom();
		const eye = eyeOf(view);
		const regionCos = streakRegionCos(view);
		let fresh = 0;
		for (let step = 0; step < 120; step++) {
			const ages = Float32Array.from(streaks.ages);
			streaks.step(1 / 30, view);
			for (const trail of aliveTrails(streaks)) {
				const head = headOf(streaks, trail);
				expect(dot(head, eye)).toBeGreaterThanOrEqual(regionCos - 1e-6);
				if (
					streaks.ages[trail] === 0 &&
					(ages[trail] as number) + 1 / 30 < (streaks.lives[trail] as number)
				) {
					fresh++;
				}
			}
		}
		// Some were started afresh before their lives were up.
		expect(fresh).toBeGreaterThan(0);
	});

	it('fades out a trail stalled in calm air and starts it afresh soon after', () => {
		const { streaks } = makeStreaks(
			(grid) => uniformWind(grid, CALM_SPEED / 2, 0),
			{
				capacity: 1,
				seed: 3,
			},
		);
		const view = viewFrom();
		streaks.step(0, view);
		// Young enough not to reach the end of its life meanwhile.
		streaks.ages[0] = 0.5;
		const life = streaks.lives[0] as number;
		stepMany(streaks, 4, 0.1, view);
		expect(streaks.lives[0]).toBe(life);
		let restartedAfter = Number.NaN;
		for (let step = 1; step <= 20; step++) {
			const age = streaks.ages[0] as number;
			streaks.step(0.1, view);
			if ((streaks.ages[0] as number) < age) {
				restartedAfter = 0.4 + 0.1 * step;
				break;
			}
		}
		// Faded out from the first step past the limit.
		expect(restartedAfter).toBeGreaterThan(
			STREAK_CALM_LIMIT_S + STREAK_FADE_OUT_S - 1e-6,
		);
		expect(restartedAfter).toBeLessThanOrEqual(
			STREAK_CALM_LIMIT_S + STREAK_FADE_OUT_S + 0.1 + 1e-6,
		);
	});

	it('keeps a trail in a wind above calm for its whole life', () => {
		const { streaks } = makeStreaks(
			(grid) => uniformWind(grid, CALM_SPEED * 2, 0),
			{
				capacity: 1,
				seed: 3,
			},
		);
		const view = viewFrom(MAX_CAMERA_DISTANCE);
		streaks.step(0, view);
		streaks.ages[0] = 0;
		const life = streaks.lives[0] as number;
		stepMany(streaks, 20, 0.1, view);
		expect(streaks.lives[0]).toBe(life);
		expect(streaks.ages[0]).toBeCloseTo(2, 5);
	});

	it('moves trails by no more than the longest step after a long gap, and not at all for no time', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 10, 0));
		const view = viewFrom();
		streaks.step(0, view);
		const ages = Float32Array.from(streaks.ages);
		const before = Float32Array.from(streaks.points);
		streaks.step(30, view);
		for (const trail of aliveTrails(streaks)) {
			if ((streaks.ages[trail] as number) < (ages[trail] as number)) {
				continue;
			}
			expect(streaks.ages[trail]).toBeCloseTo(
				(ages[trail] as number) + STREAK_MAX_STEP_S,
				5,
			);
			const at = trail * STREAK_POINTS * 3;
			expect(angleBetween(before, at, streaks.points, at)).toBeLessThan(
				10 * STREAK_SPEED_SCALE * STREAK_MAX_STEP_S * 1.01,
			);
		}
		for (const seconds of [0, -1, Number.NaN]) {
			const still = Float32Array.from(streaks.points);
			const stillAges = Float32Array.from(streaks.ages);
			streaks.step(seconds, view);
			expect(streaks.points).toEqual(still);
			expect(streaks.ages).toEqual(stillAges);
		}
	});

	it('gives exactly the same trails for the same seed, winds, camera and steps', () => {
		const run = (seed: number) => {
			const { streaks } = makeStreaks(
				(grid) => fixedVectorWind(grid, [3, 7, 2]),
				{
					seed,
				},
			);
			const views = [viewFrom(3), viewFrom(2.5, 20, 10), viewFrom(1.6, 25, 15)];
			const steps = [1 / 60, 1 / 30, 0.2, 1 / 144, 0.05];
			for (let frame = 0; frame < 60; frame++) {
				streaks.step(
					steps[frame % steps.length] as number,
					views[Math.floor(frame / 20)] as StreakView,
				);
			}
			return {
				points: Float32Array.from(streaks.points),
				opacity: Float32Array.from(streaks.opacity),
				ages: Float32Array.from(streaks.ages),
				slots: streaks.slots,
			};
		};
		expect(run(42)).toEqual(run(42));
		expect(run(42).points).not.toEqual(run(43).points);
	});

	it('follows the zoom: fewer trails close in, the others faded out, and more again further out', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 3, 0));
		const out = viewFrom(2);
		streaks.step(0, out);
		const many = streaks.slots;
		expect(many).toBe(streakCountFor(out));
		const close = viewFrom(MIN_CAMERA_DISTANCE);
		const few = streakCountFor(close);
		expect(few).toBeLessThan(many);
		stepMany(streaks, 2 + Math.ceil(STREAK_FADE_OUT_S / 0.05), 0.05, close);
		expect(streaks.slots).toBeLessThanOrEqual(few);
		expect(aliveTrails(streaks)).toHaveLength(few);
		expect(
			streaks.opacity.subarray(few * STREAK_POINTS).every((o) => o === 0),
		).toBe(true);
		streaks.step(0.05, out);
		expect(aliveTrails(streaks)).toHaveLength(many);
	});

	it('fades out the trails beyond the count rather than dropping them at once', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 3, 0));
		streaks.step(0, viewFrom(2));
		const many = streaks.slots;
		const close = viewFrom(MIN_CAMERA_DISTANCE);
		streaks.step(0.01, close);
		expect(aliveTrails(streaks).length).toBeGreaterThan(streakCountFor(close));
		for (const trail of aliveTrails(streaks).filter(
			(t) => t >= streakCountFor(close),
		)) {
			expect(streaks.lives[trail] as number).toBeLessThanOrEqual(
				(streaks.ages[trail] as number) + STREAK_FADE_OUT_S + 1e-5,
			);
		}
		expect(many).toBeGreaterThan(streakCountFor(close));
	});

	it('never holds more trails than it can, however many the zoom asks for', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 3, 0));
		const huge = viewFrom(2.5, 15, 0, 20000, 12000);
		stepMany(streaks, 3, 1 / 60, huge);
		expect(streaks.slots).toBe(STREAK_CAP);
		const small = makeStreaks((grid) => uniformWind(grid, 3, 0), {
			capacity: 10,
		});
		stepMany(small.streaks, 3, 1 / 60, huge);
		expect(small.streaks.slots).toBe(10);
	});

	it('carries on from where the trails are when the winds change under them', () => {
		const { grid, streaks } = makeStreaks((g) => uniformWind(g, 10, 0), {
			capacity: 50,
		});
		const view = viewFrom(MAX_CAMERA_DISTANCE);
		stepMany(streaks, 5, 1 / 60, view);
		const points = Float32Array.from(streaks.points);
		const ages = Float32Array.from(streaks.ages);
		streaks.setWinds(uniformWind(grid, 0, 10));
		expect(streaks.points).toEqual(points);
		expect(streaks.ages).toEqual(ages);
		streaks.step(0.05, view);
		for (const trail of aliveTrails(streaks)) {
			if ((streaks.ages[trail] as number) < (ages[trail] as number)) {
				continue;
			}
			const at = trail * STREAK_POINTS * 3;
			// Northward now: the head's z grows.
			expect(streaks.points[at + 2] as number).toBeGreaterThan(
				points[at + 2] as number,
			);
		}
	});

	it('stops where they are for no winds, and starts afresh for a grid of another resolution', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 10, 0));
		const view = viewFrom();
		stepMany(streaks, 3, 1 / 60, view);
		const slots = streaks.slots;
		const points = Float32Array.from(streaks.points);
		streaks.setWinds(null);
		streaks.step(0.05, view);
		expect(streaks.points).toEqual(points);
		expect(streaks.slots).toBe(slots);
		// Another world on the same grid drops the winds but keeps the trails.
		streaks.setWorld(64);
		expect(streaks.slots).toBe(slots);
		streaks.setWorld(128);
		expect(streaks.slots).toBe(0);
		expect(streaks.alive.every((alive) => alive === 0)).toBe(true);
		expect(streaks.opacity.every((o) => o === 0)).toBe(true);
		streaks.setWinds(uniformWind(getGrid(128), 10, 0));
		streaks.step(1 / 60, view);
		expect(streaks.slots).toBe(streakCountFor(view));
	});

	it('starts afresh for winds given after none, and after another world on the same grid', () => {
		const { grid, streaks } = makeStreaks((g) => uniformWind(g, 10, 0));
		const view = viewFrom();
		stepMany(streaks, 3, 1 / 60, view);
		streaks.setWinds(null);
		streaks.setWinds(uniformWind(grid, 0, 10));
		expect(streaks.slots).toBe(0);
		expect(streaks.alive.every((alive) => alive === 0)).toBe(true);
		expect(streaks.opacity.every((o) => o === 0)).toBe(true);
		stepMany(streaks, 3, 1 / 60, view);
		expect(streaks.slots).toBeGreaterThan(0);
		streaks.setWorld(64);
		streaks.setWinds(uniformWind(grid, 10, 0));
		expect(streaks.slots).toBe(0);
		expect(streaks.alive.every((alive) => alive === 0)).toBe(true);
	});

	it('refuses winds of the wrong length, or before a world, keeping those it has', () => {
		const streaks = createStreaks();
		expect(() => streaks.setWinds(uniformWind(getGrid(64), 5, 0))).toThrow(
			RangeError,
		);
		streaks.setWorld(64);
		streaks.setWinds(uniformWind(getGrid(64), 5, 0));
		expect(() => streaks.setWinds(uniformWind(getGrid(128), 5, 0))).toThrow(
			RangeError,
		);
		streaks.step(1 / 60, viewFrom());
		expect(streaks.slots).toBeGreaterThan(0);
	});

	it('writes into the same arrays at every step', () => {
		const { streaks } = makeStreaks((grid) => uniformWind(grid, 5, 0));
		const { points, opacity, ages, lives, alive } = streaks;
		stepMany(streaks, 5, 1 / 60);
		expect(streaks.points).toBe(points);
		expect(streaks.opacity).toBe(opacity);
		expect(streaks.ages).toBe(ages);
		expect(streaks.lives).toBe(lives);
		expect(streaks.alive).toBe(alive);
	});
});

describe('createWindStreaks', () => {
	const make = () => createWindStreaks(createGlobeMaterial().uniforms);
	type Geometry = {
		instanceCount: number;
		getAttribute(name: string): {
			data: { array: Float32Array; stride: number; version: number };
			offset: number;
		};
	};
	const geometryOf = (streaks: ReturnType<typeof make>): Geometry =>
		(streaks.meshes[0] as unknown as { geometry: Geometry }).geometry;

	it('draws the light lines and then the dark ones from one geometry', () => {
		const streaks = make();
		const [light, dark] = streaks.meshes;
		expect(light.geometry).toBe(dark.geometry);
		expect(dark.renderOrder).toBeGreaterThan(light.renderOrder);
		expect(light.material).not.toBe(dark.material);
	});

	it('reads each segment’s ends from one array of points, the end a point on from the start', () => {
		const geometry = geometryOf(make());
		const start = geometry.getAttribute('aStart');
		const end = geometry.getAttribute('aEnd');
		expect(start.data).toBe(end.data);
		expect(start.data.array).toHaveLength(STREAK_CAP * STREAK_POINTS * 3);
		expect([start.offset, end.offset, start.data.stride]).toEqual([0, 3, 3]);
		const opacityStart = geometry.getAttribute('aOpacityStart');
		const opacityEnd = geometry.getAttribute('aOpacityEnd');
		expect(opacityStart.data).toBe(opacityEnd.data);
		expect([opacityStart.offset, opacityEnd.offset]).toEqual([0, 1]);
	});

	it('shows nothing until it is moved on with a world and its winds', () => {
		const streaks = make();
		expect(streaks.meshes.every((mesh) => mesh.visible)).toBe(false);
		streaks.setWorld(64);
		streaks.update(1 / 60, viewFrom());
		expect(streaks.meshes.some((mesh) => mesh.visible)).toBe(false);
		expect(geometryOf(streaks).instanceCount).toBe(0);
	});

	it('draws a segment for each point of the trails in use, but the last, and marks them for upload', () => {
		const streaks = make();
		streaks.setWorld(64);
		streaks.setWinds(uniformWind(getGrid(64), 5, 0));
		const geometry = geometryOf(streaks);
		const version = geometry.getAttribute('aStart').data.version;
		const view = viewFrom();
		streaks.update(1 / 60, view);
		expect(streaks.meshes.every((mesh) => mesh.visible)).toBe(true);
		expect(geometry.instanceCount).toBe(
			streakCountFor(view) * STREAK_POINTS - 1,
		);
		expect(geometry.getAttribute('aStart').data.version).toBeGreaterThan(
			version,
		);
		const ranges = (
			geometry.getAttribute('aStart').data as unknown as {
				updateRanges: { start: number; count: number }[];
			}
		).updateRanges;
		expect(ranges).toEqual([
			{ start: 0, count: streakCountFor(view) * STREAK_POINTS * 3 },
		]);
	});

	it('hides the streaks for a world of another resolution', () => {
		const streaks = make();
		streaks.setWorld(64);
		streaks.setWinds(uniformWind(getGrid(64), 5, 0));
		streaks.update(1 / 60, viewFrom());
		streaks.setWorld(128);
		expect(streaks.meshes.some((mesh) => mesh.visible)).toBe(false);
		expect(geometryOf(streaks).instanceCount).toBe(0);
	});

	/**
	 * Whether every trail in use has all its points behind the head at one
	 * place, as a trail just started has.
	 */
	const allJustStarted = (points: Float32Array, slots: number): boolean => {
		for (let trail = 0; trail < slots; trail++) {
			const from = trail * STREAK_POINTS * 3;
			for (let index = 2; index < STREAK_POINTS; index++) {
				for (let axis = 0; axis < 3; axis++) {
					if (points[from + 3 * index + axis] !== points[from + 3 + axis]) {
						return false;
					}
				}
			}
		}
		return true;
	};

	/**
	 * Streaks on a 64 grid in an eastward wind, moved on long enough for
	 * their trails to have grown.
	 */
	const grown = () => {
		const streaks = make();
		const view = viewFrom();
		streaks.setWorld(64);
		streaks.setWinds(uniformWind(getGrid(64), 10, 0));
		for (let step = 0; step < 30; step++) {
			streaks.update(1 / 60, view);
		}
		const geometry = geometryOf(streaks);
		const points = geometry.getAttribute('aStart').data.array;
		const slots = (geometry.instanceCount + 1) / STREAK_POINTS;
		expect(slots).toBe(streakCountFor(view));
		expect(allJustStarted(points, slots)).toBe(false);
		return { streaks, view, geometry, points, slots };
	};

	it('draws nothing once the winds are gone, even when moved on', () => {
		const { streaks, view, geometry } = grown();
		streaks.setWinds(null);
		expect(streaks.meshes.some((mesh) => mesh.visible)).toBe(false);
		expect(geometry.instanceCount).toBe(0);
		streaks.update(1 / 60, view);
		expect(streaks.meshes.some((mesh) => mesh.visible)).toBe(false);
		expect(geometry.instanceCount).toBe(0);
	});

	it('draws nothing for another world on the same grid until its winds are set and it is moved on', () => {
		const { streaks, view, geometry } = grown();
		streaks.setWorld(64);
		expect(streaks.meshes.some((mesh) => mesh.visible)).toBe(false);
		expect(geometry.instanceCount).toBe(0);
		streaks.update(1 / 60, view);
		expect(streaks.meshes.some((mesh) => mesh.visible)).toBe(false);
		expect(geometry.instanceCount).toBe(0);
		streaks.setWinds(uniformWind(getGrid(64), 10, 0));
		expect(streaks.meshes.some((mesh) => mesh.visible)).toBe(false);
		expect(geometry.instanceCount).toBe(0);
		streaks.update(1 / 60, view);
		expect(streaks.meshes.every((mesh) => mesh.visible)).toBe(true);
		expect(geometry.instanceCount).toBe(
			streakCountFor(view) * STREAK_POINTS - 1,
		);
	});

	it('draws fresh trails, none where they stopped, at the first frame after the winds return', () => {
		const { streaks, view, geometry, points } = grown();
		streaks.setWinds(null);
		streaks.setWinds(uniformWind(getGrid(64), 0, 10));
		streaks.update(1 / 60, view);
		expect(streaks.meshes.every((mesh) => mesh.visible)).toBe(true);
		const slots = (geometry.instanceCount + 1) / STREAK_POINTS;
		expect(slots).toBe(streakCountFor(view));
		expect(allJustStarted(points, slots)).toBe(true);
	});

	it('keeps drawing the trails from where they are when one field of winds takes the place of another', () => {
		const { streaks, view, geometry, points, slots } = grown();
		const before = Float32Array.from(points);
		streaks.setWinds(uniformWind(getGrid(64), 0, 10));
		expect(streaks.meshes.every((mesh) => mesh.visible)).toBe(true);
		expect(geometry.instanceCount).toBe(slots * STREAK_POINTS - 1);
		expect(points).toEqual(before);
		streaks.update(1 / 60, view);
		expect(streaks.meshes.every((mesh) => mesh.visible)).toBe(true);
		expect(geometry.instanceCount).toBe(slots * STREAK_POINTS - 1);
		expect(allJustStarted(points, slots)).toBe(false);
	});
});
