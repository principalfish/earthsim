/**
 * The shape every wind model shares, and the figures that compare a
 * model's winds with the observed ones.
 *
 * A model takes a world and its twelve monthly temperatures and gives
 * twelve months of surface wind and sea-level pressure on the world's
 * cells, in the same form as the observed Earth's on a world's cells, so
 * that the two compare with no conversion.
 *
 * Cells differ in area, so every figure weights a cell by its exact area.
 */

import type { Grid } from '../grid';
import { cellLatitudes, MONTHS_PER_YEAR } from '../insolation';
import type { MonthlyPressure, MonthlyWind } from '../observedWind';
import type { World } from '../world';

/**
 * Twelve months of surface wind and sea-level pressure on a world's cells,
 * January to December: the eastward and northward wind at each cell's
 * centre in metres a second, as {@link MonthlyWind} holds them, and the
 * sea-level pressure in hectopascals.
 */
export type WindResult = MonthlyWind & {
	/** Twelve fields of sea-level pressure, indexed like the grid's cells. */
	readonly pressure: MonthlyPressure;
};

/**
 * A wind model: the winds and pressure of a world through its year.
 *
 * @remarks
 * The world holds its planet settings, the day length among them, so a
 * model needs nothing else to know how fast the planet turns.
 *
 * @param world - The world. It must not be changed.
 * @param temperatures - Twelve fields, January to December, of the mean
 * near-surface air temperature in degrees Celsius, one value per cell of
 * the world's grid, as {@link solveTemperature} gives them in its result's
 * `months`. They must not be changed.
 * @returns New arrays, one value per cell of the world's grid in each.
 */
export type WindModel = (
	world: World,
	temperatures: readonly Float32Array[],
) => WindResult;

/** One month's wind and pressure on a world's cells. */
export type WindMonth = {
	/** The eastward wind at each cell's centre, in metres a second. */
	readonly east: ArrayLike<number>;
	/** The northward wind at each cell's centre, in metres a second. */
	readonly north: ArrayLike<number>;
	/** The sea-level pressure at each cell, in hectopascals. */
	readonly pressure: ArrayLike<number>;
};

/**
 * Below this observed speed, in metres a second, a cell's direction is not
 * compared: a wind that light has no direction worth judging, and a small
 * error in it can turn it round.
 */
export const DIRECTION_MIN_SPEED_M_PER_S = 1;

/**
 * The largest angle, in degrees, between a simulated wind and the observed
 * one for the simulated direction to count as right.
 */
export const DIRECTION_TOLERANCE_DEG = 45;

/** How far simulated winds and pressure are from the observed ones. */
export type WindErrorFigures = {
	/**
	 * The root-mean-square length of the simulated wind less the observed,
	 * as vectors, in metres a second.
	 */
	readonly rmsVectorDifference: number;
	/** The mean of the simulated speed less the observed, in m/s. */
	readonly meanSpeedDifference: number;
	/**
	 * Of the surface whose observed wind is at least
	 * {@link DIRECTION_MIN_SPEED_M_PER_S}, the share, 0 to 1, where the
	 * simulated wind points within {@link DIRECTION_TOLERANCE_DEG} of the
	 * observed. A calm simulated wind there counts as pointing wrongly. Null
	 * when no cell's observed wind is that strong.
	 */
	readonly directionShare: number | null;
	/**
	 * The share of the surface, 0 to 1, whose observed wind is at least
	 * {@link DIRECTION_MIN_SPEED_M_PER_S}: the part `directionShare` is a
	 * share of.
	 */
	readonly directionCountedShare: number;
	/** The mean of the simulated pressure less the observed, in hPa. */
	readonly pressureMeanDifference: number;
	/** The root-mean-square of the simulated pressure less the observed. */
	readonly pressureRmsDifference: number;
};

/** The error figures of a year of winds, month by month and pooled. */
export type WindComparison = {
	/** One per month, January to December. */
	readonly months: readonly WindErrorFigures[];
	/**
	 * Every cell of every month taken together, each month alike: the
	 * means and shares are the means of the months' (the direction share
	 * weighting each month by its counted area), and each root-mean-square
	 * is the root of the months' mean square.
	 */
	readonly year: WindErrorFigures;
};

/** Area-weighted sums, from which the figures follow. */
type Sums = {
	area: number;
	vectorSquares: number;
	speedDifference: number;
	countedArea: number;
	pointingArea: number;
	pressureDifference: number;
	pressureSquares: number;
};

const emptySums = (): Sums => ({
	area: 0,
	vectorSquares: 0,
	speedDifference: 0,
	countedArea: 0,
	pointingArea: 0,
	pressureDifference: 0,
	pressureSquares: 0,
});

const COS_TOLERANCE = Math.cos((DIRECTION_TOLERANCE_DEG * Math.PI) / 180);

const assertMonth = (name: string, month: WindMonth, cellCount: number) => {
	for (const part of ['east', 'north', 'pressure'] as const) {
		if (month[part].length !== cellCount) {
			throw new RangeError(
				`The ${name} ${part} field must hold ${cellCount} values, one per cell; got ${month[part].length}`,
			);
		}
	}
};

/** Adds one month's cells to the sums. */
const addMonth = (
	sums: Sums,
	simulated: WindMonth,
	observed: WindMonth,
	areas: ArrayLike<number>,
): void => {
	for (let cell = 0; cell < areas.length; cell++) {
		const area = areas[cell] as number;
		const simEast = simulated.east[cell] as number;
		const simNorth = simulated.north[cell] as number;
		const obsEast = observed.east[cell] as number;
		const obsNorth = observed.north[cell] as number;
		const simSpeed = Math.hypot(simEast, simNorth);
		const obsSpeed = Math.hypot(obsEast, obsNorth);
		const east = simEast - obsEast;
		const north = simNorth - obsNorth;
		const pressure =
			(simulated.pressure[cell] as number) -
			(observed.pressure[cell] as number);
		sums.area += area;
		sums.vectorSquares += area * (east * east + north * north);
		sums.speedDifference += area * (simSpeed - obsSpeed);
		sums.pressureDifference += area * pressure;
		sums.pressureSquares += area * pressure * pressure;
		if (obsSpeed >= DIRECTION_MIN_SPEED_M_PER_S) {
			sums.countedArea += area;
			if (
				simSpeed > 0 &&
				simEast * obsEast + simNorth * obsNorth >=
					COS_TOLERANCE * simSpeed * obsSpeed
			) {
				sums.pointingArea += area;
			}
		}
	}
};

const figuresOf = (sums: Sums): WindErrorFigures => ({
	rmsVectorDifference: Math.sqrt(sums.vectorSquares / sums.area),
	meanSpeedDifference: sums.speedDifference / sums.area,
	directionShare:
		sums.countedArea > 0 ? sums.pointingArea / sums.countedArea : null,
	directionCountedShare: sums.countedArea / sums.area,
	pressureMeanDifference: sums.pressureDifference / sums.area,
	pressureRmsDifference: Math.sqrt(sums.pressureSquares / sums.area),
});

/**
 * Area-weighted error figures of one month's simulated wind and pressure
 * against the observed.
 *
 * @param simulated - The simulated month, one value per cell of `grid` in
 * each field. Not changed.
 * @param observed - The observed month, in the same units and cell order.
 * Not changed.
 * @param grid - The grid both are on.
 * @returns New figures, worked out in double precision.
 * @throws RangeError if any field does not hold one value per cell.
 */
export const windMonthErrorFigures = (
	simulated: WindMonth,
	observed: WindMonth,
	grid: Grid,
): WindErrorFigures => {
	assertMonth('simulated', simulated, grid.cellCount);
	assertMonth('observed', observed, grid.cellCount);
	const sums = emptySums();
	addMonth(sums, simulated, observed, grid.areas);
	return figuresOf(sums);
};

/**
 * One month of a year of winds and pressure.
 *
 * @param result - The year. Not changed.
 * @param month - The month: 0 for January to 11 for December.
 * @returns The month's three fields, the year's own arrays rather than
 * copies.
 */
export const windMonth = (result: WindResult, month: number): WindMonth => ({
	east: result.east[month] as Float32Array,
	north: result.north[month] as Float32Array,
	pressure: result.pressure[month] as Float32Array,
});

const assertYear = (name: string, result: WindResult): void => {
	for (const part of ['east', 'north', 'pressure'] as const) {
		if (result[part].length !== MONTHS_PER_YEAR) {
			throw new RangeError(
				`The ${name} ${part} must hold ${MONTHS_PER_YEAR} months; got ${result[part].length}`,
			);
		}
	}
};

/**
 * Area-weighted error figures of a year of simulated wind and pressure
 * against the observed, month by month and for the twelve months pooled.
 *
 * @param simulated - The simulated year, as a {@link WindModel} gives it.
 * Not changed.
 * @param observed - The observed year on the same cells, in the same
 * form. Not changed.
 * @param grid - The grid both are on.
 * @returns New figures, worked out in double precision; each month's are
 * those {@link windMonthErrorFigures} gives for it.
 * @throws RangeError if either does not hold twelve months, or any field
 * does not hold one value per cell.
 */
export const windErrorFigures = (
	simulated: WindResult,
	observed: WindResult,
	grid: Grid,
): WindComparison => {
	assertYear('simulated', simulated);
	assertYear('observed', observed);
	const year = emptySums();
	const months: WindErrorFigures[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const sim = windMonth(simulated, month);
		const obs = windMonth(observed, month);
		assertMonth('simulated', sim, grid.cellCount);
		assertMonth('observed', obs, grid.cellCount);
		const sums = emptySums();
		addMonth(sums, sim, obs, grid.areas);
		months.push(figuresOf(sums));
		addMonth(year, sim, obs, grid.areas);
	}
	return { months, year: figuresOf(year) };
};

/** The number of bands of latitude {@link zonalMean} takes by default. */
export const ZONAL_BANDS = 36;

/** A field's mean in bands of latitude, from the south. */
export type ZonalMean = {
	/** The latitude of each band's middle, in degrees, from the south. */
	readonly latitudes: readonly number[];
	/**
	 * The area-weighted mean of the field over the cells whose centres lie
	 * in each band, in the field's units; null for a band that holds no
	 * cell's centre.
	 */
	readonly means: readonly (number | null)[];
};

/**
 * The area-weighted mean of a field in bands of latitude of equal width.
 *
 * @remarks
 * A cell belongs to the band its centre lies in, by its latitude from
 * {@link cellLatitudes}. A centre on the line
 * between two bands belongs to the northern one, and a centre at 90° north
 * to the northernmost band.
 *
 * @param grid - The grid the field is on.
 * @param field - One value per cell of `grid`. Not changed.
 * @param bands - How many bands to split -90° to 90° into: a whole number
 * from 1. Defaults to {@link ZONAL_BANDS}, of 5° each.
 * @returns New arrays, one entry per band, from the south.
 * @throws RangeError if the field does not hold one value per cell or the
 * number of bands is not a whole number from 1.
 */
export const zonalMean = (
	grid: Grid,
	field: ArrayLike<number>,
	bands: number = ZONAL_BANDS,
): ZonalMean => {
	const { cellCount, areas } = grid;
	if (field.length !== cellCount) {
		throw new RangeError(
			`A zonal mean needs a field of ${cellCount} values; got ${field.length}`,
		);
	}
	if (!Number.isInteger(bands) || bands < 1) {
		throw new RangeError(
			`The number of bands must be a whole number from 1; got ${bands}`,
		);
	}
	const width = 180 / bands;
	const sums = new Float64Array(bands);
	const bandAreas = new Float64Array(bands);
	const cellLatitude = cellLatitudes(grid);
	for (let cell = 0; cell < cellCount; cell++) {
		const latitude = cellLatitude[cell] as number;
		const band = Math.min(bands - 1, Math.floor((latitude + 90) / width));
		const area = areas[cell] as number;
		sums[band] = (sums[band] as number) + area * (field[cell] as number);
		bandAreas[band] = (bandAreas[band] as number) + area;
	}
	const latitudes: number[] = [];
	const means: (number | null)[] = [];
	for (let band = 0; band < bands; band++) {
		latitudes.push(-90 + (band + 0.5) * width);
		const area = bandAreas[band] as number;
		means.push(area > 0 ? (sums[band] as number) / area : null);
	}
	return { latitudes, means };
};
