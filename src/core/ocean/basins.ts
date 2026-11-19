/**
 * The seas and coasts a gyre is solved between: which coasts hold a given
 * streamfunction, which are islands whose value is found, which small
 * islands the sea is taken to flow over, and which enclosed seas are held
 * still.
 *
 * A gyre's streamfunction `ψ` is one value along each coast (see
 * {@link coastLabels}). The operator takes no notice of a constant added to
 * `ψ`, so every connected piece of sea needs one coast whose value is
 * given; the difference between two coasts' values is the transport
 * between them. {@link findBasins} picks, for each piece of sea, its
 * largest coast as the one given, and makes every other coast an island,
 * whose value the solve finds from a condition on the circulation round it.
 *
 * Two kinds of piece are not solved as they are:
 *
 * - A small island. Each island is one more unknown on every level of the
 *   corner solver, down to its coarsest, which is factorised densely, so
 *   only the largest {@link BasinOptions.maxIslands} islands are kept. The
 *   others are taken out of the land the solve sees, so the sea flows over
 *   them, and afterwards each is held to one value, the mean of `ψ` at its
 *   corners: what the solve sent across it then goes round it, and nothing
 *   crosses its coast.
 * - A sea whose every coast is an island of some larger sea, such as a lake
 *   on an island. It has no coast whose value is given, so it is held
 *   still: its cells are taken as part of the land round it.
 *
 * A planet with no land at all has no coast to hold `ψ` on, and its sea is
 * held still too; a planet with no sea at all has nothing to solve, and is
 * given back in the same way, with no coasts.
 */

import { coastLabels, cornerIndex } from '../grid/corners';
import { type Grid, NEIGHBOUR_COUNT } from '../grid/grid';

/** The number of sides of every cell. */
const SIDES = NEIGHBOUR_COUNT;

/** How a coast's value of `ψ` is set, as `CornerCoast` takes it. */
export type BasinCoast = 'value' | 'net';

/** How {@link findBasins} treats islands. */
export type BasinOptions = {
	/**
	 * The most islands kept as islands, the largest by their number of
	 * cells; the rest are flowed over. A whole number from 0.
	 */
	readonly maxIslands: number;
};

/** The seas and coasts a gyre is solved between, from {@link findBasins}. */
export type Basins = {
	/**
	 * Which cells the solve takes as land, one per cell: the land, less the
	 * small islands flowed over, plus the seas held still.
	 */
	readonly land: Uint8Array;
	/**
	 * The coast of every corner, 0 for the sea, as the corner solver takes
	 * them: from {@link coastLabels} of {@link Basins.land}.
	 */
	readonly labels: Int32Array;
	/** How each coast's value is set, the first for label 1. */
	readonly coasts: readonly BasinCoast[];
	/**
	 * For every corner, 1 where the sea can flow round the globe beside it,
	 * and 0 elsewhere: a corner of the sea whose circle of latitude crosses
	 * no land of {@link Basins.land}, as between Antarctica and the southern
	 * tips of the continents, or a corner of a coast that reaches every band
	 * of longitude, as Antarctica's does.
	 */
	readonly channel: Uint8Array;
	/**
	 * The corners of each small island flowed over, each list to be held to
	 * one value after the solve.
	 */
	readonly flowedOver: readonly Int32Array[];
	/** How many cells of sea are held still. */
	readonly stillCells: number;
};

/** The cell count of every coast, the first for label 1. */
const coastSizes = (
	grid: Grid,
	land: Uint8Array,
	labels: Int32Array,
	count: number,
): Int32Array => {
	const { cellCorners } = cornerIndex(grid);
	const sizes = new Int32Array(count);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		if (land[cell] !== 0) {
			const coast = labels[cellCorners[SIDES * cell] as number] as number;
			sizes[coast - 1] = (sizes[coast - 1] as number) + 1;
		}
	}
	return sizes;
};

/** The connected pieces of sea, through the cells' edges, largest first. */
const seaPieces = (grid: Grid, land: Uint8Array): Int32Array[] => {
	const { cellCount, neighbours } = grid;
	const seen = new Uint8Array(cellCount);
	const queue = new Int32Array(cellCount);
	const pieces: Int32Array[] = [];
	for (let seed = 0; seed < cellCount; seed++) {
		if (land[seed] !== 0 || seen[seed] !== 0) {
			continue;
		}
		seen[seed] = 1;
		queue[0] = seed;
		let head = 0;
		let tail = 1;
		while (head < tail) {
			const cell = queue[head] as number;
			head++;
			for (let k = 0; k < SIDES; k++) {
				const other = neighbours[SIDES * cell + k] as number;
				if (land[other] === 0 && seen[other] === 0) {
					seen[other] = 1;
					queue[tail] = other;
					tail++;
				}
			}
		}
		pieces.push(queue.slice(0, tail));
	}
	return pieces.sort((a, b) => b.length - a.length);
};

/** The coasts, by label, that a piece of sea touches. */
const touchedCoasts = (
	grid: Grid,
	labels: Int32Array,
	piece: Int32Array,
): number[] => {
	const { cellCorners } = cornerIndex(grid);
	const touched = new Set<number>();
	for (const cell of piece) {
		for (let k = 0; k < SIDES; k++) {
			const label = labels[cellCorners[SIDES * cell + k] as number] as number;
			if (label !== 0) {
				touched.add(label);
			}
		}
	}
	return [...touched];
};

/** The coasts of a land and how each is set, the seas to hold still found. */
type Classified = {
	readonly labels: Int32Array;
	readonly count: number;
	readonly sizes: Int32Array;
	readonly coasts: BasinCoast[];
};

/**
 * Sets each coast's kind, piece of sea by piece, largest first, and fills
 * every piece with no coast it may give a value to, in place, until no
 * piece is left to fill.
 */
const classify = (grid: Grid, land: Uint8Array): Classified => {
	for (;;) {
		const { labels, count } = coastLabels(grid, land);
		const sizes = coastSizes(grid, land, labels, count);
		const kinds: (BasinCoast | undefined)[] = new Array(count).fill(undefined);
		const toFill: Int32Array[] = [];
		for (const piece of seaPieces(grid, land)) {
			const touched = touchedCoasts(grid, labels, piece);
			const given = touched.some((label) => kinds[label - 1] === 'value');
			if (!given) {
				let largest = -1;
				for (const label of touched) {
					if (
						kinds[label - 1] === undefined &&
						(largest < 0 ||
							(sizes[label - 1] as number) > (sizes[largest - 1] as number))
					) {
						largest = label;
					}
				}
				if (largest < 0) {
					toFill.push(piece);
					continue;
				}
				kinds[largest - 1] = 'value';
			}
			for (const label of touched) {
				if (kinds[label - 1] === undefined) {
					kinds[label - 1] = 'net';
				}
			}
		}
		if (toFill.length === 0) {
			// The land has some sea beside it (findBasins sees to that), and on
			// a sphere every coast then touches some piece of sea, so every kind
			// is set.
			return {
				labels,
				count,
				sizes,
				coasts: kinds as BasinCoast[],
			};
		}
		for (const piece of toFill) {
			for (const cell of piece) {
				land[cell] = 1;
			}
		}
	}
};

/** How many bands of longitude a coast must reach to go round the globe. */
const LONGITUDE_BANDS = 36;

/**
 * The corners beside which the sea can flow round the globe: those whose
 * latitude no land cell spans, from its lowest corner's to its highest's,
 * and those of every coast that reaches all {@link LONGITUDE_BANDS} bands
 * of longitude.
 */
const channelCorners = (
	grid: Grid,
	land: Uint8Array,
	labels: Int32Array,
	count: number,
): Uint8Array => {
	const { cellCorners, directions, cornerCount } = cornerIndex(grid);
	const spans: [number, number][] = [];
	for (let cell = 0; cell < grid.cellCount; cell++) {
		if (land[cell] !== 0) {
			let low = 1;
			let high = -1;
			for (let k = 0; k < SIDES; k++) {
				const z = directions[
					3 * (cellCorners[SIDES * cell + k] as number) + 2
				] as number;
				low = Math.min(low, z);
				high = Math.max(high, z);
			}
			spans.push([low, high]);
		}
	}
	// The spans merged into disjoint runs of sin φ, in order.
	spans.sort((a, b) => a[0] - b[0]);
	const runs: [number, number][] = [];
	for (const span of spans) {
		const last = runs[runs.length - 1];
		if (last !== undefined && span[0] <= last[1]) {
			last[1] = Math.max(last[1], span[1]);
		} else {
			runs.push([span[0], span[1]]);
		}
	}
	const channel = new Uint8Array(cornerCount);
	for (let p = 0; p < cornerCount; p++) {
		const z = directions[3 * p + 2] as number;
		let lowest = 0;
		let highest = runs.length;
		// The first run that ends at or above z.
		while (lowest < highest) {
			const middle = (lowest + highest) >> 1;
			if ((runs[middle] as [number, number])[1] < z) {
				lowest = middle + 1;
			} else {
				highest = middle;
			}
		}
		const run = runs[lowest];
		channel[p] = run === undefined || run[0] > z ? 1 : 0;
	}
	const bands = new Uint8Array(count * LONGITUDE_BANDS);
	for (let p = 0; p < cornerCount; p++) {
		const label = labels[p] as number;
		if (label !== 0) {
			const longitude = Math.atan2(
				directions[3 * p + 1] as number,
				directions[3 * p] as number,
			);
			const band = Math.min(
				LONGITUDE_BANDS - 1,
				Math.floor(((longitude + Math.PI) / (2 * Math.PI)) * LONGITUDE_BANDS),
			);
			bands[(label - 1) * LONGITUDE_BANDS + band] = 1;
		}
	}
	const round = new Uint8Array(count + 1);
	for (let coast = 1; coast <= count; coast++) {
		round[coast] = bands
			.subarray((coast - 1) * LONGITUDE_BANDS, coast * LONGITUDE_BANDS)
			.includes(0)
			? 0
			: 1;
	}
	for (let p = 0; p < cornerCount; p++) {
		if (round[labels[p] as number] === 1) {
			channel[p] = 1;
		}
	}
	return channel;
};

/**
 * The seas and coasts a gyre is solved between, from which cells are land.
 *
 * @remarks
 * See the head of this module. Each piece of sea, largest first, gives the
 * value of its largest coast that is not already an island; every other
 * coast it touches becomes an island. Then the islands found beyond the
 * largest `maxIslands` are flowed over and the coasts found again. The cap
 * is on the islands found: an island in the lagoon of one flowed over,
 * which until then held the lagoon's own gyre, joins the larger sea and can
 * become one more island of it.
 *
 * @param grid - The grid.
 * @param land - One value per cell: non-zero for land, zero for sea. Not
 * changed.
 * @param options - How many islands are kept.
 * @returns The land the solve sees, its coasts and how each is set.
 * @throws RangeError if `land` has the wrong length or `maxIslands` is not
 * a whole number from 0.
 */
export const findBasins = (
	grid: Grid,
	land: ArrayLike<number>,
	options: BasinOptions,
): Basins => {
	const { maxIslands } = options;
	if (!(Number.isInteger(maxIslands) && maxIslands >= 0)) {
		throw new RangeError(
			`The most islands must be a whole number from 0; got ${maxIslands}`,
		);
	}
	if (land.length !== grid.cellCount) {
		throw new RangeError(
			`A grid of ${grid.cellCount} cells has ${grid.cellCount} land values; got ${land.length}`,
		);
	}
	const seen = new Uint8Array(grid.cellCount);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		seen[cell] = land[cell] !== 0 ? 1 : 0;
	}
	const noLand = !seen.includes(1);
	if (noLand || !seen.includes(0)) {
		// No coast to hold ψ on, or no sea: nothing is solved, and any sea is
		// held still.
		return {
			land: seen.fill(1),
			labels: new Int32Array(cornerIndex(grid).cornerCount),
			coasts: [],
			channel: new Uint8Array(cornerIndex(grid).cornerCount),
			flowedOver: [],
			stillCells: noLand ? grid.cellCount : 0,
		};
	}
	const still = (): number => {
		let cells = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			if (seen[cell] !== 0 && land[cell] === 0) {
				cells++;
			}
		}
		return cells;
	};
	const first = classify(grid, seen);
	const islands: number[] = [];
	for (let k = 0; k < first.count; k++) {
		if (first.coasts[k] === 'net') {
			islands.push(k + 1);
		}
	}
	islands.sort(
		(a, b) =>
			(first.sizes[b - 1] as number) - (first.sizes[a - 1] as number) || a - b,
	);
	const small = new Set(islands.slice(maxIslands));
	if (small.size === 0) {
		return {
			land: seen,
			labels: first.labels,
			coasts: first.coasts,
			channel: channelCorners(grid, seen, first.labels, first.count),
			flowedOver: [],
			stillCells: still(),
		};
	}
	const flowedOver = [...small]
		.sort((a, b) => a - b)
		.map((label) => {
			const corners: number[] = [];
			for (let p = 0; p < first.labels.length; p++) {
				if (first.labels[p] === label) {
					corners.push(p);
				}
			}
			return Int32Array.from(corners);
		});
	const { cellCorners } = cornerIndex(grid);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		if (
			seen[cell] !== 0 &&
			small.has(first.labels[cellCorners[SIDES * cell] as number] as number)
		) {
			seen[cell] = 0;
		}
	}
	const second = classify(grid, seen);
	return {
		land: seen,
		labels: second.labels,
		coasts: second.coasts,
		channel: channelCorners(grid, seen, second.labels, second.count),
		flowedOver,
		stillCells: still(),
	};
};
