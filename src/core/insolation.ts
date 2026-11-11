/**
 * Sunlight at the top of the atmosphere, by latitude and time of year.
 *
 * The orbit is a circle, so the distance to the star never changes and the
 * seasons come from the axial tilt alone. Every value here is a daily mean:
 * sunlight averaged over a whole turn of the planet, in watts per square
 * metre of level ground, before the atmosphere takes any of it.
 *
 * The time of year is a fraction of the year from 0 to 1, with 0 at the
 * start of January. Every year, whatever its length, is laid out as twelve
 * equal months, January to December, with northern midsummer in late June
 * as on Earth.
 */

import type { Grid } from './grid';
import { type PlanetSettings, sunlightRelativeToEarth } from './planet';

/**
 * Sunlight arriving at Earth's mean distance from the Sun, on a surface
 * facing it, in watts per square metre: the solar constant.
 */
export const SOLAR_CONSTANT_W_M2 = 1361;

/** The number of months in every year. */
export const MONTHS_PER_YEAR = 12;

/**
 * The fraction of the year at which the star stands overhead farthest
 * north: the northern summer solstice, about 21 June.
 *
 * @remarks
 * On a circular orbit the equinoxes fall a quarter of a year either side of
 * it, about 22 March and 21 September.
 */
export const NORTHERN_SOLSTICE_FRACTION = 0.47;

/**
 * Twelve fields of sunlight, January to December: the mean daily sunlight
 * over each month, in watts per square metre, one value per latitude asked
 * for.
 */
export type MonthlyInsolation = readonly Float32Array[];

const RADIANS_PER_DEGREE = Math.PI / 180;
const DEGREES_PER_RADIAN = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;

/**
 * Spacing of the latitude table monthly sunlight is interpolated from, in
 * degrees: a whole number of steps from the equator to the pole.
 */
const TABLE_STEP_DEG = 0.1;

/** Rows of the table, from the equator to the pole inclusive. */
const TABLE_ROWS = Math.round(90 / TABLE_STEP_DEG) + 1;

/** Rows of the table extended from pole to pole. */
const GLOBAL_ROWS = 2 * TABLE_ROWS - 1;

/**
 * Times within each month at which daily sunlight is sampled for the
 * month's mean, evenly spaced at the middles of equal parts.
 */
const SAMPLES_PER_MONTH = 48;

const CELL_LATITUDES = new WeakMap<Grid, Float64Array>();

const assertLatitude = (latitudeDeg: number): void => {
	if (!(latitudeDeg >= -90 && latitudeDeg <= 90)) {
		throw new RangeError(
			`A latitude must be from -90 to 90 degrees; got ${latitudeDeg}`,
		);
	}
};

const assertYearFraction = (yearFraction: number): void => {
	if (!Number.isFinite(yearFraction)) {
		throw new RangeError(
			`A time of year must be a finite fraction of the year; got ${yearFraction}`,
		);
	}
};

/** The sine of the star's declination at a time of year. */
const sinDeclination = (yearFraction: number, planet: PlanetSettings): number =>
	Math.sin(planet.axialTiltDeg * RADIANS_PER_DEGREE) *
	Math.cos(TWO_PI * (yearFraction - NORTHERN_SOLSTICE_FRACTION));

/**
 * Daily-mean sunlight as a share of the sunlight arriving face-on, from the
 * sines and cosines of the latitude and the declination.
 *
 * @remarks
 * The day lasts from hour angle `-h0` to `h0`, where
 * `cos h0 = -tan φ tan δ`. Written as `-a / b`, with `a = sin φ sin δ` and
 * `b = cos φ cos δ`, the comparison of `a` with `b` decides polar day and
 * night without the tangents, which blow up at the poles. Then
 * `b sin h0 = √(b² − a²)`. The result is clamped at zero against rounding.
 */
const dailyShare = (
	sinLat: number,
	cosLat: number,
	sinDec: number,
	cosDec: number,
): number => {
	const a = sinLat * sinDec;
	const b = cosLat * cosDec;
	if (a >= b) {
		// The star never sets: h0 = π.
		return Math.max(a, 0);
	}
	if (-a >= b) {
		// The star never rises.
		return 0;
	}
	const h0 = Math.acos(-a / b);
	const share = (a * h0 + Math.sqrt(b * b - a * a)) / Math.PI;
	return Math.max(share, 0);
};

/**
 * The latitude at which the star stands overhead at a time of year: its
 * declination, in degrees.
 *
 * @remarks
 * The sine of the declination is the sine of the tilt times the cosine of
 * the angle round the orbit from the northern solstice. It is the tilt at
 * the northern solstice, minus the tilt half a year later, and zero at the
 * equinoxes between.
 *
 * @param yearFraction - Time of year as a fraction of the year, 0 at the
 * start of January; any finite value, taken round the year.
 * @param planet - The planet's settings.
 * @returns Degrees north, from minus to plus the axial tilt.
 * @throws RangeError if `yearFraction` is not finite.
 */
export const subsolarLatitude = (
	yearFraction: number,
	planet: PlanetSettings,
): number => {
	assertYearFraction(yearFraction);
	// Adding zero turns a negative zero, at tilt 0, into zero.
	return (
		Math.asin(sinDeclination(yearFraction, planet)) * DEGREES_PER_RADIAN + 0
	);
};

/**
 * Daily-mean sunlight at the top of the atmosphere at a latitude and a
 * time of year, in watts per square metre of level ground.
 *
 * @remarks
 * Exact for a circular orbit and any tilt from 0 to 90 degrees, including
 * polar day, when it is the face-on sunlight times `sin φ sin δ`, and polar
 * night, when it is zero. It is never negative.
 *
 * @param latitudeDeg - Latitude in degrees, -90 to 90.
 * @param yearFraction - Time of year as a fraction of the year, 0 at the
 * start of January; any finite value, taken round the year.
 * @param planet - The planet's settings.
 * @throws RangeError if the latitude is outside -90 to 90 or NaN, or if
 * `yearFraction` is not finite.
 */
export const dailyInsolation = (
	latitudeDeg: number,
	yearFraction: number,
	planet: PlanetSettings,
): number => {
	assertLatitude(latitudeDeg);
	assertYearFraction(yearFraction);
	const latitude = latitudeDeg * RADIANS_PER_DEGREE;
	const sinDec = sinDeclination(yearFraction, planet);
	return (
		SOLAR_CONSTANT_W_M2 *
		sunlightRelativeToEarth(planet) *
		dailyShare(
			Math.sin(latitude),
			Math.cos(latitude),
			sinDec,
			Math.sqrt(1 - sinDec * sinDec),
		)
	);
};

/**
 * The monthly-mean share of face-on sunlight on a table of latitudes
 * `TABLE_STEP_DEG` apart from the south pole to the north: month `m` of
 * row `r` at `r * MONTHS_PER_YEAR + m`, with row 0 at the south pole, so
 * the twelve months of neighbouring rows sit together.
 *
 * @remarks
 * Only the northern half is integrated. A southern latitude has the
 * sunlight of the same northern latitude six months on, exactly, since the
 * declination half a year later is the same with its sign reversed.
 */
const buildMonthlyTable = (planet: PlanetSettings): Float64Array => {
	const sinLat = new Float64Array(TABLE_ROWS);
	const cosLat = new Float64Array(TABLE_ROWS);
	for (let row = 0; row < TABLE_ROWS; row++) {
		const latitude = row * TABLE_STEP_DEG * RADIANS_PER_DEGREE;
		sinLat[row] = Math.sin(latitude);
		cosLat[row] = Math.cos(latitude);
	}
	// The pole exactly, rather than the cosine of a rounded π/2.
	sinLat[TABLE_ROWS - 1] = 1;
	cosLat[TABLE_ROWS - 1] = 0;

	const north = new Float64Array(MONTHS_PER_YEAR * TABLE_ROWS);
	const samples = MONTHS_PER_YEAR * SAMPLES_PER_MONTH;
	for (let sample = 0; sample < samples; sample++) {
		const offset = Math.floor(sample / SAMPLES_PER_MONTH) * TABLE_ROWS;
		const sinDec = sinDeclination((sample + 0.5) / samples, planet);
		const cosDec = Math.sqrt(1 - sinDec * sinDec);
		for (let row = 0; row < TABLE_ROWS; row++) {
			north[offset + row] =
				(north[offset + row] as number) +
				dailyShare(
					sinLat[row] as number,
					cosLat[row] as number,
					sinDec,
					cosDec,
				);
		}
	}

	const equator = TABLE_ROWS - 1;
	const table = new Float64Array(GLOBAL_ROWS * MONTHS_PER_YEAR);
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const northern = month * TABLE_ROWS;
		const southern =
			((month + MONTHS_PER_YEAR / 2) % MONTHS_PER_YEAR) * TABLE_ROWS;
		for (let row = 0; row < TABLE_ROWS; row++) {
			table[(equator - row) * MONTHS_PER_YEAR + month] =
				(north[southern + row] as number) / SAMPLES_PER_MONTH;
			table[(equator + row) * MONTHS_PER_YEAR + month] =
				(north[northern + row] as number) / SAMPLES_PER_MONTH;
		}
	}
	return table;
};

/**
 * The mean daily sunlight over each of the twelve months at each of a list
 * of latitudes, in watts per square metre at the top of the atmosphere.
 *
 * @remarks
 * Each month's mean is integrated once, on a table of latitudes a tenth of
 * a degree apart, and each latitude asked for is interpolated linearly
 * from it. The cost is the table plus a few operations per latitude per
 * month, rather than an integration per latitude.
 *
 * @param latitudes - Latitudes in degrees, each from -90 to 90, such as
 * {@link cellLatitudes}. They are not changed.
 * @param planet - The planet's settings.
 * @returns Twelve new arrays, January to December, each as long as
 * `latitudes` and in the same order.
 * @throws RangeError if any latitude is outside -90 to 90 or NaN.
 */
export const monthlyInsolation = (
	latitudes: ArrayLike<number>,
	planet: PlanetSettings,
): MonthlyInsolation => {
	const count = latitudes.length;
	const table = buildMonthlyTable(planet);
	const scale = SOLAR_CONSTANT_W_M2 * sunlightRelativeToEarth(planet);
	const months: Float32Array[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		months.push(new Float32Array(count));
	}
	const lastInterval = GLOBAL_ROWS - 2;
	for (let index = 0; index < count; index++) {
		const latitude = latitudes[index] as number;
		assertLatitude(latitude);
		const position = (latitude + 90) / TABLE_STEP_DEG;
		const row = Math.min(Math.floor(position), lastInterval);
		const weight = position - row;
		const low = row * MONTHS_PER_YEAR;
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const a = table[low + month] as number;
			const b = table[low + MONTHS_PER_YEAR + month] as number;
			(months[month] as Float32Array)[index] = scale * (a + weight * (b - a));
		}
	}
	return months;
};

/**
 * The latitude of every cell's centre, in degrees: the latitude
 * `directionToLatLon` gives for the centre.
 *
 * @remarks
 * Built on first use for each grid and then shared, so the array must be
 * treated as read-only.
 *
 * @param grid - The grid whose cells to place.
 * @returns One latitude per cell, from -90 to 90, in cell order.
 */
export const cellLatitudes = (grid: Grid): Float64Array => {
	let latitudes = CELL_LATITUDES.get(grid);
	if (latitudes === undefined) {
		const { centres, cellCount } = grid;
		latitudes = new Float64Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			const offset = 3 * cell;
			latitudes[cell] =
				Math.atan2(
					centres[offset + 2] as number,
					Math.hypot(centres[offset] as number, centres[offset + 1] as number),
				) * DEGREES_PER_RADIAN;
		}
		CELL_LATITUDES.set(grid, latitudes);
	}
	return latitudes;
};
