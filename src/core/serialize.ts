/**
 * A world as the bytes of one file, and such bytes read back as a world.
 *
 * A world file holds, in this order and with nothing after the last:
 *
 * 1. The marker: the eight ASCII characters of {@link WORLD_FILE_MARKER}.
 * 2. The format version: an unsigned 32-bit integer.
 * 3. The length of the header in bytes: an unsigned 32-bit integer, at most
 *    {@link MAX_WORLD_FILE_HEADER_BYTES}.
 * 4. The header: a JSON object in ASCII holding the world's settings, such
 *    as `{"resolution":64,"seaLevel":0,"origin":{"kind":"blank"}}`.
 * 5. The elevation of every cell in metres, in the grid's cell order: `6 *
 *    n * n` 32-bit floats for a resolution of `n`.
 *
 * Every number outside the header is little-endian whatever the machine, so
 * a file written on one machine reads the same on any other.
 *
 * Bytes to be read are not trusted: they may come from any file at all.
 * Reading never throws and never changes anything; it gives either a whole
 * new world that keeps every rule a world has, or the reason there is none.
 */

import {
	FACE_COUNT,
	isSupportedResolution,
	type Resolution,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import { isSeed } from './noise';
import {
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	normaliseSeaLevel,
	type World,
	type WorldOrigin,
} from './world';

/** What every world file starts with, one byte per character. */
export const WORLD_FILE_MARKER = 'EARTHSIM';

/** The format version this module writes, and the only one it reads. */
export const WORLD_FILE_VERSION = 1;

/**
 * The longest header a world file may declare, in bytes. The header this
 * module writes is under 150 bytes; the rest is room for fields that later
 * writers of the same version may add.
 */
export const MAX_WORLD_FILE_HEADER_BYTES = 4096;

const VERSION_OFFSET = WORLD_FILE_MARKER.length;
const HEADER_LENGTH_OFFSET = VERSION_OFFSET + 4;

/**
 * The bytes a world file has before its header: the marker, the version and
 * the header's length.
 */
export const WORLD_FILE_PREFIX_BYTES = HEADER_LENGTH_OFFSET + 4;

const BYTES_PER_ELEVATION = 4;

/** The highest byte value of an ASCII character. */
const MAX_ASCII = 0x7f;

/** How many cells a world of a resolution has. */
const cellCountOf = (resolution: Resolution): number =>
	FACE_COUNT * resolution * resolution;

/**
 * The size of the largest world file there can be, in bytes: the finest
 * world under the longest header. Anything longer is not a world file of
 * this version.
 */
export const MAX_WORLD_FILE_BYTES =
	WORLD_FILE_PREFIX_BYTES +
	MAX_WORLD_FILE_HEADER_BYTES +
	BYTES_PER_ELEVATION * Math.max(...SUPPORTED_RESOLUTIONS.map(cellCountOf));

/**
 * Why bytes could not be read as a world.
 *
 * @remarks
 * Each reason is a different fault:
 *
 * - `bad-marker`: one of the marker's bytes that are present is wrong, so
 *   this is not a world file at all.
 * - `truncated`: the bytes stop before the end of what they declare: inside
 *   the marker, the version or the header's length, inside the header, or
 *   inside the elevation of the header's resolution. Elevation written for
 *   a coarser resolution than the header names reads as this too, since
 *   nothing tells the two apart.
 * - `unknown-version`: the format version is not
 *   {@link WORLD_FILE_VERSION}.
 * - `header-too-long`: the declared header length is over
 *   {@link MAX_WORLD_FILE_HEADER_BYTES}.
 * - `bad-header`: the header is not ASCII, not JSON or not a JSON object,
 *   or its sea level or origin is missing or not valid.
 * - `bad-resolution`: the header's resolution is missing or is not a
 *   supported resolution.
 * - `bad-length`: bytes are left over after the elevation of the header's
 *   resolution.
 * - `not-finite`: an elevation is NaN or infinite.
 *
 * A file with several faults gives the one found first, reading from the
 * start: the marker, that the version and header length are all there, the
 * version, the header length, that the header is all there, that it is a
 * JSON object, its resolution, its sea level and origin, the number of
 * bytes after it, and last the elevations in cell order.
 */
export type WorldFileError =
	| 'bad-marker'
	| 'truncated'
	| 'unknown-version'
	| 'header-too-long'
	| 'bad-header'
	| 'bad-resolution'
	| 'bad-length'
	| 'not-finite';

/** Bytes that could not be read as a world, and why. */
export type WorldFileFailure = {
	readonly ok: false;
	/** Why there is no world. */
	readonly error: WorldFileError;
};

/** What reading bytes as a world gives: the world, or why there is none. */
export type WorldFileResult =
	| {
			readonly ok: true;
			/** The world that was read, with an elevation array of its own. */
			readonly world: World;
	  }
	| WorldFileFailure;

/** The settings a header holds, once every one has been checked. */
type Header = Pick<World, 'resolution' | 'seaLevel' | 'origin'>;

const failure = (error: WorldFileError): WorldFileFailure => ({
	ok: false,
	error,
});

/** Whether a parsed JSON value is an object with named fields: no array is. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A field of a parsed header, if the object itself holds it: nothing an
 * object inherits is ever taken for a field of the file.
 */
const ownField = (record: Record<string, unknown>, key: string): unknown =>
	Object.hasOwn(record, key) ? record[key] : undefined;

/** The origin as the header holds it, with only the fields of its kind. */
const originRecord = (origin: WorldOrigin): WorldOrigin => {
	switch (origin.kind) {
		case 'blank':
			return { kind: 'blank' };
		case 'generated':
			return {
				kind: 'generated',
				seed: origin.seed,
				landFraction: origin.landFraction,
			};
		case 'earth':
			return { kind: 'earth' };
	}
};

/**
 * Reads the origin a header gives.
 *
 * @returns A new origin holding only the fields of its kind, or null if the
 * value is not an origin of a known kind with valid fields.
 */
const parseOrigin = (value: unknown): WorldOrigin | null => {
	if (!isPlainObject(value)) {
		return null;
	}
	const kind = ownField(value, 'kind');
	if (kind === 'blank') {
		return { kind: 'blank' };
	}
	if (kind === 'earth') {
		return { kind: 'earth' };
	}
	if (kind !== 'generated') {
		return null;
	}
	const seed = ownField(value, 'seed');
	const landFraction = ownField(value, 'landFraction');
	if (
		typeof seed !== 'number' ||
		!isSeed(seed) ||
		typeof landFraction !== 'number' ||
		!(landFraction >= 0 && landFraction <= 1)
	) {
		return null;
	}
	return { kind: 'generated', seed, landFraction };
};

/**
 * Reads a header's bytes as a world's settings, narrowing each field from
 * nothing known about it.
 *
 * @param bytes - The header's bytes, already known to be no more than the
 * longest header allowed.
 */
const parseHeader = (bytes: Uint8Array): Header | WorldFileFailure => {
	let text = '';
	for (const byte of bytes) {
		if (byte > MAX_ASCII) {
			return failure('bad-header');
		}
		text += String.fromCharCode(byte);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return failure('bad-header');
	}
	if (!isPlainObject(parsed)) {
		return failure('bad-header');
	}
	const resolution = ownField(parsed, 'resolution');
	if (typeof resolution !== 'number' || !isSupportedResolution(resolution)) {
		return failure('bad-resolution');
	}
	// JSON has no NaN, but a number too large for a double parses as
	// infinity.
	const seaLevel = ownField(parsed, 'seaLevel');
	if (typeof seaLevel !== 'number' || !Number.isFinite(seaLevel)) {
		return failure('bad-header');
	}
	const origin = parseOrigin(ownField(parsed, 'origin'));
	if (origin === null) {
		return failure('bad-header');
	}
	return { resolution, seaLevel: normaliseSeaLevel(seaLevel), origin };
};

/**
 * The bytes of a world file holding a world.
 *
 * @remarks
 * What is written is the world and nothing else: its resolution, its sea
 * level, how it started and its elevation. Reading the bytes back with
 * {@link deserializeWorld} gives a world equal to this one, with every
 * elevation bit for bit the same, a negative zero included. Only a sea
 * level of negative zero comes back changed, as zero, which is the same
 * level.
 *
 * Elevations are written as they are. A world that broke its own rule and
 * holds one that is not finite gives a file that is refused when read.
 *
 * @param world - The world to write. It is not changed.
 * @returns The bytes, in an array of exactly their length that nothing
 * else refers to.
 * @throws RangeError if the world's resolution is not supported, its
 * elevation array is not the length its resolution needs, or its sea level
 * is not finite: no file read back could give such a world.
 */
export const serializeWorld = (world: World): Uint8Array<ArrayBuffer> => {
	const { resolution, seaLevel, elevation } = world;
	if (!isSupportedResolution(resolution)) {
		throw new RangeError(
			`Unsupported world resolution ${resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	const cellCount = cellCountOf(resolution);
	if (elevation.length !== cellCount) {
		throw new RangeError(
			`A world of resolution ${resolution} has ${cellCount} cells; its elevation array holds ${elevation.length}`,
		);
	}
	if (!Number.isFinite(seaLevel)) {
		throw new RangeError(
			`A sea level must be a finite number of metres; got ${seaLevel}`,
		);
	}
	// Numbers and the fixed words of this module only, so every character
	// is ASCII and takes one byte.
	const header = JSON.stringify({
		resolution,
		seaLevel,
		origin: originRecord(world.origin),
	});
	const dataOffset = WORLD_FILE_PREFIX_BYTES + header.length;
	const bytes = new Uint8Array(dataOffset + cellCount * BYTES_PER_ELEVATION);
	const view = new DataView(bytes.buffer);
	for (let index = 0; index < WORLD_FILE_MARKER.length; index++) {
		bytes[index] = WORLD_FILE_MARKER.charCodeAt(index);
	}
	view.setUint32(VERSION_OFFSET, WORLD_FILE_VERSION, true);
	view.setUint32(HEADER_LENGTH_OFFSET, header.length, true);
	for (let index = 0; index < header.length; index++) {
		bytes[WORLD_FILE_PREFIX_BYTES + index] = header.charCodeAt(index);
	}
	for (let cell = 0; cell < cellCount; cell++) {
		view.setFloat32(
			dataOffset + cell * BYTES_PER_ELEVATION,
			elevation[cell] as number,
			true,
		);
	}
	return bytes;
};

/**
 * Reads the bytes of a world file as a world, trusting nothing about them.
 *
 * @remarks
 * Every size the bytes declare is checked against the bytes there are
 * before anything is read or set aside for it: a header length is refused
 * if it is over {@link MAX_WORLD_FILE_HEADER_BYTES} or runs past the end,
 * and the elevation array is made only once the bytes are exactly as long
 * as the header's resolution needs.
 *
 * The header is read field by field. The resolution must be a supported
 * one. The sea level must be a finite number, and is brought within the
 * elevation limits and to single precision by {@link normaliseSeaLevel}.
 * The origin must be of a known kind: blank, generated or the Earth. A
 * generated one needs a seed that is an integer from 0 to 4,294,967,295 and
 * a land fraction from 0 to 1.
 * Nothing is converted from another type. Fields this version does not
 * know are ignored, and so is anything the parsed objects inherit rather
 * than hold.
 *
 * Every elevation must be finite: a single NaN or infinity refuses the
 * whole file. Finite elevations beyond the limits a cell can hold are
 * brought to the nearer limit.
 *
 * @param bytes - The bytes to read: any bytes at all. They are not changed
 * and not kept.
 * @returns The world, whose elevation array is a copy that owes nothing to
 * `bytes`, or the reason there is none: the first found, in the order
 * {@link WorldFileError} describes. It never throws.
 */
export const deserializeWorld = (bytes: Uint8Array): WorldFileResult => {
	const markerBytes = Math.min(bytes.length, WORLD_FILE_MARKER.length);
	for (let index = 0; index < markerBytes; index++) {
		if (bytes[index] !== WORLD_FILE_MARKER.charCodeAt(index)) {
			return failure('bad-marker');
		}
	}
	if (bytes.length < WORLD_FILE_PREFIX_BYTES) {
		return failure('truncated');
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(VERSION_OFFSET, true) !== WORLD_FILE_VERSION) {
		return failure('unknown-version');
	}
	const headerLength = view.getUint32(HEADER_LENGTH_OFFSET, true);
	if (headerLength > MAX_WORLD_FILE_HEADER_BYTES) {
		return failure('header-too-long');
	}
	const dataOffset = WORLD_FILE_PREFIX_BYTES + headerLength;
	if (bytes.length < dataOffset) {
		return failure('truncated');
	}
	const header = parseHeader(
		bytes.subarray(WORLD_FILE_PREFIX_BYTES, dataOffset),
	);
	if ('error' in header) {
		return header;
	}
	const cellCount = cellCountOf(header.resolution);
	const length = dataOffset + cellCount * BYTES_PER_ELEVATION;
	if (bytes.length < length) {
		return failure('truncated');
	}
	if (bytes.length > length) {
		return failure('bad-length');
	}
	// A new array, so a file refused partway leaves nothing half read
	// behind: the world is handed over only once every value has passed.
	const elevation = new Float32Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		const value = view.getFloat32(
			dataOffset + cell * BYTES_PER_ELEVATION,
			true,
		);
		if (!Number.isFinite(value)) {
			return failure('not-finite');
		}
		elevation[cell] = Math.min(
			MAX_ELEVATION_M,
			Math.max(MIN_ELEVATION_M, value),
		);
	}
	return { ok: true, world: { ...header, elevation } };
};
