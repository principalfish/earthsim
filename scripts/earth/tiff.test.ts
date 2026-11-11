import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	assertFloatTiles,
	COMPRESSION_DEFLATE,
	decodeFloatTile,
	encodeFloatTile,
	PREDICTOR_FLOATING_POINT,
	RASTER_PIXEL_IS_AREA,
	type ReadBytes,
	readTiffLayout,
	SAMPLE_FORMAT_FLOAT,
	type TiffLayout,
} from './tiff';

const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;
const DOUBLE = 12;

const TYPE_BYTES: Readonly<Record<number, number>> = {
	[ASCII]: 1,
	[SHORT]: 2,
	[LONG]: 4,
	[RATIONAL]: 8,
	[DOUBLE]: 8,
};

/** One tag of a directory: numbers of a type, or text. */
type Field = {
	readonly tag: number;
	readonly type: number;
	readonly values: readonly number[] | string;
};

/** What a TIFF file made for a test holds. */
type TiffParts = {
	readonly fields: readonly Field[];
	/** The compressed bytes of each tile, written after the header. */
	readonly tiles?: readonly Uint8Array[];
	/** Whether the tiles' offsets and lengths are listed in the directory. */
	readonly listTiles?: boolean;
	readonly byteOrder?: string;
	readonly version?: number;
};

/** The bytes of a field's values, little-endian. */
const fieldBytes = ({ type, values }: Field): Uint8Array => {
	if (typeof values === 'string') {
		return Uint8Array.from(`${values}\0`, (character) =>
			character.charCodeAt(0),
		);
	}
	const size = TYPE_BYTES[type] as number;
	const bytes = new Uint8Array(values.length * size);
	const view = new DataView(bytes.buffer);
	values.forEach((value, index) => {
		if (type === SHORT) {
			view.setUint16(index * size, value, true);
		} else if (type === LONG) {
			view.setUint32(index * size, value, true);
		} else if (type === DOUBLE) {
			view.setFloat64(index * size, value, true);
		}
	});
	return bytes;
};

/**
 * A classic little-endian TIFF file: the header, the tiles, the values too
 * long for a directory entry, and last the directory.
 */
const tiffBytes = (parts: TiffParts): Uint8Array => {
	const tiles = parts.tiles ?? [];
	const chunks: Uint8Array[] = [];
	let length = 8;
	const place = (bytes: Uint8Array): number => {
		const offset = length;
		chunks.push(bytes);
		length += bytes.length;
		return offset;
	};
	const tileOffsets = tiles.map(place);
	const fields = [...parts.fields];
	if (parts.listTiles ?? true) {
		fields.push(
			{ tag: 324, type: LONG, values: tileOffsets },
			{ tag: 325, type: LONG, values: tiles.map((tile) => tile.length) },
		);
	}
	fields.sort((a, b) => a.tag - b.tag);

	const directory = new Uint8Array(2 + fields.length * 12 + 4);
	const view = new DataView(directory.buffer);
	view.setUint16(0, fields.length, true);
	fields.forEach((field, index) => {
		const at = 2 + index * 12;
		const bytes = fieldBytes(field);
		view.setUint16(at, field.tag, true);
		view.setUint16(at + 2, field.type, true);
		view.setUint32(
			at + 4,
			bytes.length / (TYPE_BYTES[field.type] as number),
			true,
		);
		if (bytes.length <= 4) {
			directory.set(bytes, at + 8);
		} else {
			view.setUint32(at + 8, place(bytes), true);
		}
	});
	const directoryOffset = place(directory);

	const file = new Uint8Array(length);
	const header = new DataView(file.buffer);
	const byteOrder = parts.byteOrder ?? 'II';
	file[0] = byteOrder.charCodeAt(0);
	file[1] = byteOrder.charCodeAt(1);
	header.setUint16(2, parts.version ?? 42, true);
	header.setUint32(4, directoryOffset, true);
	let offset = 8;
	for (const chunk of chunks) {
		file.set(chunk, offset);
		offset += chunk.length;
	}
	return file;
};

const readerOf =
	(file: Uint8Array): ReadBytes =>
	(offset, length) =>
		file.subarray(offset, offset + length);

const layoutOf = (file: Uint8Array): TiffLayout =>
	readTiffLayout(readerOf(file), file.length);

const WIDTH = 20;
const HEIGHT = 18;
const TILE = 16;

/** A float for every pixel that no other pixel has, fractions included. */
const pixelValue = (column: number, row: number): number =>
	Math.fround((column - 7.25) * 311.7 - row * row * 28.3 + 0.1);

/** The floats of a tile, with filler where it reaches past the image. */
const tileValues = (tileColumn: number, tileRow: number): Float32Array => {
	const values = new Float32Array(TILE * TILE);
	for (let y = 0; y < TILE; y++) {
		for (let x = 0; x < TILE; x++) {
			const column = tileColumn * TILE + x;
			const row = tileRow * TILE + y;
			values[y * TILE + x] =
				column < WIDTH && row < HEIGHT ? pixelValue(column, row) : -99_999;
		}
	}
	return values;
};

/** The fields of a small image laid out like the Earth's source file. */
const imageFields = (): Field[] => [
	{ tag: 256, type: SHORT, values: [WIDTH] },
	{ tag: 257, type: SHORT, values: [HEIGHT] },
	{ tag: 258, type: SHORT, values: [32] },
	{ tag: 259, type: SHORT, values: [COMPRESSION_DEFLATE] },
	{ tag: 277, type: SHORT, values: [1] },
	{ tag: 284, type: SHORT, values: [1] },
	{ tag: 317, type: SHORT, values: [PREDICTOR_FLOATING_POINT] },
	{ tag: 322, type: SHORT, values: [TILE] },
	{ tag: 323, type: SHORT, values: [TILE] },
	{ tag: 339, type: SHORT, values: [SAMPLE_FORMAT_FLOAT] },
	{ tag: 33550, type: DOUBLE, values: [18, 10, 0] },
	{ tag: 33922, type: DOUBLE, values: [0, 0, 0, -180, 90, 0] },
	{
		tag: 34735,
		type: SHORT,
		values: [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326],
	},
	{ tag: 42113, type: ASCII, values: '-99999' },
];

const imageTiles = (): Uint8Array[] =>
	[
		[0, 0],
		[1, 0],
		[0, 1],
		[1, 1],
	].map(([tileColumn, tileRow]) =>
		deflateSync(
			encodeFloatTile(
				tileValues(tileColumn as number, tileRow as number),
				TILE,
				TILE,
			),
		),
	);

const imageFile = (): Uint8Array =>
	tiffBytes({ fields: imageFields(), tiles: imageTiles() });

/** The image's fields with one tag taken out or replaced. */
const fieldsWith = (tag: number, replacement?: Field): Field[] => [
	...imageFields().filter((field) => field.tag !== tag),
	...(replacement === undefined ? [] : [replacement]),
];

describe('readTiffLayout', () => {
	it('reads the size, the sample layout and the tiles of the image', () => {
		const file = imageFile();
		const layout = layoutOf(file);
		expect(layout).toMatchObject({
			width: WIDTH,
			height: HEIGHT,
			bitsPerSample: 32,
			sampleFormat: SAMPLE_FORMAT_FLOAT,
			samplesPerPixel: 1,
			compression: COMPRESSION_DEFLATE,
			predictor: PREDICTOR_FLOATING_POINT,
			planarConfiguration: 1,
			tileWidth: TILE,
			tileHeight: TILE,
			tilesAcross: 2,
			tilesDown: 2,
		});
		const tiles = imageTiles();
		expect(layout.tileByteCounts).toEqual(tiles.map((tile) => tile.length));
		expect(layout.tileOffsets[0]).toBe(8);
		expect(layout.tileOffsets[1]).toBe(8 + (tiles[0] as Uint8Array).length);
	});

	it('reads the georeferencing and the no-data value', () => {
		const layout = layoutOf(imageFile());
		expect(layout.pixelScale).toEqual([18, 10, 0]);
		expect(layout.tiepoint).toEqual([0, 0, 0, -180, 90, 0]);
		expect(layout.rasterType).toBe(RASTER_PIXEL_IS_AREA);
		expect(layout.noData).toBe('-99999');
	});

	it('gives every pixel back through the tiles it lists', () => {
		const file = imageFile();
		const layout = layoutOf(file);
		const read = readerOf(file);
		const values = new Float32Array(TILE * TILE);
		for (let row = 0; row < HEIGHT; row++) {
			for (let column = 0; column < WIDTH; column++) {
				const tile =
					Math.floor(row / TILE) * layout.tilesAcross +
					Math.floor(column / TILE);
				decodeFloatTile(
					inflateSync(
						read(
							layout.tileOffsets[tile] as number,
							layout.tileByteCounts[tile] as number,
						),
					),
					TILE,
					TILE,
					values,
				);
				expect(values[(row % TILE) * TILE + (column % TILE)]).toBe(
					pixelValue(column, row),
				);
			}
		}
	});

	it('reads the same from a file given as part of a larger buffer', () => {
		const file = imageFile();
		const buffer = new Uint8Array(file.length + 13);
		buffer.set(file, 13);
		const shifted = buffer.subarray(13);
		expect(layoutOf(shifted)).toEqual(layoutOf(file));
	});

	it('takes what optional tags leave unsaid as the TIFF defaults', () => {
		const fields = imageFields().filter((field) =>
			[256, 257, 322, 323].includes(field.tag),
		);
		const layout = layoutOf(tiffBytes({ fields, tiles: imageTiles() }));
		expect(layout).toMatchObject({
			bitsPerSample: 1,
			sampleFormat: 1,
			samplesPerPixel: 1,
			compression: 1,
			predictor: 1,
			planarConfiguration: 1,
			pixelScale: null,
			tiepoint: null,
			rasterType: null,
			noData: null,
		});
	});

	it('reads sizes stored as 32-bit numbers and text short enough to sit in its entry', () => {
		const fields = [
			...fieldsWith(256, { tag: 256, type: LONG, values: [WIDTH] }).filter(
				(field) => field.tag !== 42113,
			),
			{ tag: 42113, type: ASCII, values: '-1 ' },
		];
		const layout = layoutOf(tiffBytes({ fields, tiles: imageTiles() }));
		expect(layout.width).toBe(WIDTH);
		expect(layout.noData).toBe('-1');
	});

	it('finds no raster type where the GeoTIFF keys give none', () => {
		const without = (values: number[]): number | null =>
			layoutOf(
				tiffBytes({
					fields: fieldsWith(34735, { tag: 34735, type: SHORT, values }),
					tiles: imageTiles(),
				}),
			).rasterType;
		expect(without([1, 1, 0, 1, 1024, 0, 1, 2])).toBeNull();
		// A key whose value is stored in another tag is not read as a type.
		expect(without([1, 1, 0, 1, 1025, 34736, 1, 0])).toBeNull();
		expect(without([1, 1, 0])).toBeNull();
		// The key is declared but its value is missing.
		expect(without([1, 1, 0, 1, 1025, 0, 1])).toBeNull();
		expect(without([1, 1, 0, 1, 1025, 0, 1, 2])).toBe(2);
	});

	it('refuses a file that is not a classic little-endian TIFF', () => {
		const parts = { fields: imageFields(), tiles: imageTiles() };
		expect(() => layoutOf(tiffBytes({ ...parts, byteOrder: 'MM' }))).toThrow(
			'big-endian',
		);
		expect(() => layoutOf(tiffBytes({ ...parts, byteOrder: 'PK' }))).toThrow(
			'not a TIFF',
		);
		expect(() => layoutOf(tiffBytes({ ...parts, version: 43 }))).toThrow(
			'BigTIFF',
		);
		expect(() => layoutOf(tiffBytes({ ...parts, version: 7 }))).toThrow(
			'its version is 7',
		);
	});

	it('refuses an image that is not stored in tiles', () => {
		expect(() =>
			layoutOf(tiffBytes({ fields: imageFields(), listTiles: false })),
		).toThrow('not stored in tiles');
	});

	it('refuses a file that is cut short', () => {
		const file = imageFile();
		expect(() => layoutOf(file.subarray(0, 4))).toThrow('cut short');
		// The directory is the last thing in the file, but for the four
		// bytes that say there is no further directory.
		expect(() => layoutOf(file.subarray(0, file.length - 5))).toThrow(
			'cut short',
		);
		const read = readerOf(file);
		expect(() => readTiffLayout(read, file.length - 200)).toThrow('cut short');
	});

	it('refuses a tile that reaches past the end of the file', () => {
		const tiles = imageTiles();
		const fields = [
			...imageFields(),
			{ tag: 324, type: LONG, values: [8, 8, 8, 1_000_000] },
			{ tag: 325, type: LONG, values: tiles.map((tile) => tile.length) },
		];
		expect(() =>
			layoutOf(tiffBytes({ fields, tiles, listTiles: false })),
		).toThrow('tile 3 needs bytes 1000000');
	});

	it('refuses a file that lists the wrong number of tiles', () => {
		expect(() =>
			layoutOf(
				tiffBytes({ fields: imageFields(), tiles: imageTiles().slice(1) }),
			),
		).toThrow('needs 4 tiles; the file lists 3 offsets and 3 lengths');
	});

	it('refuses an image or a tile of no size', () => {
		expect(() =>
			layoutOf(
				tiffBytes({
					fields: fieldsWith(322, { tag: 322, type: SHORT, values: [0] }),
					tiles: imageTiles(),
				}),
			),
		).toThrow('every size must be above zero');
	});

	it('refuses a file without a tag it needs', () => {
		expect(() =>
			layoutOf(tiffBytes({ fields: fieldsWith(256), tiles: imageTiles() })),
		).toThrow('no ImageWidth tag (256)');
		expect(() =>
			layoutOf(tiffBytes({ fields: fieldsWith(323), tiles: imageTiles() })),
		).toThrow('no TileLength tag (323)');
	});

	it('refuses a tag that holds several values where one is needed', () => {
		expect(() =>
			layoutOf(
				tiffBytes({
					fields: fieldsWith(258, {
						tag: 258,
						type: SHORT,
						values: [32, 32, 32],
					}),
					tiles: imageTiles(),
				}),
			),
		).toThrow('BitsPerSample tag (258) holds 3 values');
	});

	it('refuses a value of a type it does not read', () => {
		expect(() =>
			layoutOf(
				tiffBytes({
					fields: fieldsWith(256, { tag: 256, type: RATIONAL, values: [0] }),
					tiles: imageTiles(),
				}),
			),
		).toThrow('tag 256 has value type 5');
		expect(() =>
			layoutOf(
				tiffBytes({
					fields: fieldsWith(42113, {
						tag: 42113,
						type: SHORT,
						values: [1],
					}),
					tiles: imageTiles(),
				}),
			),
		).toThrow('tag 42113 has value type 3 where text was expected');
	});

	it('refuses a directory that claims more entries than any real one has', () => {
		const file = imageFile();
		const view = new DataView(file.buffer);
		view.setUint16(view.getUint32(4, true), 5000, true);
		expect(() => layoutOf(file)).toThrow('declares 5000 entries');
	});

	it('refuses a read that gives fewer bytes than were asked for', () => {
		const file = imageFile();
		const short: ReadBytes = (offset, length) =>
			file.subarray(offset, offset + Math.min(length, 6));
		expect(() => readTiffLayout(short, file.length)).toThrow(
			'gave 6 bytes where 8 were asked for',
		);
	});
});

describe('assertFloatTiles', () => {
	it('accepts floats compressed with DEFLATE after the floating-point predictor', () => {
		expect(() => assertFloatTiles(layoutOf(imageFile()))).not.toThrow();
	});

	it('names everything about an image that it cannot read', () => {
		const layout: TiffLayout = {
			...layoutOf(imageFile()),
			bitsPerSample: 16,
			sampleFormat: 2,
			samplesPerPixel: 3,
			compression: 5,
			predictor: 2,
		};
		expect(() => assertFloatTiles(layout)).toThrow(
			'bits per sample is 16, expected 32; sample format is 2, expected 3; samples per pixel is 3, expected 1; compression is 5, expected 8; predictor is 2, expected 3',
		);
		expect(() =>
			assertFloatTiles({ ...layoutOf(imageFile()), predictor: 1 }),
		).toThrow('not one this reader handles: predictor is 1, expected 3');
	});
});

describe('decodeFloatTile', () => {
	it('undoes the floating-point predictor as the TIFF specification defines it', () => {
		// 1 is 3F 80 00 00 and 2 is 40 00 00 00. Stored most significant
		// bytes first, the row is 3F 40, 80 00, 00 00, 00 00, and each byte
		// then has the one before it subtracted.
		const stored = Uint8Array.of(0x3f, 0x01, 0x40, 0x80, 0, 0, 0, 0);
		const out = new Float32Array(2);
		decodeFloatTile(stored, 2, 1, out);
		expect([...out]).toEqual([1, 2]);
	});

	it('starts every row afresh', () => {
		// 1.5 is 3F C0 00 00 and 8848.86 is 46 0A 43 71, so the running sum
		// ends a row at 71 and would spoil the next row if it were carried
		// over.
		const row = [0x3f, 0x07, 0x7a, 0x4a, 0xf6, 0x43, 0xbd, 0x71];
		const values = Float32Array.of(1.5, 8848.86, 1.5, 8848.86);
		const stored = encodeFloatTile(values, 2, 2);
		expect([...stored]).toEqual([...row, ...row]);
		const out = new Float32Array(4);
		decodeFloatTile(stored, 2, 2, out);
		expect([...out]).toEqual([...values]);
	});

	it('gives back any floats bit for bit', () => {
		const values = Float32Array.of(
			0,
			-0,
			1.5,
			-99_999,
			8848.86,
			-10_935.2,
			Number.POSITIVE_INFINITY,
			1e-40,
			3.4e38,
			-1e-7,
			123_456.7,
			Number.NaN,
		);
		const out = new Float32Array(values.length);
		decodeFloatTile(encodeFloatTile(values, 4, 3), 4, 3, out);
		expect(new Uint32Array(out.buffer)).toEqual(new Uint32Array(values.buffer));
	});

	it('does not change the bytes it reads and writes only the tile', () => {
		const stored = Uint8Array.of(0x3f, 0x01, 0x40, 0x80, 0, 0, 0, 0);
		const out = new Float32Array(3).fill(7);
		decodeFloatTile(stored, 2, 1, out);
		expect([...stored]).toEqual([0x3f, 0x01, 0x40, 0x80, 0, 0, 0, 0]);
		expect([...out]).toEqual([1, 2, 7]);
	});

	it('writes into an array that is part of a larger buffer', () => {
		const buffer = new ArrayBuffer(16);
		const out = new Float32Array(buffer, 8, 2);
		decodeFloatTile(
			Uint8Array.of(0x3f, 0x01, 0x40, 0x80, 0, 0, 0, 0),
			2,
			1,
			out,
		);
		expect([...new Float32Array(buffer)]).toEqual([0, 0, 1, 2]);
	});

	it('refuses bytes of the wrong length and an output that is too short', () => {
		expect(() =>
			decodeFloatTile(new Uint8Array(7), 2, 1, new Float32Array(2)),
		).toThrow(RangeError);
		expect(() =>
			decodeFloatTile(new Uint8Array(9), 2, 1, new Float32Array(2)),
		).toThrow('is 8 bytes; got 9');
		expect(() =>
			decodeFloatTile(new Uint8Array(8), 2, 1, new Float32Array(1)),
		).toThrow('needs room for 2; got 1');
	});
});

describe('encodeFloatTile', () => {
	it('stores the bytes of a row by significance, each less the one before', () => {
		expect([...encodeFloatTile(Float32Array.of(1, 2), 2, 1)]).toEqual([
			0x3f, 0x01, 0x40, 0x80, 0, 0, 0, 0,
		]);
	});

	it('refuses values that do not fill the tile', () => {
		expect(() => encodeFloatTile(new Float32Array(5), 2, 3)).toThrow(
			RangeError,
		);
	});
});
