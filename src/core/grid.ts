/**
 * The cubed-sphere grid every simulation layer lives on.
 *
 * The sphere is covered by the six faces of a cube, each split into n × n
 * cells. A cell is addressed by `(face, i, j)` or by the single index
 * `face * n * n + j * n + i`.
 *
 * Directions are unit vectors with +Z at the north pole, longitude 0 at +X
 * and east positive towards +Y. Latitude and longitude are in degrees.
 *
 * The mapping from a face to the sphere is equiangular: the face coordinates
 * `(s, t)` in [0, 1] are linear in the angles `(s - 0.5) * π/2` and
 * `(t - 0.5) * π/2`, each in [-π/4, π/4], and the point on the cube face is
 * the tangent of those angles along the face's `u` and `v` axes. Cell
 * `(i, j)` covers `s` in [i/n, (i+1)/n] and `t` in [j/n, (j+1)/n].
 */

/**
 * A direction or point in core coordinates, as `[x, y, z]`.
 *
 * @remarks
 * Functions that take a direction accept any finite, non-zero vector and
 * ignore its length; functions that return one return a unit vector. Loops
 * over many cells should read {@link Grid.centres} directly rather than
 * allocate a tuple per cell.
 */
export type Vec3 = readonly [number, number, number];

/** The axes that place one cube face in core coordinates. */
export type FaceAxes = {
	/** Outward unit normal: the direction of the face's centre. */
	readonly normal: Vec3;
	/** Unit axis along which `i` and `s` increase. */
	readonly u: Vec3;
	/** Unit axis along which `j` and `t` increase. */
	readonly v: Vec3;
};

/** A point on the cube: a face and continuous coordinates across it. */
export type FacePoint = {
	/** Face index, 0 to 5, into {@link FACE_AXES}. */
	readonly face: number;
	/** Position along the face's `u` axis, 0 to 1. */
	readonly s: number;
	/** Position along the face's `v` axis, 0 to 1. */
	readonly t: number;
};

/** A cell's address as a face and integer coordinates across it. */
export type CellCoords = {
	/** Face index, 0 to 5, into {@link FACE_AXES}. */
	readonly face: number;
	/** Column, 0 to n - 1, increasing along the face's `u` axis. */
	readonly i: number;
	/** Row, 0 to n - 1, increasing along the face's `v` axis. */
	readonly j: number;
};

/** A position on the globe in degrees. */
export type LatLon = {
	/** Latitude in degrees, -90 (south pole) to 90 (north pole). */
	readonly latitudeDeg: number;
	/** Longitude in degrees, -180 to 180, east positive. */
	readonly longitudeDeg: number;
};

/**
 * A cell's four edge neighbours, in the order `-i`, `+i`, `-j`, `+j`.
 *
 * @remarks
 * The order names the side of the cell the neighbour lies on, in the cell's
 * own face. A neighbour on another face generally has its `i` and `j` axes
 * turned relative to this one.
 */
export type CellNeighbours = readonly [number, number, number, number];

/** Number of cube faces. */
export const FACE_COUNT = 6;

/** Number of edge neighbours every cell has. */
export const NEIGHBOUR_COUNT = 4;

/**
 * The six cube faces, in cell-index order.
 *
 * | face | centre | where | `i` increases towards | `j` increases towards |
 * |-|-|-|-|-|
 * | 0 | +X | equator, longitude 0 | -Z (south) | -Y (west) |
 * | 1 | -X | equator, longitude 180 | +Z (north) | -Y (east) |
 * | 2 | +Y | equator, longitude 90 east | +X (west) | +Z (north) |
 * | 3 | -Y | equator, longitude 90 west | +X (east) | -Z (south) |
 * | 4 | +Z | north pole | +X | -Y |
 * | 5 | -Z | south pole | -X | -Y |
 *
 * @remarks
 * This is the OpenGL cube-map layout (faces +X, -X, +Y, -Y, +Z, -Z, with
 * `u` and `v` the directions in which the texture coordinates grow) applied
 * to core coordinates. A cube texture whose face `f` holds row `j`, column
 * `i` at texel `(i, j)`, uploaded without a vertical flip, therefore has
 * cell `(f, i, j)` at that texel. Sampling it with a core-space direction
 * picks the right face, but a cube lookup is gnomonic where the grid is
 * equiangular: the direction must first be warped, replacing each face
 * coordinate `a` in [-1, 1] by `atan(a) * 4/π`.
 */
export const FACE_AXES: readonly FaceAxes[] = [
	{ normal: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
	{ normal: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
	{ normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
	{ normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
	{ normal: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
	{ normal: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
];

/** The grid resolutions, in cells along a face edge, that can be built. */
export const SUPPORTED_RESOLUTIONS = [64, 128, 256] as const;

/** A supported number of cells along a face edge. */
export type Resolution = (typeof SUPPORTED_RESOLUTIONS)[number];

/** The resolution used when none is chosen. */
export const DEFAULT_RESOLUTION: Resolution = 64;

/**
 * The geometry of the grid at one resolution.
 *
 * @remarks
 * Grids are built once per resolution and shared, so the arrays must be
 * treated as read-only.
 */
export type Grid = {
	/** Cells along a face edge. */
	readonly n: Resolution;
	/** Total number of cells: `6 * n * n`. */
	readonly cellCount: number;
	/**
	 * Angle a cell spans along either face axis, in radians: `π / (2n)`. No
	 * point of a cell is farther than this from the cell's centre.
	 */
	readonly cellWidth: number;
	/**
	 * Cell centres as unit vectors: x, y, z of cell `c` at `3c`, `3c + 1`,
	 * `3c + 2`. The centre is the middle of the cell in face coordinates,
	 * which is not exactly its centre of area.
	 */
	readonly centres: Float64Array;
	/** Exact cell areas on the unit sphere, in steradians, one per cell. */
	readonly areas: Float64Array;
	/**
	 * Edge neighbours: the four of cell `c` at `4c` to `4c + 3`, in the
	 * order `-i`, `+i`, `-j`, `+j`.
	 */
	readonly neighbours: Int32Array;
};

/** Working memory for {@link cellsWithin}, kept per grid between calls. */
type FloodScratch = {
	/** The search that last reached each cell. */
	readonly stamps: Uint32Array;
	/** Cells waiting to be expanded; its consumed front collects the result. */
	readonly queue: Int32Array;
	/** Identifier of the latest search. */
	search: number;
};

const HALF_PI = Math.PI / 2;
const DEGREES_PER_RADIAN = 180 / Math.PI;
const MAX_SEARCH = 0xffffffff;

const GRIDS = new Map<number, Grid>();
const FLOOD_SCRATCH = new WeakMap<Grid, FloodScratch>();

const dot = (a: Vec3, b: Vec3): number =>
	a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const assertDirection = (direction: Vec3): void => {
	const [x, y, z] = direction;
	const finite = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
	if (!finite || (x === 0 && y === 0 && z === 0)) {
		throw new RangeError(
			`A direction must be a finite, non-zero vector; got (${x}, ${y}, ${z})`,
		);
	}
};

const assertCell = (grid: Grid, cell: number): void => {
	if (!Number.isInteger(cell) || cell < 0 || cell >= grid.cellCount) {
		throw new RangeError(
			`Cell ${cell} is outside the grid of ${grid.cellCount} cells`,
		);
	}
};

const faceAxes = (face: number): FaceAxes => {
	const axes = FACE_AXES[face];
	if (axes === undefined) {
		throw new RangeError(`Face ${face} is not one of 0 to ${FACE_COUNT - 1}`);
	}
	return axes;
};

/** Scales a finite, non-zero vector to unit length without overflow. */
const normalise = (direction: Vec3): Vec3 => {
	const largest = Math.max(
		Math.abs(direction[0]),
		Math.abs(direction[1]),
		Math.abs(direction[2]),
	);
	const x = direction[0] / largest;
	const y = direction[1] / largest;
	const z = direction[2] / largest;
	const length = Math.sqrt(x * x + y * y + z * z);
	return [x / length, y / length, z / length];
};

/**
 * Whether a number is one of the {@link SUPPORTED_RESOLUTIONS}.
 *
 * @param n - Candidate number of cells along a face edge.
 */
export const isSupportedResolution = (n: number): n is Resolution =>
	(SUPPORTED_RESOLUTIONS as readonly number[]).includes(n);

/**
 * The direction of a point given in continuous face coordinates.
 *
 * @param face - Face index, 0 to 5.
 * @param s - Position along the face's `u` axis, 0 to 1.
 * @param t - Position along the face's `v` axis, 0 to 1.
 * @returns The unit vector through that point of the face.
 * @throws RangeError if `face` is not a face index.
 */
export const faceToDirection = (face: number, s: number, t: number): Vec3 => {
	const { normal, u, v } = faceAxes(face);
	const a = Math.tan((s - 0.5) * HALF_PI);
	const b = Math.tan((t - 0.5) * HALF_PI);
	const scale = 1 / Math.sqrt(1 + a * a + b * b);
	return [
		(normal[0] + a * u[0] + b * v[0]) * scale,
		(normal[1] + a * u[1] + b * v[1]) * scale,
		(normal[2] + a * u[2] + b * v[2]) * scale,
	];
};

/**
 * The face a direction passes through and its coordinates on that face: the
 * inverse of {@link faceToDirection}.
 *
 * @remarks
 * A direction exactly on a cube edge or corner belongs to the lowest
 * numbered of the faces it touches, with `s` or `t` exactly 0 or 1.
 *
 * @param direction - Any finite, non-zero vector.
 * @throws RangeError if the direction is zero or not finite.
 */
export const directionToFace = (direction: Vec3): FacePoint => {
	assertDirection(direction);
	const ax = Math.abs(direction[0]);
	const ay = Math.abs(direction[1]);
	const az = Math.abs(direction[2]);
	let face: number;
	if (ax >= ay && ax >= az) {
		face = direction[0] > 0 ? 0 : 1;
	} else if (ay >= az) {
		face = direction[1] > 0 ? 2 : 3;
	} else {
		face = direction[2] > 0 ? 4 : 5;
	}
	const { normal, u, v } = faceAxes(face);
	// The normal picks out the largest component, so both ratios lie in
	// [-1, 1] whatever the vector's length.
	const along = dot(direction, normal);
	return {
		face,
		s: Math.atan(dot(direction, u) / along) / HALF_PI + 0.5,
		t: Math.atan(dot(direction, v) / along) / HALF_PI + 0.5,
	};
};

/**
 * The unit vector at a latitude and longitude.
 *
 * @param latitudeDeg - Latitude in degrees, north positive.
 * @param longitudeDeg - Longitude in degrees, east positive.
 */
export const latLonToDirection = (
	latitudeDeg: number,
	longitudeDeg: number,
): Vec3 => {
	const latitude = latitudeDeg / DEGREES_PER_RADIAN;
	const longitude = longitudeDeg / DEGREES_PER_RADIAN;
	const cosLatitude = Math.cos(latitude);
	return [
		cosLatitude * Math.cos(longitude),
		cosLatitude * Math.sin(longitude),
		Math.sin(latitude),
	];
};

/**
 * The latitude and longitude of a direction, in degrees.
 *
 * @param direction - Any finite, non-zero vector.
 * @returns Latitude in [-90, 90] and longitude in [-180, 180]. At the poles,
 * where longitude is undefined, it is reported as 0.
 * @throws RangeError if the direction is zero or not finite.
 */
export const directionToLatLon = (direction: Vec3): LatLon => {
	assertDirection(direction);
	const [x, y, z] = normalise(direction);
	return {
		latitudeDeg: Math.atan2(z, Math.hypot(x, y)) * DEGREES_PER_RADIAN,
		longitudeDeg: Math.atan2(y, x) * DEGREES_PER_RADIAN,
	};
};

/**
 * The cell just past an edge of its face.
 *
 * @remarks
 * Derived from {@link FACE_AXES} alone. The step leaves the face along one
 * of its axes, and the face whose normal is that axis is the one entered.
 * Seen from the entered face, the face left lies along one of its own axes,
 * so the cell sits in the first or last line of that axis; its other axis
 * runs along the shared edge, either with or against the axis of the face
 * left, which keeps or reverses the position along the edge.
 *
 * @param n - Cells along a face edge.
 * @param face - Face being left.
 * @param side - Side crossed, in neighbour order: `-i`, `+i`, `-j`, `+j`.
 * @param k - The cell's position along the crossed edge: `j` for the `i`
 * sides, `i` for the `j` sides.
 */
const cellAcrossEdge = (
	n: number,
	face: number,
	side: number,
	k: number,
): number => {
	const from = faceAxes(face);
	const sign = side % 2 === 0 ? -1 : 1;
	const crossed = side < 2 ? from.u : from.v;
	const shared = side < 2 ? from.v : from.u;
	const entered = FACE_AXES.findIndex(
		(axes) => dot(axes.normal, crossed) === sign,
	);
	const to = faceAxes(entered);
	const position = (axis: Vec3): number => {
		const towardsFrom = dot(axis, from.normal);
		if (towardsFrom !== 0) {
			return towardsFrom > 0 ? n - 1 : 0;
		}
		return dot(axis, shared) > 0 ? k : n - 1 - k;
	};
	return entered * n * n + position(to.v) * n + position(to.u);
};

const buildCentres = (n: number): Float64Array => {
	const tangents = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		tangents[k] = Math.tan(((k + 0.5) / n - 0.5) * HALF_PI);
	}
	const centres = new Float64Array(3 * FACE_COUNT * n * n);
	let offset = 0;
	for (const { normal, u, v } of FACE_AXES) {
		for (let j = 0; j < n; j++) {
			const b = tangents[j] as number;
			for (let i = 0; i < n; i++) {
				const a = tangents[i] as number;
				const scale = 1 / Math.sqrt(1 + a * a + b * b);
				centres[offset] = (normal[0] + a * u[0] + b * v[0]) * scale;
				centres[offset + 1] = (normal[1] + a * u[1] + b * v[1]) * scale;
				centres[offset + 2] = (normal[2] + a * u[2] + b * v[2]) * scale;
				offset += 3;
			}
		}
	}
	return centres;
};

/**
 * Exact cell areas.
 *
 * @remarks
 * The solid angle of the rectangle from the face centre to the point
 * `(x, y)` of a cube face at unit distance is `atan(x·y / √(1 + x² + y²))`.
 * A cell's area is that function summed over its four corners with
 * alternating sign. Every face has the same areas, so one face is computed
 * and copied to the rest.
 */
const buildAreas = (n: number): Float64Array => {
	const stride = n + 1;
	const tangents = new Float64Array(stride);
	for (let k = 0; k <= n; k++) {
		tangents[k] = Math.tan((k / n - 0.5) * HALF_PI);
	}
	// tan(π/4) rounds to just under 1; the face edges are exactly ±1.
	tangents[0] = -1;
	tangents[n] = 1;
	const corners = new Float64Array(stride * stride);
	for (let j = 0; j <= n; j++) {
		const y = tangents[j] as number;
		for (let i = 0; i <= n; i++) {
			const x = tangents[i] as number;
			corners[j * stride + i] = Math.atan(
				(x * y) / Math.sqrt(1 + x * x + y * y),
			);
		}
	}
	const cellsPerFace = n * n;
	const areas = new Float64Array(FACE_COUNT * cellsPerFace);
	for (let j = 0; j < n; j++) {
		for (let i = 0; i < n; i++) {
			const low = j * stride + i;
			const high = low + stride;
			areas[j * n + i] =
				(corners[high + 1] as number) -
				(corners[high] as number) -
				(corners[low + 1] as number) +
				(corners[low] as number);
		}
	}
	for (let face = 1; face < FACE_COUNT; face++) {
		areas.copyWithin(face * cellsPerFace, 0, cellsPerFace);
	}
	return areas;
};

const buildNeighbours = (n: number): Int32Array => {
	const neighbours = new Int32Array(NEIGHBOUR_COUNT * FACE_COUNT * n * n);
	const last = n - 1;
	let cell = 0;
	for (let face = 0; face < FACE_COUNT; face++) {
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < n; i++) {
				const offset = NEIGHBOUR_COUNT * cell;
				neighbours[offset] = i > 0 ? cell - 1 : cellAcrossEdge(n, face, 0, j);
				neighbours[offset + 1] =
					i < last ? cell + 1 : cellAcrossEdge(n, face, 1, j);
				neighbours[offset + 2] =
					j > 0 ? cell - n : cellAcrossEdge(n, face, 2, i);
				neighbours[offset + 3] =
					j < last ? cell + n : cellAcrossEdge(n, face, 3, i);
				cell++;
			}
		}
	}
	return neighbours;
};

/**
 * The grid geometry for a resolution, built on first use and then shared.
 *
 * @param n - Cells along a face edge; one of {@link SUPPORTED_RESOLUTIONS}.
 * @throws RangeError if `n` is not a supported resolution.
 */
export const getGrid = (n: number): Grid => {
	if (!isSupportedResolution(n)) {
		throw new RangeError(
			`Unsupported grid resolution ${n}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	let grid = GRIDS.get(n);
	if (grid === undefined) {
		grid = {
			n,
			cellCount: FACE_COUNT * n * n,
			cellWidth: HALF_PI / n,
			centres: buildCentres(n),
			areas: buildAreas(n),
			neighbours: buildNeighbours(n),
		};
		GRIDS.set(n, grid);
	}
	return grid;
};

/**
 * The index of the cell at `(face, i, j)`: `face * n * n + j * n + i`.
 *
 * @param grid - The grid the cell belongs to.
 * @param face - Face index, 0 to 5.
 * @param i - Column, 0 to n - 1.
 * @param j - Row, 0 to n - 1.
 * @throws RangeError if any coordinate is out of range or not an integer.
 */
export const cellIndex = (
	grid: Grid,
	face: number,
	i: number,
	j: number,
): number => {
	const { n } = grid;
	const valid =
		Number.isInteger(face) &&
		Number.isInteger(i) &&
		Number.isInteger(j) &&
		face >= 0 &&
		face < FACE_COUNT &&
		i >= 0 &&
		i < n &&
		j >= 0 &&
		j < n;
	if (!valid) {
		throw new RangeError(
			`No cell at face ${face}, i ${i}, j ${j} in a grid of ${n} cells per face edge`,
		);
	}
	return (face * n + j) * n + i;
};

/**
 * The face and coordinates of a cell: the inverse of {@link cellIndex}.
 *
 * @param grid - The grid the cell belongs to.
 * @param cell - Cell index.
 * @throws RangeError if `cell` is not a cell of the grid.
 */
export const cellCoords = (grid: Grid, cell: number): CellCoords => {
	assertCell(grid, cell);
	const { n } = grid;
	const row = Math.floor(cell / n);
	return { face: Math.floor(row / n), i: cell % n, j: row % n };
};

/**
 * The centre of a cell as a unit vector.
 *
 * @param grid - The grid the cell belongs to.
 * @param cell - Cell index.
 * @returns A new tuple; loops over many cells should read
 * {@link Grid.centres} instead.
 * @throws RangeError if `cell` is not a cell of the grid.
 */
export const cellCentre = (grid: Grid, cell: number): Vec3 => {
	assertCell(grid, cell);
	const { centres } = grid;
	const offset = 3 * cell;
	return [
		centres[offset] as number,
		centres[offset + 1] as number,
		centres[offset + 2] as number,
	];
};

/**
 * The exact area of a cell on the unit sphere, in steradians.
 *
 * @param grid - The grid the cell belongs to.
 * @param cell - Cell index.
 * @throws RangeError if `cell` is not a cell of the grid.
 */
export const cellArea = (grid: Grid, cell: number): number => {
	assertCell(grid, cell);
	return grid.areas[cell] as number;
};

/**
 * The four cells sharing an edge with a cell, including across cube edges.
 *
 * @param grid - The grid the cell belongs to.
 * @param cell - Cell index.
 * @returns A new tuple in the order `-i`, `+i`, `-j`, `+j`; loops over many
 * cells should read {@link Grid.neighbours} instead.
 * @throws RangeError if `cell` is not a cell of the grid.
 */
export const neighbours = (grid: Grid, cell: number): CellNeighbours => {
	assertCell(grid, cell);
	const { neighbours: all } = grid;
	const offset = NEIGHBOUR_COUNT * cell;
	return [
		all[offset] as number,
		all[offset + 1] as number,
		all[offset + 2] as number,
		all[offset + 3] as number,
	];
};

/**
 * The cell a direction falls in.
 *
 * @remarks
 * Every finite, non-zero direction maps to exactly one cell. A direction on
 * a boundary between cells of one face may resolve to either cell, depending
 * on rounding; one on a cube edge or corner belongs to the lowest numbered
 * face it touches.
 *
 * @param grid - The grid to search.
 * @param direction - Any finite, non-zero vector.
 * @throws RangeError if the direction is zero or not finite.
 */
export const cellAt = (grid: Grid, direction: Vec3): number => {
	const { n } = grid;
	const { face, s, t } = directionToFace(direction);
	const i = Math.min(n - 1, Math.max(0, Math.floor(s * n)));
	const j = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
	return (face * n + j) * n + i;
};

const floodScratch = (grid: Grid): FloodScratch => {
	let scratch = FLOOD_SCRATCH.get(grid);
	if (scratch === undefined) {
		scratch = {
			stamps: new Uint32Array(grid.cellCount),
			queue: new Int32Array(grid.cellCount),
			search: 0,
		};
		FLOOD_SCRATCH.set(grid, scratch);
	}
	return scratch;
};

/**
 * The square of the straight-line distance between two unit vectors that
 * are `angle` apart, or infinity once the angle covers the whole sphere.
 */
const chordSquared = (angle: number): number => {
	if (angle >= Math.PI) {
		return Number.POSITIVE_INFINITY;
	}
	const chord = 2 * Math.sin(angle / 2);
	return chord * chord;
};

/**
 * Every cell whose centre lies within an angular radius of a direction.
 *
 * @remarks
 * Membership is decided by the cell's centre alone, boundary included: a
 * cell the cap only clips is left out, and a radius smaller than the cells
 * may select nothing.
 *
 * The search floods outwards from the cell containing the direction, so its
 * cost follows the size of the cap rather than the size of the grid. It
 * spreads through every cell whose centre is within the radius plus one
 * cell width. Those cells are connected: the arc from the direction to any
 * selected centre crosses only cells with a centre within a cell width of
 * the arc, and where the arc passes through a corner shared by two cells
 * that do not share an edge, the other cells at that corner bridge them.
 *
 * @param grid - The grid to search.
 * @param direction - Centre of the cap; any finite, non-zero vector.
 * @param radius - Angular radius in radians, from 0; π or more selects
 * every cell.
 * @returns A new array of cell indices in no particular order, owned by the
 * caller.
 * @throws RangeError if the direction is zero or not finite, or the radius
 * is negative or not a number.
 */
export const cellsWithin = (
	grid: Grid,
	direction: Vec3,
	radius: number,
): Int32Array => {
	assertDirection(direction);
	if (!(radius >= 0)) {
		throw new RangeError(
			`A radius must be zero or more radians; got ${radius}`,
		);
	}
	const [x, y, z] = normalise(direction);
	const { centres, neighbours: all } = grid;
	const scratch = floodScratch(grid);
	const { stamps, queue } = scratch;
	if (scratch.search === MAX_SEARCH) {
		stamps.fill(0);
		scratch.search = 0;
	}
	scratch.search++;
	const search = scratch.search;
	const inside = chordSquared(radius);
	const reach = chordSquared(radius + grid.cellWidth);

	const start = cellAt(grid, direction);
	stamps[start] = search;
	queue[0] = start;
	let head = 0;
	let tail = 1;
	let count = 0;
	while (head < tail) {
		const cell = queue[head] as number;
		head++;
		const offset = 3 * cell;
		const dx = (centres[offset] as number) - x;
		const dy = (centres[offset + 1] as number) - y;
		const dz = (centres[offset + 2] as number) - z;
		const distanceSquared = dx * dx + dy * dy + dz * dz;
		if (distanceSquared > reach) {
			continue;
		}
		if (distanceSquared <= inside) {
			// Fewer cells are selected than consumed, so the front of the
			// queue is free to hold the result.
			queue[count] = cell;
			count++;
		}
		const first = NEIGHBOUR_COUNT * cell;
		for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
			const neighbour = all[first + side] as number;
			if (stamps[neighbour] !== search) {
				stamps[neighbour] = search;
				queue[tail] = neighbour;
				tail++;
			}
		}
	}
	return queue.slice(0, count);
};
