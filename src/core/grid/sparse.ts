/**
 * Sparse matrices stored by rows, and the linear algebra the corner solver
 * of `corners.ts` is built from: products and transposes, an incomplete LU
 * factorisation with no fill, a dense LU for the smallest systems, a
 * multigrid cycle over Galerkin coarse systems, and BiCGSTAB.
 *
 * Nothing here knows of the grid. A matrix's columns are in increasing order
 * within each row, which the factorisation relies on to find the entries
 * below and above the diagonal.
 */

/** A sparse matrix, row by row. */
export type SparseMatrix = {
	/** The number of rows. */
	readonly rowCount: number;
	/** The number of columns. */
	readonly columnCount: number;
	/** Where each row's entries begin, and at `rowCount` where they end. */
	readonly starts: Int32Array;
	/** Each entry's column, increasing within each row. */
	readonly columns: Int32Array;
	/** Each entry's value. */
	readonly values: Float64Array;
};

/**
 * Builds a {@link SparseMatrix} a row at a time: entries for the same
 * column of a row are added together.
 */
export type RowBuilder = {
	/** Adds `value` to the current row's entry in `column`. */
	add(column: number, value: number): void;
	/** Ends the current row and begins the next. */
	endRow(): void;
	/** The rows ended so far, as a matrix. */
	finish(): SparseMatrix;
};

/** How a BiCGSTAB solve ended. */
export type KrylovOutcome = {
	/** The iterations taken. */
	readonly iterations: number;
	/** Whether the residual came within the tolerance. */
	readonly converged: boolean;
	/** The true residual at the end, as a share of the right-hand side's. */
	readonly residual: number;
};

/** A preconditioner: writes an approximation to `A⁻¹ r` into `z`. */
export type Preconditioner = (r: Float64Array, z: Float64Array) => void;

/** The working memory of {@link bicgstab} for systems of one size. */
export type KrylovWork = {
	readonly r: Float64Array;
	readonly shadow: Float64Array;
	readonly p: Float64Array;
	readonly v: Float64Array;
	readonly s: Float64Array;
	readonly t: Float64Array;
	readonly pHat: Float64Array;
	readonly sHat: Float64Array;
};

/** Rows longer than this are sorted by the typed array's own sort. */
const SHORT_ROW = 16;

/**
 * A {@link RowBuilder} for a matrix of `columnCount` columns.
 *
 * @param columnCount - The number of columns: a whole number from 0.
 */
export const createRowBuilder = (columnCount: number): RowBuilder => {
	const sums = new Float64Array(columnCount);
	const present = new Uint8Array(columnCount);
	let row: number[] = [];
	const starts: number[] = [0];
	const columns: number[] = [];
	const values: number[] = [];
	return {
		add(column, value) {
			if (present[column] === 0) {
				present[column] = 1;
				row.push(column);
			}
			sums[column] = (sums[column] as number) + value;
		},
		endRow() {
			if (row.length > SHORT_ROW) {
				row = Array.from(Int32Array.from(row).sort());
			} else {
				for (let at = 1; at < row.length; at++) {
					const column = row[at] as number;
					let place = at;
					while (place > 0 && (row[place - 1] as number) > column) {
						row[place] = row[place - 1] as number;
						place--;
					}
					row[place] = column;
				}
			}
			for (const column of row) {
				columns.push(column);
				values.push(sums[column] as number);
				sums[column] = 0;
				present[column] = 0;
			}
			row.length = 0;
			starts.push(columns.length);
		},
		finish() {
			return {
				rowCount: starts.length - 1,
				columnCount,
				starts: Int32Array.from(starts),
				columns: Int32Array.from(columns),
				values: Float64Array.from(values),
			};
		},
	};
};

/** `y = A x`. */
export const multiply = (
	matrix: SparseMatrix,
	x: Float64Array,
	y: Float64Array,
): void => {
	const { rowCount, starts, columns, values } = matrix;
	for (let row = 0; row < rowCount; row++) {
		let sum = 0;
		const end = starts[row + 1] as number;
		for (let entry = starts[row] as number; entry < end; entry++) {
			sum +=
				(values[entry] as number) * (x[columns[entry] as number] as number);
		}
		y[row] = sum;
	}
};

/** `y = y + A x`. */
const multiplyAdd = (
	matrix: SparseMatrix,
	x: Float64Array,
	y: Float64Array,
): void => {
	const { rowCount, starts, columns, values } = matrix;
	for (let row = 0; row < rowCount; row++) {
		let sum = y[row] as number;
		const end = starts[row + 1] as number;
		for (let entry = starts[row] as number; entry < end; entry++) {
			sum +=
				(values[entry] as number) * (x[columns[entry] as number] as number);
		}
		y[row] = sum;
	}
};

/** The transpose of a matrix, its columns in increasing order. */
export const transpose = (matrix: SparseMatrix): SparseMatrix => {
	const { rowCount, columnCount, starts, columns, values } = matrix;
	const counts = new Int32Array(columnCount + 1);
	for (let entry = 0; entry < columns.length; entry++) {
		const column = columns[entry] as number;
		counts[column + 1] = (counts[column + 1] as number) + 1;
	}
	for (let column = 0; column < columnCount; column++) {
		counts[column + 1] =
			(counts[column + 1] as number) + (counts[column] as number);
	}
	const outStarts = counts.slice();
	const outColumns = new Int32Array(columns.length);
	const outValues = new Float64Array(columns.length);
	const next = counts.slice(0, columnCount);
	for (let row = 0; row < rowCount; row++) {
		const end = starts[row + 1] as number;
		for (let entry = starts[row] as number; entry < end; entry++) {
			const column = columns[entry] as number;
			const at = next[column] as number;
			outColumns[at] = row;
			outValues[at] = values[entry] as number;
			next[column] = at + 1;
		}
	}
	return {
		rowCount: columnCount,
		columnCount: rowCount,
		starts: outStarts,
		columns: outColumns,
		values: outValues,
	};
};

/**
 * The product `A B`.
 *
 * @throws RangeError if the matrices' sizes do not match.
 */
export const product = (a: SparseMatrix, b: SparseMatrix): SparseMatrix => {
	if (a.columnCount !== b.rowCount) {
		throw new RangeError(
			`A matrix of ${a.columnCount} columns cannot multiply one of ${b.rowCount} rows`,
		);
	}
	const builder = createRowBuilder(b.columnCount);
	for (let row = 0; row < a.rowCount; row++) {
		const end = a.starts[row + 1] as number;
		for (let entry = a.starts[row] as number; entry < end; entry++) {
			const k = a.columns[entry] as number;
			const factor = a.values[entry] as number;
			const kEnd = b.starts[k + 1] as number;
			for (let inner = b.starts[k] as number; inner < kEnd; inner++) {
				builder.add(
					b.columns[inner] as number,
					factor * (b.values[inner] as number),
				);
			}
		}
		builder.endRow();
	}
	return builder.finish();
};

/**
 * Where each row's diagonal entry is in a square matrix.
 *
 * @throws Error if the matrix is not square or a row has no diagonal entry.
 */
export const diagonalsOf = (matrix: SparseMatrix): Int32Array => {
	const { rowCount, columnCount, starts, columns } = matrix;
	if (rowCount !== columnCount) {
		throw new Error(
			`A matrix of ${rowCount} rows and ${columnCount} columns has no diagonal`,
		);
	}
	const diagonals = new Int32Array(rowCount);
	for (let row = 0; row < rowCount; row++) {
		let entry = starts[row] as number;
		const end = starts[row + 1] as number;
		while (entry < end && columns[entry] !== row) {
			entry++;
		}
		if (entry === end) {
			throw new Error(`Row ${row} of the matrix has no diagonal entry`);
		}
		diagonals[row] = entry;
	}
	return diagonals;
};

/**
 * The incomplete LU factors of a square matrix on its own pattern: `L`,
 * with a unit diagonal, below the diagonal and `U` on and above it, in one
 * array of values laid out as the matrix's.
 *
 * @remarks
 * Exact for a matrix with no fill, such as a tridiagonal one. A pivot that
 * comes to zero or below, which for an M-matrix only rounding can make, is
 * replaced by the largest entry of its row, so the factors stay finite.
 *
 * @param matrix - A square matrix. Not changed.
 * @param diagonals - Where its diagonal entries are, from
 * {@link diagonalsOf}.
 * @returns The factors' values, in a new array.
 */
export const incompleteLU = (
	matrix: SparseMatrix,
	diagonals: Int32Array,
): Float64Array => {
	const { rowCount, starts, columns } = matrix;
	const values = matrix.values.slice();
	const position = new Int32Array(rowCount).fill(-1);
	for (let row = 0; row < rowCount; row++) {
		const start = starts[row] as number;
		const end = starts[row + 1] as number;
		for (let entry = start; entry < end; entry++) {
			position[columns[entry] as number] = entry;
		}
		const diagonal = diagonals[row] as number;
		for (let entry = start; entry < diagonal; entry++) {
			const k = columns[entry] as number;
			const factor =
				(values[entry] as number) / (values[diagonals[k] as number] as number);
			values[entry] = factor;
			const kEnd = starts[k + 1] as number;
			for (let upper = (diagonals[k] as number) + 1; upper < kEnd; upper++) {
				const target = position[columns[upper] as number] as number;
				if (target >= 0) {
					values[target] =
						(values[target] as number) - factor * (values[upper] as number);
				}
			}
		}
		if (!((values[diagonal] as number) > 0)) {
			let largest = 0;
			for (let entry = start; entry < end; entry++) {
				largest = Math.max(largest, Math.abs(values[entry] as number));
			}
			values[diagonal] = largest > 0 ? largest : 1;
		}
		for (let entry = start; entry < end; entry++) {
			position[columns[entry] as number] = -1;
		}
	}
	return values;
};

/** `z = (L U)⁻¹ r`, from the factors {@link incompleteLU} gives. */
export const solveLU = (
	matrix: SparseMatrix,
	diagonals: Int32Array,
	factors: Float64Array,
	r: Float64Array,
	z: Float64Array,
): void => {
	const { rowCount, starts, columns } = matrix;
	for (let row = 0; row < rowCount; row++) {
		let sum = r[row] as number;
		const diagonal = diagonals[row] as number;
		for (let entry = starts[row] as number; entry < diagonal; entry++) {
			sum -=
				(factors[entry] as number) * (z[columns[entry] as number] as number);
		}
		z[row] = sum;
	}
	for (let row = rowCount - 1; row >= 0; row--) {
		let sum = z[row] as number;
		const diagonal = diagonals[row] as number;
		const end = starts[row + 1] as number;
		for (let entry = diagonal + 1; entry < end; entry++) {
			sum -=
				(factors[entry] as number) * (z[columns[entry] as number] as number);
		}
		z[row] = sum / (factors[diagonal] as number);
	}
};

/** A dense LU factorisation with partial pivoting. */
type DenseLU = {
	readonly size: number;
	readonly lu: Float64Array;
	readonly pivots: Int32Array;
};

const denseFactorise = (matrix: SparseMatrix): DenseLU => {
	const size = matrix.rowCount;
	const lu = new Float64Array(size * size);
	for (let row = 0; row < size; row++) {
		const end = matrix.starts[row + 1] as number;
		for (let entry = matrix.starts[row] as number; entry < end; entry++) {
			lu[row * size + (matrix.columns[entry] as number)] = matrix.values[
				entry
			] as number;
		}
	}
	const pivots = new Int32Array(size);
	for (let k = 0; k < size; k++) {
		let best = k;
		let largest = Math.abs(lu[k * size + k] as number);
		for (let row = k + 1; row < size; row++) {
			const magnitude = Math.abs(lu[row * size + k] as number);
			if (magnitude > largest) {
				largest = magnitude;
				best = row;
			}
		}
		pivots[k] = best;
		if (best !== k) {
			for (let column = 0; column < size; column++) {
				const held = lu[k * size + column] as number;
				lu[k * size + column] = lu[best * size + column] as number;
				lu[best * size + column] = held;
			}
		}
		// A singular system is given a unit pivot so the cycle stays finite;
		// the Krylov solve around it then fails to converge rather than
		// giving numbers that are not.
		if (largest === 0) {
			lu[k * size + k] = 1;
		}
		const pivot = lu[k * size + k] as number;
		for (let row = k + 1; row < size; row++) {
			const factor = (lu[row * size + k] as number) / pivot;
			lu[row * size + k] = factor;
			if (factor !== 0) {
				for (let column = k + 1; column < size; column++) {
					lu[row * size + column] =
						(lu[row * size + column] as number) -
						factor * (lu[k * size + column] as number);
				}
			}
		}
	}
	return { size, lu, pivots };
};

const denseSolve = (
	factors: DenseLU,
	b: Float64Array,
	x: Float64Array,
): void => {
	const { size, lu, pivots } = factors;
	x.set(b);
	for (let k = 0; k < size; k++) {
		const swap = pivots[k] as number;
		if (swap !== k) {
			const held = x[k] as number;
			x[k] = x[swap] as number;
			x[swap] = held;
		}
		const value = x[k] as number;
		for (let row = k + 1; row < size; row++) {
			x[row] = (x[row] as number) - (lu[row * size + k] as number) * value;
		}
	}
	for (let row = size - 1; row >= 0; row--) {
		let sum = x[row] as number;
		for (let column = row + 1; column < size; column++) {
			sum -= (lu[row * size + column] as number) * (x[column] as number);
		}
		x[row] = sum / (lu[row * size + row] as number);
	}
};

/** One level of a multigrid hierarchy, with its own working memory. */
type Level = {
	readonly matrix: SparseMatrix;
	readonly diagonals: Int32Array;
	readonly factors: Float64Array;
	/** From the next coarser level's unknowns to this one's. */
	readonly prolong: SparseMatrix;
	/** The transpose of {@link Level.prolong}. */
	readonly restrict: SparseMatrix;
	readonly r: Float64Array;
	readonly z: Float64Array;
};

/** The size below which a level is solved directly rather than coarsened. */
const DIRECT_SIZE = 600;

/**
 * A multigrid V-cycle for a square matrix, as a {@link Preconditioner}:
 * from a guess of zero, one smoothing step, the residual restricted to the
 * next coarser level and corrected there by the same cycle, the correction
 * prolonged back, and one more smoothing step. The smoother is the
 * incomplete LU factorisation of each level's matrix, and each coarser
 * matrix is the Galerkin product `Pᵀ A P`. The coarsest level, the last
 * prolongation's or the first smaller than a few hundred unknowns, is
 * solved directly by dense LU, whose time grows with the cube of its
 * unknowns and memory with the square: eight bytes per pair.
 *
 * @param matrix - The finest level's matrix, with a diagonal entry in every
 * row.
 * @param prolongations - The prolongations from each coarser level to the
 * level above it, finest first: the first has a row per unknown of
 * `matrix`, and each has as many columns as the next has rows.
 * @returns The cycle: `cycle(r, z)` writes into `z` the approximation to
 * `A⁻¹ r`. It is linear in `r`.
 * @throws RangeError if the prolongations' sizes do not match.
 */
export const createMultigrid = (
	matrix: SparseMatrix,
	prolongations: readonly SparseMatrix[],
): Preconditioner => {
	const levels: Level[] = [];
	let current = matrix;
	for (const prolong of prolongations) {
		if (current.rowCount <= DIRECT_SIZE) {
			break;
		}
		if (prolong.rowCount !== current.rowCount) {
			throw new RangeError(
				`A prolongation of ${prolong.rowCount} rows cannot follow a level of ${current.rowCount} unknowns`,
			);
		}
		const restrict = transpose(prolong);
		const diagonals = diagonalsOf(current);
		levels.push({
			matrix: current,
			diagonals,
			factors: incompleteLU(current, diagonals),
			prolong,
			restrict,
			r: new Float64Array(current.rowCount),
			z: new Float64Array(current.rowCount),
		});
		current = product(restrict, product(current, prolong));
	}
	const coarsest = denseFactorise(current);
	const bottomB = new Float64Array(current.rowCount);
	const bottomX = new Float64Array(current.rowCount);
	const rights = levels.map((_, at) =>
		at + 1 < levels.length
			? new Float64Array((levels[at + 1] as Level).matrix.rowCount)
			: bottomB,
	);
	const answers = levels.map((_, at) =>
		at + 1 < levels.length
			? new Float64Array((levels[at + 1] as Level).matrix.rowCount)
			: bottomX,
	);

	const cycle = (at: number, b: Float64Array, x: Float64Array): void => {
		const level = levels[at];
		if (level === undefined) {
			denseSolve(coarsest, b, x);
			return;
		}
		const { matrix: a, diagonals, factors, prolong, restrict, r, z } = level;
		const size = a.rowCount;
		solveLU(a, diagonals, factors, b, x);
		multiply(a, x, r);
		for (let row = 0; row < size; row++) {
			r[row] = (b[row] as number) - (r[row] as number);
		}
		const coarseB = rights[at] as Float64Array;
		const coarseX = answers[at] as Float64Array;
		multiply(restrict, r, coarseB);
		cycle(at + 1, coarseB, coarseX);
		multiplyAdd(prolong, coarseX, x);
		multiply(a, x, r);
		for (let row = 0; row < size; row++) {
			r[row] = (b[row] as number) - (r[row] as number);
		}
		solveLU(a, diagonals, factors, r, z);
		for (let row = 0; row < size; row++) {
			x[row] = (x[row] as number) + (z[row] as number);
		}
	};
	return (r, z) => cycle(0, r, z);
};

/** Working memory for {@link bicgstab} on systems of `size` unknowns. */
export const createKrylovWork = (size: number): KrylovWork => ({
	r: new Float64Array(size),
	shadow: new Float64Array(size),
	p: new Float64Array(size),
	v: new Float64Array(size),
	s: new Float64Array(size),
	t: new Float64Array(size),
	pHat: new Float64Array(size),
	sHat: new Float64Array(size),
});

const dot = (a: Float64Array, b: Float64Array): number => {
	let sum = 0;
	for (let entry = 0; entry < a.length; entry++) {
		sum += (a[entry] as number) * (b[entry] as number);
	}
	return sum;
};

/** `r = b − A x`, and its length. */
const residualOf = (
	matrix: SparseMatrix,
	b: Float64Array,
	x: Float64Array,
	r: Float64Array,
): number => {
	multiply(matrix, x, r);
	let squares = 0;
	for (let row = 0; row < r.length; row++) {
		const left = (b[row] as number) - (r[row] as number);
		r[row] = left;
		squares += left * left;
	}
	return Math.sqrt(squares);
};

/**
 * Solves `A x = b` by preconditioned BiCGSTAB.
 *
 * @remarks
 * Stops when the true residual's length is at most `tolerance` times the
 * right-hand side's, or after `maxIterations`. The iteration is begun
 * again from the true residual whenever its own residual reaches the target
 * or it breaks down, so what is reported is always the true residual, and
 * every iteration counts towards the most allowed: it cannot run for ever.
 * A right-hand side of zero gives `x` of zero at once.
 *
 * @param matrix - The square matrix `A`.
 * @param b - The right-hand side. Not changed.
 * @param x - On entry the first guess, on return the answer.
 * @param precondition - An approximation to `A⁻¹`.
 * @param tolerance - Finite and above zero.
 * @param maxIterations - A whole number from 1.
 * @param work - Working memory of the system's size.
 */
export const bicgstab = (
	matrix: SparseMatrix,
	b: Float64Array,
	x: Float64Array,
	precondition: Preconditioner,
	tolerance: number,
	maxIterations: number,
	work: KrylovWork,
): KrylovOutcome => {
	const { r, shadow, p, v, s, t, pHat, sHat } = work;
	const size = b.length;
	const scale = Math.sqrt(dot(b, b));
	if (scale === 0) {
		x.fill(0);
		return { iterations: 0, converged: true, residual: 0 };
	}
	const target = tolerance * scale;
	let iterations = 0;
	let left = residualOf(matrix, b, x, r);
	while (left > target && iterations < maxIterations) {
		shadow.set(r);
		p.fill(0);
		v.fill(0);
		let rho = 1;
		let alpha = 1;
		let omega = 1;
		while (iterations < maxIterations) {
			iterations++;
			const rhoNext = dot(shadow, r);
			if (rhoNext === 0 || !Number.isFinite(rhoNext)) {
				break;
			}
			const beta = (rhoNext / rho) * (alpha / omega);
			for (let row = 0; row < size; row++) {
				p[row] =
					(r[row] as number) +
					beta * ((p[row] as number) - omega * (v[row] as number));
			}
			precondition(p, pHat);
			multiply(matrix, pHat, v);
			const along = dot(shadow, v);
			if (along === 0 || !Number.isFinite(along)) {
				break;
			}
			alpha = rhoNext / along;
			for (let row = 0; row < size; row++) {
				s[row] = (r[row] as number) - alpha * (v[row] as number);
			}
			if (Math.sqrt(dot(s, s)) <= target) {
				for (let row = 0; row < size; row++) {
					x[row] = (x[row] as number) + alpha * (pHat[row] as number);
				}
				break;
			}
			precondition(s, sHat);
			multiply(matrix, sHat, t);
			const tt = dot(t, t);
			omega = tt > 0 ? dot(t, s) / tt : 0;
			for (let row = 0; row < size; row++) {
				x[row] =
					(x[row] as number) +
					alpha * (pHat[row] as number) +
					omega * (sHat[row] as number);
				r[row] = (s[row] as number) - omega * (t[row] as number);
			}
			rho = rhoNext;
			if (omega === 0 || Math.sqrt(dot(r, r)) <= target) {
				break;
			}
		}
		left = residualOf(matrix, b, x, r);
	}
	const residual = left / scale;
	return { iterations, converged: residual <= tolerance, residual };
};
