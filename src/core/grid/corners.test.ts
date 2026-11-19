import { describe, expect, it } from 'vitest';
import { PLANET_RADIUS_KM } from '../world/world';
import {
	type CornerCoast,
	type CornerSolver,
	coastLabels,
	cornerAreas,
	cornerIndex,
	createCornerSolver,
	edgeFlowsFromCorners,
	solveOnCorners,
} from './corners';
import {
	cellAt,
	directionToLatLon,
	faceCorners,
	type Grid,
	getGrid,
	latLonToDirection,
	neighbourTable,
} from './grid';
import { createVectorField, edgeFlows } from './vector';

/**
 * Time allowed for a test that builds and solves on the grid of 128: about
 * a second, and more than twice that under coverage instrumentation.
 */
const FINE_TEST_TIMEOUT_MS = 30_000;

const RADIUS_M = PLANET_RADIUS_KM * 1000;

/** The rotation rate of the Earth, per second. */
const OMEGA = 7.292e-5;

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

/**
 * A stand-in grid of any size: the corner index reads only `n`, and the
 * checks here the neighbours.
 */
const standIn = (n: number): Grid =>
	({
		n,
		cellCount: 6 * n * n,
		neighbours: neighbourTable(n),
	}) as unknown as Grid;

/** The entry of the same edge seen from the cell across it. */
const backEntry = (grid: Grid, entry: number): number => {
	const cell = Math.floor(entry / 4);
	const other = grid.neighbours[entry] as number;
	for (let side = 0; side < 4; side++) {
		if (grid.neighbours[4 * other + side] === cell) {
			return 4 * other + side;
		}
	}
	throw new Error(`Cell ${other} does not list cell ${cell}`);
};

const directionOf = (directions: Float64Array, p: number): number[] => [
	directions[3 * p] as number,
	directions[3 * p + 1] as number,
	directions[3 * p + 2] as number,
];

/** Every check of the index that needs only the grid's topology. */
const checkIndex = (grid: Grid): void => {
	const { n, cellCount } = grid;
	const index = cornerIndex(grid);
	const {
		cornerCount,
		cellCorners,
		edgeCorners,
		cornerCells,
		cornerNeighbours,
		neighbourEdges,
		directions,
		faceIds,
	} = index;
	expect(cornerCount).toBe(6 * n * n + 2);

	// Every cell has four distinct corners.
	for (let cell = 0; cell < cellCount; cell++) {
		const corners = new Set(cellCorners.slice(4 * cell, 4 * cell + 4));
		expect(corners.size).toBe(4);
	}

	// Each corner's cells are exactly the cells that list it, in increasing
	// order: four of them, or three at the eight cube corners.
	const listing = Array.from({ length: cornerCount }, () => [] as number[]);
	for (let cell = 0; cell < cellCount; cell++) {
		for (let k = 0; k < 4; k++) {
			listing[cellCorners[4 * cell + k] as number]?.push(cell);
		}
	}
	let threes = 0;
	for (let p = 0; p < cornerCount; p++) {
		const cells = Array.from(cornerCells.slice(4 * p, 4 * p + 4)).filter(
			(cell) => cell >= 0,
		);
		expect(cells).toEqual(listing[p]);
		if (cells.length === 3) {
			threes++;
			expect(cornerCells[4 * p + 3]).toBe(-1);
			// A cube corner, where the three faces meet.
			const [x, y, z] = directionOf(directions, p);
			for (const component of [x, y, z]) {
				expect(Math.abs(component as number)).toBeCloseTo(1 / Math.sqrt(3), 12);
			}
		} else {
			expect(cells).toHaveLength(4);
		}
		// The cells round a corner are its cells' edge neighbours: in a ring
		// of four, each beside two of the others; at a cube corner, each
		// beside both.
		for (const cell of cells) {
			const beside = cells.filter((other) =>
				Array.from(grid.neighbours.slice(4 * cell, 4 * cell + 4)).includes(
					other,
				),
			);
			expect(beside).toHaveLength(2);
		}
	}
	expect(threes).toBe(8);

	// Each edge's two corners are the two its cells share, anticlockwise
	// round the cell seen from outside, and the other way round from the
	// cell across it.
	for (let entry = 0; entry < 4 * cellCount; entry++) {
		const cell = Math.floor(entry / 4);
		const other = grid.neighbours[entry] as number;
		const mine = Array.from(cellCorners.slice(4 * cell, 4 * cell + 4));
		const theirs = Array.from(cellCorners.slice(4 * other, 4 * other + 4));
		const shared = mine.filter((corner) => theirs.includes(corner)).sort();
		const first = edgeCorners[2 * entry] as number;
		const second = edgeCorners[2 * entry + 1] as number;
		expect([first, second].sort()).toEqual(shared);
		const back = backEntry(grid, entry);
		expect(edgeCorners[2 * back]).toBe(second);
		expect(edgeCorners[2 * back + 1]).toBe(first);
		const middle = [0, 0, 0];
		for (const corner of mine) {
			const d = directionOf(directions, corner);
			for (let axis = 0; axis < 3; axis++) {
				middle[axis] = (middle[axis] as number) + (d[axis] as number);
			}
		}
		const a = directionOf(directions, first).map(
			(value, axis) => value - (middle[axis] as number) / 4,
		);
		const b = directionOf(directions, second).map(
			(value, axis) => value - (middle[axis] as number) / 4,
		);
		const [ax, ay, az] = a as [number, number, number];
		const [bx, by, bz] = b as [number, number, number];
		const turn =
			(ay * bz - az * by) * (middle[0] as number) +
			(az * bx - ax * bz) * (middle[1] as number) +
			(ax * by - ay * bx) * (middle[2] as number);
		expect(turn).toBeGreaterThan(0);
	}

	// The corners joined to each, along the edges: four, or three at a cube
	// corner, each joined back, by the edge entry of the lower-numbered cell.
	for (let p = 0; p < cornerCount; p++) {
		const joined = Array.from(cornerNeighbours.slice(4 * p, 4 * p + 4)).filter(
			(q) => q >= 0,
		);
		expect(new Set(joined).size).toBe(joined.length);
		expect(joined).toHaveLength(cornerCells[4 * p + 3] === -1 ? 3 : 4);
		for (let slot = 0; slot < joined.length; slot++) {
			const q = joined[slot] as number;
			expect(Array.from(cornerNeighbours.slice(4 * q, 4 * q + 4))).toContain(p);
			const entry = neighbourEdges[4 * p + slot] as number;
			expect(
				[edgeCorners[2 * entry], edgeCorners[2 * entry + 1]].sort(),
			).toEqual([p, q].sort());
			expect(Math.floor(entry / 4)).toBeLessThan(
				grid.neighbours[entry] as number,
			);
		}
		if (joined.length === 3) {
			expect(cornerNeighbours[4 * p + 3]).toBe(-1);
			expect(neighbourEdges[4 * p + 3]).toBe(-1);
		}
	}

	// Every face's layout names corners at the points faceCorners places
	// there, so a corner shared by faces is one point, and each is a unit
	// vector.
	const stride = n + 1;
	for (let face = 0; face < 6; face++) {
		const points = faceCorners(n, face);
		for (let at = 0; at < stride * stride; at++) {
			const p = faceIds[face * stride * stride + at] as number;
			for (let axis = 0; axis < 3; axis++) {
				expect(
					Math.abs(
						(directions[3 * p + axis] as number) -
							(points[3 * at + axis] as number),
					),
				).toBeLessThan(1e-14);
			}
		}
	}
};

describe('cornerIndex', () => {
	it('numbers the corners of small grids once, with their cells, edges and neighbours', () => {
		for (const n of [1, 2, 3, 8]) {
			checkIndex(standIn(n));
		}
	});

	it('has 6n² + 2 corners at every supported size, eight of them with three cells', () => {
		for (const n of [64, 128]) {
			const { cornerCount, cornerCells } = cornerIndex(getGrid(n));
			expect(cornerCount).toBe(6 * n * n + 2);
			let threes = 0;
			for (let p = 0; p < cornerCount; p++) {
				if (cornerCells[4 * p + 3] === -1) {
					threes++;
				}
			}
			expect(threes).toBe(8);
		}
	});

	it('is built once for each size', () => {
		expect(cornerIndex(getGrid(64))).toBe(cornerIndex(getGrid(64)));
		expect(cornerIndex(standIn(8))).toBe(cornerIndex(standIn(8)));
	});

	it('rejects a grid whose size is not a whole number from 1', () => {
		expect(() => cornerIndex(standIn(0))).toThrow(RangeError);
		expect(() => cornerIndex({ n: 2.5 } as unknown as Grid)).toThrow(
			RangeError,
		);
	});
});

describe('edgeFlowsFromCorners', () => {
	it('leaves no net flow in any cell, and each edge seen from either side is the negative', () => {
		for (const grid of [standIn(8), getGrid(64), getGrid(128)]) {
			const { cornerCount } = cornerIndex(grid);
			const random = createRandom(grid.n);
			const values = Float64Array.from(
				{ length: cornerCount },
				() => 2000 * random() - 1000,
			);
			const flows = edgeFlowsFromCorners(grid, values);
			expect(flows).toHaveLength(4 * grid.cellCount);
			let largestNet = 0;
			let largestFlow = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				let net = 0;
				for (let side = 0; side < 4; side++) {
					const flow = flows[4 * cell + side] as number;
					net += flow;
					largestFlow = Math.max(largestFlow, Math.abs(flow));
				}
				largestNet = Math.max(largestNet, Math.abs(net));
			}
			expect(largestNet).toBeLessThan(1e-12 * largestFlow);
			let unmatched = 0;
			for (let entry = 0; entry < flows.length; entry++) {
				if (flows[backEntry(grid, entry)] !== -(flows[entry] as number)) {
					unmatched++;
				}
			}
			expect(unmatched).toBe(0);
		}
	});

	it('gives the flow of r̂ × ∇ψ, as edgeFlows does of that transport', () => {
		// For ψ = z on the unit sphere, r̂ × ∇ψ = (y, -x, 0): westward.
		const grid = getGrid(64);
		const { cornerCount, directions } = cornerIndex(grid);
		const values = new Float64Array(cornerCount);
		for (let p = 0; p < cornerCount; p++) {
			values[p] = directions[3 * p + 2] as number;
		}
		const vectors = createVectorField(grid);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			vectors.x[cell] = grid.centres[3 * cell + 1] as number;
			vectors.y[cell] = -(grid.centres[3 * cell] as number);
		}
		const expected = edgeFlows(grid, vectors);
		const flows = edgeFlowsFromCorners(grid, values);
		let largest = 0;
		let error = 0;
		for (let entry = 0; entry < flows.length; entry++) {
			largest = Math.max(largest, Math.abs(expected[entry] as number));
			error = Math.max(
				error,
				Math.abs((flows[entry] as number) - (expected[entry] as number)),
			);
		}
		expect(error).toBeLessThan(1e-4 * largest);
	});

	it('writes into an array it is given', () => {
		const grid = standIn(2);
		const values = new Float64Array(cornerIndex(grid).cornerCount).fill(1);
		const into = new Float64Array(4 * grid.cellCount).fill(7);
		expect(edgeFlowsFromCorners(grid, values, into)).toBe(into);
		expect(Array.from(into).every((flow) => flow === 0)).toBe(true);
	});

	it('rejects values of the wrong length or not finite, and a target of the wrong length', () => {
		const grid = standIn(2);
		const count = cornerIndex(grid).cornerCount;
		expect(() =>
			edgeFlowsFromCorners(grid, new Float64Array(count - 1)),
		).toThrow(RangeError);
		const values = new Float64Array(count);
		values[3] = Number.NaN;
		expect(() => edgeFlowsFromCorners(grid, values)).toThrow(/entry 3/);
		expect(() =>
			edgeFlowsFromCorners(grid, new Float64Array(count), new Float64Array(3)),
		).toThrow(RangeError);
	});
});

describe('coastLabels', () => {
	const grid = standIn(8);
	const cell = (face: number, i: number, j: number): number =>
		(face * 8 + j) * 8 + i;

	it('gives every corner of a land cell its land, and the rest to the sea', () => {
		const land = new Uint8Array(grid.cellCount);
		// Two cells touching only at a corner are one land.
		land[cell(0, 2, 2)] = 1;
		land[cell(0, 3, 3)] = 1;
		// The three cells at a cube corner, on three faces, are one more.
		const index = cornerIndex(grid);
		let cubeCorner = -1;
		for (let p = 0; p < index.cornerCount; p++) {
			if (index.cornerCells[4 * p + 3] === -1) {
				cubeCorner = p;
				break;
			}
		}
		const atCorner = Array.from(
			index.cornerCells.slice(4 * cubeCorner, 4 * cubeCorner + 3),
		);
		for (const c of atCorner) {
			land[c] = 1;
		}
		const { labels, count } = coastLabels(grid, land);
		expect(count).toBe(2);
		const corners = (c: number): number[] =>
			Array.from(index.cellCorners.slice(4 * c, 4 * c + 4));
		const coastOf = (c: number): Set<number> =>
			new Set(corners(c).map((p) => labels[p] as number));
		expect(coastOf(cell(0, 2, 2))).toEqual(coastOf(cell(0, 3, 3)));
		const cubeCoast = coastOf(atCorner[0] as number);
		expect(cubeCoast.size).toBe(1);
		for (const c of atCorner) {
			expect(coastOf(c)).toEqual(cubeCoast);
		}
		expect(cubeCoast).not.toEqual(coastOf(cell(0, 2, 2)));
		// Seven corners on the diagonal pair and seven round the cube corner.
		let onCoast = 0;
		for (let p = 0; p < index.cornerCount; p++) {
			if (labels[p] !== 0) {
				onCoast++;
			}
		}
		expect(onCoast).toBe(14);
	});

	it('keeps a strait a cell wide open between two lands', () => {
		const land = new Uint8Array(grid.cellCount);
		for (let j = 1; j < 7; j++) {
			land[cell(0, 1, j)] = 1;
			land[cell(0, 3, j)] = 1;
		}
		const { labels, count } = coastLabels(grid, land);
		expect(count).toBe(2);
		const index = cornerIndex(grid);
		// Across the strait, each edge from one shore to the other joins
		// corners of two coasts.
		for (let j = 2; j < 6; j++) {
			const entry = 4 * cell(0, 2, j) + 2;
			const first = index.edgeCorners[2 * entry] as number;
			const second = index.edgeCorners[2 * entry + 1] as number;
			expect(labels[first]).not.toBe(0);
			expect(labels[second]).not.toBe(0);
			expect(labels[first]).not.toBe(labels[second]);
		}
	});

	it('gives no coast to a world all sea', () => {
		const { labels, count } = coastLabels(grid, new Uint8Array(grid.cellCount));
		expect(count).toBe(0);
		expect(labels.every((label) => label === 0)).toBe(true);
	});

	it('rejects a land array of the wrong length or not finite', () => {
		expect(() => coastLabels(grid, new Uint8Array(5))).toThrow(RangeError);
		const land = new Float64Array(grid.cellCount);
		land[9] = Number.NaN;
		expect(() => coastLabels(grid, land)).toThrow(/entry 9/);
	});
});

describe('cornerAreas', () => {
	it('sum to the sphere, and are shared', () => {
		const grid = getGrid(64);
		const areas = cornerAreas(grid);
		let total = 0;
		for (const area of areas) {
			expect(area).toBeGreaterThan(0);
			total += area;
		}
		expect(total).toBeCloseTo(4 * Math.PI, 12);
		expect(cornerAreas(grid)).toBe(areas);
	});
});

/** A basin bounded by a meridional continent and polar land, with an island. */
type Basin = {
	readonly grid: Grid;
	readonly land: Uint8Array;
	readonly labels: Int32Array;
	readonly coasts: CornerCoast[];
	/** The index into `coasts` of the continent and of the island. */
	readonly continent: number;
	readonly island: number;
	readonly beta: Float64Array;
	readonly forcing: Float64Array;
	readonly solver: CornerSolver;
};

const BASINS = new Map<number, Basin>();

/**
 * Stommel's gyre on the Earth: friction over β of 50 km, which the grid of
 * 64 does not resolve and that of 128 nearly does, so both the upwind and
 * the centred stencils are used.
 */
const basin = (n: number): Basin => {
	const held = BASINS.get(n);
	if (held !== undefined) {
		return held;
	}
	const grid = getGrid(n);
	const land = new Uint8Array(grid.cellCount);
	for (let c = 0; c < grid.cellCount; c++) {
		const { latitudeDeg, longitudeDeg } = directionToLatLon([
			grid.centres[3 * c] as number,
			grid.centres[3 * c + 1] as number,
			grid.centres[3 * c + 2] as number,
		]);
		const wall = Math.abs(longitudeDeg) < 20 || Math.abs(latitudeDeg) > 70;
		const away = 180 - Math.abs(longitudeDeg);
		const island =
			Math.hypot(latitudeDeg - 25, away * Math.cos((25 * Math.PI) / 180)) < 10;
		land[c] = wall || island ? 1 : 0;
	}
	const { labels, count } = coastLabels(grid, land);
	expect(count).toBe(2);
	const index = cornerIndex(grid);
	const onContinent =
		labels[
			index.cellCorners[4 * cellAt(grid, latLonToDirection(0, 0))] as number
		];
	const continent = (onContinent as number) - 1;
	const island = 1 - continent;
	const coasts: CornerCoast[] = [];
	coasts[continent] = 'value';
	coasts[island] = 'net';
	const beta = new Float64Array(index.cornerCount);
	const forcing = new Float64Array(index.cornerCount);
	for (let p = 0; p < index.cornerCount; p++) {
		const z = index.directions[3 * p + 2] as number;
		const latitude = Math.asin(Math.max(-1, Math.min(1, z)));
		beta[p] = (2 * OMEGA * Math.cos(latitude)) / RADIUS_M;
		forcing[p] = -1e-10 * Math.sin(3 * latitude) * Math.cos(latitude);
	}
	const solver = createCornerSolver(grid, {
		diffusion: 2e-11 * 50e3,
		eastward: beta,
		labels,
		coasts,
		radius: RADIUS_M,
	});
	const made = {
		grid,
		land,
		labels,
		coasts,
		continent,
		island,
		beta,
		forcing,
		solver,
	};
	BASINS.set(n, made);
	return made;
};

/** The operator times the areas, summed over a coast's corners. */
const coastNet = (
	{ grid, labels, solver }: Basin,
	coast: number,
	values: Float64Array,
): { net: number; scale: number } => {
	const areas = cornerAreas(grid);
	const applied = solver.apply(values);
	let net = 0;
	let scale = 0;
	for (let p = 0; p < labels.length; p++) {
		if (labels[p] === coast + 1) {
			const term = (areas[p] as number) * (applied[p] as number);
			net += term;
			scale += Math.abs(term);
		}
	}
	return { net, scale };
};

/**
 * A made-up answer, ψ*, and the forcing and island net that it solves
 * exactly, by the solver's own discretisation: the solve must give ψ* back.
 */
const recoversKnownAnswer = (n: number): void => {
	const made = basin(n);
	const { grid, labels, solver, continent, island } = made;
	const { cornerCount, directions } = cornerIndex(grid);
	const continentValue = 2e6;
	const islandValue = -5e6;
	const known = new Float64Array(cornerCount);
	for (let p = 0; p < cornerCount; p++) {
		const label = labels[p] as number;
		if (label === continent + 1) {
			known[p] = continentValue;
		} else if (label === island + 1) {
			known[p] = islandValue;
		} else {
			const { latitudeDeg, longitudeDeg } = directionToLatLon(
				directionOf(directions, p) as [number, number, number],
			);
			const latitude = (latitudeDeg * Math.PI) / 180;
			const longitude = (longitudeDeg * Math.PI) / 180;
			known[p] =
				1e7 * Math.sin(2 * latitude) * Math.cos(longitude) +
				3e6 * (directions[3 * p + 2] as number);
		}
	}
	const forcing = solver.apply(known);
	const { net } = coastNet(made, island, known);
	const coastValues = new Float64Array(2);
	coastValues[continent] = continentValue;
	coastValues[island] = net;
	const result = solver.solve(forcing, coastValues, { tolerance: 1e-11 });
	expect(result.converged).toBe(true);
	expect(result.iterations).toBeLessThan(20);
	expect(result.residual).toBeLessThanOrEqual(1e-11);
	let error = 0;
	for (let p = 0; p < cornerCount; p++) {
		error = Math.max(
			error,
			Math.abs((result.values[p] as number) - (known[p] as number)),
		);
		if (labels[p] === continent + 1) {
			expect(result.values[p]).toBe(continentValue);
		}
	}
	expect(error).toBeLessThan(1e-6 * 1e7);
	const islandValues = new Set<number>();
	for (let p = 0; p < cornerCount; p++) {
		if (labels[p] === island + 1) {
			islandValues.add(result.values[p] as number);
		}
	}
	expect(islandValues.size).toBe(1);
	const [found] = islandValues;
	expect(Math.abs((found as number) - islandValue)).toBeLessThan(10);
};

describe('createCornerSolver', () => {
	it('recovers a known answer on a basin with an island, holding each coast at its value', () => {
		recoversKnownAnswer(64);
	});

	it(
		'recovers a known answer on the grid of 128',
		() => {
			recoversKnownAnswer(128);
		},
		FINE_TEST_TIMEOUT_MS,
	);

	it("finds an island's value from its net, which the answer then meets", () => {
		const made = basin(64);
		const { solver, forcing, continent, island, labels } = made;
		const found: number[] = [];
		for (const target of [0, 1e3]) {
			const coastValues = new Float64Array(2);
			coastValues[island] = target;
			const result = solver.solve(forcing, coastValues);
			expect(result.converged).toBe(true);
			const { net, scale } = coastNet(made, island, result.values);
			expect(Math.abs(net - target)).toBeLessThan(1e-6 * scale);
			const at = labels.indexOf(island + 1);
			found.push(result.values[at] as number);
			expect(result.values[labels.indexOf(continent + 1)]).toBe(0);
		}
		expect(found[0]).not.toBeCloseTo(found[1] as number, 0);
	});

	it('carries nothing across any edge beside land, and a gyre in the sea', () => {
		const { grid, solver, forcing, land } = basin(64);
		const result = solver.solve(forcing, new Float64Array(2));
		const flows = edgeFlowsFromCorners(grid, result.values);
		let largestSea = 0;
		for (let entry = 0; entry < flows.length; entry++) {
			const cell = Math.floor(entry / 4);
			const other = grid.neighbours[entry] as number;
			if (land[cell] === 1 || land[other] === 1) {
				expect(flows[entry]).toBe(0);
			} else {
				largestSea = Math.max(largestSea, Math.abs(flows[entry] as number));
			}
		}
		expect(largestSea).toBeGreaterThan(0);
	});

	it('converges in a few iterations, starts from a guess, and stops when the iterations run out', () => {
		const { solver, forcing } = basin(64);
		const coastValues = new Float64Array(2);
		const result = solver.solve(forcing, coastValues);
		expect(result.converged).toBe(true);
		expect(result.iterations).toBeLessThan(15);
		expect(result.residual).toBeLessThanOrEqual(1e-8);
		const again = solver.solve(forcing, coastValues, {
			guess: result.values,
		});
		expect(again.iterations).toBe(0);
		expect(again.converged).toBe(true);
		const cut = solver.solve(forcing, coastValues, {
			tolerance: 1e-14,
			maxIterations: 1,
		});
		expect(cut.iterations).toBe(1);
		expect(cut.converged).toBe(false);
		expect(cut.residual).toBeGreaterThan(1e-14);
		expect(cut.values.every((value) => Number.isFinite(value))).toBe(true);
	});

	it('gives zero for no forcing and coasts at zero, at once', () => {
		const { solver, labels } = basin(64);
		const result = solver.solve(
			new Float64Array(labels.length),
			new Float64Array(2),
		);
		expect(result).toMatchObject({
			iterations: 0,
			converged: true,
			residual: 0,
		});
		expect(result.values.every((value) => value === 0)).toBe(true);
	});

	it('weights every neighbour zero or more, so the system is an M-matrix', () => {
		const { grid, solver } = basin(64);
		const index = cornerIndex(grid);
		const corners: number[] = [];
		for (let p = 0; p < index.cornerCount; p++) {
			if (index.cornerCells[4 * p + 3] === -1) {
				// A cube corner and its neighbours, where the cells are most
				// skewed.
				corners.push(p);
				for (let slot = 0; slot < 3; slot++) {
					corners.push(index.cornerNeighbours[4 * p + slot] as number);
				}
			}
		}
		const random = createRandom(5);
		for (let k = 0; k < 20; k++) {
			corners.push(Math.floor(random() * index.cornerCount));
		}
		const unit = new Float64Array(index.cornerCount);
		const applied = new Float64Array(index.cornerCount);
		for (const p of corners) {
			unit.fill(0);
			unit[p] = 1;
			solver.apply(unit, applied);
			expect(applied[p]).toBeLessThan(0);
			let least = 0;
			for (let q = 0; q < index.cornerCount; q++) {
				if (q !== p) {
					least = Math.min(least, applied[q] as number);
				}
			}
			expect(least).toBe(0);
		}
	});

	it('discretises the Laplacian and the eastward slope to within a per cent', () => {
		const grid = getGrid(64);
		const { cornerCount, cornerCells, directions } = cornerIndex(grid);
		const labels = new Int32Array(cornerCount);
		labels[0] = 1;
		const laplacian = createCornerSolver(grid, {
			diffusion: 1,
			eastward: 0,
			labels,
			coasts: ['value'],
		});
		const both = createCornerSolver(grid, {
			diffusion: 1,
			eastward: 1,
			labels,
			coasts: ['value'],
		});
		const z = new Float64Array(cornerCount);
		const y = new Float64Array(cornerCount);
		for (let p = 0; p < cornerCount; p++) {
			z[p] = directions[3 * p + 2] as number;
			y[p] = directions[3 * p + 1] as number;
		}
		// ∇²z = -2z on the unit sphere, and the eastward slope of y is
		// cos(longitude).
		const ofZ = laplacian.apply(z);
		const slope = both.apply(y);
		const ofY = laplacian.apply(y);
		const areas = cornerAreas(grid);
		let total = 0;
		let worstCubeCorner = 0;
		for (let p = 0; p < cornerCount; p++) {
			const error = Math.abs((ofZ[p] as number) + 2 * (z[p] as number)) / 2;
			if (cornerCells[4 * p + 3] === -1) {
				worstCubeCorner = Math.max(worstCubeCorner, error);
			} else {
				expect(error).toBeLessThan(0.01);
			}
			total += (areas[p] as number) * (ofZ[p] as number);
			const x = directions[3 * p] as number;
			const flat = Math.hypot(x, y[p] as number);
			if (flat > 0.2) {
				const east = (slope[p] as number) - (ofY[p] as number);
				expect(Math.abs(east - x / flat)).toBeLessThan(0.01);
			}
		}
		expect(worstCubeCorner).toBeLessThan(0.2);
		// The areas times the Laplacian sum to nothing over the sphere.
		expect(Math.abs(total)).toBeLessThan(1e-12);
	});

	it('solves once with solveOnCorners as a solver made for the problem does', () => {
		const { grid, solver, labels, coasts, beta, forcing } = basin(64);
		const coastValues = new Float64Array(2);
		const once = solveOnCorners(grid, {
			diffusion: 2e-11 * 50e3,
			eastward: beta,
			labels,
			coasts,
			radius: RADIUS_M,
			forcing,
			coastValues,
		});
		expect(once.values).toEqual(solver.solve(forcing, coastValues).values);
	});

	it('rejects an operator out of range', () => {
		const grid = getGrid(64);
		const { cornerCount } = cornerIndex(grid);
		const labels = new Int32Array(cornerCount);
		labels[0] = 1;
		const good = {
			diffusion: 1,
			eastward: 0,
			labels,
			coasts: ['value'] as CornerCoast[],
		};
		const make = (change: object) => () =>
			createCornerSolver(grid, { ...good, ...change });
		expect(make({})).not.toThrow();
		expect(make({ radius: 0 })).toThrow(/radius/);
		expect(make({ diffusion: 0 })).toThrow(/above zero/);
		expect(make({ diffusion: Number.NaN })).toThrow(/finite/);
		expect(make({ diffusion: new Float64Array(3) })).toThrow(RangeError);
		expect(make({ eastward: Number.POSITIVE_INFINITY })).toThrow(/finite/);
		const nan = new Float64Array(cornerCount);
		nan[2] = Number.NaN;
		expect(make({ eastward: nan })).toThrow(/entry 2/);
		expect(make({ labels: new Int32Array(4) })).toThrow(RangeError);
		const outside = labels.slice();
		outside[1] = 2;
		expect(make({ labels: outside })).toThrow(/corner 1/);
		const fraction = Float64Array.from(labels);
		fraction[1] = 0.5;
		expect(make({ labels: fraction })).toThrow(/corner 1/);
		expect(make({ coasts: ['value', 'net'] })).toThrow(/Coast 2 has no corner/);
		expect(make({ coasts: ['net'] })).toThrow(/'value'/);
		expect(make({ coasts: ['fixed'] })).toThrow(/coast 1 is fixed/);
		expect(make({ labels: new Int32Array(cornerCount), coasts: [] })).toThrow(
			/'value'/,
		);
	});

	it('rejects a solve out of range', () => {
		const { solver, labels } = basin(64);
		const count = labels.length;
		const forcing = new Float64Array(count);
		const coastValues = new Float64Array(2);
		expect(() => solver.solve(new Float64Array(3), coastValues)).toThrow(
			RangeError,
		);
		const nan = new Float64Array(count);
		nan[4] = Number.NaN;
		expect(() => solver.solve(nan, coastValues)).toThrow(/entry 4/);
		expect(() => solver.solve(forcing, new Float64Array(1))).toThrow(
			/per coast/,
		);
		expect(() => solver.solve(forcing, Float64Array.of(0, Number.NaN))).toThrow(
			/finite/,
		);
		expect(() => solver.solve(forcing, coastValues, { tolerance: 0 })).toThrow(
			/tolerance/,
		);
		expect(() =>
			solver.solve(forcing, coastValues, { maxIterations: 1.5 }),
		).toThrow(/iterations/);
		expect(() =>
			solver.solve(forcing, coastValues, { guess: new Float64Array(2) }),
		).toThrow(/guess/);
		expect(() => solver.apply(new Float64Array(2))).toThrow(RangeError);
		expect(() =>
			solver.apply(new Float64Array(count), new Float64Array(2)),
		).toThrow(RangeError);
	});
});
