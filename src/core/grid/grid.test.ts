import { describe, expect, it } from 'vitest';
import {
	cellArea,
	cellAt,
	cellCentre,
	cellCoords,
	cellIndex,
	cellsWithin,
	DEFAULT_RESOLUTION,
	directionToFace,
	directionToLatLon,
	edgeGeometry,
	FACE_AXES,
	FACE_COUNT,
	faceToDirection,
	type Grid,
	getGrid,
	isSupportedResolution,
	latLonToDirection,
	NEIGHBOUR_COUNT,
	neighbours,
	SUPPORTED_RESOLUTIONS,
	type Vec3,
} from './grid';

const HALF_PI = Math.PI / 2;

/**
 * Time allowed for the test that scans every centre many times over. At 256
 * cells per face edge it takes a few seconds, and more than twice that under
 * coverage instrumentation, which the default five seconds does not allow.
 */
const SCAN_TEST_TIMEOUT_MS = 60_000;

/** A small seeded generator (mulberry32) so random cases repeat exactly. */
const createRandom = (seed: number): (() => number) => {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/** A direction drawn uniformly over the sphere. */
const randomDirection = (random: () => number): Vec3 => {
	const z = 2 * random() - 1;
	const longitude = 2 * Math.PI * random();
	const r = Math.sqrt(1 - z * z);
	return [r * Math.cos(longitude), r * Math.sin(longitude), z];
};

const dot = (a: Vec3, b: Vec3): number =>
	a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];

const unit = (a: Vec3): Vec3 => {
	const length = Math.hypot(a[0], a[1], a[2]);
	return [a[0] / length, a[1] / length, a[2] / length];
};

/** Angle between two vectors, accurate for small and near-π angles alike. */
const angleBetween = (a: Vec3, b: Vec3): number => {
	const c = cross(a, b);
	return Math.atan2(Math.hypot(c[0], c[1], c[2]), dot(a, b));
};

const centreAt = (grid: Grid, cell: number): Vec3 => [
	grid.centres[3 * cell] as number,
	grid.centres[3 * cell + 1] as number,
	grid.centres[3 * cell + 2] as number,
];

/** `cellsWithin` by definition: a scan of every cell centre. */
const scanCellsWithin = (
	grid: Grid,
	direction: Vec3,
	radius: number,
): Int32Array => {
	const centre = unit(direction);
	const found: number[] = [];
	for (let cell = 0; cell < grid.cellCount; cell++) {
		if (
			radius >= Math.PI ||
			angleBetween(centre, centreAt(grid, cell)) <= radius
		) {
			found.push(cell);
		}
	}
	return Int32Array.from(found);
};

const sameCells = (a: Int32Array, b: Int32Array): boolean =>
	a.length === b.length && a.every((cell, k) => cell === b[k]);

/**
 * Whether a direction lies inside the four great circles through a cell's
 * corners, worked out from the corners rather than from face coordinates.
 */
const isInsideCell = (grid: Grid, cell: number, direction: Vec3): boolean => {
	const { n } = grid;
	const { face, i, j } = cellCoords(grid, cell);
	const corners = [
		faceToDirection(face, i / n, j / n),
		faceToDirection(face, (i + 1) / n, j / n),
		faceToDirection(face, (i + 1) / n, (j + 1) / n),
		faceToDirection(face, i / n, (j + 1) / n),
	];
	const centre = centreAt(grid, cell);
	return corners.every((corner, k) => {
		const edge = cross(corner, corners[(k + 1) % corners.length] as Vec3);
		return dot(edge, direction) * Math.sign(dot(edge, centre)) >= -1e-12;
	});
};

/** The OpenGL cube-map face selection, written out per face. */
const CUBE_MAP_FACES: readonly ((d: Vec3) => {
	major: number;
	sc: number;
	tc: number;
})[] = [
	([x, y, z]) => ({ major: x, sc: -z, tc: -y }),
	([x, y, z]) => ({ major: -x, sc: z, tc: -y }),
	([x, y, z]) => ({ major: y, sc: x, tc: z }),
	([x, y, z]) => ({ major: -y, sc: x, tc: -z }),
	([x, y, z]) => ({ major: z, sc: x, tc: -y }),
	([x, y, z]) => ({ major: -z, sc: -x, tc: -y }),
];

const CUBE_CORNERS: readonly Vec3[] = [
	[1, 1, 1],
	[1, 1, -1],
	[1, -1, 1],
	[1, -1, -1],
	[-1, 1, 1],
	[-1, 1, -1],
	[-1, -1, 1],
	[-1, -1, -1],
];

const POLES: readonly Vec3[] = [
	[0, 0, 1],
	[0, 0, -1],
];

describe('resolutions', () => {
	it('supports 64, 128 and 256 cells per face edge, defaulting to 64', () => {
		expect([...SUPPORTED_RESOLUTIONS]).toEqual([64, 128, 256]);
		expect(DEFAULT_RESOLUTION).toBe(64);
		expect(isSupportedResolution(128)).toBe(true);
		expect(isSupportedResolution(100)).toBe(false);
	});

	it.each([
		0,
		1,
		32,
		63,
		100,
		512,
		64.5,
		-64,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])('rejects the unsupported resolution %s', (n) => {
		expect(() => getGrid(n)).toThrow(RangeError);
		expect(() => getGrid(n)).toThrow(/expected one of 64, 128, 256/);
	});

	it('builds each grid once and shares it', () => {
		expect(getGrid(64)).toBe(getGrid(64));
		expect(getGrid(64)).not.toBe(getGrid(128));
	});
});

describe('face layout', () => {
	it('uses axis-aligned, mutually perpendicular unit axes', () => {
		expect(FACE_AXES).toHaveLength(FACE_COUNT);
		for (const { normal, u, v } of FACE_AXES) {
			for (const axis of [normal, u, v]) {
				expect(axis.map(Math.abs).sort()).toEqual([0, 0, 1]);
			}
			expect(dot(normal, u)).toBe(0);
			expect(dot(normal, v)).toBe(0);
			expect(dot(u, v)).toBe(0);
		}
	});

	it('orders the faces +X, -X, +Y, -Y, +Z, -Z', () => {
		expect(FACE_AXES.map((axes) => axes.normal)).toEqual([
			[1, 0, 0],
			[-1, 0, 0],
			[0, 1, 0],
			[0, -1, 0],
			[0, 0, 1],
			[0, 0, -1],
		]);
	});

	it('puts the middle of each face at its normal', () => {
		FACE_AXES.forEach(({ normal }, face) => {
			const direction = faceToDirection(face, 0.5, 0.5);
			expect(angleBetween(direction, normal)).toBeLessThan(1e-15);
			expect(directionToFace(normal)).toEqual({ face, s: 0.5, t: 0.5 });
		});
	});

	it('spaces face coordinates evenly in angle', () => {
		// Half-way from the middle of the north face to its +u edge is half
		// of the 45° to that edge: 22.5° from the pole towards +X.
		const direction = faceToDirection(4, 0.75, 0.5);
		const expected: Vec3 = [Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
		expect(angleBetween(direction, expected)).toBeLessThan(1e-15);
	});

	it('follows the OpenGL cube-map convention with an equiangular warp', () => {
		const random = createRandom(7);
		let worst = 0;
		for (let k = 0; k < 20000; k++) {
			const direction = randomDirection(random);
			const { face, s, t } = directionToFace(direction);
			const select = CUBE_MAP_FACES[face];
			if (select === undefined) {
				throw new Error(`directionToFace returned face ${face}`);
			}
			const { major, sc, tc } = select(direction);
			expect(major).toBeGreaterThanOrEqual(
				Math.max(...direction.map(Math.abs)),
			);
			worst = Math.max(
				worst,
				Math.abs(Math.tan((s - 0.5) * HALF_PI) - sc / major),
				Math.abs(Math.tan((t - 0.5) * HALF_PI) - tc / major),
			);
		}
		expect(worst).toBeLessThan(1e-14);
	});

	it('round-trips directions through face coordinates', () => {
		const random = createRandom(11);
		let worst = 0;
		for (let k = 0; k < 20000; k++) {
			const direction = randomDirection(random);
			const { face, s, t } = directionToFace(direction);
			worst = Math.max(
				worst,
				angleBetween(direction, faceToDirection(face, s, t)),
			);
		}
		expect(worst).toBeLessThan(1e-14);
	});

	it('rejects a face that does not exist', () => {
		expect(() => faceToDirection(6, 0.5, 0.5)).toThrow(RangeError);
		expect(() => faceToDirection(-1, 0.5, 0.5)).toThrow(RangeError);
	});
});

describe('latitude and longitude', () => {
	it('puts the north pole at +Z and (0°, 0°) at +X, east towards +Y', () => {
		const cases: readonly (readonly [number, number, Vec3])[] = [
			[90, 0, [0, 0, 1]],
			[-90, 0, [0, 0, -1]],
			[0, 0, [1, 0, 0]],
			[0, 90, [0, 1, 0]],
			[0, 180, [-1, 0, 0]],
			[0, -90, [0, -1, 0]],
		];
		for (const [latitudeDeg, longitudeDeg, expected] of cases) {
			const direction = latLonToDirection(latitudeDeg, longitudeDeg);
			expect(angleBetween(direction, expected)).toBeLessThan(1e-15);
		}
		expect(directionToLatLon([0, 0, 1]).latitudeDeg).toBe(90);
		expect(directionToLatLon([0, 0, -1]).latitudeDeg).toBe(-90);
		expect(directionToLatLon([1, 0, 0])).toEqual({
			latitudeDeg: 0,
			longitudeDeg: 0,
		});
		expect(directionToLatLon([0, 1, 0]).longitudeDeg).toBe(90);
		expect(directionToLatLon([0, -1, 0]).longitudeDeg).toBe(-90);
		expect(directionToLatLon([-1, 0, 0]).longitudeDeg).toBe(180);
	});

	it('round-trips degrees through a direction', () => {
		const random = createRandom(21);
		let worst = 0;
		for (let k = 0; k < 20000; k++) {
			const latitudeDeg = 179.9 * random() - 89.95;
			const longitudeDeg = 359.9 * random() - 179.95;
			const back = directionToLatLon(
				latLonToDirection(latitudeDeg, longitudeDeg),
			);
			worst = Math.max(
				worst,
				Math.abs(back.latitudeDeg - latitudeDeg),
				Math.abs(back.longitudeDeg - longitudeDeg),
			);
		}
		expect(worst).toBeLessThan(1e-9);
	});

	it('round-trips a direction through degrees, whatever its length', () => {
		const random = createRandom(22);
		let worst = 0;
		for (let k = 0; k < 20000; k++) {
			const direction = randomDirection(random);
			const scale = 10 ** (20 * random() - 10);
			const { latitudeDeg, longitudeDeg } = directionToLatLon([
				direction[0] * scale,
				direction[1] * scale,
				direction[2] * scale,
			]);
			worst = Math.max(
				worst,
				angleBetween(direction, latLonToDirection(latitudeDeg, longitudeDeg)),
			);
		}
		expect(worst).toBeLessThan(1e-14);
	});

	it('rejects a zero or non-finite direction', () => {
		expect(() => directionToLatLon([0, 0, 0])).toThrow(RangeError);
		expect(() => directionToLatLon([Number.NaN, 0, 1])).toThrow(RangeError);
	});
});

describe.each(SUPPORTED_RESOLUTIONS)('grid at %i cells per face edge', (n) => {
	const grid = getGrid(n);
	const cellsPerFace = n * n;

	it('sizes its arrays for six faces of n × n cells', () => {
		expect(grid.n).toBe(n);
		expect(grid.cellCount).toBe(FACE_COUNT * cellsPerFace);
		expect(grid.cellWidth).toBeCloseTo(HALF_PI / n, 15);
		expect(grid.centres).toBeInstanceOf(Float64Array);
		expect(grid.centres).toHaveLength(3 * grid.cellCount);
		expect(grid.areas).toBeInstanceOf(Float64Array);
		expect(grid.areas).toHaveLength(grid.cellCount);
		expect(grid.neighbours).toBeInstanceOf(Int32Array);
		expect(grid.neighbours).toHaveLength(NEIGHBOUR_COUNT * grid.cellCount);
	});

	it('numbers cells face * n * n + j * n + i, and back', () => {
		expect(cellIndex(grid, 0, 0, 0)).toBe(0);
		expect(cellIndex(grid, 0, 1, 0)).toBe(1);
		expect(cellIndex(grid, 0, 0, 1)).toBe(n);
		expect(cellIndex(grid, 1, 0, 0)).toBe(cellsPerFace);
		expect(cellIndex(grid, 5, n - 1, n - 1)).toBe(grid.cellCount - 1);
		let mismatches = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const { face, i, j } = cellCoords(grid, cell);
			if (
				cell !== face * cellsPerFace + j * n + i ||
				cell !== cellIndex(grid, face, i, j)
			) {
				mismatches++;
			}
		}
		expect(mismatches).toBe(0);
	});

	it('rejects coordinates and indices outside the grid', () => {
		expect(() => cellIndex(grid, 6, 0, 0)).toThrow(RangeError);
		expect(() => cellIndex(grid, 0, n, 0)).toThrow(RangeError);
		expect(() => cellIndex(grid, 0, 0, -1)).toThrow(RangeError);
		expect(() => cellIndex(grid, 0, 0.5, 0)).toThrow(RangeError);
		expect(() => cellCoords(grid, grid.cellCount)).toThrow(RangeError);
		expect(() => cellCentre(grid, -1)).toThrow(RangeError);
		expect(() => cellArea(grid, 1.5)).toThrow(RangeError);
		expect(() => neighbours(grid, Number.NaN)).toThrow(RangeError);
	});

	it('places unit-length centres in the middle of each cell', () => {
		let worstLength = 0;
		let worstOffset = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const centre = centreAt(grid, cell);
			worstLength = Math.max(worstLength, Math.abs(dot(centre, centre) - 1));
			const { face, i, j } = cellCoords(grid, cell);
			const expected = faceToDirection(face, (i + 0.5) / n, (j + 0.5) / n);
			worstOffset = Math.max(worstOffset, angleBetween(centre, expected));
		}
		expect(worstLength).toBeLessThan(1e-15);
		expect(worstOffset).toBeLessThan(1e-15);
		expect(cellCentre(grid, n + 3)).toEqual(centreAt(grid, n + 3));
	});

	it('runs i along u and j along v on every face', () => {
		let wrong = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const { face, i, j } = cellCoords(grid, cell);
			const { u, v } = FACE_AXES[face] as (typeof FACE_AXES)[number];
			const centre = centreAt(grid, cell);
			if (i + 1 < n && dot(centreAt(grid, cell + 1), u) <= dot(centre, u)) {
				wrong++;
			}
			if (j + 1 < n && dot(centreAt(grid, cell + n), v) <= dot(centre, v)) {
				wrong++;
			}
		}
		expect(wrong).toBe(0);
	});

	it('has cell areas that sum to the whole sphere', () => {
		let sum = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			sum += grid.areas[cell] as number;
		}
		const whole = 4 * Math.PI;
		expect(Math.abs(sum - whole) / whole).toBeLessThan(1e-9);
		expect(cellArea(grid, 5)).toBe(grid.areas[5]);
	});

	it('keeps the largest cell under 1.5 times the smallest', () => {
		let smallest = Number.POSITIVE_INFINITY;
		let largest = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const area = grid.areas[cell] as number;
			smallest = Math.min(smallest, area);
			largest = Math.max(largest, area);
		}
		expect(smallest).toBeGreaterThan(0);
		expect(largest / smallest).toBeLessThan(1.5);
	});

	it('matches the area of a cell measured from its corners', () => {
		// Girard's theorem: a spherical quadrilateral's area is its angle
		// sum less 2π.
		const random = createRandom(31 + n);
		let worst = 0;
		for (let k = 0; k < 200; k++) {
			const cell = Math.floor(random() * grid.cellCount);
			const { face, i, j } = cellCoords(grid, cell);
			const corners = [
				faceToDirection(face, i / n, j / n),
				faceToDirection(face, (i + 1) / n, j / n),
				faceToDirection(face, (i + 1) / n, (j + 1) / n),
				faceToDirection(face, i / n, (j + 1) / n),
			];
			let angleSum = 0;
			for (let c = 0; c < 4; c++) {
				const here = corners[c] as Vec3;
				const before = corners[(c + 3) % 4] as Vec3;
				const after = corners[(c + 1) % 4] as Vec3;
				angleSum += angleBetween(
					cross(cross(here, before), here),
					cross(cross(here, after), here),
				);
			}
			const area = angleSum - 2 * Math.PI;
			worst = Math.max(worst, Math.abs(area / cellArea(grid, cell) - 1));
		}
		expect(worst).toBeLessThan(1e-6);
	});

	it('gives every cell four distinct neighbours, symmetrically', () => {
		const all = grid.neighbours;
		let invalid = 0;
		let repeated = 0;
		let oneWay = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const first = NEIGHBOUR_COUNT * cell;
			for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
				const neighbour = all[first + side] as number;
				if (
					neighbour < 0 ||
					neighbour >= grid.cellCount ||
					neighbour === cell
				) {
					invalid++;
					continue;
				}
				for (let other = side + 1; other < NEIGHBOUR_COUNT; other++) {
					if (all[first + other] === neighbour) {
						repeated++;
					}
				}
				const back = NEIGHBOUR_COUNT * neighbour;
				if (
					all[back] !== cell &&
					all[back + 1] !== cell &&
					all[back + 2] !== cell &&
					all[back + 3] !== cell
				) {
					oneWay++;
				}
			}
		}
		expect(invalid).toBe(0);
		expect(repeated).toBe(0);
		expect(oneWay).toBe(0);
	});

	it('keeps every neighbour within two cell widths', () => {
		let farthest = 0;
		let nearest = Number.POSITIVE_INFINITY;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const centre = centreAt(grid, cell);
			for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
				const neighbour = grid.neighbours[
					NEIGHBOUR_COUNT * cell + side
				] as number;
				const distance = angleBetween(centre, centreAt(grid, neighbour));
				farthest = Math.max(farthest, distance);
				nearest = Math.min(nearest, distance);
			}
		}
		expect(farthest).toBeLessThan(2 * grid.cellWidth);
		expect(nearest).toBeGreaterThan(0.5 * grid.cellWidth);
	});

	it('orders neighbours -i, +i, -j, +j, including across cube edges', () => {
		let wrong = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const { face, i, j } = cellCoords(grid, cell);
			const { u, v } = FACE_AXES[face] as (typeof FACE_AXES)[number];
			const centre = centreAt(grid, cell);
			const [lowI, highI, lowJ, highJ] = neighbours(grid, cell);
			if (
				dot(centreAt(grid, lowI), u) >= dot(centre, u) ||
				dot(centreAt(grid, highI), u) <= dot(centre, u) ||
				dot(centreAt(grid, lowJ), v) >= dot(centre, v) ||
				dot(centreAt(grid, highJ), v) <= dot(centre, v)
			) {
				wrong++;
			}
			if (
				(i > 0 && lowI !== cell - 1) ||
				(i < n - 1 && highI !== cell + 1) ||
				(j > 0 && lowJ !== cell - n) ||
				(j < n - 1 && highJ !== cell + n)
			) {
				wrong++;
			}
		}
		expect(wrong).toBe(0);
	});

	it('joins the three cells at each cube corner to one another', () => {
		for (const corner of CUBE_CORNERS) {
			const cells = cellsWithin(grid, corner, 0.9 * grid.cellWidth);
			expect(cells).toHaveLength(3);
			for (const cell of cells) {
				const around = neighbours(grid, cell);
				for (const other of cells) {
					expect(other === cell || around.includes(other)).toBe(true);
				}
			}
		}
	});

	it('finds each cell from its own centre', () => {
		let wrong = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			if (cellAt(grid, centreAt(grid, cell)) !== cell) {
				wrong++;
			}
		}
		expect(wrong).toBe(0);
	});

	it('finds the cell that contains a random direction', () => {
		const random = createRandom(41 + n);
		let outside = 0;
		let farthest = 0;
		for (let k = 0; k < 20000; k++) {
			const direction = randomDirection(random);
			const cell = cellAt(grid, direction);
			if (!isInsideCell(grid, cell, direction)) {
				outside++;
			}
			farthest = Math.max(
				farthest,
				angleBetween(direction, centreAt(grid, cell)),
			);
		}
		expect(outside).toBe(0);
		expect(farthest).toBeLessThan(grid.cellWidth);
	});

	it('finds a cell whose centre is as near as any neighbour’s', () => {
		// Cells are not the nearest-centre regions of their centres, so the
		// cell's own centre is the nearest for most directions rather than
		// all. Towards a cube corner cells shear into rhombi with 60° and
		// 120° corners, and a direction near a 60° corner is closer to the
		// centres of the two cells beside it, by up to 0.35 of a cell width.
		const random = createRandom(43 + n);
		const samples = 20000;
		let worstExcess = 0;
		let nearerNeighbour = 0;
		for (let k = 0; k < samples; k++) {
			const direction = randomDirection(random);
			const cell = cellAt(grid, direction);
			const own = angleBetween(direction, centreAt(grid, cell));
			let nearest = Number.POSITIVE_INFINITY;
			for (const neighbour of neighbours(grid, cell)) {
				nearest = Math.min(
					nearest,
					angleBetween(direction, centreAt(grid, neighbour)),
				);
			}
			worstExcess = Math.max(worstExcess, own - nearest);
			if (own > nearest) {
				nearerNeighbour++;
			}
		}
		expect(worstExcess).toBeLessThan(0.4 * grid.cellWidth);
		expect(nearerNeighbour / samples).toBeLessThan(0.1);
	});

	it('resolves the poles, cube corners and cube edges to a cell', () => {
		const edges: Vec3[] = [];
		for (const [x, y, z] of CUBE_CORNERS) {
			edges.push([x, y, 0], [x, 0, z], [0, y, z], [x, y, 0.3 * z]);
		}
		for (const direction of [...POLES, ...CUBE_CORNERS, ...edges]) {
			const cell = cellAt(grid, direction);
			expect(Number.isInteger(cell)).toBe(true);
			expect(cell).toBeGreaterThanOrEqual(0);
			expect(cell).toBeLessThan(grid.cellCount);
			expect(angleBetween(direction, centreAt(grid, cell))).toBeLessThan(
				grid.cellWidth,
			);
		}
		expect(cellCoords(grid, cellAt(grid, [0, 0, 1])).face).toBe(4);
		expect(cellCoords(grid, cellAt(grid, [0, 0, -1])).face).toBe(5);
		for (const corner of CUBE_CORNERS) {
			const { i, j } = cellCoords(grid, cellAt(grid, corner));
			expect([0, n - 1]).toContain(i);
			expect([0, n - 1]).toContain(j);
		}
	});

	it('ignores the length of a direction', () => {
		const random = createRandom(47 + n);
		for (const scale of [1e-300, 1e-12, 3, 1e12, 1e300]) {
			const [x, y, z] = randomDirection(random);
			const cell = cellAt(grid, [x, y, z]);
			expect(cellAt(grid, [x * scale, y * scale, z * scale])).toBe(cell);
		}
		expect(cellAt(grid, [1e308, 1e308, 1e308])).toBe(cellAt(grid, [1, 1, 1]));
		expect(cellAt(grid, [0, 5e-324, 0])).toBe(cellAt(grid, [0, 1, 0]));
	});

	it('rejects a zero or non-finite direction', () => {
		const bad: readonly Vec3[] = [
			[0, 0, 0],
			[Number.NaN, 0, 1],
			[1, Number.NaN, 0],
			[Number.POSITIVE_INFINITY, 0, 0],
			[0, 1, Number.NEGATIVE_INFINITY],
		];
		for (const direction of bad) {
			expect(() => cellAt(grid, direction)).toThrow(RangeError);
			expect(() => cellsWithin(grid, direction, 0.1)).toThrow(RangeError);
		}
	});

	it('rejects a negative or missing radius', () => {
		expect(() => cellsWithin(grid, [1, 0, 0], -0.1)).toThrow(RangeError);
		expect(() => cellsWithin(grid, [1, 0, 0], Number.NaN)).toThrow(RangeError);
	});

	it(
		'selects the same cells as a scan of every centre',
		() => {
			const random = createRandom(53 + n);
			const width = grid.cellWidth;
			const cases: (readonly [Vec3, number])[] = [];
			for (let k = 0; k < 24; k++) {
				cases.push([randomDirection(random), 12 * width * random()]);
			}
			for (let k = 0; k < 8; k++) {
				cases.push([randomDirection(random), Math.PI * random()]);
			}
			// Caps that hold a neighbour's centre but not the centre of the cell
			// the direction is in, so the search cannot rely on its first cell.
			let offCentre = 0;
			while (offCentre < 8) {
				const direction = randomDirection(random);
				const cell = cellAt(grid, direction);
				const own = angleBetween(direction, centreAt(grid, cell));
				const nearest = Math.min(
					...neighbours(grid, cell).map((neighbour) =>
						angleBetween(direction, centreAt(grid, neighbour)),
					),
				);
				if (nearest < own) {
					cases.push([direction, (nearest + own) / 2]);
					offCentre++;
				}
			}
			for (const corner of CUBE_CORNERS) {
				const [x, y, z] = corner;
				cases.push(
					[corner, (0.3 + 6 * random()) * width],
					[[x, y, z * (1 - 2 * width)], (0.3 + 6 * random()) * width],
					[[x, y, 0], (0.3 + 6 * random()) * width],
					[[x, y * (1 - 3 * width), 0.4 * z], (0.3 + 6 * random()) * width],
				);
			}
			cases.push(
				[[0, 0, 1], 0.3],
				[[0, 0, -1], 0.3],
				[[1, 1, 1], 1.1],
				[[-1, 1, -1], HALF_PI],
				[randomDirection(random), HALF_PI],
				[randomDirection(random), 2.5],
				[randomDirection(random), Math.PI - 0.5 * width],
				[randomDirection(random), Math.PI],
				[randomDirection(random), 4],
				[randomDirection(random), 0],
				[[1, -1, 1], 0],
				[[5e-7, 0, -1e-9], 0.2],
			);

			const failures: string[] = [];
			let selected = 0;
			for (const [direction, radius] of cases) {
				const found = cellsWithin(grid, direction, radius).sort();
				selected += found.length;
				if (!sameCells(found, scanCellsWithin(grid, direction, radius))) {
					failures.push(`(${direction.join(', ')}) radius ${radius}`);
				}
			}
			expect(failures).toEqual([]);
			expect(selected).toBeGreaterThan(grid.cellCount);
		},
		SCAN_TEST_TIMEOUT_MS,
	);

	it('selects every cell once the radius covers the sphere', () => {
		const everything = cellsWithin(grid, [0.2, -0.7, 0.4], Math.PI).sort();
		expect(everything).toHaveLength(grid.cellCount);
		expect(everything.every((cell, k) => cell === k)).toBe(true);
	});

	it('selects only a centre the direction sits on at zero radius', () => {
		const cell = cellIndex(grid, 2, 3, n - 1);
		const centre = centreAt(grid, cell);
		expect([...cellsWithin(grid, centre, 1e-9)]).toEqual([cell]);
		expect(cellsWithin(grid, [0.3, 0.4, 0.5], 0)).toHaveLength(0);
	});

	it('returns an array the caller owns', () => {
		const first = cellsWithin(grid, [1, 0.1, 0.2], 3 * grid.cellWidth);
		const copy = Int32Array.from(first);
		const second = cellsWithin(grid, [-1, 0.5, 0], 5 * grid.cellWidth);
		expect(second).not.toBe(first);
		expect(first.buffer).not.toBe(second.buffer);
		expect(first).toEqual(copy);
	});
});

describe.each(SUPPORTED_RESOLUTIONS)(
	'edge geometry at %i cells per face edge',
	(n) => {
		const grid = getGrid(n);
		const { lengths, distances, weights } = edgeGeometry(grid);

		/** The side of `neighbour` that faces `cell`. */
		const sideFacing = (neighbour: number, cell: number): number => {
			for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
				if (grid.neighbours[NEIGHBOUR_COUNT * neighbour + side] === cell) {
					return side;
				}
			}
			throw new Error(`Cell ${neighbour} does not neighbour ${cell}`);
		};

		it('is built once per grid and laid out like the neighbours', () => {
			expect(edgeGeometry(grid)).toBe(edgeGeometry(grid));
			for (const values of [lengths, distances, weights]) {
				expect(values).toHaveLength(NEIGHBOUR_COUNT * grid.cellCount);
			}
		});

		it('gives each edge exactly the same values from both sides', () => {
			let mismatches = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
					const entry = NEIGHBOUR_COUNT * cell + side;
					const neighbour = grid.neighbours[entry] as number;
					const back =
						NEIGHBOUR_COUNT * neighbour + sideFacing(neighbour, cell);
					if (
						weights[entry] !== weights[back] ||
						lengths[entry] !== lengths[back] ||
						distances[entry] !== distances[back]
					) {
						mismatches++;
					}
				}
			}
			expect(mismatches).toBe(0);
		});

		it('is positive and finite everywhere, and the weight is length over distance', () => {
			let bad = 0;
			for (let entry = 0; entry < weights.length; entry++) {
				const weight = weights[entry] as number;
				const length = lengths[entry] as number;
				const distance = distances[entry] as number;
				if (
					!(weight > 0 && Number.isFinite(weight)) ||
					!(length > 0 && length < grid.cellWidth * 1.01) ||
					!(distance > 0 && distance < 2 * grid.cellWidth) ||
					weight !== length / distance
				) {
					bad++;
				}
			}
			expect(bad).toBe(0);
		});

		it('weighs edges near 1 at the middle of each face', () => {
			for (let face = 0; face < FACE_COUNT; face++) {
				const cell = cellIndex(grid, face, n / 2, n / 2);
				for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
					expect(weights[NEIGHBOUR_COUNT * cell + side]).toBeCloseTo(1, 3);
				}
			}
		});

		it('measures edges whose lengths add up along the great circles of the grid', () => {
			// The line between columns n/2 − 1 and n/2 of a face is a quarter of
			// a great circle, from one edge of the face to the other.
			for (let face = 0; face < FACE_COUNT; face++) {
				let total = 0;
				for (let j = 0; j < n; j++) {
					const cell = cellIndex(grid, face, n / 2, j);
					total += lengths[NEIGHBOUR_COUNT * cell] as number;
				}
				expect(total).toBeCloseTo(HALF_PI, 12);
			}
		});

		it('measures the cube edges as twelve arcs of arccos(1/3)', () => {
			// Each edge crossing a cube edge is counted from both sides.
			let total = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				const face = Math.floor(cell / (n * n));
				for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
					const entry = NEIGHBOUR_COUNT * cell + side;
					const neighbour = grid.neighbours[entry] as number;
					if (Math.floor(neighbour / (n * n)) !== face) {
						total += lengths[entry] as number;
					}
				}
			}
			expect(total / 2).toBeCloseTo(12 * Math.acos(1 / 3), 11);
		});

		it('is the same on every face, as the cube is', () => {
			// Every face is a turned copy of face 0, with its own axes laid out
			// the same way, so the weight of a side depends only on where the
			// cell sits on its face.
			let largest = 0;
			for (let face = 1; face < FACE_COUNT; face++) {
				for (let j = 0; j < n; j++) {
					for (let i = 0; i < n; i++) {
						for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
							const a =
								weights[NEIGHBOUR_COUNT * cellIndex(grid, 0, i, j) + side];
							const b =
								weights[NEIGHBOUR_COUNT * cellIndex(grid, face, i, j) + side];
							largest = Math.max(
								largest,
								Math.abs((a as number) - (b as number)),
							);
						}
					}
				}
			}
			expect(largest).toBeLessThan(1e-12);
		});

		it('is mirror symmetric across the middle of a face', () => {
			let largest = 0;
			for (let j = 0; j < n; j++) {
				for (let i = 0; i < n; i++) {
					// The +i side of (i, j) mirrors the -i side of (n - 1 - i, j).
					const a = weights[NEIGHBOUR_COUNT * cellIndex(grid, 2, i, j) + 1];
					const b =
						weights[NEIGHBOUR_COUNT * cellIndex(grid, 2, n - 1 - i, j) + 0];
					largest = Math.max(largest, Math.abs((a as number) - (b as number)));
				}
			}
			expect(largest).toBeLessThan(1e-12);
		});
	},
);
