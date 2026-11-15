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

import { getGrid, type SUPPORTED_RESOLUTIONS } from './grid';
import { MONTHS_PER_YEAR } from './insolation';
import {
	assertResolution,
	assertTwelveGrids,
	type ByteCodec,
	codecMax,
	decodeBytes,
	dequantiseByte,
	encodeBytes,
	interpolate,
	interpolateOnCells,
	type Location,
	locate,
	locateCells,
	OBSERVED_VALUES_PER_MONTH,
	quantiseByte,
	UNSIGNED_BYTE,
} from './observedGrid';

export {
	OBSERVED_COLUMNS,
	OBSERVED_ROWS,
	OBSERVED_VALUES_PER_MONTH,
} from './observedGrid';

/** The exact length of the data file, in bytes. */
export const OBSERVED_BYTES = MONTHS_PER_YEAR * OBSERVED_VALUES_PER_MONTH;

/** The temperature a stored 0 stands for, in degrees Celsius. */
export const OBSERVED_BASE_C = -80;

/** The temperature between one stored value and the next, in degrees. */
export const OBSERVED_STEP_C = 0.5;

/** How the file stores each temperature. */
const CODEC: ByteCodec = {
	...UNSIGNED_BYTE,
	base: OBSERVED_BASE_C,
	step: OBSERVED_STEP_C,
	units: '°C',
	quantity: 'temperature',
};

/** The highest temperature the file can hold, in degrees Celsius. */
export const OBSERVED_MAX_C = codecMax(CODEC);

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
export const quantiseTemperature = (celsius: number): number =>
	quantiseByte(CODEC, celsius);

/**
 * The temperature a stored value stands for, in degrees Celsius.
 *
 * @param stored - A whole number from 0 to 255.
 */
export const dequantiseTemperature = (stored: number): number =>
	dequantiseByte(CODEC, stored);

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
): Uint8Array<ArrayBuffer> => encodeBytes(CODEC, months);

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
): ObservedTemperature => ({ months: decodeBytes(CODEC, bytes) });

const assertMonths = (data: ObservedTemperature): void =>
	assertTwelveGrids('temperature', data.months);

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
	assertResolution(resolution);
	assertMonths(data);
	const cells = locateCells(getGrid(resolution));
	return data.months.map((values) => interpolateOnCells(values, cells));
};
