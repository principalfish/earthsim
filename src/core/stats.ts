/**
 * Summary statistics of a world's terrain.
 *
 * Cells of the grid differ in area, so every fraction and mean here weights
 * a cell by its exact area rather than counting cells.
 */

import { getGrid } from './grid';
import {
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	PLANET_RADIUS_KM,
	type World,
} from './world';

/**
 * How much of a world is land and sea, and how high and deep they are.
 *
 * @remarks
 * A cell is land when its elevation is strictly above the world's sea level,
 * and sea otherwise. Every field is a finite number, whatever the terrain.
 */
export type TerrainStats = {
	/** Share of the surface that is land, by area, from 0 to 1. */
	readonly landFraction: number;
	/** Area of all land cells, in square kilometres. */
	readonly landAreaKm2: number;
	/**
	 * Area of all sea cells, in square kilometres. With
	 * {@link TerrainStats.landAreaKm2} it adds up to the planet's surface
	 * area, to rounding.
	 */
	readonly seaAreaKm2: number;
	/**
	 * The highest elevation of any cell, land or sea, in metres against the
	 * datum rather than above sea level.
	 */
	readonly highestM: number;
	/**
	 * The lowest elevation of any cell, land or sea, in metres against the
	 * datum rather than below sea level. Negative below the datum.
	 */
	readonly deepestM: number;
	/**
	 * Area-weighted mean height of the land above sea level, in metres; 0
	 * when there is no land.
	 */
	readonly meanLandHeightM: number;
	/**
	 * Area-weighted mean depth of the sea floor below sea level, in metres,
	 * as a positive number; 0 when there is no sea.
	 */
	readonly meanOceanDepthM: number;
};

const KM2_PER_STERADIAN = PLANET_RADIUS_KM * PLANET_RADIUS_KM;

/**
 * The terrain statistics of a world at its current sea level.
 *
 * @remarks
 * The highest and deepest elevations are taken over every cell and measured
 * against the datum, so they describe the terrain alone and do not move with
 * the sea level; the two means are measured from the sea level and do.
 *
 * Elevations are stored in single precision, so the sea level is rounded to
 * single precision before it is compared with them. A cell set to the sea
 * level is then sea, with no depth, even if the world's sea level was not
 * stored in that form.
 *
 * One pass over the cells with no allocation per cell. An elevation that is
 * not finite is detected from the totals after the pass, at no cost per
 * cell.
 *
 * @param world - The world to measure. It is not modified.
 * @returns A new plain object.
 * @throws RangeError if the world's resolution is not supported, if its
 * elevation array is not `6 * n * n` long, if its sea level is NaN or
 * outside {@link MIN_ELEVATION_M} to {@link MAX_ELEVATION_M}, or if any
 * elevation is NaN or infinite.
 */
export const computeTerrainStats = (world: World): TerrainStats => {
	const { elevation } = world;
	const { areas, cellCount } = getGrid(world.resolution);
	if (elevation.length !== cellCount) {
		throw new RangeError(
			`A world of resolution ${world.resolution} has ${cellCount} cells; its elevation holds ${elevation.length}`,
		);
	}
	if (
		!(world.seaLevel >= MIN_ELEVATION_M && world.seaLevel <= MAX_ELEVATION_M)
	) {
		throw new RangeError(
			`A sea level must be from ${MIN_ELEVATION_M} to ${MAX_ELEVATION_M} metres; got ${world.seaLevel}`,
		);
	}
	// Both limits are exact in single precision, so rounding stays in range.
	const level = Math.fround(world.seaLevel);

	let landArea = 0;
	let seaArea = 0;
	let landHeight = 0;
	let seaDepth = 0;
	let highest = Number.NEGATIVE_INFINITY;
	let deepest = Number.POSITIVE_INFINITY;
	for (let cell = 0; cell < cellCount; cell++) {
		const height = elevation[cell] as number;
		const area = areas[cell] as number;
		if (height > highest) {
			highest = height;
		}
		if (height < deepest) {
			deepest = height;
		}
		if (height > level) {
			landArea += area;
			landHeight += area * (height - level);
		} else {
			seaArea += area;
			seaDepth += area * (level - height);
		}
	}
	// Neither total has a negative term, so they cannot cancel: an elevation
	// that is not finite always leaves their sum not finite. A NaN elevation
	// fails the comparison above and lands in the sea total.
	if (!Number.isFinite(landHeight + seaDepth)) {
		throw new RangeError(
			'Terrain statistics need finite elevations; at least one cell holds NaN or an infinite value',
		);
	}

	return {
		landFraction: landArea / (landArea + seaArea),
		landAreaKm2: landArea * KM2_PER_STERADIAN,
		seaAreaKm2: seaArea * KM2_PER_STERADIAN,
		highestM: highest,
		deepestM: deepest,
		meanLandHeightM: landArea > 0 ? landHeight / landArea : 0,
		meanOceanDepthM: seaArea > 0 ? seaDepth / seaArea : 0,
	};
};
