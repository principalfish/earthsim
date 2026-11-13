import { describe, expect, it } from 'vitest';
import { generateWorld } from './generate';
import { FACE_COUNT, SUPPORTED_RESOLUTIONS } from './grid';
import { MAX_SEED } from './noise';
import {
	DEFAULT_PLANET,
	PLANET_LIMITS,
	PLANET_SETTINGS,
	type PlanetSettings,
} from './planet';
import {
	deserializeWorld,
	MAX_WORLD_FILE_BYTES,
	MAX_WORLD_FILE_HEADER_BYTES,
	serializeWorld,
	WORLD_FILE_MARKER,
	WORLD_FILE_PREFIX_BYTES,
	WORLD_FILE_VERSION,
	type WorldFileError,
} from './serialize';
import {
	BLANK_OCEAN_ELEVATION_M,
	createBlankWorld,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	normaliseSeaLevel,
	type World,
	type WorldOrigin,
} from './world';

const VERSION_OFFSET = 8;
const HEADER_LENGTH_OFFSET = 12;
/** The header of a blank 64 as written before planets and dates were. */
const BLANK_HEADER = '{"resolution":64,"seaLevel":0,"origin":{"kind":"blank"}}';
/** Earth's settings and year zero, as the header holds them. */
const EARTH_PLANET_FIELDS =
	'"planet":{"axialTiltDeg":23.44,"starBrightness":1,"starMass":1,"orbitDistanceAu":1,"greenhouseStrength":1},"ageYears":0';
/** The header written for a blank 64. */
const WRITTEN_BLANK_HEADER = `{"resolution":64,"seaLevel":0,"origin":{"kind":"blank"},${EARTH_PLANET_FIELDS}}`;
const CELLS_64 = FACE_COUNT * 64 * 64;

/** The bytes of a text in ASCII. */
const asciiBytes = (text: string): Uint8Array =>
	Uint8Array.from(text, (character) => character.charCodeAt(0));

/** Values as little-endian 32-bit floats. */
const floatBytes = (values: ArrayLike<number>): Uint8Array => {
	const bytes = new Uint8Array(values.length * 4);
	const view = new DataView(bytes.buffer);
	for (let index = 0; index < values.length; index++) {
		view.setFloat32(index * 4, values[index] as number, true);
	}
	return bytes;
};

/** The parts a world file is put together from, right or wrong. */
type FileParts = {
	readonly marker?: string;
	readonly version?: number;
	/** The header, as text or as raw bytes. */
	readonly header?: string | Uint8Array;
	/** The header length to declare; the header's own when left out. */
	readonly headerLength?: number;
	/** What follows the header; a blank ocean at 64 when left out. */
	readonly data?: Uint8Array;
};

/** A file built by hand, part by part, with a valid part for each left out. */
const fileOf = (parts: FileParts = {}): Uint8Array => {
	const marker = asciiBytes(parts.marker ?? WORLD_FILE_MARKER);
	const header =
		typeof parts.header === 'string' || parts.header === undefined
			? asciiBytes(parts.header ?? BLANK_HEADER)
			: parts.header;
	const data =
		parts.data ??
		floatBytes(new Float32Array(CELLS_64).fill(BLANK_OCEAN_ELEVATION_M));
	const bytes = new Uint8Array(marker.length + 8 + header.length + data.length);
	const view = new DataView(bytes.buffer);
	bytes.set(marker, 0);
	view.setUint32(marker.length, parts.version ?? WORLD_FILE_VERSION, true);
	view.setUint32(marker.length + 4, parts.headerLength ?? header.length, true);
	bytes.set(header, marker.length + 8);
	bytes.set(data, marker.length + 8 + header.length);
	return bytes;
};

/** A file whose header is the JSON of a value and whose data is a blank 64. */
const fileWithHeader = (header: unknown): Uint8Array =>
	fileOf({ header: JSON.stringify(header) });

/** The header of a file, as text. */
const headerText = (bytes: Uint8Array): string => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const length = view.getUint32(HEADER_LENGTH_OFFSET, true);
	return String.fromCharCode(
		...bytes.subarray(
			WORLD_FILE_PREFIX_BYTES,
			WORLD_FILE_PREFIX_BYTES + length,
		),
	);
};

/** Where a file's elevation starts. */
const dataOffsetOf = (bytes: Uint8Array): number =>
	WORLD_FILE_PREFIX_BYTES + headerText(bytes).length;

/** A valid file with one elevation overwritten. */
const fileWithElevation = (cell: number, value: number): Uint8Array => {
	const bytes = serializeWorld(createBlankWorld(64));
	new DataView(bytes.buffer).setFloat32(
		dataOffsetOf(bytes) + cell * 4,
		value,
		true,
	);
	return bytes;
};

/** The world a file holds, which must be readable. */
const worldOf = (bytes: Uint8Array): World => {
	const result = deserializeWorld(bytes);
	if (!result.ok) {
		throw new Error(`The file was refused: ${result.error}`);
	}
	return result.world;
};

/** Why a file is refused, which it must be. */
const errorOf = (bytes: Uint8Array): WorldFileError => {
	const result = deserializeWorld(bytes);
	if (result.ok) {
		throw new Error('The file was read as a world');
	}
	return result.error;
};

/**
 * The first cell at which two elevation arrays differ in any bit, a
 * negative zero against a zero included; -1 if they are the same.
 */
const firstDifference = (a: Float32Array, b: Float32Array): number => {
	if (a.length !== b.length) {
		return Math.min(a.length, b.length);
	}
	const aBits = new Uint32Array(a.buffer, a.byteOffset, a.length);
	const bBits = new Uint32Array(b.buffer, b.byteOffset, b.length);
	for (let cell = 0; cell < a.length; cell++) {
		if (aBits[cell] !== bBits[cell]) {
			return cell;
		}
	}
	return -1;
};

/** Random numbers from 0 up to 1 that are the same on every run. */
const createRandom = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
	};
};

/** A world with terrain, a sea level and awkward values in its first cells. */
const sculptedWorld = (resolution: number): World => {
	const world = generateWorld({ resolution, seed: 1977, landFraction: 0.3 });
	world.seaLevel = normaliseSeaLevel(-1234.5);
	world.elevation.set([
		-0,
		0,
		MAX_ELEVATION_M,
		MIN_ELEVATION_M,
		Math.fround(0.1),
		1e-45,
		-1e-45,
	]);
	return world;
};

const ALL_ERRORS: readonly WorldFileError[] = [
	'bad-marker',
	'truncated',
	'unknown-version',
	'header-too-long',
	'bad-header',
	'bad-resolution',
	'bad-planet',
	'bad-age',
	'bad-length',
	'not-finite',
];

describe('the format', () => {
	it('starts with an eight-character ASCII marker and is at version 1', () => {
		expect(WORLD_FILE_MARKER).toBe('EARTHSIM');
		expect(WORLD_FILE_VERSION).toBe(1);
		expect(WORLD_FILE_PREFIX_BYTES).toBe(16);
	});

	it('caps the header at a few kilobytes', () => {
		expect(MAX_WORLD_FILE_HEADER_BYTES).toBe(4096);
	});

	it('puts the largest file at the finest world under the longest header', () => {
		const finest = Math.max(...SUPPORTED_RESOLUTIONS);
		expect(MAX_WORLD_FILE_BYTES).toBe(
			16 + 4096 + 4 * FACE_COUNT * finest * finest,
		);
	});
});

describe('serializeWorld', () => {
	it('writes the marker, the version, the header and its length, then the elevation', () => {
		const world = createBlankWorld(64);
		world.elevation[1] = 1;
		const bytes = serializeWorld(world);
		const view = new DataView(bytes.buffer);

		expect(String.fromCharCode(...bytes.subarray(0, 8))).toBe('EARTHSIM');
		expect([...bytes.subarray(VERSION_OFFSET, VERSION_OFFSET + 4)]).toEqual([
			1, 0, 0, 0,
		]);
		expect(view.getUint32(HEADER_LENGTH_OFFSET, true)).toBe(
			WRITTEN_BLANK_HEADER.length,
		);
		expect(headerText(bytes)).toBe(WRITTEN_BLANK_HEADER);
		expect(bytes).toHaveLength(16 + WRITTEN_BLANK_HEADER.length + 4 * CELLS_64);

		// -4000 is 0xc57a0000 and 1 is 0x3f800000 as 32-bit floats, written
		// lowest byte first.
		const data = dataOffsetOf(bytes);
		expect([...bytes.subarray(data, data + 8)]).toEqual([
			0x00, 0x00, 0x7a, 0xc5, 0x00, 0x00, 0x80, 0x3f,
		]);
	});

	it('writes the settings of a generated world into the header', () => {
		const world = generateWorld({ seed: 7, landFraction: 0.25 });
		world.seaLevel = normaliseSeaLevel(-250);
		expect(JSON.parse(headerText(serializeWorld(world)))).toEqual({
			resolution: 64,
			seaLevel: -250,
			origin: { kind: 'generated', seed: 7, landFraction: 0.25 },
			planet: DEFAULT_PLANET,
			ageYears: 0,
		});
	});

	it('writes the planet’s settings and the date into the header', () => {
		const world: World = {
			...createBlankWorld(64),
			planet: {
				axialTiltDeg: 60,
				starBrightness: 2.5,
				starMass: 0.8,
				orbitDistanceAu: 1.5,
				greenhouseStrength: 0,
			},
			ageYears: 12_000,
		};
		expect(headerText(serializeWorld(world))).toBe(
			'{"resolution":64,"seaLevel":0,"origin":{"kind":"blank"},"planet":{"axialTiltDeg":60,"starBrightness":2.5,"starMass":0.8,"orbitDistanceAu":1.5,"greenhouseStrength":0},"ageYears":12000}',
		);
	});

	it('writes only the settings a planet has', () => {
		const planet = {
			note: 'left over',
			greenhouseStrength: 1,
			starMass: 1,
			orbitDistanceAu: 1,
			starBrightness: 1,
			axialTiltDeg: 23.44,
		} as PlanetSettings;
		expect(
			headerText(serializeWorld({ ...createBlankWorld(64), planet })),
		).toBe(WRITTEN_BLANK_HEADER);
	});

	it('writes that a world started as the Earth into the header', () => {
		const world: World = {
			...createBlankWorld(128),
			origin: { kind: 'earth' },
		};
		expect(headerText(serializeWorld(world))).toBe(
			`{"resolution":128,"seaLevel":0,"origin":{"kind":"earth"},${EARTH_PLANET_FIELDS}}`,
		);
	});

	it('writes only the fields an origin of its kind has', () => {
		const origin = {
			kind: 'blank',
			seed: 5,
			note: 'left over',
		} as unknown as WorldOrigin;
		const bytes = serializeWorld({ ...createBlankWorld(64), origin });
		expect(headerText(bytes)).toBe(WRITTEN_BLANK_HEADER);

		const earth = {
			kind: 'earth',
			seed: 5,
			landFraction: 0.29,
		} as unknown as WorldOrigin;
		expect(
			headerText(serializeWorld({ ...createBlankWorld(64), origin: earth })),
		).toBe(
			`{"resolution":64,"seaLevel":0,"origin":{"kind":"earth"},${EARTH_PLANET_FIELDS}}`,
		);
	});

	it('keeps the header far below the cap for the longest values there are', () => {
		const world: World = {
			...createBlankWorld(256),
			seaLevel: normaliseSeaLevel(-11999.9990234375),
			origin: {
				kind: 'generated',
				seed: MAX_SEED,
				landFraction: 0.1 + 0.2,
			},
			planet: {
				axialTiltDeg: 0.1 + 0.2,
				starBrightness: 1 / 3 + 1e-15,
				starMass: 0.1 + 0.7,
				orbitDistanceAu: 2 / 3 + 1e-15,
				greenhouseStrength: 0.1 + 0.2,
			},
			ageYears: 1.2345678901234567e300,
		};
		const header = headerText(serializeWorld(world));
		expect(header.length).toBeLessThan(400);
		expect(header.length).toBeLessThan(MAX_WORLD_FILE_HEADER_BYTES);
	});

	it('leaves the world as it was and gives bytes of their own each time', () => {
		const world = sculptedWorld(64);
		const elevation = world.elevation.slice();
		const first = serializeWorld(world);
		const second = serializeWorld(world);

		expect(firstDifference(world.elevation, elevation)).toBe(-1);
		expect(world.seaLevel).toBe(-1234.5);
		expect(second).toEqual(first);
		expect(second.buffer).not.toBe(first.buffer);
		expect(first.byteOffset).toBe(0);
		expect(first.buffer.byteLength).toBe(first.length);
	});

	it('refuses a world whose resolution is not supported', () => {
		const world = {
			...createBlankWorld(64),
			resolution: 100,
		} as unknown as World;
		expect(() => serializeWorld(world)).toThrow(RangeError);
	});

	it('refuses a world whose elevation is not the length of its resolution', () => {
		const world: World = {
			...createBlankWorld(128),
			elevation: new Float32Array(CELLS_64),
		};
		expect(() => serializeWorld(world)).toThrow(RangeError);
	});

	it('refuses a world whose sea level is not finite', () => {
		for (const seaLevel of [Number.NaN, Infinity, -Infinity]) {
			const world: World = { ...createBlankWorld(64), seaLevel };
			expect(() => serializeWorld(world)).toThrow(RangeError);
		}
	});

	it('refuses a world whose planet has a setting that is missing, not a number or out of range', () => {
		for (const name of PLANET_SETTINGS) {
			const { min, max } = PLANET_LIMITS[name];
			for (const value of [
				undefined,
				'1',
				Number.NaN,
				Infinity,
				min - 0.001,
				max + 0.001,
			]) {
				const world = {
					...createBlankWorld(64),
					planet: { ...DEFAULT_PLANET, [name]: value },
				} as World;
				expect(
					() => serializeWorld(world),
					`${name}: ${String(value)}`,
				).toThrow(RangeError);
			}
		}
	});

	it('refuses a world whose date is negative or not finite', () => {
		for (const ageYears of [-1, -1e-9, Number.NaN, Infinity, -Infinity]) {
			const world: World = { ...createBlankWorld(64), ageYears };
			expect(() => serializeWorld(world), String(ageYears)).toThrow(RangeError);
		}
	});
});

describe('a round trip', () => {
	it.each(SUPPORTED_RESOLUTIONS)(
		'gives back the elevation bit for bit and the settings at %i',
		(resolution) => {
			const world = sculptedWorld(resolution);
			const read = worldOf(serializeWorld(world));

			expect(read.resolution).toBe(resolution);
			expect(read.seaLevel).toBe(world.seaLevel);
			expect(read.origin).toEqual(world.origin);
			expect(read.elevation).toBeInstanceOf(Float32Array);
			expect(read.elevation).toHaveLength(FACE_COUNT * resolution * resolution);
			expect(firstDifference(read.elevation, world.elevation)).toBe(-1);
			expect(Object.keys(read).sort()).toEqual(Object.keys(world).sort());
		},
	);

	it.each(SUPPORTED_RESOLUTIONS)(
		'gives back a blank ocean at %i',
		(resolution) => {
			const world = createBlankWorld(resolution);
			expect(worldOf(serializeWorld(world))).toEqual(world);
		},
	);

	it('keeps a negative zero apart from a zero', () => {
		const world = createBlankWorld(64);
		world.elevation[0] = -0;
		world.elevation[1] = 0;
		const read = worldOf(serializeWorld(world));
		expect(Object.is(read.elevation[0], -0)).toBe(true);
		expect(Object.is(read.elevation[1], 0)).toBe(true);
	});

	it('gives back every sea level a world can hold', () => {
		const world = createBlankWorld(64);
		for (const metres of [
			0,
			250,
			-6000,
			6000,
			0.1,
			-1234.567,
			MIN_ELEVATION_M,
			MAX_ELEVATION_M,
		]) {
			world.seaLevel = normaliseSeaLevel(metres);
			expect(worldOf(serializeWorld(world)).seaLevel).toBe(world.seaLevel);
		}
	});

	it('gives back a sea level of negative zero as zero', () => {
		const world = createBlankWorld(64);
		world.seaLevel = normaliseSeaLevel(-0);
		expect(Object.is(world.seaLevel, -0)).toBe(true);
		expect(Object.is(worldOf(serializeWorld(world)).seaLevel, 0)).toBe(true);
	});

	it('gives back the planet’s settings and the date exactly', () => {
		const planets: PlanetSettings[] = [
			DEFAULT_PLANET,
			{
				axialTiltDeg: 0,
				starBrightness: 0.1,
				starMass: 0.1,
				orbitDistanceAu: 0.3,
				greenhouseStrength: 0,
			},
			{
				axialTiltDeg: 90,
				starBrightness: 10,
				starMass: 10,
				orbitDistanceAu: 3,
				greenhouseStrength: 3,
			},
			{
				axialTiltDeg: 0.1 + 0.2,
				starBrightness: 1 / 3,
				starMass: Math.PI,
				orbitDistanceAu: Math.SQRT2,
				greenhouseStrength: 2 / 3,
			},
		];
		const base = sculptedWorld(64);
		for (const [index, planet] of planets.entries()) {
			for (const ageYears of [0, 1, 12_000, 2.4e6, 1 / 3, 4.5e9]) {
				const world: World = { ...base, planet, ageYears };
				const read = worldOf(serializeWorld(world));
				expect(read.planet, `planet ${index}`).toEqual(planet);
				expect(Object.keys(read.planet)).toEqual(PLANET_SETTINGS);
				expect(read.ageYears).toBe(ageYears);
			}
		}
	});

	it('gives back a setting or a date of negative zero as zero', () => {
		const world: World = {
			...createBlankWorld(64),
			planet: { ...DEFAULT_PLANET, axialTiltDeg: -0, greenhouseStrength: -0 },
			ageYears: -0,
		};
		const read = worldOf(serializeWorld(world));
		expect(Object.is(read.planet.axialTiltDeg, 0)).toBe(true);
		expect(Object.is(read.planet.greenhouseStrength, 0)).toBe(true);
		expect(Object.is(read.ageYears, 0)).toBe(true);
	});

	it('gives back a seed and a land fraction exactly', () => {
		for (const [seed, landFraction] of [
			[0, 0],
			[MAX_SEED, 1],
			[1977, 0.3],
			[42, 1 / 3],
			[7, 0.1 + 0.2],
		] as const) {
			const world: World = {
				...createBlankWorld(64),
				origin: { kind: 'generated', seed, landFraction },
			};
			expect(worldOf(serializeWorld(world)).origin).toEqual({
				kind: 'generated',
				seed,
				landFraction,
			});
		}
	});
});

describe('deserializeWorld', () => {
	it('reads a file built by hand', () => {
		expect(worldOf(fileOf())).toEqual(createBlankWorld(64));
	});

	it('gives a world that owes nothing to the bytes it was read from', () => {
		const bytes = serializeWorld(sculptedWorld(64));
		const before = bytes.slice();
		const read = worldOf(bytes);
		const elevation = read.elevation.slice();

		expect(read.elevation.buffer).not.toBe(bytes.buffer);
		expect(bytes).toEqual(before);
		bytes.fill(0xff);
		expect(firstDifference(read.elevation, elevation)).toBe(-1);
	});

	it('reads bytes that start partway into a larger buffer', () => {
		const world = sculptedWorld(64);
		const file = serializeWorld(world);
		for (const offset of [1, 2, 3, 4]) {
			const buffer = new Uint8Array(offset + file.length + 5).fill(0xee);
			buffer.set(file, offset);
			const read = worldOf(buffer.subarray(offset, offset + file.length));
			expect(firstDifference(read.elevation, world.elevation)).toBe(-1);
			expect(read.seaLevel).toBe(world.seaLevel);
		}
	});

	it.each(SUPPORTED_RESOLUTIONS)(
		'gives back a world that started as the Earth at %i',
		(resolution) => {
			const world: World = {
				...createBlankWorld(resolution),
				seaLevel: normaliseSeaLevel(-75.5),
				origin: { kind: 'earth' },
			};
			world.elevation.set([8848, -10_935, Math.fround(0.1), -0]);
			const read = worldOf(serializeWorld(world));
			expect(read.origin).toEqual({ kind: 'earth' });
			expect(read.resolution).toBe(resolution);
			expect(read.seaLevel).toBe(world.seaLevel);
			expect(firstDifference(read.elevation, world.elevation)).toBe(-1);
		},
	);

	it('reads an Earth origin as that alone, whatever else it holds', () => {
		const read = worldOf(
			fileWithHeader({
				resolution: 64,
				seaLevel: 0,
				origin: { seed: 'x', kind: 'earth', landFraction: 2 },
			}),
		);
		expect(read.origin).toEqual({ kind: 'earth' });
		expect(Object.keys(read.origin)).toEqual(['kind']);
	});

	it('ignores header fields it does not know, their order and the spacing', () => {
		const header = `  {
			"later": {"anything": [1, 2, 3]},
			"origin": {"landFraction": 0.5, "extra": true, "seed": 9, "kind": "generated"},
			"seaLevel": 120,
			"resolution": 64
		}  `;
		const read = worldOf(fileOf({ header }));
		expect(read.resolution).toBe(64);
		expect(read.seaLevel).toBe(120);
		expect(read.origin).toEqual({
			kind: 'generated',
			seed: 9,
			landFraction: 0.5,
		});
		expect(Object.keys(read).sort()).toEqual([
			'ageYears',
			'elevation',
			'origin',
			'planet',
			'resolution',
			'seaLevel',
		]);
	});

	it('reads a header without a planet or a date as Earth’s settings at year zero', () => {
		const read = worldOf(fileOf({ header: BLANK_HEADER }));
		expect(read.planet).toEqual(DEFAULT_PLANET);
		expect(read.ageYears).toBe(0);
		expect(read).toEqual(createBlankWorld(64));

		const dated = worldOf(
			fileOf({ header: `${BLANK_HEADER.slice(0, -1)},"ageYears":250}` }),
		);
		expect(dated.planet).toEqual(DEFAULT_PLANET);
		expect(dated.ageYears).toBe(250);

		const tilted = { ...DEFAULT_PLANET, axialTiltDeg: 45 };
		const undated = worldOf(
			fileWithHeader({ ...JSON.parse(BLANK_HEADER), planet: tilted }),
		);
		expect(undated.planet).toEqual(tilted);
		expect(undated.ageYears).toBe(0);
	});

	it('gives a world read without a planet settings of its own', () => {
		const first = worldOf(fileOf());
		const second = worldOf(fileOf());
		expect(first.planet).not.toBe(second.planet);
		expect(first.planet).not.toBe(DEFAULT_PLANET);
	});

	it('reads a planet as its five settings alone, whatever else it holds', () => {
		const read = worldOf(
			fileWithHeader({
				...JSON.parse(BLANK_HEADER),
				planet: { ...DEFAULT_PLANET, moons: 2, starMass: 2 },
			}),
		);
		expect(read.planet).toEqual({ ...DEFAULT_PLANET, starMass: 2 });
		expect(Object.keys(read.planet)).toEqual(PLANET_SETTINGS);
	});

	it('accepts every setting at both of its limits', () => {
		for (const name of PLANET_SETTINGS) {
			for (const value of [PLANET_LIMITS[name].min, PLANET_LIMITS[name].max]) {
				const planet = { ...DEFAULT_PLANET, [name]: value };
				expect(
					worldOf(fileWithHeader({ ...JSON.parse(BLANK_HEADER), planet }))
						.planet,
				).toEqual(planet);
			}
		}
	});

	it('accepts a header of exactly the longest length allowed', () => {
		const header = BLANK_HEADER.padEnd(MAX_WORLD_FILE_HEADER_BYTES, ' ');
		const bytes = fileOf({ header });
		expect(bytes).toHaveLength(16 + 4096 + 4 * CELLS_64);
		expect(worldOf(bytes)).toEqual(createBlankWorld(64));
	});

	it('brings a sea level within the limits and to single precision', () => {
		const seaLevelOf = (seaLevel: number): number =>
			worldOf(
				fileWithHeader({ resolution: 64, seaLevel, origin: { kind: 'blank' } }),
			).seaLevel;
		expect(seaLevelOf(50_000)).toBe(MAX_ELEVATION_M);
		expect(seaLevelOf(-50_000)).toBe(MIN_ELEVATION_M);
		expect(seaLevelOf(0.1)).toBe(Math.fround(0.1));
	});

	it('clamps finite elevations beyond the limits to the nearer limit', () => {
		const values = new Float32Array(CELLS_64).fill(100);
		values.set([
			20_000,
			-20_000,
			3.4e38,
			-3.4e38,
			MAX_ELEVATION_M,
			MIN_ELEVATION_M,
			12_000.001,
			-12_000.001,
		]);
		const read = worldOf(fileOf({ data: floatBytes(values) }));
		expect([...read.elevation.subarray(0, 9)]).toEqual([
			MAX_ELEVATION_M,
			MIN_ELEVATION_M,
			MAX_ELEVATION_M,
			MIN_ELEVATION_M,
			MAX_ELEVATION_M,
			MIN_ELEVATION_M,
			MAX_ELEVATION_M,
			MIN_ELEVATION_M,
			100,
		]);
		expect(read.elevation.every((value) => value <= MAX_ELEVATION_M)).toBe(
			true,
		);
	});
});

describe('a file that is refused', () => {
	it('is not a world file when the marker is wrong', () => {
		expect(errorOf(fileOf({ marker: 'EARTHSIN' }))).toBe('bad-marker');
		expect(errorOf(fileOf({ marker: 'XARTHSIM' }))).toBe('bad-marker');
		expect(errorOf(fileOf({ marker: 'earthsim' }))).toBe('bad-marker');
		// The first bytes of a PNG image, and a file of text.
		expect(
			errorOf(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
		).toBe('bad-marker');
		expect(errorOf(asciiBytes('{"resolution":64}'))).toBe('bad-marker');
		expect(errorOf(Uint8Array.of(0))).toBe('bad-marker');
		expect(errorOf(new Uint8Array(4 * CELLS_64))).toBe('bad-marker');
	});

	it('is of an unknown version when the version is not this one', () => {
		for (const version of [0, 2, 256, 0x0100_0000, 0xffff_ffff]) {
			expect(errorOf(fileOf({ version }))).toBe('unknown-version');
		}
	});

	it('has too long a header when it declares more than the cap, however short it is', () => {
		const prefix = fileOf({ headerLength: 0xffff_ffff }).subarray(0, 16);
		expect(errorOf(prefix)).toBe('header-too-long');
		expect(errorOf(fileOf({ headerLength: 0xffff_ffff }))).toBe(
			'header-too-long',
		);
		expect(errorOf(fileOf({ headerLength: 0x8000_0000 }))).toBe(
			'header-too-long',
		);
		// One byte over the cap, with every byte it declares present.
		const header = BLANK_HEADER.padEnd(MAX_WORLD_FILE_HEADER_BYTES + 1, ' ');
		expect(errorOf(fileOf({ header }))).toBe('header-too-long');
	});

	it('is truncated when it stops anywhere before its end', () => {
		const file = serializeWorld(sculptedWorld(64));
		const data = dataOffsetOf(file);
		for (const length of [
			0,
			1,
			7,
			8,
			11,
			12,
			15,
			16,
			17,
			data - 1,
			data,
			data + 1,
			data + 4,
			file.length - 4,
			file.length - 1,
		]) {
			expect(errorOf(file.subarray(0, length)), `${length} bytes`).toBe(
				'truncated',
			);
		}
	});

	it('is truncated when its elevation is for a coarser world than its header names', () => {
		const header = BLANK_HEADER.replace('64', '128');
		expect(errorOf(fileOf({ header }))).toBe('truncated');
	});

	it('is truncated when it declares a header that runs past its end', () => {
		const bytes = fileOf({ headerLength: 4096 }).subarray(0, 200);
		expect(errorOf(bytes)).toBe('truncated');
	});

	it('has a bad header when the header is not JSON', () => {
		for (const header of [
			'',
			'   ',
			'not json at all',
			BLANK_HEADER.slice(0, -1),
			`${BLANK_HEADER}}`,
			"{'resolution':64}",
			'{"resolution":64,}',
			`${'['.repeat(2000)}${']'.repeat(2000)}`,
		]) {
			expect(errorOf(fileOf({ header })), header.slice(0, 20)).toBe(
				'bad-header',
			);
		}
	});

	it('has a bad header when a byte of it is not ASCII', () => {
		const header = asciiBytes(BLANK_HEADER.padEnd(60, ' '));
		for (const byte of [0x80, 0xc3, 0xff]) {
			header[59] = byte;
			expect(errorOf(fileOf({ header }))).toBe('bad-header');
		}
		// A byte order mark and a NUL are ASCII or not, but never JSON.
		expect(errorOf(fileOf({ header: `\u0000${BLANK_HEADER}` }))).toBe(
			'bad-header',
		);
	});

	it('has a bad header when the header is JSON but not an object', () => {
		for (const header of [null, 64, 'text', true, [], [BLANK_HEADER]]) {
			expect(errorOf(fileWithHeader(header))).toBe('bad-header');
		}
	});

	it('has a bad resolution when the resolution is missing or not supported', () => {
		for (const resolution of [
			undefined,
			null,
			0,
			-64,
			32,
			63,
			64.5,
			100,
			512,
			'64',
			[64],
			true,
		]) {
			expect(
				errorOf(
					fileWithHeader({
						resolution,
						seaLevel: 0,
						origin: { kind: 'blank' },
					}),
				),
				String(resolution),
			).toBe('bad-resolution');
		}
		expect(errorOf(fileOf({ header: '{}' }))).toBe('bad-resolution');
	});

	it('has a bad header when the sea level is missing or not a finite number', () => {
		const withSeaLevel = (seaLevel: string): Uint8Array =>
			fileOf({
				header: `{"resolution":64,"seaLevel":${seaLevel},"origin":{"kind":"blank"}}`,
			});
		// A number too large for a double parses as infinity.
		for (const seaLevel of ['null', '"0"', '[0]', 'true', '1e999', '-1e999']) {
			expect(errorOf(withSeaLevel(seaLevel)), seaLevel).toBe('bad-header');
		}
		expect(
			errorOf(fileWithHeader({ resolution: 64, origin: { kind: 'blank' } })),
		).toBe('bad-header');
	});

	it('has a bad header when the origin is missing or not of a known kind', () => {
		for (const origin of [
			undefined,
			null,
			'blank',
			7,
			[],
			[{ kind: 'blank' }],
			{},
			{ kind: 'plates' },
			{ kind: 'Blank' },
			{ kind: 'Earth' },
			{ kind: 'mars' },
			{ kind: ' earth' },
			{ kind: 7 },
			{ kind: null },
			{ kind: ['blank'] },
		]) {
			expect(
				errorOf(fileWithHeader({ resolution: 64, seaLevel: 0, origin })),
				JSON.stringify(origin),
			).toBe('bad-header');
		}
	});

	it('has a bad header when a generated origin has no valid seed or land fraction', () => {
		const good = { kind: 'generated', seed: 7, landFraction: 0.3 };
		expect(
			worldOf(fileWithHeader({ resolution: 64, seaLevel: 0, origin: good }))
				.origin,
		).toEqual(good);
		for (const change of [
			{ seed: undefined },
			{ seed: -1 },
			{ seed: 1.5 },
			{ seed: MAX_SEED + 1 },
			{ seed: '7' },
			{ seed: null },
			{ landFraction: undefined },
			{ landFraction: -0.001 },
			{ landFraction: 1.001 },
			{ landFraction: '0.3' },
			{ landFraction: null },
			{ landFraction: [0.3] },
		]) {
			expect(
				errorOf(
					fileWithHeader({
						resolution: 64,
						seaLevel: 0,
						origin: { ...good, ...change },
					}),
				),
				JSON.stringify(change),
			).toBe('bad-header');
		}
		const huge =
			'{"resolution":64,"seaLevel":0,"origin":{"kind":"generated","seed":1e999,"landFraction":1e999}}';
		expect(errorOf(fileOf({ header: huge }))).toBe('bad-header');
	});

	it('takes nothing a header’s objects inherit for a field of the file', () => {
		// Written out as JSON, this key is an ordinary field and sets no
		// prototype; the fields it holds are not the header's.
		const nested =
			'{"__proto__":{"resolution":64,"seaLevel":0,"origin":{"kind":"blank"}}}';
		expect(errorOf(fileOf({ header: nested }))).toBe('bad-resolution');

		const inherited: Record<string, unknown> = {
			resolution: 64,
			seaLevel: 0,
			origin: { kind: 'blank' },
			kind: 'blank',
		};
		const prototype = Object.prototype as Record<string, unknown>;
		try {
			for (const [key, value] of Object.entries(inherited)) {
				Object.defineProperty(prototype, key, { value, configurable: true });
			}
			expect(errorOf(fileOf({ header: '{}' }))).toBe('bad-resolution');
			expect(errorOf(fileOf({ header: '{"resolution":64}' }))).toBe(
				'bad-header',
			);
			expect(
				errorOf(fileOf({ header: '{"resolution":64,"seaLevel":0}' })),
			).toBe('bad-header');
			expect(
				errorOf(
					fileOf({ header: '{"resolution":64,"seaLevel":0,"origin":{}}' }),
				),
			).toBe('bad-header');
		} finally {
			for (const key of Object.keys(inherited)) {
				delete prototype[key];
			}
		}
		expect(({} as Record<string, unknown>).resolution).toBeUndefined();
	});

	it('has a bad planet when the planet is not an object of every setting within its limits', () => {
		const withPlanet = (planet: unknown): Uint8Array =>
			fileWithHeader({ ...JSON.parse(BLANK_HEADER), planet });
		for (const planet of [null, 'earth', 1, true, [], [DEFAULT_PLANET], {}]) {
			expect(errorOf(withPlanet(planet)), JSON.stringify(planet)).toBe(
				'bad-planet',
			);
		}
		for (const name of PLANET_SETTINGS) {
			const { min, max } = PLANET_LIMITS[name];
			const { [name]: _left, ...missing } = DEFAULT_PLANET;
			expect(errorOf(withPlanet(missing)), `no ${name}`).toBe('bad-planet');
			for (const value of [
				null,
				'1',
				[1],
				true,
				{},
				min - 0.001,
				max + 0.001,
				-1e6,
				1e6,
			]) {
				expect(
					errorOf(withPlanet({ ...DEFAULT_PLANET, [name]: value })),
					`${name}: ${JSON.stringify(value)}`,
				).toBe('bad-planet');
			}
			// A number too large for a double parses as infinity.
			const header = `${BLANK_HEADER.slice(0, -1)},"planet":${JSON.stringify(
				DEFAULT_PLANET,
			).replace(`"${name}":${DEFAULT_PLANET[name]}`, `"${name}":1e999`)}}`;
			expect(errorOf(fileOf({ header })), `${name}: 1e999`).toBe('bad-planet');
		}
	});

	it('has a bad age when the date is not a finite number from zero up', () => {
		for (const ageYears of [
			'-1',
			'-0.5',
			'-1e999',
			'1e999',
			'null',
			'"0"',
			'[0]',
			'true',
			'{}',
		]) {
			const header = `${BLANK_HEADER.slice(0, -1)},"ageYears":${ageYears}}`;
			expect(errorOf(fileOf({ header })), ageYears).toBe('bad-age');
		}
	});

	it('has a bad length when bytes are left over after the elevation', () => {
		const file = serializeWorld(createBlankWorld(64));
		const longer = new Uint8Array(file.length + 1);
		longer.set(file);
		expect(errorOf(longer)).toBe('bad-length');

		// The elevation of a finer world under a header that names 64.
		const finer = floatBytes(new Float32Array(FACE_COUNT * 128 * 128));
		expect(errorOf(fileOf({ data: finer }))).toBe('bad-length');
	});

	it('is not finite when any elevation is NaN or infinite', () => {
		for (const value of [Number.NaN, Infinity, -Infinity]) {
			for (const cell of [0, 1000, CELLS_64 - 1]) {
				expect(errorOf(fileWithElevation(cell, value)), `${value}`).toBe(
					'not-finite',
				);
			}
		}
	});

	it('is not finite for any NaN, whatever bits it is written with', () => {
		const bytes = serializeWorld(createBlankWorld(64));
		const view = new DataView(bytes.buffer);
		for (const bits of [0x7fc0_0000, 0x7f80_0001, 0xffc0_0000, 0xffff_ffff]) {
			view.setUint32(dataOffsetOf(bytes), bits, true);
			expect(errorOf(bytes)).toBe('not-finite');
		}
	});

	it('gives each kind of fault a reason of its own', () => {
		const reasons = [
			errorOf(fileOf({ marker: 'NOTWORLD' })),
			errorOf(fileOf({ version: 2 })),
			errorOf(fileWithHeader({ resolution: 100, seaLevel: 0, origin: {} })),
			errorOf(fileOf({ data: new Uint8Array(4 * CELLS_64 + 4) })),
			errorOf(fileOf().subarray(0, 1000)),
			errorOf(fileOf({ header: 'not json' })),
			errorOf(fileWithElevation(0, Number.NaN)),
			errorOf(fileOf({ headerLength: 0xffff_ffff })),
			errorOf(
				fileWithHeader({ ...JSON.parse(BLANK_HEADER), planet: { tilt: 1 } }),
			),
			errorOf(fileWithHeader({ ...JSON.parse(BLANK_HEADER), ageYears: -1 })),
		];
		expect(reasons).toEqual([
			'bad-marker',
			'unknown-version',
			'bad-resolution',
			'bad-length',
			'truncated',
			'bad-header',
			'not-finite',
			'header-too-long',
			'bad-planet',
			'bad-age',
		]);
		expect(new Set(reasons).size).toBe(ALL_ERRORS.length);
	});

	it('gives the fault found first when there are several', () => {
		// A wrong marker comes before everything, even a missing version.
		expect(errorOf(asciiBytes('NOPE'))).toBe('bad-marker');
		// The version comes before the header length and the header.
		expect(
			errorOf(fileOf({ version: 2, headerLength: 0xffff_ffff, header: 'x' })),
		).toBe('unknown-version');
		// The resolution comes before the sea level and the origin.
		expect(errorOf(fileWithHeader({ resolution: 100 }))).toBe('bad-resolution');
		// The origin comes before the planet, and the planet before the date.
		expect(
			errorOf(
				fileWithHeader({
					resolution: 64,
					seaLevel: 0,
					origin: {},
					planet: null,
					ageYears: -1,
				}),
			),
		).toBe('bad-header');
		expect(
			errorOf(
				fileWithHeader({
					...JSON.parse(BLANK_HEADER),
					planet: null,
					ageYears: -1,
				}),
			),
		).toBe('bad-planet');
		// The date comes before the length of the elevation.
		expect(
			errorOf(
				fileOf({
					header: `${BLANK_HEADER.slice(0, -1)},"ageYears":-1}`,
					data: new Uint8Array(3),
				}),
			),
		).toBe('bad-age');
		// The header comes before the length of the elevation.
		expect(
			errorOf(fileOf({ header: 'not json', data: new Uint8Array(3) })),
		).toBe('bad-header');
		// The length comes before the values.
		const short = fileWithElevation(0, Number.NaN);
		expect(errorOf(short.subarray(0, short.length - 1))).toBe('truncated');
	});
});

describe('bytes of any kind', () => {
	/** Reads bytes, which must give a valid world or a known reason. */
	const expectWellBehaved = (bytes: Uint8Array): void => {
		const result = deserializeWorld(bytes);
		if (!result.ok) {
			expect(ALL_ERRORS).toContain(result.error);
			return;
		}
		const { world } = result;
		expect(SUPPORTED_RESOLUTIONS).toContain(world.resolution);
		expect(world.elevation).toHaveLength(
			FACE_COUNT * world.resolution * world.resolution,
		);
		expect(world.seaLevel).toBe(normaliseSeaLevel(world.seaLevel));
		expect(['blank', 'generated', 'earth']).toContain(world.origin.kind);
		expect(Object.keys(world.planet)).toEqual(PLANET_SETTINGS);
		for (const name of PLANET_SETTINGS) {
			const value = world.planet[name];
			expect(value).toBeGreaterThanOrEqual(PLANET_LIMITS[name].min);
			expect(value).toBeLessThanOrEqual(PLANET_LIMITS[name].max);
		}
		expect(Number.isFinite(world.ageYears) && world.ageYears >= 0).toBe(true);
		expect(
			world.elevation.every(
				(value) => value >= MIN_ELEVATION_M && value <= MAX_ELEVATION_M,
			),
		).toBe(true);
	};

	it('never throws on a file cut short at any of its first bytes', () => {
		const file = serializeWorld(sculptedWorld(64));
		for (let length = 0; length <= 300; length++) {
			expect(deserializeWorld(file.subarray(0, length)).ok).toBe(false);
		}
		const random = createRandom(1);
		for (let round = 0; round < 200; round++) {
			const length = Math.floor(random() * file.length);
			expect(deserializeWorld(file.subarray(0, length)).ok).toBe(false);
		}
	});

	it('never throws on a file with bytes changed at random', () => {
		const file = serializeWorld(sculptedWorld(64));
		const data = dataOffsetOf(file);
		const random = createRandom(2);
		const refused = new Set<string>();
		let read = 0;
		for (let round = 0; round < 600; round++) {
			const bytes = file.slice();
			const changes = 1 + Math.floor(random() * 4);
			for (let change = 0; change < changes; change++) {
				// Two rounds in three keep to the marker, the version and
				// the header, where a change is most likely to matter.
				const span = round % 3 === 2 ? bytes.length : data;
				bytes[Math.floor(random() * span)] = Math.floor(random() * 256);
			}
			const result = deserializeWorld(bytes);
			expectWellBehaved(bytes);
			if (result.ok) {
				read++;
			} else {
				refused.add(result.error);
			}
		}
		// The changes reached both outcomes and several kinds of fault.
		expect(read).toBeGreaterThan(0);
		expect(refused.size).toBeGreaterThanOrEqual(4);
	});

	it('never throws on bytes that are random throughout', () => {
		const random = createRandom(3);
		for (let round = 0; round < 300; round++) {
			const bytes = new Uint8Array(Math.floor(random() * 400));
			for (let index = 0; index < bytes.length; index++) {
				bytes[index] = Math.floor(random() * 256);
			}
			// Half of them start as a world file does.
			if (round % 2 === 0) {
				bytes.set(asciiBytes(WORLD_FILE_MARKER).subarray(0, bytes.length));
				if (bytes.length >= 12) {
					new DataView(bytes.buffer).setUint32(8, WORLD_FILE_VERSION, true);
				}
			}
			expectWellBehaved(bytes);
		}
	});
});
