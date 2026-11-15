/**
 * Numbers that show each of the wind model's known faults on the Earth,
 * taken from a year of winds and pressure: the observed Earth's, the model
 * run on the simulated temperature, or the model run on the observed
 * temperature. Set side by side, they show which faults go when the model
 * is given the observed temperature (the temperature's faults) and which
 * stay (the wind model's own).
 */

import {
	directionToLatLon,
	type Grid,
	type WindResult,
} from '../../src/core/index';

/** A box of latitude and longitude, in degrees north and east. */
export type Box = {
	readonly south: number;
	readonly north: number;
	/** The western edge, from −180 to 180. */
	readonly west: number;
	/** The eastern edge, east of the western, from −180 to 180. */
	readonly east: number;
};

/**
 * Asia, for where its July heat low lies: on the observed Earth over
 * Pakistan and Iran, near 28°N 65°E; the model puts it over Siberia.
 */
export const ASIA_BOX: Box = { south: 10, north: 70, west: 40, east: 140 };

/**
 * The northern subtropics over North Africa and Asia, where the observed
 * July has heat lows and the model an unbroken subtropical high.
 */
export const SUBTROPICS_BOX: Box = {
	south: 20,
	north: 35,
	west: -15,
	east: 120,
};

/** The South Asian monsoon. */
export const MONSOON_BOX: Box = { south: 5, north: 20, west: 60, east: 95 };

/**
 * Mongolia and Siberia, for the Asian winter high: on the observed Earth
 * centred near 50°N 100°E.
 */
export const WINTER_HIGH_BOX: Box = {
	south: 35,
	north: 70,
	west: 60,
	east: 140,
};

/** January and July, by index from 0. */
const JANUARY = 0;
const JULY = 6;

/** The cells of a grid whose centres lie in a box, edges included. */
export const cellsInBox = (grid: Grid, box: Box): number[] => {
	const found: number[] = [];
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const { latitudeDeg, longitudeDeg } = directionToLatLon([
			grid.centres[3 * cell] as number,
			grid.centres[3 * cell + 1] as number,
			grid.centres[3 * cell + 2] as number,
		]);
		if (
			latitudeDeg >= box.south &&
			latitudeDeg <= box.north &&
			longitudeDeg >= box.west &&
			longitudeDeg <= box.east
		) {
			found.push(cell);
		}
	}
	return found;
};

/** The lowest or highest value of a field in some cells, and where. */
export type Extreme = {
	/** Degrees north. */
	readonly latitude: number;
	/** Degrees east. */
	readonly longitude: number;
	readonly value: number;
};

/**
 * The lowest or highest value of a field among some cells.
 *
 * @param grid - The grid the field is on.
 * @param field - One value per cell. Not changed.
 * @param cells - The cells to look in: at least one. Not changed.
 * @param highest - True for the highest, false for the lowest.
 * @throws RangeError if there are no cells.
 */
export const extremeIn = (
	grid: Grid,
	field: ArrayLike<number>,
	cells: readonly number[],
	highest: boolean,
): Extreme => {
	let best = cells[0];
	if (best === undefined) {
		throw new RangeError('An extreme needs at least one cell');
	}
	for (const cell of cells) {
		const value = field[cell] as number;
		const bestValue = field[best] as number;
		if (highest ? value > bestValue : value < bestValue) {
			best = cell;
		}
	}
	const { latitudeDeg, longitudeDeg } = directionToLatLon([
		grid.centres[3 * best] as number,
		grid.centres[3 * best + 1] as number,
		grid.centres[3 * best + 2] as number,
	]);
	return {
		latitude: latitudeDeg,
		longitude: longitudeDeg,
		value: field[best] as number,
	};
};

/**
 * The area-weighted mean of a field over some cells.
 *
 * @throws RangeError if there are no cells.
 */
export const meanIn = (
	grid: Grid,
	field: ArrayLike<number>,
	cells: readonly number[],
): number => {
	if (cells.length === 0) {
		throw new RangeError('A mean needs at least one cell');
	}
	let total = 0;
	let area = 0;
	for (const cell of cells) {
		const weight = grid.areas[cell] as number;
		total += weight * (field[cell] as number);
		area += weight;
	}
	return total / area;
};

/** A mean wind, in metres a second. */
export type MeanWind = { readonly east: number; readonly north: number };

/** The numbers that show the known faults, for one year of winds. */
export type FaultMeasures = {
	/** The lowest July pressure over {@link ASIA_BOX}, in hPa. */
	readonly julyAsiaLow: Extreme;
	/** The mean July pressure over {@link SUBTROPICS_BOX}, in hPa. */
	readonly julySubtropicsHpa: number;
	/** The mean January wind over {@link MONSOON_BOX}. */
	readonly januaryMonsoon: MeanWind;
	/** The mean July wind over {@link MONSOON_BOX}. */
	readonly julyMonsoon: MeanWind;
	/** The highest January pressure over {@link WINTER_HIGH_BOX}, in hPa. */
	readonly januaryAsiaHigh: Extreme;
};

/**
 * The fault measures of a year of winds and pressure.
 *
 * @param grid - The grid the year is on.
 * @param year - Twelve months, as a wind model gives them, or the observed
 * Earth's. Not changed.
 * @throws RangeError if January or July is missing.
 */
export const faultMeasures = (grid: Grid, year: WindResult): FaultMeasures => {
	const month = (part: readonly Float32Array[], index: number) => {
		const field = part[index];
		if (field === undefined) {
			throw new RangeError(`The year has no month ${index}`);
		}
		return field;
	};
	const asia = cellsInBox(grid, ASIA_BOX);
	const monsoon = cellsInBox(grid, MONSOON_BOX);
	const windIn = (index: number): MeanWind => ({
		east: meanIn(grid, month(year.east, index), monsoon),
		north: meanIn(grid, month(year.north, index), monsoon),
	});
	return {
		julyAsiaLow: extremeIn(grid, month(year.pressure, JULY), asia, false),
		julySubtropicsHpa: meanIn(
			grid,
			month(year.pressure, JULY),
			cellsInBox(grid, SUBTROPICS_BOX),
		),
		januaryMonsoon: windIn(JANUARY),
		julyMonsoon: windIn(JULY),
		januaryAsiaHigh: extremeIn(
			grid,
			month(year.pressure, JANUARY),
			cellsInBox(grid, WINTER_HIGH_BOX),
			true,
		),
	};
};
