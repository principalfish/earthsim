/**
 * How much milder the west-facing coasts of the mid-latitude continents are
 * than their east-facing ones: the Earth's west–east coast contrast, which
 * the winds' carrying of heat is meant to make.
 *
 * Land at 40–60°N and under 1,000 m above the sea is a west-facing coast
 * where there is sea to its west (within 1.5° or 3° of longitude) and none
 * to its east, and an east-facing coast the other way round. The contrast
 * is the area-weighted mean temperature of the west-facing coasts of one
 * sector less that of the east-facing coasts of another: western Europe
 * against East Asia, and the west of North America against its east. Each
 * is given for the year and for January, simulated and observed. The
 * observed Earth's are about 11.5 K and 22.9 K for Europe against Asia, and
 * 5.8 K and 15.1 K for North America.
 */

import type { Grid } from '../../grid/grid';
import {
	cellAt,
	directionToLatLon,
	getGrid,
	latLonToDirection,
} from '../../grid/grid';
import { MONTHS_PER_YEAR } from '../../planet/insolation';
import type { World } from '../../world/world';

/** The sectors' longitudes, in degrees east, and the coast each one gives. */
const SECTORS = {
	europeWest: { from: -15, to: 30 },
	asiaEast: { from: 100, to: 180 },
	northAmericaWest: { from: -180, to: -110 },
	northAmericaEast: { from: -100, to: -50 },
} as const;

/** The latitudes of the coasts, in degrees. */
const COAST_LATITUDES = { from: 40, to: 60 } as const;

/** The land above this height over the sea is not a coast, in metres. */
const COAST_MAX_HEIGHT_M = 1000;

/** How far to look for the sea, east and west, in degrees of longitude. */
const SEA_DISTANCES_DEG = [1.5, 3] as const;

/** A west-facing coast's temperature less an east-facing one's, in kelvin. */
export type CoastContrastPair = {
	/** The year's mean. */
	readonly annual: number;
	/** January's. */
	readonly january: number;
};

/** One contrast, simulated and observed. */
export type CoastContrastFigure = {
	readonly simulated: CoastContrastPair;
	readonly observed: CoastContrastPair;
};

/** The Earth's west–east coast contrasts, simulated and observed. */
export type CoastContrast = {
	/** The west-facing coasts of Europe less the east-facing of East Asia. */
	readonly europeAsia: CoastContrastFigure;
	/** The west-facing coasts of North America less its east-facing. */
	readonly northAmerica: CoastContrastFigure;
};

/** The cells of each of the four kinds of coast. */
type Coasts = {
	readonly europeWest: number[];
	readonly asiaEast: number[];
	readonly northAmericaWest: number[];
	readonly northAmericaEast: number[];
};

const coastsOf = (world: World, grid: Grid): Coasts => {
	const { cellCount } = grid;
	const coasts: Coasts = {
		europeWest: [],
		asiaEast: [],
		northAmericaWest: [],
		northAmericaEast: [],
	};
	const isLand = (cell: number): boolean =>
		(world.elevation[cell] as number) > world.seaLevel;
	const landAt = (latitude: number, longitude: number): boolean =>
		isLand(cellAt(grid, latLonToDirection(latitude, longitude)));
	const seaBeside = (latitude: number, longitude: number, sign: number) =>
		SEA_DISTANCES_DEG.some(
			(distance) => !landAt(latitude, longitude + sign * distance),
		);
	for (let cell = 0; cell < cellCount; cell++) {
		if (!isLand(cell)) {
			continue;
		}
		const { latitudeDeg, longitudeDeg } = directionToLatLon([
			grid.centres[3 * cell] as number,
			grid.centres[3 * cell + 1] as number,
			grid.centres[3 * cell + 2] as number,
		]);
		if (
			latitudeDeg < COAST_LATITUDES.from ||
			latitudeDeg > COAST_LATITUDES.to ||
			(world.elevation[cell] as number) - world.seaLevel > COAST_MAX_HEIGHT_M
		) {
			continue;
		}
		const west = seaBeside(latitudeDeg, longitudeDeg, -1);
		const east = seaBeside(latitudeDeg, longitudeDeg, 1);
		const inSector = (sector: { from: number; to: number }): boolean =>
			longitudeDeg >= sector.from && longitudeDeg <= sector.to;
		if (west && !east) {
			if (inSector(SECTORS.europeWest)) {
				coasts.europeWest.push(cell);
			}
			if (inSector(SECTORS.northAmericaWest)) {
				coasts.northAmericaWest.push(cell);
			}
		}
		if (east && !west) {
			if (inSector(SECTORS.asiaEast)) {
				coasts.asiaEast.push(cell);
			}
			if (inSector(SECTORS.northAmericaEast)) {
				coasts.northAmericaEast.push(cell);
			}
		}
	}
	return coasts;
};

/**
 * The Earth's west–east coast contrasts for a simulated year and the
 * observed one.
 *
 * @param world - The Earth, whose land and sea say where the coasts are.
 * Not changed.
 * @param simulated - Twelve simulated months, one value per cell. Not
 * changed.
 * @param observed - The twelve observed months on the same grid. Not
 * changed.
 * @returns The contrasts, in kelvin, unrounded.
 * @throws RangeError if either year is not twelve months of one value per
 * cell of the world's grid, or one of the four kinds of coast has no cells
 * (a world that is not the Earth).
 */
export const coastContrast = (
	world: World,
	simulated: readonly ArrayLike<number>[],
	observed: readonly ArrayLike<number>[],
): CoastContrast => {
	const grid = getGrid(world.resolution);
	for (const year of [simulated, observed]) {
		if (
			year.length !== MONTHS_PER_YEAR ||
			year.some((month) => month.length !== grid.cellCount)
		) {
			throw new RangeError(
				`A coast contrast needs ${MONTHS_PER_YEAR} months of ${grid.cellCount} values`,
			);
		}
	}
	const coasts = coastsOf(world, grid);
	for (const [name, cells] of Object.entries(coasts)) {
		if (cells.length === 0) {
			throw new RangeError(`The world has no ${name} coast`);
		}
	}
	const mean = (
		year: readonly ArrayLike<number>[],
		cells: readonly number[],
		months: readonly number[],
	): number => {
		let total = 0;
		let area = 0;
		for (const month of months) {
			for (const cell of cells) {
				total += (grid.areas[cell] as number) * (year[month]?.[cell] as number);
				area += grid.areas[cell] as number;
			}
		}
		return total / area;
	};
	const ALL = Array.from({ length: MONTHS_PER_YEAR }, (_, month) => month);
	const JANUARY = [0];
	const pair = (
		year: readonly ArrayLike<number>[],
		west: readonly number[],
		east: readonly number[],
	): CoastContrastPair => ({
		annual: mean(year, west, ALL) - mean(year, east, ALL),
		january: mean(year, west, JANUARY) - mean(year, east, JANUARY),
	});
	const figure = (
		west: readonly number[],
		east: readonly number[],
	): CoastContrastFigure => ({
		simulated: pair(simulated, west, east),
		observed: pair(observed, west, east),
	});
	return {
		europeAsia: figure(coasts.europeWest, coasts.asiaEast),
		northAmerica: figure(coasts.northAmericaWest, coasts.northAmericaEast),
	};
};
