import { describe, expect, it } from 'vitest';
import { cornerIndex, edgeFlowsFromCorners } from '../grid/corners';
import { getGrid } from '../grid/grid';
import { flowingPart } from '../wind/flowing';
import {
	ADVECTION_MAX_SWEEPS,
	createHeatAdvector,
	interpolateFlows,
} from './advection';

const grid = getGrid(64);
const { cellCount, areas, centres } = grid;

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

/** The flowing part of a smooth wind: westerlies in the mid-latitudes. */
const westerlies = (speed: number): Float64Array => {
	const east = new Float64Array(cellCount);
	const north = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		const z = centres[3 * cell + 2] as number;
		east[cell] = speed * Math.sin(3 * Math.asin(z));
	}
	return flowingPart(grid, east, north);
};

/** The flowing part of a random wind. */
const randomFlows = (seed: number): Float64Array => {
	const random = createRandom(seed);
	const east = Float64Array.from(
		{ length: cellCount },
		() => 20 * random() - 10,
	);
	const north = Float64Array.from(
		{ length: cellCount },
		() => 20 * random() - 10,
	);
	return flowingPart(grid, east, north);
};

const heatOf = (temperature: Float64Array, capacity: Float64Array): number => {
	let heat = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		heat +=
			(areas[cell] as number) *
			(capacity[cell] as number) *
			(temperature[cell] as number);
	}
	return heat;
};

const STEP_S = 1.3e6;
const TOLERANCE_K = 1e-6;
/** Heat capacities of land and sea, as the model has them. */
const LAND_OR_SEA = Float64Array.from({ length: cellCount }, (_, cell) =>
	Math.floor(cell / 64) % 3 === 0 ? 2.5e8 : 1e7,
);

describe('createHeatAdvector', () => {
	it('leaves a uniform temperature uniform under any flow', () => {
		const advector = createHeatAdvector(grid, 1.2e6);
		advector.setFlows(randomFlows(1));
		const temperature = new Float64Array(cellCount).fill(287.5);
		advector.advect(temperature, LAND_OR_SEA, STEP_S, TOLERANCE_K);
		for (let cell = 0; cell < cellCount; cell++) {
			expect(temperature[cell]).toBeCloseTo(287.5, 9);
		}
	});

	it('keeps the heat, to rounding, whatever the sweeps reached', () => {
		const random = createRandom(2);
		const start = Float64Array.from(
			{ length: cellCount },
			() => 250 + 50 * random(),
		);
		for (const tolerance of [1e-6, 1e-1, 10]) {
			const advector = createHeatAdvector(grid, 1.2e6);
			advector.setFlows(randomFlows(3));
			const temperature = Float64Array.from(start);
			advector.advect(temperature, LAND_OR_SEA, STEP_S, tolerance);
			const before = heatOf(start, LAND_OR_SEA);
			expect(
				Math.abs(heatOf(temperature, LAND_OR_SEA) - before) / before,
			).toBeLessThan(1e-13);
		}
	});

	it('leaves a cell of no heat capacity that no flow crosses as it is, and keeps the heat of the rest exactly', () => {
		// Currents of a random streamfunction, held at zero round the land, a
		// band of each face, so that no flow crosses an edge of it.
		const random = createRandom(11);
		const { cornerCount, cellCorners } = cornerIndex(grid);
		const psi = Float64Array.from(
			{ length: cornerCount },
			() => 4e5 * random() - 2e5,
		);
		const land = Uint8Array.from({ length: cellCount }, (_, cell) =>
			cell % 64 < 16 ? 1 : 0,
		);
		for (let cell = 0; cell < cellCount; cell++) {
			if (land[cell] === 1) {
				for (let k = 0; k < 4; k++) {
					psi[cellCorners[4 * cell + k] as number] = 0;
				}
			}
		}
		const flows = edgeFlowsFromCorners(grid, psi);
		const sea = Float64Array.from({ length: cellCount }, (_, cell) =>
			land[cell] === 1 ? 0 : 2.5e8,
		);
		const start = Float64Array.from(
			{ length: cellCount },
			() => 271 + 30 * random(),
		);
		for (const tolerance of [1e-6, 10]) {
			const advector = createHeatAdvector(grid, 8.36e8);
			advector.setFlows(flows);
			const temperature = Float64Array.from(start);
			advector.advect(temperature, sea, STEP_S, tolerance);
			let moved = 0;
			for (let cell = 0; cell < cellCount; cell++) {
				if (land[cell] === 1) {
					expect(temperature[cell]).toBe(start[cell]);
				} else {
					moved = Math.max(
						moved,
						Math.abs((temperature[cell] as number) - (start[cell] as number)),
					);
				}
			}
			expect(moved).toBeGreaterThan(1);
			const before = heatOf(start, sea);
			expect(Math.abs(heatOf(temperature, sea) - before) / before).toBeLessThan(
				1e-13,
			);
		}
	});

	it('makes no new extreme: every cell ends between the coldest and warmest it began among', () => {
		const random = createRandom(4);
		const start = Float64Array.from(
			{ length: cellCount },
			() => 250 + 50 * random(),
		);
		const advector = createHeatAdvector(grid, 1.2e6);
		advector.setFlows(randomFlows(5));
		const temperature = Float64Array.from(start);
		advector.advect(temperature, LAND_OR_SEA, STEP_S, TOLERANCE_K);
		const low = Math.min(...start);
		const high = Math.max(...start);
		for (let cell = 0; cell < cellCount; cell++) {
			expect(temperature[cell]).toBeGreaterThan(low - 1e-6);
			expect(temperature[cell]).toBeLessThan(high + 1e-6);
		}
		// And it did move heat.
		let change = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			change = Math.max(
				change,
				Math.abs((temperature[cell] as number) - (start[cell] as number)),
			);
		}
		expect(change).toBeGreaterThan(1);
	});

	it('carries a warm patch downwind and spreads it, and further at a greater heat capacity of the air', () => {
		const flows = westerlies(15);
		const land = new Float64Array(cellCount).fill(1e7);
		// A warm patch on the 45°N meridian of longitude 0°.
		const patch = (cell: number): number => {
			const x = centres[3 * cell] as number;
			const y = centres[3 * cell + 1] as number;
			const z = centres[3 * cell + 2] as number;
			const angle = Math.acos(
				Math.min(1, x * Math.SQRT1_2 + z * Math.SQRT1_2 + 0 * y),
			);
			return angle < 0.15 ? 1 : 0;
		};
		/** The longitude, in degrees, of the heat of the anomaly, and its peak. */
		const heatCentre = (anomaly: Float64Array): [number, number] => {
			let sx = 0;
			let sy = 0;
			let peak = 0;
			for (let cell = 0; cell < cellCount; cell++) {
				const weight = (areas[cell] as number) * (anomaly[cell] as number);
				sx += weight * (centres[3 * cell] as number);
				sy += weight * (centres[3 * cell + 1] as number);
				peak = Math.max(peak, anomaly[cell] as number);
			}
			return [(Math.atan2(sy, sx) * 180) / Math.PI, peak];
		};
		const run = (airHeatCapacity: number): [number, number] => {
			const advector = createHeatAdvector(grid, airHeatCapacity);
			advector.setFlows(flows);
			const temperature = Float64Array.from(
				{ length: cellCount },
				(_, cell) => 280 + 10 * patch(cell),
			);
			advector.advect(temperature, land, STEP_S, TOLERANCE_K);
			return heatCentre(Float64Array.from(temperature, (value) => value - 280));
		};
		const [none, peakBefore] = heatCentre(
			Float64Array.from({ length: cellCount }, (_, cell) => 10 * patch(cell)),
		);
		const [near, peakNear] = run(1.2e5);
		const [far, peakFar] = run(1.2e6);
		expect(Math.abs(none)).toBeLessThan(1);
		// Eastward is positive longitude: the mid-latitude westerlies.
		expect(near).toBeGreaterThan(none + 0.5);
		expect(far).toBeGreaterThan(near + 0.5);
		// It spreads as it goes: the peak falls, and further with more heat
		// carried.
		expect(peakNear).toBeLessThan(peakBefore);
		expect(peakFar).toBeLessThan(peakNear);
	});

	it('reports the sweeps it took and that it converged', () => {
		const advector = createHeatAdvector(grid, 1.2e6);
		advector.setFlows(randomFlows(6));
		const random = createRandom(7);
		const temperature = Float64Array.from(
			{ length: cellCount },
			() => 250 + 50 * random(),
		);
		const outcome = advector.advect(
			Float64Array.from(temperature),
			LAND_OR_SEA,
			STEP_S,
			1e-3,
		);
		expect(outcome.converged).toBe(true);
		expect(outcome.sweeps).toBeGreaterThan(0);
		expect(outcome.sweeps).toBeLessThan(ADVECTION_MAX_SWEEPS);
	});

	it('stops at the most sweeps, not converged, where the air outweighs the cell’s own heat, and keeps the heat exact all the same', () => {
		// So little heat in the cell that the air's temperature is all that
		// matters: the sweeps only creep along the closed loops of the flow.
		const advector = createHeatAdvector(grid, 1.2e6);
		advector.setFlows(randomFlows(11));
		const capacity = new Float64Array(cellCount).fill(1e-6);
		const random = createRandom(12);
		const start = Float64Array.from(
			{ length: cellCount },
			() => 250 + 50 * random(),
		);
		const temperature = Float64Array.from(start);
		const outcome = advector.advect(temperature, capacity, STEP_S, 1e-12);
		expect(outcome.converged).toBe(false);
		expect(outcome.sweeps).toBe(ADVECTION_MAX_SWEEPS);
		const before = heatOf(start, capacity);
		expect(
			Math.abs(heatOf(temperature, capacity) - before) / before,
		).toBeLessThan(1e-13);
	});

	it('does nothing in a step with no flow', () => {
		const advector = createHeatAdvector(grid, 1.2e6);
		advector.setFlows(new Float64Array(4 * cellCount));
		const random = createRandom(8);
		const start = Float64Array.from(
			{ length: cellCount },
			() => 250 + 50 * random(),
		);
		const temperature = Float64Array.from(start);
		advector.advect(temperature, LAND_OR_SEA, STEP_S, TOLERANCE_K);
		for (let cell = 0; cell < cellCount; cell++) {
			expect(temperature[cell]).toBeCloseTo(start[cell] as number, 9);
		}
	});

	it('refuses what it cannot use', () => {
		for (const capacity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => createHeatAdvector(grid, capacity), `${capacity}`).toThrow(
				RangeError,
			);
		}
		const advector = createHeatAdvector(grid, 1.2e6);
		expect(() => advector.setFlows(new Float64Array(5))).toThrow(RangeError);
		const broken = new Float64Array(4 * cellCount);
		broken[9] = Number.NaN;
		expect(() => advector.setFlows(broken)).toThrow(RangeError);
		advector.setFlows(new Float64Array(4 * cellCount));
		const temperature = new Float64Array(cellCount).fill(280);
		expect(() =>
			advector.advect(new Float64Array(5), LAND_OR_SEA, STEP_S, 1),
		).toThrow(RangeError);
		expect(() =>
			advector.advect(temperature, new Float64Array(5), STEP_S, 1),
		).toThrow(RangeError);
		for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(
				() => advector.advect(temperature, LAND_OR_SEA, bad, 1),
				`${bad}`,
			).toThrow(RangeError);
			expect(
				() => advector.advect(temperature, LAND_OR_SEA, STEP_S, bad),
				`${bad}`,
			).toThrow(RangeError);
		}
	});
});

describe('interpolateFlows', () => {
	const months = Array.from({ length: 12 }, (_, month) =>
		Float64Array.from([month, 10 * month]),
	);

	it('gives each month’s own flows at the middle of the month', () => {
		for (let month = 0; month < 12; month++) {
			const flows = interpolateFlows(
				months,
				(month + 0.5) / 12,
				new Float64Array(2),
			);
			expect(flows[0]).toBeCloseTo(month, 12);
			expect(flows[1]).toBeCloseTo(10 * month, 12);
		}
	});

	it('gives the mean of two months where they meet, and wraps round the year', () => {
		const between = interpolateFlows(months, 4 / 12, new Float64Array(2));
		expect(between[0]).toBeCloseTo(3.5, 12);
		// The start of January is half way between December and January, and
		// so is the end of December.
		const start = interpolateFlows(months, 0, new Float64Array(2));
		const end = interpolateFlows(months, 1, new Float64Array(2));
		expect(start[0]).toBeCloseTo(5.5, 12);
		expect(end[0]).toBeCloseTo(5.5, 12);
		expect(interpolateFlows(months, 1.25, new Float64Array(2))[0]).toBeCloseTo(
			interpolateFlows(months, 0.25, new Float64Array(2))[0] as number,
			12,
		);
		expect(interpolateFlows(months, -0.25, new Float64Array(2))[0]).toBeCloseTo(
			interpolateFlows(months, 0.75, new Float64Array(2))[0] as number,
			12,
		);
	});

	it('writes into the array given and keeps what has no net flow without any', () => {
		const into = new Float64Array(2);
		expect(interpolateFlows(months, 0.3, into)).toBe(into);
		const a = randomFlows(9);
		const b = randomFlows(10);
		const mixed = interpolateFlows([a, b], 0.5, new Float64Array(a.length));
		// Two flows with no net flow out of any cell: so has their mixture.
		for (let cell = 0; cell < cellCount; cell++) {
			let net = 0;
			for (let side = 0; side < 4; side++) {
				net += mixed[4 * cell + side] as number;
			}
			// Against flows of about 1e6 square metres a second.
			expect(Math.abs(net)).toBeLessThan(1e-2);
		}
	});
});
