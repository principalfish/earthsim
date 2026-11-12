import { describe, expect, it } from 'vitest';
import {
	createExchangeSolver,
	EXCHANGE_MAX_ITERATIONS,
	exchangeHeat,
	uniformCoupling,
} from './exchange';
import { cellAt, cellsWithin, getGrid, latLonToDirection } from './grid';

const grid = getGrid(64);
const { cellCount, areas, neighbours } = grid;

const SECONDS_PER_MONTH = 30 * 86_400;
const OCEAN_CAPACITY = 2.5e8;
const LAND_CAPACITY = 1e7;
const DIFFUSIVITY = 0.55;

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

/** Land in a band of cells, ocean elsewhere: capacities differing 25-fold. */
const mixedCapacity = (): Float64Array => {
	const capacity = new Float64Array(cellCount).fill(OCEAN_CAPACITY);
	for (const cell of cellsWithin(grid, latLonToDirection(30, 60), 0.6)) {
		capacity[cell] = LAND_CAPACITY;
	}
	return capacity;
};

/** 288 K everywhere with a hot spot 60 K hotter. */
const hotSpot = (): Float64Array => {
	const temperature = new Float64Array(cellCount).fill(288);
	for (const cell of cellsWithin(grid, latLonToDirection(20, 50), 0.15)) {
		temperature[cell] = 348;
	}
	return temperature;
};

/** The heat a field holds per kelvin of the unit sphere: Σ A C T. */
const heat = (temperature: Float64Array, capacity: Float64Array): number => {
	let total = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		total +=
			(areas[cell] as number) *
			(capacity[cell] as number) *
			(temperature[cell] as number);
	}
	return total;
};

const extremes = (values: Float64Array): { min: number; max: number } => {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const value of values) {
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	return { min, max };
};

describe('exchangeHeat', () => {
	const capacity = mixedCapacity();
	const start = hotSpot();

	it('conserves the area-weighted heat to rounding', () => {
		const after = exchangeHeat(
			grid,
			start,
			capacity,
			SECONDS_PER_MONTH,
			DIFFUSIVITY,
		);
		const before = heat(start, capacity);
		expect(Math.abs(heat(after, capacity) - before) / before).toBeLessThan(
			1e-12,
		);
	});

	it('conserves heat however loosely each step is solved', () => {
		let field = start;
		for (let step = 0; step < 5; step++) {
			field = exchangeHeat(
				grid,
				field,
				capacity,
				SECONDS_PER_MONTH,
				DIFFUSIVITY,
				1,
			);
		}
		const before = heat(start, capacity);
		expect(Math.abs(heat(field, capacity) - before) / before).toBeLessThan(
			1e-12,
		);
	});

	it('throws when the step cannot be solved to the tolerance asked', () => {
		expect(() =>
			exchangeHeat(
				grid,
				start,
				capacity,
				SECONDS_PER_MONTH,
				DIFFUSIVITY,
				1e-300,
			),
		).toThrow('was not solved');
	});

	it('flattens a hot spot, and further the longer the step', () => {
		const short = exchangeHeat(
			grid,
			start,
			capacity,
			SECONDS_PER_MONTH,
			DIFFUSIVITY,
		);
		const long = exchangeHeat(
			grid,
			start,
			capacity,
			12 * SECONDS_PER_MONTH,
			DIFFUSIVITY,
		);
		const first = extremes(short);
		const second = extremes(long);
		expect(first.max).toBeLessThan(348);
		expect(first.min).toBeGreaterThanOrEqual(288 - 1e-9);
		expect(second.max).toBeLessThan(first.max);
		const centre = cellAt(grid, latLonToDirection(20, 50));
		expect(long[centre]).toBeLessThan(short[centre] as number);
	});

	it('leaves a uniform field as it is', () => {
		const uniform = new Float64Array(cellCount).fill(250);
		const after = exchangeHeat(
			grid,
			uniform,
			capacity,
			SECONDS_PER_MONTH,
			DIFFUSIVITY,
		);
		for (const value of after) {
			expect(value).toBeCloseTo(250, 9);
		}
	});

	it('does not change its arguments', () => {
		const copy = Float64Array.from(start);
		exchangeHeat(grid, start, capacity, SECONDS_PER_MONTH, DIFFUSIVITY);
		expect(start).toEqual(copy);
	});

	it('refuses arrays of the wrong length, and steps, diffusivities and tolerances that are not positive', () => {
		const short = new Float64Array(cellCount - 1);
		expect(() =>
			exchangeHeat(grid, short, capacity, SECONDS_PER_MONTH, DIFFUSIVITY),
		).toThrow(RangeError);
		expect(() =>
			exchangeHeat(grid, start, short, SECONDS_PER_MONTH, DIFFUSIVITY),
		).toThrow(RangeError);
		for (const seconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() =>
				exchangeHeat(grid, start, capacity, seconds, DIFFUSIVITY),
			).toThrow(RangeError);
		}
		for (const tolerance of [0, -1, Number.NaN]) {
			expect(() =>
				exchangeHeat(
					grid,
					start,
					capacity,
					SECONDS_PER_MONTH,
					DIFFUSIVITY,
					tolerance,
				),
			).toThrow(RangeError);
		}
		for (const diffusivity of [0, Number.NaN]) {
			expect(() =>
				exchangeHeat(grid, start, capacity, SECONDS_PER_MONTH, diffusivity),
			).toThrow(RangeError);
		}
	});
});

describe('createExchangeSolver', () => {
	const coupling = uniformCoupling(grid, DIFFUSIVITY);

	/** M x for masses `mass`, written out directly. */
	const apply = (mass: Float64Array, x: Float64Array): Float64Array => {
		const y = new Float64Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			let value = (mass[cell] as number) * (x[cell] as number);
			for (let side = 0; side < 4; side++) {
				const entry = 4 * cell + side;
				value +=
					(coupling[entry] as number) *
					((x[cell] as number) - (x[neighbours[entry] as number] as number));
			}
			y[cell] = value;
		}
		return y;
	};

	it('solves to the tolerance asked, stiff as the system is', () => {
		const random = createRandom(11);
		const solver = createExchangeSolver(grid, coupling);
		// Land-like masses with no heat capacity at all, the stiffest case
		// the model solves: the exchange outweighs them a thousandfold.
		const mass = new Float64Array(cellCount);
		const answer = new Float64Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			mass[cell] = (areas[cell] as number) * (2 + 2 * random());
			answer[cell] = 200 + 100 * random();
		}
		const rhs = apply(mass, answer);
		solver.setMass(mass);
		const x = new Float64Array(cellCount).fill(250);
		const { iterations, converged } = solver.solve(rhs, x, 1e-6);
		expect(converged).toBe(true);
		expect(iterations).toBeLessThan(EXCHANGE_MAX_ITERATIONS / 4);
		let squares = 0;
		let total = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const error = (x[cell] as number) - (answer[cell] as number);
			squares += (mass[cell] as number) * error * error;
			total += mass[cell] as number;
		}
		expect(Math.sqrt(squares / total)).toBeLessThan(1e-5);
	});

	it('takes no iterations when the first guess is the answer', () => {
		const solver = createExchangeSolver(grid, coupling);
		const mass = new Float64Array(cellCount).fill(1e-4);
		const answer = hotSpot();
		const rhs = apply(mass, answer);
		solver.setMass(mass);
		const x = Float64Array.from(answer);
		expect(solver.solve(rhs, x, 1e-6)).toEqual({
			iterations: 0,
			converged: true,
		});
		for (let cell = 0; cell < cellCount; cell++) {
			expect(
				Math.abs((x[cell] as number) - (answer[cell] as number)),
			).toBeLessThan(1e-9);
		}
	});

	it('refuses couplings, masses, caps and tolerances that are malformed', () => {
		expect(() =>
			createExchangeSolver(grid, new Float64Array(cellCount)),
		).toThrow(RangeError);
		const negative = Float64Array.from(coupling);
		negative[5] = -1;
		expect(() => createExchangeSolver(grid, negative)).toThrow(RangeError);
		for (const cap of [0, 1.5, Number.NaN]) {
			expect(() => createExchangeSolver(grid, coupling, cap)).toThrow(
				RangeError,
			);
		}
		const solver = createExchangeSolver(grid, coupling);
		expect(() => solver.setMass(new Float64Array(3))).toThrow(RangeError);
		solver.setMass(new Float64Array(cellCount).fill(1));
		const rhs = new Float64Array(cellCount).fill(1);
		for (const tolerance of [0, -1e-6, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() =>
				solver.solve(rhs, new Float64Array(cellCount), tolerance),
			).toThrow(RangeError);
		}
		const zero = new Float64Array(cellCount).fill(1);
		zero[9] = 0;
		expect(() => solver.setMass(zero)).toThrow(RangeError);
	});

	it('says so when it runs out of iterations', () => {
		const random = createRandom(5);
		const solver = createExchangeSolver(grid, coupling, 1);
		const mass = new Float64Array(cellCount).fill(1e-4);
		const answer = new Float64Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			answer[cell] = 200 + 100 * random();
		}
		solver.setMass(mass);
		const x = new Float64Array(cellCount).fill(250);
		expect(solver.solve(apply(mass, answer), x, 1e-9)).toEqual({
			iterations: 1,
			converged: false,
		});
	});
});
