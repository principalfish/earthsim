import { describe, expect, it } from 'vitest';
import {
	cellAt,
	type Grid,
	getGrid,
	latLonToDirection,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import { cellLatitudes } from './insolation';
import {
	cellFrames,
	createEastNorthFrame,
	createVectorField,
	curl,
	divergence,
	fromEastNorth,
	gradient,
	laplacian,
	SMOOTHING_STEPS,
	smoothField,
	toEastNorth,
	type VectorField,
	writeEastNorthFrame,
} from './vector';
import { PLANET_RADIUS_KM } from './world';

type Triple = [number, number, number];

/** A field given by a function of each cell's centre, on a grid. */
const fieldOf = (
	grid: Grid,
	value: (x: number, y: number, z: number) => number,
): Float64Array => {
	const field = new Float64Array(grid.cellCount);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		field[cell] = value(
			grid.centres[3 * cell] as number,
			grid.centres[3 * cell + 1] as number,
			grid.centres[3 * cell + 2] as number,
		);
	}
	return field;
};

/** A vector field given by a function of each cell's centre, on a grid. */
const vectorsOf = (
	grid: Grid,
	value: (x: number, y: number, z: number) => Triple,
): VectorField => {
	const vectors = createVectorField(grid);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const [x, y, z] = value(
			grid.centres[3 * cell] as number,
			grid.centres[3 * cell + 1] as number,
			grid.centres[3 * cell + 2] as number,
		);
		vectors.x[cell] = x;
		vectors.y[cell] = y;
		vectors.z[cell] = z;
	}
	return vectors;
};

/** The length of the difference between two vector fields at a cell. */
const vectorError = (a: VectorField, b: VectorField, cell: number): number =>
	Math.hypot(
		(a.x[cell] as number) - (b.x[cell] as number),
		(a.y[cell] as number) - (b.y[cell] as number),
		(a.z[cell] as number) - (b.z[cell] as number),
	);

/** The largest magnitude in a field. */
const largest = (field: ArrayLike<number>): number => {
	let most = 0;
	for (let cell = 0; cell < field.length; cell++) {
		most = Math.max(most, Math.abs(field[cell] as number));
	}
	return most;
};

/** The area-weighted mean of a field. */
const areaMean = (grid: Grid, field: ArrayLike<number>): number => {
	let total = 0;
	let area = 0;
	for (let cell = 0; cell < grid.cellCount; cell++) {
		total += (grid.areas[cell] as number) * (field[cell] as number);
		area += grid.areas[cell] as number;
	}
	return total / area;
};

/** A small seeded generator (mulberry32) so random cases repeat exactly. */
const createRandom = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
};

/** The surface part of a vector at a point of the unit sphere. */
const tangent = (v: Triple, x: number, y: number, z: number): Triple => {
	const outward = v[0] * x + v[1] * y + v[2] * z;
	return [v[0] - outward * x, v[1] - outward * y, v[2] - outward * z];
};

/**
 * A spherical harmonic of degree 2, set at an angle to the cube's axes: a
 * harmonic polynomial, so its surface Laplacian is −6 times itself.
 */
const harmonic2 = (x: number, y: number, z: number): number =>
	x * y + 2 * y * z - 0.5 * z * x + 0.3 * (x * x - y * y);

/** The gradient in three dimensions of {@link harmonic2}. */
const harmonic2Gradient = (x: number, y: number, z: number): Triple => [
	y - 0.5 * z + 0.6 * x,
	x + 2 * z - 0.6 * y,
	2 * y - 0.5 * x,
];

/** A spherical harmonic of degree 3: its surface Laplacian is −12 times it. */
const harmonic3 = (x: number, y: number, z: number): number =>
	x * y * z + 0.5 * (x * x * x - 3 * x * y * y);

/** The gradient in three dimensions of {@link harmonic3}. */
const harmonic3Gradient = (x: number, y: number, z: number): Triple => [
	y * z + 1.5 * (x * x - y * y),
	x * z - 3 * x * y,
	x * y,
];

/** The surface gradient of {@link harmonic2}. */
const surfaceGradient2 = (x: number, y: number, z: number): Triple =>
	tangent(harmonic2Gradient(x, y, z), x, y, z);

/**
 * A flow with both a divergence and a curl: the surface gradient of
 * {@link harmonic2}, divergence −6 times it, plus the radial direction
 * crossed with the surface gradient of {@link harmonic3}, curl −12 times it.
 */
const mixedFlow = (x: number, y: number, z: number): Triple => {
	const [ax, ay, az] = surfaceGradient2(x, y, z);
	const [bx, by, bz] = tangent(harmonic3Gradient(x, y, z), x, y, z);
	return [
		ax + (y * bz - z * by),
		ay + (z * bx - x * bz),
		az + (x * by - y * bx),
	];
};

/** A solid body turning about +Z at a rate. */
const solidBody =
	(rate: number) =>
	(x: number, y: number, _z: number): Triple => [-rate * y, rate * x, 0];

/** The sin φ field and its surface gradient, northward and of size cos φ. */
const sinLatitude = (_x: number, _y: number, z: number): number => z;
const sinLatitudeGradient = (x: number, y: number, z: number): Triple => [
	-z * x,
	-z * y,
	1 - z * z,
];

type Errors = {
	/** Cells at least an eighth of a face from every face edge. */
	readonly interior: number;
	/**
	 * Cells between the outermost rows and the interior, where the
	 * stencils that reach across a cube edge are used too.
	 */
	readonly nearEdge: number;
	/** Cells in a face's outermost rows, not at a corner. */
	readonly edge: number;
	/** The cells in the corners of the faces, where three faces meet. */
	readonly corner: number;
};

/** The largest of an error over each kind of cell. */
const errorsByPlace = (grid: Grid, error: (cell: number) => number): Errors => {
	const { n } = grid;
	let interior = 0;
	let nearEdge = 0;
	let edge = 0;
	let corner = 0;
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const i = cell % n;
		const j = Math.floor(cell / n) % n;
		const inward = Math.min(i, j, n - 1 - i, n - 1 - j);
		const value = error(cell);
		if ((i === 0 || i === n - 1) && (j === 0 || j === n - 1)) {
			corner = Math.max(corner, value);
		} else if (inward === 0) {
			edge = Math.max(edge, value);
		} else if (inward >= n / 8) {
			interior = Math.max(interior, value);
		} else {
			nearEdge = Math.max(nearEdge, value);
		}
	}
	return { interior, nearEdge, edge, corner };
};

describe('writeEastNorthFrame', () => {
	it('gives east and north at a latitude and longitude', () => {
		const frame = createEastNorthFrame();
		const latitude = (30 * Math.PI) / 180;
		const longitude = (120 * Math.PI) / 180;
		writeEastNorthFrame(
			Math.sin(latitude),
			Math.cos(latitude),
			Math.sin(longitude),
			Math.cos(longitude),
			frame,
		);
		expect(frame.eastX).toBeCloseTo(-Math.sqrt(3) / 2, 15);
		expect(frame.eastY).toBeCloseTo(-0.5, 15);
		expect(frame.northX).toBeCloseTo(0.25, 15);
		expect(frame.northY).toBeCloseTo(-Math.sqrt(3) / 4, 15);
		expect(frame.northZ).toBeCloseTo(Math.sqrt(3) / 2, 15);
	});

	it('gives the limits along the meridian at a pole', () => {
		const frame = createEastNorthFrame();
		// The North Pole approached along 90° east: north points back along
		// the meridian of 90° west, −y.
		writeEastNorthFrame(1, 0, 1, 0, frame);
		expect(frame).toEqual({
			eastX: -1,
			eastY: 0,
			northX: -0,
			northY: -1,
			northZ: 0,
		});
	});
});

describe('cellFrames', () => {
	it('gives east and north of unit length, perpendicular to each other and to the centre, at every cell', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const grid = getGrid(resolution);
			const { east, north } = cellFrames(grid);
			let worst = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				const cx = grid.centres[3 * cell] as number;
				const cy = grid.centres[3 * cell + 1] as number;
				const cz = grid.centres[3 * cell + 2] as number;
				const ex = east.x[cell] as number;
				const ey = east.y[cell] as number;
				const ez = east.z[cell] as number;
				const nx = north.x[cell] as number;
				const ny = north.y[cell] as number;
				const nz = north.z[cell] as number;
				worst = Math.max(
					worst,
					Math.abs(ex * ex + ey * ey + ez * ez - 1),
					Math.abs(nx * nx + ny * ny + nz * nz - 1),
					Math.abs(ex * nx + ey * ny + ez * nz),
					Math.abs(ex * cx + ey * cy + ez * cz),
					Math.abs(nx * cx + ny * cy + nz * cz),
				);
				// North rises towards +Z, and east, north and up turn right-handed.
				const handedness =
					(ey * nz - ez * ny) * cx +
					(ez * nx - ex * nz) * cy +
					(ex * ny - ey * nx) * cz;
				if (!(nz >= 0) || !(handedness > 0) || ez !== 0) {
					throw new Error(`cell ${cell} has a frame the wrong way round`);
				}
			}
			expect(worst, `${resolution}`).toBeLessThan(1e-15);
		}
	}, 60_000);

	it.each([
		[1, 'north'],
		[-1, 'south'],
	])(
		'takes longitude 0° for a centre exactly at the pole, z = %d (%s)',
		(z) => {
			// A grid of one cell, which is all cellFrames reads.
			const pole = {
				centres: new Float64Array([0, 0, z]),
				cellCount: 1,
			} as unknown as Grid;
			const { east, north } = cellFrames(pole);
			const frame = createEastNorthFrame();
			writeEastNorthFrame(z, 0, 0, 1, frame);
			expect([east.x[0], east.y[0], east.z[0]]).toEqual([
				frame.eastX,
				frame.eastY,
				0,
			]);
			expect([north.x[0], north.y[0], north.z[0]]).toEqual([
				frame.northX,
				frame.northY,
				frame.northZ,
			]);
		},
	);

	it('is the frame of each centre’s latitude and longitude, shared per grid', () => {
		const grid = getGrid(64);
		const frames = cellFrames(grid);
		expect(cellFrames(grid)).toBe(frames);
		const latitudes = cellLatitudes(grid);
		const frame = createEastNorthFrame();
		for (let cell = 0; cell < grid.cellCount; cell += 97) {
			const latitude = ((latitudes[cell] as number) * Math.PI) / 180;
			const longitude = Math.atan2(
				grid.centres[3 * cell + 1] as number,
				grid.centres[3 * cell] as number,
			);
			writeEastNorthFrame(
				Math.sin(latitude),
				Math.cos(latitude),
				Math.sin(longitude),
				Math.cos(longitude),
				frame,
			);
			expect(frames.east.x[cell]).toBeCloseTo(frame.eastX, 14);
			expect(frames.east.y[cell]).toBeCloseTo(frame.eastY, 14);
			expect(frames.north.x[cell]).toBeCloseTo(frame.northX, 14);
			expect(frames.north.y[cell]).toBeCloseTo(frame.northY, 14);
			expect(frames.north.z[cell]).toBeCloseTo(frame.northZ, 14);
		}
	});
});

describe('toEastNorth and fromEastNorth', () => {
	const grid = getGrid(64);
	const random = createRandom(7);
	const components = {
		east: Float64Array.from(
			{ length: grid.cellCount },
			() => 20 * random() - 10,
		),
		north: Float64Array.from(
			{ length: grid.cellCount },
			() => 20 * random() - 10,
		),
	};

	it('give back the components and the vectors they were made from', () => {
		const vectors = fromEastNorth(grid, components);
		const back = toEastNorth(grid, vectors);
		let worst = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			worst = Math.max(
				worst,
				Math.abs(
					(back.east[cell] as number) - (components.east[cell] as number),
				),
				Math.abs(
					(back.north[cell] as number) - (components.north[cell] as number),
				),
			);
		}
		expect(worst).toBeLessThan(1e-13);
		const again = fromEastNorth(grid, back);
		let vectorWorst = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			vectorWorst = Math.max(vectorWorst, vectorError(again, vectors, cell));
		}
		expect(vectorWorst).toBeLessThan(1e-13);
	});

	it('make tangent vectors, and drop any part of a vector off the surface', () => {
		const vectors = fromEastNorth(grid, components);
		const outward = vectorsOf(grid, (x, y, z) => [x, y, z]);
		const { east, north } = toEastNorth(grid, outward);
		expect(largest(east)).toBeLessThan(1e-15);
		expect(largest(north)).toBeLessThan(1e-15);
		let radial = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			radial = Math.max(
				radial,
				Math.abs(
					(vectors.x[cell] as number) * (grid.centres[3 * cell] as number) +
						(vectors.y[cell] as number) *
							(grid.centres[3 * cell + 1] as number) +
						(vectors.z[cell] as number) *
							(grid.centres[3 * cell + 2] as number),
				),
			);
		}
		expect(radial).toBeLessThan(1e-13);
	});

	it('write into the arrays given', () => {
		const into = createVectorField(grid);
		expect(fromEastNorth(grid, components, into)).toBe(into);
		const back = {
			east: new Float64Array(grid.cellCount),
			north: new Float64Array(grid.cellCount),
		};
		expect(toEastNorth(grid, into, back)).toBe(back);
	});

	it('refuse arrays of the wrong length', () => {
		const vectors = createVectorField(grid);
		expect(() =>
			toEastNorth(grid, { ...vectors, z: new Float64Array(3) }),
		).toThrow(RangeError);
		expect(() =>
			toEastNorth(grid, vectors, {
				east: new Float64Array(grid.cellCount),
				north: new Float64Array(3),
			}),
		).toThrow(RangeError);
		expect(() =>
			fromEastNorth(grid, { east: components.east, north: [1, 2] }),
		).toThrow(RangeError);
		expect(() =>
			fromEastNorth(grid, components, createVectorField(getGrid(128))),
		).toThrow(RangeError);
	});
});

describe('gradient', () => {
	it.each([
		[64, 2e-4],
		[128, 5e-5],
	])(
		'of sin(latitude) at %d points north, of size cos(latitude), to within %f',
		(resolution, bound) => {
			const grid = getGrid(resolution);
			const result = gradient(grid, fieldOf(grid, sinLatitude));
			const exact = vectorsOf(grid, sinLatitudeGradient);
			const { north } = toEastNorth(grid, result);
			const latitudes = cellLatitudes(grid);
			let worst = 0;
			let northWorst = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				worst = Math.max(worst, vectorError(result, exact, cell));
				northWorst = Math.max(
					northWorst,
					Math.abs(
						(north[cell] as number) -
							Math.cos(((latitudes[cell] as number) * Math.PI) / 180),
					),
				);
			}
			expect(worst).toBeLessThan(bound);
			expect(northWorst).toBeLessThan(bound);
		},
	);

	it('of a constant is exactly zero', () => {
		const grid = getGrid(64);
		const result = gradient(
			grid,
			new Float64Array(grid.cellCount).fill(1013.25),
		);
		expect(largest(result.x)).toBe(0);
		expect(largest(result.y)).toBe(0);
		expect(largest(result.z)).toBe(0);
	});

	it('is per unit of the radius given, tangent to the sphere, and written into the arrays given', () => {
		const grid = getGrid(64);
		const field = fieldOf(grid, harmonic2);
		const perRadian = gradient(grid, field);
		const into = createVectorField(grid);
		const radius = PLANET_RADIUS_KM * 1000;
		expect(gradient(grid, field, radius, into)).toBe(into);
		let worst = 0;
		let radial = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			worst = Math.max(
				worst,
				Math.abs(
					(into.x[cell] as number) * radius - (perRadian.x[cell] as number),
				),
				Math.abs(
					(into.y[cell] as number) * radius - (perRadian.y[cell] as number),
				),
				Math.abs(
					(into.z[cell] as number) * radius - (perRadian.z[cell] as number),
				),
			);
			radial = Math.max(
				radial,
				Math.abs(
					(perRadian.x[cell] as number) * (grid.centres[3 * cell] as number) +
						(perRadian.y[cell] as number) *
							(grid.centres[3 * cell + 1] as number) +
						(perRadian.z[cell] as number) *
							(grid.centres[3 * cell + 2] as number),
				),
			);
		}
		expect(worst).toBeLessThan(1e-13);
		expect(radial).toBeLessThan(1e-15);
	});

	it('refuses a field or an output of the wrong length, an output that holds the field, and a radius that is not positive', () => {
		const grid = getGrid(64);
		const field = new Float64Array(grid.cellCount);
		for (const component of ['x', 'y', 'z'] as const) {
			const into = { ...createVectorField(grid), [component]: field };
			expect(() => gradient(grid, field, 1, into), component).toThrow(
				RangeError,
			);
		}
		expect(() => gradient(grid, new Float64Array(5))).toThrow(RangeError);
		expect(() =>
			gradient(grid, field, 1, {
				...createVectorField(grid),
				y: new Float64Array(5),
			}),
		).toThrow(RangeError);
		for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => gradient(grid, field, radius), `${radius}`).toThrow(
				RangeError,
			);
		}
	});
});

describe('divergence and curl', () => {
	it.each([64, 128])(
		'of a solid body turning about +Z at %d: no divergence, and a curl of twice the rate times sin(latitude)',
		(resolution) => {
			const grid = getGrid(resolution);
			const rate = 7.29e-5;
			const flow = vectorsOf(grid, solidBody(rate));
			const spread = divergence(grid, flow);
			const turning = curl(grid, flow);
			// Not zero exactly, as the grid's lines do not follow the flow.
			expect(largest(spread) / (2 * rate)).toBeLessThan(
				resolution === 64 ? 1e-4 : 2.5e-5,
			);
			let worst = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				worst = Math.max(
					worst,
					Math.abs(
						(turning[cell] as number) -
							2 * rate * (grid.centres[3 * cell + 2] as number),
					),
				);
			}
			expect(worst / (2 * rate)).toBeLessThan(resolution === 64 ? 2e-4 : 5e-5);
		},
	);

	it.each([
		[64, 2e-4, 3e-4],
		[128, 5e-5, 8e-5],
	])(
		'of a flow with both at %d match their analytic values to within %f and %f of their largest',
		(resolution, divergenceBound, curlBound) => {
			const grid = getGrid(resolution);
			const flow = vectorsOf(grid, mixedFlow);
			const spread = divergence(grid, flow);
			const turning = curl(grid, flow);
			const exactSpread = fieldOf(grid, (x, y, z) => -6 * harmonic2(x, y, z));
			const exactTurning = fieldOf(grid, (x, y, z) => -12 * harmonic3(x, y, z));
			let spreadWorst = 0;
			let turningWorst = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				spreadWorst = Math.max(
					spreadWorst,
					Math.abs((spread[cell] as number) - (exactSpread[cell] as number)),
				);
				turningWorst = Math.max(
					turningWorst,
					Math.abs((turning[cell] as number) - (exactTurning[cell] as number)),
				);
			}
			expect(spreadWorst / largest(exactSpread)).toBeLessThan(divergenceBound);
			expect(turningWorst / largest(exactTurning)).toBeLessThan(curlBound);
		},
	);

	it('composed as the divergence of the gradient, match the Laplacian of a spherical harmonic inside the faces, but only to first order beside the cube edges', () => {
		// laplacian is the operator for a Laplacian; this is how far the
		// composition of the two falls short of it.
		const bounds: Record<number, { interior: number; seam: number }> = {
			64: { interior: 3.5e-4, seam: 5e-3 },
			128: { interior: 9e-5, seam: 2.5e-3 },
		};
		let previousSeam = Number.POSITIVE_INFINITY;
		for (const resolution of [64, 128]) {
			const grid = getGrid(resolution);
			const field = fieldOf(grid, harmonic2);
			const composed = divergence(grid, gradient(grid, field));
			const scale = 6 * largest(field);
			const errors = errorsByPlace(
				grid,
				(cell) =>
					Math.abs((composed[cell] as number) + 6 * (field[cell] as number)) /
					scale,
			);
			const bound = bounds[resolution] as { interior: number; seam: number };
			expect(errors.interior, `${resolution}`).toBeLessThan(bound.interior);
			// In the rows on the cube edges the composition is only first
			// order: its error halves when the grid doubles.
			const seam = Math.max(errors.edge, errors.corner);
			expect(seam, `${resolution}`).toBeLessThan(bound.seam);
			expect(seam, `${resolution}`).toBeLessThan(0.6 * previousSeam);
			previousSeam = seam;
		}
	}, 60_000);

	it('sum to zero over the sphere, weighted by the cells’ areas, for any flow', () => {
		const grid = getGrid(64);
		const random = createRandom(11);
		const flow = vectorsOf(grid, (x, y, z) =>
			tangent([random() - 0.5, random() - 0.5, random() - 0.5], x, y, z),
		);
		for (const result of [divergence(grid, flow), curl(grid, flow)]) {
			let total = 0;
			let size = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				total += (grid.areas[cell] as number) * (result[cell] as number);
				size += (grid.areas[cell] as number) * Math.abs(result[cell] as number);
			}
			expect(Math.abs(total) / size).toBeLessThan(1e-14);
		}
	});

	it('are per unit of the radius given, written into the array given', () => {
		const grid = getGrid(64);
		const flow = vectorsOf(grid, mixedFlow);
		const radius = PLANET_RADIUS_KM * 1000;
		for (const operator of [divergence, curl]) {
			const perRadian = operator(grid, flow);
			const into = new Float64Array(grid.cellCount);
			expect(operator(grid, flow, radius, into)).toBe(into);
			let worst = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				worst = Math.max(
					worst,
					Math.abs(
						(into[cell] as number) * radius - (perRadian[cell] as number),
					),
				);
			}
			expect(worst).toBeLessThan(1e-12);
		}
	});

	it('refuse a flow or an output of the wrong length, an output that is the input, and a radius that is not positive', () => {
		const grid = getGrid(64);
		const flow = createVectorField(grid);
		for (const operator of [divergence, curl]) {
			expect(() => operator(grid, { ...flow, x: new Float64Array(5) })).toThrow(
				RangeError,
			);
			expect(() => operator(grid, flow, 1, new Float64Array(5))).toThrow(
				RangeError,
			);
			expect(() => operator(grid, flow, 1, flow.y)).toThrow(RangeError);
			expect(() => operator(grid, flow, 0)).toThrow(RangeError);
		}
	});
});

describe('laplacian', () => {
	/** The degree-2 and degree-3 harmonics and their degrees. */
	const HARMONICS = [
		[2, harmonic2],
		[3, harmonic3],
	] as const;

	/**
	 * The error of the Laplacian of a harmonic over its largest, −l(l + 1)
	 * times the harmonic's largest, by place.
	 */
	const laplacianErrors = (
		grid: Grid,
		degree: number,
		harmonic: (x: number, y: number, z: number) => number,
	): Errors => {
		const field = fieldOf(grid, harmonic);
		const result = laplacian(grid, field);
		const factor = degree * (degree + 1);
		const scale = factor * largest(field);
		return errorsByPlace(
			grid,
			(cell) =>
				Math.abs((result[cell] as number) + factor * (field[cell] as number)) /
				scale,
		);
	};

	it('of a constant is exactly zero', () => {
		const grid = getGrid(64);
		const result = laplacian(
			grid,
			new Float64Array(grid.cellCount).fill(288.15),
		);
		expect(largest(result)).toBe(0);
	});

	it.each([
		[64, 2e-4, 3.5e-4],
		[128, 5e-5, 8e-5],
	])(
		'matches −l(l + 1) times spherical harmonics of degree 2 and 3 at %d, to within %f and %f of the largest',
		(resolution, bound2, bound3) => {
			const grid = getGrid(resolution);
			for (const [degree, harmonic] of HARMONICS) {
				const { interior, nearEdge, edge, corner } = laplacianErrors(
					grid,
					degree,
					harmonic,
				);
				expect(
					Math.max(interior, nearEdge, edge, corner),
					`degree ${degree}`,
				).toBeLessThan(degree === 2 ? bound2 : bound3);
			}
		},
	);

	it('is second order everywhere, and near and on cube edges and at corners within 1.5 times its error well inside the faces', () => {
		// Measured at 64, 128 and 256: at most 1.04 times in the rows near
		// the edges, 1.12 times on the edges and at the corners, and a
		// quarter of the error when the grid doubles.
		const previous = new Map<number, Errors>();
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const grid = getGrid(resolution);
			for (const [degree, harmonic] of HARMONICS) {
				const errors = laplacianErrors(grid, degree, harmonic);
				const label = `degree ${degree} at ${resolution}`;
				expect(errors.nearEdge, label).toBeLessThan(1.5 * errors.interior);
				expect(errors.edge, label).toBeLessThan(1.5 * errors.interior);
				expect(errors.corner, label).toBeLessThan(1.5 * errors.interior);
				const before = previous.get(degree);
				if (before !== undefined) {
					for (const place of [
						'interior',
						'nearEdge',
						'edge',
						'corner',
					] as const) {
						expect(errors[place], `${label}, ${place}`).toBeLessThan(
							0.3 * before[place],
						);
					}
				}
				previous.set(degree, errors);
			}
		}
	}, 60_000);

	it('sums to zero over the sphere, weighted by the cells’ areas, for any field', () => {
		const grid = getGrid(64);
		const random = createRandom(5);
		const result = laplacian(
			grid,
			Float64Array.from({ length: grid.cellCount }, () => random() - 0.5),
		);
		let total = 0;
		let size = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			total += (grid.areas[cell] as number) * (result[cell] as number);
			size += (grid.areas[cell] as number) * Math.abs(result[cell] as number);
		}
		expect(Math.abs(total) / size).toBeLessThan(1e-14);
	});

	it('is per unit of the radius given, squared, written into the array given', () => {
		const grid = getGrid(64);
		const field = fieldOf(grid, harmonic3);
		const perRadian = laplacian(grid, field);
		const radius = PLANET_RADIUS_KM * 1000;
		const into = new Float64Array(grid.cellCount);
		expect(laplacian(grid, field, radius, into)).toBe(into);
		let worst = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			worst = Math.max(
				worst,
				Math.abs(
					(into[cell] as number) * radius * radius -
						(perRadian[cell] as number),
				),
			);
		}
		expect(worst / largest(perRadian)).toBeLessThan(1e-14);
	});

	it('refuses a field or an output of the wrong length, an output that is the field, and a radius that is not positive', () => {
		const grid = getGrid(64);
		const field = new Float64Array(grid.cellCount);
		expect(() => laplacian(grid, new Float64Array(5))).toThrow(RangeError);
		expect(() => laplacian(grid, field, 1, new Float64Array(5))).toThrow(
			RangeError,
		);
		expect(() => laplacian(grid, field, 1, field)).toThrow(RangeError);
		for (const radius of [0, -2, Number.NaN]) {
			expect(() => laplacian(grid, field, radius), `${radius}`).toThrow(
				RangeError,
			);
		}
	});
});

describe('the operators on cube edges and at corners', () => {
	/**
	 * The largest error in the rows near the cube edges, on them and at the
	 * corners, each over the largest well inside the faces, measured at 64,
	 * 128 and 256 cells per face edge: gradient 1.18, 1.19 and 1.21,
	 * divergence 1.09, 1.11 and 1.04, curl 1.29, 1.31 and 0.98, at most.
	 */
	const FACTOR = 1.5;

	it('are no less accurate than well inside the faces, and second order everywhere', () => {
		const previous = new Map<string, Errors>();
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const grid = getGrid(resolution);
			const field = fieldOf(grid, harmonic2);
			const flow = vectorsOf(grid, mixedFlow);
			const exactGradient = vectorsOf(grid, surfaceGradient2);
			const exactSpread = fieldOf(grid, (x, y, z) => -6 * harmonic2(x, y, z));
			const exactTurning = fieldOf(grid, (x, y, z) => -12 * harmonic3(x, y, z));
			const slope = gradient(grid, field);
			const spread = divergence(grid, flow);
			const turning = curl(grid, flow);
			const measured: Record<string, Errors> = {
				gradient: errorsByPlace(grid, (cell) =>
					vectorError(slope, exactGradient, cell),
				),
				divergence: errorsByPlace(grid, (cell) =>
					Math.abs((spread[cell] as number) - (exactSpread[cell] as number)),
				),
				curl: errorsByPlace(grid, (cell) =>
					Math.abs((turning[cell] as number) - (exactTurning[cell] as number)),
				),
			};
			for (const [name, errors] of Object.entries(measured)) {
				const label = `${name} at ${resolution}`;
				expect(errors.nearEdge, label).toBeLessThan(FACTOR * errors.interior);
				expect(errors.edge, label).toBeLessThan(FACTOR * errors.interior);
				expect(errors.corner, label).toBeLessThan(FACTOR * errors.interior);
				const before = previous.get(name);
				if (before !== undefined) {
					// Second order: a quarter of the error when the grid doubles.
					for (const place of [
						'interior',
						'nearEdge',
						'edge',
						'corner',
					] as const) {
						expect(errors[place], `${label}, ${place}`).toBeLessThan(
							0.3 * before[place],
						);
					}
				}
				previous.set(name, errors);
			}
		}
	}, 60_000);
});

describe('smoothField', () => {
	const grid = getGrid(64);
	const random = createRandom(3);
	const noisy = Float64Array.from(
		{ length: grid.cellCount },
		() => 1000 + 40 * random(),
	);

	it('keeps the area-weighted mean', () => {
		for (const km of [100, 800, 5000]) {
			const smoothed = smoothField(grid, noisy, km);
			expect(
				Math.abs(areaMean(grid, smoothed) - areaMean(grid, noisy)),
				`${km}`,
			).toBeLessThan(1e-10);
			expect(largest(smoothed)).toBeLessThan(largest(noisy));
		}
	});

	it('leaves a constant field as it is', () => {
		const constant = new Float64Array(grid.cellCount).fill(101_325);
		expect(smoothField(grid, constant, 1500)).toEqual(constant);
	});

	it('refuses a distance too short or too long for a step, before anything is set', () => {
		const fine = getGrid(128);
		const field = Float64Array.from({ length: fine.cellCount }, (_, cell) =>
			Math.sin(cell / 1000),
		);
		const copy = Float64Array.from(field);
		const into = new Float64Array(fine.cellCount).fill(7);
		for (const km of [1e-160, 1e160]) {
			expect(() => smoothField(fine, field, km, into), `${km}`).toThrow(
				RangeError,
			);
			expect(into.every((value) => value === 7)).toBe(true);
		}
		const first = smoothField(fine, field, 100);
		expect(() => smoothField(fine, field, 1e-160)).toThrow(RangeError);
		expect(smoothField(fine, field, 100)).toEqual(first);
		expect(field).toEqual(copy);
	}, 60_000);

	/**
	 * The root-mean-square distance on the surface a spike is spread to,
	 * over √2 times the distance smoothed over.
	 */
	const spikeSpread = (
		resolution: number,
		latitudeDeg: number,
		longitudeDeg: number,
		km: number,
	): number => {
		const on = getGrid(resolution);
		const direction = latLonToDirection(latitudeDeg, longitudeDeg);
		const spike = new Float64Array(on.cellCount);
		const start = cellAt(on, direction);
		spike[start] = 1 / (on.areas[start] as number);
		const smoothed = smoothField(on, spike, km);
		let moment = 0;
		let total = 0;
		for (let cell = 0; cell < on.cellCount; cell++) {
			const along =
				(on.centres[3 * cell] as number) * direction[0] +
				(on.centres[3 * cell + 1] as number) * direction[1] +
				(on.centres[3 * cell + 2] as number) * direction[2];
			const distance = Math.acos(Math.min(1, along)) * PLANET_RADIUS_KM;
			const weight = (on.areas[cell] as number) * (smoothed[cell] as number);
			moment += weight * distance * distance;
			total += weight;
		}
		expect(total).toBeCloseTo(1, 12);
		return Math.sqrt(moment / total) / (Math.SQRT2 * km);
	};

	it.each([
		[64, 500],
		[64, 1000],
		[128, 300],
	])(
		'spreads a spike at %d over %d km to a root-mean-square distance of √2 times that',
		(resolution, km) => {
			expect(spikeSpread(resolution, 20, 30, km)).toBeCloseTo(1, 1);
		},
		60_000,
	);

	it('spreads a spike at 256 over 1,000 km to within 1% of √2 times that, in the middle of a face', () => {
		// The finest grid over the longest distance is where a tolerance
		// taken against the spike's own departure would be loosest. Measured:
		// 0.994 at the North Pole.
		const spread = spikeSpread(256, 90, 0, 1000);
		expect(Math.abs(spread - 1)).toBeLessThan(0.01);
	}, 60_000);

	it.each([
		[64, 500],
		[64, 900],
		[128, 500],
		[256, 1000],
	])(
		'spreads a spike at a cube corner at %d over %d km as far as one in the middle of a face, within 2%',
		(resolution, km) => {
			// The exchange between neighbours alone, which misses the skew of
			// the cells where three faces meet, spread one to 0.91 of the
			// distance at a corner. Measured: 1.005, 1.013, 1.012 and 1.015
			// times the face's middle's. Each spread checks that the spike's
			// total, its area-weighted mean, is kept.
			const corner = (Math.atan(Math.SQRT1_2) * 180) / Math.PI;
			const ratio =
				spikeSpread(resolution, corner, -45, km) /
				spikeSpread(resolution, 0, 0, km);
			expect(Math.abs(ratio - 1)).toBeLessThan(0.02);
		},
		60_000,
	);

	it('spreads a spike near a cube corner nearly evenly every way', () => {
		// Its spread along the way it reaches furthest over its spread across
		// that, at 32°N, 40°E, some 600 km from the corner: 1.05 over 500 km,
		// against 1.24 from the exchange between neighbours alone.
		const on = getGrid(64);
		const direction = latLonToDirection(32, 40);
		const spike = new Float64Array(on.cellCount);
		const start = cellAt(on, direction);
		spike[start] = 1 / (on.areas[start] as number);
		const smoothed = smoothField(on, spike, 500);
		const frame = createEastNorthFrame();
		const latitude = (32 * Math.PI) / 180;
		const longitude = (40 * Math.PI) / 180;
		writeEastNorthFrame(
			Math.sin(latitude),
			Math.cos(latitude),
			Math.sin(longitude),
			Math.cos(longitude),
			frame,
		);
		let ee = 0;
		let nn = 0;
		let en = 0;
		for (let cell = 0; cell < on.cellCount; cell++) {
			const x = on.centres[3 * cell] as number;
			const y = on.centres[3 * cell + 1] as number;
			const z = on.centres[3 * cell + 2] as number;
			if (x * direction[0] + y * direction[1] + z * direction[2] < 0.5) {
				continue;
			}
			const weight = (on.areas[cell] as number) * (smoothed[cell] as number);
			const along = x * frame.eastX + y * frame.eastY;
			const up = x * frame.northX + y * frame.northY + z * frame.northZ;
			ee += weight * along * along;
			nn += weight * up * up;
			en += weight * along * up;
		}
		const half = (ee + nn) / 2;
		const offset = Math.sqrt(((ee - nn) / 2) ** 2 + en * en);
		expect(Math.sqrt((half + offset) / (half - offset))).toBeLessThan(1.1);
	});

	it('damps a short wave more than a long one, each as the steps do', () => {
		const km = 1000;
		const sigma = km / PLANET_RADIUS_KM;
		// Sectoral harmonics of degree 2 and 10: the real part of (x + iy)^l.
		for (const [degree, wave] of [
			[2, (x: number, y: number) => x * x - y * y],
			[
				10,
				(x: number, y: number) => {
					const r = Math.hypot(x, y);
					return r ** 10 * Math.cos(10 * Math.atan2(y, x));
				},
			],
		] as const) {
			const field = fieldOf(grid, wave);
			const smoothed = smoothField(grid, field, km);
			let kept = 0;
			let size = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				const area = grid.areas[cell] as number;
				kept += area * (smoothed[cell] as number) * (field[cell] as number);
				size += area * (field[cell] as number) * (field[cell] as number);
			}
			const expected =
				(1 + (degree * (degree + 1) * sigma * sigma) / (2 * SMOOTHING_STEPS)) **
				-SMOOTHING_STEPS;
			expect(kept / size, `degree ${degree}`).toBeCloseTo(expected, 2);
		}
		expect(
			(1 + (110 * sigma * sigma) / (2 * SMOOTHING_STEPS)) ** -SMOOTHING_STEPS,
		).toBeLessThan(
			0.5 *
				(1 + (6 * sigma * sigma) / (2 * SMOOTHING_STEPS)) ** -SMOOTHING_STEPS,
		);
	});

	it('gives the same result for a grid and distance whatever was smoothed before', () => {
		const coarse = getGrid(64);
		const fine = getGrid(128);
		const fineNoisy = Float64Array.from(
			{ length: fine.cellCount },
			() => 1000 + 40 * random(),
		);
		const copy = Float64Array.from(noisy);
		const fineCopy = Float64Array.from(fineNoisy);
		const at500 = smoothField(coarse, noisy, 500);
		const at900 = smoothField(coarse, noisy, 900);
		expect(smoothField(coarse, noisy, 500)).toEqual(at500);
		const onFine = smoothField(fine, fineNoisy, 500);
		expect(smoothField(coarse, noisy, 900)).toEqual(at900);
		expect(smoothField(coarse, noisy, 500)).toEqual(at500);
		expect(smoothField(fine, fineNoisy, 500)).toEqual(onFine);
		expect(noisy).toEqual(copy);
		expect(fineNoisy).toEqual(fineCopy);
	}, 60_000);

	it('gives the field back over no distance, and writes into the array given, which may be the field', () => {
		const back = smoothField(grid, noisy, 0);
		expect(back).toEqual(noisy);
		expect(back).not.toBe(noisy);
		const copy = Float64Array.from(noisy);
		expect(smoothField(grid, copy, 600, copy)).toBe(copy);
		expect(copy).toEqual(smoothField(grid, noisy, 600));
	});

	it('refuses a field or an output of the wrong length, a value that is not finite, and a distance that is negative or not finite', () => {
		expect(() => smoothField(grid, new Float64Array(5), 100)).toThrow(
			RangeError,
		);
		expect(() => smoothField(grid, noisy, 100, new Float64Array(5))).toThrow(
			RangeError,
		);
		const broken = Float64Array.from(noisy);
		broken[1000] = Number.NaN;
		expect(() => smoothField(grid, broken, 100)).toThrow(RangeError);
		// A refused field leaves the output as it was.
		const into = new Float64Array(grid.cellCount).fill(7);
		expect(() => smoothField(grid, broken, 100, into)).toThrow(RangeError);
		expect(into.every((value) => value === 7)).toBe(true);
		for (const km of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => smoothField(grid, noisy, km), `${km}`).toThrow(RangeError);
		}
	});
});
