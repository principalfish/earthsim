/**
 * The sources of the observed data: long-term monthly means, 1981 to 2010,
 * from NOAA's Twentieth Century Reanalysis version 3, of the air
 * temperature two metres up, of the eastward and northward wind ten metres
 * up, and of the air pressure reduced to sea level.
 *
 * Each is a netCDF-3 classic file with one variable of 32-bit floats by
 * month, latitude and longitude: twelve months, 181 latitudes a degree
 * apart from 90° south to 90° north, and 360 longitudes a degree apart
 * eastward from 0°. Each value is the quantity at that point: `air` in
 * kelvin, `uwnd` and `vwnd` in metres a second, `prmsl` in pascals.
 */

import { OBSERVED_COLUMNS, OBSERVED_ROWS } from '../../src/core/index';
import { findVariable, type NetcdfFile, unpackVariable } from './netcdf';
import type { PinnedFile } from './pinnedFile';

/** The temperature's file, as the download knows it. */
export const OBSERVED_SOURCE: PinnedFile = {
	url: 'https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/2mSI-MO/air.2m.mon.ltm.nc',
	name: 'air.2m.mon.ltm.nc',
	bytes: 4_699_840,
	sha256: '38ae70640e246a1e90c1a0bca5a7032bdb20a8431a107f30fd1823409b3a57db',
};

/** The variable that holds the temperature. */
export const OBSERVED_VARIABLE = 'air';

/** The eastward wind's file, as the download knows it. */
export const OBSERVED_EASTWARD_WIND_SOURCE: PinnedFile = {
	url: 'https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/10mSI-MO/uwnd.10m.mon.ltm.nc',
	name: 'uwnd.10m.mon.ltm.nc',
	bytes: 3_135_968,
	sha256: '4450426e3ca074f78af0126515d3d14e5245789be68b8d1d21e9f84d694b794d',
};

/** The variable that holds the eastward wind. */
export const OBSERVED_EASTWARD_WIND_VARIABLE = 'uwnd';

/** The northward wind's file, as the download knows it. */
export const OBSERVED_NORTHWARD_WIND_SOURCE: PinnedFile = {
	url: 'https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/10mSI-MO/vwnd.10m.mon.ltm.nc',
	name: 'vwnd.10m.mon.ltm.nc',
	bytes: 3_135_968,
	sha256: '9a8432467c7c2274cde58144897e699d50d8f92f72c2f162b894d37e9d6002f9',
};

/** The variable that holds the northward wind. */
export const OBSERVED_NORTHWARD_WIND_VARIABLE = 'vwnd';

/** The sea-level pressure's file, as the download knows it. */
export const OBSERVED_PRESSURE_SOURCE: PinnedFile = {
	url: 'https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/miscSI-MO/prmsl.mon.ltm.nc',
	name: 'prmsl.mon.ltm.nc',
	bytes: 4_699_888,
	sha256: '841c8ac2a878899f1d2bed9560dc004c60f59bf0b6542d4ff70da5b95be56c8c',
};

/** The variable that holds the sea-level pressure. */
export const OBSERVED_PRESSURE_VARIABLE = 'prmsl';

/** The months the file holds. */
const MONTHS = 12;

/** How to turn a value given in some units into the units wanted. */
type Conversion = (value: number) => number;

/** The units a variable may be given in, and how to make each the ones wanted. */
type Units = {
	/** Each spelling of the units accepted, with its conversion. */
	readonly conversions: Readonly<Record<string, Conversion>>;
	/** The units accepted, as a message names them. */
	readonly description: string;
};

const fromKelvin: Conversion = (kelvin) => kelvin - 273.15;
const unchanged: Conversion = (value) => value;
const pascalsToHectopascals: Conversion = (pascals) => pascals / 100;

/** The units a temperature may be given in, and how to make it Celsius. */
const CELSIUS: Units = {
	conversions: {
		K: fromKelvin,
		degK: fromKelvin,
		kelvin: fromKelvin,
		Kelvin: fromKelvin,
		degrees_K: fromKelvin,
		C: unchanged,
		degC: unchanged,
		celsius: unchanged,
		Celsius: unchanged,
		degrees_C: unchanged,
		degree_Celsius: unchanged,
	},
	description: 'kelvin or degrees Celsius',
};

/** The units a wind may be given in: metres a second only. */
const METRES_PER_SECOND: Units = {
	conversions: {
		'm/s': unchanged,
		'm s-1': unchanged,
		'm s**-1': unchanged,
		'm s^-1': unchanged,
		'meters/second': unchanged,
		'metres/second': unchanged,
		meter_per_second: unchanged,
		metre_per_second: unchanged,
	},
	description: 'metres a second',
};

/** The units a pressure may be given in, and how to make it hectopascals. */
const HECTOPASCALS: Units = {
	conversions: {
		Pa: pascalsToHectopascals,
		pascal: pascalsToHectopascals,
		pascals: pascalsToHectopascals,
		Pascal: pascalsToHectopascals,
		Pascals: pascalsToHectopascals,
		hPa: unchanged,
		mbar: unchanged,
		millibar: unchanged,
		millibars: unchanged,
		mb: unchanged,
	},
	description: 'pascals or hectopascals',
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
 * A variable of a file, in the units wanted, laid out as the project's data
 * files are: twelve months, January to December, each row by row from 90°
 * north, each row column by column from 0° east.
 *
 * @remarks
 * Everything the layout depends on is checked first: the variable's
 * dimensions and their lengths, that its twelve times run forward, so
 * that the months are January to December in order, that the latitudes are
 * each whole degree from 90° south to 90° north once, in either order, that
 * the longitudes are 0° to 359° east in order, and that the units are ones
 * `units` accepts. The scale factor, offset and missing values of the
 * variable are applied as it gives them.
 *
 * @throws Error naming everything that is not as expected, or if any value
 * is missing.
 */
const monthsOf = (
	file: NetcdfFile,
	name: string,
	units: Units,
): Float64Array[] => {
	const variable = findVariable(file, name);
	if (variable === undefined) {
		throw new Error(`The file has no variable ${name}`);
	}
	const wrong: string[] = [];
	const expected = `time, lat, lon of ${MONTHS} × ${OBSERVED_ROWS} × ${OBSERVED_COLUMNS}`;
	if (
		variable.dimensions.join() !== 'time,lat,lon' ||
		variable.shape.join() !== [MONTHS, OBSERVED_ROWS, OBSERVED_COLUMNS].join()
	) {
		wrong.push(
			`its dimensions are ${variable.dimensions.map((dimension, axis) => `${dimension} ${variable.shape[axis]}`).join(', ')}, expected ${expected}`,
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
	const given = variable.attributes.get('units');
	const convert =
		given?.type === 'char' && Object.hasOwn(units.conversions, given.value)
			? units.conversions[given.value]
			: undefined;
	if (convert === undefined) {
		wrong.push(
			`its units are ${given === undefined ? 'missing' : JSON.stringify(given.value)}, expected ${units.description}`,
		);
	}
	if (wrong.length > 0 || rows === null || convert === undefined) {
		throw new Error(
			`Variable ${name} is not laid out as expected: ${wrong.join('; ')}`,
		);
	}

	const values = unpackVariable(variable);
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
				out[row * OBSERVED_COLUMNS + column] = convert(value);
			}
		});
		months.push(out);
	}
	return months;
};

/**
 * The temperature the file holds, in degrees Celsius, laid out as the
 * project's data file is: twelve months, January to December, each row by
 * row from 90° north, each row column by column from 0° east.
 *
 * @remarks
 * Everything the layout depends on is checked first: the variable's
 * dimensions and their lengths, that its twelve times run forward, so
 * that the months are January to December in order, that the latitudes
 * are each whole degree from 90° south to 90° north once, in either order,
 * that the longitudes are 0° to 359° east in order, and that the units are
 * kelvin or Celsius. The scale factor, offset and missing values of the
 * variable are applied as it gives them.
 *
 * @param file - The source file as read.
 * @returns Twelve arrays of {@link OBSERVED_ROWS} × {@link OBSERVED_COLUMNS}
 * values.
 * @throws Error naming everything that is not as expected, or if any value
 * is missing.
 */
export const observedCelsius = (file: NetcdfFile): Float64Array[] =>
	monthsOf(file, OBSERVED_VARIABLE, CELSIUS);

/**
 * The eastward wind the file holds, in metres a second, laid out as the
 * project's wind file is: twelve months, January to December, each row by
 * row from 90° north, each row column by column from 0° east.
 *
 * @remarks
 * The layout is checked as {@link observedCelsius} checks it, and the units
 * must be metres a second.
 *
 * @param file - The source file as read.
 * @returns Twelve arrays of {@link OBSERVED_ROWS} × {@link OBSERVED_COLUMNS}
 * values, positive for a wind towards the east.
 * @throws Error naming everything that is not as expected, or if any value
 * is missing.
 */
export const observedEastwardWind = (file: NetcdfFile): Float64Array[] =>
	monthsOf(file, OBSERVED_EASTWARD_WIND_VARIABLE, METRES_PER_SECOND);

/**
 * The northward wind the file holds, in metres a second, laid out as
 * {@link observedEastwardWind} lays out the eastward.
 *
 * @remarks
 * The layout is checked as {@link observedCelsius} checks it, and the units
 * must be metres a second.
 *
 * @param file - The source file as read.
 * @returns Twelve arrays of {@link OBSERVED_ROWS} × {@link OBSERVED_COLUMNS}
 * values, positive for a wind towards the north.
 * @throws Error naming everything that is not as expected, or if any value
 * is missing.
 */
export const observedNorthwardWind = (file: NetcdfFile): Float64Array[] =>
	monthsOf(file, OBSERVED_NORTHWARD_WIND_VARIABLE, METRES_PER_SECOND);

/**
 * The sea-level pressure the file holds, in hectopascals, laid out as the
 * project's pressure file is: twelve months, January to December, each row
 * by row from 90° north, each row column by column from 0° east.
 *
 * @remarks
 * The layout is checked as {@link observedCelsius} checks it, and the units
 * must be pascals, which are divided by 100, or hectopascals.
 *
 * @param file - The source file as read.
 * @returns Twelve arrays of {@link OBSERVED_ROWS} × {@link OBSERVED_COLUMNS}
 * values.
 * @throws Error naming everything that is not as expected, or if any value
 * is missing.
 */
export const observedHectopascals = (file: NetcdfFile): Float64Array[] =>
	monthsOf(file, OBSERVED_PRESSURE_VARIABLE, HECTOPASCALS);
