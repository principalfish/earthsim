import { describe, expect, it } from 'vitest';
import { readEarthDataFile } from '../../scripts/earth/dataFile.mjs';
import {
	coarsenWorld,
	refineField,
	refinementStencil,
	refineVectors,
} from './coarsen';
import { decodeEarth, earthWorld } from './earth';
import { generateWorld } from './generate';
import {
	cellCoords,
	cellIndex,
	FACE_AXES,
	FACE_COUNT,
	type Grid,
	getGrid,
} from './grid';
import { cellLatitudes, MONTHS_PER_YEAR } from './insolation';
import { DEFAULT_PLANET } from './planet';
import { refineMonths, TEMPERATURE_MODEL, ZERO_CELSIUS_K } from './temperature';
import { createVectorField, type VectorField } from './vector';
import { createBlankWorld, type World } from './world';

const EARTH = decodeEarth(readEarthDataFile());

const FINE = [128, 256] as const;

/** The area-weighted mean of a field over a grid. */
const areaMean = (grid: Grid, field: ArrayLike<number>): number => {
	let total = 0;
	let area = 0;
	for (let cell = 0; cell < grid.cellCount; cell++) {
		total += (grid.areas[cell] as number) * (field[cell] as number);
		area += grid.areas[cell] as number;
	}
	return total / area;
};

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

/** The largest difference between two fields. */
const largestDifference = (
	a: ArrayLike<number>,
	b: ArrayLike<number>,
	picks: (cell: number) => boolean = () => true,
): number => {
	let largest = 0;
	for (let cell = 0; cell < a.length; cell++) {
		if (picks(cell)) {
			largest = Math.max(
				largest,
				Math.abs((a[cell] as number) - (b[cell] as number)),
			);
		}
	}
	return largest;
};

/** A smooth field linear in the centre's coordinates, of about 12 K range. */
const linear = (x: number, y: number, z: number): number =>
	10 * x + 5 * y + 3 * z;

/**
 * A cell centre's angles along a face's `u` and `v` axes in that face's own
 * equiangular coordinates, in radians from the face's middle; past ±π/4 for
 * a centre beyond the face's edges.
 */
const faceAngles = (
	face: number,
	grid: Grid,
	cell: number,
): [number, number] => {
	const { normal, u, v } = FACE_AXES[face] as (typeof FACE_AXES)[number];
	const p = [0, 1, 2].map((k) => grid.centres[3 * cell + k] as number);
	const dot = (axis: readonly number[]): number =>
		(p[0] as number) * (axis[0] as number) +
		(p[1] as number) * (axis[1] as number) +
		(p[2] as number) * (axis[2] as number);
	const along = dot(normal);
	return [Math.atan(dot(u) / along), Math.atan(dot(v) / along)];
};

/** Whether a fine cell is in its face's outermost row or column. */
const besideEdge = (grid: Grid, cell: number): boolean => {
	const { i, j } = cellCoords(grid, cell);
	return i === 0 || j === 0 || i === grid.n - 1 || j === grid.n - 1;
};

const latitudeOf = (x: number, y: number, z: number): number =>
	(Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;

describe('coarsenWorld', () => {
	it('gives the Earth at 128 from the Earth at 256 exactly', () => {
		expect(coarsenWorld(earthWorld(EARTH, 256))).toEqual(
			earthWorld(EARTH, 128),
		);
	});

	it.each(FINE)(
		'conserves the area-weighted mean elevation at %d',
		(resolution) => {
			const world = generateWorld({ resolution, seed: 5, landFraction: 0.4 });
			const coarse = coarsenWorld(world);
			const before = areaMean(getGrid(resolution), world.elevation);
			const after = areaMean(getGrid(coarse.resolution), coarse.elevation);
			// Each mean is stored in single precision, which moves it by at
			// most a few millimetres.
			expect(Math.abs(after - before)).toBeLessThan(1e-3);
		},
	);

	it('takes each coarse cell as the area-weighted mean of the four it covers', () => {
		const world = generateWorld({
			resolution: 128,
			seed: 9,
			landFraction: 0.3,
		});
		const fine = getGrid(128);
		const coarse = coarsenWorld(world);
		for (const [face, i, j] of [
			[0, 0, 0],
			[2, 17, 40],
			[4, 31, 31],
			[5, 63, 1],
		] as const) {
			let total = 0;
			let area = 0;
			for (const [di, dj] of [
				[0, 0],
				[1, 0],
				[0, 1],
				[1, 1],
			] as const) {
				const cell = cellIndex(fine, face, 2 * i + di, 2 * j + dj);
				total +=
					(fine.areas[cell] as number) * (world.elevation[cell] as number);
				area += fine.areas[cell] as number;
			}
			expect(coarse.elevation[cellIndex(getGrid(64), face, i, j)]).toBe(
				Math.fround(total / area),
			);
		}
	});

	it('makes a coarse cell land by the mean elevation of the four it covers', () => {
		const world = createBlankWorld(128);
		const fine = getGrid(128);
		const set = (i: number, j: number, metres: readonly number[]): void => {
			metres.forEach((value, k) => {
				world.elevation[cellIndex(fine, 0, 2 * i + (k & 1), 2 * j + (k >> 1))] =
					value;
			});
		};
		// Three cells of land and one of deep sea: land on average.
		set(10, 10, [3000, 3000, 3000, -4000]);
		// One cell of low land among sea: sea on average.
		set(20, 20, [100, -400, -400, -400]);
		const coarse = coarsenWorld(world);
		const coarseGrid = getGrid(64);
		expect(coarse.elevation[cellIndex(coarseGrid, 0, 10, 10)]).toBeGreaterThan(
			coarse.seaLevel,
		);
		expect(
			coarse.elevation[cellIndex(coarseGrid, 0, 20, 20)],
		).toBeLessThanOrEqual(coarse.seaLevel);
	});

	it('keeps the sea level, planet, date and origin, with a planet of its own', () => {
		const world: World = {
			...generateWorld({ resolution: 256, seed: 3, landFraction: 0.3 }),
			seaLevel: 120,
			planet: { ...DEFAULT_PLANET, axialTiltDeg: 40, starBrightness: 1.2 },
			ageYears: 1234,
		};
		const coarse = coarsenWorld(world);
		expect(coarse.resolution).toBe(128);
		expect(coarse.elevation).toHaveLength(FACE_COUNT * 128 * 128);
		expect(coarse.seaLevel).toBe(120);
		expect(coarse.planet).toEqual(world.planet);
		expect(coarse.planet).not.toBe(world.planet);
		expect(coarse.ageYears).toBe(1234);
		expect(coarse.origin).toEqual(world.origin);
	});

	it('refuses the coarsest grid, an unsupported one and an elevation of the wrong length', () => {
		expect(() => coarsenWorld(createBlankWorld(64))).toThrow(
			'it has none a step coarser',
		);
		expect(() =>
			coarsenWorld({
				...createBlankWorld(128),
				resolution: 96,
			} as unknown as World),
		).toThrow(RangeError);
		expect(() =>
			coarsenWorld({
				...createBlankWorld(128),
				elevation: new Float32Array(9),
			}),
		).toThrow(RangeError);
	});
});

describe('refinementStencil', () => {
	it.each(FINE)(
		'gives each cell at %d four coarse cells whose weights are not negative and sum to one',
		(resolution) => {
			const { cells, weights } = refinementStencil(resolution);
			const coarseCount = getGrid(resolution / 2).cellCount;
			expect(cells).toHaveLength(4 * getGrid(resolution).cellCount);
			let bad = 0;
			for (let cell = 0; cell < cells.length / 4; cell++) {
				let sum = 0;
				for (let k = 0; k < 4; k++) {
					const weight = weights[4 * cell + k] as number;
					const coarse = cells[4 * cell + k] as number;
					if (!(weight >= 0 && coarse >= 0 && coarse < coarseCount)) {
						bad++;
					}
					sum += weight;
				}
				if (!(Math.abs(sum - 1) < 1e-15)) {
					bad++;
				}
			}
			expect(bad).toBe(0);
		},
	);

	it('weights a cell inside a face 9/16, 3/16, 3/16 and 1/16 by nearness', () => {
		const fine = getGrid(128);
		const coarse = getGrid(64);
		const { cells, weights } = refinementStencil(128);
		// Fine (40, 21) lies in coarse (20, 10), towards (19, 11).
		const cell = cellIndex(fine, 3, 40, 21);
		const byCell = new Map<number, number>();
		for (let k = 0; k < 4; k++) {
			byCell.set(
				cells[4 * cell + k] as number,
				weights[4 * cell + k] as number,
			);
		}
		expect(byCell).toEqual(
			new Map([
				[cellIndex(coarse, 3, 20, 10), 9 / 16],
				[cellIndex(coarse, 3, 19, 10), 3 / 16],
				[cellIndex(coarse, 3, 20, 11), 3 / 16],
				[cellIndex(coarse, 3, 19, 11), 1 / 16],
			]),
		);
	});

	it.each(FINE)(
		'takes barycentric weights over the three corner cells at each cube corner at %d, alike on the three faces',
		(resolution) => {
			const fine = getGrid(resolution);
			const coarse = getGrid(resolution / 2);
			const { cells, weights } = refinementStencil(resolution);
			const last = resolution - 1;
			/** The corner fine cells by the three coarse cells they blend. */
			const corners = new Map<string, { own: number; others: number[] }[]>();
			let withMissing = 0;
			for (let cell = 0; cell < fine.cellCount; cell++) {
				const entry = [0, 1, 2, 3].map((k) => ({
					coarse: cells[4 * cell + k] as number,
					weight: weights[4 * cell + k] as number,
				}));
				if (entry.every(({ weight }) => weight > 0)) {
					continue;
				}
				withMissing++;
				const { face, i, j } = cellCoords(fine, cell);
				expect([0, last]).toContain(i);
				expect([0, last]).toContain(j);
				const used = entry
					.filter(({ weight }) => weight > 0)
					.sort((a, b) => b.weight - a.weight);
				expect(used.map(({ weight }) => weight)).toEqual([
					expect.closeTo(2 / 3, 14),
					expect.closeTo(1 / 6, 14),
					expect.closeTo(1 / 6, 14),
				]);
				// Barycentric: the weighted mean of the three centres, in this
				// face's coordinates, is the fine cell's centre.
				const fineAt = faceAngles(face, fine, cell);
				let blendedS = 0;
				let blendedT = 0;
				for (const { coarse: index, weight } of used) {
					const [s, t] = faceAngles(face, coarse, index);
					blendedS += weight * s;
					blendedT += weight * t;
				}
				expect(blendedS).toBeCloseTo(fineAt[0], 14);
				expect(blendedT).toBeCloseTo(fineAt[1], 14);
				const own = (used[0] as (typeof used)[number]).coarse;
				expect(cellCoords(coarse, own)).toEqual({
					face,
					i: i >> 1,
					j: j >> 1,
				});
				const three = used.map(({ coarse: index }) => index);
				// The three corner cells each touch the other two.
				for (const a of three) {
					for (const b of three) {
						if (a !== b) {
							expect([
								...coarse.neighbours.subarray(4 * a, 4 * a + 4),
							]).toContain(b);
						}
					}
				}
				const key = [...three].sort((a, b) => a - b).join(',');
				corners.set(key, [
					...(corners.get(key) ?? []),
					{ own, others: three.slice(1) },
				]);
			}
			expect(withMissing).toBe(24);
			expect(corners.size).toBe(8);
			for (const [key, around] of corners) {
				// The corner's three faces each give their own corner cell the
				// larger weight: the rule treats them alike.
				expect(around).toHaveLength(3);
				expect(
					around
						.map(({ own }) => own)
						.sort((a, b) => a - b)
						.join(','),
				).toBe(key);
			}
		},
	);
});

describe('refineField', () => {
	it.each(FINE)('carries a constant field exactly at %d', (resolution) => {
		const coarse = new Float64Array(getGrid(resolution / 2).cellCount).fill(
			287.3,
		);
		const fine = refineField(coarse, resolution);
		expect(fine.every((value) => value === 287.3)).toBe(true);
	});

	it.each([
		// Latitude peaks at the poles, where the error is largest.
		[128, 0.05, 0.55],
		[256, 0.015, 0.3],
	])(
		'carries the latitude at %d to within %f° away from the poles and %f° near them',
		(resolution, away, near) => {
			const fine = getGrid(resolution);
			const refined = refineField(
				fieldOf(getGrid(resolution / 2), latitudeOf),
				resolution,
			);
			const latitudes = cellLatitudes(fine);
			const polar = (cell: number): boolean =>
				Math.abs(latitudes[cell] as number) >= 85;
			expect(
				largestDifference(refined, latitudes, (cell) => !polar(cell)),
			).toBeLessThan(away);
			expect(largestDifference(refined, latitudes, polar)).toBeLessThan(near);
		},
	);

	it.each([
		[128, 0.1],
		[256, 0.05],
	])(
		'carries a field of amplitude 10 smooth in longitude at %d to within %f',
		(resolution, bound) => {
			const wave = (x: number, y: number): number =>
				10 * Math.hypot(x, y) * Math.cos(2 * Math.atan2(y, x));
			const refined = refineField(
				fieldOf(getGrid(resolution / 2), wave),
				resolution,
			);
			expect(
				largestDifference(refined, fieldOf(getGrid(resolution), wave)),
			).toBeLessThan(bound);
		},
	);

	it.each([
		[128, 1e-3],
		[256, 2.5e-4],
	])(
		'leaves no step across any cube edge at %d: neighbours either side differ as the field does, to within %f',
		(resolution, bound) => {
			const fine = getGrid(resolution);
			const exact = fieldOf(fine, linear);
			const refined = refineField(
				fieldOf(getGrid(resolution / 2), linear),
				resolution,
			);
			let acrossEdges = 0;
			let withinFaces = 0;
			let pairs = 0;
			for (let cell = 0; cell < fine.cellCount; cell++) {
				const { face } = cellCoords(fine, cell);
				for (let side = 0; side < 4; side++) {
					const other = fine.neighbours[4 * cell + side] as number;
					const error = Math.abs(
						(refined[cell] as number) -
							(refined[other] as number) -
							((exact[cell] as number) - (exact[other] as number)),
					);
					if (cellCoords(fine, other).face === face) {
						withinFaces = Math.max(withinFaces, error);
					} else {
						acrossEdges = Math.max(acrossEdges, error);
						pairs++;
					}
				}
			}
			// Every cell along the twelve edges, seen from both sides.
			expect(pairs).toBe(12 * 2 * resolution);
			expect(acrossEdges).toBeLessThan(bound);
			// No worse than between neighbours within a face, and far below
			// the field's change over a coarse cell, about 0.28 at 128.
			expect(acrossEdges).toBeLessThanOrEqual(withinFaces);
		},
	);

	it.each([
		['x', (x: number): number => x],
		['y', (_x: number, y: number): number => y],
		['z', (_x: number, _y: number, z: number): number => z],
		['x·y', (x: number, y: number): number => x * y],
		[
			'sin(3x + 2y - z)',
			(x: number, y: number, z: number): number => Math.sin(3 * x + 2 * y - z),
		],
	] as const)(
		'carries %s to second order beside cube edges, as inside the faces',
		(_name, value) => {
			/** The largest error beside edges and elsewhere at a resolution. */
			const errors = (resolution: number): { edge: number; inside: number } => {
				const fine = getGrid(resolution);
				const refined = refineField(
					fieldOf(getGrid(resolution / 2), value),
					resolution,
				);
				const exact = fieldOf(fine, value);
				return {
					edge: largestDifference(refined, exact, (cell) =>
						besideEdge(fine, cell),
					),
					inside: largestDifference(
						refined,
						exact,
						(cell) => !besideEdge(fine, cell),
					),
				};
			};
			const at128 = errors(128);
			const at256 = errors(256);
			// Doubling the grid divides the error beside the edges by about
			// four: 3.98 for each of these fields.
			expect(at128.edge / at256.edge).toBeGreaterThan(3.6);
			expect(at128.edge / at256.edge).toBeLessThan(4.4);
			// And it is no more than a quarter above the error inside the
			// faces, from 0.76 of it for x to 1.04 for the sine.
			for (const { edge, inside } of [at128, at256]) {
				expect(edge).toBeLessThan(1.25 * inside);
			}
		},
	);

	it.each(FINE)(
		'reproduces a field linear in a face’s own coordinates on that face, edges and corners included, at %d',
		(resolution) => {
			const fine = getGrid(resolution);
			const coarse = getGrid(resolution / 2);
			for (let face = 0; face < FACE_COUNT; face++) {
				const { normal } = FACE_AXES[face] as (typeof FACE_AXES)[number];
				const linearOnFace = (grid: Grid, cell: number): number => {
					const [s, t] = faceAngles(face, grid, cell);
					return 2 + 3 * s - 5 * t;
				};
				// Cells far from the face, which it never reads, are not a
				// number, so that reading one would show.
				const field = new Float64Array(coarse.cellCount).map((_, cell) => {
					const facing =
						(coarse.centres[3 * cell] as number) * normal[0] +
						(coarse.centres[3 * cell + 1] as number) * normal[1] +
						(coarse.centres[3 * cell + 2] as number) * normal[2];
					return facing > 0.3 ? linearOnFace(coarse, cell) : Number.NaN;
				});
				const refined = refineField(field, resolution);
				let largest = 0;
				const first = face * resolution * resolution;
				for (let cell = first; cell < first + resolution * resolution; cell++) {
					largest = Math.max(
						largest,
						Math.abs((refined[cell] as number) - linearOnFace(fine, cell)),
					);
				}
				// The field spans about 12 here.
				expect(largest).toBeLessThan(1e-13);
			}
		},
	);

	it('keeps each fine cell at a cube corner within the range of the three cells it blends', () => {
		const coarseGrid = getGrid(64);
		const coarse = new Float64Array(coarseGrid.cellCount).map(
			(_, cell) => ((cell * 7919) % 101) - 50,
		);
		const refined = refineField(coarse, 128);
		const { cells, weights } = refinementStencil(128);
		let corners = 0;
		for (let cell = 0; cell < refined.length; cell++) {
			const used = [0, 1, 2, 3]
				.filter((k) => (weights[4 * cell + k] as number) > 0)
				.map((k) => coarse[cells[4 * cell + k] as number] as number);
			if (used.length === 4) {
				continue;
			}
			corners++;
			const value = refined[cell] as number;
			expect(value).toBeGreaterThanOrEqual(Math.min(...used) - 1e-12);
			expect(value).toBeLessThanOrEqual(Math.max(...used) + 1e-12);
			// The three are not all equal, so the test can tell.
			expect(Math.max(...used)).toBeGreaterThan(Math.min(...used));
		}
		expect(corners).toBe(24);
	});

	it('refuses a field or an output of the wrong length, and the coarsest grid', () => {
		expect(() => refineField(new Float64Array(5), 128)).toThrow(RangeError);
		expect(() =>
			refineField(
				new Float64Array(getGrid(64).cellCount),
				128,
				new Float64Array(5),
			),
		).toThrow(RangeError);
		expect(() => refineField(new Float64Array(6), 64)).toThrow(RangeError);
	});
});

/** A uniform flow in three dimensions, made tangent at each cell's centre. */
const uniformFlow = (grid: Grid): VectorField => {
	const flow = createVectorField(grid);
	const along = [3, -4, 12];
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const x = grid.centres[3 * cell] as number;
		const y = grid.centres[3 * cell + 1] as number;
		const z = grid.centres[3 * cell + 2] as number;
		const outward =
			(along[0] as number) * x +
			(along[1] as number) * y +
			(along[2] as number) * z;
		flow.x[cell] = (along[0] as number) - outward * x;
		flow.y[cell] = (along[1] as number) - outward * y;
		flow.z[cell] = (along[2] as number) - outward * z;
	}
	return flow;
};

describe('refineVectors', () => {
	it.each([
		[128, 2e-4],
		[256, 5e-5],
	])(
		'carries a uniform flow of speed 13, made tangent, onto %d to within %f',
		(resolution, bound) => {
			const fine = getGrid(resolution);
			const refined = refineVectors(
				uniformFlow(getGrid(resolution / 2)),
				resolution,
			);
			const exact = uniformFlow(fine);
			let largest = 0;
			for (let cell = 0; cell < fine.cellCount; cell++) {
				largest = Math.max(
					largest,
					Math.hypot(
						(refined.x[cell] as number) - (exact.x[cell] as number),
						(refined.y[cell] as number) - (exact.y[cell] as number),
						(refined.z[cell] as number) - (exact.z[cell] as number),
					),
				);
			}
			expect(largest / 13).toBeLessThan(bound);
		},
		60_000,
	);

	it('gives vectors tangent to the sphere at the fine centres, into the arrays given', () => {
		const fine = getGrid(128);
		const into = createVectorField(fine);
		const refined = refineVectors(uniformFlow(getGrid(64)), 128, into);
		expect(refined).toBe(into);
		let outward = 0;
		for (let cell = 0; cell < fine.cellCount; cell++) {
			outward = Math.max(
				outward,
				Math.abs(
					(into.x[cell] as number) * (fine.centres[3 * cell] as number) +
						(into.y[cell] as number) * (fine.centres[3 * cell + 1] as number) +
						(into.z[cell] as number) * (fine.centres[3 * cell + 2] as number),
				),
			);
		}
		expect(outward).toBeLessThan(1e-13);
	});

	it('writes nothing when any one array is of the wrong length or missing', () => {
		const coarse = uniformFlow(getGrid(64));
		const filled = (): VectorField => {
			const into = createVectorField(getGrid(128));
			into.x.fill(7);
			into.y.fill(7);
			into.z.fill(7);
			return into;
		};
		const wrongs: [VectorField, VectorField][] = [
			[coarse, { ...filled(), z: new Float64Array(5) }],
			[{ ...coarse, z: new Float64Array(5) }, filled()],
			[{ x: coarse.x, y: coarse.y } as unknown as VectorField, filled()],
			[coarse, { x: filled().x, y: filled().y } as unknown as VectorField],
		];
		for (const [from, into] of wrongs) {
			const before = {
				x: into.x?.slice(),
				y: into.y?.slice(),
				z: into.z?.slice(),
			};
			expect(() => refineVectors(from, 128, into)).toThrow(RangeError);
			expect(into.x).toEqual(before.x);
			expect(into.y).toEqual(before.y);
			expect(into.z).toEqual(before.z);
		}
	});

	it('refuses a field or an output of the wrong length, and the coarsest grid', () => {
		const coarse = createVectorField(getGrid(64));
		expect(() =>
			refineVectors({ ...coarse, y: new Float64Array(5) }, 128),
		).toThrow(RangeError);
		expect(() =>
			refineVectors(coarse, 128, {
				...createVectorField(getGrid(128)),
				z: new Float64Array(5),
			}),
		).toThrow(RangeError);
		expect(() => refineVectors(coarse, 64)).toThrow(RangeError);
	});
});

describe('refineMonths', () => {
	/** Twelve months of one sea-level temperature on the 64 grid. */
	const uniform = (kelvin: number): Float64Array[] =>
		Array.from({ length: MONTHS_PER_YEAR }, () =>
			new Float64Array(getGrid(64).cellCount).fill(kelvin),
		);

	it('gives a sea world the sea-level temperature everywhere, in degrees Celsius', () => {
		const months = refineMonths(uniform(290), createBlankWorld(128));
		expect(months).toHaveLength(MONTHS_PER_YEAR);
		const expected = Math.fround(290 - ZERO_CELSIUS_K);
		for (const month of months) {
			expect(month).toHaveLength(getGrid(128).cellCount);
			expect(month.every((value) => value === expected)).toBe(true);
		}
	});

	it('cools a tall cell by its own height, not its coarse cell’s, and leaves its three siblings at sea level', () => {
		const world = createBlankWorld(128);
		const fine = getGrid(128);
		const tall = cellIndex(fine, 2, 30, 50);
		const siblings = [
			cellIndex(fine, 2, 31, 50),
			cellIndex(fine, 2, 30, 51),
			cellIndex(fine, 2, 31, 51),
		];
		world.elevation[tall] = 2000;
		const months = refineMonths(uniform(290), world);
		const cooling = 2000 * TEMPERATURE_MODEL.lapseRate;
		for (const month of months) {
			expect(month[tall]).toBe(Math.fround(290 - cooling - ZERO_CELSIUS_K));
			for (const sibling of siblings) {
				expect(month[sibling]).toBe(Math.fround(290 - ZERO_CELSIUS_K));
			}
		}
	});

	it('refuses months that are not twelve fields on the grid a step coarser', () => {
		const world = createBlankWorld(128);
		expect(() => refineMonths(uniform(290).slice(1), world)).toThrow(
			RangeError,
		);
		expect(() => refineMonths(uniform(290).slice(1), world)).toThrow(
			'A year has 12 months to refine; got 11',
		);
		// Twelve long, but not an array.
		const notArray = { length: MONTHS_PER_YEAR } as unknown as Float64Array[];
		expect(() => refineMonths(notArray, world)).toThrow(RangeError);
		expect(() => refineMonths(notArray, world)).toThrow(
			'A year has 12 months to refine; got object',
		);
		expect(() =>
			refineMonths(
				Array.from({ length: MONTHS_PER_YEAR }, () => new Float64Array(7)),
				world,
			),
		).toThrow(RangeError);
		expect(() => refineMonths(uniform(290), createBlankWorld(64))).toThrow(
			RangeError,
		);
	});
});
