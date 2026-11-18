/**
 * Heat carried along by the wind: an implicit upwind step on the grid.
 *
 * A cell's temperature is carried by the air that flows through it. Where
 * `F` is what the wind carries across an edge out of a cell, in square
 * metres a second (see {@link edgeFlows}), and `c` the heat capacity per
 * square metre of the air that moves the heat, the air flowing into a cell
 * across an edge brings the heat `c F T_up` a second from its upwind
 * neighbour and takes away `c F T` at the cell's own temperature. One
 * implicit step of length `Δt` solves, for the temperatures `T'` after it,
 *
 * `C (T'_i − T̃_i) / Δt = Σ_in r_ki (T'_k − T'_i)`
 *
 * where `T̃` is the temperature before the step, `C` the cell's own heat
 * capacity, and the sum runs over the edges the air flows in across, each
 * with the rate `r = c F / (A R²)` for the cell's area `A` and the planet's
 * radius `R`. The matrix is an M-matrix and the step weighted means of
 * upwind values, so it is stable however long the step is and makes no new
 * extreme: a cell cannot come out warmer than its warmest upwind
 * neighbour or colder than its coldest, give or take the closing shift
 * below, which is within the sweeps' tolerance when they converge, and
 * unbounded when they run out of sweeps.
 *
 * The flows must have no net flow in or out of any cell, as
 * {@link flowingPart} gives them. Then what a cell takes in at its upwind
 * edges is what it gives at its downwind ones, a uniform temperature stays
 * as it is, and the heat `A C T` summed over the sphere is kept: heat is
 * moved, never made. The step is solved by Gauss–Seidel sweeps, forward
 * and back alternately, which follow the flow in one direction or the
 * other, and the heat kept is made exact at the end by a shift of the same
 * size everywhere in proportion to each cell's heat capacity, however far
 * the sweeps got.
 *
 * It is meant to follow a step of the heat exchange in the model's time
 * stepping, as an operator split: first order in time, while the exchange
 * and the sunlight are second order.
 */

import { type Grid, NEIGHBOUR_COUNT } from '../grid/grid';
import { PLANET_RADIUS_KM } from '../world/world';

/** The number of neighbours of every cell. */
const SIDES = NEIGHBOUR_COUNT;

/** The planet's radius in metres, which the flows' square metres refer to. */
const RADIUS_M = PLANET_RADIUS_KM * 1000;

/** The most sweeps, a forward and a back each, taken before giving up. */
export const ADVECTION_MAX_SWEEPS = 200;

/** How a step of {@link HeatAdvector.advect} ended. */
export type AdvectionOutcome = {
	/** The sweeps taken, a forward and a back each. */
	readonly sweeps: number;
	/**
	 * Whether the largest change in a cell over the last sweep came below
	 * the tolerance; false when the most sweeps ran out first.
	 */
	readonly converged: boolean;
};

/**
 * The advection of heat on one grid, for one heat capacity of moving air,
 * reused for many steps that differ in their flows and temperatures.
 */
export type HeatAdvector = {
	/** The grid the flows and temperatures are on. */
	readonly grid: Grid;
	/**
	 * Sets the flows the steps that follow move heat along.
	 *
	 * @param flows - What the wind carries across every edge, in square
	 * metres a second, laid out as {@link edgeFlows} gives it. Copied, not
	 * kept.
	 * @throws RangeError if `flows` has the wrong length or a value that is
	 * not finite.
	 */
	setFlows(flows: ArrayLike<number>): void;
	/**
	 * Moves heat along the flows set, over one step, in place.
	 *
	 * @param temperature - One value per cell: on entry the temperatures
	 * before the step, on return those after it.
	 * @param capacity - Each cell's heat capacity, one positive, finite
	 * value per cell, in joules per square metre per kelvin. Not changed.
	 * @param seconds - The length of the step, above zero.
	 * @param tolerance - In kelvin, finite and above zero: the sweeps stop
	 * when no cell changed by more than this in the last one.
	 * @returns How the sweeps ended.
	 * @throws RangeError if an array has the wrong length, or `seconds` or
	 * `tolerance` is not positive and finite.
	 */
	advect(
		temperature: Float64Array,
		capacity: Float64Array,
		seconds: number,
		tolerance: number,
	): AdvectionOutcome;
};

/**
 * An advection of heat on a grid.
 *
 * @param grid - The grid.
 * @param airHeatCapacity - The heat capacity per square metre of the air
 * that moves the heat, in joules per square metre per kelvin: positive and
 * finite.
 * @throws RangeError if `airHeatCapacity` is not positive and finite.
 */
export const createHeatAdvector = (
	grid: Grid,
	airHeatCapacity: number,
): HeatAdvector => {
	if (!(airHeatCapacity > 0 && Number.isFinite(airHeatCapacity))) {
		throw new RangeError(
			`The heat capacity of the moving air must be positive and finite; got ${airHeatCapacity}`,
		);
	}
	const { cellCount, areas, neighbours } = grid;
	// The rate each side's neighbour brings its temperature at, per kelvin and
	// square metre: zero for a side the air flows out of.
	const inflow = new Float64Array(SIDES * cellCount);
	// The sum of those over each cell's sides.
	const inflowSum = new Float64Array(cellCount);
	const diagonal = new Float64Array(cellCount);
	const target = new Float64Array(cellCount);
	const before = new Float64Array(cellCount);
	const scale = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		scale[cell] = airHeatCapacity / ((areas[cell] as number) * RADIUS_M ** 2);
	}

	const setFlows = (flows: ArrayLike<number>): void => {
		if (flows.length !== SIDES * cellCount) {
			throw new RangeError(
				`A grid of ${cellCount} cells has ${SIDES * cellCount} edge flows; got ${flows.length}`,
			);
		}
		for (let entry = 0; entry < flows.length; entry++) {
			if (!Number.isFinite(flows[entry])) {
				throw new RangeError(
					`Every edge flow must be finite; entry ${entry} is ${flows[entry]}`,
				);
			}
		}
		for (let cell = 0; cell < cellCount; cell++) {
			let sum = 0;
			for (let side = 0; side < SIDES; side++) {
				const entry = SIDES * cell + side;
				// A negative flow out of this cell is a flow in.
				const rate =
					Math.max(0, -(flows[entry] as number)) * (scale[cell] as number);
				inflow[entry] = rate;
				sum += rate;
			}
			inflowSum[cell] = sum;
		}
	};

	const advect = (
		temperature: Float64Array,
		capacity: Float64Array,
		seconds: number,
		tolerance: number,
	): AdvectionOutcome => {
		if (temperature.length !== cellCount || capacity.length !== cellCount) {
			throw new RangeError(
				`A grid of ${cellCount} cells needs ${cellCount} temperatures and heat capacities`,
			);
		}
		if (!(seconds > 0 && Number.isFinite(seconds))) {
			throw new RangeError(`A step must last a positive time; got ${seconds}`);
		}
		if (!(tolerance > 0 && Number.isFinite(tolerance))) {
			throw new RangeError(
				`A tolerance must be finite and above zero; got ${tolerance}`,
			);
		}
		before.set(temperature);
		for (let cell = 0; cell < cellCount; cell++) {
			const storage = (capacity[cell] as number) / seconds;
			diagonal[cell] = storage + (inflowSum[cell] as number);
			target[cell] = storage * (before[cell] as number);
		}
		const update = (cell: number): number => {
			let value = target[cell] as number;
			for (let side = 0; side < SIDES; side++) {
				const rate = inflow[SIDES * cell + side] as number;
				if (rate > 0) {
					value +=
						rate *
						(temperature[neighbours[SIDES * cell + side] as number] as number);
				}
			}
			value /= diagonal[cell] as number;
			const change = Math.abs(value - (temperature[cell] as number));
			temperature[cell] = value;
			return change;
		};
		let sweeps = 0;
		let converged = false;
		while (!converged && sweeps < ADVECTION_MAX_SWEEPS) {
			let largest = 0;
			for (let cell = 0; cell < cellCount; cell++) {
				largest = Math.max(largest, update(cell));
			}
			for (let cell = cellCount - 1; cell >= 0; cell--) {
				largest = Math.max(largest, update(cell));
			}
			sweeps++;
			converged = largest < tolerance;
		}
		// Heat is made exact: whatever the sweeps left over, the heat A C T
		// summed over the sphere is what it was.
		let heat = 0;
		let weight = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const cellWeight = (areas[cell] as number) * (capacity[cell] as number);
			heat +=
				cellWeight * ((temperature[cell] as number) - (before[cell] as number));
			weight += cellWeight;
		}
		const shift = heat / weight;
		for (let cell = 0; cell < cellCount; cell++) {
			temperature[cell] = (temperature[cell] as number) - shift;
		}
		return { sweeps, converged };
	};

	return { grid, setFlows, advect };
};

/**
 * The flows at a time of year, interpolated linearly between the months'.
 *
 * @remarks
 * Each month's flows stand for the middle of that month, so a time in the
 * first half of a month is interpolated between the month before and it,
 * and a time in the second half between it and the month after; the year
 * wraps round. The flowing flows of two months, each with no net flow in or
 * out of any cell, give flows between them with none either.
 *
 * @param months - Twelve flows, January to December, each laid out as
 * {@link edgeFlows} gives them.
 * @param yearFraction - The time of year, from 0 at the start of January
 * to 1 at the end of December; one outside that wraps round.
 * @param into - Where to write the flows, as long as each month's.
 * @returns `into`.
 */
export const interpolateFlows = (
	months: readonly ArrayLike<number>[],
	yearFraction: number,
	into: Float64Array,
): Float64Array => {
	const count = months.length;
	const position = yearFraction * count - 0.5;
	const first = Math.floor(position);
	const weight = position - first;
	const from = months[((first % count) + count) % count] as ArrayLike<number>;
	const to = months[
		(((first + 1) % count) + count) % count
	] as ArrayLike<number>;
	for (let entry = 0; entry < into.length; entry++) {
		into[entry] =
			(1 - weight) * (from[entry] as number) + weight * (to[entry] as number);
	}
	return into;
};
