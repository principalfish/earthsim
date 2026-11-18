/**
 * The flowing part of a wind: the wind with its converging and spreading
 * part taken out, so that what is left only goes round.
 *
 * A surface wind is strongly convergent: friction turns it in towards every
 * low and out of every high, and what flows in rises, which a model of the
 * surface alone cannot follow. Used to carry heat as it is, such a wind
 * would pile heat up where it converges and make it from nothing. Its
 * flowing part carries heat from place to place and makes none, and keeps
 * the large-scale pattern of the wind: the trades and the westerlies.
 *
 * The wind is first turned into what it carries across every edge between
 * cells, {@link edgeFlows}. The part to take out is the flow down the
 * gradient of a potential, chosen so that what is left carries as much into
 * every cell as out of it. That is a Poisson equation, solved with the
 * heat-exchange solver of {@link createExchangeSolver}, whose matrix is the
 * same sum over the edges, with the edge's own coupling, so the flow left
 * on every edge is exactly what the equation's solution leaves.
 *
 * The result is the flows across the edges and nothing else. A wind at the
 * cells' centres cannot be made to carry exactly nothing net in or out of
 * every cell: the operators that turn centre values into edge values and
 * back are not each other's inverse, and a wind rebuilt from the flows
 * keeps about a third of the original's divergence, mostly at the scale of
 * a cell. What carries heat is the flows.
 */

import { coarsenFlows, refineFlows } from '../grid/flows';
import {
	type Grid,
	getGrid,
	NEIGHBOUR_COUNT,
	type Resolution,
} from '../grid/grid';
import { edgeFlows, fromEastNorth } from '../grid/vector';
import {
	createExchangeSolver,
	type ExchangeSolver,
	uniformCoupling,
} from '../temperature/exchange';
import { PLANET_RADIUS_KM } from '../world/world';

/** The number of neighbours of every cell. */
const SIDES = NEIGHBOUR_COUNT;

/** The planet's radius in metres, which turns the winds' speeds into flows. */
const RADIUS_M = PLANET_RADIUS_KM * 1000;

/**
 * The mass of every cell in the solver, per unit of area. The system for
 * the potential has no mass of its own and is singular, so it is solved
 * with this small one, and the answer made exact by the rounds below. Small
 * against the exchange's smallest rate of about 2 per unit area, so each
 * round takes out nearly all of what is left.
 */
const MASS_PER_AREA = 1e-2;

/**
 * How little may be left, as a share of the root-mean-square flow across an
 * edge, of the net flow out of any cell. Heat carried by the flows is made
 * or lost in proportion to it, so it is taken to the edge of rounding.
 */
const NET_FLOW_TOLERANCE = 1e-7;

/**
 * How exactly each round is solved, as a share of the largest net flow it
 * starts from: loose, since the rounds that follow take out what it leaves.
 */
const SOLVE_MARGIN = 1e-1;

/** The most rounds of solving taken before giving up. */
const MAX_ROUNDS = 12;

/** The solver and working memory for one grid, kept between calls. */
type Working = {
	readonly solver: ExchangeSolver;
	readonly couplings: Float64Array;
	readonly net: Float64Array;
	readonly rhs: Float64Array;
	readonly step: Float64Array;
	readonly potential: Float64Array;
};

const WORKING = new WeakMap<Grid, Working>();

const working = (grid: Grid): Working => {
	let held = WORKING.get(grid);
	if (held === undefined) {
		const couplings = uniformCoupling(grid, 1);
		const solver = createExchangeSolver(grid, couplings);
		const mass = new Float64Array(grid.cellCount);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			mass[cell] = MASS_PER_AREA * (grid.areas[cell] as number);
		}
		solver.setMass(mass);
		held = {
			solver,
			couplings,
			net: new Float64Array(grid.cellCount),
			rhs: new Float64Array(grid.cellCount),
			step: new Float64Array(grid.cellCount),
			potential: new Float64Array(grid.cellCount),
		};
		WORKING.set(grid, held);
	}
	return held;
};

/** Throws unless every value is finite, naming the field. */
const assertFinite = (values: ArrayLike<number>, what: string): void => {
	for (let cell = 0; cell < values.length; cell++) {
		if (!Number.isFinite(values[cell])) {
			throw new RangeError(
				`Every ${what} must be finite; cell ${cell} has ${values[cell]}`,
			);
		}
	}
};

/**
 * Throws unless every edge's two entries are each other's negatives: with
 * any other flows the net flow summed over the sphere is not zero, and no
 * potential can take it out.
 */
const assertAntisymmetric = (grid: Grid, flows: ArrayLike<number>): void => {
	const { neighbours, cellCount } = grid;
	for (let cell = 0; cell < cellCount; cell++) {
		for (let side = 0; side < SIDES; side++) {
			const other = neighbours[SIDES * cell + side] as number;
			let back = 0;
			while (neighbours[SIDES * other + back] !== cell) {
				back++;
			}
			if (
				flows[SIDES * cell + side] !== -(flows[SIDES * other + back] as number)
			) {
				throw new RangeError(
					`The flows across an edge must be each other's negatives; cell ${cell} side ${side} and cell ${other} side ${back} are not`,
				);
			}
		}
	}
};

/**
 * Takes the converging and spreading part out of what a wind carries across
 * the edges, so that the entries leaving every cell sum to zero.
 *
 * @remarks
 * What is taken out is the flow down the gradient of a potential: across
 * each edge, the difference of the potential between the two cells times
 * the edge's coupling, as in heat exchange, with the potential chosen so
 * that every cell is left with as much going in as coming out. Taking it
 * out twice is taking it out once. The sphere's mean potential is of no
 * consequence and is left at zero.
 *
 * The exchange's couplings are exact for a grid whose lines cross at right
 * angles and not for the skewed cells of the cube's corners and, less so,
 * of the rest of the grid, where the flow across an edge also depends on
 * the slope along it. So the converging part is taken out of the net flow
 * of every cell exactly, but not out of every edge's flow: of a wind that
 * only runs in towards a point, about an eighth of the flow (by
 * root-mean-square, at any grid size) is left, going round and not in.
 *
 * One call costs what a few solves of the heat exchange do; the solver is
 * kept for each grid between calls.
 *
 * @param grid - The grid.
 * @param flows - What is carried across every edge, laid out as
 * {@link edgeFlows} gives it: `4 * cellCount` finite values, each the
 * negative of the entry for the same edge seen from the other cell. Not
 * changed.
 * @param guess - A place for the potential the converging part is the flow
 * down: on entry a first guess at it, one value per cell, which the
 * potential found for flows close to these, such as the last pass's, makes
 * a good one; on return the potential that was found. Left out, the guess
 * is zero and the potential is not kept. The flowing part found is the
 * same to the tolerance whatever the guess.
 * @param tally - Told, in its `rounds`, how many rounds of solving it took:
 * fewer from a good guess. For tests and measuring; left out, nobody is told.
 * @returns The flowing part, in a new array laid out the same way: the
 * entries leaving any cell sum to zero, to a ten-millionth of the
 * input's root-mean-square flow across an edge.
 * @throws RangeError if `flows` or `guess` has the wrong length or a value
 * that is not finite, or an edge of `flows` has two entries that are not each
 * other's negatives.
 * @throws Error if the potential could not be solved well enough.
 */
export const removeConvergence = (
	grid: Grid,
	flows: ArrayLike<number>,
	guess?: Float64Array,
	tally?: { rounds: number },
): Float64Array => {
	const { cellCount } = grid;
	if (flows.length !== SIDES * cellCount) {
		throw new RangeError(
			`A grid of ${cellCount} cells has ${SIDES * cellCount} edge flows; got ${flows.length}`,
		);
	}
	assertFinite(flows, 'flow');
	assertAntisymmetric(grid, flows);
	if (guess !== undefined) {
		if (guess.length !== cellCount) {
			throw new RangeError(
				`A grid of ${cellCount} cells has ${cellCount} potentials; got ${guess.length}`,
			);
		}
		assertFinite(guess, 'potential');
	}
	const kept = Float64Array.from(flows);
	const { solver, couplings, net, rhs, step, potential } = working(grid);
	let squares = 0;
	for (let entry = 0; entry < kept.length; entry++) {
		squares += (kept[entry] as number) ** 2;
	}
	const scale = Math.sqrt(squares / kept.length);
	const limit = NET_FLOW_TOLERANCE * scale;
	// The net flow still to be taken out of each cell, from the potential
	// so far: what leaves it less what the potential's own flows take away.
	const remaining = (): number => {
		let largest = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			let out = 0;
			for (let side = 0; side < SIDES; side++) {
				const entry = SIDES * cell + side;
				const neighbour = grid.neighbours[entry] as number;
				out +=
					(kept[entry] as number) -
					(couplings[entry] as number) *
						((potential[neighbour] as number) - (potential[cell] as number));
			}
			net[cell] = out;
			largest = Math.max(largest, Math.abs(out));
		}
		return largest;
	};
	if (guess === undefined) {
		potential.fill(0);
	} else {
		potential.set(guess);
	}
	let largest = remaining();
	let rounds = 0;
	for (let round = 0; largest > limit; round++) {
		if (round === MAX_ROUNDS) {
			throw new Error(
				`The flowing part of a wind was not found: after ${MAX_ROUNDS} rounds the net flow out of a cell is still ${largest}`,
			);
		}
		// The potential's matrix, applied to the step, gives minus the net
		// flow still to be taken out.
		for (let cell = 0; cell < cellCount; cell++) {
			rhs[cell] = -(net[cell] as number);
		}
		step.fill(0);
		const { iterations, converged } = solver.solve(
			rhs,
			step,
			SOLVE_MARGIN * largest,
		);
		if (!converged) {
			throw new Error(
				`The flowing part of a wind was not solved in ${iterations} iterations`,
			);
		}
		for (let cell = 0; cell < cellCount; cell++) {
			potential[cell] = (potential[cell] as number) + (step[cell] as number);
		}
		largest = remaining();
		rounds++;
	}
	if (tally !== undefined) {
		tally.rounds = rounds;
	}
	for (let cell = 0; cell < cellCount; cell++) {
		for (let side = 0; side < SIDES; side++) {
			const entry = SIDES * cell + side;
			const neighbour = grid.neighbours[entry] as number;
			kept[entry] =
				(kept[entry] as number) -
				(couplings[entry] as number) *
					((potential[neighbour] as number) - (potential[cell] as number));
		}
	}
	guess?.set(potential);
	return kept;
};

/**
 * The flowing part of a wind: what it carries across every edge, with its
 * converging and spreading part taken out.
 *
 * @remarks
 * The wind's flows are {@link edgeFlows}, in square metres a second on the
 * planet's radius, and the flowing part is {@link removeConvergence} of
 * them. A wind that already goes round, as a solid body's turning does, is
 * given back as it is to the grid's accuracy; a wind that only runs in
 * towards a point, or out from one, comes back as about an eighth of itself,
 * for the reason {@link removeConvergence} gives.
 *
 * @param grid - The grid.
 * @param east - The eastward wind at each cell's centre, in metres a
 * second; one finite value per cell. Not changed.
 * @param north - The northward wind, in the same way.
 * @returns The flowing part's flows across every edge, in a new array.
 * @throws RangeError if an array has the wrong length or a value that is
 * not finite.
 * @throws Error if the potential could not be solved well enough.
 */
export const flowingPart = (
	grid: Grid,
	east: ArrayLike<number>,
	north: ArrayLike<number>,
): Float64Array => {
	const { cellCount } = grid;
	if (east.length !== cellCount || north.length !== cellCount) {
		throw new RangeError(
			`A grid of ${cellCount} cells has ${cellCount} winds of each direction; got ${east.length} eastward and ${north.length} northward`,
		);
	}
	assertFinite(east, 'eastward wind');
	assertFinite(north, 'northward wind');
	return removeConvergence(
		grid,
		edgeFlows(grid, fromEastNorth(grid, { east, north }), RADIUS_M),
	);
};

/**
 * The grid the flowing part of a wind is found on, in cells per face edge,
 * whatever the world's: the one the wind model's pressure is worked out on,
 * the finest the flowing part is worth finding on, since a month takes 60 ms
 * there and four times that on the next.
 */
export const FLOWING_RESOLUTION: Resolution = 64;

/**
 * The flowing part of a wind on a world's grid, as the temperature solve
 * takes it: on the grid the world's temperature is solved on.
 *
 * @remarks
 * The wind's flows across the edges of the world's own grid are added up,
 * grid by grid, onto the grid of {@link FLOWING_RESOLUTION} (which loses no
 * net flow: see {@link coarsenFlows}), their converging part is taken out
 * there by {@link removeConvergence}, and if the temperature is solved on a
 * finer grid than that, which it is for a world of 256, the flowing part is
 * carried up to it by {@link refineFlows}, as smooth as the coarse flows
 * are. For a world of 64 this is {@link flowingPart}.
 *
 * @param resolution - The world's cells along a face edge.
 * @param solveResolution - The cells along a face edge of the grid the
 * temperature is solved on: the world's or the grid a step coarser, and at
 * least {@link FLOWING_RESOLUTION}.
 * @param east - The eastward wind at each cell of the world's grid, in
 * metres a second; finite. Not changed.
 * @param north - The northward wind, in the same way.
 * @param guess - A first guess at the potential of the converging part, one
 * value per cell of the grid of {@link FLOWING_RESOLUTION}, and a place for
 * the potential found, as for {@link removeConvergence}: kept from one
 * pass's winds to the next's, which are close, it saves most of the solving.
 * @returns The flows across the edges of the grid of `solveResolution`, in
 * a new array.
 * @throws RangeError if an array has the wrong length or a value that is
 * not finite, or the resolutions are not as above.
 */
export const flowingPartForSolve = (
	resolution: Resolution,
	solveResolution: Resolution,
	east: ArrayLike<number>,
	north: ArrayLike<number>,
	guess?: Float64Array,
): Float64Array => {
	if (
		solveResolution < FLOWING_RESOLUTION ||
		(solveResolution !== resolution && solveResolution !== resolution / 2)
	) {
		throw new RangeError(
			`A world of ${resolution} cells per face edge is not solved on ${solveResolution}`,
		);
	}
	const grid = getGrid(resolution);
	if (east.length !== grid.cellCount || north.length !== grid.cellCount) {
		throw new RangeError(
			`A grid of ${grid.cellCount} cells has ${grid.cellCount} winds of each direction; got ${east.length} eastward and ${north.length} northward`,
		);
	}
	assertFinite(east, 'eastward wind');
	assertFinite(north, 'northward wind');
	let flows: Float64Array = edgeFlows(
		grid,
		fromEastNorth(grid, { east, north }),
		RADIUS_M,
	);
	let size: number = resolution;
	while (size > FLOWING_RESOLUTION) {
		flows = coarsenFlows(flows, size);
		size /= 2;
	}
	flows = removeConvergence(getGrid(size), flows, guess);
	while (size < solveResolution) {
		size *= 2;
		flows = refineFlows(flows, size);
	}
	return flows;
};
