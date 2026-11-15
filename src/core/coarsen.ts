/**
 * Moving between a grid and the one a step coarser: a world averaged onto
 * the coarser grid, and a field or a vector field on the coarser grid
 * carried back onto the finer.
 *
 * The grids nest exactly: coarse cell `(face, i, j)` covers the four cells
 * `(face, 2i … 2i + 1, 2j … 2j + 1)` of the grid with twice as many cells
 * along each face edge.
 */

import {
	FACE_AXES,
	FACE_COUNT,
	type FaceAxes,
	getGrid,
	isSupportedResolution,
	NEIGHBOUR_COUNT,
	type Resolution,
	SUPPORTED_RESOLUTIONS,
	type Vec3,
} from './grid';
import type { VectorField } from './vector';
import type { World } from './world';

/** The four coarse cells, and their weights, that make up each fine cell. */
export type RefinementStencil = {
	/** Cells along a face edge of the fine grid. */
	readonly resolution: Resolution;
	/**
	 * The coarse cells each fine cell takes its value from: the four of fine
	 * cell `c` at `4c` to `4c + 3`. At a cube corner only three are used and
	 * the fourth, with no weight, names the first again: see
	 * {@link refinementStencil}.
	 */
	readonly cells: Int32Array;
	/**
	 * The weight of each of those cells, laid out like `cells`: none
	 * negative, and the four of a fine cell summing to one.
	 */
	readonly weights: Float64Array;
};

const SIDES = NEIGHBOUR_COUNT;

const HALF_PI = Math.PI / 2;

/** The stencils built so far, by the fine grid's resolution. */
const STENCILS = new Map<Resolution, RefinementStencil>();

/**
 * The resolution one step coarser than a supported one, or null for the
 * coarsest.
 */
const coarserResolution = (resolution: Resolution): Resolution | null => {
	const index = SUPPORTED_RESOLUTIONS.indexOf(resolution);
	return index > 0 ? (SUPPORTED_RESOLUTIONS[index - 1] as Resolution) : null;
};

/**
 * Throws unless a resolution is supported and has a coarser one, and gives
 * that coarser one.
 */
const assertRefinable = (resolution: number): Resolution => {
	if (!isSupportedResolution(resolution)) {
		throw new RangeError(
			`Unsupported resolution ${resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	const coarse = coarserResolution(resolution);
	if (coarse === null) {
		throw new RangeError(
			`A grid of ${resolution} cells per face edge is the coarsest there is; it has none a step coarser`,
		);
	}
	return coarse;
};

/**
 * A field on the grid a step coarser: each coarse cell's value the mean of
 * the four fine cells it covers, weighted by their areas.
 *
 * @remarks
 * The mean of each block is taken in double precision, summed row by row,
 * so the area-weighted mean of the whole field is kept to rounding, and a
 * constant field is given back as it is, to rounding. The field is
 * averaged without regard to what it stands for: land and sea alike.
 *
 * @param fine - One value per cell of the grid of `resolution`. It is not
 * changed.
 * @param resolution - The fine grid's cells along a face edge: 128 or 256.
 * @param into - Where to write the coarse values, one per cell of the grid
 * a step coarser; a new array when left out.
 * @returns `into`, or the new array.
 * @throws RangeError if the resolution is not supported or is the
 * coarsest, or if `fine` or `into` has the wrong length.
 */
export const coarsenField = (
	fine: ArrayLike<number>,
	resolution: number,
	into?: Float64Array,
): Float64Array => {
	const coarse = assertRefinable(resolution);
	const fineGrid = getGrid(resolution);
	if (fine.length !== fineGrid.cellCount) {
		throw new RangeError(
			`A field on ${resolution} cells per face edge has ${fineGrid.cellCount} values; got ${fine.length}`,
		);
	}
	const coarseCount = FACE_COUNT * coarse * coarse;
	const result = into ?? new Float64Array(coarseCount);
	if (result.length !== coarseCount) {
		throw new RangeError(
			`A field a step coarser than ${resolution} cells per face edge has ${coarseCount} values; got ${result.length}`,
		);
	}
	const { areas } = fineGrid;
	const n = resolution;
	let cell = 0;
	for (let face = 0; face < FACE_COUNT; face++) {
		for (let j = 0; j < coarse; j++) {
			for (let i = 0; i < coarse; i++) {
				let total = 0;
				let area = 0;
				for (let dj = 0; dj < 2; dj++) {
					const row = (face * n + 2 * j + dj) * n;
					for (let di = 0; di < 2; di++) {
						const fineCell = row + 2 * i + di;
						const fineArea = areas[fineCell] as number;
						total += fineArea * (fine[fineCell] as number);
						area += fineArea;
					}
				}
				result[cell] = total / area;
				cell++;
			}
		}
	}
	return result;
};

/**
 * The world on the grid a step coarser: half the cells along each face
 * edge, each coarse cell's elevation the mean of the four cells it covers,
 * weighted by their areas.
 *
 * @remarks
 * Everything else is the world's: its sea level, planet, date and origin.
 * A coarse cell is land when its mean elevation is above the sea level, so
 * land narrower than a coarse cell, an island or a strait, can vanish from
 * the coarse world or close up. The means are {@link coarsenField}'s,
 * stored in single precision, summed as the Earth's data is summed when a
 * coarser Earth is made; so the Earth at 256 cells per face edge,
 * coarsened, is exactly the Earth at 128.
 *
 * @param world - A world of more than 64 cells per face edge. It is not
 * changed.
 * @returns A new world with an elevation array of its own and a copy of the
 * planet's settings.
 * @throws RangeError if the world's resolution is not supported or is the
 * coarsest, 64, which has no coarser grid, or if its elevation array does
 * not hold one value per cell.
 */
export const coarsenWorld = (world: World): World => {
	const resolution = assertRefinable(world.resolution);
	const fine = getGrid(world.resolution);
	if (world.elevation.length !== fine.cellCount) {
		throw new RangeError(
			`A world of resolution ${world.resolution} has ${fine.cellCount} cells; its elevation holds ${world.elevation.length}`,
		);
	}
	return {
		resolution,
		seaLevel: world.seaLevel,
		origin: world.origin,
		planet: { ...world.planet },
		ageYears: world.ageYears,
		elevation: Float32Array.from(
			coarsenField(world.elevation, world.resolution),
		),
	};
};

/**
 * The angle of the centre of column or row `index` of a grid of `n` cells
 * per face edge, in radians from the middle of the face.
 */
const centreAngle = (index: number, n: number): number =>
	((index + 0.5) / n - 0.5) * HALF_PI;

/**
 * The angle of a coarse cell's centre along one axis of a face, seen in
 * that face's own equiangular coordinates; it may lie past the face's edge.
 */
const angleOnFace = (
	centres: Float64Array,
	cell: number,
	normal: Vec3,
	axis: Vec3,
): number => {
	const x = centres[3 * cell] as number;
	const y = centres[3 * cell + 1] as number;
	const z = centres[3 * cell + 2] as number;
	return Math.atan(
		(x * axis[0] + y * axis[1] + z * axis[2]) /
			(x * normal[0] + y * normal[1] + z * normal[2]),
	);
};

/**
 * Builds the stencil for a fine grid; see {@link refinementStencil}.
 */
const buildStencil = (
	resolution: Resolution,
	coarseResolution: Resolution,
): RefinementStencil => {
	const n = resolution;
	const m = coarseResolution;
	const { centres, neighbours } = getGrid(m);
	const fineCount = FACE_COUNT * n * n;
	const cells = new Int32Array(SIDES * fineCount);
	const weights = new Float64Array(SIDES * fineCount);
	// For each face and side, the row of coarse cells just across that edge,
	// in the order of the face's own cells along it, and the angle of each
	// along the edge in the face's coordinates. Seen from this face they lie
	// a whole coarse cell beyond its outer row, exactly, but are spread along
	// the edge away from its middle.
	const across = new Int32Array(FACE_COUNT * SIDES * m);
	const acrossAngle = new Float64Array(FACE_COUNT * SIDES * m);
	for (let face = 0; face < FACE_COUNT; face++) {
		const { normal, u, v } = FACE_AXES[face] as FaceAxes;
		for (let side = 0; side < SIDES; side++) {
			// Along a side of constant column the edge runs along `v`.
			const alongV = side < 2;
			const outer = side % 2 === 0 ? 0 : m - 1;
			for (let k = 0; k < m; k++) {
				const own = alongV
					? (face * m + k) * m + outer
					: (face * m + outer) * m + k;
				const cell = neighbours[SIDES * own + side] as number;
				const at = (face * SIDES + side) * m + k;
				across[at] = cell;
				acrossAngle[at] = angleOnFace(centres, cell, normal, alongV ? v : u);
			}
		}
	}
	for (let face = 0; face < FACE_COUNT; face++) {
		const { normal, u, v } = FACE_AXES[face] as FaceAxes;
		for (let j = 0; j < n; j++) {
			// A fine row's centre lies a quarter of a coarse cell from the
			// centre of the coarse row it is in, towards the coarse row below
			// for an even row and above for an odd one; columns likewise.
			const lowJ = (j >> 1) - (j % 2 === 0 ? 1 : 0);
			const highShareJ = j % 2 === 0 ? 0.75 : 0.25;
			const outerJ = j === 0 || j === n - 1;
			for (let i = 0; i < n; i++) {
				const lowI = (i >> 1) - (i % 2 === 0 ? 1 : 0);
				const highShareI = i % 2 === 0 ? 0.75 : 0.25;
				const outerI = i === 0 || i === n - 1;
				const entry = SIDES * (face * n * n + j * n + i);
				if (!outerI && !outerJ) {
					// Corner k is the higher column when k is odd, the higher
					// row when k is 2 or 3.
					for (let k = 0; k < SIDES; k++) {
						const highI = k & 1;
						const highJ = k >> 1;
						cells[entry + k] = (face * m + lowJ + highJ) * m + lowI + highI;
						weights[entry + k] =
							(highI ? highShareI : 1 - highShareI) *
							(highJ ? highShareJ : 1 - highShareJ);
					}
					continue;
				}
				const ownCell = (face * m + (j >> 1)) * m + (i >> 1);
				if (outerI && outerJ) {
					// At a cube corner: barycentric weights over the corner
					// cells of the three faces, all read in this face's
					// coordinates and taken relative to its own.
					const sideI = i === 0 ? 0 : 1;
					const sideJ = j === 0 ? 2 : 3;
					const a = neighbours[SIDES * ownCell + sideI] as number;
					const b = neighbours[SIDES * ownCell + sideJ] as number;
					const ownS = centreAngle(i >> 1, m);
					const ownT = centreAngle(j >> 1, m);
					const as = angleOnFace(centres, a, normal, u) - ownS;
					const at = angleOnFace(centres, a, normal, v) - ownT;
					const bs = angleOnFace(centres, b, normal, u) - ownS;
					const bt = angleOnFace(centres, b, normal, v) - ownT;
					const ps = centreAngle(i, n) - ownS;
					const pt = centreAngle(j, n) - ownT;
					const det = as * bt - bs * at;
					const shareA = (ps * bt - bs * pt) / det;
					const shareB = (as * pt - ps * at) / det;
					cells[entry] = ownCell;
					weights[entry] = 1 - shareA - shareB;
					cells[entry + 1] = a;
					weights[entry + 1] = shareA;
					cells[entry + 2] = b;
					weights[entry + 2] = shareB;
					// Padding: the face's own cell again, with no weight.
					cells[entry + 3] = ownCell;
					weights[entry + 3] = 0;
					continue;
				}
				// Beside a cube edge: linear along the edge in each of the two
				// rows of coarse cells either side of it, each at its own
				// cells' positions, then linear across the edge between them.
				const side = outerI ? (i === 0 ? 0 : 1) : j === 0 ? 2 : 3;
				const low = outerI ? lowJ : lowI;
				const highShare = outerI ? highShareJ : highShareI;
				const fineAngle = centreAngle(outerI ? j : i, n);
				const row = (face * SIDES + side) * m;
				// The pair across the edge that brackets the fine cell along
				// it: never more than one cell from the pair beside it here.
				let far = -1;
				for (
					let k = Math.max(0, low - 1);
					k <= Math.min(m - 2, low + 1) && far === -1;
					k++
				) {
					if (
						(acrossAngle[row + k] as number) <= fineAngle &&
						fineAngle <= (acrossAngle[row + k + 1] as number)
					) {
						far = k;
					}
				}
				if (far === -1) {
					throw new Error(
						`No coarse cells across the edge bracket fine cell ${entry / SIDES}`,
					);
				}
				const farLow = acrossAngle[row + far] as number;
				const farShare =
					(fineAngle - farLow) /
					((acrossAngle[row + far + 1] as number) - farLow);
				const step = outerI ? m : 1;
				const nearLow = ownCell - ((outerI ? j : i) >> 1) * step + low * step;
				// The fine cell's centre lies a quarter of a coarse cell inside
				// the edge, the row across it a whole coarse cell beyond the
				// row beside it.
				cells[entry] = nearLow;
				weights[entry] = 0.75 * (1 - highShare);
				cells[entry + 1] = nearLow + step;
				weights[entry + 1] = 0.75 * highShare;
				cells[entry + 2] = across[row + far] as number;
				weights[entry + 2] = 0.25 * (1 - farShare);
				cells[entry + 3] = across[row + far + 1] as number;
				weights[entry + 3] = 0.25 * farShare;
			}
		}
	}
	return { resolution, cells, weights };
};

/**
 * How a field on the grid a step coarser is carried onto a fine grid: for
 * each fine cell, the four coarse cells it takes its value from and their
 * weights.
 *
 * @remarks
 * Inside a face, bilinear interpolation in the face's own coordinates
 * between the centres of the four coarse cells nearest the fine cell's
 * centre. A fine cell's centre lies a quarter of a coarse cell from the
 * centre of the coarse cell it is in, along each face axis, so the weights
 * are 9/16 on that cell, 3/16 on each of the two beside it towards the fine
 * cell, and 1/16 on the one diagonally beyond.
 *
 * A fine cell in a face's outermost row or column takes two of its coarse
 * cells from across the cube edge, and those do not lie on this face's grid
 * lines. Seen in this face's coordinates, the row of coarse cells across the
 * edge lies exactly one coarse cell beyond the row beside it, but each of
 * its centres is moved along the edge, away from the edge's middle, by
 * about `δ · sin 2β` for a centre at angle `β` along the edge and `δ` past
 * it: nothing at the middle and half a coarse cell at the ends, where the
 * row's end centre lies level with the cube corner. So the fine cell is
 * carried linearly along the edge in each of the two rows, between the pair
 * of cells beside it on this face at 3/4 and between the pair across the
 * edge that brackets it, at their own positions, at 1/4; the pair across is
 * the one beside it or a neighbour of it. That is exact for any field linear
 * in this face's coordinates, as bilinear interpolation is inside a face,
 * and every weight lies in [0, 1].
 *
 * At each of the eight cube corners three faces meet, and the fine cell in
 * each face's corner has only three coarse cells around it, the corner cells
 * of the three faces. It takes barycentric weights over the three, their
 * centres read in its own face's coordinates: 2/3 on its own face's corner
 * cell and 1/6 on each of the other two, the same at every corner of every
 * face, so the rule treats the three faces alike and the value lies within
 * the range of the three. Those are the only 24 fine cells it applies to; a
 * fourth entry names the face's own corner cell again with no weight.
 *
 * Refining f = x (any of x, y and z alike) from 64 to 128 cells per face
 * edge and from 128 to 256, the largest error inside the faces is 1.1e-4
 * and 2.8e-5, beside an edge 8.6e-5 and 2.2e-5, and at the corner cells
 * 3.4e-5 and 8.5e-6: second order everywhere, each falling by four when
 * the grid is doubled.
 *
 * Built once per resolution and shared, so its arrays must be treated as
 * read-only.
 *
 * @param resolution - The fine grid's cells along a face edge: 128 or 256.
 * @throws RangeError if the resolution is not supported or is the coarsest.
 */
export const refinementStencil = (resolution: number): RefinementStencil => {
	const coarse = assertRefinable(resolution);
	const fine = resolution as Resolution;
	let stencil = STENCILS.get(fine);
	if (stencil === undefined) {
		stencil = buildStencil(fine, coarse);
		STENCILS.set(fine, stencil);
	}
	return stencil;
};

/**
 * A field on the grid a step coarser carried onto a fine grid by
 * {@link refinementStencil}.
 *
 * @remarks
 * Every fine value is a weighted mean of coarse values with weights that
 * are not negative and sum to one, so it lies within the range of the
 * values it is made from, and a constant field is carried exactly. The
 * field is carried without regard to what it stands for: land and sea
 * alike.
 *
 * @param coarse - One value per cell of the grid a step coarser than
 * `resolution`. It is not changed.
 * @param resolution - The fine grid's cells along a face edge: 128 or 256.
 * @param into - Where to write the fine values, one per fine cell; a new
 * array when left out.
 * @returns `into`, or the new array.
 * @throws RangeError if the resolution is not supported or is the
 * coarsest, or if `coarse` or `into` has the wrong length.
 */
export const refineField = (
	coarse: ArrayLike<number>,
	resolution: number,
	into?: Float64Array,
): Float64Array => {
	const { cells, weights } = refinementStencil(resolution);
	const fineCount = cells.length / SIDES;
	const coarseCount = fineCount / 4;
	if (coarse.length !== coarseCount) {
		throw new RangeError(
			`A field a step coarser than ${resolution} cells per face edge has ${coarseCount} values; got ${coarse.length}`,
		);
	}
	const result = into ?? new Float64Array(fineCount);
	if (result.length !== fineCount) {
		throw new RangeError(
			`A field on ${resolution} cells per face edge has ${fineCount} values; got ${result.length}`,
		);
	}
	for (let cell = 0; cell < fineCount; cell++) {
		const first = SIDES * cell;
		// Taken as the first cell's value plus the weighted differences of
		// the others from it, which equals the weighted mean and gives a
		// constant field back exactly, whatever rounding the weights carry.
		const base = coarse[cells[first] as number] as number;
		result[cell] =
			base +
			(weights[first + 1] as number) *
				((coarse[cells[first + 1] as number] as number) - base) +
			(weights[first + 2] as number) *
				((coarse[cells[first + 2] as number] as number) - base) +
			(weights[first + 3] as number) *
				((coarse[cells[first + 3] as number] as number) - base);
	}
	return result;
};

/**
 * A vector field on the grid a step coarser carried onto a fine grid: each
 * of its three components by {@link refineField}, and the result made
 * tangent to the sphere at each fine cell's centre by dropping its part
 * along the centre's direction.
 *
 * @remarks
 * Interpolating the components in three dimensions, rather than eastward
 * and northward ones, treats every direction alike, the poles included.
 * The fine vectors are not rescaled after the projection: where the coarse
 * vectors around a fine cell turn, its vector comes out a little shorter
 * than theirs, as any average of them would.
 *
 * @param coarse - One tangent vector per cell of the grid a step coarser
 * than `resolution`. It is not changed.
 * @param resolution - The fine grid's cells along a face edge: 128 or 256.
 * @param into - Where to write the fine vectors, one per fine cell; new
 * arrays when left out.
 * @returns `into`, or the new arrays.
 * @throws RangeError if the resolution is not supported or is the
 * coarsest, or if any array of `coarse` or `into` has the wrong length.
 */
export const refineVectors = (
	coarse: VectorField,
	resolution: number,
	into?: VectorField,
): VectorField => {
	assertRefinable(resolution);
	const fine = getGrid(resolution);
	const result = into ?? {
		x: new Float64Array(fine.cellCount),
		y: new Float64Array(fine.cellCount),
		z: new Float64Array(fine.cellCount),
	};
	// Every length is checked before any array is written.
	const coarseCount = fine.cellCount / 4;
	for (const name of ['x', 'y', 'z'] as const) {
		const length = coarse[name]?.length;
		if (length !== coarseCount) {
			throw new RangeError(
				`A field a step coarser than ${resolution} cells per face edge has ${coarseCount} values; its ${name} components have ${length}`,
			);
		}
	}
	for (const name of ['x', 'y', 'z'] as const) {
		const length = result[name]?.length;
		if (length !== fine.cellCount) {
			throw new RangeError(
				`A field on ${resolution} cells per face edge has ${fine.cellCount} values; the output's ${name} components have ${length}`,
			);
		}
	}
	const x = refineField(coarse.x, resolution, result.x);
	const y = refineField(coarse.y, resolution, result.y);
	const z = refineField(coarse.z, resolution, result.z);
	const { centres, cellCount } = fine;
	for (let cell = 0; cell < cellCount; cell++) {
		const cx = centres[3 * cell] as number;
		const cy = centres[3 * cell + 1] as number;
		const cz = centres[3 * cell + 2] as number;
		const vx = x[cell] as number;
		const vy = y[cell] as number;
		const vz = z[cell] as number;
		const outward = vx * cx + vy * cy + vz * cz;
		x[cell] = vx - outward * cx;
		y[cell] = vy - outward * cy;
		z[cell] = vz - outward * cz;
	}
	return result;
};
