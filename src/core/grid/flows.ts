/**
 * What is carried across the edges of a grid, moved to the grid a step
 * coarser and back.
 *
 * Flows are laid out as {@link edgeFlows} gives them: four entries to a
 * cell, entry `4c + k` the flow out of cell `c` across its side `k`, and
 * the same edge seen from the other cell the negative of it. The grids nest
 * exactly (see {@link coarsenField}): coarse cell `(face, i, j)` covers the
 * four fine cells `(face, 2i … 2i + 1, 2j … 2j + 1)`, and a coarse edge is
 * two fine ones.
 *
 * {@link coarsenFlows} adds up the flows across the fine edges that make
 * each coarse edge and drops those inside a coarse cell. Whatever leaves
 * the four fine cells of a block leaves the coarse cell, so a flow with no
 * net flow out of any fine cell has none out of any coarse one, and the
 * total carried is kept. {@link refineFlows} goes the other way: each
 * coarse edge's flow is shared equally between its two fine edges, and the
 * four edges inside each block are chosen to leave no net flow out of any
 * of its four cells, as small as they can be made, so a flow with no net
 * flow out of any coarse cell has none out of any fine one.
 */

import {
	type Grid,
	getGrid,
	isSupportedResolution,
	NEIGHBOUR_COUNT,
	type Resolution,
	SUPPORTED_RESOLUTIONS,
} from './grid';

const SIDES = NEIGHBOUR_COUNT;

/** The sides of a cell, in neighbour order. */
const MINUS_I = 0;
const PLUS_I = 1;
const MINUS_J = 2;
const PLUS_J = 3;

/**
 * Where each fine entry's flow goes on the coarse grid, by the fine grid's
 * resolution: the coarse entry `4P + S` of the edge it is part of, or -1
 * for a fine edge inside a coarse cell.
 */
const COARSE_ENTRY = new Map<Resolution, Int32Array>();

/** The coarse grid's resolution for a fine one, which must have one. */
const coarserThan = (resolution: number): Resolution => {
	if (!isSupportedResolution(resolution)) {
		throw new RangeError(
			`Unsupported resolution ${resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	const index = SUPPORTED_RESOLUTIONS.indexOf(resolution);
	if (index === 0) {
		throw new RangeError(
			`A grid of ${resolution} cells per face edge is the coarsest there is; it has none a step coarser`,
		);
	}
	return SUPPORTED_RESOLUTIONS[index - 1] as Resolution;
};

/** The coarse cell covering a fine cell. */
const parentOf = (fine: number, n: number): number => {
	const m = n / 2;
	const face = Math.floor(fine / (n * n));
	const j = Math.floor(fine / n) % n;
	const i = fine % n;
	return (face * m + (j >> 1)) * m + (i >> 1);
};

/** The map from each fine entry to its coarse one, built on first use. */
const coarseEntries = (resolution: Resolution): Int32Array => {
	let entries = COARSE_ENTRY.get(resolution);
	if (entries === undefined) {
		const fine = getGrid(resolution);
		const coarse = getGrid(coarserThan(resolution));
		entries = new Int32Array(SIDES * fine.cellCount);
		for (let cell = 0; cell < fine.cellCount; cell++) {
			const parent = parentOf(cell, resolution);
			for (let side = 0; side < SIDES; side++) {
				const other = parentOf(
					fine.neighbours[SIDES * cell + side] as number,
					resolution,
				);
				let found = -1;
				if (other !== parent) {
					for (let across = 0; across < SIDES; across++) {
						if (coarse.neighbours[SIDES * parent + across] === other) {
							found = SIDES * parent + across;
							break;
						}
					}
					if (found < 0) {
						throw new Error(
							`Cell ${other} is not a neighbour of cell ${parent} on the grid a step coarser than ${resolution}`,
						);
					}
				}
				entries[SIDES * cell + side] = found;
			}
		}
		COARSE_ENTRY.set(resolution, entries);
	}
	return entries;
};

/** Throws unless there are four finite flows to a cell of the grid. */
const assertFlows = (grid: Grid, flows: ArrayLike<number>): void => {
	if (flows.length !== SIDES * grid.cellCount) {
		throw new RangeError(
			`A grid of ${grid.cellCount} cells has ${SIDES * grid.cellCount} edge flows; got ${flows.length}`,
		);
	}
	for (let entry = 0; entry < flows.length; entry++) {
		if (!Number.isFinite(flows[entry])) {
			throw new RangeError(
				`Every edge flow must be finite; entry ${entry} is ${flows[entry]}`,
			);
		}
	}
};

/**
 * Flows across the edges of a grid, added up onto the grid a step coarser.
 *
 * @param flows - The flows on the grid of `resolution`, laid out as
 * {@link edgeFlows} gives them. Not changed.
 * @param resolution - The fine grid's cells along a face edge: 128 or 256.
 * @returns New flows on the grid a step coarser.
 * @throws RangeError if the resolution is not supported or is the coarsest,
 * or `flows` has the wrong length or a value that is not finite.
 */
export const coarsenFlows = (
	flows: ArrayLike<number>,
	resolution: number,
): Float64Array => {
	const coarse = getGrid(coarserThan(resolution));
	assertFlows(getGrid(resolution), flows);
	const entries = coarseEntries(resolution as Resolution);
	const result = new Float64Array(SIDES * coarse.cellCount);
	for (let entry = 0; entry < flows.length; entry++) {
		const target = entries[entry] as number;
		if (target >= 0) {
			result[target] = (result[target] as number) + (flows[entry] as number);
		}
	}
	return result;
};

/**
 * Flows across the edges of a grid, carried onto the grid a step finer.
 *
 * @remarks
 * Each coarse edge's flow is shared equally between its two fine edges. In
 * each block of four fine cells the flow across the four edges inside it
 * is then fixed by there being no net flow out of any of the four cells:
 * that leaves one freedom, a circulation round the block, which is chosen
 * to make the four flows as small as possible, in the sense of the sum of
 * their squares. A coarse flow that carries nothing net out of any cell
 * therefore gives a fine one that carries nothing net out of any cell, and
 * {@link coarsenFlows} of the result is the flow it began with. Within a
 * block the flow is no finer than the coarse grid's: it is smooth, as the
 * coarse flow is, and has none of the structure of a flow found on the fine
 * grid itself.
 *
 * @param flows - The flows on the grid a step coarser than `resolution`,
 * laid out as {@link edgeFlows} gives them. Not changed. They should have
 * no net flow out of any cell, as {@link removeConvergence} gives; if they
 * have, so does what is returned. A coarse cell that has some net flow out
 * leaves all of it in one of its four fine cells.
 * @param resolution - The fine grid's cells along a face edge: 128 or 256.
 * @returns New flows on the grid of `resolution`.
 * @throws RangeError if the resolution is not supported or is the coarsest,
 * or `flows` has the wrong length or a value that is not finite.
 */
export const refineFlows = (
	flows: ArrayLike<number>,
	resolution: number,
): Float64Array => {
	const coarseResolution = coarserThan(resolution);
	const coarse = getGrid(coarseResolution);
	assertFlows(coarse, flows);
	const fine = getGrid(resolution);
	const entries = coarseEntries(resolution as Resolution);
	const n = resolution;
	const m = coarseResolution;
	const result = new Float64Array(SIDES * fine.cellCount);
	// Each fine edge across a coarse edge takes half of that edge's flow.
	for (let entry = 0; entry < result.length; entry++) {
		const target = entries[entry] as number;
		if (target >= 0) {
			result[entry] = 0.5 * (flows[target] as number);
		}
	}
	// And each block's four inner edges are fixed by its four cells having
	// nothing net to lose or gain. The cells are named by their offsets
	// (a, b) in the block: the first of each pair along i, the second along j.
	for (let face = 0; face < 6; face++) {
		for (let j = 0; j < m; j++) {
			for (let i = 0; i < m; i++) {
				const cell = (a: number, b: number): number =>
					(face * n + 2 * j + b) * n + 2 * i + a;
				const c00 = cell(0, 0);
				const c10 = cell(1, 0);
				const c01 = cell(0, 1);
				const c11 = cell(1, 1);
				const outside = (c: number, sides: readonly number[]): number => {
					let out = 0;
					for (const side of sides) {
						out += result[SIDES * c + side] as number;
					}
					return out;
				};
				// What leaves each cell across the block's outer edges: the
				// sides facing away from the block.
				const e00 = outside(c00, [MINUS_I, MINUS_J]);
				const e10 = outside(c10, [PLUS_I, MINUS_J]);
				const e01 = outside(c01, [MINUS_I, PLUS_J]);
				// The four inner flows are out of c00 to c10, out of c00 to c01, out
				// of c10 to c11 and out of c01 to c11. The first is free; the cells'
				// balances fix the rest from it, the fourth cell's following from
				// the others when the coarse cell has no net flow. The first that
				// makes the squares least is:
				const toward10 = (-4 * e00 + 2 * e10 - 2 * e01) / 8;
				const toward01 = -e00 - toward10;
				const up10 = toward10 - e10;
				const up01 = -e00 - e01 - toward10;
				result[SIDES * c00 + PLUS_I] = toward10;
				result[SIDES * c10 + MINUS_I] = -toward10;
				result[SIDES * c00 + PLUS_J] = toward01;
				result[SIDES * c01 + MINUS_J] = -toward01;
				result[SIDES * c10 + PLUS_J] = up10;
				result[SIDES * c11 + MINUS_J] = -up10;
				result[SIDES * c01 + PLUS_I] = up01;
				result[SIDES * c11 + MINUS_I] = -up01;
			}
		}
	}
	return result;
};
