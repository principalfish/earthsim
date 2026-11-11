/**
 * A reader for the one kind of TIFF file the Earth data comes in: a classic
 * little-endian TIFF holding one band of 32-bit floats in tiles, compressed
 * with DEFLATE after the floating-point predictor.
 *
 * Nothing here touches a file or decompresses anything: bytes are asked for
 * through a function, and decompressed tiles are handed in. Whatever the
 * file declares is checked before it is used, and anything this reader does
 * not handle is refused by name rather than read wrongly.
 *
 * A TIFF file starts with eight bytes: `II` for little-endian, the number
 * 42, and the offset of the first image file directory. A directory is a
 * count followed by twelve-byte entries, each a tag, a value type, a number
 * of values, and either the values themselves, when they fit in four bytes,
 * or the offset they are stored at.
 */

/** Gives `length` bytes of a file starting at `offset`, or throws. */
export type ReadBytes = (offset: number, length: number) => Uint8Array;

/** What the first image of a TIFF file says about itself. */
export type TiffLayout = {
	/** Pixels across the image. */
	readonly width: number;
	/** Pixels down the image. */
	readonly height: number;
	/** Bits in one sample. */
	readonly bitsPerSample: number;
	/** How a sample is to be read: 1 unsigned, 2 signed, 3 floating point. */
	readonly sampleFormat: number;
	/** Samples in one pixel: the number of bands. */
	readonly samplesPerPixel: number;
	/** The compression scheme: 1 none, 8 DEFLATE. */
	readonly compression: number;
	/** The predictor applied before compression: 1 none, 3 floating point. */
	readonly predictor: number;
	/** How bands are laid out: 1 together in each pixel, 2 one after another. */
	readonly planarConfiguration: number;
	/** Pixels across one tile. */
	readonly tileWidth: number;
	/** Pixels down one tile. */
	readonly tileHeight: number;
	/** Tiles across the image; the last may reach past its edge. */
	readonly tilesAcross: number;
	/** Tiles down the image; the last may reach past its edge. */
	readonly tilesDown: number;
	/** Where each tile's compressed bytes start, row of tiles by row. */
	readonly tileOffsets: readonly number[];
	/** How many compressed bytes each tile has, in the same order. */
	readonly tileByteCounts: readonly number[];
	/**
	 * The size of a pixel in the units of the map, as `[x, y, z]`, or null if
	 * the file does not say.
	 */
	readonly pixelScale: readonly number[] | null;
	/**
	 * A point of the image and the place on the map it stands for, as
	 * `[column, row, 0, x, y, z]`, or null if the file does not say.
	 */
	readonly tiepoint: readonly number[] | null;
	/**
	 * Whether a pixel stands for an area (1), with the tiepoint at its corner,
	 * or for a point (2), with the tiepoint at its centre; null if the file
	 * does not say.
	 */
	readonly rasterType: number | null;
	/**
	 * The text of the value that marks a pixel with no data, as GDAL writes
	 * it, or null if the file names none.
	 */
	readonly noData: string | null;
};

/** The compression scheme this reader handles: DEFLATE in a zlib stream. */
export const COMPRESSION_DEFLATE = 8;

/** The predictor this reader handles: the floating-point predictor. */
export const PREDICTOR_FLOATING_POINT = 3;

/** The sample format this reader handles: IEEE floating point. */
export const SAMPLE_FORMAT_FLOAT = 3;

/** The raster type of an image whose pixels stand for areas. */
export const RASTER_PIXEL_IS_AREA = 1;

const HEADER_BYTES = 8;
const ENTRY_BYTES = 12;
const CLASSIC_TIFF_VERSION = 42;
const BIG_TIFF_VERSION = 43;
const BYTES_PER_FLOAT = 4;

/** The most entries a directory is read for; real ones hold a few dozen. */
const MAX_DIRECTORY_ENTRIES = 4096;

const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_DOUBLE = 12;

/** Bytes in one value of each type this reader takes numbers or text from. */
const TYPE_BYTES: Readonly<Record<number, number>> = {
	[TYPE_ASCII]: 1,
	[TYPE_SHORT]: 2,
	[TYPE_LONG]: 4,
	[TYPE_DOUBLE]: 8,
};

const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_PLANAR_CONFIGURATION = 284;
const TAG_PREDICTOR = 317;
const TAG_TILE_WIDTH = 322;
const TAG_TILE_LENGTH = 323;
const TAG_TILE_OFFSETS = 324;
const TAG_TILE_BYTE_COUNTS = 325;
const TAG_SAMPLE_FORMAT = 339;
const TAG_MODEL_PIXEL_SCALE = 33550;
const TAG_MODEL_TIEPOINT = 33922;
const TAG_GEO_KEY_DIRECTORY = 34735;
const TAG_GDAL_NODATA = 42113;

/** The GeoTIFF key that holds the raster type. */
const GEO_KEY_RASTER_TYPE = 1025;

/** Shorts in the header of a GeoTIFF key directory, and in each key. */
const GEO_KEY_SHORTS = 4;

/** One entry of an image file directory. */
type Entry = {
	readonly type: number;
	readonly count: number;
	/** The entry's last four bytes: the values, or where they are. */
	readonly inline: Uint8Array;
};

const viewOf = (bytes: Uint8Array): DataView =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Reads bytes that must lie inside the file, and must all arrive. */
const readChecked = (
	read: ReadBytes,
	byteLength: number,
	offset: number,
	length: number,
	what: string,
): Uint8Array => {
	if (offset < 0 || offset + length > byteLength) {
		throw new Error(
			`The TIFF file is cut short: ${what} needs bytes ${offset} to ${offset + length}, and the file has ${byteLength}`,
		);
	}
	const bytes = read(offset, length);
	if (bytes.length !== length) {
		throw new Error(
			`Reading ${what} gave ${bytes.length} bytes where ${length} were asked for`,
		);
	}
	return bytes;
};

/** The values of an entry as numbers, or null if it does not hold numbers. */
const numbersOf = (
	entry: Entry,
	tag: number,
	read: ReadBytes,
	byteLength: number,
): number[] => {
	const { type, count } = entry;
	if (type !== TYPE_SHORT && type !== TYPE_LONG && type !== TYPE_DOUBLE) {
		throw new Error(
			`TIFF tag ${tag} has value type ${type}, which is not a number this reader handles`,
		);
	}
	const size = TYPE_BYTES[type] as number;
	const length = size * count;
	const bytes =
		length <= entry.inline.length
			? entry.inline
			: readChecked(
					read,
					byteLength,
					viewOf(entry.inline).getUint32(0, true),
					length,
					`tag ${tag}`,
				);
	const view = viewOf(bytes);
	const values: number[] = [];
	for (let index = 0; index < count; index++) {
		const at = index * size;
		if (type === TYPE_SHORT) {
			values.push(view.getUint16(at, true));
		} else if (type === TYPE_LONG) {
			values.push(view.getUint32(at, true));
		} else {
			values.push(view.getFloat64(at, true));
		}
	}
	return values;
};

/** The text of an ASCII entry, without the zero bytes that end it. */
const textOf = (
	entry: Entry,
	tag: number,
	read: ReadBytes,
	byteLength: number,
): string => {
	if (entry.type !== TYPE_ASCII) {
		throw new Error(
			`TIFF tag ${tag} has value type ${entry.type} where text was expected`,
		);
	}
	const bytes =
		entry.count <= entry.inline.length
			? entry.inline.subarray(0, entry.count)
			: readChecked(
					read,
					byteLength,
					viewOf(entry.inline).getUint32(0, true),
					entry.count,
					`tag ${tag}`,
				);
	let text = '';
	for (const byte of bytes) {
		if (byte === 0) {
			break;
		}
		text += String.fromCharCode(byte);
	}
	return text;
};

/**
 * The raster type a GeoTIFF key directory gives, or null if it gives none.
 *
 * @remarks
 * The directory is a header of four shorts, the last being the number of
 * keys, then four shorts for each key: its identifier, the tag its value is
 * stored in, the number of values, and the value itself when that tag is 0.
 */
const rasterTypeOf = (directory: readonly number[]): number | null => {
	const keys = directory[GEO_KEY_SHORTS - 1] ?? 0;
	for (let key = 1; key <= keys; key++) {
		const at = key * GEO_KEY_SHORTS;
		if (directory[at] === GEO_KEY_RASTER_TYPE && directory[at + 1] === 0) {
			return directory[at + 3] ?? null;
		}
	}
	return null;
};

/**
 * Reads what the first image of a TIFF file says about itself.
 *
 * @remarks
 * Only a classic little-endian TIFF whose image is stored in tiles is read:
 * a big-endian file, a BigTIFF and an image stored in strips are each
 * refused. The file's first directory is its full-size image; any further
 * directories, which hold reduced copies, are ignored.
 *
 * Every tile's bytes are checked to lie inside the file, and there must be
 * exactly as many tiles as the image's size and the tile size need.
 *
 * @param read - Gives bytes of the file.
 * @param byteLength - The length of the whole file in bytes.
 * @returns The image's size, sample layout, compression, tiles and, where
 * the file gives them, its georeferencing and its no-data value.
 * @throws Error if the file is not such a TIFF, is cut short, or lacks a tag
 * that is needed.
 */
export const readTiffLayout = (
	read: ReadBytes,
	byteLength: number,
): TiffLayout => {
	const header = viewOf(
		readChecked(read, byteLength, 0, HEADER_BYTES, 'the header'),
	);
	const byteOrder = String.fromCharCode(header.getUint8(0), header.getUint8(1));
	if (byteOrder !== 'II') {
		throw new Error(
			byteOrder === 'MM'
				? 'The TIFF file is big-endian, which this reader does not handle'
				: 'The file is not a TIFF: it does not start with a byte-order mark',
		);
	}
	const version = header.getUint16(2, true);
	if (version !== CLASSIC_TIFF_VERSION) {
		throw new Error(
			version === BIG_TIFF_VERSION
				? 'The file is a BigTIFF, which this reader does not handle'
				: `The file is not a TIFF: its version is ${version}, not ${CLASSIC_TIFF_VERSION}`,
		);
	}
	const directoryOffset = header.getUint32(4, true);
	const entryCount = viewOf(
		readChecked(read, byteLength, directoryOffset, 2, 'the directory size'),
	).getUint16(0, true);
	if (entryCount > MAX_DIRECTORY_ENTRIES) {
		throw new Error(
			`The TIFF directory declares ${entryCount} entries; at most ${MAX_DIRECTORY_ENTRIES} are read`,
		);
	}
	const directory = readChecked(
		read,
		byteLength,
		directoryOffset + 2,
		entryCount * ENTRY_BYTES,
		'the directory',
	);
	const directoryView = viewOf(directory);
	const entries = new Map<number, Entry>();
	for (let index = 0; index < entryCount; index++) {
		const at = index * ENTRY_BYTES;
		entries.set(directoryView.getUint16(at, true), {
			type: directoryView.getUint16(at + 2, true),
			count: directoryView.getUint32(at + 4, true),
			inline: directory.subarray(at + 8, at + ENTRY_BYTES),
		});
	}

	const numbers = (tag: number): number[] | null => {
		const entry = entries.get(tag);
		return entry === undefined ? null : numbersOf(entry, tag, read, byteLength);
	};
	const single = (tag: number, name: string, fallback?: number): number => {
		const values = numbers(tag);
		if (values === null) {
			if (fallback === undefined) {
				throw new Error(`The TIFF file has no ${name} tag (${tag})`);
			}
			return fallback;
		}
		const [value] = values;
		if (values.length !== 1 || value === undefined) {
			throw new Error(
				`The TIFF ${name} tag (${tag}) holds ${values.length} values where one was expected`,
			);
		}
		return value;
	};

	const width = single(TAG_IMAGE_WIDTH, 'ImageWidth');
	const height = single(TAG_IMAGE_LENGTH, 'ImageLength');
	const tileOffsets = numbers(TAG_TILE_OFFSETS);
	const tileByteCounts = numbers(TAG_TILE_BYTE_COUNTS);
	if (tileOffsets === null || tileByteCounts === null) {
		throw new Error(
			'The TIFF image is not stored in tiles, which is all this reader handles',
		);
	}
	const tileWidth = single(TAG_TILE_WIDTH, 'TileWidth');
	const tileHeight = single(TAG_TILE_LENGTH, 'TileLength');
	if (!(width > 0 && height > 0 && tileWidth > 0 && tileHeight > 0)) {
		throw new Error(
			`The TIFF image is ${width} × ${height} in tiles of ${tileWidth} × ${tileHeight}; every size must be above zero`,
		);
	}
	const tilesAcross = Math.ceil(width / tileWidth);
	const tilesDown = Math.ceil(height / tileHeight);
	const tileCount = tilesAcross * tilesDown;
	if (tileOffsets.length !== tileCount || tileByteCounts.length !== tileCount) {
		throw new Error(
			`The TIFF image needs ${tileCount} tiles; the file lists ${tileOffsets.length} offsets and ${tileByteCounts.length} lengths`,
		);
	}
	for (let tile = 0; tile < tileCount; tile++) {
		const offset = tileOffsets[tile] as number;
		const count = tileByteCounts[tile] as number;
		if (offset + count > byteLength) {
			throw new Error(
				`The TIFF file is cut short: tile ${tile} needs bytes ${offset} to ${offset + count}, and the file has ${byteLength}`,
			);
		}
	}

	const geoKeys = numbers(TAG_GEO_KEY_DIRECTORY);
	const noData = entries.get(TAG_GDAL_NODATA);
	return {
		width,
		height,
		bitsPerSample: single(TAG_BITS_PER_SAMPLE, 'BitsPerSample', 1),
		sampleFormat: single(TAG_SAMPLE_FORMAT, 'SampleFormat', 1),
		samplesPerPixel: single(TAG_SAMPLES_PER_PIXEL, 'SamplesPerPixel', 1),
		compression: single(TAG_COMPRESSION, 'Compression', 1),
		predictor: single(TAG_PREDICTOR, 'Predictor', 1),
		planarConfiguration: single(
			TAG_PLANAR_CONFIGURATION,
			'PlanarConfiguration',
			1,
		),
		tileWidth,
		tileHeight,
		tilesAcross,
		tilesDown,
		tileOffsets,
		tileByteCounts,
		pixelScale: numbers(TAG_MODEL_PIXEL_SCALE),
		tiepoint: numbers(TAG_MODEL_TIEPOINT),
		rasterType: geoKeys === null ? null : rasterTypeOf(geoKeys),
		noData:
			noData === undefined
				? null
				: textOf(noData, TAG_GDAL_NODATA, read, byteLength).trim(),
	};
};

/**
 * Checks that an image is one {@link decodeFloatTile} can read: one band of
 * 32-bit floats, DEFLATE compressed after the floating-point predictor.
 *
 * @param layout - What the image says about itself.
 * @throws Error naming every property that is not as needed.
 */
export const assertFloatTiles = (layout: TiffLayout): void => {
	const expected: readonly (readonly [string, number, number])[] = [
		['bits per sample', layout.bitsPerSample, BYTES_PER_FLOAT * 8],
		['sample format', layout.sampleFormat, SAMPLE_FORMAT_FLOAT],
		['samples per pixel', layout.samplesPerPixel, 1],
		['compression', layout.compression, COMPRESSION_DEFLATE],
		['predictor', layout.predictor, PREDICTOR_FLOATING_POINT],
	];
	const wrong = expected
		.filter(([, actual, wanted]) => actual !== wanted)
		.map(
			([name, actual, wanted]) => `${name} is ${actual}, expected ${wanted}`,
		);
	if (wrong.length > 0) {
		throw new Error(
			`The TIFF image is not one this reader handles: ${wrong.join('; ')}`,
		);
	}
};

/**
 * Turns the decompressed bytes of one tile into its floats.
 *
 * @remarks
 * The floating-point predictor works on one row of the tile at a time. The
 * four bytes of every float in the row are stored apart: first the most
 * significant byte of each float in turn, then the next byte of each, down
 * to the least significant, whatever the byte order of the file. Each byte
 * of that rearranged row then has the byte before it subtracted. Reading
 * undoes both: a running sum along the row brings the bytes back, and float
 * `k` of a row of `w` floats is put together from bytes `k`, `w + k`,
 * `2w + k` and `3w + k`, most significant first.
 *
 * A tile at the right or bottom edge of the image is stored whole, with
 * filler beyond the image, and is read whole here.
 *
 * @param bytes - The tile after decompression: four bytes for each float.
 * It is not changed.
 * @param tileWidth - Floats across the tile.
 * @param tileHeight - Floats down the tile.
 * @param out - Where the floats are written, row by row; at least
 * `tileWidth * tileHeight` long.
 * @throws RangeError if `bytes` is not the length the tile needs or `out` is
 * too short.
 */
export const decodeFloatTile = (
	bytes: Uint8Array,
	tileWidth: number,
	tileHeight: number,
	out: Float32Array,
): void => {
	const rowBytes = tileWidth * BYTES_PER_FLOAT;
	const count = tileWidth * tileHeight;
	if (bytes.length !== rowBytes * tileHeight) {
		throw new RangeError(
			`A tile of ${tileWidth} × ${tileHeight} floats is ${rowBytes * tileHeight} bytes; got ${bytes.length}`,
		);
	}
	if (out.length < count) {
		throw new RangeError(
			`A tile of ${tileWidth} × ${tileHeight} floats needs room for ${count}; got ${out.length}`,
		);
	}
	// Putting each float together as a number and storing it as a 32-bit
	// integer gives the right bits whatever the byte order of this machine.
	const bits = new Uint32Array(out.buffer, out.byteOffset, count);
	const row = new Uint8Array(rowBytes);
	for (let y = 0; y < tileHeight; y++) {
		const start = y * rowBytes;
		let sum = 0;
		for (let index = 0; index < rowBytes; index++) {
			sum = (sum + (bytes[start + index] as number)) & 0xff;
			row[index] = sum;
		}
		const first = y * tileWidth;
		for (let x = 0; x < tileWidth; x++) {
			bits[first + x] =
				(((row[x] as number) << 24) |
					((row[tileWidth + x] as number) << 16) |
					((row[2 * tileWidth + x] as number) << 8) |
					(row[3 * tileWidth + x] as number)) >>>
				0;
		}
	}
};

/**
 * Does to a tile's floats what the file's writer did before compressing
 * them: the reverse of {@link decodeFloatTile}.
 *
 * @param values - The tile's floats, row by row.
 * @param tileWidth - Floats across the tile.
 * @param tileHeight - Floats down the tile.
 * @returns The bytes to compress: four for each float.
 * @throws RangeError if `values` is not `tileWidth * tileHeight` long.
 */
export const encodeFloatTile = (
	values: Float32Array,
	tileWidth: number,
	tileHeight: number,
): Uint8Array => {
	if (values.length !== tileWidth * tileHeight) {
		throw new RangeError(
			`A tile of ${tileWidth} × ${tileHeight} floats holds ${tileWidth * tileHeight}; got ${values.length}`,
		);
	}
	const rowBytes = tileWidth * BYTES_PER_FLOAT;
	const bits = new Uint32Array(values.buffer, values.byteOffset, values.length);
	const bytes = new Uint8Array(rowBytes * tileHeight);
	const row = new Uint8Array(rowBytes);
	for (let y = 0; y < tileHeight; y++) {
		for (let x = 0; x < tileWidth; x++) {
			const value = bits[y * tileWidth + x] as number;
			row[x] = value >>> 24;
			row[tileWidth + x] = (value >>> 16) & 0xff;
			row[2 * tileWidth + x] = (value >>> 8) & 0xff;
			row[3 * tileWidth + x] = value & 0xff;
		}
		const start = y * rowBytes;
		let previous = 0;
		for (let index = 0; index < rowBytes; index++) {
			const byte = row[index] as number;
			bytes[start + index] = (byte - previous) & 0xff;
			previous = byte;
		}
	}
	return bytes;
};
