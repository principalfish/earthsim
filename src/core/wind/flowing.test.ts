import { describe, expect, it } from 'vitest';
import {
	readEarthDataFile,
	readObservedWindFile,
} from '../../../scripts/earth/dataFile.mjs';
import { decodeEarth, earthWorld, isMeasuredEarth } from '../earth/earth';
import { getGrid } from '../grid/grid';
import {
	createVectorField,
	edgeFlows,
	fromEastNorth,
	toEastNorth,
	type VectorField,
} from '../grid/vector';
import { solveTemperature } from '../temperature/temperature';
import { PLANET_RADIUS_KM } from '../world/world';
import {
	FLOWING_RESOLUTION,
	flowingPart,
	flowingPartForSolve,
	removeConvergence,
} from './flowing';
import { decodeObservedWind, observedWind } from './observedWind';
import { solveWinds } from './solve';

const RADIUS_M = PLANET_RADIUS_KM * 1000;
const grid = getGrid(64);

/** A small seeded generator (mulberry32) so random cases repeat exactly. */
const createRandom = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
};

const rms = (values: ArrayLike<number>): number => {
	let squares = 0;
	for (let entry = 0; entry < values.length; entry++) {
		squares += (values[entry] as number) ** 2;
	}
	return Math.sqrt(squares / values.length);
};

/** The net flow out of every cell. */
const netFlows = (flows: ArrayLike<number>): Float64Array => {
	const net = new Float64Array(flows.length / 4);
	for (let cell = 0; cell < net.length; cell++) {
		for (let side = 0; side < 4; side++) {
			net[cell] = (net[cell] as number) + (flows[4 * cell + side] as number);
		}
	}
	return net;
};

const largest = (values: ArrayLike<number>): number => {
	let most = 0;
	for (let entry = 0; entry < values.length; entry++) {
		most = Math.max(most, Math.abs(values[entry] as number));
	}
	return most;
};

/** A wind of random strength and direction at every cell. */
const randomWind = (seed: number) => {
	const random = createRandom(seed);
	return {
		east: Float64Array.from(
			{ length: grid.cellCount },
			() => 20 * random() - 10,
		),
		north: Float64Array.from(
			{ length: grid.cellCount },
			() => 20 * random() - 10,
		),
	};
};

/** The flows of a vector field on the planet's radius. */
const flowsOf = (vectors: VectorField): Float64Array =>
	edgeFlows(grid, vectors, RADIUS_M);

/** The cells in the outermost row or column of a face, corners included. */
const onCubeEdge = (cell: number): boolean => {
	const i = cell % 64;
	const j = Math.floor(cell / 64) % 64;
	return i === 0 || i === 63 || j === 0 || j === 63;
};

describe('flowingPart', () => {
	it('leaves no net flow in or out of any cell, the cube’s edges and corners included, and keeps each edge’s flow the exact negative of its other side', () => {
		const wind = randomWind(3);
		const eastBefore = Float64Array.from(wind.east);
		const northBefore = Float64Array.from(wind.north);
		const before = flowsOf(fromEastNorth(grid, wind));
		const flows = flowingPart(grid, wind.east, wind.north);
		expect(wind.east).toEqual(eastBefore);
		expect(wind.north).toEqual(northBefore);
		const beforeFlows = Float64Array.from(before);
		removeConvergence(grid, before);
		expect(before).toEqual(beforeFlows);
		const net = netFlows(flows);
		// The random wind has a net flow of the order of the flows themselves.
		expect(largest(netFlows(before)) / rms(before)).toBeGreaterThan(1);
		expect(largest(net) / rms(flows)).toBeLessThan(2e-7);
		let seams = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			if (onCubeEdge(cell)) {
				seams = Math.max(seams, Math.abs(net[cell] as number));
			}
			for (let side = 0; side < 4; side++) {
				const other = grid.neighbours[4 * cell + side] as number;
				let back = 0;
				while (grid.neighbours[4 * other + back] !== cell) {
					back++;
				}
				expect(flows[4 * other + back]).toBe(
					-(flows[4 * cell + side] as number),
				);
			}
		}
		expect(seams / rms(flows)).toBeLessThan(2e-7);
	});

	it('is unchanged by a second application', () => {
		const wind = randomWind(4);
		const once = flowingPart(grid, wind.east, wind.north);
		const twice = removeConvergence(grid, once);
		const change = Float64Array.from(
			once,
			(flow, entry) => flow - (twice[entry] as number),
		);
		expect(largest(change) / rms(once)).toBeLessThan(1e-6);
	});

	it.each([
		['+Z', [0, 0, 1]],
		['a cube corner', [1, 1, 1]],
	] as const)(
		'gives back a wind that already goes round, a solid body’s turning about %s, as it went in, to the grid’s accuracy',
		(_name, axis) => {
			const length = Math.hypot(...axis);
			const turning = createVectorField(grid);
			for (let cell = 0; cell < grid.cellCount; cell++) {
				const x = grid.centres[3 * cell] as number;
				const y = grid.centres[3 * cell + 1] as number;
				const z = grid.centres[3 * cell + 2] as number;
				const [ax, ay, az] = axis.map((value) => value / length) as [
					number,
					number,
					number,
				];
				turning.x[cell] = 10 * (ay * z - az * y);
				turning.y[cell] = 10 * (az * x - ax * z);
				turning.z[cell] = 10 * (ax * y - ay * x);
			}
			const wind = toEastNorth(grid, turning);
			const before = flowsOf(turning);
			const flows = flowingPart(grid, wind.east, wind.north);
			const change = Float64Array.from(
				before,
				(flow, entry) => flow - (flows[entry] as number),
			);
			expect(largest(change) / rms(before)).toBeLessThan(1e-3);
		},
	);

	it.each([64, 128])(
		'takes nearly all of a wind that only runs in towards a point at %d, and the net flow of what is left is nil',
		(resolution) => {
			const fine = getGrid(resolution);
			// The surface gradient of x: every wind runs towards (1, 0, 0).
			const converging = createVectorField(fine);
			for (let cell = 0; cell < fine.cellCount; cell++) {
				const x = fine.centres[3 * cell] as number;
				const y = fine.centres[3 * cell + 1] as number;
				const z = fine.centres[3 * cell + 2] as number;
				converging.x[cell] = 10 * (1 - x * x);
				converging.y[cell] = 10 * (-x * y);
				converging.z[cell] = 10 * (-x * z);
			}
			const before = edgeFlows(fine, converging, RADIUS_M);
			const left = removeConvergence(fine, before);
			// The grid's skewed cells leave about an eighth, going round, at
			// every size.
			expect(rms(left) / rms(before)).toBeGreaterThan(0.05);
			expect(rms(left) / rms(before)).toBeLessThan(0.2);
			expect(largest(netFlows(left)) / rms(before)).toBeLessThan(2e-7);
		},
		60_000,
	);

	it('is in proportion to the wind, and nothing for no wind', () => {
		const wind = randomWind(5);
		const flows = flowingPart(grid, wind.east, wind.north);
		const doubled = flowingPart(
			grid,
			wind.east.map((value) => 2 * value),
			wind.north.map((value) => 2 * value),
		);
		const error = Float64Array.from(
			doubled,
			(flow, entry) => flow - 2 * (flows[entry] as number),
		);
		expect(largest(error) / rms(doubled)).toBeLessThan(1e-6);
		const none = new Float64Array(grid.cellCount);
		expect(flowingPart(grid, none, none).every((flow) => flow === 0)).toBe(
			true,
		);
	});

	it('takes winds in metres a second and gives flows in square metres a second on the planet’s radius', () => {
		// A uniform eastward wind of 10 m/s.
		const wind = {
			east: new Float64Array(grid.cellCount).fill(10),
			north: new Float64Array(grid.cellCount),
		};
		const flows = flowingPart(grid, wind.east, wind.north);
		// A 10 m/s wind across a cell's width of about 0.0245 rad of the
		// radius carries of the order of 1.5e6 square metres a second.
		expect(largest(flows)).toBeGreaterThan(5e5);
		expect(largest(flows)).toBeLessThan(5e6);
		expect(flows).toHaveLength(4 * grid.cellCount);
	});

	it('refuses arrays of the wrong length and values that are not finite', () => {
		const wind = randomWind(6);
		expect(() => flowingPart(grid, new Float64Array(5), wind.north)).toThrow(
			RangeError,
		);
		expect(() => flowingPart(grid, wind.east, new Float64Array(5))).toThrow(
			RangeError,
		);
		const broken = Float64Array.from(wind.east);
		broken[10] = Number.NaN;
		expect(() => flowingPart(grid, broken, wind.north)).toThrow(RangeError);
		expect(() => removeConvergence(grid, new Float64Array(5))).toThrow(
			RangeError,
		);
		const flows = new Float64Array(4 * grid.cellCount);
		flows[3] = Number.POSITIVE_INFINITY;
		expect(() => removeConvergence(grid, flows)).toThrow(RangeError);
		// One side of an edge that is not the negative of the other.
		const lopsided = flowsOf(fromEastNorth(grid, wind));
		lopsided[17] = (lopsided[17] as number) + 1;
		expect(() => removeConvergence(grid, lopsided)).toThrow(
			/each other's negatives/,
		);
	});

	it('keeps the pattern of the Earth’s July surface wind while losing its inflow to the lows', () => {
		const earth = earthWorld(decodeEarth(readEarthDataFile()), 64);
		expect(isMeasuredEarth(earth)).toBe(true);
		const solved = solveWinds(earth, solveTemperature(earth).months);
		const july = 6;
		const flowing = flowingPart(
			grid,
			solved.east[july] as Float32Array,
			solved.north[july] as Float32Array,
		);
		const whole = flowsOf(
			fromEastNorth(grid, {
				east: solved.east[july] as Float32Array,
				north: solved.north[july] as Float32Array,
			}),
		);
		// Friction turns the surface wind in towards the lows: before, the
		// net flow into some cell is as large as the flow across an edge.
		expect(largest(netFlows(whole)) / rms(whole)).toBeGreaterThan(1);
		expect(largest(netFlows(flowing)) / rms(flowing)).toBeLessThan(2e-7);
		let together = 0;
		for (let entry = 0; entry < whole.length; entry++) {
			together += (whole[entry] as number) * (flowing[entry] as number);
		}
		const correlation = together / (rms(whole) * rms(flowing) * whole.length);
		// What is left is most of the flow, in the same pattern: the
		// trades and the westerlies go round the globe.
		expect(correlation).toBeGreaterThan(0.75);
		expect(rms(flowing) / rms(whole)).toBeGreaterThan(0.7);
		expect(rms(flowing) / rms(whole)).toBeLessThan(0.95);
	}, 60_000);

	it('takes winds from the observed Earth too', () => {
		const observed = observedWind(
			decodeObservedWind(readObservedWindFile()),
			64,
		);
		const flows = flowingPart(
			grid,
			observed.east[0] as Float32Array,
			observed.north[0] as Float32Array,
		);
		expect(largest(netFlows(flows)) / rms(flows)).toBeLessThan(2e-7);
	});
});

describe('flowingPartForSolve', () => {
	it('is flowingPart for a world of 64', () => {
		const wind = randomWind(21);
		const flows = flowingPartForSolve(64, 64, wind.east, wind.north);
		expect(flows).toEqual(flowingPart(grid, wind.east, wind.north));
		expect(FLOWING_RESOLUTION).toBe(64);
	});

	it.each([
		[128, 64],
		[256, 128],
	] as const)(
		'gives a world of %d the flowing part on the grid it is solved on, %d, with no net flow out of any cell',
		(resolution, solved) => {
			const fine = getGrid(resolution);
			const random = createRandom(22);
			const east = Float64Array.from(
				{ length: fine.cellCount },
				() => 20 * random() - 10,
			);
			const north = Float64Array.from(
				{ length: fine.cellCount },
				() => 20 * random() - 10,
			);
			const flows = flowingPartForSolve(resolution, solved, east, north);
			expect(flows).toHaveLength(4 * getGrid(solved).cellCount);
			expect(largest(netFlows(flows)) / rms(flows)).toBeLessThan(1e-6);
		},
		60_000,
	);

	it('carries the pattern of a smooth wind of a finer world onto the grid solved on', () => {
		// The same smooth, flowing wind on grids of 64 and 128: the flows
		// found for the world of 128 on 64 are those of 64's own.
		const smooth = (resolution: number) => {
			const g = getGrid(resolution);
			const east = new Float64Array(g.cellCount);
			for (let cell = 0; cell < g.cellCount; cell++) {
				const z = g.centres[3 * cell + 2] as number;
				east[cell] = 12 * Math.sin(3 * Math.asin(z));
			}
			return { east, north: new Float64Array(g.cellCount) };
		};
		const own = smooth(64);
		const coarse = flowingPartForSolve(64, 64, own.east, own.north);
		const fine = smooth(128);
		const carried = flowingPartForSolve(128, 64, fine.east, fine.north);
		const difference = Float64Array.from(
			coarse,
			(flow, entry) => flow - (carried[entry] as number),
		);
		// Not the same to rounding: each grid's own flux of the wind differs by
		// its accuracy, and the corners' skewed cells most.
		expect(rms(difference) / rms(coarse)).toBeLessThan(0.05);
	});

	it('refuses resolutions that are not the world’s or the one a step coarser, and winds that do not fit', () => {
		const wind = randomWind(23);
		expect(() => flowingPartForSolve(64, 128, wind.east, wind.north)).toThrow(
			RangeError,
		);
		expect(() =>
			flowingPartForSolve(128, 32 as never, wind.east, wind.north),
		).toThrow(RangeError);
		expect(() => flowingPartForSolve(256, 64, wind.east, wind.north)).toThrow(
			RangeError,
		);
		expect(() =>
			flowingPartForSolve(64, 64, new Float64Array(5), wind.north),
		).toThrow(RangeError);
		const broken = Float64Array.from(wind.east);
		broken[1] = Number.NaN;
		expect(() => flowingPartForSolve(64, 64, broken, wind.north)).toThrow(
			RangeError,
		);
	});
});
