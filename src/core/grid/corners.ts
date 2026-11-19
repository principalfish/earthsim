/**
 * The corners of the grid's cells, numbered once across the cube's faces,
 * and what lives on them: a streamfunction, whose differences are the flows
 * across the edges, and an elliptic equation for one.
 *
 * A grid of `n` cells per face edge has `6n² + 2` corners: `(n − 1)²`
 * inside each face, `n − 1` along each of the twelve cube edges and the
 * eight cube corners. Every corner is met by four cells and joined by an
 * edge to four other corners, except the eight cube corners, which are met
 * by three cells and joined to three corners. {@link cornerIndex} numbers
 * them and lists, for each cell, its four corners, for each edge its two in
 * order round the cell, and for each corner its cells and the corners it is
 * joined to.
 *
 * {@link edgeFlowsFromCorners} turns a value at every corner, a
 * streamfunction `ψ`, into flows across the edges laid out as
 * {@link edgeFlows} lays them out: the flow out of a cell across an edge is
 * `ψ` at the edge's first corner less `ψ` at its second, going round the
 * cell anticlockwise as seen from outside the sphere. That is the flow of the
 * transport `r̂ × ∇ψ`, eastward `−∂ψ/∂y` and northward `∂ψ/∂x`, so `ψ` is
 * highest in the middle of a clockwise gyre. The four flows out of a cell
 * telescope round it to zero, so whatever the values, nothing collects in
 * any cell, and an edge whose two corners hold the same value carries
 * nothing.
 *
 * {@link createCornerSolver} solves `a ∇²ψ + b ∂ψ/∂x = f` for `ψ` on the
 * corners, `x` eastward, with `ψ` held to one value along each coast: the
 * corners the caller labels as one coast are one unknown, so no flow
 * crosses any edge between two of them. A coast's value is either given or
 * found from a condition the caller gives, a total for the operator summed
 * over the coast's corners: see {@link CornerCoast}.
 *
 * Each corner stands for an area, a quarter of each cell that meets it
 * ({@link cornerAreas}), so the areas sum to the sphere's exactly. The
 * operator at corner `p` is a sum over the corners `q` of the cells round
 * it, its four neighbours along an edge and the four across a cell (three
 * and three at a cube corner), of `K_pq (ψ_q − ψ_p)`:
 *
 * - **∇²ψ** is that of bilinear finite elements on the cells, with the mass
 *   lumped onto the corners: `K_pq` is minus the elements' stiffness between
 *   `p` and `q`, summed over the cells they share, over `p`'s area. Each
 *   cell's stiffness is worked out on the plane tangent at its centre, onto
 *   which the gnomonic projection carries the cell's sides, arcs of great
 *   circles, as straight lines. The weights times the areas are symmetric,
 *   so `∇²ψ` times the areas, summed over any set of corners, comes to a
 *   sum over the links that leave the set alone, as the integral of a
 *   Laplacian over a region is the flux through its rim. On this grid every
 *   pair's weight is positive, even across the skewed cells by the cube's
 *   corners.
 * - **∂ψ/∂x** is the eastward part of the least-squares gradient through the
 *   neighbours along the edges: the plane in the corner's own east–north
 *   frame that best fits `ψ_q − ψ_p` at each of them, placed along the arc
 *   to it. It is exact for a field linear in that frame. At a corner exactly
 *   on a pole, where east has no direction, it is zero.
 * - Where `b` is so large against `a` that a corner's weight on a neighbour
 *   along an edge would go below zero, the corner is given the least extra
 *   diffusion, the two-point one along the edges (each edge weighted by its
 *   dual length, between the centres of the cells either side of it, over
 *   its own length, from {@link edgeGeometry}), that keeps every weight zero
 *   or more: the hybrid scheme, centred where the grid resolves the balance
 *   of the two terms and upwind where it does not. A western boundary layer,
 *   whose width is about `a / b`, narrower than about half a cell is
 *   therefore spread over about a cell. With every weight zero or more the
 *   system is an M-matrix.
 *
 * Measured on fields of the first and second spherical harmonics, the
 * Laplacian is first order: its error is 0.4% to 0.8% of the largest value
 * at 64 cells per face edge and halves with each doubling. The eastward slope
 * is first order too, about 0.3% at 64. The eight cube corners, whose cells
 * meet at 120°, are the exception: their Laplacian is 13% to 15% out
 * whatever the resolution, though their slope is as good as anywhere.
 *
 * The system, every equation multiplied by its corner's area, is solved by
 * BiCGSTAB, preconditioned by one multigrid V-cycle (see `sparse.ts`). The
 * coasts held to given values are taken out of the system and their values
 * moved to the right-hand side; each other coast is one more unknown, whose
 * row is its summed condition. The cycle's coarser grids halve the cells
 * per face edge down to four; a coarse corner is the sea's or a coast's as
 * the fine corner at its place is, the correction is carried to the fine
 * grid bilinearly along each face, each coarse system is the Galerkin
 * product of the finer one, and each level is smoothed by its own
 * incomplete LU factorisation. On a basin with an island it takes four to
 * eight iterations to a tolerance of 10⁻⁸ at every supported resolution,
 * centred or upwind. The solver is built once for an operator and its
 * coasts and then solves any number of forcings. On the development
 * machine, for a basin with a continent and an island at a tolerance of
 * 10⁻⁸ (four to six iterations), a solve took about 0.07 s at 64 cells per
 * face edge, 0.2 s at 128 and 0.5 to 0.8 s at 256, and building the solver
 * about 0.1, 0.3 and 1 s.
 */

import {
	edgeGeometry,
	FACE_AXES,
	FACE_COUNT,
	type FaceAxes,
	faceCorners,
	type Grid,
	NEIGHBOUR_COUNT,
	sideCorners,
} from './grid';
import {
	bicgstab,
	createKrylovWork,
	createMultigrid,
	createRowBuilder,
	type SparseMatrix,
} from './sparse';

/**
 * The number of sides of every cell, held here as a constant of this
 * module: a script runner that rewrites imports may read an imported
 * binding through a property each time, which is slow in a loop over every
 * cell.
 */
const SIDES = NEIGHBOUR_COUNT;

/** Cube faces, held here for the same reason as {@link SIDES}. */
const FACES = FACE_COUNT;

/** The most cells meeting at a corner, and the most corners joined to one. */
const SLOTS = 4;

/** The most corners of the cells round a corner, besides itself. */
const STENCIL = 8;

/**
 * Below this squared distance from the polar axis a corner is taken to be
 * on a pole, where east has no direction. A corner off the pole is at least
 * a cell's width from it, far above this.
 */
const POLE_SQUARED = 1e-24;

/**
 * How closely a solve's residual must come to zero unless told otherwise,
 * as a share of the right-hand side's: see {@link CornerSolveOptions}.
 */
export const CORNER_SOLVE_TOLERANCE = 1e-8;

/** The most iterations of one solve unless told otherwise. */
export const CORNER_MAX_ITERATIONS = 1000;

/**
 * The corners of one grid's cells, numbered once across the faces, and how
 * they join the cells, the edges and one another.
 *
 * @remarks
 * Corners are numbered face by face, and on each face row by row (`j`, then
 * `i` within it) in the layout of {@link faceCorners}, each corner taking
 * the next number the first time it is met: a corner on a cube edge, or a
 * cube corner, is numbered from the lowest-numbered face it lies on.
 *
 * The tables are shared and must be treated as read-only. Where a corner
 * has three cells or three neighbours, its fourth slot holds -1.
 */
export type CornerIndex = {
	/** Cells along a face edge of the grid. */
	readonly n: number;
	/** The number of corners: `6n² + 2`. */
	readonly cornerCount: number;
	/**
	 * The corner at every point of every face's layout in
	 * {@link faceCorners}: corner `(i, j)` of face `f`, for `i` and `j` from 0
	 * to n, at `f (n + 1)² + j (n + 1) + i`. A corner on a cube edge appears
	 * once for each face it lies on.
	 */
	readonly faceIds: Int32Array;
	/**
	 * The four corners of every cell: those of cell `c` at `4c` to `4c + 3`,
	 * in the order `(i, j)`, `(i + 1, j)`, `(i, j + 1)`, `(i + 1, j + 1)` in
	 * the cell's own face.
	 */
	readonly cellCorners: Int32Array;
	/**
	 * The two corners of every edge, laid out like {@link Grid.neighbours}
	 * at twice its stride: the edge across side `k` of cell `c` runs from the
	 * corner at `2(4c + k)` to the one at `2(4c + k) + 1`, anticlockwise round
	 * the cell as seen from outside the sphere, so the cell lies on its left.
	 * Seen from the cell on the other side, the same edge runs the other way.
	 */
	readonly edgeCorners: Int32Array;
	/**
	 * The cells that meet at every corner: those of corner `p` at `4p` to
	 * `4p + 3`, in increasing order, with -1 in the last slot at the eight
	 * cube corners.
	 */
	readonly cornerCells: Int32Array;
	/**
	 * The corners joined to every corner by a cell edge, laid out like
	 * {@link CornerIndex.cornerCells}, with -1 in the last slot at the eight
	 * cube corners.
	 */
	readonly cornerNeighbours: Int32Array;
	/**
	 * For every slot of {@link CornerIndex.cornerNeighbours}, the edge that
	 * joins the two corners as an entry `4c + k` of
	 * {@link Grid.neighbours}, from whichever of its two cells has the lower
	 * index; -1 where the slot is empty.
	 */
	readonly neighbourEdges: Int32Array;
	/**
	 * Every corner's direction, as a unit vector: x, y, z of corner `p` at
	 * `3p` to `3p + 2`, as {@link faceCorners} places it on the face it is
	 * numbered from.
	 */
	readonly directions: Float64Array;
};

/**
 * How a coast's one value of `ψ` is set, in {@link CornerOperator.coasts}.
 *
 * @remarks
 * - `'value'`: given, as the coast's entry of the solve's `coastValues`.
 * - `'net'`: found so that the operator summed over the coast's corners,
 *   each times its area from {@link cornerAreas}, comes to the coast's entry
 *   of `coastValues`: `Σ_p A_p (a ∇²ψ + b ∂ψ/∂x)_p = net` over the coast's
 *   corners `p`. The links between two of the coast's corners carry nothing,
 *   so the sum is over the links from the coast to the corners round it. A
 *   `net` of the sum of `A_p f_p` over the coast's corners makes the
 *   equation hold over the coast as a whole; an island rule for a gyre
 *   gives its own.
 *
 * At least one coast must be a `'value'` coast, since the operator takes no
 * notice of a constant added to `ψ`. That holds for each connected piece of
 * sea too: every piece must touch at least one `'value'` coast. A piece
 * whose coasts are all `'net'` leaves a constant undetermined, so the system
 * is singular and the solve may fail to converge (`converged: false`) or
 * return `ψ` up to an arbitrary constant.
 * {@link createCornerSolver} checks only that some coast is a `'value'`
 * coast.
 */
export type CornerCoast = 'value' | 'net';

/** The equation a {@link CornerSolver} solves, apart from its forcing. */
export type CornerOperator = {
	/**
	 * `a`, the coefficient of `∇²ψ`: one number for every corner or one per
	 * corner, each finite and above zero.
	 */
	readonly diffusion: number | ArrayLike<number>;
	/**
	 * `b`, the coefficient of `∂ψ/∂x`, the slope eastward: one number for
	 * every corner or one per corner, each finite.
	 */
	readonly eastward: number | ArrayLike<number>;
	/**
	 * The coast each corner belongs to, one whole number per corner: 0 for a
	 * corner of the sea, whose `ψ` is free, and `k` from 1 for a corner of
	 * the `k`th coast, `coasts[k - 1]`. {@link coastLabels} gives these from
	 * which cells are land. Every coast must have a corner.
	 */
	readonly labels: ArrayLike<number>;
	/** How each coast's value is set, the first for label 1. */
	readonly coasts: readonly CornerCoast[];
	/**
	 * The sphere's radius: `∇²` is per this unit of length squared and
	 * `∂/∂x` per this unit. Defaults to 1, for the unit sphere;
	 * `PLANET_RADIUS_KM * 1000` for per metre.
	 */
	readonly radius?: number;
};

/** How one solve of a {@link CornerSolver} is run. */
export type CornerSolveOptions = {
	/**
	 * How small the residual must become, as a share of the right-hand
	 * side's: the root-sum-square of every free corner's equation and every
	 * `'net'` coast's condition, each equation times its corner's area, over
	 * the same of the right-hand side. Finite and above zero; defaults to
	 * {@link CORNER_SOLVE_TOLERANCE}.
	 */
	readonly tolerance?: number;
	/**
	 * The most iterations before giving up: a whole number from 1; defaults
	 * to {@link CORNER_MAX_ITERATIONS}.
	 */
	readonly maxIterations?: number;
	/**
	 * A first guess at `ψ`, one finite value per corner, such as the last
	 * month's answer; a coast's guess is read at its first corner. Zero when
	 * left out.
	 */
	readonly guess?: ArrayLike<number>;
};

/** What a solve of a {@link CornerSolver} gives. */
export type CornerSolveResult = {
	/**
	 * `ψ` at every corner, in a new array owned by the caller: every corner
	 * of a coast holds the coast's one value exactly.
	 */
	readonly values: Float64Array;
	/** The BiCGSTAB iterations taken. */
	readonly iterations: number;
	/**
	 * Whether the residual came within the tolerance; false when the most
	 * iterations ran out first, or the system could not be solved.
	 */
	readonly converged: boolean;
	/** The residual at the end, as a share of the right-hand side's. */
	readonly residual: number;
};

/** A solver for one grid and one {@link CornerOperator}, for many forcings. */
export type CornerSolver = {
	/** The grid the corners are of. */
	readonly grid: Grid;
	/**
	 * The operator `a ∇²ψ + b ∂ψ/∂x` at every corner, as the solver
	 * discretises it, extra diffusion included, coasts or not.
	 *
	 * @param values - `ψ`, one finite value per corner. Not changed.
	 * @param into - Where to write the result, one per corner; a new array
	 * when left out.
	 * @returns `into`, or the new array.
	 * @throws RangeError if an array has the wrong length or `values` a
	 * value that is not finite.
	 */
	apply(values: ArrayLike<number>, into?: Float64Array): Float64Array;
	/**
	 * Solves the equation for one forcing.
	 *
	 * @param forcing - `f`, one finite value per corner; read only at the
	 * corners of the sea. Not changed.
	 * @param coastValues - One finite value per coast: a `'value'` coast's
	 * `ψ`, or a `'net'` coast's net, as {@link CornerCoast} says. Not
	 * changed.
	 * @param options - Tolerance, most iterations and first guess.
	 * @returns `ψ` at every corner and how the solve went. A solve that runs
	 * out of iterations returns its last answer, with `converged` false.
	 * @throws RangeError if an array has the wrong length or a value that is
	 * not finite, or an option is out of range.
	 */
	solve(
		forcing: ArrayLike<number>,
		coastValues: ArrayLike<number>,
		options?: CornerSolveOptions,
	): CornerSolveResult;
};

/** A {@link CornerOperator} with its forcing and coast values. */
export type CornerProblem = CornerOperator & {
	/** `f`, as {@link CornerSolver.solve} takes it. */
	readonly forcing: ArrayLike<number>;
	/** As {@link CornerSolver.solve} takes them. */
	readonly coastValues: ArrayLike<number>;
};

/** The coasts of a grid, from {@link coastLabels}. */
export type CoastLabels = {
	/** The coast of every corner, 0 for the sea, as {@link CornerOperator.labels}. */
	readonly labels: Int32Array;
	/** How many coasts there are; they are numbered from 1. */
	readonly count: number;
};

/** The geometry of the operators on one grid's corners, built once. */
type CornerGeometry = {
	/** Every corner's area on the unit sphere, in steradians. */
	readonly areas: Float64Array;
	/**
	 * The corners of the cells round every corner: those of corner `p` at
	 * `8p` to `8p + 7`, its four (or three) neighbours along an edge and the
	 * four (or three) across a cell, -1 in the slots left over.
	 */
	readonly stencil: Int32Array;
	/**
	 * For every stencil slot, the weight of `ψ_q − ψ_p` in the corner's
	 * area times its Laplacian: minus the bilinear elements' stiffness
	 * between the two corners, summed over the cells they share.
	 */
	readonly weights: Float64Array;
	/**
	 * For every stencil slot, the coefficient of `ψ_q − ψ_p` in the
	 * least-squares eastward slope, per radian; zero across a cell.
	 */
	readonly eastSlopes: Float64Array;
	/**
	 * For every stencil slot along an edge, the edge's dual length, the arc
	 * between the centres of the cells either side of it, over its own
	 * length, from {@link edgeGeometry}: the weight of the two-point
	 * diffusion the upwinding adds. Zero across a cell.
	 */
	readonly edgeWeights: Float64Array;
};

const INDEXES = new Map<number, CornerIndex>();
const GEOMETRIES = new WeakMap<Grid, CornerGeometry>();

/** Throws unless an array has one entry per item. */
const assertLength = (
	values: ArrayLike<unknown>,
	count: number,
	what: string,
	per: string,
): void => {
	if (values.length !== count) {
		throw new RangeError(
			`Expected one ${what} per ${per}, ${count} in all; got ${values.length}`,
		);
	}
};

/** Throws unless every value is finite, naming the field. */
const assertFinite = (values: ArrayLike<number>, what: string): void => {
	for (let entry = 0; entry < values.length; entry++) {
		if (!Number.isFinite(values[entry])) {
			throw new RangeError(
				`Every ${what} must be finite; entry ${entry} is ${values[entry]}`,
			);
		}
	}
};

const buildIndex = (n: number): CornerIndex => {
	const stride = n + 1;
	const perFace = stride * stride;
	const cellCount = FACES * n * n;
	const cornerCount = FACES * n * n + 2;
	const span = 2 * n + 1;
	// The number of every face's corner, in the layout of faceCorners.
	const ids = new Int32Array(FACES * perFace);
	const directions = new Float64Array(3 * cornerCount);
	// A corner on a face's border is found again from the other faces by its
	// place on the cube in whole steps of the equiangular coordinates: n
	// along the face's normal and 2i − n, 2j − n along its axes. Two faces
	// that share a point give it the same whole numbers exactly.
	const border = new Map<number, number>();
	let next = 0;
	for (let face = 0; face < FACES; face++) {
		const { normal, u, v } = FACE_AXES[face] as FaceAxes;
		const points = faceCorners(n, face);
		for (let j = 0; j <= n; j++) {
			for (let i = 0; i <= n; i++) {
				const at = j * stride + i;
				let id = -1;
				if (i === 0 || i === n || j === 0 || j === n) {
					const a = 2 * i - n;
					const b = 2 * j - n;
					const x = n * normal[0] + a * u[0] + b * v[0];
					const y = n * normal[1] + a * u[1] + b * v[1];
					const z = n * normal[2] + a * u[2] + b * v[2];
					const key = ((x + n) * span + (y + n)) * span + (z + n);
					id = border.get(key) ?? -1;
					if (id < 0) {
						id = next;
						border.set(key, id);
					}
				} else {
					id = next;
				}
				if (id === next) {
					directions[3 * id] = points[3 * at] as number;
					directions[3 * id + 1] = points[3 * at + 1] as number;
					directions[3 * id + 2] = points[3 * at + 2] as number;
					next++;
				}
				ids[face * perFace + at] = id;
			}
		}
	}
	if (next !== cornerCount) {
		throw new Error(
			`A grid of ${n} cells per face edge numbered ${next} corners, not ${cornerCount}`,
		);
	}

	const cellCorners = new Int32Array(SIDES * cellCount);
	const edgeCorners = new Int32Array(2 * SIDES * cellCount);
	const cornerCells = new Int32Array(SLOTS * cornerCount).fill(-1);
	const cornerNeighbours = new Int32Array(SLOTS * cornerCount).fill(-1);
	const neighbourEdges = new Int32Array(SLOTS * cornerCount).fill(-1);
	const cellsFound = new Uint8Array(cornerCount);
	const linksFound = new Uint8Array(cornerCount);
	const { first, second } = sideCorners(n);
	const addLink = (p: number, q: number, entry: number): void => {
		const start = SLOTS * p;
		const found = linksFound[p] as number;
		for (let slot = 0; slot < found; slot++) {
			if (cornerNeighbours[start + slot] === q) {
				return;
			}
		}
		cornerNeighbours[start + found] = q;
		neighbourEdges[start + found] = entry;
		linksFound[p] = found + 1;
	};
	let cell = 0;
	for (let face = 0; face < FACES; face++) {
		const { normal, u, v } = FACE_AXES[face] as FaceAxes;
		// Whether i, j and the outward normal make a right-handed set: if so
		// the face's rows run anticlockwise round a cell from -j to +i, seen
		// from outside, and if not clockwise.
		const handedness =
			(u[1] * v[2] - u[2] * v[1]) * normal[0] +
			(u[2] * v[0] - u[0] * v[2]) * normal[1] +
			(u[0] * v[1] - u[1] * v[0]) * normal[2];
		const base = face * perFace;
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < n; i++) {
				const low = base + j * stride + i;
				const corners = [
					ids[low] as number,
					ids[low + 1] as number,
					ids[low + stride] as number,
					ids[low + stride + 1] as number,
				];
				for (let k = 0; k < SIDES; k++) {
					const corner = corners[k] as number;
					cellCorners[SIDES * cell + k] = corner;
					cornerCells[SLOTS * corner + (cellsFound[corner] as number)] = cell;
					cellsFound[corner] = (cellsFound[corner] as number) + 1;
				}
				for (let side = 0; side < SIDES; side++) {
					// sideCorners runs the +i and -j sides anticlockwise round
					// the cell on a right-handed face and the -i and +j sides
					// clockwise, so those two are reversed there; a left-handed
					// face is the other way round. All six faces of FACE_AXES
					// are left-handed.
					const reversed = (side === 1 || side === 2) === handedness < 0;
					const start = ids[low + (first[side] as number)] as number;
					const end = ids[low + (second[side] as number)] as number;
					const entry = SIDES * cell + side;
					const from = reversed ? end : start;
					const to = reversed ? start : end;
					edgeCorners[2 * entry] = from;
					edgeCorners[2 * entry + 1] = to;
					addLink(from, to, entry);
					addLink(to, from, entry);
				}
				cell++;
			}
		}
	}
	return {
		n,
		cornerCount,
		faceIds: ids,
		cellCorners,
		edgeCorners,
		cornerCells,
		cornerNeighbours,
		neighbourEdges,
		directions,
	};
};

/**
 * The corners of a grid's cells, numbered once across the faces, and how
 * they join the cells, the edges and one another, built on first use for
 * each grid and then shared.
 *
 * @remarks
 * Only the grid's `n` is read, so a stand-in grid of any size works, and
 * the tables are kept for each size.
 *
 * @param grid - The grid.
 * @throws RangeError if the grid's `n` is not a whole number from 1.
 */
export const cornerIndex = (grid: Grid): CornerIndex => indexForSize(grid.n);

/** The corner index of a grid of `n` cells per face edge, built once. */
const indexForSize = (n: number): CornerIndex => {
	let index = INDEXES.get(n);
	if (index === undefined) {
		if (!Number.isInteger(n) || n < 1) {
			throw new RangeError(
				`A grid has a whole number of cells per face edge from 1; got ${n}`,
			);
		}
		index = buildIndex(n);
		INDEXES.set(n, index);
	}
	return index;
};

/**
 * The flows across every edge of a streamfunction held at the corners.
 *
 * @remarks
 * Entry `4c + k` is the flow out of cell `c` across its side `k`, laid out
 * as {@link edgeFlows} lays it out: `ψ` at the edge's first corner less `ψ`
 * at its second, in the order of {@link CornerIndex.edgeCorners}, which is
 * anticlockwise round the cell seen from outside. The same edge seen from
 * the other cell is the exact negative, and the four flows out of any cell
 * sum to zero to rounding, at the cube's edges and corners too. The flows
 * are those of the transport `r̂ × ∇ψ`, in the units of `ψ`: square metres a
 * second for a streamfunction of a velocity in metres a second times metres,
 * cubic metres a second for one of a transport through the whole depth.
 *
 * @param grid - The grid.
 * @param values - `ψ`, one finite value per corner. Not changed.
 * @param into - Where to write the flows, `4 * cellCount` long; a new array
 * when left out.
 * @returns `into`, or the new array.
 * @throws RangeError if an array has the wrong length, or `values` a value
 * that is not finite.
 */
export const edgeFlowsFromCorners = (
	grid: Grid,
	values: ArrayLike<number>,
	into?: Float64Array,
): Float64Array => {
	const index = cornerIndex(grid);
	const { edgeCorners, cornerCount } = index;
	const entries = edgeCorners.length / 2;
	assertLength(values, cornerCount, 'value', 'corner');
	assertFinite(values, 'corner value');
	const result = into ?? new Float64Array(entries);
	assertLength(result, entries, 'flow', 'side of a cell');
	for (let entry = 0; entry < entries; entry++) {
		result[entry] =
			(values[edgeCorners[2 * entry] as number] as number) -
			(values[edgeCorners[2 * entry + 1] as number] as number);
	}
	return result;
};

/**
 * The coasts of a grid with some of its cells land: every corner of a land
 * cell is on the coast of that cell's land, and the rest are the sea's.
 *
 * @remarks
 * Land cells that share a corner, not only an edge, are one land, so two
 * lands never meet at a corner and every corner has at most one coast. A
 * sea a cell wide between two lands therefore stays open: its corners are
 * on two different coasts, which may differ in `ψ`. Every edge with land on
 * either side has both its corners on that land's coast and so carries
 * nothing once the solve holds the coast to one value. Coasts are numbered
 * from 1 in the order of their lowest-numbered cell.
 *
 * @param grid - The grid.
 * @param land - One value per cell: non-zero for land, zero for sea; each
 * finite. Not changed.
 * @returns A new array of labels, one per corner, and the number of coasts.
 * @throws RangeError if `land` has the wrong length or a value that is not
 * finite.
 */
export const coastLabels = (
	grid: Grid,
	land: ArrayLike<number>,
): CoastLabels => {
	const index = cornerIndex(grid);
	const { cellCorners, cornerCells, cornerCount } = index;
	const cellCount = cellCorners.length / SIDES;
	assertLength(land, cellCount, 'land value', 'cell');
	assertFinite(land, 'land value');
	const labels = new Int32Array(cornerCount);
	const cellLabels = new Int32Array(cellCount);
	const queue = new Int32Array(cellCount);
	let count = 0;
	for (let seed = 0; seed < cellCount; seed++) {
		if (land[seed] === 0 || cellLabels[seed] !== 0) {
			continue;
		}
		count++;
		cellLabels[seed] = count;
		queue[0] = seed;
		let head = 0;
		let tail = 1;
		while (head < tail) {
			const cell = queue[head] as number;
			head++;
			for (let k = 0; k < SIDES; k++) {
				const corner = cellCorners[SIDES * cell + k] as number;
				labels[corner] = count;
				for (let slot = 0; slot < SLOTS; slot++) {
					const other = cornerCells[SLOTS * corner + slot] as number;
					if (other >= 0 && land[other] !== 0 && cellLabels[other] === 0) {
						cellLabels[other] = count;
						queue[tail] = other;
						tail++;
					}
				}
			}
		}
	}
	return { labels, count };
};

/** The points of the two-point Gauss rule on [0, 1]. */
const GAUSS = [0.5 - 0.5 / Math.sqrt(3), 0.5 + 0.5 / Math.sqrt(3)] as const;

/**
 * The stiffness matrix of the bilinear finite element on a quadrilateral:
 * entry `4k + l` the integral of `∇N_k · ∇N_l` over it, for the corners in
 * the order of {@link CornerIndex.cellCorners}, by the two-point Gauss rule
 * in each direction, which is exact for a parallelogram.
 */
const bilinearStiffness = (
	x: Float64Array,
	y: Float64Array,
	into: Float64Array,
): void => {
	into.fill(0);
	const x0 = x[0] as number;
	const x1 = x[1] as number;
	const x2 = x[2] as number;
	const x3 = x[3] as number;
	const y0 = y[0] as number;
	const y1 = y[1] as number;
	const y2 = y[2] as number;
	const y3 = y[3] as number;
	const dXi = [0, 0, 0, 0];
	const dEta = [0, 0, 0, 0];
	const gx = [0, 0, 0, 0];
	const gy = [0, 0, 0, 0];
	for (const eta of GAUSS) {
		for (const xi of GAUSS) {
			dXi[0] = eta - 1;
			dXi[1] = 1 - eta;
			dXi[2] = -eta;
			dXi[3] = eta;
			dEta[0] = xi - 1;
			dEta[1] = -xi;
			dEta[2] = 1 - xi;
			dEta[3] = xi;
			const xXi =
				(dXi[0] as number) * x0 +
				(dXi[1] as number) * x1 +
				(dXi[2] as number) * x2 +
				(dXi[3] as number) * x3;
			const xEta =
				(dEta[0] as number) * x0 +
				(dEta[1] as number) * x1 +
				(dEta[2] as number) * x2 +
				(dEta[3] as number) * x3;
			const yXi =
				(dXi[0] as number) * y0 +
				(dXi[1] as number) * y1 +
				(dXi[2] as number) * y2 +
				(dXi[3] as number) * y3;
			const yEta =
				(dEta[0] as number) * y0 +
				(dEta[1] as number) * y1 +
				(dEta[2] as number) * y2 +
				(dEta[3] as number) * y3;
			const determinant = xXi * yEta - xEta * yXi;
			for (let k = 0; k < SIDES; k++) {
				const a = dXi[k] as number;
				const b = dEta[k] as number;
				gx[k] = (yEta * a - yXi * b) / determinant;
				gy[k] = (xXi * b - xEta * a) / determinant;
			}
			// Each of the four points stands for a quarter of the square.
			const weight = 0.25 * Math.abs(determinant);
			for (let k = 0; k < SIDES; k++) {
				for (let l = 0; l < SIDES; l++) {
					into[SIDES * k + l] =
						(into[SIDES * k + l] as number) +
						weight *
							((gx[k] as number) * (gx[l] as number) +
								(gy[k] as number) * (gy[l] as number));
				}
			}
		}
	}
};

const buildGeometry = (grid: Grid): CornerGeometry => {
	const index = cornerIndex(grid);
	const {
		cornerCount,
		cellCorners,
		cornerNeighbours,
		neighbourEdges,
		directions,
	} = index;
	const { cellCount, centres } = grid;
	const { lengths, distances } = edgeGeometry(grid);
	const areas = new Float64Array(cornerCount);
	const stencil = new Int32Array(STENCIL * cornerCount).fill(-1);
	const weights = new Float64Array(STENCIL * cornerCount);
	const eastSlopes = new Float64Array(STENCIL * cornerCount);
	const edgeWeights = new Float64Array(STENCIL * cornerCount);
	/** The stencil slot of corner q in p's, added if it is not there yet. */
	const slotOf = (p: number, q: number): number => {
		const start = STENCIL * p;
		for (let at = start; at < start + STENCIL; at++) {
			const held = stencil[at] as number;
			if (held === q) {
				return at;
			}
			if (held < 0) {
				stencil[at] = q;
				return at;
			}
		}
		throw new Error(`Corner ${p} has more than ${STENCIL} corners round it`);
	};
	const x = new Float64Array(SIDES);
	const y = new Float64Array(SIDES);
	const stiffness = new Float64Array(SIDES * SIDES);
	for (let cell = 0; cell < cellCount; cell++) {
		const quarter = 0.25 * (grid.areas[cell] as number);
		const cx = centres[3 * cell] as number;
		const cy = centres[3 * cell + 1] as number;
		const cz = centres[3 * cell + 2] as number;
		// A tangent frame at the centre, its first axis along the cell's
		// first row.
		const first = cellCorners[SIDES * cell] as number;
		const second = cellCorners[SIDES * cell + 1] as number;
		let ax =
			(directions[3 * second] as number) - (directions[3 * first] as number);
		let ay =
			(directions[3 * second + 1] as number) -
			(directions[3 * first + 1] as number);
		let az =
			(directions[3 * second + 2] as number) -
			(directions[3 * first + 2] as number);
		const towards = ax * cx + ay * cy + az * cz;
		ax -= towards * cx;
		ay -= towards * cy;
		az -= towards * cz;
		const length = Math.sqrt(ax * ax + ay * ay + az * az);
		ax /= length;
		ay /= length;
		az /= length;
		const bx = cy * az - cz * ay;
		const by = cz * ax - cx * az;
		const bz = cx * ay - cy * ax;
		// The corners on the plane tangent at the centre, by the gnomonic
		// projection, which keeps the cell's sides, arcs of great circles,
		// straight.
		for (let k = 0; k < SIDES; k++) {
			const corner = cellCorners[SIDES * cell + k] as number;
			areas[corner] = (areas[corner] as number) + quarter;
			const px = directions[3 * corner] as number;
			const py = directions[3 * corner + 1] as number;
			const pz = directions[3 * corner + 2] as number;
			const scale = 1 / (px * cx + py * cy + pz * cz);
			const gx = px * scale - cx;
			const gy = py * scale - cy;
			const gz = pz * scale - cz;
			x[k] = gx * ax + gy * ay + gz * az;
			y[k] = gx * bx + gy * by + gz * bz;
		}
		bilinearStiffness(x, y, stiffness);
		for (let k = 0; k < SIDES; k++) {
			const p = cellCorners[SIDES * cell + k] as number;
			for (let l = 0; l < SIDES; l++) {
				if (l !== k) {
					const at = slotOf(p, cellCorners[SIDES * cell + l] as number);
					weights[at] =
						(weights[at] as number) - (stiffness[SIDES * k + l] as number);
				}
			}
		}
	}

	const dx = new Float64Array(SLOTS);
	const dy = new Float64Array(SLOTS);
	const slots = new Int32Array(SLOTS);
	for (let p = 0; p < cornerCount; p++) {
		const px = directions[3 * p] as number;
		const py = directions[3 * p + 1] as number;
		const pz = directions[3 * p + 2] as number;
		const across = px * px + py * py;
		const onPole = across < POLE_SQUARED;
		// East is (-y, x, 0) scaled, and north is up × east.
		const flat = Math.sqrt(across);
		const ex = onPole ? 0 : -py / flat;
		const ey = onPole ? 0 : px / flat;
		const nx = -pz * ey;
		const ny = pz * ex;
		const nz = px * ey - py * ex;
		let sxx = 0;
		let sxy = 0;
		let syy = 0;
		for (let link = 0; link < SLOTS; link++) {
			const q = cornerNeighbours[SLOTS * p + link] as number;
			if (q < 0) {
				slots[link] = -1;
				continue;
			}
			const slot = slotOf(p, q);
			slots[link] = slot;
			const edge = neighbourEdges[SLOTS * p + link] as number;
			edgeWeights[slot] =
				(distances[edge] as number) / (lengths[edge] as number);
			// The step to q in p's tangent plane, as long as the arc to it.
			const qx = directions[3 * q] as number;
			const qy = directions[3 * q + 1] as number;
			const qz = directions[3 * q + 2] as number;
			const along = px * qx + py * qy + pz * qz;
			const tx = qx - along * px;
			const ty = qy - along * py;
			const tz = qz - along * pz;
			const sine = Math.sqrt(tx * tx + ty * ty + tz * tz);
			const scale = Math.atan2(sine, along) / sine;
			const stepEast = (tx * ex + ty * ey) * scale;
			const stepNorth = (tx * nx + ty * ny + tz * nz) * scale;
			dx[link] = stepEast;
			dy[link] = stepNorth;
			sxx += stepEast * stepEast;
			sxy += stepEast * stepNorth;
			syy += stepNorth * stepNorth;
		}
		if (onPole) {
			continue;
		}
		// The eastward row of the inverse of the 2 × 2 normal matrix, applied
		// to each step.
		const determinant = sxx * syy - sxy * sxy;
		for (let link = 0; link < SLOTS; link++) {
			const at = slots[link] as number;
			if (at >= 0) {
				eastSlopes[at] =
					(syy * (dx[link] as number) - sxy * (dy[link] as number)) /
					determinant;
			}
		}
	}
	return { areas, stencil, weights, eastSlopes, edgeWeights };
};

const cornerGeometry = (grid: Grid): CornerGeometry => {
	let geometry = GEOMETRIES.get(grid);
	if (geometry === undefined) {
		geometry = buildGeometry(grid);
		GEOMETRIES.set(grid, geometry);
	}
	return geometry;
};

/**
 * The area each corner stands for: a quarter of each cell that meets it, on
 * the unit sphere, in steradians, built on first use for each grid and then
 * shared.
 *
 * @remarks
 * They sum to the sphere's 4π to rounding, as the cells' do. The array is
 * shared and must be treated as read-only.
 *
 * @param grid - The grid.
 */
export const cornerAreas = (grid: Grid): Float64Array =>
	cornerGeometry(grid).areas;

/** One value per corner, from one number for all or an array of them. */
const perCorner = (
	value: number | ArrayLike<number>,
	count: number,
	what: string,
): Float64Array => {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError(`Every ${what} must be finite; got ${value}`);
		}
		return new Float64Array(count).fill(value);
	}
	assertLength(value, count, what, 'corner');
	assertFinite(value, what);
	return Float64Array.from(value);
};

/** Which unknown every corner's `ψ` is, on one level of the solver. */
type Unknowns = {
	/**
	 * The unknown of every corner: its own for a corner of the sea, its
	 * coast's for a corner of a `'net'` coast, -1 for a `'value'` coast's.
	 */
	readonly ofCorner: Int32Array;
	/** The unknown of every `'net'` coast by its label, -1 for the rest. */
	readonly ofCoast: Int32Array;
	/** How many unknowns there are: the sea's corners, then the coasts'. */
	readonly size: number;
};

const unknownsOf = (
	labels: Int32Array,
	coasts: readonly CornerCoast[],
): Unknowns => {
	const ofCorner = new Int32Array(labels.length).fill(-1);
	let size = 0;
	for (let corner = 0; corner < labels.length; corner++) {
		if (labels[corner] === 0) {
			ofCorner[corner] = size;
			size++;
		}
	}
	const ofCoast = new Int32Array(coasts.length + 1).fill(-1);
	for (let coast = 0; coast < coasts.length; coast++) {
		if (coasts[coast] === 'net') {
			ofCoast[coast + 1] = size;
			size++;
		}
	}
	for (let corner = 0; corner < labels.length; corner++) {
		const label = labels[corner] as number;
		if (label > 0) {
			ofCorner[corner] = ofCoast[label] as number;
		}
	}
	return { ofCorner, ofCoast, size };
};

/** The coarsest grid the multigrid cycle's levels are built down to. */
const COARSEST_N = 4;

/**
 * The prolongations from each coarser grid's unknowns to the one above,
 * finest first, halving the cells per face edge while it stays even and
 * above {@link COARSEST_N}.
 *
 * @remarks
 * A coarse grid's corner `(I, J)` of a face is the fine grid's `(2I, 2J)`,
 * and is the sea's or a coast's as that one is. A fine corner of the sea
 * takes the coarse correction bilinearly along its face, from the one, two
 * or four coarse corners round it, of which those on a `'value'` coast give
 * nothing; a fine corner on a cube edge finds the same coarse corners from
 * either face. A `'net'` coast's unknown takes its own coarse unknown.
 */
const prolongations = (
	n: number,
	labels: Int32Array,
	coasts: readonly CornerCoast[],
	fine: Unknowns,
): SparseMatrix[] => {
	const result: SparseMatrix[] = [];
	let size = n;
	let fineLabels = labels;
	let fineUnknowns = fine;
	while (size % 2 === 0 && size > COARSEST_N) {
		const coarseSize = size / 2;
		const fineIndex = indexForSize(size);
		const coarseIndex = indexForSize(coarseSize);
		const fineStride = size + 1;
		const coarseStride = coarseSize + 1;
		const coarseLabels = new Int32Array(coarseIndex.cornerCount);
		for (let face = 0; face < FACES; face++) {
			for (let j = 0; j <= coarseSize; j++) {
				for (let i = 0; i <= coarseSize; i++) {
					const coarse = coarseIndex.faceIds[
						(face * coarseStride + j) * coarseStride + i
					] as number;
					const corner = fineIndex.faceIds[
						(face * fineStride + 2 * j) * fineStride + 2 * i
					] as number;
					coarseLabels[coarse] = fineLabels[corner] as number;
				}
			}
		}
		const coarseUnknowns = unknownsOf(coarseLabels, coasts);
		// Each fine unknown's row of at most four entries, found from the
		// first face it is met on.
		const rowColumns = new Int32Array(SLOTS * fineUnknowns.size);
		const rowShares = new Float64Array(SLOTS * fineUnknowns.size);
		const rowLengths = new Uint8Array(fineUnknowns.size);
		const done = new Uint8Array(fineUnknowns.size);
		const put = (unknown: number, column: number, share: number): void => {
			const length = rowLengths[unknown] as number;
			rowColumns[SLOTS * unknown + length] = column;
			rowShares[SLOTS * unknown + length] = share;
			rowLengths[unknown] = length + 1;
		};
		for (let label = 1; label <= coasts.length; label++) {
			const unknown = fineUnknowns.ofCoast[label] as number;
			if (unknown >= 0) {
				put(unknown, coarseUnknowns.ofCoast[label] as number, 1);
				done[unknown] = 1;
			}
		}
		for (let face = 0; face < FACES; face++) {
			for (let j = 0; j <= size; j++) {
				const lowJ = j >> 1;
				const highJ = (j + 1) >> 1;
				for (let i = 0; i <= size; i++) {
					const corner = fineIndex.faceIds[
						(face * fineStride + j) * fineStride + i
					] as number;
					const unknown = fineUnknowns.ofCorner[corner] as number;
					if (unknown < 0 || done[unknown] === 1) {
						continue;
					}
					done[unknown] = 1;
					const lowI = i >> 1;
					const highI = (i + 1) >> 1;
					const share = (lowI === highI ? 1 : 0.5) * (lowJ === highJ ? 1 : 0.5);
					for (let cj = lowJ; cj <= highJ; cj++) {
						for (let ci = lowI; ci <= highI; ci++) {
							const coarse = coarseIndex.faceIds[
								(face * coarseStride + cj) * coarseStride + ci
							] as number;
							const column = coarseUnknowns.ofCorner[coarse] as number;
							if (column >= 0) {
								put(unknown, column, share);
							}
						}
					}
				}
			}
		}
		const builder = createRowBuilder(coarseUnknowns.size);
		for (let unknown = 0; unknown < fineUnknowns.size; unknown++) {
			const length = rowLengths[unknown] as number;
			for (let at = 0; at < length; at++) {
				builder.add(
					rowColumns[SLOTS * unknown + at] as number,
					rowShares[SLOTS * unknown + at] as number,
				);
			}
			builder.endRow();
		}
		result.push(builder.finish());
		size = coarseSize;
		fineLabels = coarseLabels;
		fineUnknowns = coarseUnknowns;
	}
	return result;
};

/**
 * A solver for `a ∇²ψ + b ∂ψ/∂x = f` on the corners of a grid, with `ψ`
 * held to one value along each coast, for one operator and any number of
 * forcings.
 *
 * @remarks
 * The discretisation and the solver are described at the head of this
 * module. Making the solver builds the system and its multigrid hierarchy,
 * which costs about what a solve does; each solve then costs, per
 * iteration, two products with the matrix and two multigrid cycles. Each
 * `'net'` coast is an unknown on every level, down to the coarsest, which
 * is factorised densely, so a few hundred of them would make the coarsest
 * level the dearest, and its memory grows with the square of their number:
 * about 800 MB for 10⁴ `'net'` coasts. A caller with many small islands
 * should hold them as `'value'` coasts or fold each into a neighbour.
 *
 * Every connected piece of sea must touch at least one `'value'` coast;
 * otherwise the system is singular and the solve may fail to converge
 * (`converged: false`) or return `ψ` up to an arbitrary constant, with no
 * error thrown.
 *
 * @param grid - The grid.
 * @param operator - The coefficients, the coasts and the radius. Copied.
 * @throws RangeError if an array has the wrong length or a value out of
 * range, a label is not a whole number from 0 to the number of coasts, a
 * coast has no corner, or no coast is a `'value'` coast.
 */
export const createCornerSolver = (
	grid: Grid,
	operator: CornerOperator,
): CornerSolver => {
	const index = cornerIndex(grid);
	const { cornerCount } = index;
	const { areas, stencil, weights, eastSlopes, edgeWeights } =
		cornerGeometry(grid);
	const radius = operator.radius ?? 1;
	if (!(radius > 0 && Number.isFinite(radius))) {
		throw new RangeError(
			`A radius must be finite and above zero; got ${radius}`,
		);
	}
	const diffusion = perCorner(operator.diffusion, cornerCount, 'diffusion');
	for (let p = 0; p < cornerCount; p++) {
		if (!((diffusion[p] as number) > 0)) {
			throw new RangeError(
				`Every diffusion must be above zero; corner ${p} has ${diffusion[p]}`,
			);
		}
	}
	const eastward = perCorner(operator.eastward, cornerCount, 'eastward slope');
	const { labels: given } = operator;
	const coasts = operator.coasts.slice();
	const coastCount = coasts.length;
	assertLength(given, cornerCount, 'label', 'corner');
	const labels = new Int32Array(cornerCount);
	const coastSizes = new Int32Array(coastCount + 1);
	for (let p = 0; p < cornerCount; p++) {
		const label = given[p] as number;
		if (!Number.isInteger(label) || label < 0 || label > coastCount) {
			throw new RangeError(
				`Every label must be a whole number from 0 to ${coastCount}, the number of coasts; corner ${p} has ${label}`,
			);
		}
		labels[p] = label;
		coastSizes[label] = (coastSizes[label] as number) + 1;
	}
	let held = 0;
	for (let coast = 0; coast < coastCount; coast++) {
		const kind = coasts[coast];
		if (kind !== 'value' && kind !== 'net') {
			throw new RangeError(
				`A coast is held to a 'value' or by its 'net'; coast ${coast + 1} is ${String(kind)}`,
			);
		}
		if (coastSizes[coast + 1] === 0) {
			throw new RangeError(`Coast ${coast + 1} has no corner`);
		}
		if (kind === 'value') {
			held++;
		}
	}
	if (held === 0) {
		throw new RangeError(
			"At least one coast must be held to a 'value': the operator does not see a constant added to ψ",
		);
	}

	// Every link's weight in the area-weighted equation, A_p K_pq, with the
	// least two-point diffusion along the edges at each corner that keeps the
	// links along them from going below zero.
	const links = new Float64Array(STENCIL * cornerCount);
	const radiusSquared = radius * radius;
	for (let p = 0; p < cornerCount; p++) {
		const a = diffusion[p] as number;
		const b = eastward[p] as number;
		const area = areas[p] as number;
		let extra = 0;
		for (let at = STENCIL * p; at < STENCIL * (p + 1); at++) {
			const edgeWeight = edgeWeights[at] as number;
			if (edgeWeight > 0) {
				const need =
					-(
						a * (weights[at] as number) +
						b * (eastSlopes[at] as number) * area * radius
					) / edgeWeight;
				extra = Math.max(extra, need);
			}
		}
		for (let at = STENCIL * p; at < STENCIL * (p + 1); at++) {
			if ((stencil[at] as number) >= 0) {
				// The weight the extra diffusion just cancels may round to a
				// hair below zero.
				links[at] = Math.max(
					0,
					(a * (weights[at] as number) + extra * (edgeWeights[at] as number)) /
						radiusSquared +
						(area * b * (eastSlopes[at] as number)) / radius,
				);
			}
		}
	}

	const unknowns = unknownsOf(labels, coasts);
	const { ofCorner, ofCoast, size } = unknowns;
	// The corners of each coast, for the 'net' coasts' rows.
	const coastStarts = new Int32Array(coastCount + 2);
	for (let label = 1; label <= coastCount; label++) {
		coastStarts[label + 1] =
			(coastStarts[label] as number) + (coastSizes[label] as number);
	}
	const coastCorners = new Int32Array(cornerCount - (coastSizes[0] as number));
	const filled = coastStarts.slice();
	for (let p = 0; p < cornerCount; p++) {
		const label = labels[p] as number;
		if (label > 0) {
			coastCorners[filled[label] as number] = p;
			filled[label] = (filled[label] as number) + 1;
		}
	}

	// The system M x = rhs, row by row: M_ii the sum of the row's link
	// weights and M_iq minus each, so that M is an M-matrix. A link to a
	// 'value' coast moves to the right-hand side, as a term kept for the
	// solves, which give the coasts' values.
	const builder = createRowBuilder(size);
	const termRows: number[] = [];
	const termCoasts: number[] = [];
	const termWeights: number[] = [];
	const addLinks = (row: number, p: number, own: number): void => {
		for (let at = STENCIL * p; at < STENCIL * (p + 1); at++) {
			const q = stencil[at] as number;
			if (q < 0 || (own > 0 && labels[q] === own)) {
				continue;
			}
			const weight = links[at] as number;
			builder.add(row, weight);
			const column = ofCorner[q] as number;
			if (column >= 0) {
				builder.add(column, -weight);
			} else {
				termRows.push(row);
				termCoasts.push(labels[q] as number);
				termWeights.push(weight);
			}
		}
	};
	for (let p = 0; p < cornerCount; p++) {
		if (labels[p] === 0) {
			const row = ofCorner[p] as number;
			builder.add(row, 0);
			addLinks(row, p, 0);
			builder.endRow();
		}
	}
	for (let label = 1; label <= coastCount; label++) {
		const row = ofCoast[label] as number;
		if (row >= 0) {
			builder.add(row, 0);
			const end = coastStarts[label + 1] as number;
			for (let at = coastStarts[label] as number; at < end; at++) {
				addLinks(row, coastCorners[at] as number, label);
			}
			builder.endRow();
		}
	}
	const matrix = builder.finish();
	const precondition = createMultigrid(
		matrix,
		prolongations(index.n, labels, coasts, unknowns),
	);
	const terms = {
		rows: Int32Array.from(termRows),
		coasts: Int32Array.from(termCoasts),
		weights: Float64Array.from(termWeights),
	};
	const rhs = new Float64Array(size);
	const x = new Float64Array(size);
	const work = createKrylovWork(size);

	const apply = (
		values: ArrayLike<number>,
		into?: Float64Array,
	): Float64Array => {
		assertLength(values, cornerCount, 'value', 'corner');
		assertFinite(values, 'corner value');
		const result = into ?? new Float64Array(cornerCount);
		assertLength(result, cornerCount, 'result', 'corner');
		for (let corner = 0; corner < cornerCount; corner++) {
			const own = values[corner] as number;
			let sum = 0;
			for (let at = STENCIL * corner; at < STENCIL * (corner + 1); at++) {
				const q = stencil[at] as number;
				if (q >= 0) {
					sum += (links[at] as number) * ((values[q] as number) - own);
				}
			}
			result[corner] = sum / (areas[corner] as number);
		}
		return result;
	};

	const solve = (
		forcing: ArrayLike<number>,
		coastValues: ArrayLike<number>,
		options: CornerSolveOptions = {},
	): CornerSolveResult => {
		assertLength(forcing, cornerCount, 'forcing', 'corner');
		assertFinite(forcing, 'forcing');
		assertLength(coastValues, coastCount, 'value', 'coast');
		assertFinite(coastValues, 'coast value');
		const tolerance = options.tolerance ?? CORNER_SOLVE_TOLERANCE;
		if (!(tolerance > 0 && Number.isFinite(tolerance))) {
			throw new RangeError(
				`A tolerance must be finite and above zero; got ${tolerance}`,
			);
		}
		const most = options.maxIterations ?? CORNER_MAX_ITERATIONS;
		if (!Number.isInteger(most) || most < 1) {
			throw new RangeError(
				`The most iterations must be a whole number from 1; got ${most}`,
			);
		}
		const { guess } = options;
		if (guess !== undefined) {
			assertLength(guess, cornerCount, 'guess', 'corner');
			assertFinite(guess, 'guess');
		}

		for (let corner = 0; corner < cornerCount; corner++) {
			if (labels[corner] === 0) {
				rhs[ofCorner[corner] as number] =
					-(areas[corner] as number) * (forcing[corner] as number);
			}
		}
		for (let label = 1; label <= coastCount; label++) {
			const row = ofCoast[label] as number;
			if (row >= 0) {
				rhs[row] = -(coastValues[label - 1] as number);
			}
		}
		for (let term = 0; term < terms.rows.length; term++) {
			const row = terms.rows[term] as number;
			rhs[row] =
				(rhs[row] as number) +
				(terms.weights[term] as number) *
					(coastValues[(terms.coasts[term] as number) - 1] as number);
		}
		x.fill(0);
		if (guess !== undefined) {
			// Backwards, so a coast's one unknown ends up with its first
			// corner's guess.
			for (let corner = cornerCount - 1; corner >= 0; corner--) {
				const unknown = ofCorner[corner] as number;
				if (unknown >= 0) {
					x[unknown] = guess[corner] as number;
				}
			}
		}
		const outcome = bicgstab(
			matrix,
			rhs,
			x,
			precondition,
			tolerance,
			most,
			work,
		);
		const values = new Float64Array(cornerCount);
		for (let corner = 0; corner < cornerCount; corner++) {
			const unknown = ofCorner[corner] as number;
			values[corner] =
				unknown >= 0
					? (x[unknown] as number)
					: (coastValues[(labels[corner] as number) - 1] as number);
		}
		return { values, ...outcome };
	};

	return { grid, apply, solve };
};

/**
 * Solves `a ∇²ψ + b ∂ψ/∂x = f` on the corners of a grid once: a
 * {@link createCornerSolver} made for the problem and solved for its
 * forcing. Make the solver once instead to solve the same operator for
 * several forcings, which saves building and factorising the system each
 * time.
 *
 * @param grid - The grid.
 * @param problem - The operator, the forcing and the coasts' values.
 * @param options - Tolerance, most iterations and first guess.
 * @throws RangeError as {@link createCornerSolver} and
 * {@link CornerSolver.solve} do.
 */
export const solveOnCorners = (
	grid: Grid,
	problem: CornerProblem,
	options?: CornerSolveOptions,
): CornerSolveResult =>
	createCornerSolver(grid, problem).solve(
		problem.forcing,
		problem.coastValues,
		options,
	);
