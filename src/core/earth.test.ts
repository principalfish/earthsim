import { describe, expect, it } from 'vitest';
import { readEarthDataFile } from '../../scripts/earth/dataFile.mjs';
import {
	decodeEarth,
	EARTH_DATA_BYTES,
	EARTH_DATA_CELLS,
	EARTH_DATA_RESOLUTION,
	EARTH_ELEVATION_CHECKSUMS,
	type EarthData,
	earthWorld,
	elevationChecksum,
	isMeasuredEarth,
} from './earth';
import { generateWorld } from './generate';
import {
	cellAt,
	cellCentre,
	cellCoords,
	cellIndex,
	directionToLatLon,
	FACE_COUNT,
	getGrid,
	type LatLon,
	latLonToDirection,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import { DEFAULT_PLANET, PLANET_SETTINGS } from './planet';
import { deserializeWorld, serializeWorld } from './serialize';
import { computeTerrainStats } from './stats';
import {
	createBlankWorld,
	DEFAULT_SEA_LEVEL_M,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	type World,
} from './world';

/** The real data, as the page loads it. */
const EARTH = decodeEarth(readEarthDataFile());

const WORLDS: readonly World[] = SUPPORTED_RESOLUTIONS.map((resolution) =>
	earthWorld(EARTH, resolution),
);

/** Data that is level everywhere but for the cells given. */
const dataWith = (
	level: number,
	cells: Readonly<Record<number, number>> = {},
): EarthData => {
	const elevation = new Float32Array(EARTH_DATA_CELLS).fill(level);
	for (const [cell, metres] of Object.entries(cells)) {
		elevation[Number(cell)] = metres;
	}
	return { resolution: EARTH_DATA_RESOLUTION, elevation };
};

/** The elevation of the cell that holds a place, in metres. */
const elevationAt = (
	world: World,
	latitudeDeg: number,
	longitudeDeg: number,
): number =>
	world.elevation[
		cellAt(
			getGrid(world.resolution),
			latLonToDirection(latitudeDeg, longitudeDeg),
		)
	] as number;

/** A place that is plainly land or plainly sea at every resolution. */
type SpotCheck = LatLon & {
	readonly name: string;
	/** Whether the place stands above sea level; otherwise it lies below. */
	readonly land: boolean;
};

const spotChecks = (
	land: boolean,
	places: readonly (readonly [string, number, number])[],
): SpotCheck[] =>
	places.map(([name, latitudeDeg, longitudeDeg]) => ({
		name,
		latitudeDeg,
		longitudeDeg,
		land,
	}));

/**
 * Places spread over every face of the cube so that no face can be flipped,
 * mirrored or turned without one of them changing sides of sea level.
 */
const SPOT_CHECKS: readonly SpotCheck[] = [
	...spotChecks(true, [
		['the central Sahara', 23, 13],
		['central Australia', -25, 134],
		['central Brazil', -10, -55],
		['the South Pole', -90, 0],
		['equatorial Africa', 0, 20],
		['the Great Plains', 40, -100],
		['central India', 20, 78],
		['Siberia', 62, 100],
		['the ice of Greenland', 72, -40],
		['Iberia', 40, -4],
		['the Ethiopian Highlands', 9, 40],
		['New Guinea', -5, 142],
		['New Zealand', -42, 172],
		['the Gobi', 42, 105],
		['Borneo', 0, 114],
		['the Mexican Plateau', 23, -102],
		['the Bolivian Andes', -18, -66],
		['Patagonia', -45, -69],
	]),
	...spotChecks(false, [
		['the middle of the Pacific', 0, -160],
		['the middle of the Atlantic', 30, -40],
		['the North Pole', 90, 0],
		['the Gulf of Guinea side of the Atlantic', 0, -20],
		['the Arabian Sea', 12, 63],
		['the Bay of Bengal', 13, 88],
		['the Indian Ocean', -30, 80],
		['the Southern Ocean', -55, -120],
		['the Norwegian Sea', 68, 0],
		['the Weddell Sea', -72, -45],
		['the Amundsen Sea', -72, -110],
	]),
];

/** Whether a place is on the side of sea level it should be on. */
const spotCheckHolds = (world: World, spot: SpotCheck): boolean => {
	const metres = elevationAt(world, spot.latitudeDeg, spot.longitudeDeg);
	return spot.land ? metres > world.seaLevel : metres < world.seaLevel;
};

/** Whether every place is on the side of sea level it should be on. */
const spotChecksHold = (world: World): boolean =>
	SPOT_CHECKS.every((spot) => spotCheckHolds(world, spot));

/** Where cell `(i, j)` of a face of `n` cells a side takes its value from. */
type FaceSymmetry = (
	i: number,
	j: number,
	n: number,
) => readonly [number, number];

/** Every way of laying a square on itself but for leaving it as it is. */
const FACE_SYMMETRIES: Readonly<Record<string, FaceSymmetry>> = {
	'flip-i': (i, j, n) => [n - 1 - i, j],
	'flip-j': (i, j, n) => [i, n - 1 - j],
	transpose: (i, j) => [j, i],
	'anti-transpose': (i, j, n) => [n - 1 - j, n - 1 - i],
	rot90: (i, j, n) => [j, n - 1 - i],
	rot180: (i, j, n) => [n - 1 - i, n - 1 - j],
	rot270: (i, j, n) => [n - 1 - j, i],
};

/** The data with the cells of one face moved about and the rest as it is. */
const withFaceMoved = (
	data: EarthData,
	face: number,
	from: FaceSymmetry,
): EarthData => {
	const n = EARTH_DATA_RESOLUTION;
	const elevation = Float32Array.from(data.elevation);
	const start = face * n * n;
	for (let j = 0; j < n; j++) {
		for (let i = 0; i < n; i++) {
			const [fromI, fromJ] = from(i, j, n);
			elevation[start + j * n + i] = data.elevation[
				start + fromJ * n + fromI
			] as number;
		}
	}
	return { resolution: n, elevation };
};

/** Where the centre of a world's highest or deepest cell is. */
const extremeOf = (world: World, sign: 1 | -1): LatLon & { metres: number } => {
	let extreme = 0;
	world.elevation.forEach((metres, cell) => {
		if (sign * metres > sign * (world.elevation[extreme] as number)) {
			extreme = cell;
		}
	});
	return {
		...directionToLatLon(cellCentre(getGrid(world.resolution), extreme)),
		metres: world.elevation[extreme] as number,
	};
};

describe('the format', () => {
	it('is one 16-bit value for each cell of the finest grid', () => {
		expect(EARTH_DATA_RESOLUTION).toBe(256);
		expect(EARTH_DATA_CELLS).toBe(393_216);
		expect(EARTH_DATA_BYTES).toBe(786_432);
		expect(getGrid(EARTH_DATA_RESOLUTION).cellCount).toBe(EARTH_DATA_CELLS);
	});
});

describe('decodeEarth', () => {
	it('reads signed 16-bit values, little-endian, in cell order', () => {
		const bytes = new Uint8Array(EARTH_DATA_BYTES);
		bytes.set([0x34, 0x12, 0xfe, 0xff, 0xff, 0x7f, 0x00, 0x80]);
		bytes.set([0x01, 0x00, 0x00, 0x01], EARTH_DATA_BYTES - 4);
		const { resolution, elevation } = decodeEarth(bytes);
		expect(resolution).toBe(256);
		expect(elevation).toBeInstanceOf(Float32Array);
		expect(elevation.length).toBe(EARTH_DATA_CELLS);
		expect([...elevation.subarray(0, 5)]).toEqual([
			0x1234, -2, 32_767, -32_768, 0,
		]);
		expect([...elevation.subarray(EARTH_DATA_CELLS - 2)]).toEqual([1, 256]);
	});

	it('gives elevations that owe nothing to the bytes, which it leaves alone', () => {
		const bytes = new Uint8Array(EARTH_DATA_BYTES).fill(1);
		const { elevation } = decodeEarth(bytes);
		expect(bytes.every((byte) => byte === 1)).toBe(true);
		bytes.fill(0);
		expect(elevation.every((metres) => metres === 0x0101)).toBe(true);
	});

	it('reads bytes that are part of a larger buffer', () => {
		const buffer = new Uint8Array(EARTH_DATA_BYTES + 7).fill(0xee);
		const bytes = buffer.subarray(3, 3 + EARTH_DATA_BYTES);
		bytes.fill(0);
		bytes.set([0x0a, 0x00]);
		bytes.set([0xf6, 0xff], EARTH_DATA_BYTES - 2);
		const { elevation } = decodeEarth(bytes);
		expect(elevation[0]).toBe(10);
		expect(elevation[1]).toBe(0);
		expect(elevation[EARTH_DATA_CELLS - 1]).toBe(-10);
	});

	it('refuses bytes of any other length', () => {
		for (const length of [
			0,
			1,
			EARTH_DATA_BYTES - 1,
			EARTH_DATA_BYTES + 1,
			EARTH_DATA_BYTES / 4,
			EARTH_DATA_BYTES * 2,
		]) {
			expect(() => decodeEarth(new Uint8Array(length)), `${length}`).toThrow(
				RangeError,
			);
		}
		expect(() => decodeEarth(new Uint8Array(EARTH_DATA_BYTES - 1))).toThrow(
			'The Earth data file is 786432 bytes long; got 786431',
		);
	});
});

describe('earthWorld', () => {
	it('makes a world of the resolution asked for, at the default sea level', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const world = earthWorld(dataWith(-100), resolution);
			expect(world.resolution).toBe(resolution);
			expect(world.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
			expect(world.origin).toEqual({ kind: 'earth' });
			expect(world.elevation).toBeInstanceOf(Float32Array);
			expect(world.elevation.length).toBe(6 * resolution * resolution);
		}
	});

	it('starts with Earth’s planet settings, its own copy, at year zero: today', () => {
		const world = earthWorld(dataWith(-100), 64);
		expect(world.planet).toEqual(DEFAULT_PLANET);
		expect(world.planet).not.toBe(DEFAULT_PLANET);
		expect(world.ageYears).toBe(0);
	});

	it('holds the data as it is at the resolution of the data', () => {
		const world = earthWorld(EARTH, EARTH_DATA_RESOLUTION);
		expect(world.elevation).toEqual(EARTH.elevation);
	});

	it('gives a world whose elevation is its own', () => {
		const data = dataWith(5);
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const world = earthWorld(data, resolution);
			expect(world.elevation.buffer).not.toBe(data.elevation.buffer);
			world.elevation.fill(-1);
			expect(earthWorld(data, resolution).elevation).not.toBe(world.elevation);
		}
		expect(data.elevation.every((metres) => metres === 5)).toBe(true);
	});

	it('nests each coarser grid in the grid of the data', () => {
		const fine = getGrid(EARTH_DATA_RESOLUTION);
		for (const resolution of [64, 128] as const) {
			const coarse = getGrid(resolution);
			const block = EARTH_DATA_RESOLUTION / resolution;
			const areas = new Float64Array(coarse.cellCount);
			let outside = 0;
			for (let cell = 0; cell < fine.cellCount; cell++) {
				const { face, i, j } = cellCoords(fine, cell);
				const parent = cellIndex(
					coarse,
					face,
					Math.floor(i / block),
					Math.floor(j / block),
				);
				// The centre of a fine cell lies well inside its coarse one.
				if (cellAt(coarse, cellCentre(fine, cell)) !== parent) {
					outside++;
				}
				areas[parent] =
					(areas[parent] as number) + (fine.areas[cell] as number);
			}
			expect(outside, `${resolution}`).toBe(0);
			let unequal = 0;
			for (let cell = 0; cell < coarse.cellCount; cell++) {
				const area = coarse.areas[cell] as number;
				if (!(Math.abs((areas[cell] as number) - area) < 1e-9 * area)) {
					unequal++;
				}
			}
			expect(unequal, `${resolution}`).toBe(0);
		}
	});

	it('gives a coarser world the area-weighted means of the data', () => {
		const fine = getGrid(EARTH_DATA_RESOLUTION);
		for (const resolution of [64, 128] as const) {
			const coarse = getGrid(resolution);
			const block = EARTH_DATA_RESOLUTION / resolution;
			const sums = new Float64Array(coarse.cellCount);
			const areas = new Float64Array(coarse.cellCount);
			for (let cell = 0; cell < fine.cellCount; cell++) {
				const { face, i, j } = cellCoords(fine, cell);
				const parent = cellIndex(
					coarse,
					face,
					Math.floor(i / block),
					Math.floor(j / block),
				);
				const area = fine.areas[cell] as number;
				sums[parent] =
					(sums[parent] as number) + area * (EARTH.elevation[cell] as number);
				areas[parent] = (areas[parent] as number) + area;
			}
			const { elevation } = earthWorld(EARTH, resolution);
			let different = 0;
			for (let cell = 0; cell < coarse.cellCount; cell++) {
				const mean = (sums[cell] as number) / (areas[cell] as number);
				// Single precision holds a height of some kilometres to
				// within a millimetre.
				if (!(Math.abs((elevation[cell] as number) - mean) < 1e-3)) {
					different++;
				}
			}
			expect(different, `${resolution}`).toBe(0);
		}
	});

	it('weights by area: the mean differs from a plain mean of the cells', () => {
		// The corner of a face, where the cells of a block differ most in
		// area: the corner cell is the smallest of its sixteen.
		const fine = getGrid(EARTH_DATA_RESOLUTION);
		const data = dataWith(0, { 0: 10_000 });
		const { elevation } = earthWorld(data, 64);
		let blockArea = 0;
		for (let j = 0; j < 4; j++) {
			for (let i = 0; i < 4; i++) {
				blockArea += fine.areas[j * EARTH_DATA_RESOLUTION + i] as number;
			}
		}
		const expected = (10_000 * (fine.areas[0] as number)) / blockArea;
		expect(elevation[0]).toBeCloseTo(expected, 3);
		expect(10_000 / 16 - (elevation[0] as number)).toBeGreaterThan(0.01);
		expect(elevation[1]).toBe(0);
	});

	it('keeps level data level at every resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const { elevation } = earthWorld(dataWith(-4321), resolution);
			expect(elevation.every((metres) => metres === -4321)).toBe(true);
		}
	});

	it('brings elevations beyond what a cell can hold to the limits', () => {
		const data = dataWith(0, { 0: 20_000, 1: -20_000 });
		const world = earthWorld(data, EARTH_DATA_RESOLUTION);
		expect(world.elevation[0]).toBe(MAX_ELEVATION_M);
		expect(world.elevation[1]).toBe(MIN_ELEVATION_M);
		expect(data.elevation[0]).toBe(20_000);
		for (const resolution of [64, 128]) {
			const high = earthWorld(dataWith(30_000), resolution);
			expect(high.elevation.every((metres) => metres === MAX_ELEVATION_M)).toBe(
				true,
			);
		}
	});

	it('refuses a resolution that is not supported', () => {
		for (const resolution of [0, 32, 100, 512, 64.5, Number.NaN]) {
			expect(() => earthWorld(EARTH, resolution), `${resolution}`).toThrow(
				RangeError,
			);
		}
		expect(() => earthWorld(EARTH, 100)).toThrow(
			'Unsupported world resolution 100: expected one of 64, 128, 256',
		);
	});

	it('refuses data that is not one elevation to a cell, or holds NaN', () => {
		const short: EarthData = {
			resolution: EARTH_DATA_RESOLUTION,
			elevation: new Float32Array(EARTH_DATA_CELLS - 1),
		};
		expect(() => earthWorld(short, 64)).toThrow(
			'Earth data holds 393216 elevations; got 393215',
		);
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			expect(() =>
				earthWorld(dataWith(0, { 77: Number.NaN }), resolution),
			).toThrow(RangeError);
		}
	});
});

describe('the Earth', () => {
	it('is stored in whole metres within what a cell can hold', () => {
		for (const metres of EARTH.elevation) {
			if (
				!Number.isInteger(metres) ||
				metres < MIN_ELEVATION_M ||
				metres > MAX_ELEVATION_M
			) {
				expect.fail(`The data holds ${metres}`);
			}
		}
	});

	it('is between 27% and 31% land at every resolution', () => {
		for (const world of WORLDS) {
			const { landFraction } = computeTerrainStats(world);
			expect(landFraction, `${world.resolution}`).toBeGreaterThan(0.27);
			expect(landFraction, `${world.resolution}`).toBeLessThan(0.31);
		}
	});

	it('is highest in the Himalaya and Tibet region', () => {
		// As cell means, the high plateau of western Tibet and the Kunlun
		// outdoes the single peaks of the Himalaya: about 35° north, 78° to
		// 81° east at every resolution.
		for (const world of WORLDS) {
			const { latitudeDeg, longitudeDeg, metres } = extremeOf(world, 1);
			const where = `${world.resolution}: ${metres} m at ${latitudeDeg}, ${longitudeDeg}`;
			expect(latitudeDeg, where).toBeGreaterThan(26);
			expect(latitudeDeg, where).toBeLessThan(40);
			expect(longitudeDeg, where).toBeGreaterThan(70);
			expect(longitudeDeg, where).toBeLessThan(105);
			expect(metres, where).toBeGreaterThan(5000);
			expect(metres, where).toBeLessThan(8849);
		}
	});

	it('is deepest in the trenches of the western Pacific', () => {
		// As cell means the deepest is the Mariana Trench at the finest
		// and the coarsest resolution, and the Tonga Trench, at 23° south
		// and 175° west, at the one between. Both lie in the box from 120°
		// east across the date line to 170° west.
		for (const world of WORLDS) {
			const { latitudeDeg, longitudeDeg, metres } = extremeOf(world, -1);
			const where = `${world.resolution}: ${metres} m at ${latitudeDeg}, ${longitudeDeg}`;
			expect(latitudeDeg, where).toBeGreaterThan(-40);
			expect(latitudeDeg, where).toBeLessThan(40);
			expect(longitudeDeg > 120 || longitudeDeg < -170, where).toBe(true);
			expect(metres, where).toBeLessThan(-7000);
			expect(metres, where).toBeGreaterThan(-11_000);
		}
		const finest = extremeOf(earthWorld(EARTH, EARTH_DATA_RESOLUTION), -1);
		expect(finest.latitudeDeg).toBeGreaterThan(10);
		expect(finest.latitudeDeg).toBeLessThan(13);
		expect(finest.longitudeDeg).toBeGreaterThan(141);
		expect(finest.longitudeDeg).toBeLessThan(146);
	});

	it.each(SPOT_CHECKS.filter(({ land }) => land))(
		'has land at $name',
		(spot) => {
			for (const world of WORLDS) {
				expect(
					spotCheckHolds(world, spot),
					`${world.resolution}: ${elevationAt(world, spot.latitudeDeg, spot.longitudeDeg)} m`,
				).toBe(true);
			}
		},
	);

	it.each(SPOT_CHECKS.filter(({ land }) => !land))(
		'has sea at $name',
		(spot) => {
			for (const world of WORLDS) {
				expect(
					spotCheckHolds(world, spot),
					`${world.resolution}: ${elevationAt(world, spot.latitudeDeg, spot.longitudeDeg)} m`,
				).toBe(true);
			}
		},
	);

	it('fails a spot check if any one face is flipped, mirrored or turned', () => {
		// 126 worlds, built and checked in about a quarter of a second, and
		// in some twenty times that when coverage is being measured.
		expect(WORLDS.every(spotChecksHold)).toBe(true);
		const missed: string[] = [];
		for (let face = 0; face < FACE_COUNT; face++) {
			for (const [name, from] of Object.entries(FACE_SYMMETRIES)) {
				const data = withFaceMoved(EARTH, face, from);
				for (const resolution of SUPPORTED_RESOLUTIONS) {
					if (spotChecksHold(earthWorld(data, resolution))) {
						missed.push(`${name} of face ${face} at ${resolution}`);
					}
				}
			}
		}
		expect(missed).toEqual([]);
	}, 60_000);

	it('stands high on the ice of Greenland and Antarctica', () => {
		for (const world of WORLDS) {
			expect(
				elevationAt(world, 72, -40),
				`${world.resolution}`,
			).toBeGreaterThan(2000);
			expect(
				elevationAt(world, -80, 90),
				`${world.resolution}`,
			).toBeGreaterThan(2500);
			expect(elevationAt(world, -90, 0), `${world.resolution}`).toBeGreaterThan(
				2500,
			);
		}
	});

	it('is deep at the Mariana Trench and shallow at the North Sea', () => {
		for (const world of WORLDS) {
			expect(
				elevationAt(world, 11.3, 142.2),
				`${world.resolution}`,
			).toBeLessThan(-5000);
			const northSea = elevationAt(world, 56, 3);
			expect(northSea, `${world.resolution}`).toBeLessThan(0);
			expect(northSea, `${world.resolution}`).toBeGreaterThan(-300);
		}
	});

	it('has more of its land in the north than in the south', () => {
		for (const world of WORLDS) {
			const { centres, areas, cellCount } = getGrid(world.resolution);
			let north = 0;
			let south = 0;
			for (let cell = 0; cell < cellCount; cell++) {
				if ((world.elevation[cell] as number) > world.seaLevel) {
					if ((centres[3 * cell + 2] as number) > 0) {
						north += areas[cell] as number;
					} else {
						south += areas[cell] as number;
					}
				}
			}
			// About two thirds of the land lies north of the equator.
			expect(north / (north + south), `${world.resolution}`).toBeGreaterThan(
				0.6,
			);
			expect(north / (north + south), `${world.resolution}`).toBeLessThan(0.75);
		}
	});
});

describe('elevationChecksum', () => {
	it('is the FNV-1a hash of the values’ bit patterns, a word to a value', () => {
		// FNV-1a of no words is its offset basis.
		expect(elevationChecksum(new Float32Array(0))).toBe(0x811c9dc5);
		// One word: the basis XOR the word, times the prime, in 32 bits.
		const one = Float32Array.of(1);
		const bits = new Uint32Array(one.buffer)[0] as number;
		expect(elevationChecksum(one)).toBe(
			Math.imul(0x811c9dc5 ^ bits, 0x01000193) >>> 0,
		);
	});

	it('tells apart arrays that differ in one bit or in their order', () => {
		const base = elevationChecksum(Float32Array.of(1, 2, 3));
		expect(elevationChecksum(Float32Array.of(1, 2, 3))).toBe(base);
		expect(elevationChecksum(Float32Array.of(1, 3, 2))).not.toBe(base);
		expect(elevationChecksum(Float32Array.of(0))).not.toBe(
			elevationChecksum(Float32Array.of(-0)),
		);
		const nudged = Float32Array.of(1, 2, 3);
		const words = new Uint32Array(nudged.buffer);
		words[1] = (words[1] as number) ^ 1;
		expect(elevationChecksum(nudged)).not.toBe(base);
	});

	it('reads only the cells of a view into a larger buffer', () => {
		const buffer = new Float32Array([9, 1, 2, 3, 9]);
		expect(elevationChecksum(buffer.subarray(1, 4))).toBe(
			elevationChecksum(Float32Array.of(1, 2, 3)),
		);
	});

	it('gives the committed checksum for the Earth at every resolution', () => {
		for (const world of WORLDS) {
			expect(elevationChecksum(world.elevation), `${world.resolution}`).toBe(
				EARTH_ELEVATION_CHECKSUMS[world.resolution],
			);
		}
	});
});

describe('isMeasuredEarth', () => {
	/** A fresh Earth world at the resolution, with its own elevation. */
	const freshEarth = (resolution: number): World =>
		earthWorld(EARTH, resolution);

	it('holds for the Earth preset at every resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			expect(isMeasuredEarth(freshEarth(resolution)), `${resolution}`).toBe(
				true,
			);
		}
	});

	it('stops holding when one cell changes, and holds again once it is put back', () => {
		const world = freshEarth(64);
		const before = world.elevation[1000] as number;
		world.elevation[1000] = before + 1;
		expect(isMeasuredEarth(world)).toBe(false);
		world.elevation[1000] = before;
		expect(isMeasuredEarth(world)).toBe(true);
	});

	it('does not hold at another sea level, and holds again at the preset’s', () => {
		const world = freshEarth(64);
		world.seaLevel = 10;
		expect(isMeasuredEarth(world)).toBe(false);
		world.seaLevel = DEFAULT_SEA_LEVEL_M;
		expect(isMeasuredEarth(world)).toBe(true);
	});

	it.each(PLANET_SETTINGS)('does not hold with another %s', (name) => {
		const world = freshEarth(64);
		world.planet = { ...DEFAULT_PLANET, [name]: DEFAULT_PLANET[name] * 1.01 };
		expect(isMeasuredEarth(world)).toBe(false);
		world.planet = { ...DEFAULT_PLANET };
		expect(isMeasuredEarth(world)).toBe(true);
	});

	it('does not hold with a day of 10 hours, and holds again at 24', () => {
		const world = freshEarth(64);
		world.planet = { ...DEFAULT_PLANET, dayLengthHours: 10 };
		expect(isMeasuredEarth(world)).toBe(false);
		world.planet = { ...DEFAULT_PLANET, dayLengthHours: 24 };
		expect(isMeasuredEarth(world)).toBe(true);
	});

	it('does not hold for a generated or a blank world, even with the Earth’s terrain', () => {
		expect(
			isMeasuredEarth(
				generateWorld({ resolution: 64, seed: 1, landFraction: 0.3 }),
			),
		).toBe(false);
		expect(isMeasuredEarth(createBlankWorld(64))).toBe(false);
		const earth = freshEarth(64);
		expect(isMeasuredEarth({ ...earth, origin: { kind: 'blank' } })).toBe(
			false,
		);
	});

	it('does not hold for the Earth’s terrain of one resolution under another', () => {
		const earth = freshEarth(64);
		expect(isMeasuredEarth({ ...earth, resolution: 128 })).toBe(false);
	});

	it('still holds for an Earth world written to a file and read back', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const read = deserializeWorld(serializeWorld(freshEarth(resolution)));
			if (!read.ok) {
				throw new Error(`The Earth at ${resolution} could not be read back`);
			}
			expect(isMeasuredEarth(read.world), `${resolution}`).toBe(true);
		}
	});
});
