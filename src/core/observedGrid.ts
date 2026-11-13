/**
 * What the observed data files share: their one-degree grid, the checks on
 * twelve months of it, the storing of a value as one byte, unsigned or
 * signed, and taking the grid onto a world's cells, by where a place falls
 * among its points and the value there interpolated between the four
 * around it.
 *
 * The grid is the one {@link OBSERVED_ROWS} and {@link OBSERVED_COLUMNS}
 * describe: rows of latitude from 90° north to 90° south, each of
 * longitudes eastward from 0°, a value at row `r`, column `c` lying at
 * latitude `90 − r` and longitude `c` east.
 */

import {
	type Grid,
	isSupportedResolution,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import { cellLatitudes, MONTHS_PER_YEAR } from './insolation';

/** Rows of latitude in each month: one a degree, both poles included. */
export const OBSERVED_ROWS = 181;

/** Columns of longitude in each row: one a degree, from 0° east. */
export const OBSERVED_COLUMNS = 360;

/** Values in each month of the data. */
export const OBSERVED_VALUES_PER_MONTH = OBSERVED_ROWS * OBSERVED_COLUMNS;

const DEGREES_PER_RADIAN = 180 / Math.PI;

/** The values an unsigned byte can hold, for a {@link ByteCodec}. */
export const UNSIGNED_BYTE = { lowest: 0, highest: 255 } as const;

/** The values a signed byte can hold, for a {@link ByteCodec}. */
export const SIGNED_BYTE = { lowest: -128, highest: 127 } as const;

/**
 * How a file stores its values: each one byte `b`, a whole number from
 * `lowest` to `highest`, standing for `base + step · b`, and the names its
 * messages give.
 */
export type ByteCodec = {
	/** The lowest value a byte can hold: 0 unsigned, -128 signed. */
	readonly lowest: number;
	/** The highest value a byte can hold: 255 unsigned, 127 signed. */
	readonly highest: number;
	/** The value a stored 0 stands for. */
	readonly base: number;
	/** The value between one stored value and the next. */
	readonly step: number;
	/** The units of the values, as a message names them, such as `°C`. */
	readonly units: string;
	/** What the file holds, as a message names it, such as `temperature`. */
	readonly quantity: string;
};

/**
 * The lowest value a codec can store, which its lowest byte stands for.
 *
 * @param codec - The codec.
 */
export const codecMin = (codec: ByteCodec): number =>
	codec.base + codec.lowest * codec.step;

/**
 * The highest value a codec can store, which its highest byte stands for.
 *
 * @param codec - The codec.
 */
export const codecMax = (codec: ByteCodec): number =>
	codec.base + codec.highest * codec.step;

/**
 * The stored value for a value: the nearest step, a value that lies halfway
 * between two going to the higher.
 *
 * @param codec - How the value is stored.
 * @param value - The value, in the codec's units.
 * @returns A whole number from the codec's lowest to its highest byte.
 * @throws RangeError if the value is NaN, or so far outside
 * {@link codecMin} to {@link codecMax} that its nearest step lies outside
 * them too, rather than bringing it within them.
 */
export const quantiseByte = (codec: ByteCodec, value: number): number => {
	// A value in the half step just below the base rounds to -0; adding 0
	// makes it a plain 0.
	const stored = Math.round((value - codec.base) / codec.step) + 0;
	if (!(stored >= codec.lowest && stored <= codec.highest)) {
		throw new RangeError(
			`${value} ${codec.units} is outside the ${codecMin(codec)} to ${codecMax(codec)} ${codec.units} the observed ${codec.quantity} file can hold`,
		);
	}
	return stored;
};

/**
 * The value a stored byte stands for, in the codec's units.
 *
 * @param codec - How the value is stored.
 * @param stored - A whole number from the codec's lowest to its highest
 * byte.
 */
export const dequantiseByte = (codec: ByteCodec, stored: number): number =>
	codec.base + codec.step * stored;

/**
 * Stores one grid of {@link OBSERVED_VALUES_PER_MONTH} values, one byte
 * each, into bytes from a given position.
 *
 * @param codec - How each value is stored.
 * @param values - The grid. It is not changed.
 * @param into - The bytes: unsigned or signed as the codec's are.
 * @param start - Where in `into` the grid's first value goes.
 * @throws RangeError if any value is one {@link quantiseByte} refuses.
 */
export const encodeGrid = (
	codec: ByteCodec,
	values: ArrayLike<number>,
	into: Uint8Array | Int8Array,
	start: number,
): void => {
	for (let index = 0; index < OBSERVED_VALUES_PER_MONTH; index++) {
		into[start + index] = quantiseByte(codec, values[index] as number);
	}
};

/**
 * Reads one grid of {@link OBSERVED_VALUES_PER_MONTH} values that
 * {@link encodeGrid} stored.
 *
 * @param codec - How each value is stored.
 * @param stored - The bytes: unsigned or signed as the codec's are. They
 * are not changed.
 * @param start - Where in `stored` the grid's first value is.
 * @returns A new grid, in the codec's units.
 */
export const decodeGrid = (
	codec: ByteCodec,
	stored: Uint8Array | Int8Array,
	start: number,
): Float32Array => {
	const values = new Float32Array(OBSERVED_VALUES_PER_MONTH);
	for (let index = 0; index < OBSERVED_VALUES_PER_MONTH; index++) {
		values[index] = dequantiseByte(codec, stored[start + index] as number);
	}
	return values;
};

/**
 * Checks that there are twelve grids of {@link OBSERVED_VALUES_PER_MONTH}
 * values to store.
 *
 * @param quantity - What the grids hold, as a message names it.
 * @param months - The grids.
 * @throws RangeError naming the first thing that is wrong.
 */
export const assertGridsToEncode = (
	quantity: string,
	months: readonly ArrayLike<number>[],
): void => {
	if (months.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`Observed ${quantity} has ${MONTHS_PER_YEAR} months; got ${months.length}`,
		);
	}
	months.forEach((values, month) => {
		if (values.length !== OBSERVED_VALUES_PER_MONTH) {
			throw new RangeError(
				`Each month of observed ${quantity} has ${OBSERVED_VALUES_PER_MONTH} values; month ${month} has ${values.length}`,
			);
		}
	});
};

/**
 * The bytes of a file for twelve months of values, stored one byte each,
 * month by month in the order of the grids.
 *
 * @param codec - How each value is stored. It must be an unsigned codec:
 * the bytes are written unsigned.
 * @param months - Twelve grids, January to December. They are not changed.
 * @returns Twelve times {@link OBSERVED_VALUES_PER_MONTH} bytes.
 * @throws RangeError if there are not twelve grids of the right length, or
 * if any value is one {@link quantiseByte} refuses.
 */
export const encodeBytes = (
	codec: ByteCodec,
	months: readonly ArrayLike<number>[],
): Uint8Array<ArrayBuffer> => {
	assertGridsToEncode(codec.quantity, months);
	const bytes = new Uint8Array(MONTHS_PER_YEAR * OBSERVED_VALUES_PER_MONTH);
	months.forEach((values, month) => {
		encodeGrid(codec, values, bytes, month * OBSERVED_VALUES_PER_MONTH);
	});
	return bytes;
};

/**
 * Reads the bytes of a file that {@link encodeBytes} wrote.
 *
 * @param codec - How each value is stored. It must be an unsigned codec:
 * the bytes are read unsigned.
 * @param bytes - The whole file. It is not changed and not kept.
 * @returns Twelve grids, January to December, in arrays that owe nothing
 * to `bytes`.
 * @throws RangeError if `bytes` is not exactly twelve times
 * {@link OBSERVED_VALUES_PER_MONTH} long.
 */
export const decodeBytes = (
	codec: ByteCodec,
	bytes: Uint8Array,
): Float32Array[] => {
	const length = MONTHS_PER_YEAR * OBSERVED_VALUES_PER_MONTH;
	if (bytes.length !== length) {
		throw new RangeError(
			`The observed ${codec.quantity} file is ${length} bytes long; got ${bytes.length}`,
		);
	}
	const months: Float32Array[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		months.push(decodeGrid(codec, bytes, month * OBSERVED_VALUES_PER_MONTH));
	}
	return months;
};

/**
 * Whether there are twelve grids, each {@link OBSERVED_VALUES_PER_MONTH}
 * long.
 *
 * @param months - The grids.
 */
const hasTwelveGrids = (months: readonly Float32Array[]): boolean =>
	months.length === MONTHS_PER_YEAR &&
	months.every((values) => values.length === OBSERVED_VALUES_PER_MONTH);

/**
 * Checks that data holds twelve grids of the right length.
 *
 * @param quantity - What the data holds, as a message names it.
 * @param months - The grids.
 * @throws RangeError if it does not.
 */
export const assertTwelveGrids = (
	quantity: string,
	months: readonly Float32Array[],
): void => {
	if (!hasTwelveGrids(months)) {
		throw new RangeError(
			`Observed ${quantity} holds ${MONTHS_PER_YEAR} months of ${OBSERVED_VALUES_PER_MONTH} values`,
		);
	}
};

/**
 * Checks that a resolution is one a world can have.
 *
 * @param resolution - Cells along a face edge.
 * @throws RangeError if it is not one of {@link SUPPORTED_RESOLUTIONS}.
 */
export const assertResolution = (resolution: number): void => {
	if (!isSupportedResolution(resolution)) {
		throw new RangeError(
			`Unsupported world resolution ${resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
};

/**
 * Where a place falls among the points of the data: the four around it and
 * how far it lies between them. Written by {@link locate}.
 */
export type Location = {
	/** Index in a month of the point north-west of the place. */
	northWest: number;
	/** Index in a month of the point north-east of it. */
	northEast: number;
	/** How far the place lies from the northern row to the southern, 0 to 1. */
	south: number;
	/** How far it lies from the western column to the eastern, 0 to 1. */
	east: number;
};

/**
 * Where the centre of each cell of a world falls among the points of the
 * data, one entry per cell for each field of {@link Location}, and the
 * centre's latitude and longitude.
 */
export type CellLocations = {
	/**
	 * The latitude of each cell's centre, in degrees, -90 to 90: the grid's
	 * own array, which must be treated as read-only.
	 */
	readonly latitudes: Float64Array;
	/** The longitude of each cell's centre, in degrees east, -180 to 180. */
	readonly longitudes: Float64Array;
	readonly northWest: Int32Array;
	readonly northEast: Int32Array;
	readonly south: Float64Array;
	readonly east: Float64Array;
};

/**
 * Finds the four points of the data around a place.
 *
 * @remarks
 * The northern row is never the southern pole row, so the row south of it
 * is always there, {@link OBSERVED_COLUMNS} further on; a place at the South
 * Pole lies all the way to that row. Longitude wraps, so a place between
 * 359° and 360° east lies between the last column and the first.
 *
 * @param latitudeDeg - Latitude in degrees, from -90 to 90.
 * @param longitudeDeg - Longitude in degrees east, any finite value.
 * @param out - Where the place is written.
 */
export const locate = (
	latitudeDeg: number,
	longitudeDeg: number,
	out: Location,
): void => {
	const down = 90 - latitudeDeg;
	const row = Math.min(Math.floor(down), OBSERVED_ROWS - 2);
	let across = longitudeDeg % 360;
	if (across < 0) {
		across += 360;
	}
	// A tiny negative longitude can come to 360 itself once 360 is added.
	if (across >= 360) {
		across -= 360;
	}
	const column = Math.floor(across);
	out.northWest = row * OBSERVED_COLUMNS + column;
	out.northEast = row * OBSERVED_COLUMNS + ((column + 1) % OBSERVED_COLUMNS);
	out.south = down - row;
	out.east = across - column;
};

/**
 * The value at a place, from the four points around it: bilinear in
 * latitude and longitude.
 *
 * @param values - One month of the data.
 * @param at - The place, as {@link locate} wrote it.
 */
export const interpolate = (values: Float32Array, at: Location): number => {
	const nw = values[at.northWest] as number;
	const ne = values[at.northEast] as number;
	const sw = values[at.northWest + OBSERVED_COLUMNS] as number;
	const se = values[at.northEast + OBSERVED_COLUMNS] as number;
	const north = nw + at.east * (ne - nw);
	const south = sw + at.east * (se - sw);
	return north + at.south * (south - north);
};

/**
 * Where the centre of each cell of a world falls among the points of the
 * data, worked out once so that it can be used for every month.
 *
 * @param grid - The world's grid.
 * @returns One entry per cell in cell order, in new arrays but for the
 * latitudes, which are the grid's own.
 */
export const locateCells = (grid: Grid): CellLocations => {
	const { centres, cellCount } = grid;
	const latitudes = cellLatitudes(grid);
	const longitudes = new Float64Array(cellCount);
	const northWest = new Int32Array(cellCount);
	const northEast = new Int32Array(cellCount);
	const south = new Float64Array(cellCount);
	const east = new Float64Array(cellCount);
	const at: Location = { northWest: 0, northEast: 0, south: 0, east: 0 };
	for (let cell = 0; cell < cellCount; cell++) {
		// At a pole x and y are both 0, and atan2 gives longitude 0.
		const longitudeDeg =
			Math.atan2(centres[3 * cell + 1] as number, centres[3 * cell] as number) *
			DEGREES_PER_RADIAN;
		longitudes[cell] = longitudeDeg;
		locate(latitudes[cell] as number, longitudeDeg, at);
		northWest[cell] = at.northWest;
		northEast[cell] = at.northEast;
		south[cell] = at.south;
		east[cell] = at.east;
	}
	return { latitudes, longitudes, northWest, northEast, south, east };
};

/**
 * One month of the data on a world's cells, each cell taking the value at
 * its centre as {@link interpolate} gives it.
 *
 * @param values - One month of the data. It is not changed.
 * @param cells - Where each cell's centre falls, from {@link locateCells}.
 * @returns A new array, one value per cell in cell order.
 */
export const interpolateOnCells = (
	values: Float32Array,
	cells: CellLocations,
): Float32Array => {
	const cellCount = cells.northWest.length;
	const field = new Float32Array(cellCount);
	const at: Location = { northWest: 0, northEast: 0, south: 0, east: 0 };
	for (let cell = 0; cell < cellCount; cell++) {
		at.northWest = cells.northWest[cell] as number;
		at.northEast = cells.northEast[cell] as number;
		at.south = cells.south[cell] as number;
		at.east = cells.east[cell] as number;
		field[cell] = interpolate(values, at);
	}
	return field;
};
