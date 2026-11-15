/**
 * Wind speeds and directions in words: the units a speed can be written
 * in, the eight points of the compass, and a wind as the page writes it,
 * such as `7 m/s NE`.
 *
 * The winds themselves are always in metres a second; the unit changes
 * only how a speed is written.
 */

import { CALM_SPEED } from './globe/wind';

/** The units a wind speed can be written in, in the order they are offered. */
export const WIND_UNITS = ['m/s', 'km/h', 'mph'] as const;

/** A unit a wind speed can be written in. */
export type WindUnit = (typeof WIND_UNITS)[number];

/** The unit wind speeds are written in until another is chosen. */
export const DEFAULT_WIND_UNIT: WindUnit = 'm/s';

/** How many of each unit make one metre a second. */
const PER_METRE_A_SECOND: Readonly<Record<WindUnit, number>> = {
	'm/s': 1,
	'km/h': 3.6,
	mph: 2.2369362920544,
};

/** What a calm wind is called, whatever the unit. */
export const WIND_CALM_TEXT = 'calm';

/** The eight points of the compass, clockwise from north, abbreviated. */
export const COMPASS_POINTS = [
	'N',
	'NE',
	'E',
	'SE',
	'S',
	'SW',
	'W',
	'NW',
] as const;

/** One of the eight points of the compass. */
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * Whether a value is one of {@link WIND_UNITS}.
 *
 * @param value - Anything, such as an entry read from the browser's storage.
 */
export const isWindUnit = (value: unknown): value is WindUnit =>
	(WIND_UNITS as readonly unknown[]).includes(value);

/**
 * A speed in metres a second as a speed in a unit, unrounded.
 *
 * @param speedMs - The speed, in metres a second.
 * @param unit - The unit to give it in.
 */
export const convertSpeed = (speedMs: number, unit: WindUnit): number =>
	speedMs * PER_METRE_A_SECOND[unit];

/**
 * A speed as a whole number of a unit, without the unit, such as `7`, `36`
 * or `1,234`; a half rounds upwards.
 *
 * @param speedMs - The speed, in metres a second.
 * @param unit - The unit to count it in.
 */
export const wholeSpeed = (speedMs: number, unit: WindUnit): string =>
	Math.round(convertSpeed(speedMs, unit)).toLocaleString('en-GB');

/**
 * A speed as a whole number in a unit, with the unit, such as `7 m/s`,
 * `36 km/h` or `22 mph`; a half rounds upwards.
 *
 * @param speedMs - The speed, in metres a second.
 * @param unit - The unit to write it in.
 */
export const formatWindSpeed = (speedMs: number, unit: WindUnit): string =>
	`${wholeSpeed(speedMs, unit)} ${unit}`;

/**
 * The point of the compass a bearing falls in.
 *
 * @remarks
 * Each point is 45° wide and centred on its direction: north runs from
 * 337.5° up to but not including 22.5°, north-east from 22.5° up to but
 * not including 67.5°, and so on round the circle. A bearing below 0° or
 * from 360° up is first taken round the circle into that range.
 *
 * @param deg - A finite bearing in degrees, clockwise from north.
 */
export const compassPoint = (deg: number): CompassPoint => {
	const bearing = ((deg % 360) + 360) % 360;
	const index = Math.floor((bearing + 22.5) / 45) % COMPASS_POINTS.length;
	return COMPASS_POINTS[index] as CompassPoint;
};

/**
 * The bearing a wind blows from, in degrees clockwise from north, from 0
 * up to but not including 360: a wind blowing towards the east comes from
 * the west, 270°.
 *
 * @param east - The wind's eastward part.
 * @param north - The wind's northward part, in the same unit.
 */
export const windFromDeg = (east: number, north: number): number => {
	const towards = (Math.atan2(east, north) * 180) / Math.PI;
	return (towards + 540) % 360;
};

/**
 * A wind as the page writes it, its speed then the point of the compass it
 * blows from, such as `7 m/s NE` for a wind from the north-east, or
 * {@link WIND_CALM_TEXT} below {@link CALM_SPEED} metres a second, whatever
 * the unit.
 *
 * @param speedMs - The wind's speed, in metres a second.
 * @param fromDeg - The bearing it blows from, in degrees clockwise from
 * north.
 * @param unit - The unit to write the speed in, as a whole number.
 */
export const formatWind = (
	speedMs: number,
	fromDeg: number,
	unit: WindUnit,
): string =>
	speedMs < CALM_SPEED
		? WIND_CALM_TEXT
		: `${formatWindSpeed(speedMs, unit)} ${compassPoint(fromDeg)}`;
