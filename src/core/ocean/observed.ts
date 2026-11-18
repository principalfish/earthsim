/**
 * The Earth's observed sea: reading the data files of its sea-surface
 * temperature and its surface currents, and taking any month of them onto
 * the cells of a world.
 *
 * Both files hold twelve months, January to December, on a one-degree grid
 * of cell centres, unlike the observed air temperature and winds, whose
 * points lie on whole degrees with a row at each pole: {@link OCEAN_ROWS}
 * rows of latitude from the north, each of {@link OCEAN_COLUMNS} longitudes
 * eastward from 0°, so that the value at row `r`, column `c` lies at the
 * centre of the degree-wide cell, at latitude `89.5 − r` and longitude
 * `c + 0.5` east. The sea-surface temperature's source is on this grid
 * already, and the currents' quarter-degree cells fall exactly four to a
 * side into its cells.
 *
 * Land and places without data are marked in the files by a byte no value
 * can have, and in memory by NaN, in every array this module gives; they
 * are never zero.
 *
 * The sea-surface temperature file holds one unsigned byte `b` for each
 * value: from 0 to 254 standing for `SEA_TEMPERATURE_BASE_C +
 * SEA_TEMPERATURE_STEP_C · b` degrees Celsius, 255 for no data. Bytes are
 * stored month by month, then row by row from the north, then column by
 * column from 0° east, with no header: {@link SEA_TEMPERATURE_BYTES} bytes.
 *
 * The currents file holds the current as two components, eastward and
 * northward. Each is one signed byte `b` from −127 to 127 standing for
 * `OCEAN_CURRENT_STEP_M_PER_S · b` metres a second, −128 for no data. A
 * place has both components or neither. Bytes are stored month by month;
 * within a month the whole eastward grid comes first, then the whole
 * northward one, each laid out as the temperature's: {@link
 * OCEAN_CURRENTS_BYTES} bytes, with no header.
 *
 * Taking a month onto a world's cells interpolates bilinearly between the
 * four points of the data around each cell's centre, with longitude
 * wrapping around the date line and latitude held at the first and last
 * rows beyond them, so that no value is made up past 89.5° north or south.
 * Only the points that have data are weighted: a point without data is left
 * out and the weights of the others are scaled to sum to one, so a coast
 * does not pull values towards zero or towards a neighbour's land. A cell
 * is without data only if none of the points around it that has any weight
 * has data. Currents are interpolated as vectors, as the winds are.
 */

import {
	type ByteCodec,
	codecMax,
	codecMin,
	dequantiseByte,
	quantiseByte,
} from '../earth/observedGrid';
import { sampleVectorsOnCells } from '../earth/observedVectors';
import type { Grid } from '../grid/grid';
import { cellLatitudes, MONTHS_PER_YEAR } from '../planet/insolation';

/** Rows of latitude in each month: one a degree, from 89.5° north. */
export const OCEAN_ROWS = 180;

/** Columns of longitude in each row: one a degree, from 0.5° east. */
export const OCEAN_COLUMNS = 360;

/** Values in each month of the data. */
export const OCEAN_VALUES_PER_MONTH = OCEAN_ROWS * OCEAN_COLUMNS;

/** The exact length of the sea-surface temperature file, in bytes. */
export const SEA_TEMPERATURE_BYTES = MONTHS_PER_YEAR * OCEAN_VALUES_PER_MONTH;

/** The temperature a stored 0 stands for, in degrees Celsius. */
export const SEA_TEMPERATURE_BASE_C = -2;

/**
 * The temperature between one stored value and the next, in degrees: a
 * power of two, so that every stored value is held exactly in 32 bits.
 */
export const SEA_TEMPERATURE_STEP_C = 0.25;

/** The byte that stands for land or no data in the temperature file. */
export const SEA_TEMPERATURE_NO_DATA_BYTE = 255;

/** How the file stores a temperature: 0 to 254, leaving 255 for no data. */
const SEA_TEMPERATURE_CODEC: ByteCodec = {
	lowest: 0,
	highest: SEA_TEMPERATURE_NO_DATA_BYTE - 1,
	base: SEA_TEMPERATURE_BASE_C,
	step: SEA_TEMPERATURE_STEP_C,
	units: '°C',
	quantity: 'sea temperature',
};

/** The lowest temperature the file can hold, in degrees Celsius. */
export const SEA_TEMPERATURE_MIN_C = codecMin(SEA_TEMPERATURE_CODEC);

/** The highest temperature the file can hold, in degrees Celsius. */
export const SEA_TEMPERATURE_MAX_C = codecMax(SEA_TEMPERATURE_CODEC);

/** The exact length of the currents file, in bytes: two components a month. */
export const OCEAN_CURRENTS_BYTES =
	MONTHS_PER_YEAR * 2 * OCEAN_VALUES_PER_MONTH;

/**
 * The current between one stored value and the next, in metres a second:
 * a thirty-second, so that every stored value is held exactly in 32 bits.
 */
export const OCEAN_CURRENT_STEP_M_PER_S = 0.03125;

/** The byte that stands for land or no data in the currents file. */
export const OCEAN_CURRENT_NO_DATA_BYTE = -128;

/** How the file stores a component: signed, 0 for still, -128 left over. */
const OCEAN_CURRENT_CODEC: ByteCodec = {
	lowest: OCEAN_CURRENT_NO_DATA_BYTE + 1,
	highest: 127,
	base: 0,
	step: OCEAN_CURRENT_STEP_M_PER_S,
	units: 'm/s',
	quantity: 'current',
};

/** The most westward or southward current the file can hold, in m/s. */
export const OCEAN_CURRENT_MIN_M_PER_S = codecMin(OCEAN_CURRENT_CODEC);

/** The most eastward or northward current the file can hold, in m/s. */
export const OCEAN_CURRENT_MAX_M_PER_S = codecMax(OCEAN_CURRENT_CODEC);

/** The observed sea-surface temperature, as the data file gives it. */
export type ObservedSeaTemperature = {
	/**
	 * Twelve grids, January to December, of degrees Celsius, each
	 * {@link OCEAN_VALUES_PER_MONTH} long and laid out as the file is: row
	 * by row from the north, column by column from 0° east. Land and places
	 * without data are NaN. They must be treated as read-only.
	 */
	readonly months: readonly Float32Array[];
};

/** The observed surface currents, as the data file gives them. */
export type ObservedCurrents = {
	/**
	 * Twelve grids, January to December, of the eastward current in metres a
	 * second, each {@link OCEAN_VALUES_PER_MONTH} long and laid out as the
	 * temperature's. Land and places without data are NaN, in `north` too.
	 * They must be treated as read-only.
	 */
	readonly east: readonly Float32Array[];
	/** Twelve grids of the northward current, laid out as `east` is. */
	readonly north: readonly Float32Array[];
};

/**
 * Twelve fields of sea-surface temperature on a world's cells, January to
 * December, in degrees Celsius, each indexed like the grid's cells; NaN
 * where the cell has no data.
 */
export type MonthlySeaTemperature = readonly Float32Array[];

/** Twelve months of surface current on a world's cells, in metres a second. */
export type MonthlyCurrents = {
	/**
	 * Twelve fields, January to December, of the eastward current at each
	 * cell's centre, each indexed like the grid's cells; NaN where the cell
	 * has no data.
	 */
	readonly east: readonly Float32Array[];
	/** Twelve fields of the northward current, indexed as `east` is. */
	readonly north: readonly Float32Array[];
};

const RADIANS_PER_DEGREE = Math.PI / 180;
const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * The stored value for a temperature: the nearest step, a value that lies
 * halfway between two going to the higher.
 *
 * @param celsius - A temperature in degrees Celsius; NaN for no data.
 * @returns A whole number from 0 to 254, or
 * {@link SEA_TEMPERATURE_NO_DATA_BYTE} for NaN.
 * @throws RangeError if the temperature is so far outside
 * {@link SEA_TEMPERATURE_MIN_C} to {@link SEA_TEMPERATURE_MAX_C} that its
 * nearest step lies outside them too, rather than bringing it within them.
 */
export const quantiseSeaTemperature = (celsius: number): number =>
	Number.isNaN(celsius)
		? SEA_TEMPERATURE_NO_DATA_BYTE
		: quantiseByte(SEA_TEMPERATURE_CODEC, celsius);

/**
 * The temperature a stored value stands for, in degrees Celsius.
 *
 * @param stored - A whole number from 0 to 255.
 * @returns NaN for {@link SEA_TEMPERATURE_NO_DATA_BYTE}.
 */
export const dequantiseSeaTemperature = (stored: number): number =>
	stored === SEA_TEMPERATURE_NO_DATA_BYTE
		? Number.NaN
		: dequantiseByte(SEA_TEMPERATURE_CODEC, stored);

/**
 * The stored value for a current component: the nearest step, a value that
 * lies halfway between two going to the higher.
 *
 * @param metresPerSecond - An eastward or northward current; negative for a
 * westward or southward one.
 * @returns A whole number from -127 to 127.
 * @throws RangeError if the current is NaN, or so far outside
 * {@link OCEAN_CURRENT_MIN_M_PER_S} to {@link OCEAN_CURRENT_MAX_M_PER_S}
 * that its nearest step lies outside them too, rather than bringing it
 * within them.
 */
export const quantiseCurrent = (metresPerSecond: number): number =>
	quantiseByte(OCEAN_CURRENT_CODEC, metresPerSecond);

/**
 * The current a stored value stands for, in metres a second.
 *
 * @param stored - A whole number from -127 to 127.
 */
export const dequantiseCurrent = (stored: number): number =>
	dequantiseByte(OCEAN_CURRENT_CODEC, stored);

/**
 * Checks that there are twelve grids of {@link OCEAN_VALUES_PER_MONTH}
 * values.
 *
 * @throws RangeError naming the first thing that is wrong.
 */
const assertTwelveGrids = (
	quantity: string,
	months: readonly ArrayLike<number>[],
): void => {
	if (months.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`Observed ${quantity} has ${MONTHS_PER_YEAR} months; got ${months.length}`,
		);
	}
	months.forEach((values, month) => {
		if (values.length !== OCEAN_VALUES_PER_MONTH) {
			throw new RangeError(
				`Each month of observed ${quantity} has ${OCEAN_VALUES_PER_MONTH} values; month ${month} has ${values.length}`,
			);
		}
	});
};

/**
 * The bytes of the sea-surface temperature file for twelve months.
 *
 * @param months - Twelve grids, January to December, of degrees Celsius,
 * laid out as {@link ObservedSeaTemperature.months} is, NaN for land and no
 * data. They are not changed.
 * @returns {@link SEA_TEMPERATURE_BYTES} bytes.
 * @throws RangeError if there are not twelve grids of
 * {@link OCEAN_VALUES_PER_MONTH} values, or if any value is one
 * {@link quantiseSeaTemperature} refuses.
 */
export const encodeObservedSeaTemperature = (
	months: readonly ArrayLike<number>[],
): Uint8Array<ArrayBuffer> => {
	assertTwelveGrids('sea temperature', months);
	const bytes = new Uint8Array(SEA_TEMPERATURE_BYTES);
	months.forEach((values, month) => {
		const start = month * OCEAN_VALUES_PER_MONTH;
		for (let index = 0; index < OCEAN_VALUES_PER_MONTH; index++) {
			bytes[start + index] = quantiseSeaTemperature(values[index] as number);
		}
	});
	return bytes;
};

/**
 * Reads the bytes of the observed sea-surface temperature file.
 *
 * @remarks
 * The length is the only thing about the bytes that can be wrong: every
 * byte is a temperature or no data.
 *
 * @param bytes - The whole file. It is not changed and not kept.
 * @returns The temperatures, in arrays that owe nothing to `bytes`, NaN
 * where the file has no data.
 * @throws RangeError if `bytes` is not exactly {@link SEA_TEMPERATURE_BYTES}
 * long.
 */
export const decodeObservedSeaTemperature = (
	bytes: Uint8Array,
): ObservedSeaTemperature => {
	if (bytes.length !== SEA_TEMPERATURE_BYTES) {
		throw new RangeError(
			`The observed sea temperature file is ${SEA_TEMPERATURE_BYTES} bytes long; got ${bytes.length}`,
		);
	}
	const months: Float32Array[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const values = new Float32Array(OCEAN_VALUES_PER_MONTH);
		const start = month * OCEAN_VALUES_PER_MONTH;
		for (let index = 0; index < OCEAN_VALUES_PER_MONTH; index++) {
			values[index] = dequantiseSeaTemperature(bytes[start + index] as number);
		}
		months.push(values);
	}
	return { months };
};

/**
 * The bytes of the currents file for twelve months.
 *
 * @param currents - Twelve grids, January to December, of each component in
 * metres a second, laid out as {@link ObservedCurrents} is, NaN for land and
 * no data. A place has both components or neither. They are not changed.
 * @returns {@link OCEAN_CURRENTS_BYTES} bytes, each a signed byte.
 * @throws RangeError if either component does not have twelve grids of
 * {@link OCEAN_VALUES_PER_MONTH} values, if only one component of a place is
 * NaN, or if any value is one {@link quantiseCurrent} refuses.
 */
export const encodeObservedCurrents = (currents: {
	readonly east: readonly ArrayLike<number>[];
	readonly north: readonly ArrayLike<number>[];
}): Uint8Array<ArrayBuffer> => {
	assertTwelveGrids('eastward current', currents.east);
	assertTwelveGrids('northward current', currents.north);
	const bytes = new Uint8Array(OCEAN_CURRENTS_BYTES);
	// The same bytes written as signed: a negative value is stored as its
	// two's complement.
	const signed = new Int8Array(bytes.buffer);
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const east = currents.east[month] as ArrayLike<number>;
		const north = currents.north[month] as ArrayLike<number>;
		const start = 2 * month * OCEAN_VALUES_PER_MONTH;
		for (let index = 0; index < OCEAN_VALUES_PER_MONTH; index++) {
			const u = east[index] as number;
			const v = north[index] as number;
			if (Number.isNaN(u) !== Number.isNaN(v)) {
				throw new RangeError(
					`Month ${month} has only one component of the current at value ${index}`,
				);
			}
			if (Number.isNaN(u)) {
				signed[start + index] = OCEAN_CURRENT_NO_DATA_BYTE;
				signed[start + OCEAN_VALUES_PER_MONTH + index] =
					OCEAN_CURRENT_NO_DATA_BYTE;
			} else {
				signed[start + index] = quantiseCurrent(u);
				signed[start + OCEAN_VALUES_PER_MONTH + index] = quantiseCurrent(v);
			}
		}
	}
	return bytes;
};

/**
 * Reads the bytes of the observed currents file.
 *
 * @remarks
 * The length is the only thing about the bytes that can be wrong: every
 * byte is a current or no data. A place that has no data in one component
 * and a current in the other is made without data in both.
 *
 * @param bytes - The whole file. It is not changed and not kept.
 * @returns The currents, in arrays that owe nothing to `bytes`, NaN where
 * the file has no data.
 * @throws RangeError if `bytes` is not exactly {@link OCEAN_CURRENTS_BYTES}
 * long.
 */
export const decodeObservedCurrents = (bytes: Uint8Array): ObservedCurrents => {
	if (bytes.length !== OCEAN_CURRENTS_BYTES) {
		throw new RangeError(
			`The observed currents file is ${OCEAN_CURRENTS_BYTES} bytes long; got ${bytes.length}`,
		);
	}
	// The same bytes read as signed, as they were stored.
	const signed = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
	const east: Float32Array[] = [];
	const north: Float32Array[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const u = new Float32Array(OCEAN_VALUES_PER_MONTH);
		const v = new Float32Array(OCEAN_VALUES_PER_MONTH);
		const start = 2 * month * OCEAN_VALUES_PER_MONTH;
		for (let index = 0; index < OCEAN_VALUES_PER_MONTH; index++) {
			const storedEast = signed[start + index] as number;
			const storedNorth = signed[
				start + OCEAN_VALUES_PER_MONTH + index
			] as number;
			if (
				storedEast === OCEAN_CURRENT_NO_DATA_BYTE ||
				storedNorth === OCEAN_CURRENT_NO_DATA_BYTE
			) {
				u[index] = Number.NaN;
				v[index] = Number.NaN;
			} else {
				u[index] = dequantiseCurrent(storedEast);
				v[index] = dequantiseCurrent(storedNorth);
			}
		}
		east.push(u);
		north.push(v);
	}
	return { east, north };
};

/**
 * Finds the four points of the data around a place, and the weights of each
 * in bilinear interpolation, and writes them.
 *
 * @remarks
 * The four points are north-west, north-east, south-west and south-east of
 * the place. Longitude wraps, so a place between 359.5° and 0.5° east lies
 * between the last column and the first. Where a place lies north of the
 * first row or south of the last, both rows around it are that row and the
 * weights of the two southern points are 0.
 *
 * @param latitudeDeg - Latitude in degrees, from -90 to 90.
 * @param longitudeDeg - Longitude in degrees east, any finite value.
 * @param corners - Where the indices in a month of the four points go, from
 * `at`.
 * @param weights - Where their weights, summing to 1, go, from `at`.
 * @param at - Where in `corners` and `weights` the four values start.
 */
export const writeOceanLocation = (
	latitudeDeg: number,
	longitudeDeg: number,
	corners: Int32Array,
	weights: Float64Array,
	at: number,
): void => {
	// Rows count from the north, their centres half a degree in.
	const down = 89.5 - latitudeDeg;
	let rowNorth: number;
	let rowSouth: number;
	let south: number;
	if (down <= 0) {
		rowNorth = 0;
		rowSouth = 0;
		south = 0;
	} else if (down >= OCEAN_ROWS - 1) {
		rowNorth = OCEAN_ROWS - 1;
		rowSouth = OCEAN_ROWS - 1;
		south = 0;
	} else {
		rowNorth = Math.floor(down);
		rowSouth = rowNorth + 1;
		south = down - rowNorth;
	}
	let across = longitudeDeg % 360;
	if (across < 0) {
		across += 360;
	}
	// A tiny negative longitude can come to 360 itself once 360 is added.
	if (across >= 360) {
		across -= 360;
	}
	// Columns' centres are half a degree in; before the first lies the
	// last, a degree behind it.
	const along = across - 0.5;
	const columnBefore = Math.floor(along);
	const east = along - columnBefore;
	const columnWest = (columnBefore + OCEAN_COLUMNS) % OCEAN_COLUMNS;
	const columnEast = (columnWest + 1) % OCEAN_COLUMNS;
	corners[at] = rowNorth * OCEAN_COLUMNS + columnWest;
	corners[at + 1] = rowNorth * OCEAN_COLUMNS + columnEast;
	corners[at + 2] = rowSouth * OCEAN_COLUMNS + columnWest;
	corners[at + 3] = rowSouth * OCEAN_COLUMNS + columnEast;
	weights[at] = (1 - east) * (1 - south);
	weights[at + 1] = east * (1 - south);
	weights[at + 2] = (1 - east) * south;
	weights[at + 3] = east * south;
};

/**
 * Where the centre of each cell of a world falls among the points of the
 * data: the four around it, and the weights of each, four to a cell.
 */
type OceanLocations = {
	readonly corners: Int32Array;
	readonly weights: Float64Array;
};

const LOCATIONS = new WeakMap<Grid, OceanLocations>();

/**
 * Where each cell's centre falls among the points of the data, worked out
 * once for each grid and used for every month.
 */
const locateCells = (grid: Grid): OceanLocations => {
	const known = LOCATIONS.get(grid);
	if (known !== undefined) {
		return known;
	}
	const { centres, cellCount } = grid;
	const latitudes = cellLatitudes(grid);
	const corners = new Int32Array(4 * cellCount);
	const weights = new Float64Array(4 * cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		// At a pole x and y are both 0, and atan2 gives longitude 0.
		const longitudeDeg =
			Math.atan2(centres[3 * cell + 1] as number, centres[3 * cell] as number) *
			DEGREES_PER_RADIAN;
		writeOceanLocation(
			latitudes[cell] as number,
			longitudeDeg,
			corners,
			weights,
			4 * cell,
		);
	}
	const located = { corners, weights };
	LOCATIONS.set(grid, located);
	return located;
};

/**
 * The observed sea-surface temperature of every month on the cells of a
 * world.
 *
 * @remarks
 * Each cell takes the value at its centre, interpolated bilinearly between
 * the four points of the data around it, leaving out the points without
 * data and scaling the weights of the others to sum to one; see the
 * module's description. A cell with no point of data around it, such as a
 * cell of land away from any coast, is NaN.
 *
 * @param grid - The world's grid.
 * @param data - The observed sea temperature. It is not changed.
 * @returns Twelve new arrays, January to December, each one value per cell
 * in cell order, in degrees Celsius, NaN where the cell has no data.
 * @throws RangeError if the data does not hold twelve months of the right
 * length.
 */
export const observedSeaTemperatureOn = (
	grid: Grid,
	data: ObservedSeaTemperature,
): MonthlySeaTemperature => {
	assertTwelveGrids('sea temperature', data.months);
	const { cellCount } = grid;
	const { corners, weights } = locateCells(grid);
	return data.months.map((values) => {
		const field = new Float32Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			let sum = 0;
			let weightSum = 0;
			for (let corner = 4 * cell; corner < 4 * cell + 4; corner++) {
				const value = values[corners[corner] as number] as number;
				if (!Number.isNaN(value)) {
					const weight = weights[corner] as number;
					sum += weight * value;
					weightSum += weight;
				}
			}
			field[cell] = weightSum > 0 ? sum / weightSum : Number.NaN;
		}
		return field;
	});
};

/**
 * The observed surface currents of every month on the cells of a world.
 *
 * @remarks
 * Currents are interpolated as vectors, not as two separate numbers, as the
 * observed winds are: each of the four points of the data around a cell's
 * centre that has data has its eastward and northward current made into a
 * vector in three dimensions along that point's own directions east and
 * north, the vectors are summed with the temperature's weights, scaled to
 * sum to one over the points that have data, and the result is split into
 * the eastward and northward current along the cell centre's own directions.
 * A current across a pole therefore keeps its strength there, where
 * averaging the eastward components of points on either side of the pole
 * would cancel them. Both sets of directions are those of
 * `writeEastNorthFrame`, the centres' from `cellFrames`. A cell
 * with no point of data around it is NaN in both components.
 *
 * @param grid - The world's grid.
 * @param data - The observed currents. It is not changed.
 * @returns Twelve new arrays, January to December, of each component, each
 * one value per cell in cell order, in metres a second.
 * @throws RangeError if the data does not hold twelve months of the right
 * length for each component.
 */
export const observedCurrentsOn = (
	grid: Grid,
	data: ObservedCurrents,
): MonthlyCurrents => {
	assertTwelveGrids('eastward current', data.east);
	assertTwelveGrids('northward current', data.north);
	const located = locateCells(grid);

	const rowSin = new Float64Array(OCEAN_ROWS);
	const rowCos = new Float64Array(OCEAN_ROWS);
	for (let row = 0; row < OCEAN_ROWS; row++) {
		rowSin[row] = Math.sin((89.5 - row) * RADIANS_PER_DEGREE);
		rowCos[row] = Math.cos((89.5 - row) * RADIANS_PER_DEGREE);
	}
	const columnSin = new Float64Array(OCEAN_COLUMNS);
	const columnCos = new Float64Array(OCEAN_COLUMNS);
	for (let column = 0; column < OCEAN_COLUMNS; column++) {
		columnSin[column] = Math.sin((column + 0.5) * RADIANS_PER_DEGREE);
		columnCos[column] = Math.cos((column + 0.5) * RADIANS_PER_DEGREE);
	}

	return sampleVectorsOnCells(
		{
			grid,
			columns: OCEAN_COLUMNS,
			rowSin,
			rowCos,
			columnSin,
			columnCos,
			leaveOutNoData: true,
			locate: (cell, corners, weights) => {
				for (let corner = 0; corner < 4; corner++) {
					corners[corner] = located.corners[4 * cell + corner] as number;
					weights[corner] = located.weights[4 * cell + corner] as number;
				}
			},
		},
		data.east,
		data.north,
	);
};
