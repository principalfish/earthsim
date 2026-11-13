/**
 * The Earth's observed surface winds and sea-level pressure: reading their
 * data files, and taking any month of them onto the cells of a world.
 *
 * Both files hold means for each of the twelve months, January to
 * December, averaged over the years 1981 to 2010, on the same one-degree
 * grid as the observed temperature: {@link OBSERVED_ROWS} rows of latitude
 * from 90° north to 90° south, each of {@link OBSERVED_COLUMNS} longitudes
 * eastward from 0°, so that the value at row `r`, column `c` lies at
 * latitude `90 − r` and longitude `c` east. The two pole rows hold a value
 * for each longitude, as the source does.
 *
 * The wind file holds the wind ten metres above the ground or the sea, as
 * two components: eastward and northward. Each is one signed byte `b`,
 * standing for `OBSERVED_WIND_STEP_M_PER_S · b` metres a second: quarter
 * steps from −32 to 31.75 m/s. Bytes are stored month by month; within a
 * month the whole eastward grid comes first, then the whole northward one;
 * each grid is stored row by row from the north, then column by column from
 * 0° east, with no header: {@link OBSERVED_WIND_BYTES} bytes in all.
 *
 * The pressure file holds the air pressure reduced to sea level. Each
 * value is one unsigned byte `b`, standing for
 * `OBSERVED_PRESSURE_BASE_HPA + OBSERVED_PRESSURE_STEP_HPA · b`
 * hectopascals: half steps from 940 to 1,067.5 hPa. Bytes are stored as the
 * temperature's are: month by month, then row by row from the north, then
 * column by column from 0° east, with no header:
 * {@link OBSERVED_PRESSURE_BYTES} bytes in all.
 */

import { getGrid, type SUPPORTED_RESOLUTIONS } from './grid';
import { MONTHS_PER_YEAR } from './insolation';
import {
	assertGridsToEncode,
	assertResolution,
	assertTwelveGrids,
	type ByteCodec,
	codecMax,
	codecMin,
	decodeBytes,
	decodeGrid,
	dequantiseByte,
	encodeBytes,
	encodeGrid,
	interpolateOnCells,
	locateCells,
	OBSERVED_COLUMNS,
	OBSERVED_ROWS,
	OBSERVED_VALUES_PER_MONTH,
	quantiseByte,
	SIGNED_BYTE,
	UNSIGNED_BYTE,
} from './observedGrid';
import {
	cellFrames,
	createEastNorthFrame,
	type EastNorthFrame,
	writeEastNorthFrame,
} from './vector';

/** The exact length of the wind file, in bytes: two components a month. */
export const OBSERVED_WIND_BYTES =
	MONTHS_PER_YEAR * 2 * OBSERVED_VALUES_PER_MONTH;

/** The wind between one stored value and the next, in metres a second. */
export const OBSERVED_WIND_STEP_M_PER_S = 0.25;

/** How the wind file stores each component: signed, with 0 for calm. */
const WIND_CODEC: ByteCodec = {
	...SIGNED_BYTE,
	base: 0,
	step: OBSERVED_WIND_STEP_M_PER_S,
	units: 'm/s',
	quantity: 'wind',
};

/** The most westward or southward wind the file can hold, in m/s. */
export const OBSERVED_WIND_MIN_M_PER_S = codecMin(WIND_CODEC);

/** The most eastward or northward wind the file can hold, in m/s. */
export const OBSERVED_WIND_MAX_M_PER_S = codecMax(WIND_CODEC);

/** The exact length of the pressure file, in bytes. */
export const OBSERVED_PRESSURE_BYTES =
	MONTHS_PER_YEAR * OBSERVED_VALUES_PER_MONTH;

/** The pressure a stored 0 stands for, in hectopascals. */
export const OBSERVED_PRESSURE_BASE_HPA = 940;

/** The pressure between one stored value and the next, in hectopascals. */
export const OBSERVED_PRESSURE_STEP_HPA = 0.5;

/** How the pressure file stores each pressure. */
const PRESSURE_CODEC: ByteCodec = {
	...UNSIGNED_BYTE,
	base: OBSERVED_PRESSURE_BASE_HPA,
	step: OBSERVED_PRESSURE_STEP_HPA,
	units: 'hPa',
	quantity: 'pressure',
};

/** The highest pressure the file can hold, in hectopascals. */
export const OBSERVED_PRESSURE_MAX_HPA = codecMax(PRESSURE_CODEC);

/** The observed wind, as the data file gives it. */
export type ObservedWind = {
	/**
	 * Twelve grids, January to December, of the eastward wind in metres a
	 * second, each {@link OBSERVED_VALUES_PER_MONTH} long and laid out row by
	 * row from the north, column by column from 0° east. They must be
	 * treated as read-only.
	 */
	readonly east: readonly Float32Array[];
	/** Twelve grids of the northward wind, laid out as `east` is. */
	readonly north: readonly Float32Array[];
};

/** The observed sea-level pressure, as the data file gives it. */
export type ObservedPressure = {
	/**
	 * Twelve grids, January to December, of hectopascals, each
	 * {@link OBSERVED_VALUES_PER_MONTH} long and laid out row by row from
	 * the north, column by column from 0° east. They must be treated as
	 * read-only.
	 */
	readonly months: readonly Float32Array[];
};

/** Twelve months of wind on a world's cells, in metres a second. */
export type MonthlyWind = {
	/**
	 * Twelve fields, January to December, of the eastward wind at each
	 * cell's centre, each indexed like the grid's cells.
	 */
	readonly east: readonly Float32Array[];
	/** Twelve fields of the northward wind, indexed as `east` is. */
	readonly north: readonly Float32Array[];
};

/**
 * Twelve fields of sea-level pressure on a world's cells, January to
 * December, in hectopascals, each indexed like the grid's cells.
 */
export type MonthlyPressure = readonly Float32Array[];

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * The stored value for a wind component: the nearest quarter step, a value
 * that lies halfway between two going to the higher.
 *
 * @param metresPerSecond - An eastward or northward wind; negative for a
 * westward or southward one.
 * @returns A whole number from -128 to 127.
 * @throws RangeError if the wind is NaN, or so far outside
 * {@link OBSERVED_WIND_MIN_M_PER_S} to {@link OBSERVED_WIND_MAX_M_PER_S}
 * that its nearest step lies outside them too, rather than bringing it
 * within them.
 */
export const quantiseWind = (metresPerSecond: number): number =>
	quantiseByte(WIND_CODEC, metresPerSecond);

/**
 * The wind a stored value stands for, in metres a second.
 *
 * @param stored - A whole number from -128 to 127.
 */
export const dequantiseWind = (stored: number): number =>
	dequantiseByte(WIND_CODEC, stored);

/**
 * The stored value for a pressure: the nearest half step, a value that lies
 * halfway between two going to the higher.
 *
 * @param hectopascals - A pressure in hectopascals.
 * @returns A whole number from 0 to 255.
 * @throws RangeError if the pressure is NaN, or so far outside
 * {@link OBSERVED_PRESSURE_BASE_HPA} to {@link OBSERVED_PRESSURE_MAX_HPA}
 * that its nearest step lies outside them too, rather than bringing it
 * within them.
 */
export const quantisePressure = (hectopascals: number): number =>
	quantiseByte(PRESSURE_CODEC, hectopascals);

/**
 * The pressure a stored value stands for, in hectopascals.
 *
 * @param stored - A whole number from 0 to 255.
 */
export const dequantisePressure = (stored: number): number =>
	dequantiseByte(PRESSURE_CODEC, stored);

/**
 * The bytes of the wind file for twelve months of wind.
 *
 * @param wind - Twelve grids, January to December, of each component in
 * metres a second, laid out as {@link ObservedWind} is. They are not
 * changed.
 * @returns {@link OBSERVED_WIND_BYTES} bytes, each a signed byte.
 * @throws RangeError if either component does not have twelve grids of
 * {@link OBSERVED_VALUES_PER_MONTH} values, or if any value is one
 * {@link quantiseWind} refuses.
 */
export const encodeObservedWind = (wind: {
	readonly east: readonly ArrayLike<number>[];
	readonly north: readonly ArrayLike<number>[];
}): Uint8Array<ArrayBuffer> => {
	assertGridsToEncode('eastward wind', wind.east);
	assertGridsToEncode('northward wind', wind.north);
	const bytes = new Uint8Array(OBSERVED_WIND_BYTES);
	// The same bytes read as signed: a negative value is stored as its
	// two's complement.
	const signed = new Int8Array(bytes.buffer);
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const start = 2 * month * OBSERVED_VALUES_PER_MONTH;
		encodeGrid(
			WIND_CODEC,
			wind.east[month] as ArrayLike<number>,
			signed,
			start,
		);
		encodeGrid(
			WIND_CODEC,
			wind.north[month] as ArrayLike<number>,
			signed,
			start + OBSERVED_VALUES_PER_MONTH,
		);
	}
	return bytes;
};

/**
 * Reads the bytes of the observed wind file.
 *
 * @remarks
 * The length is the only thing about the bytes that can be wrong: every
 * byte is a wind.
 *
 * @param bytes - The whole file. It is not changed and not kept.
 * @returns The winds, in arrays that owe nothing to `bytes`.
 * @throws RangeError if `bytes` is not exactly {@link OBSERVED_WIND_BYTES}
 * long.
 */
export const decodeObservedWind = (bytes: Uint8Array): ObservedWind => {
	if (bytes.length !== OBSERVED_WIND_BYTES) {
		throw new RangeError(
			`The observed wind file is ${OBSERVED_WIND_BYTES} bytes long; got ${bytes.length}`,
		);
	}
	// The same bytes read as signed, as they were stored.
	const signed = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
	const east: Float32Array[] = [];
	const north: Float32Array[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const start = 2 * month * OBSERVED_VALUES_PER_MONTH;
		east.push(decodeGrid(WIND_CODEC, signed, start));
		north.push(
			decodeGrid(WIND_CODEC, signed, start + OBSERVED_VALUES_PER_MONTH),
		);
	}
	return { east, north };
};

/**
 * The bytes of the pressure file for twelve months of pressure.
 *
 * @param months - Twelve grids, January to December, of hectopascals, laid
 * out as {@link ObservedPressure.months} is. They are not changed.
 * @returns {@link OBSERVED_PRESSURE_BYTES} bytes.
 * @throws RangeError if there are not twelve grids of
 * {@link OBSERVED_VALUES_PER_MONTH} values, or if any value is one
 * {@link quantisePressure} refuses.
 */
export const encodeObservedPressure = (
	months: readonly ArrayLike<number>[],
): Uint8Array<ArrayBuffer> => encodeBytes(PRESSURE_CODEC, months);

/**
 * Reads the bytes of the observed pressure file.
 *
 * @remarks
 * The length is the only thing about the bytes that can be wrong: every
 * byte is a pressure.
 *
 * @param bytes - The whole file. It is not changed and not kept.
 * @returns The pressures, in arrays that owe nothing to `bytes`.
 * @throws RangeError if `bytes` is not exactly
 * {@link OBSERVED_PRESSURE_BYTES} long.
 */
export const decodeObservedPressure = (
	bytes: Uint8Array,
): ObservedPressure => ({
	months: decodeBytes(PRESSURE_CODEC, bytes),
});

/**
 * The observed wind of every month on the cells of a world.
 *
 * @remarks
 * Winds are interpolated as vectors, not as two separate numbers. Each of
 * the four points of the data around a cell's centre, found as for the
 * temperature, has its eastward and northward wind made into a vector in
 * three dimensions along that point's own directions east and north; a
 * point of a pole row takes the directions that the meridian of its
 * longitude approaches there. The four vectors are interpolated with the
 * temperature's bilinear weights, and the result is split into the
 * eastward and northward wind along the cell centre's own directions. A
 * wind blowing across a pole therefore keeps its strength there, where
 * averaging the eastward winds of points on either side of the pole would
 * cancel them. Both sets of directions are those of
 * {@link writeEastNorthFrame}, the centres' from {@link cellFrames}.
 *
 * A cell centre at a pole, which no supported grid has, would take the
 * directions east and north of longitude 0°.
 *
 * @param data - The observed wind. It is not changed.
 * @param resolution - Cells along a face edge; one of
 * {@link SUPPORTED_RESOLUTIONS}.
 * @returns Twelve new arrays, January to December, of each component, each
 * one value per cell in cell order, in metres a second.
 * @throws RangeError if `resolution` is not a supported resolution, or the
 * data does not hold twelve months of the right length for each component.
 */
export const observedWind = (
	data: ObservedWind,
	resolution: number,
): MonthlyWind => {
	assertResolution(resolution);
	assertTwelveGrids('eastward wind', data.east);
	assertTwelveGrids('northward wind', data.north);
	const grid = getGrid(resolution);
	const { cellCount } = grid;
	const cells = locateCells(grid);

	const rowSin = new Float64Array(OBSERVED_ROWS);
	const rowCos = new Float64Array(OBSERVED_ROWS);
	for (let row = 0; row < OBSERVED_ROWS; row++) {
		rowSin[row] = Math.sin((90 - row) * RADIANS_PER_DEGREE);
		rowCos[row] = Math.cos((90 - row) * RADIANS_PER_DEGREE);
	}
	const columnSin = new Float64Array(OBSERVED_COLUMNS);
	const columnCos = new Float64Array(OBSERVED_COLUMNS);
	for (let column = 0; column < OBSERVED_COLUMNS; column++) {
		columnSin[column] = Math.sin(column * RADIANS_PER_DEGREE);
		columnCos[column] = Math.cos(column * RADIANS_PER_DEGREE);
	}

	const centres = cellFrames(grid);
	// The four points around a cell, north-west, north-east, south-west and
	// south-east: their indices in a month, their weights, and the
	// directions east and north at each.
	const corners = new Int32Array(4);
	const weights = new Float64Array(4);
	const frames = Array.from({ length: 4 }, createEastNorthFrame);
	const east = Array.from(
		{ length: MONTHS_PER_YEAR },
		() => new Float32Array(cellCount),
	);
	const north = Array.from(
		{ length: MONTHS_PER_YEAR },
		() => new Float32Array(cellCount),
	);
	for (let cell = 0; cell < cellCount; cell++) {
		const eastX = centres.east.x[cell] as number;
		const eastY = centres.east.y[cell] as number;
		const northX = centres.north.x[cell] as number;
		const northY = centres.north.y[cell] as number;
		const northZ = centres.north.z[cell] as number;
		const northWest = cells.northWest[cell] as number;
		const northEast = cells.northEast[cell] as number;
		const southward = cells.south[cell] as number;
		const eastward = cells.east[cell] as number;
		corners[0] = northWest;
		corners[1] = northEast;
		corners[2] = northWest + OBSERVED_COLUMNS;
		corners[3] = northEast + OBSERVED_COLUMNS;
		weights[0] = (1 - eastward) * (1 - southward);
		weights[1] = eastward * (1 - southward);
		weights[2] = (1 - eastward) * southward;
		weights[3] = eastward * southward;
		for (let corner = 0; corner < 4; corner++) {
			const index = corners[corner] as number;
			const row = Math.floor(index / OBSERVED_COLUMNS);
			const column = index - row * OBSERVED_COLUMNS;
			writeEastNorthFrame(
				rowSin[row] as number,
				rowCos[row] as number,
				columnSin[column] as number,
				columnCos[column] as number,
				frames[corner] as EastNorthFrame,
			);
		}

		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const eastGrid = data.east[month] as Float32Array;
			const northGrid = data.north[month] as Float32Array;
			let x = 0;
			let y = 0;
			let z = 0;
			for (let corner = 0; corner < 4; corner++) {
				const index = corners[corner] as number;
				const frame = frames[corner] as EastNorthFrame;
				const weight = weights[corner] as number;
				const u = weight * (eastGrid[index] as number);
				const v = weight * (northGrid[index] as number);
				x += u * frame.eastX + v * frame.northX;
				y += u * frame.eastY + v * frame.northY;
				z += v * frame.northZ;
			}
			(east[month] as Float32Array)[cell] = x * eastX + y * eastY;
			(north[month] as Float32Array)[cell] =
				x * northX + y * northY + z * northZ;
		}
	}
	return { east, north };
};

/**
 * The observed sea-level pressure of every month on the cells of a world.
 *
 * @remarks
 * Each cell takes the value at its centre, interpolated between the four
 * points of the data around it exactly as the observed temperature is:
 * bilinear in latitude and longitude, wrapping in longitude, with the pole
 * rows' values interpolated by longitude at the poles.
 *
 * @param data - The observed pressure. It is not changed.
 * @param resolution - Cells along a face edge; one of
 * {@link SUPPORTED_RESOLUTIONS}.
 * @returns Twelve new arrays, January to December, each one value per cell
 * in cell order, in hectopascals.
 * @throws RangeError if `resolution` is not a supported resolution, or the
 * data does not hold twelve months of the right length.
 */
export const observedPressure = (
	data: ObservedPressure,
	resolution: number,
): MonthlyPressure => {
	assertResolution(resolution);
	assertTwelveGrids('pressure', data.months);
	const cells = locateCells(getGrid(resolution));
	return data.months.map((values) => interpolateOnCells(values, cells));
};
