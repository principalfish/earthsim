/**
 * Years of fields shaped like the Earth's, for tests of how a scale is
 * fitted and written: on the 64 grid, a near-surface temperature from about
 * −50 °C over the winter pole to about 30 °C in the summer tropics, and a
 * sea-level pressure from about 1000 to 1025 hPa, with highs in the
 * subtropics and lows near the poles. Their values are made up, not
 * solved, and carry fractions, so that no scale fitted to them is round
 * by chance.
 */

import {
	cellCentre,
	directionToLatLon,
	getGrid,
	type MonthlyTemperature,
} from '../../core/index';

/** The grid the fields are on. */
export const EARTH_LIKE_RESOLUTION = 64;

/** Degrees to radians. */
const RADIANS = Math.PI / 180;

/** The latitude and longitude, in degrees, of each cell of the grid. */
const places = (): { readonly lat: number; readonly lon: number }[] => {
	const grid = getGrid(EARTH_LIKE_RESOLUTION);
	return Array.from({ length: grid.cellCount }, (_, cell) => {
		const { latitudeDeg, longitudeDeg } = directionToLatLon(
			cellCentre(grid, cell),
		);
		return { lat: latitudeDeg, lon: longitudeDeg };
	});
};

/** The latitude, in degrees, the sun is overhead at in a month. */
const subsolarLatitude = (month: number): number =>
	23.44 * Math.sin((2 * Math.PI * (month - 2.7)) / 12);

/**
 * Twelve months of a near-surface temperature shaped like the Earth's, in
 * degrees Celsius, January first: warmest a little on the summer side of
 * the equator, coldest at the winter pole, with a wave along each circle
 * of latitude as land and sea would make.
 */
export const earthLikeTemperature = (): MonthlyTemperature => {
	const cells = places();
	return Array.from({ length: 12 }, (_, month) => {
		const warmest = 0.6 * subsolarLatitude(month);
		return Float32Array.from(
			cells,
			({ lat, lon }) =>
				27.3 -
				0.0072 * (lat - warmest) ** 2 +
				4.7 * Math.sin(2 * lon * RADIANS) * Math.cos(lat * RADIANS),
		);
	});
};

/**
 * Twelve months of a sea-level pressure shaped like the Earth's, in
 * hectopascals, January first: highs in the subtropics, lows near the
 * poles, a wave along each circle of latitude and a swing with the
 * seasons.
 */
export const earthLikePressure = (): MonthlyTemperature => {
	const cells = places();
	return Array.from({ length: 12 }, (_, month) =>
		Float32Array.from(
			cells,
			({ lat, lon }) =>
				1010.6 +
				12.3 * Math.exp(-(((Math.abs(lat) - 32) / 12) ** 2)) -
				9.1 * Math.exp(-(((Math.abs(lat) - 62) / 10) ** 2)) +
				3.2 * Math.sin(lon * RADIANS) * Math.cos(lat * RADIANS) +
				2.1 * Math.sin((2 * Math.PI * month) / 12) * Math.sin(lat * RADIANS),
		),
	);
};
