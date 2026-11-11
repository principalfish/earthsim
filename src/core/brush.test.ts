import { describe, expect, it } from 'vitest';
import {
	angleBetween,
	applyDab,
	BRUSH_MODES,
	type BrushMode,
	brushFalloff,
	type DabResult,
	dabRadius,
	MAX_SMOOTH_AMOUNT,
	MAX_SMOOTH_PASS_AMOUNT,
	MAX_STROKE_STEPS,
	MIN_DAB_RADIUS_CELLS,
	smoothPasses,
	strokePath,
} from './brush';
import {
	cellAt,
	cellCentre,
	cellIndex,
	cellsWithin,
	type Grid,
	getGrid,
	latLonToDirection,
	neighbours,
	SUPPORTED_RESOLUTIONS,
	type Vec3,
} from './grid';
import {
	BLANK_OCEAN_ELEVATION_M,
	createBlankWorld,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	PLANET_RADIUS_KM,
	type World,
} from './world';

/** A small seeded generator (mulberry32) so random cases repeat exactly. */
const createRandom = (seed: number): (() => number) => {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/** A direction drawn uniformly over the sphere. */
const randomDirection = (random: () => number): Vec3 => {
	const z = 2 * random() - 1;
	const longitude = 2 * Math.PI * random();
	const r = Math.sqrt(1 - z * z);
	return [r * Math.cos(longitude), r * Math.sin(longitude), z];
};

const dot = (a: Vec3, b: Vec3): number =>
	a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];

const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

/** The cube corner shared by faces 0 (+X), 2 (+Y) and 4 (+Z). */
const CORNER: Vec3 = [1, 1, 1];

/** A world whose every cell holds one elevation. */
const createFlatWorld = (resolution: number, elevation: number): World => {
	const world = createBlankWorld(resolution);
	world.elevation.fill(elevation);
	return world;
};

/** A world of noise: every cell within `amplitude` metres of the datum. */
const createNoisyWorld = (
	resolution: number,
	amplitude: number,
	seed: number,
): World => {
	const world = createBlankWorld(resolution);
	const random = createRandom(seed);
	for (let cell = 0; cell < world.elevation.length; cell++) {
		world.elevation[cell] = (2 * random() - 1) * amplitude;
	}
	return world;
};

/** The cells whose elevation differs between two states of a world. */
const differingCells = (
	before: Float32Array,
	after: Float32Array,
): number[] => {
	const cells: number[] = [];
	for (let cell = 0; cell < before.length; cell++) {
		if (before[cell] !== after[cell]) {
			cells.push(cell);
		}
	}
	return cells;
};

const sorted = (cells: Int32Array): number[] =>
	Array.from(cells).sort((a, b) => a - b);

/** The area-weighted mean and variance of the elevation of some cells. */
const weightedMoments = (
	grid: Grid,
	elevation: Float32Array,
	cells: Iterable<number>,
): { mean: number; variance: number } => {
	let area = 0;
	let sum = 0;
	let squares = 0;
	for (const cell of cells) {
		const a = grid.areas[cell] as number;
		const h = elevation[cell] as number;
		area += a;
		sum += a * h;
		squares += a * h * h;
	}
	const mean = sum / area;
	return { mean, variance: squares / area - mean * mean };
};

/** Every cell of a grid. */
const allCells = function* (grid: Grid): Generator<number> {
	for (let cell = 0; cell < grid.cellCount; cell++) {
		yield cell;
	}
};

describe('brushFalloff', () => {
	it('is 1 at the centre and exactly 0 at the edge and beyond', () => {
		expect(brushFalloff(0)).toBe(1);
		expect(brushFalloff(1)).toBe(0);
		expect(brushFalloff(1.5)).toBe(0);
		expect(brushFalloff(Number.POSITIVE_INFINITY)).toBe(0);
	});

	it('treats a distance below zero as the centre', () => {
		expect(brushFalloff(-0.1)).toBe(1);
	});

	it('falls steadily from the centre to the edge, through a half', () => {
		expect(brushFalloff(0.5)).toBeCloseTo(0.5, 12);
		let previous = 1;
		for (let t = 0.01; t < 1; t += 0.01) {
			const value = brushFalloff(t);
			expect(value).toBeLessThan(previous);
			expect(value).toBeGreaterThan(0);
			previous = value;
		}
	});

	it('is flat at both ends, so strokes have no crease', () => {
		expect(1 - brushFalloff(1e-4)).toBeLessThan(1e-7);
		expect(brushFalloff(1 - 1e-4)).toBeLessThan(1e-7);
	});
});

describe('angleBetween', () => {
	it('measures a right angle and a straight one', () => {
		expect(angleBetween([1, 0, 0], [0, 1, 0])).toBeCloseTo(Math.PI / 2, 14);
		expect(angleBetween([1, 0, 0], [-1, 0, 0])).toBeCloseTo(Math.PI, 14);
		expect(angleBetween([0, 0, 1], [0, 0, 1])).toBe(0);
	});

	it('ignores the lengths of the vectors', () => {
		expect(angleBetween([1e200, 0, 0], [1e-200, 1e-200, 0])).toBeCloseTo(
			Math.PI / 4,
			14,
		);
	});

	it('keeps its precision for directions that are nearly the same', () => {
		expect(angleBetween([1, 0, 0], [1, 1e-9, 0])).toBeCloseTo(1e-9, 20);
	});

	it('rejects a zero or non-finite vector', () => {
		expect(() => angleBetween([0, 0, 0], [1, 0, 0])).toThrow(RangeError);
		expect(() => angleBetween([1, 0, 0], [Number.NaN, 0, 0])).toThrow(
			RangeError,
		);
		expect(() =>
			angleBetween([1, 0, 0], [Number.POSITIVE_INFINITY, 0, 0]),
		).toThrow(RangeError);
	});
});

describe('dabRadius', () => {
	it('is the radius as an angle when the grid can show it', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			expect(dabRadius(resolution, 500)).toBe(500 / PLANET_RADIUS_KM);
			expect(dabRadius(resolution, 3000)).toBe(3000 / PLANET_RADIUS_KM);
		}
	});

	it('is never narrower than the smallest brush the grid can show', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const floor = MIN_DAB_RADIUS_CELLS * getGrid(resolution).cellWidth;
			expect(dabRadius(resolution, 1)).toBe(floor);
		}
		// A cell of the coarsest grid is about 156 km across.
		expect(dabRadius(64, 100) * PLANET_RADIUS_KM).toBeCloseTo(156.4, 1);
		expect(dabRadius(256, 100)).toBe(100 / PLANET_RADIUS_KM);
	});

	it('rejects a radius that is not positive and finite', () => {
		for (const radius of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => dabRadius(64, radius)).toThrow(RangeError);
		}
	});

	it('rejects an unsupported resolution', () => {
		expect(() => dabRadius(100 as never, 500)).toThrow(RangeError);
	});
});

describe('applyDab: raise', () => {
	const direction = latLonToDirection(20, 30);
	const radiusKm = 1500;
	const strength = 100;

	it('raises only cells within the radius, most at the centre', () => {
		const world = createFlatWorld(64, 0);
		const grid = getGrid(64);
		const radius = radiusKm / PLANET_RADIUS_KM;
		const { cells } = applyDab(world, {
			direction,
			radiusKm,
			strength,
			mode: 'raise',
		});

		expect(cells.length).toBeGreaterThan(100);
		let highest = 0;
		let highestCell = -1;
		let inside = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const angle = angleBetween(direction, cellCentre(grid, cell));
			const height = world.elevation[cell] as number;
			if (angle < radius * (1 - 1e-9)) {
				inside++;
				expect(height).toBeGreaterThan(0);
				expect(height).toBeLessThanOrEqual(strength);
				expect(height).toBeCloseTo(strength * brushFalloff(angle / radius), 4);
			} else if (angle >= radius) {
				expect(height).toBe(0);
			}
			if (height > highest) {
				highest = height;
				highestCell = cell;
			}
		}
		expect(cells.length).toBe(inside);
		expect(highestCell).toBe(cellAt(grid, direction));
		expect(highest).toBeGreaterThan(0.95 * strength);
	});

	it('raises less the farther a cell is from the centre', () => {
		const world = createFlatWorld(64, 0);
		const grid = getGrid(64);
		const { cells } = applyDab(world, {
			direction,
			radiusKm,
			strength,
			mode: 'raise',
		});
		const byDistance = Array.from(cells)
			.map((cell) => ({
				angle: angleBetween(direction, cellCentre(grid, cell)),
				height: world.elevation[cell] as number,
			}))
			.sort((a, b) => a.angle - b.angle);
		for (let k = 1; k < byDistance.length; k++) {
			expect(byDistance[k]?.height).toBeLessThanOrEqual(
				byDistance[k - 1]?.height as number,
			);
		}
	});

	it('adds the full strength at a cell centre under the brush centre', () => {
		const world = createFlatWorld(64, 0);
		const grid = getGrid(64);
		const cell = cellIndex(grid, 2, 20, 41);
		applyDab(world, {
			direction: cellCentre(grid, cell),
			radiusKm,
			strength,
			mode: 'raise',
		});
		expect(world.elevation[cell]).toBe(strength);
	});

	it('leaves a cell whose centre is exactly at the edge alone', () => {
		const world = createFlatWorld(64, 0);
		const grid = getGrid(64);
		const centre = cellCentre(grid, cellIndex(grid, 2, 20, 41));
		const edgeCell = cellIndex(grid, 2, 27, 41);
		const edge = angleBetween(centre, cellCentre(grid, edgeCell));
		const { cells } = applyDab(world, {
			direction: centre,
			radiusKm: edge * PLANET_RADIUS_KM,
			strength: 5000,
			mode: 'raise',
		});
		expect(cells.length).toBeGreaterThan(50);
		expect(world.elevation[edgeCell]).toBe(0);
		expect(Array.from(cells)).not.toContain(edgeCell);
	});

	it('builds up over repeated dabs', () => {
		const world = createBlankWorld(64);
		const grid = getGrid(64);
		const centre = cellCentre(grid, cellIndex(grid, 0, 32, 32));
		for (let dab = 0; dab < 50; dab++) {
			applyDab(world, {
				direction: centre,
				radiusKm: 500,
				strength: 100,
				mode: 'raise',
			});
		}
		expect(world.elevation[cellAt(grid, centre)]).toBeCloseTo(
			BLANK_OCEAN_ELEVATION_M + 5000,
			2,
		);
	});

	it('does nothing at zero strength', () => {
		const world = createBlankWorld(64);
		const result = applyDab(world, {
			direction,
			radiusKm,
			strength: 0,
			mode: 'raise',
		});
		expect(result.cells.length).toBe(0);
		expect(result.before.length).toBe(0);
		expect(world.elevation.every((h) => h === BLANK_OCEAN_ELEVATION_M)).toBe(
			true,
		);
	});

	it('ignores the length of the direction', () => {
		const one = createFlatWorld(64, 0);
		const other = createFlatWorld(64, 0);
		applyDab(one, { direction, radiusKm, strength, mode: 'raise' });
		applyDab(other, {
			direction: [direction[0] * 8, direction[1] * 8, direction[2] * 8],
			radiusKm,
			strength,
			mode: 'raise',
		});
		expect(other.elevation).toEqual(one.elevation);
	});
});

describe('applyDab: lower', () => {
	it('is the mirror of raise', () => {
		const random = createRandom(11);
		for (const resolution of [64, 128]) {
			const raised = createFlatWorld(resolution, 0);
			const lowered = createFlatWorld(resolution, 0);
			const options = {
				direction: randomDirection(random),
				radiusKm: 900,
				strength: 250,
			};
			const up = applyDab(raised, { ...options, mode: 'raise' });
			const down = applyDab(lowered, { ...options, mode: 'lower' });

			expect(sorted(down.cells)).toEqual(sorted(up.cells));
			expect(up.cells.length).toBeGreaterThan(0);
			for (let cell = 0; cell < raised.elevation.length; cell++) {
				expect(
					(lowered.elevation[cell] as number) +
						(raised.elevation[cell] as number),
				).toBe(0);
			}
		}
	});

	it('cuts back what a raise built', () => {
		const world = createBlankWorld(64);
		const options = {
			direction: latLonToDirection(-35, 140),
			radiusKm: 1200,
			strength: 512,
		};
		applyDab(world, { ...options, mode: 'raise' });
		applyDab(world, { ...options, mode: 'lower' });
		for (const height of world.elevation) {
			expect(height).toBeCloseTo(BLANK_OCEAN_ELEVATION_M, 2);
		}
	});
});

describe('applyDab: across cube edges and corners', () => {
	/** The turn about the corner that carries face 0 to 2, 2 to 4 and 4 to 0. */
	const turn = (v: Vec3): Vec3 => [v[2], v[0], v[1]];

	const expectThreefold = (world: World, cells: Int32Array): void => {
		const grid = getGrid(world.resolution);
		const perFace = [0, 0, 0, 0, 0, 0];
		const changed = new Set(cells);
		for (const cell of cells) {
			perFace[Math.floor(cell / (grid.n * grid.n))] =
				(perFace[Math.floor(cell / (grid.n * grid.n))] as number) + 1;
			const image = cellAt(grid, turn(cellCentre(grid, cell)));
			expect(changed.has(image)).toBe(true);
			expect(world.elevation[image]).toBeCloseTo(
				world.elevation[cell] as number,
				3,
			);
		}
		expect(perFace[0]).toBeGreaterThan(0);
		expect(perFace[2]).toBe(perFace[0]);
		expect(perFace[4]).toBe(perFace[0]);
		expect(perFace[1]).toBe(0);
		expect(perFace[3]).toBe(0);
		expect(perFace[5]).toBe(0);
	};

	it('raises all three faces at a corner alike', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const world = createFlatWorld(resolution, 0);
			const { cells } = applyDab(world, {
				direction: CORNER,
				radiusKm: 800,
				strength: 300,
				mode: 'raise',
			});
			expect(cells.length).toBeGreaterThanOrEqual(12);
			expectThreefold(world, cells);
		}
	});

	it('changes exactly the three cells at a corner with the narrowest brush', () => {
		const world = createFlatWorld(64, 0);
		const { cells } = applyDab(world, {
			direction: CORNER,
			radiusKm: 100,
			strength: 300,
			mode: 'raise',
		});
		expect(cells.length).toBe(3);
		expectThreefold(world, cells);
	});

	it('smooths all three faces at a corner alike', () => {
		const world = createFlatWorld(64, 0);
		applyDab(world, {
			direction: CORNER,
			radiusKm: 400,
			strength: 2000,
			mode: 'raise',
		});
		const { cells } = applyDab(world, {
			direction: CORNER,
			radiusKm: 1000,
			strength: 0.8,
			mode: 'smooth',
		});
		expect(cells.length).toBeGreaterThanOrEqual(12);
		expectThreefold(world, cells);
	});

	it('gives a dab on a cube edge the same shape as one mid-face', () => {
		const grid = getGrid(64);
		const profile = (direction: Vec3): number[] => {
			const world = createFlatWorld(64, 0);
			const { cells } = applyDab(world, {
				direction,
				radiusKm: 1000,
				strength: 100,
				mode: 'raise',
			});
			// Height against distance is the brush's shape, wherever the
			// cells happen to lie.
			return Array.from(cells).map(
				(cell) =>
					(world.elevation[cell] as number) -
					100 *
						brushFalloff(
							angleBetween(direction, cellCentre(grid, cell)) /
								(1000 / PLANET_RADIUS_KM),
						),
			);
		};
		// Faces 0 and 2 meet along the edge through (1, 1, 0).
		for (const direction of [
			[1, 1, 0],
			[1, 1, 0.3],
			[1, 0, 0],
		] as Vec3[]) {
			const errors = profile(direction);
			expect(errors.length).toBeGreaterThan(100);
			for (const error of errors) {
				expect(Math.abs(error)).toBeLessThan(1e-4);
			}
		}
	});
});

describe('smoothPasses', () => {
	it('makes no pass for no smoothing', () => {
		expect(smoothPasses(0)).toBe(0);
	});

	it('makes one pass for up to the most a pass does', () => {
		expect(MAX_SMOOTH_PASS_AMOUNT).toBe(0.2);
		expect(smoothPasses(1e-9)).toBe(1);
		expect(smoothPasses(MAX_SMOOTH_PASS_AMOUNT)).toBe(1);
	});

	it('makes the fewest passes that each do no more than that', () => {
		for (const amount of [0.21, 0.5, 1, 3.7, 50, 1e3]) {
			const passes = smoothPasses(amount);
			expect(Number.isInteger(passes)).toBe(true);
			expect(amount / passes).toBeLessThanOrEqual(MAX_SMOOTH_PASS_AMOUNT);
			expect(amount / (passes - 1)).toBeGreaterThan(MAX_SMOOTH_PASS_AMOUNT);
		}
		expect(smoothPasses(1)).toBe(5);
	});
});

describe('applyDab: smooth', () => {
	/** The largest difference between two terrains, in metres. */
	const farthestApart = (a: Float32Array, b: Float32Array): number => {
		let most = 0;
		for (let cell = 0; cell < a.length; cell++) {
			most = Math.max(
				most,
				Math.abs((a[cell] as number) - (b[cell] as number)),
			);
		}
		return most;
	};

	/** A world with one broad, smooth hill on a flat floor. */
	const createHillWorld = (resolution: number, direction: Vec3): World => {
		const world = createFlatWorld(resolution, 0);
		applyDab(world, {
			direction,
			radiusKm: 1200,
			strength: 3000,
			mode: 'raise',
		});
		return world;
	};

	it('reduces the variance of a noisy patch', () => {
		const grid = getGrid(64);
		const world = createNoisyWorld(64, 500, 3);
		const direction = latLonToDirection(10, -50);
		const start = Float32Array.from(world.elevation);
		const { cells } = applyDab(world, {
			direction,
			radiusKm: 2000,
			strength: 1,
			mode: 'smooth',
		});
		expect(cells.length).toBeGreaterThan(300);
		const before = weightedMoments(grid, start, cells);
		const after = weightedMoments(grid, world.elevation, cells);
		expect(after.variance).toBeLessThan(0.75 * before.variance);
	});

	it('keeps reducing the variance dab after dab, weak or strong', () => {
		const grid = getGrid(64);
		const world = createNoisyWorld(64, 500, 4);
		const direction = latLonToDirection(-60, 100);
		let previous = Number.POSITIVE_INFINITY;
		let patch: Int32Array | null = null;
		for (let dab = 0; dab < 5; dab++) {
			const { cells } = applyDab(world, {
				direction,
				radiusKm: 2000,
				strength: [1, 0.4, 0.05, 3, 0.4][dab] as number,
				mode: 'smooth',
			});
			patch ??= cells;
			const { variance } = weightedMoments(grid, world.elevation, patch);
			expect(variance).toBeLessThan(previous);
			previous = variance;
		}
	});

	it('leaves a flat area unchanged', () => {
		for (const level of [BLANK_OCEAN_ELEVATION_M, 0, 1234.5, MAX_ELEVATION_M]) {
			const world = createFlatWorld(64, level);
			const result = applyDab(world, {
				direction: CORNER,
				radiusKm: 3000,
				strength: 1,
				mode: 'smooth',
			});
			expect(result.cells.length).toBe(0);
			expect(world.elevation.every((h) => h === Math.fround(level))).toBe(true);
		}
	});

	it('does nothing at zero strength', () => {
		const world = createNoisyWorld(64, 500, 9);
		const start = Float32Array.from(world.elevation);
		const result = applyDab(world, {
			direction: CORNER,
			radiusKm: 2000,
			strength: 0,
			mode: 'smooth',
		});
		expect(result.cells.length).toBe(0);
		expect(result.before.length).toBe(0);
		expect(world.elevation).toEqual(start);
	});

	it('softens a sharp peak', () => {
		const grid = getGrid(64);
		const world = createFlatWorld(64, 0);
		const peak = cellIndex(grid, 4, 30, 30);
		world.elevation[peak] = 4000;
		applyDab(world, {
			direction: cellCentre(grid, peak),
			radiusKm: 1500,
			strength: MAX_SMOOTH_PASS_AMOUNT,
			mode: 'smooth',
		});
		// One pass: the peak loses the amount's share of its height, and
		// each neighbour gains about a quarter of what it lost.
		expect(world.elevation[peak]).toBeCloseTo(4000 * (1 - 0.2), 2);
		for (const neighbour of neighbours(grid, peak)) {
			expect(world.elevation[neighbour]).toBeGreaterThan(150);
			expect(world.elevation[neighbour]).toBeLessThan(200);
		}
	});

	it('softens a sharp peak further the stronger the dab', () => {
		const grid = getGrid(64);
		const peak = cellIndex(grid, 4, 30, 30);
		let previous = 4000;
		for (const strength of [0.1, 0.5, 2, 10]) {
			const world = createFlatWorld(64, 0);
			world.elevation[peak] = 4000;
			applyDab(world, {
				direction: cellCentre(grid, peak),
				radiusKm: 1500,
				strength,
				mode: 'smooth',
			});
			expect(world.elevation[peak]).toBeLessThan(previous);
			expect(world.elevation[peak]).toBeGreaterThan(0);
			previous = world.elevation[peak] as number;
		}
		expect(previous).toBeLessThan(400);
	});

	it('takes every mean of a pass from the terrain as that pass found it', () => {
		const grid = getGrid(64);
		// Across a cube edge, so cells of two faces read one another.
		const peak = cellIndex(grid, 0, 0, 32);
		const world = createFlatWorld(64, 0);
		world.elevation[peak] = 1000;
		const centre = cellCentre(grid, peak);
		const radiusKm = 2000;
		const radius = radiusKm / PLANET_RADIUS_KM;
		const amount = MAX_SMOOTH_PASS_AMOUNT;
		const { cells } = applyDab(world, {
			direction: centre,
			radiusKm,
			strength: amount,
			mode: 'smooth',
		});

		// The peak drops towards its neighbours' mean, and each neighbour
		// rises by the peak's share of its own mean: had it read the peak
		// after the peak was smoothed, it would have risen less.
		expect(world.elevation[peak]).toBeCloseTo(1000 * (1 - amount), 3);
		const around = neighbours(grid, peak);
		expect(sorted(cells)).toEqual([peak, ...around].sort((a, b) => a - b));
		for (const neighbour of around) {
			let total = 0;
			for (const other of neighbours(grid, neighbour)) {
				total += grid.areas[other] as number;
			}
			const weight = brushFalloff(
				angleBetween(centre, cellCentre(grid, neighbour)) / radius,
			);
			expect(world.elevation[neighbour]).toBeCloseTo(
				(weight * amount * 1000 * (grid.areas[peak] as number)) / total,
				3,
			);
		}
	});

	it('makes a dab of several passes as so many dabs of one pass', () => {
		const grid = getGrid(64);
		const peak = cellIndex(grid, 0, 0, 32);
		const centre = cellCentre(grid, peak);
		const options = {
			direction: centre,
			radiusKm: 2000,
			mode: 'smooth',
		} as const;
		const whole = createFlatWorld(64, 0);
		const parts = createFlatWorld(64, 0);
		whole.elevation[peak] = 1000;
		parts.elevation[peak] = 1000;

		const passes = 4;
		const { cells } = applyDab(whole, {
			...options,
			strength: passes * MAX_SMOOTH_PASS_AMOUNT,
		});
		for (let pass = 0; pass < passes; pass++) {
			applyDab(parts, { ...options, strength: MAX_SMOOTH_PASS_AMOUNT });
		}
		expect(whole.elevation).toEqual(parts.elevation);
		// Each pass carries the peak one cell farther out.
		expect(cells.length).toBe(1 + 2 * passes * (passes + 1));
	});

	it('smooths a hill alike in one dab or in ten of a tenth', () => {
		const direction = latLonToDirection(20, 10);
		const options = { direction, radiusKm: 2000, mode: 'smooth' } as const;
		// The two terrains differ by under 1% of the largest change the
		// smoothing made, whether the tenths are less than a pass or several:
		// measured, 0.72% at worst, for an amount of 0.3.
		for (const amount of [0.05, 0.3, 0.5, 1.5, 7.3]) {
			const start = createHillWorld(64, direction);
			const one = createHillWorld(64, direction);
			const ten = createHillWorld(64, direction);
			applyDab(one, { ...options, strength: amount });
			for (let dab = 0; dab < 10; dab++) {
				applyDab(ten, { ...options, strength: amount / 10 });
			}
			const done = farthestApart(start.elevation, one.elevation);
			expect(done).toBeGreaterThan(5);
			expect(farthestApart(one.elevation, ten.elevation)).toBeLessThan(
				0.01 * done,
			);
		}
	});

	it('does not change the area-weighted mean noticeably', () => {
		const random = createRandom(21);
		for (const resolution of [64, 128]) {
			const grid = getGrid(resolution);
			const world = createNoisyWorld(resolution, 500, 5);
			const start = Float32Array.from(world.elevation);
			const patch = new Set<number>();
			for (let dab = 0; dab < 20; dab++) {
				const { cells } = applyDab(world, {
					direction: dab % 2 === 0 ? CORNER : randomDirection(random),
					radiusKm: 2500,
					strength: 0.6,
					mode: 'smooth',
				});
				for (const cell of cells) {
					patch.add(cell);
				}
			}
			const before = weightedMoments(grid, start, patch);
			const after = weightedMoments(grid, world.elevation, patch);
			// Against noise of 500 m, the mean of what was smoothed moves
			// by well under a metre.
			expect(Math.abs(after.mean - before.mean)).toBeLessThan(1);
			expect(after.variance).toBeLessThan(before.variance);
			const whole = weightedMoments(grid, world.elevation, allCells(grid));
			const wholeStart = weightedMoments(grid, start, allCells(grid));
			expect(Math.abs(whole.mean - wholeStart.mean)).toBeLessThan(1);
		}
	});

	it('never moves a cell past the mean of its neighbours in a pass', () => {
		const grid = getGrid(64);
		const world = createNoisyWorld(64, 3000, 6);
		const start = Float32Array.from(world.elevation);
		const { cells } = applyDab(world, {
			direction: [0, 0, 1],
			radiusKm: 3000,
			strength: MAX_SMOOTH_PASS_AMOUNT,
			mode: 'smooth',
		});
		for (const cell of cells) {
			let total = 0;
			let area = 0;
			for (const neighbour of neighbours(grid, cell)) {
				total +=
					(grid.areas[neighbour] as number) * (start[neighbour] as number);
				area += grid.areas[neighbour] as number;
			}
			const mean = total / area;
			const old = start[cell] as number;
			const now = world.elevation[cell] as number;
			expect(now).toBeGreaterThanOrEqual(Math.min(old, mean) - 1e-3);
			expect(now).toBeLessThanOrEqual(Math.max(old, mean) + 1e-3);
		}
	});

	it('never overshoots at the most smoothing a dab accepts', () => {
		const grid = getGrid(64);
		const direction = latLonToDirection(-35, 140);
		const radiusKm = 1000;
		for (const [amplitude, seed] of [
			[3000, 11],
			// Noise that reaches both limits.
			[20_000, 12],
		] as const) {
			const world = createNoisyWorld(64, amplitude, seed);
			for (let cell = 0; cell < world.elevation.length; cell++) {
				world.elevation[cell] = Math.min(
					MAX_ELEVATION_M,
					Math.max(MIN_ELEVATION_M, world.elevation[cell] as number),
				);
			}
			const start = Float32Array.from(world.elevation);
			// Everything the dab can read: the cells under the brush and
			// their neighbours.
			let lowest = Number.POSITIVE_INFINITY;
			let highest = Number.NEGATIVE_INFINITY;
			const under = cellsWithin(grid, direction, radiusKm / PLANET_RADIUS_KM);
			for (const cell of under) {
				for (const read of [cell, ...neighbours(grid, cell)]) {
					lowest = Math.min(lowest, start[read] as number);
					highest = Math.max(highest, start[read] as number);
				}
			}
			const before = weightedMoments(grid, start, under);

			const { cells } = applyDab(world, {
				direction,
				radiusKm,
				strength: MAX_SMOOTH_AMOUNT,
				mode: 'smooth',
			});
			expect(cells.length).toBeGreaterThan(100);
			for (const cell of cells) {
				const now = world.elevation[cell] as number;
				expect(Number.isFinite(now)).toBe(true);
				expect(now).toBeGreaterThanOrEqual(lowest);
				expect(now).toBeLessThanOrEqual(highest);
				expect(now).toBeGreaterThanOrEqual(MIN_ELEVATION_M);
				expect(now).toBeLessThanOrEqual(MAX_ELEVATION_M);
			}
			expect(world.elevation.every(Number.isFinite)).toBe(true);
			const after = weightedMoments(grid, world.elevation, under);
			expect(after.variance).toBeLessThan(0.2 * before.variance);
		}
	});

	it('rejects more smoothing than a dab accepts, leaving the world alone', () => {
		expect(MAX_SMOOTH_AMOUNT).toBe(50);
		const world = createNoisyWorld(64, 3000, 13);
		const start = Float32Array.from(world.elevation);
		const options = {
			direction: latLonToDirection(50, -120),
			radiusKm: 3000,
			mode: 'smooth',
		} as const;
		for (const strength of [
			MAX_SMOOTH_AMOUNT * (1 + 1e-12),
			1e3,
			Number.MAX_VALUE,
		]) {
			expect(() => applyDab(world, { ...options, strength })).toThrow(
				RangeError,
			);
			expect(() => applyDab(world, { ...options, strength })).toThrow(
				/smoothing strength/,
			);
		}
		expect(world.elevation).toEqual(start);
		// The bound is on smoothing only: a raise of as much is metres.
		expect(() =>
			applyDab(world, { ...options, mode: 'raise', strength: 1e3 }),
		).not.toThrow();
	});
});

describe('applyDab: limits', () => {
	it('never raises a cell above the highest elevation', () => {
		const world = createFlatWorld(64, MAX_ELEVATION_M - 10);
		const grid = getGrid(64);
		const direction = cellCentre(grid, cellIndex(grid, 3, 10, 50));
		applyDab(world, {
			direction,
			radiusKm: 2000,
			strength: 100,
			mode: 'raise',
		});
		expect(world.elevation[cellAt(grid, direction)]).toBe(MAX_ELEVATION_M);
		for (const height of world.elevation) {
			expect(height).toBeLessThanOrEqual(MAX_ELEVATION_M);
			expect(height).toBeGreaterThanOrEqual(MAX_ELEVATION_M - 10);
		}
	});

	it('never lowers a cell below the lowest elevation', () => {
		const world = createFlatWorld(64, MIN_ELEVATION_M + 10);
		const grid = getGrid(64);
		const direction = cellCentre(grid, cellIndex(grid, 5, 3, 3));
		applyDab(world, {
			direction,
			radiusKm: 2000,
			strength: 1e9,
			mode: 'lower',
		});
		expect(world.elevation[cellAt(grid, direction)]).toBe(MIN_ELEVATION_M);
		for (const height of world.elevation) {
			expect(height).toBeGreaterThanOrEqual(MIN_ELEVATION_M);
		}
	});

	it('keeps every mode within the limits on terrain at both extremes', () => {
		const random = createRandom(31);
		const world = createBlankWorld(64);
		for (let cell = 0; cell < world.elevation.length; cell++) {
			world.elevation[cell] =
				random() < 0.5 ? MIN_ELEVATION_M : MAX_ELEVATION_M;
		}
		for (let dab = 0; dab < 60; dab++) {
			const mode = BRUSH_MODES[dab % BRUSH_MODES.length] as BrushMode;
			applyDab(world, {
				direction: randomDirection(random),
				radiusKm: 100 + 2900 * random(),
				strength: mode === 'smooth' ? 5 * random() : 20_000 * random(),
				mode,
			});
		}
		for (const height of world.elevation) {
			expect(Number.isFinite(height)).toBe(true);
			expect(height).toBeGreaterThanOrEqual(MIN_ELEVATION_M);
			expect(height).toBeLessThanOrEqual(MAX_ELEVATION_M);
		}
	});

	it('does not report a cell that was already at the limit', () => {
		const world = createFlatWorld(64, MAX_ELEVATION_M);
		const result = applyDab(world, {
			direction: CORNER,
			radiusKm: 1000,
			strength: 500,
			mode: 'raise',
		});
		expect(result.cells.length).toBe(0);
	});
});

describe('applyDab: what it reports', () => {
	const expectExact = (
		world: World,
		start: Float32Array,
		result: DabResult,
	): void => {
		const reported = sorted(result.cells);
		expect(new Set(reported).size).toBe(reported.length);
		expect(reported).toEqual(differingCells(start, world.elevation));
		expect(result.before.length).toBe(result.cells.length);
		for (let k = 0; k < result.cells.length; k++) {
			expect(result.before[k]).toBe(start[result.cells[k] as number]);
		}
	};

	it('lists exactly the cells that changed, with what they held', () => {
		const random = createRandom(41);
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const world = createNoisyWorld(resolution, 11_990, 7);
			for (const mode of BRUSH_MODES) {
				for (const direction of [
					CORNER,
					[0, 1, 1] as Vec3,
					randomDirection(random),
				]) {
					const start = Float32Array.from(world.elevation);
					const result = applyDab(world, {
						direction,
						radiusKm: 100 + 1900 * random(),
						// Strong enough that some cells reach a limit and
						// some stop there unchanged.
						strength: mode === 'smooth' ? 0.7 : 15,
						mode,
					});
					expect(result.cells.length).toBeGreaterThan(0);
					expectExact(world, start, result);
				}
			}
		}
	});

	it('leaves out cells under the brush that a limit kept from changing', () => {
		const world = createFlatWorld(64, 0);
		const grid = getGrid(64);
		const direction = latLonToDirection(45, 45);
		const lifted = applyDab(world, {
			direction,
			radiusKm: 1500,
			strength: 30_000,
			mode: 'raise',
		});
		const start = Float32Array.from(world.elevation);
		const again = applyDab(world, {
			direction,
			radiusKm: 1500,
			strength: 30_000,
			mode: 'raise',
		});
		expect(world.elevation[cellAt(grid, direction)]).toBe(MAX_ELEVATION_M);
		expect(again.cells.length).toBeGreaterThan(0);
		expect(again.cells.length).toBeLessThan(lifted.cells.length);
		expectExact(world, start, again);
	});

	it('gives arrays the caller may keep', () => {
		const world = createFlatWorld(64, 0);
		const options = {
			direction: CORNER,
			radiusKm: 500,
			strength: 10,
			mode: 'raise',
		} as const;
		const first = applyDab(world, options);
		const cells = Array.from(first.cells);
		const before = Array.from(first.before);
		applyDab(world, { ...options, direction: [-1, 0, 0] });
		applyDab(world, { ...options, mode: 'smooth', strength: 1 });
		expect(Array.from(first.cells)).toEqual(cells);
		expect(Array.from(first.before)).toEqual(before);
	});

	it('undoes a dab by writing back what the cells held', () => {
		const world = createNoisyWorld(64, 2000, 8);
		const start = Float32Array.from(world.elevation);
		const { cells, before } = applyDab(world, {
			direction: CORNER,
			radiusKm: 2000,
			strength: 0.9,
			mode: 'smooth',
		});
		for (let k = 0; k < cells.length; k++) {
			world.elevation[cells[k] as number] = before[k] as number;
		}
		expect(world.elevation).toEqual(start);
	});
});

describe('applyDab: a brush narrower than a cell', () => {
	it('always changes the cell under its centre', () => {
		const random = createRandom(51);
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const grid = getGrid(resolution);
			for (let trial = 0; trial < 300; trial++) {
				const world = createFlatWorld(resolution, 0);
				const direction = trial === 0 ? CORNER : randomDirection(random);
				const { cells } = applyDab(world, {
					direction,
					radiusKm: 1,
					strength: 100,
					mode: 'raise',
				});
				expect(Array.from(cells)).toContain(cellAt(grid, direction));
				// Cells shrink towards the cube's corners, where a cell width
				// reaches a few more of them.
				expect(cells.length).toBeLessThanOrEqual(8);
				expect(world.elevation[cellAt(grid, direction)]).toBeGreaterThan(10);
			}
		}
	});
});

describe('applyDab: what it rejects', () => {
	const valid = {
		direction: [1, 0, 0] as Vec3,
		radiusKm: 500,
		strength: 10,
		mode: 'raise' as BrushMode,
	};

	const expectRejected = (
		options: Partial<typeof valid>,
		world: World = createBlankWorld(64),
	): void => {
		const start = Float32Array.from(world.elevation);
		expect(() => applyDab(world, { ...valid, ...options })).toThrow(RangeError);
		expect(world.elevation).toEqual(start);
	};

	it('rejects a zero or non-finite direction', () => {
		expectRejected({ direction: [0, 0, 0] });
		expectRejected({ direction: [Number.NaN, 0, 1] });
		expectRejected({ direction: [0, Number.NEGATIVE_INFINITY, 1] });
	});

	it('rejects a radius that is not positive and finite', () => {
		for (const radiusKm of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expectRejected({ radiusKm });
		}
	});

	it('rejects a strength that is negative or not finite', () => {
		for (const strength of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expectRejected({ strength });
			expectRejected({ strength, mode: 'smooth' });
		}
	});

	it('accepts a smoothing amount up to the most a dab takes', () => {
		for (const strength of [0, 1e-12, 1, 1.0001, 37.5, MAX_SMOOTH_AMOUNT]) {
			expect(() =>
				applyDab(createBlankWorld(64), { ...valid, strength, mode: 'smooth' }),
			).not.toThrow();
		}
	});

	it('rejects a mode it does not know', () => {
		expectRejected({ mode: 'flatten' as BrushMode });
	});

	it('rejects a world whose elevation does not fit its resolution', () => {
		expectRejected({}, { ...createBlankWorld(64), resolution: 128 });
		expectRejected({}, { ...createBlankWorld(64), resolution: 100 as never });
	});
});

describe('strokePath', () => {
	const from = latLonToDirection(10, 20);
	const to = latLonToDirection(-25, 75);

	it('spaces dabs evenly along the great circle and ends at the end', () => {
		const total = angleBetween(from, to);
		const spacing = 0.05;
		const path = strokePath(from, to, spacing);
		const steps = Math.ceil(total / spacing);
		expect(path.length).toBe(steps);

		const axis = cross(from, to);
		let previous = from;
		for (const point of path) {
			expect(length(point)).toBeCloseTo(1, 12);
			expect(dot(point, axis)).toBeCloseTo(0, 12);
			expect(angleBetween(previous, point)).toBeCloseTo(total / steps, 12);
			previous = point;
		}
		expect(total / steps).toBeLessThanOrEqual(spacing);
		expect(total / steps).toBeGreaterThan(spacing / 2);
		expect(path.at(-1)).toEqual(to);
	});

	it('leaves out the start', () => {
		for (const point of strokePath(from, to, 0.01)) {
			expect(angleBetween(from, point)).toBeGreaterThan(0.005);
		}
	});

	it('travels the shorter way, steadily away from the start', () => {
		let previous = 0;
		for (const point of strokePath(from, to, 0.02)) {
			const travelled = angleBetween(from, point);
			expect(travelled).toBeGreaterThan(previous);
			previous = travelled;
		}
		expect(previous).toBeCloseTo(angleBetween(from, to), 12);
	});

	it('gives the end alone when it is within the spacing', () => {
		expect(strokePath(from, to, 2)).toEqual([to]);
		expect(strokePath(from, to, angleBetween(from, to) * 1.0001)).toEqual([to]);
		expect(strokePath(from, to, Number.POSITIVE_INFINITY)).toEqual([to]);
	});

	it('gives the end alone when the two positions coincide', () => {
		expect(strokePath(to, to, 0.01)).toEqual([to]);
		expect(strokePath(to, to, 1e-300)).toEqual([to]);
	});

	it('returns unit directions whatever the lengths given', () => {
		const path = strokePath([0, 0, 5], [3e10, 0, 0], 0.4);
		expect(path.length).toBe(4);
		expect(path.at(-1)).toEqual([1, 0, 0]);
		for (const point of path) {
			expect(length(point)).toBeCloseTo(1, 12);
		}
	});

	it('picks one of the ways round between opposite positions', () => {
		for (const start of [from, [1, 0, 0], [0, 1, 0], [0, 0, -1]] as Vec3[]) {
			const end: Vec3 = [-start[0], -start[1], -start[2]];
			const path = strokePath(start, end, 0.5);
			expect(path.length).toBe(7);
			let previous = start;
			for (const point of path) {
				expect(point.every(Number.isFinite)).toBe(true);
				expect(length(point)).toBeCloseTo(1, 12);
				expect(angleBetween(previous, point)).toBeCloseTo(Math.PI / 7, 9);
				previous = point;
			}
			expect(angleBetween(path.at(-1) as Vec3, end)).toBe(0);
			expect(strokePath(start, end, 0.5)).toEqual(path);
		}
	});

	it('stays finite for separations too small to give a direction', () => {
		for (const gap of [1e-7, 1e-10, 1e-13, 1e-16, 5e-324]) {
			const near: Vec3 = [1, gap, 0];
			const path = strokePath([1, 0, 0], near, Math.max(gap / 4, 5e-324));
			expect(path.length).toBeGreaterThanOrEqual(1);
			for (const point of path) {
				expect(point.every(Number.isFinite)).toBe(true);
				expect(length(point)).toBeCloseTo(1, 12);
				expect(angleBetween([1, 0, 0], point)).toBeLessThanOrEqual(gap * 1.01);
			}
			expect(angleBetween(path.at(-1) as Vec3, near)).toBe(0);
		}
	});

	it('rejects a spacing that is not positive', () => {
		for (const spacing of [0, -0.1, Number.NaN]) {
			expect(() => strokePath(from, to, spacing)).toThrow(RangeError);
		}
	});

	it('rejects a spacing too small to step along the arc', () => {
		for (const spacing of [1e-9, 1e-300, 5e-324]) {
			expect(() => strokePath(from, to, spacing)).toThrow(RangeError);
		}
	});

	it('takes as many steps as the cap and no more', () => {
		const quarter = Math.PI / 2;
		const most = strokePath(
			[1, 0, 0],
			[0, 1, 0],
			(quarter / MAX_STROKE_STEPS) * 1.000001,
		);
		expect(most.length).toBe(MAX_STROKE_STEPS);
		expect(most.at(-1)).toEqual([0, 1, 0]);
		expect(() =>
			strokePath([1, 0, 0], [0, 1, 0], quarter / (MAX_STROKE_STEPS + 1)),
		).toThrow(RangeError);
	});

	it('rejects a zero or non-finite position', () => {
		expect(() => strokePath([0, 0, 0], to, 0.1)).toThrow(RangeError);
		expect(() => strokePath(from, [Number.NaN, 0, 0], 0.1)).toThrow(RangeError);
	});
});
