/**
 * How far the bands of pressure over the open ocean move through the year
 * on the one-continent world: the latitude of the band low and of the two
 * subtropical highs in the mean pressure by latitude over the ocean far
 * from the land, in January and in July. On the observed Earth the
 * oceanic subtropical highs move some 5° to 10° of latitude between the
 * two; a model that places its bands from the whole globe's temperature
 * moves them with the land's seasons instead. Like the report's other
 * measures it is taken from a model's output, never from its settings.
 */

import {
	directionToLatLon,
	type Grid,
	type WindResult,
	type ZonalMean,
} from '../../src/core/index';
import { CONTINENT_HALF_WIDTH_DEG, CONTINENT_MIDDLE_LONGITUDE } from './cases';
import { MEASURE_BANDS, type Measure, SOLSTICE_MONTHS } from './summary';

/**
 * How far from the one continent's edges, in degrees of longitude, the
 * open ocean starts: cells whose longitude lies more than this beyond the
 * continent's widest reach, {@link CONTINENT_HALF_WIDTH_DEG} from its
 * middle, are taken. With 60° it leaves about 97° of longitude, centred on
 * the far side of the planet.
 */
export const OPEN_OCEAN_MARGIN_DEG = 60;

/**
 * The farthest from the equator, in degrees, that the band low is looked
 * for: well beyond the Earth's oceanic lows, which stay within about 15° of
 * it, and short of the subpolar lows near 60°.
 */
export const BAND_LOW_REACH_DEG = 30;

/**
 * The farthest from the equator, in degrees, that a subtropical high is
 * looked for, from the band low poleward: beyond the Earth's oceanic highs,
 * near 30° to 40°, and short of the subpolar lows.
 */
export const SUBTROPICAL_HIGH_REACH_DEG = 50;

/** The cells of a grid whose centres lie on the one continent's open ocean. */
export const openOceanCells = (grid: Grid): number[] => {
	const found: number[] = [];
	const reach = CONTINENT_HALF_WIDTH_DEG + OPEN_OCEAN_MARGIN_DEG;
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const { longitudeDeg } = directionToLatLon([
			grid.centres[3 * cell] as number,
			grid.centres[3 * cell + 1] as number,
			grid.centres[3 * cell + 2] as number,
		]);
		const across =
			((((longitudeDeg - CONTINENT_MIDDLE_LONGITUDE) % 360) + 540) % 360) - 180;
		if (Math.abs(across) > reach) {
			found.push(cell);
		}
	}
	return found;
};

/**
 * The area-weighted mean of a field over some cells, in
 * {@link MEASURE_BANDS} bands of latitude of equal width, as
 * {@link zonalMean} takes it over every cell.
 *
 * @param grid - The grid the field is on.
 * @param field - One value per cell. Not changed.
 * @param cells - The cells to take. Not changed.
 * @returns New arrays, from the south; null for a band that holds none of
 * the cells.
 */
export const sectorMean = (
	grid: Grid,
	field: ArrayLike<number>,
	cells: readonly number[],
): ZonalMean => {
	const width = 180 / MEASURE_BANDS;
	const sums = new Float64Array(MEASURE_BANDS);
	const bandAreas = new Float64Array(MEASURE_BANDS);
	for (const cell of cells) {
		const { latitudeDeg } = directionToLatLon([
			grid.centres[3 * cell] as number,
			grid.centres[3 * cell + 1] as number,
			grid.centres[3 * cell + 2] as number,
		]);
		const band = Math.min(
			MEASURE_BANDS - 1,
			Math.floor((latitudeDeg + 90) / width),
		);
		const area = grid.areas[cell] as number;
		sums[band] = (sums[band] as number) + area * (field[cell] as number);
		bandAreas[band] = (bandAreas[band] as number) + area;
	}
	const latitudes: number[] = [];
	const means: (number | null)[] = [];
	for (let band = 0; band < MEASURE_BANDS; band++) {
		latitudes.push(-90 + (band + 0.5) * width);
		const area = bandAreas[band] as number;
		means.push(area > 0 ? (sums[band] as number) / area : null);
	}
	return { latitudes, means };
};

/** Where a month's band low and subtropical highs lie, in degrees north. */
export type BandPlaces = {
	readonly low: Measure;
	readonly southHigh: Measure;
	readonly northHigh: Measure;
};

/** A band's mean and its middle's latitude, or null when it holds none. */
const bandAt = (
	profile: ZonalMean,
	band: number,
): { readonly latitude: number; readonly mean: number } | null => {
	const latitude = profile.latitudes[band];
	const mean = profile.means[band];
	return latitude === undefined || mean === null || mean === undefined
		? null
		: { latitude, mean };
};

/**
 * A turning point of a profile at a band, placed between bands by the
 * parabola through it and its neighbours; null when a neighbour holds no
 * mean, or the band is not lower (or higher) than both.
 */
const turningAt = (
	profile: ZonalMean,
	band: number,
	highest: boolean,
): number | null => {
	const before = bandAt(profile, band - 1);
	const at = bandAt(profile, band);
	const after = bandAt(profile, band + 1);
	if (before === null || at === null || after === null) {
		return null;
	}
	const sign = highest ? -1 : 1;
	if (sign * (at.mean - before.mean) > 0 || sign * (at.mean - after.mean) > 0) {
		return null;
	}
	const curve = before.mean - 2 * at.mean + after.mean;
	const shift = curve === 0 ? 0 : (0.5 * (before.mean - after.mean)) / curve;
	return at.latitude + (shift * (after.latitude - before.latitude)) / 2;
};

/**
 * The lowest (or highest) turning point among a profile's bands whose
 * middles lie from one latitude to another.
 *
 * @returns Its latitude, or why it is not measured.
 */
const turningBetween = (
	profile: ZonalMean,
	from: number,
	to: number,
	highest: boolean,
): Measure => {
	let best: { readonly latitude: number; readonly mean: number } | null = null;
	for (const [band, latitude] of profile.latitudes.entries()) {
		const at = bandAt(profile, band);
		if (latitude < from || latitude > to || at === null) {
			continue;
		}
		const turning = turningAt(profile, band, highest);
		if (
			turning !== null &&
			(best === null || (highest ? at.mean > best.mean : at.mean < best.mean))
		) {
			best = { latitude: turning, mean: at.mean };
		}
	}
	return best === null
		? { value: null, missing: 'no turning point in the range looked in' }
		: { value: best.latitude };
};

/**
 * The band low and the two subtropical highs of a mean pressure by
 * latitude.
 *
 * @remarks
 * The low is the lowest band within {@link BAND_LOW_REACH_DEG} of the
 * equator that is no higher than the bands either side of it, so that the
 * fall towards a subpolar low is not taken for it; each high the highest
 * band from the low to {@link SUBTROPICAL_HIGH_REACH_DEG} on its side that
 * is no lower than the bands either side. Each is placed between bands by
 * the parabola through it and its neighbours, so that a move of under a
 * band's width shows. A range with no such band is not measured; nor are
 * the highs when the low is not.
 *
 * @param pressure - Mean pressure by latitude, in hectopascals. Not
 * changed.
 */
export const bandPlaces = (pressure: ZonalMean): BandPlaces => {
	const low = turningBetween(
		pressure,
		-BAND_LOW_REACH_DEG,
		BAND_LOW_REACH_DEG,
		false,
	);
	if (low.value === null) {
		const missing: Measure = {
			value: null,
			missing: 'the band low is not measured',
		};
		return { low, southHigh: missing, northHigh: missing };
	}
	return {
		low,
		southHigh: turningBetween(
			pressure,
			-SUBTROPICAL_HIGH_REACH_DEG,
			low.value,
			true,
		),
		northHigh: turningBetween(
			pressure,
			low.value,
			SUBTROPICAL_HIGH_REACH_DEG,
			true,
		),
	};
};

/** The open ocean's bands in January and July, and how far they move. */
export type OceanicSwing = {
	readonly january: BandPlaces;
	readonly july: BandPlaces;
	/** July's latitude less January's, in degrees, for each. */
	readonly change: BandPlaces;
};

const changeOf = (january: Measure, july: Measure): Measure =>
	january.value === null || july.value === null
		? { value: null, missing: 'a month’s place is not measured' }
		: { value: july.value - january.value };

/**
 * The one-continent world's oceanic swing: the {@link bandPlaces} of the
 * mean pressure over its {@link openOceanCells} in January and in July,
 * and their change.
 *
 * @param grid - The grid the year is on.
 * @param result - A year of the one-continent world's winds and pressure.
 * Not changed.
 */
export const oceanicSwing = (grid: Grid, result: WindResult): OceanicSwing => {
	const cells = openOceanCells(grid);
	const [january, july] = SOLSTICE_MONTHS.map((month) =>
		bandPlaces(sectorMean(grid, result.pressure[month] as Float32Array, cells)),
	) as [BandPlaces, BandPlaces];
	return {
		january,
		july,
		change: {
			low: changeOf(january.low, july.low),
			southHigh: changeOf(january.southHigh, july.southHigh),
			northHigh: changeOf(january.northHigh, july.northHigh),
		},
	};
};
