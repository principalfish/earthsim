/**
 * Worlds with noise-shaped continents, as a base to sculpt.
 *
 * A continent field is sampled at the centre of every cell: fractal noise
 * over the sphere, read at a position displaced by a second, smoother noise
 * so that coasts wander instead of following the round contours of the
 * noise. The cells with the highest values, up to the requested share of
 * the surface by area, are land. A cell's height then follows from how far
 * its value lies above or below the coast.
 *
 * The fields depend only on the seed and on the direction of the cell's
 * centre, never on the grid, so a seed shows the same continents at every
 * resolution and nothing marks the cube's edges. The terrain is shaped by
 * noise alone: it looks like a planet, and has no geology behind it.
 */

import {
	DEFAULT_RESOLUTION,
	getGrid,
	isSupportedResolution,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import {
	deriveSeed,
	fractalNoise3,
	isSeed,
	MAX_SEED,
	ridgedNoise3,
} from './noise';
import { DEFAULT_AGE_YEARS, DEFAULT_PLANET } from './planet';
import {
	DEFAULT_SEA_LEVEL_M,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	type World,
} from './world';

/** What {@link generateWorld} builds a world from. */
export type GenerateWorldOptions = {
	/**
	 * Cells along a face edge; one of {@link SUPPORTED_RESOLUTIONS}.
	 * Defaults to {@link DEFAULT_RESOLUTION}.
	 */
	readonly resolution?: number;
	/**
	 * Selects the continents: an integer from 0 to {@link MAX_SEED}. See
	 * {@link randomSeed}.
	 */
	readonly seed: number;
	/** Share of the surface to make land, by area, from 0 to 1. */
	readonly landFraction: number;
};

/**
 * The least height of generated land and the least depth of generated sea,
 * in metres.
 *
 * @remarks
 * Keeps every cell clear of the sea level, so that no height rounds to it
 * in single precision and a cell chosen as land always counts as land.
 */
export const MIN_GENERATED_RELIEF_M = 1;

/** Area of the unit sphere, in steradians. */
const SPHERE_AREA_SR = 4 * Math.PI;

/**
 * Frequency of the continent field's first octave, in cycles per planet
 * radius: its largest shapes are a little under a radius across.
 */
const CONTINENT_FREQUENCY = 1.2;

/**
 * Octaves of the continent field. The finest has features about 1.5° across,
 * the width of a cell at the lowest resolution: a finer octave would only
 * scatter cells along the coast there, differently at each resolution.
 */
const CONTINENT_OCTAVES = 6;

/**
 * Amplitude of each octave of the continent field against the one before.
 * Above a half, so that coasts are ragged and shed islands.
 */
const CONTINENT_GAIN = 0.6;

/** Frequency of the displacement field's first octave, per planet radius. */
const WARP_FREQUENCY = 1.6;

/** Octaves of the displacement field. */
const WARP_OCTAVES = 2;

/**
 * How far the displacement field moves a sample, in planet radii, where it
 * is at its extreme. Much more than this smears the coasts into streaks.
 */
const WARP_STRENGTH = 0.35;

/** Frequency of the field that places mountain ranges, per planet radius. */
const RANGE_FREQUENCY = 1.8;

/** Octaves of the field that places mountain ranges. */
const RANGE_OCTAVES = 2;

/** The value of the range field at which mountains start to grow taller. */
const RANGE_ONSET = -0.05;

/** The value of the range field at which mountains reach their full height. */
const RANGE_FULL = 0.25;

/**
 * The share of the mountains' height that is present everywhere, as hills,
 * even far from any range.
 */
const HILL_SHARE = 0.15;

/** Frequency of the ridges within a mountain range, per planet radius. */
const RIDGE_FREQUENCY = 3;

/** Octaves of the ridges within a mountain range. */
const RIDGE_OCTAVES = 4;

/** Frequency of the ocean floor's relief, per planet radius. */
const FLOOR_FREQUENCY = 3;

/** Octaves of the ocean floor's relief. */
const FLOOR_OCTAVES = 3;

/**
 * The quantile of the land's values, by number of cells, whose excess over
 * the coast is one unit of inlandness: a tenth of the land cells lie
 * farther inland than 1.
 */
const LAND_SCALE_QUANTILE = 0.9;

/**
 * The quantile of the sea's values, by number of cells, whose deficit below
 * the coast is one unit of offshoreness: half of the sea cells lie farther
 * offshore than 1.
 */
const SEA_SCALE_QUANTILE = 0.5;

/** Height gained per unit of inlandness by the coastal plains, in metres. */
const PLAIN_RISE_M = 150;

/**
 * Height gained by the uplands at an inlandness of 1, in metres; it grows
 * with the square of inlandness.
 */
const UPLAND_RISE_M = 350;

/** The inlandness beyond which the uplands stop rising. */
const UPLAND_LIMIT = 2;

/**
 * Height of a ridge crest above its surroundings where mountains are at
 * their fullest, in metres. Few cells come near it: height falls with the
 * cube of the distance from the crest.
 */
const MOUNTAIN_HEIGHT_M = 6_000;

/** The inlandness at which mountains reach their full height. */
const MOUNTAIN_INLAND = 0.4;

/** Depth of the outer edge of the continental shelf, in metres. */
const SHELF_DEPTH_M = 200;

/** The offshoreness of the outer edge of the continental shelf. */
const SHELF_EDGE = 0.14;

/** The offshoreness at which the continental slope meets the ocean floor. */
const SLOPE_END = 0.5;

/** Typical depth of the ocean floor, in metres. */
const FLOOR_DEPTH_M = 4_000;

/**
 * Rise or fall of the ocean floor where its relief is at its extreme, in
 * metres; most of the floor stays within a third of it.
 */
const FLOOR_RELIEF_M = 1_500;

/** Streams of the seed, one per independent field. */
const CONTINENT_STREAM = 1;
const WARP_X_STREAM = 2;
const WARP_Y_STREAM = 3;
const WARP_Z_STREAM = 4;
const RANGE_STREAM = 5;
const RIDGE_STREAM = 6;
const FLOOR_STREAM = 7;

/** A smooth step from 0 at `from` to 1 at `to`, flat outside them. */
const smoothStep = (from: number, to: number, value: number): number => {
	const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
	return t * t * (3 - 2 * t);
};

/**
 * Cell indices in ascending order of their value in a field, cells with
 * equal values in index order.
 *
 * @remarks
 * Each cell is packed with its value into one number, the value in the high
 * bits, so that the numeric sort built into typed arrays can be used; a sort
 * of indices through a comparison callback is several times slower. Values
 * are told apart down to about one part in a billion of the field's range.
 *
 * @param values - The field, one finite value per cell; at most 2²⁰ cells.
 */
const orderByValue = (values: Float64Array): Uint32Array => {
	const count = values.length;
	let lowest = Number.POSITIVE_INFINITY;
	let highest = Number.NEGATIVE_INFINITY;
	for (let cell = 0; cell < count; cell++) {
		const value = values[cell] as number;
		if (value < lowest) {
			lowest = value;
		}
		if (value > highest) {
			highest = value;
		}
	}
	// 2³² steps of value times 2²⁰ of index stays within the 2⁵³ integers a
	// double holds exactly. A field of one value needs no steps.
	const steps = 0xffff_ffff / (highest - lowest || 1);
	const keys = new Float64Array(count);
	for (let cell = 0; cell < count; cell++) {
		const step = Math.floor(((values[cell] as number) - lowest) * steps);
		keys[cell] = step * 0x10_0000 + cell;
	}
	keys.sort();
	const order = new Uint32Array(count);
	for (let rank = 0; rank < count; rank++) {
		order[rank] = (keys[rank] as number) % 0x10_0000;
	}
	return order;
};

/**
 * The height of a land cell, in metres above the sea.
 *
 * @param inland - How far the cell's value lies above the coast, in units
 * of the land's spread; 0 at the coast.
 * @param range - Value of the field that places mountain ranges, -1 to 1.
 * @param crest - How near the cell is to a ridge crest, 0 to 1.
 */
const landHeightM = (inland: number, range: number, crest: number): number => {
	const upland = Math.min(inland, UPLAND_LIMIT);
	const base = PLAIN_RISE_M * inland + UPLAND_RISE_M * upland * upland;
	const mountains =
		MOUNTAIN_HEIGHT_M *
		smoothStep(0, MOUNTAIN_INLAND, inland) *
		(HILL_SHARE +
			(1 - HILL_SHARE) * smoothStep(RANGE_ONSET, RANGE_FULL, range)) *
		crest *
		crest *
		crest;
	return Math.min(
		MAX_ELEVATION_M,
		Math.max(MIN_GENERATED_RELIEF_M, base + mountains),
	);
};

/**
 * The depth of a sea cell, in metres below the sea surface, as a positive
 * number.
 *
 * @param offshore - How far the cell's value lies below the coast, in units
 * of the sea's spread; 0 at the coast.
 * @param relief - The ocean floor's relief at the cell, -1 to 1.
 */
const seaDepthM = (offshore: number, relief: number): number => {
	const shelf = SHELF_DEPTH_M * Math.min(1, offshore / SHELF_EDGE);
	const descent = smoothStep(SHELF_EDGE, SLOPE_END, offshore);
	const floor = FLOOR_DEPTH_M - FLOOR_RELIEF_M * relief;
	return Math.min(
		-MIN_ELEVATION_M,
		Math.max(MIN_GENERATED_RELIEF_M, shelf + descent * (floor - shelf)),
	);
};

/**
 * A seed chosen at random, for a world nobody has seen before.
 *
 * @remarks
 * The one function of the core whose result is not determined by its
 * arguments, unless a source is passed in.
 *
 * @param random - Source of numbers from 0 (inclusive) to 1 (exclusive);
 * `Math.random` by default.
 * @returns An integer from 0 to {@link MAX_SEED}, evenly spread over them
 * if the source is even. A source that strays outside its range still
 * gives a valid seed.
 */
export const randomSeed = (random: () => number = Math.random): number =>
	Math.floor(random() * (MAX_SEED + 1)) >>> 0;

/**
 * A new world of noise-shaped continents, with the default sea level.
 *
 * @remarks
 * The same options always give the same world. The seed alone decides where
 * the continents lie, so a seed gives the same continents at every
 * resolution; the land fraction decides how much of them stands above the
 * sea, so raising it grows the same continents rather than moving them.
 *
 * Cells are ranked by the value of the continent field at their centre, and
 * the highest ranked are land: as many as bring the land's area nearest to
 * the request. A cell is therefore land exactly when its value is above a
 * threshold, the area-weighted quantile of the field. Cells whose values
 * are equal to within a billionth of the field's range, which only happens
 * by coincidence, are ranked by index.
 *
 * Heights follow from how far a cell's value lies from the threshold,
 * measured against the spread of the land's or the sea's values so that the
 * profile is alike at any land fraction. Land rises from the coast across
 * plains to uplands, and carries ridged mountain ranges inland, where a
 * separate field places them; most land is below 1,500 m and the highest
 * peaks reach about 4,500 to 7,000 m. The sea deepens across a shallow shelf
 * to about 200 m, falls down a slope, and levels out on a floor around
 * 4,000 m deep with gentle relief. Every land cell is at least
 * {@link MIN_GENERATED_RELIEF_M} above the sea level and every sea cell at
 * least as far below it, so the land fraction of the result differs from
 * the request by no more than half the share of one cell.
 *
 * Takes time in proportion to the number of cells: about half a second at
 * the highest resolution.
 *
 * @param options - The resolution, the seed and the land fraction.
 * @returns A world with an elevation array of its own, whose origin records
 * the seed and the land fraction, with Earth's planet settings and a date
 * of year zero.
 * @throws RangeError if the resolution is not a supported resolution, if
 * the seed is not an integer from 0 to {@link MAX_SEED}, or if the land
 * fraction is not a number from 0 to 1.
 */
export const generateWorld = (options: GenerateWorldOptions): World => {
	const { resolution = DEFAULT_RESOLUTION, seed, landFraction } = options;
	if (!isSupportedResolution(resolution)) {
		throw new RangeError(
			`Unsupported world resolution ${resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	if (!isSeed(seed)) {
		throw new RangeError(
			`A seed must be an integer from 0 to ${MAX_SEED}; got ${seed}`,
		);
	}
	if (
		typeof landFraction !== 'number' ||
		!(landFraction >= 0 && landFraction <= 1)
	) {
		throw new RangeError(
			`A land fraction must be a number from 0 to 1; got ${landFraction}`,
		);
	}
	const { cellCount, centres, areas } = getGrid(resolution);

	const continentSeed = deriveSeed(seed, CONTINENT_STREAM);
	const warpXSeed = deriveSeed(seed, WARP_X_STREAM);
	const warpYSeed = deriveSeed(seed, WARP_Y_STREAM);
	const warpZSeed = deriveSeed(seed, WARP_Z_STREAM);
	const rangeSeed = deriveSeed(seed, RANGE_STREAM);
	const ridgeSeed = deriveSeed(seed, RIDGE_STREAM);
	const floorSeed = deriveSeed(seed, FLOOR_STREAM);

	const values = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		const x = centres[3 * cell] as number;
		const y = centres[3 * cell + 1] as number;
		const z = centres[3 * cell + 2] as number;
		const wx = x * WARP_FREQUENCY;
		const wy = y * WARP_FREQUENCY;
		const wz = z * WARP_FREQUENCY;
		const dx = fractalNoise3(warpXSeed, wx, wy, wz, WARP_OCTAVES);
		const dy = fractalNoise3(warpYSeed, wx, wy, wz, WARP_OCTAVES);
		const dz = fractalNoise3(warpZSeed, wx, wy, wz, WARP_OCTAVES);
		values[cell] = fractalNoise3(
			continentSeed,
			(x + WARP_STRENGTH * dx) * CONTINENT_FREQUENCY,
			(y + WARP_STRENGTH * dy) * CONTINENT_FREQUENCY,
			(z + WARP_STRENGTH * dz) * CONTINENT_FREQUENCY,
			CONTINENT_OCTAVES,
			CONTINENT_GAIN,
		);
	}

	// Cells are taken into the sea from the lowest value up, each one while
	// its middle still lies within the sea's share of the area.
	const order = orderByValue(values);
	const seaTarget = (1 - landFraction) * SPHERE_AREA_SR;
	let seaCount = 0;
	let seaArea = 0;
	while (seaCount < cellCount) {
		const area = areas[order[seaCount] as number] as number;
		if (seaArea + area / 2 > seaTarget) {
			break;
		}
		seaArea += area;
		seaCount++;
	}
	const landCount = cellCount - seaCount;

	// With no sea the coast is the lowest land, and with no land the highest
	// sea, so that the profile still starts from a coast. A side with no
	// cells, or with too few to spread out from the coast, gets no scale.
	const valueAt = (rank: number): number =>
		values[order[rank] as number] as number;
	const coast = valueAt(Math.min(cellCount - 1, Math.max(0, seaCount - 1)));
	const landSpread =
		valueAt(
			cellCount -
				1 -
				Math.floor((1 - LAND_SCALE_QUANTILE) * Math.max(0, landCount - 1)),
		) - coast;
	const seaSpread =
		coast -
		valueAt(Math.floor((1 - SEA_SCALE_QUANTILE) * Math.max(0, seaCount - 1)));
	const landScale = landSpread > 0 ? 1 / landSpread : 0;
	const seaScale = seaSpread > 0 ? 1 / seaSpread : 0;

	const elevation = new Float32Array(cellCount);
	for (let rank = 0; rank < cellCount; rank++) {
		const cell = order[rank] as number;
		const x = centres[3 * cell] as number;
		const y = centres[3 * cell + 1] as number;
		const z = centres[3 * cell + 2] as number;
		const value = values[cell] as number;
		if (rank < seaCount) {
			const relief = fractalNoise3(
				floorSeed,
				x * FLOOR_FREQUENCY,
				y * FLOOR_FREQUENCY,
				z * FLOOR_FREQUENCY,
				FLOOR_OCTAVES,
			);
			elevation[cell] =
				DEFAULT_SEA_LEVEL_M - seaDepthM((coast - value) * seaScale, relief);
		} else {
			const range = fractalNoise3(
				rangeSeed,
				x * RANGE_FREQUENCY,
				y * RANGE_FREQUENCY,
				z * RANGE_FREQUENCY,
				RANGE_OCTAVES,
			);
			const crest = ridgedNoise3(
				ridgeSeed,
				x * RIDGE_FREQUENCY,
				y * RIDGE_FREQUENCY,
				z * RIDGE_FREQUENCY,
				RIDGE_OCTAVES,
			);
			elevation[cell] =
				DEFAULT_SEA_LEVEL_M +
				landHeightM((value - coast) * landScale, range, crest);
		}
	}

	return {
		resolution,
		seaLevel: DEFAULT_SEA_LEVEL_M,
		origin: { kind: 'generated', seed, landFraction },
		planet: { ...DEFAULT_PLANET },
		ageYears: DEFAULT_AGE_YEARS,
		elevation,
	};
};
