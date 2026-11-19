import { describe, expect, it } from 'vitest';
import { getGrid } from '../grid/grid';
import { sampleVectorsOnCells, type VectorSampling } from './observedVectors';

const grid = getGrid(64);

/** Data of two rows and one column, the first row without data. */
const sampling = (leaveOutNoData: boolean): VectorSampling => ({
	grid,
	columns: 1,
	rowSin: Float64Array.of(0, 0),
	rowCos: Float64Array.of(1, 1),
	columnSin: Float64Array.of(0),
	columnCos: Float64Array.of(1),
	leaveOutNoData,
	// Every cell lies a quarter of the way from the first row to the second.
	locate: (_cell, corners, weights) => {
		corners.set([0, 0, 1, 1]);
		weights.set([0.375, 0.375, 0.125, 0.125]);
	},
});

describe('sampleVectorsOnCells', () => {
	const east = [Float32Array.of(Number.NaN, 2)];
	const north = [Float32Array.of(Number.NaN, 0)];

	it('leaves out the points without data, and scales the weights of the rest to one', () => {
		const out = sampleVectorsOnCells(sampling(true), east, north);
		expect(out.east).toHaveLength(1);
		expect(out.east[0]).toHaveLength(grid.cellCount);
		// Where both rows hold the second row's vector, nothing is left out
		// and the weights already sum to one, so that is the answer wanted:
		// without scaling the remaining weight of a quarter, the vector would
		// be a quarter as long.
		const whole = sampleVectorsOnCells(
			sampling(false),
			[Float32Array.of(2, 2)],
			[Float32Array.of(0, 0)],
		);
		for (let cell = 0; cell < grid.cellCount; cell += 97) {
			const u = (out.east[0] as Float32Array)[cell] as number;
			const v = (out.north[0] as Float32Array)[cell] as number;
			expect(u).toBeCloseTo((whole.east[0] as Float32Array)[cell] as number, 5);
			expect(v).toBeCloseTo(
				(whole.north[0] as Float32Array)[cell] as number,
				5,
			);
		}
	});

	it('is NaN where no point with weight has data', () => {
		const lonely = sampling(true);
		const out = sampleVectorsOnCells(
			{
				...lonely,
				locate: (_c, corners, weights) => {
					corners.set([0, 0, 0, 0]);
					weights.set([0.25, 0.25, 0.25, 0.25]);
				},
			},
			east,
			north,
		);
		expect((out.east[0] as Float32Array)[5]).toBeNaN();
		expect((out.north[0] as Float32Array)[5]).toBeNaN();
	});

	it('uses every point as it is when told not to leave any out, so NaN spreads', () => {
		const out = sampleVectorsOnCells(sampling(false), east, north);
		expect((out.east[0] as Float32Array)[5]).toBeNaN();
	});
});
