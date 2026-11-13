/**
 * The source of the observed temperature: the long-term monthly means of
 * the air temperature two metres up, 1981 to 2010, from NOAA's Twentieth
 * Century Reanalysis version 3.
 *
 * The file is netCDF-3 classic. Its variable `air` holds 32-bit floats in
 * kelvin, by month, latitude and longitude: twelve months, 181 latitudes a
 * degree apart from 90° south to 90° north, and 360 longitudes a degree
 * apart eastward from 0°. Each value is the temperature at that point.
 */

import { OBSERVED_COLUMNS, OBSERVED_ROWS } from '../../src/core/index';
import { findVariable, type NetcdfFile, unpackVariable } from './netcdf';
import type { PinnedFile } from './pinnedFile';

/** The file, as the download knows it. */
export const OBSERVED_SOURCE: PinnedFile = {
	url: 'https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/2mSI-MO/air.2m.mon.ltm.nc',
	name: 'air.2m.mon.ltm.nc',
	bytes: 4_699_840,
	sha256: '38ae70640e246a1e90c1a0bca5a7032bdb20a8431a107f30fd1823409b3a57db',
};

/** The variable that holds the temperature. */
export const OBSERVED_VARIABLE = 'air';

/** The months the file holds. */
const MONTHS = 12;

/** The units a temperature may be given in, and how to make it Celsius. */
const UNITS_TO_CELSIUS: Readonly<Record<string, number>> = {
	K: -273.15,
	degK: -273.15,
	kelvin: -273.15,
	Kelvin: -273.15,
	degrees_K: -273.15,
	C: 0,
	degC: 0,
	celsius: 0,
	Celsius: 0,
	degrees_C: 0,
	degree_Celsius: 0,
};

/** The numbers of a variable of the file, if it has one with that name. */
const coordinates = (file: NetcdfFile, name: string): readonly number[] => [
	...(findVariable(file, name)?.values ?? []),
];

/**
 * For each row of the output, from 90° north, the row of the file at the
 * same latitude.
 *
 * @param latitudes - The file's latitudes, in its own order.
 * @returns {@link OBSERVED_ROWS} rows of the file, or null if the latitudes
 * are not each whole degree from -90 to 90 once.
 */
export const rowsFromNorth = (
	latitudes: readonly number[],
): number[] | null => {
	if (latitudes.length !== OBSERVED_ROWS) {
		return null;
	}
	const rows: number[] = [];
	for (let row = 0; row < OBSERVED_ROWS; row++) {
		const found = latitudes.indexOf(90 - row);
		if (found < 0) {
			return null;
		}
		rows.push(found);
	}
	return rows;
};

/**
 * The temperature the file holds, in degrees Celsius, laid out as the
 * project's data file is: twelve months, January to December, each row by
 * row from 90° north, each row column by column from 0° east.
 *
 * @remarks
 * Everything the layout depends on is checked first: the variable's
 * dimensions and their lengths, that its twelve times run forward, so
 * that the months are January to December in order, that the latitudes are each whole degree
 * from 90° south to 90° north once, in either order, that the longitudes
 * are 0° to 359° east in order, and that the units are kelvin or Celsius.
 * The scale factor, offset and missing values of the variable are applied
 * as it gives them.
 *
 * @param file - The source file as read.
 * @returns Twelve arrays of {@link OBSERVED_ROWS} × {@link OBSERVED_COLUMNS}
 * values.
 * @throws Error naming everything that is not as expected, or if any value
 * is missing.
 */
export const observedCelsius = (file: NetcdfFile): Float64Array[] => {
	const air = findVariable(file, OBSERVED_VARIABLE);
	if (air === undefined) {
		throw new Error(`The file has no variable ${OBSERVED_VARIABLE}`);
	}
	const wrong: string[] = [];
	const expected = `time, lat, lon of ${MONTHS} × ${OBSERVED_ROWS} × ${OBSERVED_COLUMNS}`;
	if (
		air.dimensions.join() !== 'time,lat,lon' ||
		air.shape.join() !== [MONTHS, OBSERVED_ROWS, OBSERVED_COLUMNS].join()
	) {
		wrong.push(
			`its dimensions are ${air.dimensions.map((name, axis) => `${name} ${air.shape[axis]}`).join(', ')}, expected ${expected}`,
		);
	}
	const rows = rowsFromNorth(coordinates(file, 'lat'));
	if (rows === null) {
		wrong.push('its latitudes are not each whole degree from -90 to 90 once');
	}
	const longitudes = coordinates(file, 'lon');
	if (
		longitudes.length !== OBSERVED_COLUMNS ||
		longitudes.some((longitude, column) => longitude !== column)
	) {
		wrong.push('its longitudes are not 0 to 359 in order');
	}
	const times = coordinates(file, 'time');
	if (
		times.length !== MONTHS ||
		times.some(
			(time, month) => month > 0 && !(time > (times[month - 1] as number)),
		)
	) {
		wrong.push(`its times are not ${MONTHS} in order`);
	}
	const units = air.attributes.get('units');
	const toCelsius =
		units?.type === 'char' ? UNITS_TO_CELSIUS[units.value] : undefined;
	if (toCelsius === undefined) {
		wrong.push(
			`its units are ${units === undefined ? 'missing' : JSON.stringify(units.value)}, expected kelvin or degrees Celsius`,
		);
	}
	if (wrong.length > 0 || rows === null || toCelsius === undefined) {
		throw new Error(
			`Variable ${OBSERVED_VARIABLE} is not laid out as expected: ${wrong.join('; ')}`,
		);
	}

	const values = unpackVariable(air);
	const perMonth = OBSERVED_ROWS * OBSERVED_COLUMNS;
	const months: Float64Array[] = [];
	for (let month = 0; month < MONTHS; month++) {
		const out = new Float64Array(perMonth);
		rows.forEach((sourceRow, row) => {
			const from = month * perMonth + sourceRow * OBSERVED_COLUMNS;
			for (let column = 0; column < OBSERVED_COLUMNS; column++) {
				const value = values[from + column] as number;
				if (Number.isNaN(value)) {
					throw new Error(
						`The value for month ${month + 1} at ${90 - row}°, ${column}° is missing`,
					);
				}
				out[row * OBSERVED_COLUMNS + column] = value + toCelsius;
			}
		});
		months.push(out);
	}
	return months;
};
