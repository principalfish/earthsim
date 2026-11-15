/**
 * Vector fields on the grid, and the differential operators that act on
 * them and on fields of one value per cell: gradient, divergence, curl,
 * Laplacian and smoothing.
 *
 * A vector field holds one vector per cell, tangent to the sphere at the
 * cell's centre, as its three components in core coordinates (+Z at the
 * North Pole, +X at latitude 0°, longitude 0°): see {@link VectorField}.
 * {@link toEastNorth} and {@link fromEastNorth} convert to and from the
 * eastward and northward components at each centre, along the directions
 * {@link cellFrames} gives.
 *
 * Gradient, divergence and curl are finite-volume operators: each sums what
 * crosses, or runs along, the four edges of a cell and divides by its area.
 * Every edge carries one value of the field, which both of its cells use,
 * so the divergence of any field sums to zero over the sphere, weighted by
 * the cells' areas, to rounding.
 *
 * An edge's value is a cubic through the four cells in a line across it on
 * one face's grid: 9/16 on each of the two cells either side and −1/16 on
 * each of the two beyond. Near a cube edge the line runs on past the face's
 * edge, where the grid lines of the next face meet it at an angle; the
 * line's points there lie on the rows of cells across the edge, between
 * their centres, and take values interpolated by a cubic along those rows.
 * An edge on a cube edge takes the mean of the two faces' lines across it.
 * A plain mean of the two cells either side would be wrong there by a
 * cell's spacing times the field's second derivative, which inside a face
 * cancels between a cell's opposite edges but on a cube edge does not:
 * gradients, divergences and curls would be only first order along the
 * cube edges, and a gradient's divergence would not converge there at all.
 * As it is, all three are second order everywhere, and on the cube edges
 * and at their corners no less accurate than well inside the faces.
 *
 * {@link laplacian} takes the slope across each edge from the cells beside
 * it in the same way, so it is second order everywhere too; the divergence
 * of the gradient is not, in the rows beside the cube edges.
 *
 * Every length is on the unit sphere, in radians, unless a radius is given:
 * gradients are per radian of arc, and divergences and curls per radian,
 * by default, and Laplacians per radian squared. The operators take the
 * sphere's radius to give them per unit of that radius instead:
 * `PLANET_RADIUS_KM * 1000` for per metre.
 */

import {
	createExchangeSolver,
	type ExchangeSolver,
	uniformCoupling,
} from './exchange';
import {
	directionToFace,
	edgeGeometry,
	FACE_AXES,
	FACE_COUNT,
	type FaceAxes,
	faceCorners,
	faceToDirection,
	type Grid,
	NEIGHBOUR_COUNT,
	sideCorners,
	type Vec3,
} from './grid';
import { PLANET_RADIUS_KM } from './world';

/**
 * A vector at every cell's centre, tangent to the sphere there, as its
 * three components in core coordinates: the vector of cell `c` is
 * `(x[c], y[c], z[c])`.
 *
 * @remarks
 * Three arrays rather than one interleaved array, so that each component is
 * itself a field of one value per cell that the functions taking such a
 * field (refinement, smoothing, the observed data) can take directly. They
 * are double precision because the operators difference neighbouring
 * values, which loses digits, and a simulation may step them many times.
 */
export type VectorField = {
	/** The x components, one per cell. */
	readonly x: Float64Array;
	/** The y components, one per cell. */
	readonly y: Float64Array;
	/** The z components, one per cell. */
	readonly z: Float64Array;
};

/** The eastward and northward components of a vector field, one per cell. */
export type EastNorthField = {
	/** The eastward components, one per cell. */
	readonly east: Float64Array;
	/** The northward components, one per cell. */
	readonly north: Float64Array;
};

/**
 * The directions east and north at every cell's centre, as unit vectors in
 * core coordinates. East has no z component; its `z` array is all zeros.
 */
export type CellFrames = {
	/** The direction east at each centre. */
	readonly east: VectorField;
	/** The direction north at each centre. */
	readonly north: VectorField;
};

/**
 * The directions east and north at one place, as unit vectors in core
 * coordinates, written by {@link writeEastNorthFrame}. East has no z
 * component.
 */
export type EastNorthFrame = {
	/** The x component of east. */
	eastX: number;
	/** The y component of east. */
	eastY: number;
	/** The x component of north. */
	northX: number;
	/** The y component of north. */
	northY: number;
	/** The z component of north. */
	northZ: number;
};

/**
 * The geometry the operators need for one grid, built once and shared.
 *
 * @remarks
 * Every edge between two cells is listed once, from its lower-numbered cell
 * `a` to the other, `b`: first the plain edges, whose value is made from
 * four cells of one face in a line, then the rest, within two cells of a
 * cube edge, whose value is made from a stencil of its own.
 */
type Operators = {
	/** All edges. */
	readonly edgeCount: number;
	/** The plain edges, which come first. */
	readonly plainCount: number;
	/**
	 * The plain edges whose line's cells have their neighbours one and two
	 * along the edge on the face too, which come first among the plain
	 * ones: the edges whose slope {@link laplacian} takes from
	 * {@link Operators.slopes}.
	 */
	readonly slopePlainCount: number;
	/** The cells `a` and `b` of edge `e` at `2e` and `2e + 1`. */
	readonly ends: Int32Array;
	/**
	 * For each plain edge, the cell beyond `a` on the line from `b` through
	 * `a` at `2e`, and the cell beyond `b` on the line from `a` through `b`
	 * at `2e + 1`.
	 */
	readonly outer: Int32Array;
	/**
	 * The edge's unit normal, tangent to the sphere and pointing out of `a`
	 * into `b`, times its length: x, y, z of edge `e` at `3e` to `3e + 2`.
	 * The normal is the same all along the edge, which lies on a great
	 * circle.
	 */
	readonly normals: Float64Array;
	/**
	 * The edge's direction at its middle, anticlockwise round `a` seen from
	 * outside the sphere, times its length, laid out like `normals`.
	 */
	readonly tangents: Float64Array;
	/**
	 * Where each other edge's stencil starts in `stencilCells`, in order
	 * from the first edge after the plain ones, and one past the last.
	 */
	readonly stencilStarts: Int32Array;
	/** The cells each other edge's value is made from. */
	readonly stencilCells: Int32Array;
	/** The weight of each of those cells, laid out like `stencilCells`. */
	readonly stencilWeights: Float64Array;
	/**
	 * For each of the first `slopePlainCount` edges, the field's slope out
	 * of `a` times the edge's length is
	 * `slopes[2e] · ((f[before] − f[after]) + 27 (f[b] − f[a]))` plus
	 * `slopes[2e + 1]` times the sum over the four cells in the line
	 * `before`, `a`, `b`, `after`, weighted −1, 9, 9, −1, of each one's
	 * `(f[−2] − f[+2]) + 8 (f[+1] − f[−1])` along the edge: the cells one
	 * and two away from it towards higher `j` for an edge across `i`, and
	 * higher `i` for one across `j`.
	 */
	readonly slopes: Float64Array;
	/**
	 * Where each other edge's slope stencil starts in `slopeCells`, in order
	 * from the first edge after the first `slopePlainCount`, and one past
	 * the last.
	 */
	readonly slopeStarts: Int32Array;
	/**
	 * The cells each other edge's slope out of `a`, times its length, is
	 * made from: the slope is the sum of each weight times the cell's value
	 * less `a`'s.
	 */
	readonly slopeCells: Int32Array;
	/** The weight of each of those cells, laid out like `slopeCells`. */
	readonly slopeWeights: Float64Array;
	/** One over each cell's area. */
	readonly inverseAreas: Float64Array;
};

/** The weight of each of the two cells either side of an edge. */
const NEAR_WEIGHT = 9 / 16;

/** The weight of each of the two cells beyond them, negative. */
const FAR_WEIGHT = -1 / 16;

/** The step across each side of a cell, in neighbour order, as `[di, dj]`. */
const STEPS: readonly (readonly [number, number])[] = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
];

/**
 * The number of neighbours of every cell, held here as a constant of this
 * module: a script runner that rewrites imports may read an imported
 * binding through a property each time, which is slow in a loop over every
 * cell.
 */
const SIDES = NEIGHBOUR_COUNT;

const HALF_PI = Math.PI / 2;

/**
 * The implicit diffusion steps {@link smoothField} takes. Each spreads a
 * spike into a kernel of the same variance with heavier tails than a
 * Gaussian's; four together are close to one.
 */
export const SMOOTHING_STEPS = 4;

/**
 * How closely {@link smoothField} solves each step on the grid of 64 cells
 * per face edge, as a fraction of the root-mean-square departure of the
 * field from its mean, weighted by area; on a finer grid, this times 64
 * over its cells per face edge.
 *
 * @remarks
 * A spike's departure grows as the cells shrink, while what it is smoothed
 * to does not, so a tolerance taken against the departure is made tighter
 * on the finer grids to hold the error against the smoothed field. Solved
 * to a tenth of it, a spike's spread moves by under 0.3%, over 500 and
 * 1,000 km on every grid.
 */
const SMOOTHING_TOLERANCE = 1e-5;

/**
 * The exchange solver {@link smoothField} steps with on one grid, and its
 * working memory, kept between calls.
 */
type Smoother = {
	readonly solver: ExchangeSolver;
	/** The masses last set, for a step of {@link Smoother.step}. */
	readonly mass: Float64Array;
	/**
	 * The step the masses were last set for; 0 before the first, and not a
	 * number while they are being set, so that a set that fails part-way
	 * leaves them marked as unset.
	 */
	step: number;
	/** The right-hand side of a step. */
	readonly rhs: Float64Array;
	/** A first answer to a step, the correction is taken from. */
	readonly guess: Float64Array;
	/** The Laplacian of the guess. */
	readonly curvature: Float64Array;
};

const CELL_FRAMES = new WeakMap<Grid, CellFrames>();
const OPERATORS = new WeakMap<Grid, Operators>();
const SMOOTHERS = new WeakMap<Grid, Smoother>();

/**
 * Writes the directions east and north at a latitude φ and longitude λ,
 * given by their sines and cosines.
 *
 * @remarks
 * East is (−sin λ, cos λ, 0) and north (−sin φ cos λ, −sin φ sin λ, cos φ).
 * At a pole these are the limits approached along the meridian of λ, and
 * nothing is divided, so a pole is no special case. This is the one
 * definition of east and north: {@link cellFrames} uses it at the cells'
 * centres.
 *
 * @param sinLatitude - sin φ.
 * @param cosLatitude - cos φ, from 0 to 1.
 * @param sinLongitude - sin λ.
 * @param cosLongitude - cos λ.
 * @param out - Where to write the directions.
 */
export const writeEastNorthFrame = (
	sinLatitude: number,
	cosLatitude: number,
	sinLongitude: number,
	cosLongitude: number,
	out: EastNorthFrame,
): void => {
	out.eastX = -sinLongitude;
	out.eastY = cosLongitude;
	out.northX = -sinLatitude * cosLongitude;
	out.northY = -sinLatitude * sinLongitude;
	out.northZ = cosLatitude;
};

/**
 * A frame for {@link writeEastNorthFrame} to write, east and north at
 * latitude 0°, longitude 0°.
 */
export const createEastNorthFrame = (): EastNorthFrame => ({
	eastX: 0,
	eastY: 1,
	northX: 0,
	northY: 0,
	northZ: 1,
});

/**
 * A vector field of zeros on a grid.
 *
 * @param grid - The grid.
 * @returns Three new arrays, one value per cell each.
 */
export const createVectorField = (grid: Grid): VectorField => ({
	x: new Float64Array(grid.cellCount),
	y: new Float64Array(grid.cellCount),
	z: new Float64Array(grid.cellCount),
});

/**
 * The directions east and north at every cell's centre, by
 * {@link writeEastNorthFrame}.
 *
 * @remarks
 * The latitude and longitude are those of the centre: sin φ is its z, cos φ
 * the length of its x and y, and the longitude is that of `atan2(y, x)`. A
 * centre exactly at a pole, which no supported grid has, takes longitude 0°.
 *
 * Built on first use for each grid and then shared, so the arrays must be
 * treated as read-only.
 *
 * @param grid - The grid whose centres to take.
 */
export const cellFrames = (grid: Grid): CellFrames => {
	let frames = CELL_FRAMES.get(grid);
	if (frames === undefined) {
		const { centres, cellCount } = grid;
		const east = createVectorField(grid);
		const north = createVectorField(grid);
		const frame = createEastNorthFrame();
		for (let cell = 0; cell < cellCount; cell++) {
			const x = centres[3 * cell] as number;
			const y = centres[3 * cell + 1] as number;
			const z = centres[3 * cell + 2] as number;
			const across = Math.hypot(x, y);
			writeEastNorthFrame(
				z,
				across,
				across > 0 ? y / across : 0,
				across > 0 ? x / across : 1,
				frame,
			);
			east.x[cell] = frame.eastX;
			east.y[cell] = frame.eastY;
			north.x[cell] = frame.northX;
			north.y[cell] = frame.northY;
			north.z[cell] = frame.northZ;
		}
		frames = { east, north };
		CELL_FRAMES.set(grid, frames);
	}
	return frames;
};

/** Throws unless a field holds one value per cell. */
const assertField = (
	grid: Grid,
	field: ArrayLike<number>,
	what: string,
): void => {
	if (field.length !== grid.cellCount) {
		throw new RangeError(
			`A grid of ${grid.cellCount} cells has ${grid.cellCount} ${what}; got ${field.length}`,
		);
	}
};

/** Throws unless each component of a vector field holds one value per cell. */
const assertVectors = (
	grid: Grid,
	vectors: VectorField,
	what: string,
): void => {
	assertField(grid, vectors.x, `${what} x components`);
	assertField(grid, vectors.y, `${what} y components`);
	assertField(grid, vectors.z, `${what} z components`);
};

/** Throws unless a radius is positive and finite. */
const assertRadius = (radius: number): void => {
	if (!(radius > 0 && Number.isFinite(radius))) {
		throw new RangeError(`A radius must be positive and finite; got ${radius}`);
	}
};

/** Throws if an output array is one of the input's. */
const assertApart = (vectors: VectorField, into: Float64Array): void => {
	if (into === vectors.x || into === vectors.y || into === vectors.z) {
		throw new RangeError(
			'The output must not be one of the input vectors’ arrays',
		);
	}
};

/**
 * The eastward and northward components of a vector field at every cell's
 * centre.
 *
 * @remarks
 * Each is the vector's dot product with the direction from
 * {@link cellFrames}, so any part of the vector off the sphere's surface is
 * dropped.
 *
 * @param grid - The grid.
 * @param vectors - One vector per cell. It is not changed.
 * @param into - Where to write the components; new arrays when left out.
 * @returns `into`, or the new arrays.
 * @throws RangeError if `vectors` or `into` has arrays of the wrong length.
 */
export const toEastNorth = (
	grid: Grid,
	vectors: VectorField,
	into?: EastNorthField,
): EastNorthField => {
	assertVectors(grid, vectors, 'vector');
	const { cellCount } = grid;
	const result = into ?? {
		east: new Float64Array(cellCount),
		north: new Float64Array(cellCount),
	};
	assertField(grid, result.east, 'eastward components');
	assertField(grid, result.north, 'northward components');
	const { east, north } = cellFrames(grid);
	const { x, y, z } = vectors;
	for (let cell = 0; cell < cellCount; cell++) {
		const vx = x[cell] as number;
		const vy = y[cell] as number;
		const vz = z[cell] as number;
		result.east[cell] =
			vx * (east.x[cell] as number) + vy * (east.y[cell] as number);
		result.north[cell] =
			vx * (north.x[cell] as number) +
			vy * (north.y[cell] as number) +
			vz * (north.z[cell] as number);
	}
	return result;
};

/**
 * The vector field with given eastward and northward components at every
 * cell's centre.
 *
 * @param grid - The grid.
 * @param components - The eastward and northward components, one of each
 * per cell. They are not changed.
 * @param into - Where to write the vectors; new arrays when left out.
 * @returns `into`, or the new arrays.
 * @throws RangeError if any array has the wrong length.
 */
export const fromEastNorth = (
	grid: Grid,
	components: {
		readonly east: ArrayLike<number>;
		readonly north: ArrayLike<number>;
	},
	into?: VectorField,
): VectorField => {
	assertField(grid, components.east, 'eastward components');
	assertField(grid, components.north, 'northward components');
	const result = into ?? createVectorField(grid);
	assertVectors(grid, result, 'output');
	const { east, north } = cellFrames(grid);
	const { x, y, z } = result;
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const u = components.east[cell] as number;
		const v = components.north[cell] as number;
		x[cell] = u * (east.x[cell] as number) + v * (north.x[cell] as number);
		y[cell] = u * (east.y[cell] as number) + v * (north.y[cell] as number);
		z[cell] = v * (north.z[cell] as number);
	}
	return result;
};

/** The dot product of two vectors. */
const dot = (a: Vec3, b: Vec3): number =>
	a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Adds a weight for a cell to a stencil being built. */
const addTo = (stencil: Map<number, number>, cell: number, weight: number) => {
	stencil.set(cell, (stencil.get(cell) ?? 0) + weight);
};

/**
 * Adds to a stencil the value at the centre of cell `(i, j)` of a face's
 * grid, which may lie one or two cells past one of the face's edges, times
 * a weight.
 *
 * @remarks
 * A point past an edge lies exactly on the line through the centres of a
 * row of cells across the edge, parallel to it: the first row for one cell
 * past, the second for two. It is generally not at any of their centres
 * but moved along the edge, away from the edge's middle, by up to about
 * half a cell near the corners. Its value is interpolated by a cubic
 * through four cells of that row, by its position along the row in that
 * face's own equiangular coordinates, in which the row's centres are evenly
 * spaced; four cells at the row's end when it lies near one.
 */
const addPoint = (
	grid: Grid,
	face: number,
	i: number,
	j: number,
	weight: number,
	stencil: Map<number, number>,
): void => {
	const { n, neighbours } = grid;
	const pastI = i < 0 || i >= n;
	const pastJ = j < 0 || j >= n;
	if (!pastI && !pastJ) {
		addTo(stencil, (face * n + j) * n + i, weight);
		return;
	}
	const seen = directionToFace(
		faceToDirection(face, (i + 0.5) / n, (j + 0.5) / n),
	);
	// The face across is the one the face's own outermost cell there has
	// as its neighbour on that side.
	const edgeCell =
		(face * n + Math.min(n - 1, Math.max(0, j))) * n +
		Math.min(n - 1, Math.max(0, i));
	const side = pastI ? (i < 0 ? 0 : 1) : j < 0 ? 2 : 3;
	const across = neighbours[SIDES * edgeCell + side] as number;
	const axes = FACE_AXES[face] as FaceAxes;
	// The axes are whole numbers, so the dot product is exactly 0 or ±1.
	const alongV =
		Math.abs(
			dot((FACE_AXES[seen.face] as FaceAxes).v, pastI ? axes.v : axes.u),
		) === 1;
	const acrossPosition = (alongV ? seen.s : seen.t) * n - 0.5;
	const row = Math.round(acrossPosition);
	if (
		Math.floor(across / (n * n)) !== seen.face ||
		Math.abs(acrossPosition - row) > 1e-6 ||
		row < 0 ||
		row >= n
	) {
		throw new Error(
			`The grid line through cell (${i}, ${j}) of face ${face} does not continue along a row across its edge`,
		);
	}
	const position = (alongV ? seen.t : seen.s) * n - 0.5;
	const first = Math.min(n - 4, Math.max(0, Math.floor(position) - 1));
	for (let k = 0; k < 4; k++) {
		let lagrange = 1;
		for (let m = 0; m < 4; m++) {
			if (m !== k) {
				lagrange *= (position - (first + m)) / (k - m);
			}
		}
		const node = first + k;
		addTo(
			stencil,
			alongV
				? (seen.face * n + node) * n + row
				: (seen.face * n + row) * n + node,
			weight * lagrange,
		);
	}
};

/**
 * Adds to a stencil the value at the middle of one side of a cell, from the
 * four cells in a line across it on the cell's own face's grid, times a
 * weight.
 */
const addLine = (
	grid: Grid,
	cell: number,
	side: number,
	weight: number,
	stencil: Map<number, number>,
): void => {
	const { n } = grid;
	const face = Math.floor(cell / (n * n));
	const i = cell % n;
	const j = Math.floor(cell / n) % n;
	const [di, dj] = STEPS[side] as readonly [number, number];
	addPoint(grid, face, i - di, j - dj, weight * FAR_WEIGHT, stencil);
	addPoint(grid, face, i, j, weight * NEAR_WEIGHT, stencil);
	addPoint(grid, face, i + di, j + dj, weight * NEAR_WEIGHT, stencil);
	addPoint(grid, face, i + 2 * di, j + 2 * dj, weight * FAR_WEIGHT, stencil);
};

/**
 * The rates at which a point of a face moves as its face coordinates `s`
 * and `t` grow, per cell of a grid of `n` cells per face edge.
 */
const faceDerivatives = (
	n: number,
	face: number,
	s: number,
	t: number,
): readonly [Vec3, Vec3] => {
	const { normal, u, v } = FACE_AXES[face] as FaceAxes;
	const a = Math.tan((s - 0.5) * HALF_PI);
	const b = Math.tan((t - 0.5) * HALF_PI);
	const length = Math.sqrt(1 + a * a + b * b);
	const point: Vec3 = [
		(normal[0] + a * u[0] + b * v[0]) / length,
		(normal[1] + a * u[1] + b * v[1]) / length,
		(normal[2] + a * u[2] + b * v[2]) / length,
	];
	// The point is (normal + a u + b v) / length, and a = tan of an angle
	// linear in s, which grows by π/2 across the face's n cells.
	const along = (axis: Vec3, tangent: number): Vec3 => {
		const outward = dot(point, axis);
		const rate = (HALF_PI * (1 + tangent * tangent)) / (n * length);
		return [
			(axis[0] - outward * point[0]) * rate,
			(axis[1] - outward * point[1]) * rate,
			(axis[2] - outward * point[2]) * rate,
		];
	};
	return [along(u, a), along(v, b)];
};

/**
 * The two weights of a cell's slope across one of its sides, times the
 * side's length, laid out as in {@link Operators.slopes}, on the cell's own
 * face's grid.
 *
 * @remarks
 * On the face's grid, with `p` the coordinate across the side, in cells,
 * and `q` the one along it, the slope along the side's unit normal ν is
 * `(ν · r_p)(g^pp ∂f/∂p + g^pq ∂f/∂q)`, where `r_p` is the rate a point
 * moves with `p` and `g` the inverse of the grid's metric at the middle of
 * the side. The side runs along `q`, so ν is at right angles to `r_q`.
 * The weights written are those of `∂f/∂p` and `∂f/∂q`, per cell. On a
 * grid whose lines cross at right angles `g^pq` is zero; the grid's lines
 * cross at up to 30° from that near the cube's corners.
 */
const slopeWeights = (
	grid: Grid,
	cell: number,
	side: number,
	normal: Vec3,
	length: number,
	out: [number, number],
): void => {
	const { n } = grid;
	const face = Math.floor(cell / (n * n));
	const i = cell % n;
	const j = Math.floor(cell / n) % n;
	const [di, dj] = STEPS[side] as readonly [number, number];
	const [rs, rt] = faceDerivatives(
		n,
		face,
		(i + 0.5 + 0.5 * di) / n,
		(j + 0.5 + 0.5 * dj) / n,
	);
	const across = side < 2 ? rs : rt;
	const sign = side % 2 === 0 ? -1 : 1;
	const rp: Vec3 = [sign * across[0], sign * across[1], sign * across[2]];
	const rq = side < 2 ? rt : rs;
	const gpp = dot(rp, rp);
	const gpq = dot(rp, rq);
	const gqq = dot(rq, rq);
	const determinant = gpp * gqq - gpq * gpq;
	const scale = (length * dot(normal, rp)) / determinant;
	out[0] = scale * gqq;
	out[1] = -scale * gpq;
};

/** The weights of the cubic through four cells in a line at its middle. */
const MIDDLE_WEIGHTS = [-1 / 16, 9 / 16, 9 / 16, -1 / 16] as const;

/**
 * Writes the weights that give a function's slope at `at` from its values
 * at five evenly spaced nodes `first` to `first + 4`: the slope of the
 * polynomial through them, fourth order where `at` is the middle node.
 */
const slopeAt = (first: number, at: number, out: Float64Array): void => {
	for (let k = 0; k < 5; k++) {
		let total = 0;
		for (let m = 0; m < 5; m++) {
			if (m === k) {
				continue;
			}
			let product = 1 / (k - m);
			for (let l = 0; l < 5; l++) {
				if (l !== k && l !== m) {
					product *= (at - (first + l)) / (k - l);
				}
			}
			total += product;
		}
		out[k] = total;
	}
};

/**
 * Adds to a stencil a cell's slope across one of its sides, times the
 * side's length and a weight, on the cell's own face's grid, by
 * {@link slopeWeights}.
 *
 * @remarks
 * `∂f/∂p` is taken from the four cells in a line across the side,
 * `(f₋₁ − 27 f₀ + 27 f₁ − f₂) / 24`. `∂f/∂q` is taken at each of those four
 * cells from five in a line along the side, `(f₋₂ − 8 f₋₁ + 8 f₁ − f₂) / 12`,
 * and carried to the side's middle by the cubic through the four. Both are
 * fourth order, so the slope's error is too small to differ between the two
 * faces at a cube edge by anything that matters.
 *
 * Points past the face's edge are taken from the rows of cells across it by
 * {@link addPoint}. Beside a cube corner, where a line along the side past
 * one cube edge would run past the other too, outside both faces, its five
 * cells are moved along it to stay within the rows across the first edge,
 * and the slope is taken off their middle.
 */
const addSlope = (
	grid: Grid,
	cell: number,
	side: number,
	normal: Vec3,
	length: number,
	weight: number,
	stencil: Map<number, number>,
	weights: [number, number],
	derivative: Float64Array,
): void => {
	const { n } = grid;
	const face = Math.floor(cell / (n * n));
	const i = cell % n;
	const j = Math.floor(cell / n) % n;
	const [di, dj] = STEPS[side] as readonly [number, number];
	slopeWeights(grid, cell, side, normal, length, weights);
	const across = (weight * weights[0]) / 24;
	addPoint(grid, face, i - di, j - dj, across, stencil);
	addPoint(grid, face, i, j, -27 * across, stencil);
	addPoint(grid, face, i + di, j + dj, 27 * across, stencil);
	addPoint(grid, face, i + 2 * di, j + 2 * dj, -across, stencil);
	const outside = (k: number): boolean => k < 0 || k >= n;
	for (let step = -1; step <= 2; step++) {
		const ci = i + step * di;
		const cj = j + step * dj;
		const at = side < 2 ? cj : ci;
		// A line on the face may run two cells past its edges; one past the
		// face's edge across the side must stay within the rows there.
		const past = outside(ci) || outside(cj);
		const lowest = past ? 0 : -2;
		const highest = past ? n - 1 : n + 1;
		const first = Math.min(highest - 4, Math.max(lowest, at - 2));
		slopeAt(first, at, derivative);
		const along = weight * weights[1] * (MIDDLE_WEIGHTS[step + 1] as number);
		for (let k = 0; k < 5; k++) {
			const node = first + k;
			addPoint(
				grid,
				face,
				side < 2 ? ci : node,
				side < 2 ? node : cj,
				along * (derivative[k] as number),
				stencil,
			);
		}
	}
};

/**
 * Builds the operators' geometry for a grid; see {@link Operators} for its
 * layout.
 *
 * @remarks
 * Each edge is listed once, from the lower-numbered of its two cells, met
 * in cell order; the plain edges go first and the rest after them. The
 * edges within two cells of a cube edge, whose line of four cells runs past
 * the face, get a stencil of their own from {@link addLine}.
 */
const buildOperators = (grid: Grid): Operators => {
	const { n, cellCount, centres, areas, neighbours } = grid;
	const { lengths } = edgeGeometry(grid);
	const edgeCount = (SIDES / 2) * cellCount;
	// Inside a face, each line of n cells has n − 1 edges, of which the
	// first and last lack a cell beyond them on the face.
	const plainCount = 2 * FACE_COUNT * n * (n - 3);
	// Of those, the lines of the face's first and last two rows lack two
	// neighbours along the edge on the face.
	const slopePlainCount = 2 * FACE_COUNT * (n - 3) * (n - 4);
	const slopes = new Float64Array(2 * slopePlainCount);
	// The other edges' slope stencils, met out of edge order, gathered here
	// by edge and packed in order at the end.
	const slopeStencils: (readonly [number, number])[][] = [];
	const pair: [number, number] = [0, 0];
	const derivative = new Float64Array(5);
	const ends = new Int32Array(2 * edgeCount);
	const outer = new Int32Array(2 * plainCount);
	const normals = new Float64Array(3 * edgeCount);
	const tangents = new Float64Array(3 * edgeCount);
	const stencilStarts = new Int32Array(edgeCount - plainCount + 1);
	const stencilCells: number[] = [];
	const stencilWeights: number[] = [];
	const inverseAreas = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		inverseAreas[cell] = 1 / (areas[cell] as number);
	}
	const inside = (k: number): boolean => k >= 0 && k < n;
	const stride = n + 1;
	const { first, second } = sideCorners(n);
	const stencil = new Map<number, number>();
	let plain = 0;
	let slopePlain = 0;
	let other = 0;
	let cell = 0;
	for (let face = 0; face < FACE_COUNT; face++) {
		const corners = faceCorners(n, face);
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < n; i++) {
				const low = j * stride + i;
				for (let side = 0; side < SIDES; side++) {
					const next = neighbours[SIDES * cell + side] as number;
					if (next < cell) {
						continue;
					}
					const [di, dj] = STEPS[side] as readonly [number, number];
					const isPlain =
						Math.floor(next / (n * n)) === face &&
						inside(i - di) &&
						inside(j - dj) &&
						inside(i + 2 * di) &&
						inside(j + 2 * dj);
					const isSlopePlain =
						isPlain &&
						inside(i - 2 * Math.abs(dj)) &&
						inside(i + 2 * Math.abs(dj)) &&
						inside(j - 2 * Math.abs(di)) &&
						inside(j + 2 * Math.abs(di));
					const edge = isSlopePlain
						? slopePlain
						: isPlain
							? slopePlainCount + plain - slopePlain
							: plainCount + other;
					const p = 3 * (low + (first[side] as number));
					const q = 3 * (low + (second[side] as number));
					const px = corners[p] as number;
					const py = corners[p + 1] as number;
					const pz = corners[p + 2] as number;
					const qx = corners[q] as number;
					const qy = corners[q + 1] as number;
					const qz = corners[q + 2] as number;
					// The normal of the great circle through the edge's two
					// ends, turned to point from this cell to the next.
					let nx = py * qz - pz * qy;
					let ny = pz * qx - px * qz;
					let nz = px * qy - py * qx;
					const towards =
						nx *
							((centres[3 * next] as number) - (centres[3 * cell] as number)) +
						ny *
							((centres[3 * next + 1] as number) -
								(centres[3 * cell + 1] as number)) +
						nz *
							((centres[3 * next + 2] as number) -
								(centres[3 * cell + 2] as number));
					const length = lengths[SIDES * cell + side] as number;
					const scale =
						((towards > 0 ? 1 : -1) * length) / Math.hypot(nx, ny, nz);
					nx *= scale;
					ny *= scale;
					nz *= scale;
					// The edge's middle, and the direction along the edge there.
					let mx = px + qx;
					let my = py + qy;
					let mz = pz + qz;
					const middle = Math.hypot(mx, my, mz);
					mx /= middle;
					my /= middle;
					mz /= middle;
					normals[3 * edge] = nx;
					normals[3 * edge + 1] = ny;
					normals[3 * edge + 2] = nz;
					tangents[3 * edge] = my * nz - mz * ny;
					tangents[3 * edge + 1] = mz * nx - mx * nz;
					tangents[3 * edge + 2] = mx * ny - my * nx;
					ends[2 * edge] = cell;
					ends[2 * edge + 1] = next;
					const unit: Vec3 = [nx / length, ny / length, nz / length];
					if (isSlopePlain) {
						slopeWeights(grid, cell, side, unit, length, pair);
						slopes[2 * edge] = pair[0] / 24;
						slopes[2 * edge + 1] = pair[1] / 192;
						slopePlain++;
					} else {
						stencil.clear();
						if (Math.floor(next / (n * n)) === face) {
							addSlope(
								grid,
								cell,
								side,
								unit,
								length,
								1,
								stencil,
								pair,
								derivative,
							);
						} else {
							// On a cube edge each face has its own slope across
							// it, and the edge takes the mean of the two.
							let back = 0;
							while (neighbours[SIDES * next + back] !== cell) {
								back++;
							}
							const reverse: Vec3 = [-unit[0], -unit[1], -unit[2]];
							addSlope(
								grid,
								cell,
								side,
								unit,
								length,
								0.5,
								stencil,
								pair,
								derivative,
							);
							addSlope(
								grid,
								next,
								back,
								reverse,
								length,
								-0.5,
								stencil,
								pair,
								derivative,
							);
						}
						slopeStencils[edge - slopePlainCount] = [...stencil];
					}
					if (isPlain) {
						outer[2 * edge] = (face * n + j - dj) * n + i - di;
						outer[2 * edge + 1] = (face * n + j + 2 * dj) * n + i + 2 * di;
						plain++;
						continue;
					}
					stencil.clear();
					if (Math.floor(next / (n * n)) === face) {
						addLine(grid, cell, side, 1, stencil);
					} else {
						// On a cube edge each face has its own line across it,
						// and the edge takes the mean of the two.
						let back = 0;
						while (neighbours[SIDES * next + back] !== cell) {
							back++;
						}
						addLine(grid, cell, side, 0.5, stencil);
						addLine(grid, next, back, 0.5, stencil);
					}
					stencilStarts[other] = stencilCells.length;
					for (const [from, weight] of stencil) {
						stencilCells.push(from);
						stencilWeights.push(weight);
					}
					other++;
				}
				cell++;
			}
		}
	}
	stencilStarts[other] = stencilCells.length;
	const slopeStarts = new Int32Array(edgeCount - slopePlainCount + 1);
	const slopeCells: number[] = [];
	const slopeWeightList: number[] = [];
	for (let index = 0; index < edgeCount - slopePlainCount; index++) {
		slopeStarts[index] = slopeCells.length;
		for (const [from, weight] of slopeStencils[index] ?? []) {
			slopeCells.push(from);
			slopeWeightList.push(weight);
		}
	}
	slopeStarts[edgeCount - slopePlainCount] = slopeCells.length;
	if (
		plain !== plainCount ||
		slopePlain !== slopePlainCount ||
		plainCount + other !== edgeCount
	) {
		throw new Error(
			`A grid of ${n} cells per face edge has ${plainCount} plain edges of ${edgeCount}; found ${plain} of ${plain + other}`,
		);
	}
	return {
		edgeCount,
		plainCount,
		ends,
		outer,
		normals,
		tangents,
		stencilStarts,
		stencilCells: Int32Array.from(stencilCells),
		stencilWeights: Float64Array.from(stencilWeights),
		slopePlainCount,
		slopes,
		slopeStarts,
		slopeCells: Int32Array.from(slopeCells),
		slopeWeights: Float64Array.from(slopeWeightList),
		inverseAreas,
	};
};

/** The operators' geometry for a grid, built on first use and then shared. */
const operators = (grid: Grid): Operators => {
	let built = OPERATORS.get(grid);
	if (built === undefined) {
		built = buildOperators(grid);
		OPERATORS.set(grid, built);
	}
	return built;
};

/**
 * The gradient of a field of one value per cell: at each cell's centre, a
 * vector tangent to the sphere pointing the way the field rises fastest,
 * as long as the rise per unit distance.
 *
 * @remarks
 * By the divergence theorem: the field's value on each of a cell's four
 * edges, less the cell's own, times the edge's length and its outward
 * normal, summed and divided by the cell's area, then made tangent at the
 * centre by dropping its part along the centre's direction. A constant
 * field has a gradient of exactly zero.
 *
 * The gradient of sin φ, northward and of size cos φ on the unit sphere,
 * comes out within 1.4e-4 at 64 cells per face edge, 3.5e-5 at 128 and
 * 8.9e-6 at 256: a quarter for every doubling of the grid, and on the cube
 * edges and corners within 1.2 times the largest error well inside the
 * faces.
 *
 * As with any gradient taken from values at cells' centres, a field that
 * alternates from cell to cell, a checkerboard, has almost no gradient
 * inside the faces; whatever is stepped with these operators must damp such
 * a pattern by other means, such as {@link smoothField}.
 *
 * @param grid - The grid.
 * @param field - One value per cell. It is not changed.
 * @param radius - The sphere's radius: the gradient is per this unit of
 * distance. Defaults to 1, for per radian of arc.
 * @param into - Where to write the gradient; new arrays when left out.
 * None of its arrays may be `field`.
 * @returns `into`, or the new arrays.
 * @throws RangeError if `field` or `into` has the wrong length, one of
 * `into`'s arrays is `field`, or `radius` is not positive and finite.
 */
export const gradient = (
	grid: Grid,
	field: ArrayLike<number>,
	radius = 1,
	into?: VectorField,
): VectorField => {
	assertField(grid, field, 'values');
	assertRadius(radius);
	const result = into ?? createVectorField(grid);
	assertVectors(grid, result, 'output');
	if (field === result.x || field === result.y || field === result.z) {
		throw new RangeError('The output must not hold the field itself');
	}
	const {
		edgeCount,
		plainCount,
		ends,
		outer,
		normals,
		stencilStarts,
		stencilCells,
		stencilWeights,
		inverseAreas,
	} = operators(grid);
	const { x, y, z } = result;
	x.fill(0);
	y.fill(0);
	z.fill(0);
	// The edge's value less a's, as a weighted sum of differences from a's so
	// that a constant field gives exactly zero; and b's less the edge's.
	for (let edge = 0; edge < plainCount; edge++) {
		const a = ends[2 * edge] as number;
		const b = ends[2 * edge + 1] as number;
		const valueA = field[a] as number;
		const valueB = field[b] as number;
		const fromA =
			NEAR_WEIGHT * (valueB - valueA) +
			FAR_WEIGHT *
				((field[outer[2 * edge] as number] as number) -
					valueA +
					((field[outer[2 * edge + 1] as number] as number) - valueA));
		const toB = fromA + (valueA - valueB);
		const nx = normals[3 * edge] as number;
		const ny = normals[3 * edge + 1] as number;
		const nz = normals[3 * edge + 2] as number;
		x[a] = (x[a] as number) + fromA * nx;
		y[a] = (y[a] as number) + fromA * ny;
		z[a] = (z[a] as number) + fromA * nz;
		x[b] = (x[b] as number) - toB * nx;
		y[b] = (y[b] as number) - toB * ny;
		z[b] = (z[b] as number) - toB * nz;
	}
	for (let edge = plainCount; edge < edgeCount; edge++) {
		const a = ends[2 * edge] as number;
		const b = ends[2 * edge + 1] as number;
		const valueA = field[a] as number;
		let fromA = 0;
		const end = stencilStarts[edge - plainCount + 1] as number;
		for (let k = stencilStarts[edge - plainCount] as number; k < end; k++) {
			fromA +=
				(stencilWeights[k] as number) *
				((field[stencilCells[k] as number] as number) - valueA);
		}
		const toB = fromA + (valueA - (field[b] as number));
		const nx = normals[3 * edge] as number;
		const ny = normals[3 * edge + 1] as number;
		const nz = normals[3 * edge + 2] as number;
		x[a] = (x[a] as number) + fromA * nx;
		y[a] = (y[a] as number) + fromA * ny;
		z[a] = (z[a] as number) + fromA * nz;
		x[b] = (x[b] as number) - toB * nx;
		y[b] = (y[b] as number) - toB * ny;
		z[b] = (z[b] as number) - toB * nz;
	}
	const { centres, cellCount } = grid;
	for (let cell = 0; cell < cellCount; cell++) {
		const scale = (inverseAreas[cell] as number) / radius;
		const gx = (x[cell] as number) * scale;
		const gy = (y[cell] as number) * scale;
		const gz = (z[cell] as number) * scale;
		const cx = centres[3 * cell] as number;
		const cy = centres[3 * cell + 1] as number;
		const cz = centres[3 * cell + 2] as number;
		const outward = gx * cx + gy * cy + gz * cz;
		x[cell] = gx - outward * cx;
		y[cell] = gy - outward * cy;
		z[cell] = gz - outward * cz;
	}
	return result;
};

/**
 * The sum over each cell's edges of the field's value on the edge dotted
 * with one of the per-edge vectors, divided by the cell's area and the
 * radius: what {@link divergence} and {@link curl} share.
 */
const edgeSum = (
	grid: Grid,
	vectors: VectorField,
	along: Float64Array,
	radius: number,
	into: Float64Array | undefined,
): Float64Array => {
	assertVectors(grid, vectors, 'vector');
	assertRadius(radius);
	const result = into ?? new Float64Array(grid.cellCount);
	assertField(grid, result, 'outputs');
	assertApart(vectors, result);
	const {
		edgeCount,
		plainCount,
		ends,
		outer,
		stencilStarts,
		stencilCells,
		stencilWeights,
		inverseAreas,
	} = operators(grid);
	const { x, y, z } = vectors;
	result.fill(0);
	for (let edge = 0; edge < plainCount; edge++) {
		const a = ends[2 * edge] as number;
		const b = ends[2 * edge + 1] as number;
		const before = outer[2 * edge] as number;
		const after = outer[2 * edge + 1] as number;
		const ux =
			NEAR_WEIGHT * ((x[a] as number) + (x[b] as number)) +
			FAR_WEIGHT * ((x[before] as number) + (x[after] as number));
		const uy =
			NEAR_WEIGHT * ((y[a] as number) + (y[b] as number)) +
			FAR_WEIGHT * ((y[before] as number) + (y[after] as number));
		const uz =
			NEAR_WEIGHT * ((z[a] as number) + (z[b] as number)) +
			FAR_WEIGHT * ((z[before] as number) + (z[after] as number));
		const flux =
			ux * (along[3 * edge] as number) +
			uy * (along[3 * edge + 1] as number) +
			uz * (along[3 * edge + 2] as number);
		result[a] = (result[a] as number) + flux;
		result[b] = (result[b] as number) - flux;
	}
	for (let edge = plainCount; edge < edgeCount; edge++) {
		const a = ends[2 * edge] as number;
		const b = ends[2 * edge + 1] as number;
		let ux = 0;
		let uy = 0;
		let uz = 0;
		const end = stencilStarts[edge - plainCount + 1] as number;
		for (let k = stencilStarts[edge - plainCount] as number; k < end; k++) {
			const from = stencilCells[k] as number;
			const weight = stencilWeights[k] as number;
			ux += weight * (x[from] as number);
			uy += weight * (y[from] as number);
			uz += weight * (z[from] as number);
		}
		const flux =
			ux * (along[3 * edge] as number) +
			uy * (along[3 * edge + 1] as number) +
			uz * (along[3 * edge + 2] as number);
		result[a] = (result[a] as number) + flux;
		result[b] = (result[b] as number) - flux;
	}
	for (let cell = 0; cell < grid.cellCount; cell++) {
		result[cell] =
			((result[cell] as number) * (inverseAreas[cell] as number)) / radius;
	}
	return result;
};

/**
 * The divergence of a vector field: how much it spreads out of each cell,
 * per unit area.
 *
 * @remarks
 * By the divergence theorem: the field's value on each of a cell's four
 * edges dotted with the edge's outward normal, times the edge's length,
 * summed and divided by the cell's area. Each edge's flux leaves one cell
 * and enters the other, so the divergence times the cells' areas sums to
 * zero over the sphere, to rounding. Any part of the vectors off the
 * sphere's surface should be removed first: it is not.
 *
 * The divergence of a smooth flow, the surface gradient of a spherical
 * harmonic Y of degree 2, comes out within 1.7e-4 of the largest of its
 * exact value, −6Y, at 64 cells per face edge, 4.3e-5 at 128 and 1.1e-5 at
 * 256, as accurate on the cube edges and at the corners as inside the
 * faces. Taken of this module's {@link gradient} of Y instead, it is as
 * accurate inside the faces, but in the outermost row of cells on each
 * side of a cube edge it is only first order: about 4e-3 at 64, 2e-3 at
 * 128 and 1e-3 at 256, the worst at the corners. The gradient's own small
 * error changes its pattern across a cube edge, and the divergence of that
 * is a step of one cell's width. For a Laplacian use {@link laplacian},
 * which is second order everywhere.
 *
 * @param grid - The grid.
 * @param vectors - One tangent vector per cell. It is not changed.
 * @param radius - The sphere's radius: the divergence is per this unit of
 * distance. Defaults to 1, for per radian.
 * @param into - Where to write the divergence, one value per cell; a new
 * array when left out. It must not be one of the input's arrays.
 * @returns `into`, or the new array.
 * @throws RangeError if an array has the wrong length, `into` is one of the
 * input's arrays, or `radius` is not positive and finite.
 */
export const divergence = (
	grid: Grid,
	vectors: VectorField,
	radius = 1,
	into?: Float64Array,
): Float64Array =>
	edgeSum(grid, vectors, operators(grid).normals, radius, into);

/**
 * The curl of a vector field: its component out of the sphere, the
 * vorticity, positive for anticlockwise flow seen from outside the sphere.
 *
 * @remarks
 * By Stokes' theorem: the field's value on each of a cell's four edges
 * dotted with the direction along the edge anticlockwise round the cell,
 * times the edge's length, summed and divided by the cell's area. A solid
 * body turning about +Z at rate Ω, the vectors Ω ẑ × r, has a curl of
 * 2Ω sin φ. Each edge's circulation runs one way round one cell and the
 * other way round the other, so the curl times the cells' areas sums to
 * zero over the sphere, to rounding.
 *
 * The curl of a smooth flow, the radial direction crossed with the surface
 * gradient of a spherical harmonic Y of degree 3, comes out within 2.8e-4
 * of the largest of its exact value, −12Y, at 64 cells per face edge,
 * 7.0e-5 at 128 and 1.8e-5 at 256, as accurate on the cube edges and at the
 * corners as inside the faces.
 *
 * @param grid - The grid.
 * @param vectors - One tangent vector per cell. It is not changed.
 * @param radius - The sphere's radius: the curl is per this unit of
 * distance. Defaults to 1, for per radian.
 * @param into - Where to write the curl, one value per cell; a new array
 * when left out. It must not be one of the input's arrays.
 * @returns `into`, or the new array.
 * @throws RangeError if an array has the wrong length, `into` is one of the
 * input's arrays, or `radius` is not positive and finite.
 */
export const curl = (
	grid: Grid,
	vectors: VectorField,
	radius = 1,
	into?: Float64Array,
): Float64Array =>
	edgeSum(grid, vectors, operators(grid).tangents, radius, into);

/**
 * The Laplacian of a field of one value per cell: the divergence of its
 * gradient, how much each cell's value falls short of its surroundings'.
 *
 * @remarks
 * By the divergence theorem, in one step: the field's slope out of each of
 * a cell's four edges, along the edge's normal, times the edge's length,
 * summed and divided by the cell's area. The slope across an edge is taken
 * from the cells beside it on one face's grid, by {@link slopeWeights}: a
 * difference across the edge from the four cells in a line through it,
 * corrected by the difference along the edge where the grid's lines do not
 * cross at right angles. Past a cube edge those cells are interpolated
 * along the rows across it as for {@link divergence}, and an edge on a cube
 * edge takes the mean of its two faces' slopes. Each edge's flux leaves one
 * cell and enters the other, so the Laplacian times the cells' areas sums
 * to zero over the sphere, to rounding; a constant field's is exactly zero.
 *
 * It is per radian squared on the unit sphere, or per unit of the radius
 * given, squared.
 *
 * The Laplacian of a spherical harmonic Y of degree 2 set at an angle to
 * the cube's axes, −6Y, comes out within 1.3e-4 of its largest at 64 cells
 * per face edge, 3.2e-5 at 128 and 8.1e-6 at 256: second order, a quarter
 * for every doubling of the grid, and on the cube edges and at the corners
 * within 1.12 times the largest error well inside the faces. That is about
 * half the error of {@link divergence} of {@link gradient} inside the
 * faces, and on the cube edges, where that is only first order, 30 times
 * less at 64 and 130 times less at 256.
 *
 * Its stencil reaches two cells along and across each edge, twenty cells
 * in all, so it costs roughly a millisecond a call at 64 cells per face
 * edge, a few milliseconds at 128 and some fifteen at 256.
 *
 * @param grid - The grid.
 * @param field - One value per cell. It is not changed.
 * @param radius - The sphere's radius: the Laplacian is per this unit of
 * distance, squared. Defaults to 1, for per radian squared.
 * @param into - Where to write the Laplacian, one value per cell; a new
 * array when left out. It must not be `field`.
 * @returns `into`, or the new array.
 * @throws RangeError if `field` or `into` has the wrong length, `into` is
 * `field`, or `radius` is not positive and finite.
 */
export const laplacian = (
	grid: Grid,
	field: ArrayLike<number>,
	radius = 1,
	into?: Float64Array,
): Float64Array => {
	assertField(grid, field, 'values');
	assertRadius(radius);
	const result = into ?? new Float64Array(grid.cellCount);
	assertField(grid, result, 'outputs');
	if (result === field) {
		throw new RangeError('The output must not be the field itself');
	}
	const {
		edgeCount,
		slopePlainCount,
		ends,
		outer,
		slopes,
		slopeStarts,
		slopeCells,
		slopeWeights: weights,
		inverseAreas,
	} = operators(grid);
	const { n } = grid;
	result.fill(0);
	for (let edge = 0; edge < slopePlainCount; edge++) {
		const a = ends[2 * edge] as number;
		const b = ends[2 * edge + 1] as number;
		const valueA = field[a] as number;
		const valueB = field[b] as number;
		const before = outer[2 * edge] as number;
		const after = outer[2 * edge + 1] as number;
		// An edge across i joins cells one apart, and the cells along it
		// are a row apart; an edge across j the other way round.
		const along = b - a === 1 ? n : 1;
		const twice = 2 * along;
		const flux =
			(slopes[2 * edge] as number) *
				((field[before] as number) -
					(field[after] as number) +
					27 * (valueB - valueA)) +
			(slopes[2 * edge + 1] as number) *
				(9 *
					((field[a - twice] as number) -
						(field[a + twice] as number) +
						8 * ((field[a + along] as number) - (field[a - along] as number)) +
						((field[b - twice] as number) -
							(field[b + twice] as number) +
							8 *
								((field[b + along] as number) -
									(field[b - along] as number)))) -
					((field[before - twice] as number) -
						(field[before + twice] as number) +
						8 *
							((field[before + along] as number) -
								(field[before - along] as number)) +
						((field[after - twice] as number) -
							(field[after + twice] as number) +
							8 *
								((field[after + along] as number) -
									(field[after - along] as number)))));
		result[a] = (result[a] as number) + flux;
		result[b] = (result[b] as number) - flux;
	}
	for (let edge = slopePlainCount; edge < edgeCount; edge++) {
		const a = ends[2 * edge] as number;
		const b = ends[2 * edge + 1] as number;
		const valueA = field[a] as number;
		let flux = 0;
		const end = slopeStarts[edge - slopePlainCount + 1] as number;
		for (let k = slopeStarts[edge - slopePlainCount] as number; k < end; k++) {
			flux +=
				(weights[k] as number) *
				((field[slopeCells[k] as number] as number) - valueA);
		}
		result[a] = (result[a] as number) + flux;
		result[b] = (result[b] as number) - flux;
	}
	const scale = 1 / (radius * radius);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		result[cell] =
			(result[cell] as number) * (inverseAreas[cell] as number) * scale;
	}
	return result;
};

/**
 * The exchange solver and working memory {@link smoothField} uses on a grid,
 * made on first use and then shared.
 */
const smoother = (grid: Grid): Smoother => {
	let built = SMOOTHERS.get(grid);
	if (built === undefined) {
		const { cellCount } = grid;
		built = {
			solver: createExchangeSolver(grid, uniformCoupling(grid, 1)),
			mass: new Float64Array(cellCount),
			step: 0,
			rhs: new Float64Array(cellCount),
			guess: new Float64Array(cellCount),
			curvature: new Float64Array(cellCount),
		};
		SMOOTHERS.set(grid, built);
	}
	return built;
};

/**
 * Adds to `rhs` what the exchange between neighbours misses of the
 * Laplacian of `x`: the cell's area times {@link laplacian}'s value, less
 * the exchange's own sum over the four edges, `Σ w (x_k − x_i)`.
 */
const addSkewCorrection = (
	grid: Grid,
	x: Float64Array,
	curvature: Float64Array,
	rhs: Float64Array,
): void => {
	const { cellCount, areas, neighbours } = grid;
	const { weights } = edgeGeometry(grid);
	laplacian(grid, x, 1, curvature);
	for (let cell = 0; cell < cellCount; cell++) {
		const first = SIDES * cell;
		const value = x[cell] as number;
		const exchange =
			(weights[first] as number) *
				((x[neighbours[first] as number] as number) - value) +
			(weights[first + 1] as number) *
				((x[neighbours[first + 1] as number] as number) - value) +
			(weights[first + 2] as number) *
				((x[neighbours[first + 2] as number] as number) - value) +
			(weights[first + 3] as number) *
				((x[neighbours[first + 3] as number] as number) - value);
		rhs[cell] =
			(rhs[cell] as number) +
			(areas[cell] as number) * (curvature[cell] as number) -
			exchange;
	}
};

/**
 * A field smoothed over a distance on the planet: roughly the field blurred
 * by a Gaussian whose standard deviation along any one direction is `km`.
 *
 * @remarks
 * The field is diffused for as long as spreads a spike to a variance of
 * `km²` along each direction across the surface, so that its
 * root-mean-square distance from where it started is `√2 · km`. That is
 * taken in {@link SMOOTHING_STEPS} implicit steps, each solved by
 * {@link createExchangeSolver}'s solver, which is stable however far the
 * smoothing reaches and whose cost grows only slowly with the distance:
 * explicit steps would need one for every fraction of a cell the field
 * spreads, thousands for a thousand kilometres on the finest grid. A
 * spherical harmonic of degree l, of wavenumber `k = √(l(l + 1))` per
 * planet's radius, is damped by `(1 + (k · km)² / 8)⁻⁴` with `km` in
 * planet's radii, against a Gaussian's `exp(−(k · km)² / 2)`.
 *
 * The solver's exchange between neighbours, across each edge in proportion
 * to the difference between the two cells, is not by itself a Laplacian
 * where the cells are skewed, as they are towards the cube's corners, where
 * three faces meet and the grid lines cross at 60° and 120°: it leaves out
 * the part of the slope along the edge. Near a corner that makes the spread
 * lopsided, faster along the face's diagonal than across it, and a spike on
 * the corner itself spreads to only 0.9 of the distance it would elsewhere,
 * at every grid size. Each step therefore solves the exchange's system with
 * the rest of {@link laplacian}, which is right at the corners too, added
 * to its right-hand side: what the Laplacian of the field gives less what
 * the exchange gives, taken from the field the step starts from. On the
 * first step, where the field may still change from cell to cell, it is
 * taken instead from a first answer to the step, solved without it. A spike
 * then spreads to within 2% of `√2 · km` wherever it starts, on a corner
 * too, and at a corner to within 2% of the distance it does in the middle
 * of a face, measured over 500 and 1,000 km at 64, 128 and 256 cells per
 * face edge; and nearly evenly every way: its spread along the direction
 * it reaches furthest is at most 1.06 times the spread across it, against
 * 1.24 from the exchange alone. Taking the correction from the field
 * before the step rather than solving for it leaves a small mark at the
 * corners, which `docs/winds.md` gives for the wind model; solving for it
 * would take two more rounds of every step. Since the correction is not
 * part of the implicit solve, a smoothed value can stray a little outside
 * the field's range, most when smoothing over a cell or two.
 *
 * A call costs some tens of milliseconds at 64 cells per face edge, and
 * about five times as much at 128 and thirty times at 256. The solver and
 * its working memory are kept for each grid between calls.
 *
 * Each step moves value between cells without making or losing any, so the
 * area-weighted mean is kept to rounding, and a constant field is given
 * back as it is. Distances are on a planet of {@link PLANET_RADIUS_KM}.
 *
 * @param grid - The grid.
 * @param field - One finite value per cell. It is not changed, unless it is
 * `into`.
 * @param km - The distance in kilometres, zero or more; zero gives the
 * field back unchanged.
 * @param into - Where to write the smoothed field; a new array when left
 * out. It may be `field` itself.
 * @returns `into`, or the new array.
 * @throws RangeError if `field` or `into` has the wrong length, `field` has
 * a value that is not finite, or `km` is negative, not finite, or so short
 * or so long that a step of it is not a positive, finite length with a
 * finite inverse; nothing is written then.
 * @throws Error if a step could not be solved to its tolerance; `into`, or
 * `field` if it is `into`, may then be left partly smoothed.
 */
export const smoothField = (
	grid: Grid,
	field: ArrayLike<number>,
	km: number,
	into?: Float64Array,
): Float64Array => {
	assertField(grid, field, 'values');
	if (!(km >= 0 && Number.isFinite(km))) {
		throw new RangeError(
			`A smoothing distance must be zero or more kilometres; got ${km}`,
		);
	}
	const sigma = km / PLANET_RADIUS_KM;
	// Diffusing for a time t at unit diffusivity spreads a spike to a variance
	// of 2t along each direction.
	const step = (sigma * sigma) / (2 * SMOOTHING_STEPS);
	if (
		km > 0 &&
		!(step > 0 && Number.isFinite(step) && Number.isFinite(1 / step))
	) {
		throw new RangeError(
			`A smoothing distance of ${km} km is too short or too long to smooth over`,
		);
	}
	const { cellCount, areas } = grid;
	const result = into ?? new Float64Array(cellCount);
	assertField(grid, result, 'outputs');
	let total = 0;
	let area = 0;
	let lowest = Number.POSITIVE_INFINITY;
	let highest = Number.NEGATIVE_INFINITY;
	// Every value is checked before any is written.
	for (let cell = 0; cell < cellCount; cell++) {
		const value = field[cell] as number;
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Every value to smooth must be finite; cell ${cell} has ${value}`,
			);
		}
		total += (areas[cell] as number) * value;
		area += areas[cell] as number;
		lowest = Math.min(lowest, value);
		highest = Math.max(highest, value);
	}
	for (let cell = 0; cell < cellCount; cell++) {
		result[cell] = field[cell] as number;
	}
	if (km === 0 || lowest === highest) {
		return result;
	}
	const mean = total / area;
	let spread = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		const departure = (result[cell] as number) - mean;
		spread += (areas[cell] as number) * departure * departure;
	}
	const working = smoother(grid);
	const { solver, mass, rhs, guess, curvature } = working;
	if (working.step !== step) {
		// Marked unset until the masses are, so that a failure leaves none
		// taken for set.
		working.step = Number.NaN;
		for (let cell = 0; cell < cellCount; cell++) {
			mass[cell] = (areas[cell] as number) / step;
		}
		solver.setMass(mass);
		working.step = step;
	}
	const tolerance =
		((SMOOTHING_TOLERANCE * 64) / grid.n) * Math.sqrt(spread / area);
	const solve = (x: Float64Array): void => {
		const { iterations, converged } = solver.solve(rhs, x, tolerance);
		if (!converged) {
			throw new Error(
				`Smoothing over ${km} km was not solved in ${iterations} iterations`,
			);
		}
	};
	for (let taken = 0; taken < SMOOTHING_STEPS; taken++) {
		for (let cell = 0; cell < cellCount; cell++) {
			rhs[cell] = (mass[cell] as number) * (result[cell] as number);
		}
		if (taken === 0) {
			guess.set(result);
			solve(guess);
			addSkewCorrection(grid, guess, curvature, rhs);
			result.set(guess);
		} else {
			addSkewCorrection(grid, result, curvature, rhs);
		}
		solve(result);
	}
	return result;
};
