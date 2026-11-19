/**
 * The sea's heat carried by the currents in the temperature solve: what the
 * `currents` option does to a warm patch of sea, and what it refuses.
 */

import { describe, expect, it } from 'vitest';
import { readEarthDataFile } from '../../../scripts/earth/dataFile.mjs';
import { decodeEarth, earthWorld } from '../earth/earth';
import { cornerIndex, edgeFlowsFromCorners } from '../grid/corners';
import { directionToLatLon, getGrid, NEIGHBOUR_COUNT } from '../grid/grid';
import { MONTHS_PER_YEAR } from '../planet/insolation';
import { generateWorld } from '../world/generate';
import { createBlankWorld, PLANET_RADIUS_KM, type World } from '../world/world';
import {
	landCrossing,
	solveTemperature,
	TEMPERATURE_MODEL,
	type TemperatureResult,
	type TemperatureState,
} from './temperature';

/** Allows for coverage instrumentation, which makes the solves slower. */
const SOLVE_TIMEOUT_MS = 120_000;

const N = 64;
const grid = getGrid(N);
const { cellCount, areas, centres } = grid;

/** The default model solved to 0.05 K: quicker than the default. */
const COARSE = { ...TEMPERATURE_MODEL, solverToleranceK: 0.05 };

/** A planet all sea, with its axis upright: no seasons, and no coast. */
const OCEAN: World = (() => {
	const world = createBlankWorld(N);
	return { ...world, planet: { ...world.planet, axialTiltDeg: 0 } };
})();

const places = Array.from({ length: cellCount }, (_, cell) =>
	directionToLatLon([
		centres[3 * cell] as number,
		centres[3 * cell + 1] as number,
		centres[3 * cell + 2] as number,
	]),
);
const latitudes = Float64Array.from(places, (place) => place.latitudeDeg);
const longitudes = Float64Array.from(places, (place) => place.longitudeDeg);

/**
 * The flows of an eastward current of `speed` m/s between 15°S and 15°N,
 * and none beyond: the streamfunction `−u y` held level outside the band,
 * at each corner the mean of the cells' that meet there.
 */
const eastwardBand = (speed: number): Float64Array => {
	const { cornerCount, cellCorners } = cornerIndex(grid);
	const sums = new Float64Array(cornerCount);
	const counts = new Float64Array(cornerCount);
	const radiusM = PLANET_RADIUS_KM * 1000;
	for (let cell = 0; cell < cellCount; cell++) {
		const latitude = Math.max(-15, Math.min(15, latitudes[cell] as number));
		const value = -speed * radiusM * ((latitude * Math.PI) / 180);
		for (let k = 0; k < NEIGHBOUR_COUNT; k++) {
			const corner = cellCorners[NEIGHBOUR_COUNT * cell + k] as number;
			sums[corner] = (sums[corner] as number) + value;
			counts[corner] = (counts[corner] as number) + 1;
		}
	}
	return edgeFlowsFromCorners(
		grid,
		sums.map((sum, corner) => sum / (counts[corner] as number)),
	);
};

/** The settled climate of the ocean planet, with no currents. */
const settled = (() => {
	let result: TemperatureResult | undefined;
	return (): TemperatureResult => {
		result ??= solveTemperature(OCEAN, { model: COARSE });
		return result;
	};
})();

/** A state with its sea 5 K warmer within 8° of 0°N 0°E. */
const withWarmPatch = (state: TemperatureState): TemperatureState => {
	const warmed = (values: Float64Array): Float64Array =>
		values.map((value, cell) =>
			Math.hypot(latitudes[cell] as number, longitudes[cell] as number) < 8
				? value + 5
				: value,
		);
	return {
		...state,
		seaTemperatureK: warmed(state.seaTemperatureK),
		seaPreviousK: warmed(state.seaPreviousK),
	};
};

/**
 * Where a January's warmth above the mean of its latitude lies, within 8°
 * of the equator: the longitude of the weighted mean of its direction.
 */
const warmthLongitude = (january: Float32Array): number => {
	let east = 0;
	let north = 0;
	let mean = 0;
	let area = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		if (Math.abs(latitudes[cell] as number) < 8) {
			mean += (areas[cell] as number) * (january[cell] as number);
			area += areas[cell] as number;
		}
	}
	mean /= area;
	for (let cell = 0; cell < cellCount; cell++) {
		if (Math.abs(latitudes[cell] as number) < 8) {
			const warmth = Math.max(0, (january[cell] as number) - mean);
			const longitude = ((longitudes[cell] as number) * Math.PI) / 180;
			east += (areas[cell] as number) * warmth * Math.cos(longitude);
			north += (areas[cell] as number) * warmth * Math.sin(longitude);
		}
	}
	return (Math.atan2(north, east) * 180) / Math.PI;
};

/** The area-weighted mean of a field over the sphere. */
const meanOf = (field: Float32Array): number => {
	let sum = 0;
	let area = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		sum += (areas[cell] as number) * (field[cell] as number);
		area += areas[cell] as number;
	}
	return sum / area;
};

/** A weighted sum of fields, leaving out the sea's NaN over land. */
const digest = (fields: readonly ArrayLike<number>[]): number => {
	let total = 0;
	fields.forEach((field, index) => {
		for (let cell = 0; cell < field.length; cell++) {
			const value = field[cell] as number;
			if (Number.isFinite(value)) {
				total += value * (1 + ((cell * 7 + index) % 101));
			}
		}
	});
	return total;
};

describe('solveTemperature with currents', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	it('solves a world with sea, given no currents, as the model without them does', () => {
		// Fixed values recorded from the model without currents, at the sea's
		// diffusivity it had then, 0.55: two years of a generated world from
		// nothing.
		const world = generateWorld({ resolution: N, seed: 3, landFraction: 0.3 });
		const result = solveTemperature(world, {
			maxYears: 2,
			model: { ...TEMPERATURE_MODEL, diffusivity: 0.55 },
		});
		expect([
			digest(result.months),
			digest(result.seaMonths),
			digest([result.state.temperatureK, result.state.seaTemperatureK]),
			result.yearsRun,
			result.finalChangeK,
		]).toEqual([
			234491187.80595624, 181003957.61456892, 731225274.8318698, 2,
			2.4953165404634206,
		]);
	});

	it('carries a warm patch of sea east along an eastward current, as far as the current goes, and keeps its heat', () => {
		const flows = eastwardBand(0.5);
		const start = {
			state: withWarmPatch(settled().state),
			solvedFor: settled().solvedFor,
		};
		const year = { model: COARSE, start, maxYears: 1 };
		const carried = solveTemperature(OCEAN, {
			...year,
			currents: {
				flows: Array.from({ length: MONTHS_PER_YEAR }, () => flows),
				depthM: 60,
			},
		});
		const still = solveTemperature(OCEAN, year);
		const january = (result: TemperatureResult): Float32Array =>
			result.seaMonths[0] as Float32Array;
		// Left still, the patch stays where it was. Carried, the water at
		// 0.5 m/s moves 670 km, 6°, by the middle of January; the patch's
		// warmth fades on the way, so its January mean lies a little short.
		expect(Math.abs(warmthLongitude(january(still)))).toBeLessThan(0.5);
		const moved = warmthLongitude(january(carried));
		expect(moved).toBeGreaterThan(4);
		expect(moved).toBeLessThan(6.5);
		// The heat is moved, not made or lost: the sea's mean is the same.
		expect(
			Math.abs(meanOf(january(carried)) - meanOf(january(still))),
		).toBeLessThan(1e-4);
	});

	it('refuses currents that are not twelve months of finite flows of the grid solved on, that cross a coast, or that have no depth', () => {
		const earth = earthWorld(decodeEarth(readEarthDataFile()), N);
		const none = new Float64Array(NEIGHBOUR_COUNT * cellCount);
		const twelve = (field: Float64Array) =>
			Array.from({ length: MONTHS_PER_YEAR }, () => field);
		const nan = Float64Array.from(none);
		nan[5] = Number.NaN;
		const across = Float64Array.from(none);
		across[landCrossingAt(earth)] = 1;
		const bad: [World, { flows: Float64Array[]; depthM: number }][] = [
			[OCEAN, { flows: 'x' as never, depthM: 200 }],
			[OCEAN, { flows: twelve(none).slice(1), depthM: 200 }],
			[OCEAN, { flows: twelve(new Float64Array(7)), depthM: 200 }],
			[OCEAN, { flows: twelve(nan), depthM: 200 }],
			[OCEAN, { flows: twelve(none), depthM: 0 }],
			[OCEAN, { flows: twelve(none), depthM: Number.POSITIVE_INFINITY }],
			[earth, { flows: twelve(across), depthM: 200 }],
		];
		for (const [world, currents] of bad) {
			expect(() =>
				solveTemperature(world, { model: COARSE, currents }),
			).toThrow(RangeError);
		}
	});
});

/** The first entry of an edge of a land cell of the world. */
const landCrossingAt = (world: World): number => {
	const level = Math.fround(world.seaLevel);
	for (let cell = 0; cell < cellCount; cell++) {
		if ((world.elevation[cell] as number) - level > 0) {
			return NEIGHBOUR_COUNT * cell;
		}
	}
	throw new Error('The world has no land');
};

describe('landCrossing', () => {
	const earth = earthWorld(decodeEarth(readEarthDataFile()), N);
	const level = Math.fround(earth.seaLevel);
	const isLand = (cell: number): boolean =>
		(earth.elevation[cell] as number) - level > 0;

	it('finds a flow out of a land cell, or out of a sea cell into one, and nothing in flows along the sea', () => {
		const none = new Float64Array(NEIGHBOUR_COUNT * cellCount);
		expect(landCrossing(earth, none)).toBe(-1);
		let outOfLand = -1;
		let intoLand = -1;
		let alongSea = -1;
		for (let entry = 0; entry < none.length; entry++) {
			const cell = Math.floor(entry / NEIGHBOUR_COUNT);
			const neighbour = grid.neighbours[entry] as number;
			if (isLand(cell) && outOfLand < 0) {
				outOfLand = entry;
			} else if (!isLand(cell) && isLand(neighbour) && intoLand < 0) {
				intoLand = entry;
			} else if (!isLand(cell) && !isLand(neighbour) && alongSea < 0) {
				alongSea = entry;
			}
		}
		for (const [entry, found] of [
			[outOfLand, outOfLand],
			[intoLand, intoLand],
			[alongSea, -1],
		] as const) {
			const flows = Float64Array.from(none);
			flows[entry] = -2;
			expect(landCrossing(earth, flows)).toBe(found);
		}
		expect(landCrossing(OCEAN, new Float64Array(none.length).fill(1))).toBe(-1);
	});

	it('refuses flows of another grid', () => {
		expect(() => landCrossing(earth, new Float64Array(10))).toThrow(RangeError);
	});
});
