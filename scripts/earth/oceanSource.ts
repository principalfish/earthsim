/**
 * The sources of the observed sea: NOAA's long-term monthly mean
 * sea-surface temperature and its land-sea mask, and the Global Drifter
 * Program's monthly mean surface currents, with what each file must be
 * before a build reads it.
 *
 * The temperature and its mask are netCDF-3 files on the same grid of
 * degree-wide cells: 180 latitudes from 89.5° north to 89.5° south and 360
 * longitudes from 0.5° to 359.5° east. The temperature file holds a value in
 * every cell, land included, where NOAA's analysis has filled it in; the
 * mask says which cells are sea. The currents are two netCDF-3 files, one
 * for each component, on a quarter-degree grid, laid out month, longitude,
 * latitude, with NaN where there is no data.
 */

import {
	OCEAN_COLUMNS,
	OCEAN_ROWS,
	OCEAN_VALUES_PER_MONTH,
} from '../../src/core/index';
import { findVariable, type NetcdfFile, unpackVariable } from './netcdf';
import type { PinnedFile, SubsetSource } from './pinnedFile';
import type { FineGrid } from './regrid';

/** The months the files hold. */
const MONTHS = 12;

/**
 * NOAA PSL's THREDDS subset of the sea-surface temperature, as netCDF-3.
 * The original, `sst.ltm.1991-2020.nc` in the same dataset, is netCDF-4, which
 * the project's reader cannot read; the subset asks for all of its one
 * variable, every month and every cell, and the values are the same.
 */
export const SEA_TEMPERATURE_SOURCE: SubsetSource = {
	url: 'https://psl.noaa.gov/thredds/ncss/grid/Datasets/noaa.oisst.v2/sst.ltm.1991-2020.nc?var=sst&disableLLSubset=on&disableProjSubset=on&horizStride=1&temporal=all&accept=netcdf3',
	name: 'sst.ltm.1991-2020.subset.nc',
};

/** The variable that holds the temperature. */
export const SEA_TEMPERATURE_VARIABLE = 'sst';

/**
 * The SHA-256 of the temperature's values: the 12 × 180 × 360 values of
 * `sst` as stored in the file, month by month, row by row from the north,
 * each as a 32-bit float, little-endian.
 */
export const SEA_TEMPERATURE_VALUES_SHA256 =
	'997906a535c027cbeed937939182536639cd5471d8a97199790e41c988a6df37';

/** The land-sea mask's file, as the download knows it. */
export const LAND_SEA_MASK_SOURCE: PinnedFile = {
	url: 'https://downloads.psl.noaa.gov/Datasets/noaa.oisst.v2/lsmask.nc',
	name: 'lsmask.nc',
	bytes: 133_700,
	sha256: '7f5a9e7459a42c29ec5658e1458f71205034de1a01fc30f8225d5905a8fe2078',
};

/** The variable that holds the mask: 1 for sea, 0 for land. */
export const LAND_SEA_MASK_VARIABLE = 'mask';

const DRIFTER_ENDPOINT =
	'https://erddap.aoml.noaa.gov/gdp/erddap/griddap/drifter_monthlymeans.nc';

/** The index range of every month, longitude and latitude of the dataset. */
const DRIFTER_ALL = '%5B0:1:11%5D%5B0:1:1439%5D%5B0:1:631%5D';

/** The eastward current's file: ERDDAP's netCDF-3 subset of `U`. */
export const DRIFTER_EASTWARD_SOURCE: SubsetSource = {
	url: `${DRIFTER_ENDPOINT}?U${DRIFTER_ALL}`,
	name: 'drifter_monthlymeans-U.nc',
};

/** The northward current's file: ERDDAP's netCDF-3 subset of `V`. */
export const DRIFTER_NORTHWARD_SOURCE: SubsetSource = {
	url: `${DRIFTER_ENDPOINT}?V${DRIFTER_ALL}`,
	name: 'drifter_monthlymeans-V.nc',
};

/** The variable that holds the eastward current. */
export const DRIFTER_EASTWARD_VARIABLE = 'U';

/** The variable that holds the northward current. */
export const DRIFTER_NORTHWARD_VARIABLE = 'V';

/**
 * The SHA-256 of the currents' values: the 12 × 1440 × 632 values of `U`,
 * then those of `V`, as stored in the files, month by month, then column by
 * column from 179.875° west, then row by row from 72.875° south, each as a
 * 32-bit float, little-endian, with every NaN as the same bits.
 */
export const DRIFTER_VALUES_SHA256 =
	'375e2cdc218b33af5a14512b89a5a0bc9f54ec44302216f411408a94f61c0adb';

/** The shape of the currents' grid: a quarter degree, from 179.875° west, 72.875° south. */
export const DRIFTER_GRID: FineGrid = {
	perDegree: 4,
	columns: 1440,
	rows: 632,
	firstLongitudeDeg: -179.875,
	firstLatitudeDeg: -72.875,
};

/** The numbers of a variable of the file, if it has one with that name. */
const coordinates = (file: NetcdfFile, name: string): readonly number[] => [
	...(findVariable(file, name)?.values ?? []),
];

/** Whether a variable of a file has the dimensions and shape given. */
const hasShape = (
	file: NetcdfFile,
	name: string,
	dimensions: readonly string[],
	shape: readonly number[],
): boolean => {
	const variable = findVariable(file, name);
	return (
		variable !== undefined &&
		variable.dimensions.join() === dimensions.join() &&
		variable.shape.join() === shape.join()
	);
};

/** Whether a coordinate is `first`, `first + step`, … for `count` values. */
const isRegular = (
	values: readonly number[],
	count: number,
	first: number,
	step: number,
): boolean =>
	values.length === count &&
	values.every((value, index) => value === first + step * index);

/** The units attribute of a variable, if it has one as text. */
const unitsOf = (file: NetcdfFile, name: string): string | undefined => {
	const units = findVariable(file, name)?.attributes.get('units');
	return units?.type === 'char' ? units.value : undefined;
};

/**
 * What the temperature's file holds: the grid checks of the file and of the
 * mask, and where they differ from what a build reads.
 */
const seaTemperatureProblems = (
	file: NetcdfFile,
	mask: NetcdfFile,
): string[] => {
	const wrong: string[] = [];
	const grid = [OCEAN_ROWS, OCEAN_COLUMNS];
	if (
		!hasShape(
			file,
			SEA_TEMPERATURE_VARIABLE,
			['time', 'lat', 'lon'],
			[MONTHS, ...grid],
		)
	) {
		wrong.push(
			`${SEA_TEMPERATURE_VARIABLE} is not time, lat, lon of ${MONTHS} × ${OCEAN_ROWS} × ${OCEAN_COLUMNS}`,
		);
	}
	if (
		!hasShape(
			mask,
			LAND_SEA_MASK_VARIABLE,
			['time', 'lat', 'lon'],
			[1, ...grid],
		)
	) {
		wrong.push(
			`the mask is not time, lat, lon of 1 × ${OCEAN_ROWS} × ${OCEAN_COLUMNS}`,
		);
	}
	for (const [which, source] of [
		['The temperature file', file],
		['The mask', mask],
	] as const) {
		if (!isRegular(coordinates(source, 'lat'), OCEAN_ROWS, 89.5, -1)) {
			wrong.push(`${which}'s latitudes are not 89.5 to -89.5 a degree apart`);
		}
		if (!isRegular(coordinates(source, 'lon'), OCEAN_COLUMNS, 0.5, 1)) {
			wrong.push(`${which}'s longitudes are not 0.5 to 359.5 a degree apart`);
		}
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
	if (unitsOf(file, SEA_TEMPERATURE_VARIABLE) !== 'degC') {
		wrong.push(
			`its units are ${JSON.stringify(unitsOf(file, SEA_TEMPERATURE_VARIABLE))}, expected "degC"`,
		);
	}
	return wrong;
};

/**
 * The values of the temperature file as stored, for checking against
 * {@link SEA_TEMPERATURE_VALUES_SHA256}.
 *
 * @param file - The temperature file as read.
 * @returns The 12 × 180 × 360 values, as the file has them.
 * @throws Error if the file has no such variable.
 */
export const seaTemperatureStored = (file: NetcdfFile): ArrayLike<number> => {
	const variable = findVariable(file, SEA_TEMPERATURE_VARIABLE);
	if (variable === undefined) {
		throw new Error(`The file has no variable ${SEA_TEMPERATURE_VARIABLE}`);
	}
	return variable.values;
};

/**
 * The sea-surface temperature, in degrees Celsius, laid out as the project's
 * ocean file is: twelve months, January to December, each row by row from
 * 89.5° north, each row column by column from 0.5° east, with NaN on land.
 *
 * @remarks
 * Everything the layout depends on is checked first: that both files are
 * 180 × 360 with the latitudes and longitudes given above, that the twelve
 * times run forward, and that the units are degrees Celsius. The temperature
 * file marks no land itself, so a cell is land where the mask is 0; the mask
 * must be 0 or 1 everywhere. Every cell the mask calls sea must have a
 * temperature.
 *
 * @param file - The temperature file as read.
 * @param mask - The land-sea mask file as read.
 * @returns Twelve arrays of {@link OCEAN_VALUES_PER_MONTH} values.
 * @throws Error naming everything that is not as expected, or a sea cell
 * without a temperature.
 */
export const observedSeaCelsius = (
	file: NetcdfFile,
	mask: NetcdfFile,
): Float64Array[] => {
	const wrong = seaTemperatureProblems(file, mask);
	if (wrong.length > 0) {
		throw new Error(
			`The sea temperature is not laid out as expected: ${wrong.join('; ')}`,
		);
	}
	const temperature = findVariable(file, SEA_TEMPERATURE_VARIABLE);
	const sea = findVariable(mask, LAND_SEA_MASK_VARIABLE);
	if (temperature === undefined || sea === undefined) {
		throw new Error('The sea temperature or its mask is missing');
	}
	const stored = unpackVariable(temperature);
	const land = unpackVariable(sea);
	if (land.some((value) => value !== 0 && value !== 1)) {
		throw new Error('The land-sea mask holds something other than 0 and 1');
	}
	const months: Float64Array[] = [];
	for (let month = 0; month < MONTHS; month++) {
		const out = new Float64Array(OCEAN_VALUES_PER_MONTH);
		for (let index = 0; index < OCEAN_VALUES_PER_MONTH; index++) {
			if (land[index] === 0) {
				out[index] = Number.NaN;
				continue;
			}
			const value = stored[month * OCEAN_VALUES_PER_MONTH + index] as number;
			if (Number.isNaN(value)) {
				throw new Error(
					`The sea at row ${Math.floor(index / OCEAN_COLUMNS)}, column ${index % OCEAN_COLUMNS} has no temperature in month ${month + 1}`,
				);
			}
			out[index] = value;
		}
		months.push(out);
	}
	return months;
};

/**
 * The values of a current's file as stored, for checking against
 * {@link DRIFTER_VALUES_SHA256}.
 *
 * @param file - The file as read.
 * @param variable - `U` or `V`.
 * @throws Error if the file has no such variable.
 */
export const drifterStored = (
	file: NetcdfFile,
	variable: string,
): ArrayLike<number> => {
	const stored = findVariable(file, variable);
	if (stored === undefined) {
		throw new Error(`The file has no variable ${variable}`);
	}
	return stored.values;
};

/**
 * One component of the drifters' current, in metres a second, month by
 * month, in the source's layout: each month column by column from 179.875°
 * west, each column row by row from 72.875° south, with NaN where there is no
 * data.
 *
 * @remarks
 * Everything the layout depends on is checked first: the variable's
 * dimensions and lengths, that the months are 0 to 11, that the longitudes
 * and latitudes are exactly those of {@link DRIFTER_GRID}, and that the units
 * are metres a second. Missing values are NaN, as the file marks them.
 *
 * @param file - The file as read.
 * @param variable - `U` or `V`.
 * @param grid - The grid the file is expected to be on; the drifters' own by
 * default.
 * @returns Twelve arrays of 1440 × 632 values, or of the grid's size.
 * @throws Error naming everything that is not as expected.
 */
export const drifterMonths = (
	file: NetcdfFile,
	variable: string,
	grid: FineGrid = DRIFTER_GRID,
): Float64Array[] => {
	const { columns, rows, perDegree } = grid;
	const wrong: string[] = [];
	if (
		!hasShape(
			file,
			variable,
			['ClimatologicalMonth', 'longitude', 'latitude'],
			[MONTHS, columns, rows],
		)
	) {
		wrong.push(
			`its dimensions are not ClimatologicalMonth, longitude, latitude of ${MONTHS} × ${columns} × ${rows}`,
		);
	}
	if (!isRegular(coordinates(file, 'ClimatologicalMonth'), MONTHS, 0, 1)) {
		wrong.push('its months are not 0 to 11');
	}
	if (
		!isRegular(
			coordinates(file, 'longitude'),
			columns,
			grid.firstLongitudeDeg,
			1 / perDegree,
		)
	) {
		wrong.push(
			`its longitudes are not ${columns} from ${grid.firstLongitudeDeg}° east, ${1 / perDegree}° apart`,
		);
	}
	if (
		!isRegular(
			coordinates(file, 'latitude'),
			rows,
			grid.firstLatitudeDeg,
			1 / perDegree,
		)
	) {
		wrong.push(
			`its latitudes are not ${rows} from ${grid.firstLatitudeDeg}° north, ${1 / perDegree}° apart`,
		);
	}
	if (unitsOf(file, variable) !== 'meters per second') {
		wrong.push(
			`its units are ${JSON.stringify(unitsOf(file, variable))}, expected "meters per second"`,
		);
	}
	const stored = findVariable(file, variable);
	if (wrong.length > 0 || stored === undefined) {
		throw new Error(
			`Variable ${variable} is not laid out as expected: ${wrong.join('; ')}`,
		);
	}
	const values = unpackVariable(stored);
	const perMonth = columns * rows;
	return Array.from({ length: MONTHS }, (_, month) =>
		values.subarray(month * perMonth, (month + 1) * perMonth),
	);
};
