import { describe, expect, it } from 'vitest';
import { generateWorld, MIN_GENERATED_RELIEF_M, randomSeed } from './generate';
import {
	cellAt,
	DEFAULT_RESOLUTION,
	getGrid,
	latLonToDirection,
	NEIGHBOUR_COUNT,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import { isSeed, MAX_SEED } from './noise';
import { DEFAULT_PLANET } from './planet';
import { computeTerrainStats } from './stats';
import {
	DEFAULT_SEA_LEVEL_M,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	type World,
} from './world';

/**
 * The host's structured clone, which is how a world reaches a worker. It is
 * not part of the ES2022 library the core is type-checked against.
 */
declare const structuredClone: <T>(value: T) => T;

const SEED = 20_261_110;

/**
 * The world of {@link SEED} at 64 cells per face edge and 30% land, as
 * recorded from this implementation: how many cells are land, a checksum of
 * which ones, and the elevation of a few cells in metres.
 */
const PINNED_LAND_CELLS = 7245;
const PINNED_LAND_CHECKSUM = 1_052_710_000;
const PINNED_ELEVATIONS: readonly (readonly [cell: number, height: number])[] =
	[
		[0, -3468.504],
		[2080, -1.102],
		[5000, 185.796],
		[8000, 86.723],
		[14500, -3940.012],
		[20000, 2709.492],
		[24575, -2494.611],
	];

/** Seeds for the tests that look at more than one world. */
const SEEDS = [1, 2, 3, 4, 5, 6];

const STANDARD_WORLDS = new Map<number, World>();

/**
 * The world of {@link SEED} with 30% land at a resolution, generated once
 * and shared between the tests that only read it.
 */
const standardWorld = (resolution: number): World => {
	let world = STANDARD_WORLDS.get(resolution);
	if (world === undefined) {
		world = generateWorld({ resolution, seed: SEED, landFraction: 0.3 });
		STANDARD_WORLDS.set(resolution, world);
	}
	return world;
};

const isLand = (world: World, cell: number): boolean =>
	(world.elevation[cell] as number) > world.seaLevel;

const landCells = (world: World): number => {
	let count = 0;
	for (let cell = 0; cell < world.elevation.length; cell++) {
		if (isLand(world, cell)) {
			count++;
		}
	}
	return count;
};

/** The share of a grid's surface taken by its largest cell. */
const largestCellShare = (resolution: number): number => {
	const { areas } = getGrid(resolution);
	return areas.reduce((a, b) => Math.max(a, b)) / (4 * Math.PI);
};

/** A 32-bit FNV-1a hash of which cells are land. */
const landChecksum = (world: World): number => {
	let hash = 0x811c_9dc5;
	for (let cell = 0; cell < world.elevation.length; cell++) {
		hash = Math.imul(hash ^ (isLand(world, cell) ? 1 : 0), 0x0100_0193);
	}
	return hash >>> 0;
};

/** The middle value of a list; the list is sorted in place. */
const median = (values: number[]): number => {
	values.sort((a, b) => a - b);
	return values[values.length >> 1] as number;
};

/**
 * The sizes of a world's land masses, largest first: groups of land cells
 * joined edge to edge, in cells.
 */
const landMasses = (world: World): number[] => {
	const { cellCount, neighbours } = getGrid(world.resolution);
	const seen = new Uint8Array(cellCount);
	const sizes: number[] = [];
	for (let start = 0; start < cellCount; start++) {
		if (seen[start] === 1 || !isLand(world, start)) {
			continue;
		}
		let size = 0;
		const pending = [start];
		seen[start] = 1;
		for (let cell = pending.pop(); cell !== undefined; cell = pending.pop()) {
			size++;
			for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
				const neighbour = neighbours[NEIGHBOUR_COUNT * cell + side] as number;
				if (seen[neighbour] === 0 && isLand(world, neighbour)) {
					seen[neighbour] = 1;
					pending.push(neighbour);
				}
			}
		}
		sizes.push(size);
	}
	return sizes.sort((a, b) => b - a);
};

describe('generateWorld', () => {
	it('gives the same world for the same seed, resolution and land fraction', () => {
		const options = { resolution: 64, seed: SEED, landFraction: 0.3 };
		const first = generateWorld(options);
		const second = generateWorld(options);
		expect(second.elevation).toEqual(first.elevation);
		expect(second.elevation).not.toBe(first.elevation);
		expect(second).toEqual(first);
	});

	it('gives different worlds for different seeds', () => {
		const first = generateWorld({ seed: 1, landFraction: 0.3 });
		const second = generateWorld({ seed: 2, landFraction: 0.3 });
		let different = 0;
		for (let cell = 0; cell < first.elevation.length; cell++) {
			if (isLand(first, cell) !== isLand(second, cell)) {
				different++;
			}
		}
		// Two unrelated worlds of 30% land disagree over 42% of the surface.
		expect(different / first.elevation.length).toBeGreaterThan(0.25);
	});

	it('records its origin and starts at the default sea level', () => {
		const world = generateWorld({
			resolution: 128,
			seed: SEED,
			landFraction: 0.25,
		});
		expect(world.resolution).toBe(128);
		expect(world.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
		expect(world.origin).toEqual({
			kind: 'generated',
			seed: SEED,
			landFraction: 0.25,
		});
		expect(world.elevation).toBeInstanceOf(Float32Array);
		expect(world.elevation.length).toBe(getGrid(128).cellCount);
	});

	it('starts with Earth’s planet settings, its own copy, at year zero', () => {
		const world = generateWorld({ seed: SEED, landFraction: 0.3 });
		expect(world.planet).toEqual(DEFAULT_PLANET);
		expect(world.planet).not.toBe(DEFAULT_PLANET);
		expect(world.ageYears).toBe(0);
	});

	it('uses the default resolution when none is chosen', () => {
		const world = generateWorld({ seed: SEED, landFraction: 0.3 });
		expect(world.resolution).toBe(DEFAULT_RESOLUTION);
		expect(world.elevation.length).toBe(getGrid(DEFAULT_RESOLUTION).cellCount);
	});

	it('is plain data that survives a structured clone', () => {
		const world = standardWorld(64);
		expect(structuredClone(world)).toEqual(world);
	});

	it.each([0.1, 0.3, 0.5, 0.9])(
		'makes %d of the surface land, to within a cell',
		(landFraction) => {
			const world = generateWorld({ seed: SEED, landFraction });
			const stats = computeTerrainStats(world);
			expect(Math.abs(stats.landFraction - landFraction)).toBeLessThan(0.01);
			// The split falls on a cell boundary, at most half a cell from the
			// request.
			expect(Math.abs(stats.landFraction - landFraction)).toBeLessThanOrEqual(
				largestCellShare(world.resolution) / 2,
			);
		},
	);

	it.each(SUPPORTED_RESOLUTIONS)(
		'meets the land fraction and the elevation limits at %i cells per face edge',
		(resolution) => {
			const world = standardWorld(resolution);
			const stats = computeTerrainStats(world);
			expect(Math.abs(stats.landFraction - 0.3)).toBeLessThanOrEqual(
				largestCellShare(resolution) / 2,
			);
			expect(world.elevation.every(Number.isFinite)).toBe(true);
			expect(stats.highestM).toBeLessThanOrEqual(MAX_ELEVATION_M);
			expect(stats.deepestM).toBeGreaterThanOrEqual(MIN_ELEVATION_M);
		},
	);

	it('makes no land at a land fraction of 0', () => {
		const world = generateWorld({ seed: SEED, landFraction: 0 });
		expect(world.elevation.every((height) => height < 0)).toBe(true);
		expect(computeTerrainStats(world).landFraction).toBe(0);
		expect(world.origin).toEqual({
			kind: 'generated',
			seed: SEED,
			landFraction: 0,
		});
	});

	it('makes no sea at a land fraction of 1', () => {
		const world = generateWorld({ seed: SEED, landFraction: 1 });
		expect(world.elevation.every((height) => height > 0)).toBe(true);
		expect(computeTerrainStats(world).landFraction).toBe(1);
	});

	it.each([0, 0.001, 0.05, 0.3, 0.95, 0.999, 1])(
		'keeps every elevation finite, within the limits and clear of the sea level at a land fraction of %d',
		(landFraction) => {
			const { elevation } = generateWorld({ seed: SEED, landFraction });
			let lowest = Number.POSITIVE_INFINITY;
			let highest = Number.NEGATIVE_INFINITY;
			let nearest = Number.POSITIVE_INFINITY;
			for (let cell = 0; cell < elevation.length; cell++) {
				const height = elevation[cell] as number;
				lowest = Math.min(lowest, height);
				highest = Math.max(highest, height);
				nearest = Math.min(nearest, Math.abs(height));
			}
			expect(elevation.every(Number.isFinite)).toBe(true);
			expect(lowest).toBeGreaterThanOrEqual(MIN_ELEVATION_M);
			expect(highest).toBeLessThanOrEqual(MAX_ELEVATION_M);
			expect(nearest).toBeGreaterThanOrEqual(MIN_GENERATED_RELIEF_M);
		},
	);

	it('grows the same continents as the land fraction rises', () => {
		const small = generateWorld({ seed: SEED, landFraction: 0.1 });
		const large = generateWorld({ seed: SEED, landFraction: 0.4 });
		let drowned = 0;
		for (let cell = 0; cell < small.elevation.length; cell++) {
			if (isLand(small, cell) && !isLand(large, cell)) {
				drowned++;
			}
		}
		expect(drowned).toBe(0);
		expect(landCells(large)).toBeGreaterThan(3 * landCells(small));
	});

	it.each([1, 2])(
		'agrees on land and sea between 64 and 128 cells per face edge for seed %i',
		(seed) => {
			const coarse = generateWorld({ resolution: 64, seed, landFraction: 0.3 });
			const fine = generateWorld({ resolution: 128, seed, landFraction: 0.3 });
			// Cell (i, j) of the coarse grid covers the four fine cells
			// (2i, 2j) to (2i + 1, 2j + 1) of the same face.
			let agreeing = 0;
			for (let face = 0; face < 6; face++) {
				for (let j = 0; j < 128; j++) {
					for (let i = 0; i < 128; i++) {
						const child = (face * 128 + j) * 128 + i;
						const parent = (face * 64 + (j >> 1)) * 64 + (i >> 1);
						if (isLand(fine, child) === isLand(coarse, parent)) {
							agreeing++;
						}
					}
				}
			}
			// Measured at 97.4% and 97.1%: the rest are fine cells on a coast
			// that runs through their parent.
			expect(agreeing / fine.elevation.length).toBeGreaterThan(0.95);
		},
	);

	it('puts the same land at the same places at every resolution', () => {
		const worlds = SUPPORTED_RESOLUTIONS.map(standardWorld);
		let agreeing = 0;
		let places = 0;
		for (let latitude = -85; latitude <= 85; latitude += 10) {
			for (let longitude = -175; longitude <= 175; longitude += 10) {
				const direction = latLonToDirection(latitude, longitude);
				const land = worlds.map((world) =>
					isLand(world, cellAt(getGrid(world.resolution), direction)),
				);
				places++;
				if (land[0] === land[1] && land[1] === land[2]) {
					agreeing++;
				}
			}
		}
		// Measured at 95% of the 648 places: the rest lie on a coast, within
		// a coarse cell of the sea.
		expect(agreeing / places).toBeGreaterThan(0.9);
	});

	it('is as continuous across cube edges as within faces', () => {
		const resolution = 64;
		const { cellCount, neighbours } = getGrid(resolution);
		const cellsPerFace = resolution * resolution;
		const across = { largest: 0, sum: 0, count: 0 };
		const within = { largest: 0, sum: 0, count: 0 };
		for (const seed of SEEDS) {
			const { elevation } = generateWorld({
				resolution,
				seed,
				landFraction: 0.3,
			});
			for (let cell = 0; cell < cellCount; cell++) {
				for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
					const neighbour = neighbours[NEIGHBOUR_COUNT * cell + side] as number;
					if (neighbour < cell) {
						continue;
					}
					const sameFace =
						Math.floor(cell / cellsPerFace) ===
						Math.floor(neighbour / cellsPerFace);
					const steps = sameFace ? within : across;
					const step = Math.abs(
						(elevation[cell] as number) - (elevation[neighbour] as number),
					);
					steps.largest = Math.max(steps.largest, step);
					steps.sum += step;
					steps.count++;
				}
			}
		}
		expect(across.count).toBe(SEEDS.length * 12 * resolution);
		expect(across.largest).toBeLessThanOrEqual(within.largest);
		// Cells that meet at a cube edge are no farther apart than cells
		// within a face, so the terrain steps no more between them. The two
		// means were measured within 1% of each other; a field that broke at
		// the edges would step by a kilometre or more there, four times the
		// mean within faces. The margin covers the scatter of the 768 pairs
		// that each world has across edges.
		expect(across.sum / across.count).toBeLessThan(
			1.2 * (within.sum / within.count),
		);
	});

	it.each(SEEDS)(
		'shapes seed %i into a few continents with islands, not speckle or one mass',
		(seed) => {
			const world = generateWorld({ seed, landFraction: 0.3 });
			const land = landCells(world);
			const masses = landMasses(world);
			const sizeable = masses.filter((size) => size >= 0.02 * land);
			// Measured over these seeds: 5 to 9 sizeable masses, the largest
			// holding 27% to 52% of the land, and 67 to 93 masses in all.
			expect(sizeable.length).toBeGreaterThanOrEqual(3);
			expect(sizeable.length).toBeLessThanOrEqual(12);
			expect(masses[0] as number).toBeLessThan(0.75 * land);
			expect(masses.length).toBeGreaterThan(20);
			expect(masses.length).toBeLessThan(250);
		},
	);

	it('rises from low coasts to mountains and deepens from shelves to an ocean floor', () => {
		const world = standardWorld(64);
		const { cellCount, neighbours, areas } = getGrid(world.resolution);
		const coastalLand: number[] = [];
		const inlandLand: number[] = [];
		const coastalSea: number[] = [];
		const openSea: number[] = [];
		let landArea = 0;
		let lowLandArea = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const height = world.elevation[cell] as number;
			let landNeighbours = 0;
			for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
				if (
					isLand(world, neighbours[NEIGHBOUR_COUNT * cell + side] as number)
				) {
					landNeighbours++;
				}
			}
			if (isLand(world, cell)) {
				landArea += areas[cell] as number;
				if (height < 1500) {
					lowLandArea += areas[cell] as number;
				}
				(landNeighbours < NEIGHBOUR_COUNT ? coastalLand : inlandLand).push(
					height,
				);
			} else {
				(landNeighbours > 0 ? coastalSea : openSea).push(height);
			}
		}
		const stats = computeTerrainStats(world);
		// Measured for this seed and for others: coastal land at a median of
		// 50 to 90 m against 460 to 580 m inland, 86% to 93% of the land
		// below 1,500 m, and peaks of 4,600 to 6,800 m.
		expect(median(coastalLand)).toBeLessThan(200);
		expect(median(inlandLand)).toBeGreaterThan(300);
		expect(lowLandArea / landArea).toBeGreaterThan(0.75);
		expect(stats.highestM).toBeGreaterThan(3000);
		expect(stats.highestM).toBeLessThan(9000);
		expect(stats.meanLandHeightM).toBeGreaterThan(300);
		expect(stats.meanLandHeightM).toBeLessThan(1000);
		// Sea beside land at a median of 200 to 350 m deep, open sea at
		// 3,930 to 3,960 m, and nowhere below 4,850 m.
		expect(median(coastalSea)).toBeGreaterThan(-600);
		expect(median(openSea)).toBeLessThan(-3700);
		expect(median(openSea)).toBeGreaterThan(-4300);
		expect(stats.deepestM).toBeGreaterThan(-6000);
	});

	it('is pinned for one seed', () => {
		const world = standardWorld(64);
		// A change here means every seed now gives a different world.
		expect(landCells(world)).toBe(PINNED_LAND_CELLS);
		expect(landChecksum(world)).toBe(PINNED_LAND_CHECKSUM);
		for (const [cell, height] of PINNED_ELEVATIONS) {
			expect(world.elevation[cell]).toBeCloseTo(height, 1);
		}
	});

	it.each([-1, 0.5, MAX_SEED + 1, Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects the seed %d',
		(seed) => {
			expect(() => generateWorld({ seed, landFraction: 0.3 })).toThrow(
				RangeError,
			);
			expect(() => generateWorld({ seed, landFraction: 0.3 })).toThrow(/seed/);
		},
	);

	it.each([0, MAX_SEED])('accepts the seed %d', (seed) => {
		const world = generateWorld({ seed, landFraction: 0.3 });
		expect(world.origin).toEqual({
			kind: 'generated',
			seed,
			landFraction: 0.3,
		});
	});

	it.each([
		-0.01,
		1.01,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	])('rejects the land fraction %d', (landFraction) => {
		expect(() => generateWorld({ seed: SEED, landFraction })).toThrow(
			RangeError,
		);
		expect(() => generateWorld({ seed: SEED, landFraction })).toThrow(
			/land fraction/,
		);
	});

	it.each([
		['null', null],
		['true', true],
		['a numeric string', '0.5'],
		['an empty array', []],
		['undefined', undefined],
	])('rejects %s as a land fraction', (_name, value) => {
		// Values a type-unchecked caller could pass: each would otherwise be
		// coerced by the range comparison and stored in the origin as it is.
		const landFraction = value as unknown as number;
		expect(() => generateWorld({ seed: SEED, landFraction })).toThrow(
			/land fraction/,
		);
	});

	it.each([0, 32, 100, 64.5, -64, Number.NaN])(
		'rejects the unsupported resolution %d',
		(resolution) => {
			expect(() =>
				generateWorld({ resolution, seed: SEED, landFraction: 0.3 }),
			).toThrow(RangeError);
			expect(() =>
				generateWorld({ resolution, seed: SEED, landFraction: 0.3 }),
			).toThrow(/resolution/);
		},
	);
});

describe('randomSeed', () => {
	it('returns a seed', () => {
		for (let draw = 0; draw < 100; draw++) {
			expect(isSeed(randomSeed())).toBe(true);
		}
	});

	it('draws from the source it is given, over the whole range of seeds', () => {
		expect(randomSeed(() => 0)).toBe(0);
		expect(randomSeed(() => 0.5)).toBe(2 ** 31);
		expect(randomSeed(() => 0.25)).toBe(2 ** 30);
		expect(randomSeed(() => 1 - Number.EPSILON / 2)).toBe(MAX_SEED);
	});

	it.each([1, -0.25, 7.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'still returns a seed when the source strays to %d',
		(value) => {
			expect(isSeed(randomSeed(() => value))).toBe(true);
		},
	);

	it('seeds a world', () => {
		const seed = randomSeed(() => 0.123);
		const world = generateWorld({ seed, landFraction: 0.3 });
		expect(world.origin).toEqual({
			kind: 'generated',
			seed,
			landFraction: 0.3,
		});
	});
});
