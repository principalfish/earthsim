/**
 * Heat exchange between neighbouring cells, and the linear systems it
 * leads to when time is stepped implicitly.
 *
 * Heat crosses every edge between two cells as a single flux,
 * `c · (T_j − T_i)`, added to one cell and taken from the other, where the
 * coupling `c` is a diffusivity times the edge's weight from
 * {@link edgeGeometry}. An implicit step of a cell-by-cell balance with that
 * exchange solves, for the new temperatures `x`,
 *
 * `m_i x_i + Σ_k c_ik (x_i − x_k) = b_i`
 *
 * for every cell `i` and its four neighbours `k`, where the mass `m_i` is
 * positive: the cell's area times its heat capacity over the step, plus
 * whatever else is treated implicitly. The matrix is symmetric, since every
 * edge has one coupling seen from both sides, and positive definite.
 *
 * The system is solved by conjugate gradients, preconditioned by one
 * multigrid cycle that merges cells two by two along each face axis down to
 * two cells per face edge. The coarse systems are formed from the fine one
 * exactly (masses summed, couplings across the merged cells' outer edges
 * summed), so they are of the same form, and the smallest is solved
 * directly. The cost of a solve then grows little with how stiff the
 * exchange is compared with the masses, which on the finest grid is very
 * stiff indeed.
 */

import { edgeGeometry, FACE_COUNT, type Grid, NEIGHBOUR_COUNT } from './grid';

/**
 * The number of neighbours of every cell, held here as a constant of this
 * module: a script runner that rewrites imports may read an imported
 * binding through a property each time, which is slow in a loop over every
 * cell.
 */
const SIDES = NEIGHBOUR_COUNT;

/** Cube faces, held here for the same reason as {@link SIDES}. */
const FACES = FACE_COUNT;

/**
 * A solver for one grid and one set of couplings, reused for many systems
 * that differ in their masses and right-hand sides.
 *
 * @remarks
 * It holds working memory of a few times the grid's size, so one is made
 * per solve of a whole year, not per step.
 */
export type ExchangeSolver = {
	/** The grid the systems are on. */
	readonly grid: Grid;
	/**
	 * Sets the masses of the systems that follow and prepares the
	 * preconditioner for them.
	 *
	 * @param mass - One positive, finite value per cell. Copied.
	 * @throws RangeError if `mass` has the wrong length or a value that is
	 * not positive and finite.
	 */
	setMass(mass: Float64Array): void;
	/**
	 * Solves the system for the masses last set.
	 *
	 * @remarks
	 * Stops when the estimated error, the root-mean-square of the error
	 * weighted by the masses, is below `tolerance`, or after the solver's
	 * most iterations, which the outcome reports. The constant part of the
	 * answer is then made exact: the answer is shifted by one value in
	 * every cell so that `Σ m_i x_i = Σ b_i`, which the exact answer
	 * satisfies because every edge's flux leaves one cell and enters the
	 * other. Heat moved by the
	 * exchange is therefore conserved to rounding whatever the tolerance.
	 *
	 * @param rhs - One value per cell. Not changed.
	 * @param x - On entry the first guess, on return the answer.
	 * @param tolerance - In the units of `x`, finite and above zero.
	 * @returns The iterations taken, and whether the estimated error came
	 * below `tolerance` within the most allowed.
	 * @throws RangeError if `tolerance` is not finite and above zero.
	 */
	solve(
		rhs: Float64Array,
		x: Float64Array,
		tolerance: number,
	): ExchangeSolveOutcome;
};

/** How a solve of {@link ExchangeSolver.solve} ended. */
export type ExchangeSolveOutcome = {
	/** The conjugate gradient iterations taken. */
	readonly iterations: number;
	/**
	 * Whether the estimated error came below the tolerance; false when the
	 * most iterations ran out first.
	 */
	readonly converged: boolean;
};

/** The most iterations one solve may take unless the solver is given fewer. */
export const EXCHANGE_MAX_ITERATIONS = 200;

/** Throws unless a tolerance is finite and above zero. */
const assertTolerance = (tolerance: number): void => {
	if (!(tolerance > 0 && Number.isFinite(tolerance))) {
		throw new RangeError(
			`A tolerance must be finite and above zero; got ${tolerance}`,
		);
	}
};

/** The smallest grid of the multigrid cycle, in cells per face edge. */
const COARSEST_N = 2;

/** One grid of the multigrid cycle, with its own working memory. */
type Level = {
	readonly n: number;
	readonly count: number;
	readonly neighbours: Int32Array;
	readonly coupling: Float64Array;
	/** The sum of each cell's couplings. */
	readonly couplingSum: Float64Array;
	readonly mass: Float64Array;
	/** The diagonal of the matrix: mass plus coupling sum. */
	readonly diagonal: Float64Array;
	/** The coarse cell each cell merges into; empty on the coarsest level. */
	readonly parent: Int32Array;
	/** The level's answer. */
	readonly x: Float64Array;
	/** The level's right-hand side. */
	readonly b: Float64Array;
};

/** The cell index of `(face, i, j)` on a grid of `n` cells per face edge. */
const indexOf = (n: number, face: number, i: number, j: number): number =>
	(face * n + j) * n + i;

const newLevel = (
	n: number,
	neighbours: Int32Array,
	coupling: Float64Array,
	x?: Float64Array,
	b?: Float64Array,
): Level => {
	const count = FACES * n * n;
	const couplingSum = new Float64Array(count);
	for (let cell = 0; cell < count; cell++) {
		const first = SIDES * cell;
		couplingSum[cell] =
			(coupling[first] as number) +
			(coupling[first + 1] as number) +
			(coupling[first + 2] as number) +
			(coupling[first + 3] as number);
	}
	return {
		n,
		count,
		neighbours,
		coupling,
		couplingSum,
		mass: new Float64Array(count),
		diagonal: new Float64Array(count),
		parent: new Int32Array(n > COARSEST_N ? count : 0),
		x: x ?? new Float64Array(count),
		b: b ?? new Float64Array(count),
	};
};

/**
 * The grid with half as many cells along each face axis, each cell merging
 * the 2 × 2 cells of the finer one it covers.
 *
 * @remarks
 * A coarse cell's neighbour on a side is the coarse cell holding the fine
 * neighbour of either fine cell on that side, which is the same coarse cell
 * across a cube edge too, since positions along an edge pair up the same
 * way whichever way the edge runs. Its coupling on that side is the sum of
 * the two fine couplings across it, the same two values seen from either
 * side, so the coarse couplings are as exactly symmetric as the fine.
 */
const coarsen = (fine: Level): Level => {
	const n = fine.n / 2;
	const count = FACES * n * n;
	const neighbours = new Int32Array(SIDES * count);
	const coupling = new Float64Array(SIDES * count);
	const { parent } = fine;
	for (let face = 0; face < FACES; face++) {
		for (let j = 0; j < fine.n; j++) {
			for (let i = 0; i < fine.n; i++) {
				parent[indexOf(fine.n, face, i, j)] = indexOf(n, face, i >> 1, j >> 1);
			}
		}
	}
	for (let face = 0; face < FACES; face++) {
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < n; i++) {
				const coarse = indexOf(n, face, i, j);
				// The two fine cells along each side, in neighbour order.
				const lowLow = indexOf(fine.n, face, 2 * i, 2 * j);
				const highLow = indexOf(fine.n, face, 2 * i + 1, 2 * j);
				const lowHigh = indexOf(fine.n, face, 2 * i, 2 * j + 1);
				const highHigh = indexOf(fine.n, face, 2 * i + 1, 2 * j + 1);
				const sides = [
					lowLow,
					lowHigh,
					highLow,
					highHigh,
					lowLow,
					highLow,
					lowHigh,
					highHigh,
				];
				for (let side = 0; side < SIDES; side++) {
					const a = SIDES * (sides[2 * side] as number) + side;
					const b = SIDES * (sides[2 * side + 1] as number) + side;
					const across = parent[fine.neighbours[a] as number] as number;
					if (parent[fine.neighbours[b] as number] !== across) {
						throw new Error(
							`Merged cells of a ${fine.n} grid do not line up across an edge`,
						);
					}
					const entry = SIDES * coarse + side;
					neighbours[entry] = across;
					// Both sides add the same two values, and addition of two
					// numbers gives the same result in either order.
					coupling[entry] =
						(fine.coupling[a] as number) + (fine.coupling[b] as number);
				}
			}
		}
	}
	return newLevel(n, neighbours, coupling);
};

/** y = M x on a level; gives `x · y`. */
const multiply = (level: Level, x: Float64Array, y: Float64Array): number => {
	const { count, neighbours, coupling, diagonal } = level;
	let product = 0;
	for (let cell = 0; cell < count; cell++) {
		const first = SIDES * cell;
		const value =
			(diagonal[cell] as number) * (x[cell] as number) -
			(coupling[first] as number) * (x[neighbours[first] as number] as number) -
			(coupling[first + 1] as number) *
				(x[neighbours[first + 1] as number] as number) -
			(coupling[first + 2] as number) *
				(x[neighbours[first + 2] as number] as number) -
			(coupling[first + 3] as number) *
				(x[neighbours[first + 3] as number] as number);
		y[cell] = value;
		product += (x[cell] as number) * value;
	}
	return product;
};

/**
 * One Gauss–Seidel sweep over a level, in place: forwards through the
 * cells, or backwards.
 */
const sweep = (level: Level, forwards: boolean): void => {
	const { count, neighbours, coupling, diagonal, x, b } = level;
	const step = forwards ? 1 : -1;
	const end = forwards ? count : -1;
	for (let cell = forwards ? 0 : count - 1; cell !== end; cell += step) {
		const first = SIDES * cell;
		x[cell] =
			((b[cell] as number) +
				(coupling[first] as number) *
					(x[neighbours[first] as number] as number) +
				(coupling[first + 1] as number) *
					(x[neighbours[first + 1] as number] as number) +
				(coupling[first + 2] as number) *
					(x[neighbours[first + 2] as number] as number) +
				(coupling[first + 3] as number) *
					(x[neighbours[first + 3] as number] as number)) /
			(diagonal[cell] as number);
	}
};

/**
 * The residual `b − M x` of a level, summed over the cells each coarse cell
 * merges, as the coarse level's right-hand side.
 */
const restrictResidual = (level: Level, coarse: Level): void => {
	const { count, neighbours, coupling, diagonal, x, b, parent } = level;
	const into = coarse.b;
	into.fill(0);
	for (let cell = 0; cell < count; cell++) {
		const first = SIDES * cell;
		const residual =
			(b[cell] as number) -
			(diagonal[cell] as number) * (x[cell] as number) +
			(coupling[first] as number) * (x[neighbours[first] as number] as number) +
			(coupling[first + 1] as number) *
				(x[neighbours[first + 1] as number] as number) +
			(coupling[first + 2] as number) *
				(x[neighbours[first + 2] as number] as number) +
			(coupling[first + 3] as number) *
				(x[neighbours[first + 3] as number] as number);
		const target = parent[cell] as number;
		into[target] = (into[target] as number) + residual;
	}
};

/**
 * Factorises a small dense symmetric positive definite matrix, given as
 * rows, in place into its lower Cholesky factor.
 */
const choleskyFactor = (matrix: Float64Array, size: number): void => {
	for (let column = 0; column < size; column++) {
		let pivot = matrix[column * size + column] as number;
		for (let k = 0; k < column; k++) {
			const value = matrix[column * size + k] as number;
			pivot -= value * value;
		}
		const root = Math.sqrt(pivot);
		matrix[column * size + column] = root;
		for (let row = column + 1; row < size; row++) {
			let value = matrix[row * size + column] as number;
			for (let k = 0; k < column; k++) {
				value -=
					(matrix[row * size + k] as number) *
					(matrix[column * size + k] as number);
			}
			matrix[row * size + column] = value / root;
		}
	}
};

/** Solves with a factor from {@link choleskyFactor}, `b` into `x`. */
const choleskySolve = (
	factor: Float64Array,
	size: number,
	b: Float64Array,
	x: Float64Array,
): void => {
	for (let row = 0; row < size; row++) {
		let value = b[row] as number;
		for (let k = 0; k < row; k++) {
			value -= (factor[row * size + k] as number) * (x[k] as number);
		}
		x[row] = value / (factor[row * size + row] as number);
	}
	for (let row = size - 1; row >= 0; row--) {
		let value = x[row] as number;
		for (let k = row + 1; k < size; k++) {
			value -= (factor[k * size + row] as number) * (x[k] as number);
		}
		x[row] = value / (factor[row * size + row] as number);
	}
};

/**
 * A solver for the exchange systems on a grid with the given couplings.
 *
 * @param grid - The grid.
 * @param coupling - The coupling of every edge, `4 * cellCount` long and laid
 * out like {@link Grid.neighbours}, each positive and finite, and exactly
 * equal from both sides of an edge. Copied.
 * @param maxIterations - The most iterations one solve may take, a whole
 * number from 1; defaults to {@link EXCHANGE_MAX_ITERATIONS}.
 * @throws RangeError if `coupling` has the wrong length or a value that is
 * not positive and finite, or `maxIterations` is not a whole number from 1.
 */
export const createExchangeSolver = (
	grid: Grid,
	coupling: Float64Array,
	maxIterations: number = EXCHANGE_MAX_ITERATIONS,
): ExchangeSolver => {
	if (coupling.length !== SIDES * grid.cellCount) {
		throw new RangeError(
			`A grid of ${grid.cellCount} cells has ${SIDES * grid.cellCount} couplings; got ${coupling.length}`,
		);
	}
	if (!(Number.isInteger(maxIterations) && maxIterations >= 1)) {
		throw new RangeError(
			`The most iterations must be a whole number from 1; got ${maxIterations}`,
		);
	}
	for (let entry = 0; entry < coupling.length; entry++) {
		const value = coupling[entry] as number;
		if (!(value > 0 && Number.isFinite(value))) {
			throw new RangeError(
				`Every coupling must be positive and finite; entry ${entry} is ${value}`,
			);
		}
	}
	const count = grid.cellCount;
	// The finest level's right-hand side and answer are the conjugate
	// gradient's residual and preconditioned residual.
	const residual = new Float64Array(count);
	const preconditioned = new Float64Array(count);
	const levels: Level[] = [
		newLevel(
			grid.n,
			grid.neighbours,
			Float64Array.from(coupling),
			preconditioned,
			residual,
		),
	];
	while ((levels[levels.length - 1] as Level).n > COARSEST_N) {
		levels.push(coarsen(levels[levels.length - 1] as Level));
	}
	const coarsest = levels[levels.length - 1] as Level;
	const coarseSize = coarsest.count;
	const factor = new Float64Array(coarseSize * coarseSize);

	const top = levels[0] as Level;
	const direction = new Float64Array(count);
	const product = new Float64Array(count);
	let massTotal = 0;

	const setMass = (mass: Float64Array): void => {
		if (mass.length !== count) {
			throw new RangeError(
				`A grid of ${count} cells has ${count} masses; got ${mass.length}`,
			);
		}
		for (let cell = 0; cell < count; cell++) {
			const value = mass[cell] as number;
			if (!(value > 0 && Number.isFinite(value))) {
				throw new RangeError(
					`Every mass must be positive and finite; cell ${cell} has ${value}`,
				);
			}
		}
		top.mass.set(mass);
		for (let index = 1; index < levels.length; index++) {
			const fine = levels[index - 1] as Level;
			const coarse = levels[index] as Level;
			coarse.mass.fill(0);
			for (let cell = 0; cell < fine.count; cell++) {
				const into = fine.parent[cell] as number;
				coarse.mass[into] =
					(coarse.mass[into] as number) + (fine.mass[cell] as number);
			}
		}
		for (const level of levels) {
			for (let cell = 0; cell < level.count; cell++) {
				level.diagonal[cell] =
					(level.mass[cell] as number) + (level.couplingSum[cell] as number);
			}
		}
		factor.fill(0);
		for (let cell = 0; cell < coarseSize; cell++) {
			factor[cell * coarseSize + cell] = coarsest.diagonal[cell] as number;
			for (let side = 0; side < SIDES; side++) {
				const entry = SIDES * cell + side;
				const other = coarsest.neighbours[entry] as number;
				factor[cell * coarseSize + other] =
					(factor[cell * coarseSize + other] as number) -
					(coarsest.coupling[entry] as number);
			}
		}
		choleskyFactor(factor, coarseSize);
		let total = 0;
		for (let cell = 0; cell < count; cell++) {
			total += mass[cell] as number;
		}
		massTotal = total;
	};

	/**
	 * One multigrid cycle from zero for the right-hand side in `level.b`,
	 * leaving the result in `level.x`: a forward Gauss–Seidel sweep, the
	 * correction from the coarser level, and a backward sweep, which
	 * together make a symmetric positive definite preconditioner.
	 */
	const cycle = (depth: number): void => {
		const level = levels[depth] as Level;
		if (depth === levels.length - 1) {
			choleskySolve(factor, coarseSize, level.b, level.x);
			return;
		}
		const { x, parent } = level;
		x.fill(0);
		sweep(level, true);
		const coarse = levels[depth + 1] as Level;
		restrictResidual(level, coarse);
		cycle(depth + 1);
		const correction = coarse.x;
		for (let cell = 0; cell < level.count; cell++) {
			x[cell] =
				(x[cell] as number) + (correction[parent[cell] as number] as number);
		}
		sweep(level, false);
	};

	const solve = (
		rhs: Float64Array,
		x: Float64Array,
		tolerance: number,
	): ExchangeSolveOutcome => {
		assertTolerance(tolerance);
		multiply(top, x, product);
		for (let cell = 0; cell < count; cell++) {
			residual[cell] = (rhs[cell] as number) - (product[cell] as number);
		}
		cycle(0);
		let rz = 0;
		for (let cell = 0; cell < count; cell++) {
			rz += (residual[cell] as number) * (preconditioned[cell] as number);
		}
		direction.set(preconditioned);
		// rᵀ z, with z the preconditioned residual, estimates rᵀ M⁻¹ r: the
		// squared error in the norm of M, which is at least the mass-weighted
		// sum of squared errors. It is an estimate, as good as the
		// preconditioner is close to M⁻¹, not a bound.
		const limit = tolerance * tolerance * massTotal;
		let iterations = 0;
		while (rz > limit && iterations < maxIterations) {
			const step = rz / multiply(top, direction, product);
			for (let cell = 0; cell < count; cell++) {
				x[cell] = (x[cell] as number) + step * (direction[cell] as number);
				residual[cell] =
					(residual[cell] as number) - step * (product[cell] as number);
			}
			cycle(0);
			let next = 0;
			for (let cell = 0; cell < count; cell++) {
				next += (residual[cell] as number) * (preconditioned[cell] as number);
			}
			const ratio = next / rz;
			rz = next;
			for (let cell = 0; cell < count; cell++) {
				direction[cell] =
					(preconditioned[cell] as number) +
					ratio * (direction[cell] as number);
			}
			iterations++;
		}
		conserve(top.mass, massTotal, rhs, x);
		return { iterations, converged: rz <= limit };
	};

	return { grid, setMass, solve };
};

/**
 * Shifts `x` by one value in every cell so that `Σ m_i x_i = Σ b_i`, with
 * both sums compensated for rounding.
 */
const conserve = (
	mass: Float64Array,
	massTotal: number,
	rhs: Float64Array,
	x: Float64Array,
): void => {
	let sum = 0;
	let compensation = 0;
	const add = (value: number): void => {
		const total = sum + value;
		compensation +=
			Math.abs(sum) >= Math.abs(value)
				? sum - total + value
				: value - total + sum;
		sum = total;
	};
	for (let cell = 0; cell < x.length; cell++) {
		add(rhs[cell] as number);
		add(-(mass[cell] as number) * (x[cell] as number));
	}
	const shift = (sum + compensation) / massTotal;
	for (let cell = 0; cell < x.length; cell++) {
		x[cell] = (x[cell] as number) + shift;
	}
};

/**
 * The couplings of every edge of a grid for one diffusivity: the
 * diffusivity times the edge's weight.
 *
 * @param grid - The grid.
 * @param diffusivity - The exchange's strength, in watts per square metre
 * per kelvin on the unit sphere; positive and finite.
 * @returns A new array laid out like {@link Grid.neighbours}.
 */
export const uniformCoupling = (
	grid: Grid,
	diffusivity: number,
): Float64Array => {
	const { weights } = edgeGeometry(grid);
	const coupling = new Float64Array(weights.length);
	for (let entry = 0; entry < weights.length; entry++) {
		coupling[entry] = diffusivity * (weights[entry] as number);
	}
	return coupling;
};

/**
 * One implicit (backward Euler) step of heat exchange alone, with nothing
 * gained or lost: each cell's heat capacity times its change of
 * temperature equals the heat its edges carry in over the step, at the
 * temperatures the step ends with.
 *
 * @remarks
 * Heat is the cell's area times its heat capacity times its temperature;
 * its area-weighted total is the same after the step as before, to
 * rounding. The step is stable however long it is, and a long step spreads
 * heat further.
 *
 * @param grid - The grid.
 * @param temperature - One value per cell, in kelvin. Not changed.
 * @param heatCapacity - One positive, finite value per cell, in joules per
 * square metre per kelvin.
 * @param seconds - The length of the step, above zero.
 * @param diffusivity - The exchange's strength, in watts per square metre
 * per kelvin on the unit sphere; positive and finite.
 * @param tolerance - The accuracy to solve to, in kelvin, as for
 * {@link ExchangeSolver.solve}; defaults to 1e-9.
 * @returns The temperatures after the step, in a new array.
 * @throws RangeError if an array has the wrong length, a heat capacity is
 * not positive and finite, or `seconds`, `diffusivity` or `tolerance` is
 * not positive and finite.
 * @throws Error if the step's equations could not be solved to
 * `tolerance` within {@link EXCHANGE_MAX_ITERATIONS}.
 */
export const exchangeHeat = (
	grid: Grid,
	temperature: Float64Array,
	heatCapacity: Float64Array,
	seconds: number,
	diffusivity: number,
	tolerance = 1e-9,
): Float64Array => {
	const { cellCount, areas } = grid;
	if (temperature.length !== cellCount || heatCapacity.length !== cellCount) {
		throw new RangeError(
			`A grid of ${cellCount} cells needs ${cellCount} temperatures and heat capacities`,
		);
	}
	if (!(seconds > 0 && Number.isFinite(seconds))) {
		throw new RangeError(`A step must last a positive time; got ${seconds}`);
	}
	if (!(diffusivity > 0 && Number.isFinite(diffusivity))) {
		throw new RangeError(
			`A diffusivity must be positive and finite; got ${diffusivity}`,
		);
	}
	assertTolerance(tolerance);
	const solver = createExchangeSolver(grid, uniformCoupling(grid, diffusivity));
	const mass = new Float64Array(cellCount);
	const rhs = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		mass[cell] =
			((areas[cell] as number) * (heatCapacity[cell] as number)) / seconds;
		rhs[cell] = (mass[cell] as number) * (temperature[cell] as number);
	}
	solver.setMass(mass);
	const next = Float64Array.from(temperature);
	const { iterations, converged } = solver.solve(rhs, next, tolerance);
	if (!converged) {
		throw new Error(
			`Heat exchange was not solved to ${tolerance} K in ${iterations} iterations`,
		);
	}
	return next;
};
