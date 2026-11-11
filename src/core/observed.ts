/**
 * The Earth's observed temperature: reading the data file, and taking any
 * month of it onto the cells of a world.
 *
 * The data file holds the mean air temperature two metres above the ground
 * or the sea, for each of the twelve months, January to December, averaged
 * over the years 1981 to 2010. Each month is a grid of points one degree
 * apart: {@link OBSERVED_ROWS} rows of latitude from 90° north to 90° south,
 * each of {@link OBSERVED_COLUMNS} longitudes eastward from 0°, so that the
 * value at row `r`, column `c` is the temperature at latitude `90 − r` and
 * longitude `c` east. The two pole rows hold a value for each longitude, as
 * the source does.
 *
 * Each value is one unsigned byte `b`, standing for
 * `OBSERVED_BASE_C + OBSERVED_STEP_C · b` degrees Celsius: half-degree steps
 * from −80 °C to 47.5 °C. Bytes are stored month by month, then row by row
 * from the north, then column by column from 0° east, with no header:
 * {@link OBSERVED_BYTES} bytes in all.
 */

import { getGrid, isSupportedResolution, SUPPORTED_RESOLUTIONS } from './grid';
import { cellLatitudes, MONTHS_PER_YEAR } from './insolation';

/** Rows of latitude in each month: one a degree, both poles included. */
export const OBSERVED_ROWS = 181;

/** Columns of longitude in each row: one a degree, from 0° east. */
export const OBSERVED_COLUMNS = 360;

/** Values in each month of the data. */
export const OBSERVED_VALUES_PER_MONTH = OBSERVED_ROWS * OBSERVED_COLUMNS;

/** The exact length of the data file, in bytes. */
export const OBSERVED_BYTES = MONTHS_PER_YEAR * OBSERVED_VALUES_PER_MONTH;

/** The temperature a stored 0 stands for, in degrees Celsius. */
export const OBSERVED_BASE_C = -80;

/** The temperature between one stored value and the next, in degrees. */
export const OBSERVED_STEP_C = 0.5;

/** The largest value a byte can hold. */
const MAX_STORED = 255;

/** The highest temperature the file can hold, in degrees Celsius. */
export const OBSERVED_MAX_C = OBSERVED_BASE_C + MAX_STORED * OBSERVED_STEP_C;

/** The observed temperature, as the data file gives it. */
export type ObservedTemperature = {
	/**
	 * Twelve grids, January to December, of degrees Celsius, each
	 * {@link OBSERVED_VALUES_PER_MONTH} long and laid out as the file is:
	 * row by row from the north, column by column from 0° east. They must
	 * be treated as read-only.
	 */
	readonly months: readonly Float32Array[];
};

/**
 * Twelve fields of temperature on a world's cells, January to December, in
 * degrees Celsius, each indexed like the grid's cells.
 */
export type MonthlyTemperature = readonly Float32Array[];

const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * The stored value for a temperature: the nearest half-degree step, a
 * value that lies halfway between two going to the higher.
 *
 * @param celsius - A temperature in degrees Celsius.
 * @returns A whole number from 0 to 255.
 * @throws RangeError if the temperature is NaN, or so far outside
 * {@link OBSERVED_BASE_C} to {@link OBSERVED_MAX_C} that its nearest step
 * lies outside them too, rather than bringing it within them.
 */
export const quantiseTemperature = (celsius: number): number => {
	// Adding 0 makes the -0 that rounding gives just above -80.5 °C a 0.
	const stored = Math.round((celsius - OBSERVED_BASE_C) / OBSERVED_STEP_C) + 0;
	if (!(stored >= 0 && stored <= MAX_STORED)) {
		throw new RangeError(
			`${celsius} °C is outside the ${OBSERVED_BASE_C} to ${OBSERVED_MAX_C} °C the observed temperature file can hold`,
		);
	}
	return stored;
};

/**
 * The temperature a stored value stands for, in degrees Celsius.
 *
 * @param stored - A whole number from 0 to 255.
 */
export const dequantiseTemperature = (stored: number): number =>
	OBSERVED_BASE_C + OBSERVED_STEP_C * stored;

/**
 * The bytes of the data file for twelve months of temperature.
 *
 * @param months - Twelve grids, January to December, of degrees Celsius,
 * laid out as {@link ObservedTemperature.months} is. They are not changed.
 * @returns {@link OBSERVED_BYTES} bytes.
 * @throws RangeError if there are not twelve grids of
 * {@link OBSERVED_VALUES_PER_MONTH} values, or if any value is one
 * {@link quantiseTemperature} refuses.
 */
export const encodeObservedTemperature = (
	months: readonly ArrayLike<number>[],
): Uint8Array<ArrayBuffer> => {
	if (months.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`Observed temperature has ${MONTHS_PER_YEAR} months; got ${months.length}`,
		);
	}
	const bytes = new Uint8Array(OBSERVED_BYTES);
	months.forEach((values, month) => {
		if (values.length !== OBSERVED_VALUES_PER_MONTH) {
			throw new RangeError(
				`Each month of observed temperature has ${OBSERVED_VALUES_PER_MONTH} values; month ${month} has ${values.length}`,
			);
		}
		const start = month * OBSERVED_VALUES_PER_MONTH;
		for (let index = 0; index < OBSERVED_VALUES_PER_MONTH; index++) {
			bytes[start + index] = quantiseTemperature(values[index] as number);
		}
	});
	return bytes;
};

/**
 * Reads the bytes of the observed temperature file.
 *
 * @remarks
 * The length is the only thing about the bytes that can be wrong: every
 * byte is a temperature.
 *
 * @param bytes - The whole file. It is not changed and not kept.
 * @returns The temperatures, in arrays that owe nothing to `bytes`.
 * @throws RangeError if `bytes` is not exactly {@link OBSERVED_BYTES} long.
 */
export const decodeObservedTemperature = (
	bytes: Uint8Array,
): ObservedTemperature => {
	if (bytes.length !== OBSERVED_BYTES) {
		throw new RangeError(
			`The observed temperature file is ${OBSERVED_BYTES} bytes long; got ${bytes.length}`,
		);
	}
	const months: Float32Array[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const start = month * OBSERVED_VALUES_PER_MONTH;
		const values = new Float32Array(OBSERVED_VALUES_PER_MONTH);
		for (let index = 0; index < OBSERVED_VALUES_PER_MONTH; index++) {
			values[index] = dequantiseTemperature(bytes[start + index] as number);
		}
		months.push(values);
	}
	return { months };
};

/**
 * Where a place falls among the points of the data: the four around it and
 * how far it lies between them. Written by {@link locate}.
 */
type Location = {
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
 * Finds the four points of the data around a place.
 *
 * @remarks
 * The northern row is never the southern pole row, so the row south of it
 * is always there; a place at the South Pole lies all the way to that row.
 * Longitude wraps, so a place between 359° and 360° east lies between the
 * last column and the first.
 */
const locate = (
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

/** The value at a place, from the four points around it. */
const interpolate = (values: Float32Array, at: Location): number => {
	const nw = values[at.northWest] as number;
	const ne = values[at.northEast] as number;
	const sw = values[at.northWest + OBSERVED_COLUMNS] as number;
	const se = values[at.northEast + OBSERVED_COLUMNS] as number;
	const north = nw + at.east * (ne - nw);
	const south = sw + at.east * (se - sw);
	return north + at.south * (south - north);
};

const assertMonths = (data: ObservedTemperature): void => {
	if (
		data.months.length !== MONTHS_PER_YEAR ||
		data.months.some((values) => values.length !== OBSERVED_VALUES_PER_MONTH)
	) {
		throw new RangeError(
			`Observed temperature holds ${MONTHS_PER_YEAR} months of ${OBSERVED_VALUES_PER_MONTH} values`,
		);
	}
};

/**
 * The observed temperature of one month at a place, interpolated between
 * the four points of the data around it.
 *
 * @remarks
 * Interpolation is bilinear in latitude and longitude. Longitude wraps
 * around the date line and the prime meridian alike. At a pole, the pole
 * row's values are interpolated by longitude; no value is made up beyond
 * the poles.
 *
 * @param data - The observed temperature. It is not changed.
 * @param month - 0 for January to 11 for December.
 * @param latitudeDeg - Latitude in degrees, from -90 to 90.
 * @param longitudeDeg - Longitude in degrees east, any finite value.
 * @returns Degrees Celsius.
 * @throws RangeError if the month is not a whole number from 0 to 11, the
 * latitude is outside -90 to 90 or NaN, the longitude is not finite, or the
 * data does not hold twelve months of the right length.
 */
export const observedTemperatureAt = (
	data: ObservedTemperature,
	month: number,
	latitudeDeg: number,
	longitudeDeg: number,
): number => {
	assertMonths(data);
	if (!Number.isInteger(month) || month < 0 || month >= MONTHS_PER_YEAR) {
		throw new RangeError(`Month ${month} is not 0 to 11`);
	}
	if (!(latitudeDeg >= -90 && latitudeDeg <= 90)) {
		throw new RangeError(`Latitude ${latitudeDeg} is not -90 to 90`);
	}
	if (!Number.isFinite(longitudeDeg)) {
		throw new RangeError(`Longitude ${longitudeDeg} is not finite`);
	}
	const at: Location = { northWest: 0, northEast: 0, south: 0, east: 0 };
	locate(latitudeDeg, longitudeDeg, at);
	return interpolate(data.months[month] as Float32Array, at);
};

/**
 * The observed temperature of every month on the cells of a world.
 *
 * @remarks
 * Each cell takes the value at its centre, interpolated as
 * {@link observedTemperatureAt} does. Where each centre falls among the
 * points of the data is worked out once and used for all twelve months.
 *
 * @param data - The observed temperature. It is not changed.
 * @param resolution - Cells along a face edge; one of
 * {@link SUPPORTED_RESOLUTIONS}.
 * @returns Twelve new arrays, January to December, each one value per cell
 * in cell order, in degrees Celsius.
 * @throws RangeError if `resolution` is not a supported resolution, or the
 * data does not hold twelve months of the right length.
 */
export const observedTemperature = (
	data: ObservedTemperature,
	resolution: number,
): MonthlyTemperature => {
	if (!isSupportedResolution(resolution)) {
		throw new RangeError(
			`Unsupported world resolution ${resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	assertMonths(data);
	const grid = getGrid(resolution);
	const { centres, cellCount } = grid;
	const latitudes = cellLatitudes(grid);
	const northWest = new Int32Array(cellCount);
	const northEast = new Int32Array(cellCount);
	const south = new Float64Array(cellCount);
	const east = new Float64Array(cellCount);
	const at: Location = { northWest: 0, northEast: 0, south: 0, east: 0 };
	for (let cell = 0; cell < cellCount; cell++) {
		const longitudeDeg =
			Math.atan2(centres[3 * cell + 1] as number, centres[3 * cell] as number) *
			DEGREES_PER_RADIAN;
		locate(latitudes[cell] as number, longitudeDeg, at);
		northWest[cell] = at.northWest;
		northEast[cell] = at.northEast;
		south[cell] = at.south;
		east[cell] = at.east;
	}
	return data.months.map((values) => {
		const field = new Float32Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			at.northWest = northWest[cell] as number;
			at.northEast = northEast[cell] as number;
			at.south = south[cell] as number;
			at.east = east[cell] as number;
			field[cell] = interpolate(values, at);
		}
		return field;
	});
};
