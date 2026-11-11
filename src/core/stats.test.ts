import { describe, expect, it } from 'vitest';
import {
	cellArea,
	cellIndex,
	cellsWithin,
	type Grid,
	getGrid,
	latLonToDirection,
	SUPPORTED_RESOLUTIONS,
	type Vec3,
} from './grid';
import { computeTerrainStats, type TerrainStats } from './stats';
import {
	BLANK_OCEAN_ELEVATION_M,
	createBlankWorld,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	normaliseSeaLevel,
	PLANET_RADIUS_KM,
	PLANET_SURFACE_AREA_KM2,
	type World,
} from './world';

/**
 * The host's structured clone, which is how statistics leave a worker. It is
 * not part of the ES2022 library the core is type-checked against.
 */
declare const structuredClone: <T>(value: T) => T;

const KM2_PER_STERADIAN = PLANET_RADIUS_KM ** 2;

/** Decimal places to which an area in km² must match the planet's surface. */
const AREA_DIGITS = 2;

const FIELDS = [
	'deepestM',
	'highestM',
	'landAreaKm2',
	'landFraction',
	'meanLandHeightM',
	'meanOceanDepthM',
	'seaAreaKm2',
];

const expectAllFinite = (stats: TerrainStats): void => {
	expect(Object.keys(stats).sort()).toEqual(FIELDS);
	for (const [field, value] of Object.entries(stats)) {
		expect(Number.isFinite(value), field).toBe(true);
	}
};

/** Sets every cell whose centre lies on the `axis` side of the globe. */
const raiseHemisphere = (world: World, axis: Vec3, elevation: number): void => {
	const { centres, cellCount } = getGrid(world.resolution);
	for (let cell = 0; cell < cellCount; cell++) {
		const along =
			(centres[3 * cell] as number) * axis[0] +
			(centres[3 * cell + 1] as number) * axis[1] +
			(centres[3 * cell + 2] as number) * axis[2];
		if (along > 0) {
			world.elevation[cell] = elevation;
		}
	}
};

/**
 * The share of the sphere taken by one row of cells running right round the
 * equator: the row just north of it on each of the four equatorial faces,
 * which all have the same areas. Face 2 has `j` increasing northwards.
 */
const equatorRowFraction = (grid: Grid): number => {
	let row = 0;
	for (let i = 0; i < grid.n; i++) {
		row += cellArea(grid, cellIndex(grid, 2, i, grid.n / 2));
	}
	return (4 * row) / (4 * Math.PI);
};

/** The single-precision value one step above a single-precision value. */
const nextFloat32Up = (value: number): number => {
	const float = Float32Array.of(value);
	const bits = new Uint32Array(float.buffer);
	// Stepping the bit pattern moves away from zero, so a negative value
	// steps down to move up.
	bits[0] = (bits[0] as number) + (value < 0 ? -1 : 1);
	return float[0] as number;
};

const sumAreas = (grid: Grid, cells: Int32Array): number => {
	let total = 0;
	for (const cell of cells) {
		total += cellArea(grid, cell);
	}
	return total;
};

describe.each(SUPPORTED_RESOLUTIONS)(
	'terrain statistics at %i cells per face edge',
	(n) => {
		const grid = getGrid(n);
		/**
		 * One of the smallest cells of a face, in the middle of an edge, and
		 * one of the largest, in the middle of the face.
		 */
		const smallCell = cellIndex(grid, 0, 0, n / 2);
		const largeCell = cellIndex(grid, 0, n / 2, n / 2);

		it('finds a blank world all ocean, 4,000 m deep', () => {
			const stats = computeTerrainStats(createBlankWorld(n));
			expectAllFinite(stats);
			expect(stats.landFraction).toBe(0);
			expect(stats.landAreaKm2).toBe(0);
			expect(stats.seaAreaKm2).toBeCloseTo(
				PLANET_SURFACE_AREA_KM2,
				AREA_DIGITS,
			);
			expect(stats.meanLandHeightM).toBe(0);
			expect(stats.meanOceanDepthM).toBeCloseTo(4_000, 6);
			expect(stats.highestM).toBe(BLANK_OCEAN_ELEVATION_M);
			expect(stats.deepestM).toBe(BLANK_OCEAN_ELEVATION_M);
		});

		it.each<[string, Vec3]>([
			['north', [0, 0, 1]],
			['south', [0, 0, -1]],
			['one facing longitude 0', [1, 0, 0]],
			['one facing longitude 90 east', [0, 1, 0]],
			['one centred on a cube corner', [1, 1, 1]],
			['one centred on a cube edge', [1, -1, 0]],
			['a tilted one', [1, 2, 3]],
			['another tilted one', [-0.7, 0.2, -0.4]],
		])(
			'finds half the world land when the %s hemisphere is raised',
			(_name, axis) => {
				const world = createBlankWorld(n);
				raiseHemisphere(world, axis, 1_000);
				const stats = computeTerrainStats(world);
				expectAllFinite(stats);
				const tolerance = equatorRowFraction(grid);
				expect(tolerance).toBeLessThan(0.02);
				expect(Math.abs(stats.landFraction - 0.5)).toBeLessThan(tolerance);
				expect(
					Math.abs(stats.landAreaKm2 - PLANET_SURFACE_AREA_KM2 / 2),
				).toBeLessThan(tolerance * PLANET_SURFACE_AREA_KM2);
				expect(stats.meanLandHeightM).toBeCloseTo(1_000, 6);
				expect(stats.meanOceanDepthM).toBeCloseTo(4_000, 6);
				expect(stats.highestM).toBe(1_000);
				expect(stats.deepestM).toBe(BLANK_OCEAN_ELEVATION_M);
			},
		);

		it('turns a plateau from land to sea as the sea rises over it', () => {
			const world = createBlankWorld(n);
			const plateau = cellsWithin(grid, latLonToDirection(30, 45), 0.3);
			for (const cell of plateau) {
				world.elevation[cell] = 500;
			}
			const plateauArea = sumAreas(grid, plateau);
			const plateauFraction = plateauArea / (4 * Math.PI);
			expect(plateauFraction).toBeGreaterThan(0.01);

			const dry = computeTerrainStats(world);
			expect(dry.landFraction).toBeCloseTo(plateauFraction, 12);
			expect(dry.landAreaKm2).toBeCloseTo(
				plateauArea * KM2_PER_STERADIAN,
				AREA_DIGITS,
			);
			expect(dry.meanLandHeightM).toBeCloseTo(500, 6);
			expect(dry.meanOceanDepthM).toBeCloseTo(4_000, 6);

			world.seaLevel = 200;
			const lapped = computeTerrainStats(world);
			expect(lapped.landFraction).toBe(dry.landFraction);
			expect(lapped.meanLandHeightM).toBeCloseTo(300, 6);
			expect(lapped.meanOceanDepthM).toBeCloseTo(4_200, 6);

			// Land is strictly above the sea: level with it is already sea.
			world.seaLevel = 500;
			const awash = computeTerrainStats(world);
			expect(awash.landFraction).toBe(0);
			expect(awash.landAreaKm2).toBe(0);

			world.seaLevel = 600;
			const drowned = computeTerrainStats(world);
			expectAllFinite(drowned);
			expect(drowned.landFraction).toBe(0);
			expect(drowned.landAreaKm2).toBe(0);
			expect(drowned.seaAreaKm2).toBeCloseTo(
				PLANET_SURFACE_AREA_KM2,
				AREA_DIGITS,
			);
			expect(drowned.meanLandHeightM).toBe(0);
			expect(drowned.meanOceanDepthM).toBeCloseTo(
				plateauFraction * 100 + (1 - plateauFraction) * 4_600,
				6,
			);
		});

		it('measures the highest and deepest cells against the datum', () => {
			const world = createBlankWorld(n);
			world.elevation[smallCell] = 8_848;
			world.elevation[largeCell] = -10_994;
			for (const seaLevel of [0, -5_000, 9_000]) {
				world.seaLevel = seaLevel;
				const stats = computeTerrainStats(world);
				expect(stats.highestM).toBe(8_848);
				expect(stats.deepestM).toBe(-10_994);
			}
		});

		it('finds an all-land world with no sea', () => {
			const world = createBlankWorld(n);
			world.elevation.fill(1_000);
			const stats = computeTerrainStats(world);
			expectAllFinite(stats);
			expect(stats.landFraction).toBe(1);
			expect(stats.landAreaKm2).toBeCloseTo(
				PLANET_SURFACE_AREA_KM2,
				AREA_DIGITS,
			);
			expect(stats.seaAreaKm2).toBe(0);
			expect(stats.meanLandHeightM).toBeCloseTo(1_000, 6);
			expect(stats.meanOceanDepthM).toBe(0);
		});

		it('splits Earth’s surface area between land and sea', () => {
			const world = createBlankWorld(n);
			raiseHemisphere(world, [3, -1, 2], 250);
			for (const cell of cellsWithin(grid, [-3, 1, -2], 0.5)) {
				world.elevation[cell] = 2_000;
			}
			const stats = computeTerrainStats(world);
			expect(stats.landAreaKm2).toBeGreaterThan(0);
			expect(stats.seaAreaKm2).toBeGreaterThan(0);
			const total = stats.landAreaKm2 + stats.seaAreaKm2;
			expect(total).toBeCloseTo(PLANET_SURFACE_AREA_KM2, AREA_DIGITS);
			expect(total / 1e6).toBeCloseTo(510.1, 1);
			expect(stats.landFraction).toBeCloseTo(stats.landAreaKm2 / total, 12);
		});

		it('weights the mean land height by cell area', () => {
			const small = cellArea(grid, smallCell);
			const large = cellArea(grid, largeCell);
			expect(large / small).toBeGreaterThan(1.3);

			const world = createBlankWorld(n);
			world.elevation[smallCell] = 9_000;
			world.elevation[largeCell] = 1_000;
			const stats = computeTerrainStats(world);

			const weighted = (small * 9_000 + large * 1_000) / (small + large);
			const unweighted = (9_000 + 1_000) / 2;
			expect(unweighted - weighted).toBeGreaterThan(500);
			expect(stats.meanLandHeightM).toBeCloseTo(weighted, 6);
			expect(stats.landFraction).toBeCloseTo(
				(small + large) / (4 * Math.PI),
				12,
			);
		});

		it('weights the mean ocean depth by cell area', () => {
			const small = cellArea(grid, smallCell);
			const large = cellArea(grid, largeCell);

			const world = createBlankWorld(n);
			world.elevation.fill(100);
			world.elevation[smallCell] = -9_000;
			world.elevation[largeCell] = -1_000;
			world.seaLevel = -500;
			const stats = computeTerrainStats(world);

			const weighted = (small * 8_500 + large * 500) / (small + large);
			const unweighted = (8_500 + 500) / 2;
			expect(unweighted - weighted).toBeGreaterThan(500);
			expect(stats.meanOceanDepthM).toBeCloseTo(weighted, 6);
			expect(stats.meanLandHeightM).toBeCloseTo(600, 6);
		});

		it('leaves the world as it was', () => {
			const world = createBlankWorld(n);
			raiseHemisphere(world, [0, 0, 1], 1_000);
			const before = structuredClone(world);
			computeTerrainStats(world);
			expect(world).toEqual(before);
		});
	},
);

describe('terrain statistics', () => {
	it('returns plain data that survives a structured clone', () => {
		const world = createBlankWorld();
		raiseHemisphere(world, [0, 0, 1], 1_000);
		const stats = computeTerrainStats(world);
		expect(structuredClone(stats)).toEqual(stats);
		expect(Object.getPrototypeOf(stats)).toBe(Object.prototype);
	});

	it('rejects an elevation array of the wrong length', () => {
		const world: World = {
			...createBlankWorld(64),
			elevation: createBlankWorld(128).elevation,
		};
		expect(() => computeTerrainStats(world)).toThrow(RangeError);
		expect(() => computeTerrainStats(world)).toThrow(/24576 cells/);
	});

	it('rejects a resolution that is not supported', () => {
		const world = { ...createBlankWorld(), resolution: 100 } as unknown;
		expect(() => computeTerrainStats(world as World)).toThrow(RangeError);
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
		'rejects an elevation of %d rather than report NaN',
		(value) => {
			const world = createBlankWorld();
			world.elevation[1_000] = value;
			expect(() => computeTerrainStats(world)).toThrow(RangeError);
		},
	);

	it.each([
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		1e308,
		-1e308,
		MAX_ELEVATION_M + 0.001,
		MIN_ELEVATION_M - 0.001,
	])('rejects a sea level of %d, outside the elevation limits', (seaLevel) => {
		const world = createBlankWorld();
		world.seaLevel = seaLevel;
		expect(() => computeTerrainStats(world)).toThrow(RangeError);
		expect(() => computeTerrainStats(world)).toThrow(
			/sea level must be from -12000 to 12000 metres/,
		);
	});

	it('names the elevations, not the sea level, when a cell is not finite', () => {
		const world = createBlankWorld();
		world.elevation[1_000] = Number.NaN;
		expect(() => computeTerrainStats(world)).toThrow(/finite elevations/);
		expect(() => computeTerrainStats(world)).not.toThrow(/sea level/);
	});

	it('accepts a sea level at either elevation limit', () => {
		const world = createBlankWorld();
		world.seaLevel = MAX_ELEVATION_M;
		const flooded = computeTerrainStats(world);
		expectAllFinite(flooded);
		expect(flooded.landFraction).toBe(0);
		expect(flooded.meanOceanDepthM).toBeCloseTo(16_000, 6);

		world.seaLevel = MIN_ELEVATION_M;
		const drained = computeTerrainStats(world);
		expectAllFinite(drained);
		expect(drained.landFraction).toBe(1);
		expect(drained.meanLandHeightM).toBeCloseTo(8_000, 6);
	});
});

describe.each(SUPPORTED_RESOLUTIONS)(
	'a sea level between single-precision values at %i cells per face edge',
	(n) => {
		/**
		 * Sea levels that single precision cannot hold. The first four round
		 * upwards, so a cell set to one of them stores a value above it.
		 */
		const LEVELS = [0.1, 0.3, -1_000.3, 11_999.9, 0.7, -0.2, 2_500.7];

		it.each(LEVELS)(
			'finds a world level with a sea of %d m all sea',
			(value) => {
				expect(Math.fround(value)).not.toBe(value);
				for (const seaLevel of [value, normaliseSeaLevel(value)]) {
					const world = createBlankWorld(n);
					world.seaLevel = seaLevel;
					world.elevation.fill(seaLevel);
					const stats = computeTerrainStats(world);
					expectAllFinite(stats);
					expect(stats.landFraction).toBe(0);
					expect(stats.landAreaKm2).toBe(0);
					expect(stats.meanLandHeightM).toBe(0);
					expect(stats.meanOceanDepthM).toBe(0);
				}
			},
		);

		it.each(LEVELS)(
			'finds a cell one step above a sea of %d m land',
			(value) => {
				const grid = getGrid(n);
				const cell = cellIndex(grid, 3, n / 4, n / 2);
				for (const seaLevel of [value, normaliseSeaLevel(value)]) {
					const world = createBlankWorld(n);
					world.seaLevel = seaLevel;
					world.elevation.fill(seaLevel);
					const above = nextFloat32Up(world.elevation[cell] as number);
					world.elevation[cell] = above;
					expect(world.elevation[cell]).toBe(above);

					const stats = computeTerrainStats(world);
					expect(stats.landFraction).toBeCloseTo(
						cellArea(grid, cell) / (4 * Math.PI),
						12,
					);
					expect(stats.meanLandHeightM).toBe(above - Math.fround(seaLevel));
					expect(stats.meanLandHeightM).toBeGreaterThan(0);
					expect(stats.meanOceanDepthM).toBe(0);
				}
			},
		);
	},
);
