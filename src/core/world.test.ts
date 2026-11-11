import { describe, expect, it } from 'vitest';
import { DEFAULT_RESOLUTION, getGrid, SUPPORTED_RESOLUTIONS } from './grid';
import { DEFAULT_PLANET } from './planet';
import {
	BLANK_OCEAN_ELEVATION_M,
	clampElevation,
	clampElevations,
	createBlankWorld,
	DEFAULT_SEA_LEVEL_M,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	normaliseSeaLevel,
	PLANET_RADIUS_KM,
	PLANET_SURFACE_AREA_KM2,
} from './world';

/**
 * The host's structured clone, which is how a world reaches a worker. It is
 * not part of the ES2022 library the core is type-checked against.
 */
declare const structuredClone: <T>(value: T) => T;

describe('constants', () => {
	it('keeps elevation within 12 km of the datum', () => {
		expect(MIN_ELEVATION_M).toBe(-12_000);
		expect(MAX_ELEVATION_M).toBe(12_000);
	});

	it('starts a blank ocean 4,000 m below a sea level of zero', () => {
		expect(DEFAULT_SEA_LEVEL_M).toBe(0);
		expect(BLANK_OCEAN_ELEVATION_M).toBe(-4_000);
		expect(BLANK_OCEAN_ELEVATION_M).toBeGreaterThanOrEqual(MIN_ELEVATION_M);
	});

	it('gives the planet Earth’s radius and surface area', () => {
		expect(PLANET_RADIUS_KM).toBe(6371);
		expect(PLANET_SURFACE_AREA_KM2).toBeCloseTo(
			4 * Math.PI * PLANET_RADIUS_KM ** 2,
			3,
		);
		expect(PLANET_SURFACE_AREA_KM2 / 1e6).toBeCloseTo(510.1, 1);
	});
});

describe('createBlankWorld', () => {
	it('uses the default resolution when none is chosen', () => {
		expect(createBlankWorld().resolution).toBe(DEFAULT_RESOLUTION);
	});

	it.each(SUPPORTED_RESOLUTIONS)(
		'fills a world of %i cells per face edge with a uniform ocean',
		(n) => {
			const world = createBlankWorld(n);
			expect(world.resolution).toBe(n);
			expect(world.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
			expect(world.origin).toEqual({ kind: 'blank' });
			expect(world.elevation).toBeInstanceOf(Float32Array);
			expect(world.elevation.length).toBe(getGrid(n).cellCount);
			expect(
				world.elevation.every((value) => value === BLANK_OCEAN_ELEVATION_M),
			).toBe(true);
		},
	);

	it('starts with Earth’s planet settings at year zero', () => {
		for (const n of SUPPORTED_RESOLUTIONS) {
			const world = createBlankWorld(n);
			expect(world.planet).toEqual(DEFAULT_PLANET);
			expect(world.ageYears).toBe(0);
		}
	});

	it('gives every world planet settings of its own', () => {
		const first = createBlankWorld();
		const second = createBlankWorld();
		expect(first.planet).not.toBe(second.planet);
		expect(first.planet).not.toBe(DEFAULT_PLANET);
	});

	it('gives every world an elevation array of its own', () => {
		const first = createBlankWorld();
		const second = createBlankWorld();
		first.elevation[0] = 100;
		expect(second.elevation[0]).toBe(BLANK_OCEAN_ELEVATION_M);
	});

	it.each([0, 32, 100, 64.5, -64, Number.NaN])(
		'rejects the unsupported resolution %d',
		(n) => {
			expect(() => createBlankWorld(n)).toThrow(RangeError);
		},
	);

	it('is plain data that survives a structured clone', () => {
		const world = createBlankWorld();
		world.seaLevel = 25;
		world.elevation[7] = 1234;
		world.planet = { ...world.planet, axialTiltDeg: 45 };
		world.ageYears = 12_000;
		const copy = structuredClone(world);
		expect(copy).toEqual(world);
		expect(copy.elevation).not.toBe(world.elevation);
		expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
	});
});

describe('clampElevation', () => {
	it.each([-12_000, -4_000, -0.5, 0, 8_848, 12_000])(
		'leaves %d m, within the limits, unchanged',
		(value) => {
			expect(clampElevation(value)).toBe(value);
		},
	);

	it.each([
		[12_000.5, MAX_ELEVATION_M],
		[1e9, MAX_ELEVATION_M],
		[Number.POSITIVE_INFINITY, MAX_ELEVATION_M],
		[-12_000.5, MIN_ELEVATION_M],
		[-1e9, MIN_ELEVATION_M],
		[Number.NEGATIVE_INFINITY, MIN_ELEVATION_M],
	])('clamps %d m to %d m', (value, expected) => {
		expect(clampElevation(value)).toBe(expected);
	});

	it('rejects NaN', () => {
		expect(() => clampElevation(Number.NaN)).toThrow(RangeError);
	});
});

describe('clampElevations', () => {
	it('clamps the values outside the limits in place', () => {
		const elevation = Float32Array.of(
			-20_000,
			-12_000,
			-4_000,
			0,
			12_000,
			20_000,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		);
		clampElevations(elevation);
		expect(Array.from(elevation)).toEqual([
			MIN_ELEVATION_M,
			MIN_ELEVATION_M,
			-4_000,
			0,
			MAX_ELEVATION_M,
			MAX_ELEVATION_M,
			MAX_ELEVATION_M,
			MIN_ELEVATION_M,
		]);
	});

	it('leaves a blank world as it is', () => {
		const world = createBlankWorld();
		clampElevations(world.elevation);
		expect(
			world.elevation.every((value) => value === BLANK_OCEAN_ELEVATION_M),
		).toBe(true);
	});

	it('rejects NaN, naming the cell that holds it', () => {
		const elevation = Float32Array.of(0, 20_000, Number.NaN, -20_000);
		expect(() => clampElevations(elevation)).toThrow(RangeError);
		expect(() => clampElevations(elevation)).toThrow(/cell 2 /);
	});
});

describe('normaliseSeaLevel', () => {
	it.each([
		-12_000,
		-4_000,
		-0.5,
		0,
		Math.fround(0.1),
		Math.fround(-1_000.3),
		8_848,
		12_000,
	])(
		'leaves %d m, a single-precision value within the limits, unchanged',
		(value) => {
			expect(normaliseSeaLevel(value)).toBe(value);
		},
	);

	it.each([0.1, 0.3, 0.7, -0.2, -1_000.3, 2_500.7, 11_999.9])(
		'rounds %d m to the nearest single-precision value',
		(value) => {
			const level = normaliseSeaLevel(value);
			expect(level).not.toBe(value);
			expect(Math.fround(level)).toBe(level);
			expect(level).toBe(Math.fround(value));
			expect(Float32Array.of(level)[0]).toBe(level);
		},
	);

	it.each([
		[12_000.5, MAX_ELEVATION_M],
		[1e308, MAX_ELEVATION_M],
		[Number.POSITIVE_INFINITY, MAX_ELEVATION_M],
		[-12_000.5, MIN_ELEVATION_M],
		[-1e308, MIN_ELEVATION_M],
		[Number.NEGATIVE_INFINITY, MIN_ELEVATION_M],
	])('clamps %d m to %d m', (value, expected) => {
		expect(normaliseSeaLevel(value)).toBe(expected);
	});

	it('rejects NaN', () => {
		expect(() => normaliseSeaLevel(Number.NaN)).toThrow(RangeError);
	});

	it('agrees with the default sea level of a new world', () => {
		const world = createBlankWorld();
		expect(normaliseSeaLevel(world.seaLevel)).toBe(world.seaLevel);
	});
});
