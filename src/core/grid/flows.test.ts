import { describe, expect, it } from 'vitest';
import { removeConvergence } from '../wind/flowing';
import { coarsenFlows, refineFlows } from './flows';
import { getGrid } from './grid';
import { createVectorField, edgeFlows } from './vector';

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

/** The flows of a random tangent field on a grid, with net flow out of cells. */
const randomFlows = (resolution: number, seed: number): Float64Array => {
	const grid = getGrid(resolution);
	const random = createRandom(seed);
	const vectors = createVectorField(grid);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const x = grid.centres[3 * cell] as number;
		const y = grid.centres[3 * cell + 1] as number;
		const z = grid.centres[3 * cell + 2] as number;
		const v = [20 * random() - 10, 20 * random() - 10, 20 * random() - 10];
		const outward =
			(v[0] as number) * x + (v[1] as number) * y + (v[2] as number) * z;
		vectors.x[cell] = (v[0] as number) - outward * x;
		vectors.y[cell] = (v[1] as number) - outward * y;
		vectors.z[cell] = (v[2] as number) - outward * z;
	}
	return edgeFlows(grid, vectors, 1);
};

/** The largest net flow out of any cell. */
const largestNet = (flows: ArrayLike<number>): number => {
	let largest = 0;
	for (let cell = 0; cell < flows.length / 4; cell++) {
		let net = 0;
		for (let side = 0; side < 4; side++) {
			net += flows[4 * cell + side] as number;
		}
		largest = Math.max(largest, Math.abs(net));
	}
	return largest;
};

const largest = (values: ArrayLike<number>): number => {
	let most = 0;
	for (let entry = 0; entry < values.length; entry++) {
		most = Math.max(most, Math.abs(values[entry] as number));
	}
	return most;
};

/** Whether every edge's two entries are exactly each other's negatives. */
const isAntisymmetric = (
	resolution: number,
	flows: ArrayLike<number>,
): boolean => {
	const grid = getGrid(resolution);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		for (let side = 0; side < 4; side++) {
			const other = grid.neighbours[4 * cell + side] as number;
			let back = 0;
			while (grid.neighbours[4 * other + back] !== cell) {
				back++;
			}
			if (flows[4 * cell + side] !== -(flows[4 * other + back] as number)) {
				return false;
			}
		}
	}
	return true;
};

describe('coarsenFlows', { timeout: 60_000 }, () => {
	it.each([128, 256])(
		'at %d adds up the flows across each coarse edge, antisymmetrically, and keeps what is carried',
		(resolution) => {
			const fine = randomFlows(resolution, 1);
			const coarse = coarsenFlows(fine, resolution);
			expect(coarse).toHaveLength(4 * getGrid(resolution / 2).cellCount);
			expect(isAntisymmetric(resolution / 2, coarse)).toBe(true);
			// What leaves a coarse cell is what leaves its four fine cells less what
			// passes between them, which cancels in pairs.
			const grid = getGrid(resolution);
			const coarseGrid = getGrid(resolution / 2);
			const n = resolution;
			const m = n / 2;
			let worst = 0;
			for (let cell = 0; cell < coarseGrid.cellCount; cell += 5) {
				const face = Math.floor(cell / (m * m));
				const j = Math.floor(cell / m) % m;
				const i = cell % m;
				let net = 0;
				for (const [a, b] of [
					[0, 0],
					[1, 0],
					[0, 1],
					[1, 1],
				] as const) {
					const c = (face * n + 2 * j + b) * n + 2 * i + a;
					for (let side = 0; side < 4; side++) {
						net += fine[4 * c + side] as number;
					}
				}
				let coarseNet = 0;
				for (let side = 0; side < 4; side++) {
					coarseNet += coarse[4 * cell + side] as number;
				}
				worst = Math.max(worst, Math.abs(net - coarseNet));
			}
			expect(worst / largest(fine)).toBeLessThan(1e-12);
			expect(grid.cellCount).toBe(6 * n * n);
		},
	);

	it('gives a coarse flow with no net flow out of any cell from a fine one with none', () => {
		const fine = removeConvergence(getGrid(128), randomFlows(128, 2));
		expect(largestNet(fine) / largest(fine)).toBeLessThan(1e-6);
		const coarse = coarsenFlows(fine, 128);
		expect(largestNet(coarse) / largest(coarse)).toBeLessThan(1e-6);
	});

	it('refuses the coarsest grid, an unsupported one, flows of the wrong length, and flows that are not finite', () => {
		expect(() => coarsenFlows(new Float64Array(4 * 6 * 64 * 64), 64)).toThrow(
			RangeError,
		);
		expect(() => coarsenFlows(new Float64Array(10), 100)).toThrow(RangeError);
		expect(() => coarsenFlows(new Float64Array(5), 128)).toThrow(RangeError);
		const broken = new Float64Array(4 * 6 * 128 * 128);
		broken[9] = Number.NaN;
		expect(() => coarsenFlows(broken, 128)).toThrow(RangeError);
	});
});

describe('refineFlows', { timeout: 60_000 }, () => {
	it.each([128, 256])(
		'at %d gives a flow with no net flow out of any fine cell from one with none, and coarsens back to it',
		(resolution) => {
			const coarseGrid = getGrid(resolution / 2);
			const coarse = removeConvergence(
				coarseGrid,
				randomFlows(resolution / 2, 3),
			);
			const fine = refineFlows(coarse, resolution);
			expect(fine).toHaveLength(4 * getGrid(resolution).cellCount);
			expect(isAntisymmetric(resolution, fine)).toBe(true);
			expect(largestNet(fine) / largest(coarse)).toBeLessThan(1e-6);
			const back = coarsenFlows(fine, resolution);
			let difference = 0;
			for (let entry = 0; entry < coarse.length; entry++) {
				difference = Math.max(
					difference,
					Math.abs((back[entry] as number) - (coarse[entry] as number)),
				);
			}
			expect(difference / largest(coarse)).toBeLessThan(1e-12);
		},
		60_000,
	);

	it('shares each coarse edge’s flow equally between its two fine edges', () => {
		const coarse = randomFlows(64, 4);
		const fine = refineFlows(coarse, 128);
		// The fine cell at the corner of face 0 shares its two outer edges.
		const grid = getGrid(128);
		const coarseGrid = getGrid(64);
		// Cell (0, 0) of face 0 on the fine grid lies in coarse cell 0; its
		// side -i faces the same coarse neighbour as the coarse cell's.
		expect(fine[0]).toBeCloseTo(0.5 * (coarse[0] as number), 9);
		expect(fine[2]).toBeCloseTo(0.5 * (coarse[2] as number), 9);
		expect(grid.cellCount).toBe(4 * coarseGrid.cellCount);
	});

	it('leaves a coarse cell’s net flow, if it has one, in a single fine cell', () => {
		const coarse = randomFlows(64, 5);
		const fine = refineFlows(coarse, 128);
		const coarseNet = new Float64Array(6 * 64 * 64);
		for (let cell = 0; cell < coarseNet.length; cell++) {
			for (let side = 0; side < 4; side++) {
				coarseNet[cell] =
					(coarseNet[cell] as number) + (coarse[4 * cell + side] as number);
			}
		}
		let lost = 0;
		for (let cell = 0; cell < coarseNet.length; cell += 11) {
			const face = Math.floor(cell / (64 * 64));
			const j = Math.floor(cell / 64) % 64;
			const i = cell % 64;
			let total = 0;
			for (const [a, b] of [
				[0, 0],
				[1, 0],
				[0, 1],
				[1, 1],
			] as const) {
				const c = (face * 128 + 2 * j + b) * 128 + 2 * i + a;
				for (let side = 0; side < 4; side++) {
					total += fine[4 * c + side] as number;
				}
			}
			lost = Math.max(lost, Math.abs(total - (coarseNet[cell] as number)));
		}
		expect(lost / largest(coarse)).toBeLessThan(1e-12);
	});

	it('refuses the coarsest grid, an unsupported one, flows of the wrong length, and flows that are not finite', () => {
		expect(() => refineFlows(new Float64Array(4 * 6 * 64 * 64), 64)).toThrow(
			RangeError,
		);
		expect(() => refineFlows(new Float64Array(10), 100)).toThrow(RangeError);
		expect(() => refineFlows(new Float64Array(5), 128)).toThrow(RangeError);
		const broken = new Float64Array(4 * 6 * 64 * 64);
		broken[9] = Number.POSITIVE_INFINITY;
		expect(() => refineFlows(broken, 128)).toThrow(RangeError);
	});
});
