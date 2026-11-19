import { describe, expect, it } from 'vitest';
import {
	bicgstab,
	createKrylovWork,
	createMultigrid,
	createRowBuilder,
	diagonalsOf,
	incompleteLU,
	multiply,
	product,
	type SparseMatrix,
	solveLU,
	transpose,
} from './sparse';

/** A matrix from dense rows, leaving out the zeros. */
const fromDense = (rows: readonly (readonly number[])[]): SparseMatrix => {
	const builder = createRowBuilder(rows[0]?.length ?? 0);
	for (const row of rows) {
		row.forEach((value, column) => {
			if (value !== 0) {
				builder.add(column, value);
			}
		});
		builder.endRow();
	}
	return builder.finish();
};

/** A matrix as dense rows. */
const toDense = (matrix: SparseMatrix): number[][] => {
	const rows: number[][] = [];
	for (let row = 0; row < matrix.rowCount; row++) {
		const dense = new Array<number>(matrix.columnCount).fill(0);
		for (
			let entry = matrix.starts[row] as number;
			entry < (matrix.starts[row + 1] as number);
			entry++
		) {
			dense[matrix.columns[entry] as number] = matrix.values[entry] as number;
		}
		rows.push(dense);
	}
	return rows;
};

/**
 * The one-dimensional `-u'' + c u'` on `size` points with `u = 0` beyond
 * both ends, upwind in `c`, and the linear interpolation from every other
 * point.
 */
const line = (size: number, c: number): SparseMatrix => {
	const builder = createRowBuilder(size);
	for (let row = 0; row < size; row++) {
		builder.add(row, 2 + Math.abs(c));
		if (row > 0) {
			builder.add(row - 1, -1 - Math.max(c, 0));
		}
		if (row + 1 < size) {
			builder.add(row + 1, -1 - Math.max(-c, 0));
		}
		builder.endRow();
	}
	return builder.finish();
};

/** Linear interpolation onto `2m + 1` points from the `m` odd ones. */
const interpolation = (coarse: number): SparseMatrix => {
	const builder = createRowBuilder(coarse);
	for (let row = 0; row < 2 * coarse + 1; row++) {
		if (row % 2 === 1) {
			builder.add((row - 1) / 2, 1);
		} else {
			if (row > 0) {
				builder.add(row / 2 - 1, 0.5);
			}
			if (row / 2 < coarse) {
				builder.add(row / 2, 0.5);
			}
		}
		builder.endRow();
	}
	return builder.finish();
};

describe('row builder', () => {
	it('adds entries of one column together and sorts each row', () => {
		const builder = createRowBuilder(30);
		builder.add(3, 1);
		builder.add(1, 2);
		builder.add(3, 4);
		builder.endRow();
		builder.endRow();
		// A long row, sorted another way.
		for (let column = 29; column >= 0; column--) {
			builder.add(column, column);
		}
		builder.endRow();
		const matrix = builder.finish();
		expect(matrix.rowCount).toBe(3);
		expect(Array.from(matrix.starts)).toEqual([0, 2, 2, 32]);
		expect(Array.from(matrix.columns.slice(0, 2))).toEqual([1, 3]);
		expect(Array.from(matrix.values.slice(0, 2))).toEqual([2, 5]);
		expect(Array.from(matrix.columns.slice(2))).toEqual(
			Array.from({ length: 30 }, (_, column) => column),
		);
		expect(Array.from(matrix.values.slice(2))).toEqual(
			Array.from({ length: 30 }, (_, column) => column),
		);
	});
});

describe('products', () => {
	const a = fromDense([
		[1, 2, 0],
		[0, 0, 3],
	]);
	const b = fromDense([
		[1, 0],
		[0, 1],
		[4, 5],
	]);

	it('multiply a vector, transpose and multiply matrices', () => {
		const y = new Float64Array(2);
		multiply(a, Float64Array.of(1, 1, 1), y);
		expect(Array.from(y)).toEqual([3, 3]);
		expect(toDense(transpose(a))).toEqual([
			[1, 0],
			[2, 0],
			[0, 3],
		]);
		expect(toDense(product(a, b))).toEqual([
			[1, 2],
			[12, 15],
		]);
	});

	it('refuse matrices whose sizes do not match', () => {
		expect(() => product(a, a)).toThrow(RangeError);
	});
});

describe('incomplete LU', () => {
	it('is exact for a matrix with no fill', () => {
		const matrix = line(6, 0.5);
		const diagonals = diagonalsOf(matrix);
		const factors = incompleteLU(matrix, diagonals);
		const x = Float64Array.of(1, -2, 3, 0.5, 4, -1);
		const b = new Float64Array(6);
		multiply(matrix, x, b);
		const z = new Float64Array(6);
		solveLU(matrix, diagonals, factors, b, z);
		for (let row = 0; row < 6; row++) {
			expect(z[row]).toBeCloseTo(x[row] as number, 12);
		}
	});

	it('keeps its factors finite when a pivot comes to zero', () => {
		const matrix = fromDense([
			[1, 1],
			[1, 1],
		]);
		const diagonals = diagonalsOf(matrix);
		const factors = incompleteLU(matrix, diagonals);
		const z = new Float64Array(2);
		solveLU(matrix, diagonals, factors, Float64Array.of(1, 2), z);
		expect(Array.from(z).every((value) => Number.isFinite(value))).toBe(true);
		const empty = fromDense([
			[1, 0],
			[0, 0],
		]);
		expect(() => diagonalsOf(empty)).toThrow(/Row 1/);
	});

	it('needs a square matrix', () => {
		expect(() => diagonalsOf(fromDense([[1, 2]]))).toThrow(/no diagonal/);
	});
});

describe('multigrid and BiCGSTAB', () => {
	it('solve a line of four thousand points in a few iterations, centred or upwind', () => {
		for (const c of [0, 0.5, 20]) {
			// 4095 points coarsened to 2047 and 1023, then solved directly at 511.
			const size = 4095;
			const matrix = line(size, c);
			const prolongations: SparseMatrix[] = [];
			for (let fine = size; fine > 1; fine = (fine - 1) / 2) {
				prolongations.push(interpolation((fine - 1) / 2));
			}
			const cycle = createMultigrid(matrix, prolongations);
			const x = new Float64Array(size);
			const b = new Float64Array(size).fill(1);
			const outcome = bicgstab(
				matrix,
				b,
				x,
				cycle,
				1e-10,
				100,
				createKrylovWork(size),
			);
			expect(outcome.converged).toBe(true);
			expect(outcome.iterations).toBeLessThan(15);
			const check = new Float64Array(size);
			multiply(matrix, x, check);
			for (let row = 0; row < size; row++) {
				expect(check[row]).toBeCloseTo(1, 6);
			}
		}
	});

	it('solve a small system directly, in one iteration', () => {
		const matrix = line(20, 1);
		const cycle = createMultigrid(matrix, [interpolation(9)]);
		const x = new Float64Array(20);
		const outcome = bicgstab(
			matrix,
			new Float64Array(20).fill(1),
			x,
			cycle,
			1e-12,
			10,
			createKrylovWork(20),
		);
		expect(outcome).toMatchObject({ converged: true, iterations: 1 });
	});

	it('give zero at once for a right-hand side of zero', () => {
		const matrix = line(5, 0);
		const x = new Float64Array(5).fill(3);
		const outcome = bicgstab(
			matrix,
			new Float64Array(5),
			x,
			createMultigrid(matrix, []),
			1e-8,
			10,
			createKrylovWork(5),
		);
		expect(outcome).toEqual({ iterations: 0, converged: true, residual: 0 });
		expect(Array.from(x)).toEqual([0, 0, 0, 0, 0]);
	});

	it('stop when the iterations run out, and when the system is singular', () => {
		const size = 1023;
		const matrix = line(size, 0);
		const identity = (r: Float64Array, z: Float64Array): void => z.set(r);
		const x = new Float64Array(size);
		const outcome = bicgstab(
			matrix,
			new Float64Array(size).fill(1),
			x,
			identity,
			1e-12,
			3,
			createKrylovWork(size),
		);
		expect(outcome.iterations).toBe(3);
		expect(outcome.converged).toBe(false);
		const singular = fromDense([
			[1, -1],
			[-1, 1],
		]);
		const stuckX = new Float64Array(2);
		const stuck = bicgstab(
			singular,
			Float64Array.of(1, 1),
			stuckX,
			createMultigrid(singular, []),
			1e-12,
			20,
			createKrylovWork(2),
		);
		// `b` is orthogonal to the matrix's range, so every restart breaks
		// down at once and spends one iteration, leaving `x` at zero.
		expect(stuck).toEqual({ iterations: 20, converged: false, residual: 1 });
		expect(Array.from(stuckX)).toEqual([0, 0]);
	});

	it('restart when the residual overflows, until the iterations run out', () => {
		const identity = (r: Float64Array, z: Float64Array): void => z.set(r);
		const x = Float64Array.of(1e200, 1e200);
		// The residual's entries are finite but `dot(shadow, r)` overflows, so
		// each restart breaks down on its first iteration.
		const outcome = bicgstab(
			fromDense([
				[1, 0],
				[0, 1],
			]),
			Float64Array.of(1, 1),
			x,
			identity,
			1e-8,
			7,
			createKrylovWork(2),
		);
		expect(outcome).toEqual({
			iterations: 7,
			converged: false,
			residual: Number.POSITIVE_INFINITY,
		});
		expect(Array.from(x)).toEqual([1e200, 1e200]);
	});

	it('refuse a prolongation of the wrong size', () => {
		expect(() => createMultigrid(line(1023, 0), [interpolation(3)])).toThrow(
			RangeError,
		);
	});
});
