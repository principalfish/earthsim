/**
 * The real Earth as a world: reading the elevation data file and making a
 * world of any supported resolution from it.
 *
 * The data file holds the mean elevation of every cell of the finest grid,
 * {@link EARTH_DATA_RESOLUTION} cells along a face edge, as signed 16-bit
 * integers of whole metres, little-endian, in the grid's cell order
 * (`face * n * n + j * n + i`), with no header: {@link EARTH_DATA_BYTES}
 * bytes in all. Elevations are against mean sea level and follow the top of
 * the ice where there is ice, so Greenland and Antarctica stand at the
 * height of their ice sheets.
 */

import {
	FACE_COUNT,
	getGrid,
	isSupportedResolution,
	type Resolution,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import { DEFAULT_AGE_YEARS, DEFAULT_PLANET } from './planet';
import { clampElevations, DEFAULT_SEA_LEVEL_M, type World } from './world';

/** Cells along a face edge of the grid the Earth data is stored on. */
export const EARTH_DATA_RESOLUTION = 256 satisfies Resolution;

const BYTES_PER_CELL = 2;

/** The number of cells the Earth data file holds an elevation for. */
export const EARTH_DATA_CELLS =
	FACE_COUNT * EARTH_DATA_RESOLUTION * EARTH_DATA_RESOLUTION;

/** The exact length of the Earth data file, in bytes. */
export const EARTH_DATA_BYTES = EARTH_DATA_CELLS * BYTES_PER_CELL;

/** The Earth's elevation as the data file gives it. */
export type EarthData = {
	/** Cells along a face edge of the grid the elevations are on. */
	readonly resolution: typeof EARTH_DATA_RESOLUTION;
	/**
	 * Mean elevation of each cell in whole metres against mean sea level,
	 * {@link EARTH_DATA_CELLS} long and indexed like the grid's cells. It
	 * must be treated as read-only: worlds are made from copies of it.
	 */
	readonly elevation: Float32Array;
};

/**
 * Reads the bytes of the Earth data file.
 *
 * @remarks
 * The length is the only thing about the bytes that can be wrong: every
 * 16-bit value is an elevation. Values are read as little-endian whatever
 * the machine.
 *
 * @param bytes - The whole file. It is not changed and not kept.
 * @returns The elevations, in an array that owes nothing to `bytes`.
 * @throws RangeError if `bytes` is not exactly {@link EARTH_DATA_BYTES}
 * long.
 */
export const decodeEarth = (bytes: Uint8Array): EarthData => {
	if (bytes.length !== EARTH_DATA_BYTES) {
		throw new RangeError(
			`The Earth data file is ${EARTH_DATA_BYTES} bytes long; got ${bytes.length}`,
		);
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const elevation = new Float32Array(EARTH_DATA_CELLS);
	for (let cell = 0; cell < EARTH_DATA_CELLS; cell++) {
		elevation[cell] = view.getInt16(cell * BYTES_PER_CELL, true);
	}
	return { resolution: EARTH_DATA_RESOLUTION, elevation };
};

/**
 * The data averaged onto a coarser grid: each coarse cell takes the mean of
 * the data cells it covers, weighted by their areas.
 */
const averageBlocks = (
	fine: Float32Array,
	resolution: Resolution,
): Float32Array => {
	const { areas } = getGrid(EARTH_DATA_RESOLUTION);
	const block = EARTH_DATA_RESOLUTION / resolution;
	const elevation = new Float32Array(FACE_COUNT * resolution * resolution);
	let cell = 0;
	for (let face = 0; face < FACE_COUNT; face++) {
		for (let j = 0; j < resolution; j++) {
			for (let i = 0; i < resolution; i++) {
				let total = 0;
				let area = 0;
				for (let dj = 0; dj < block; dj++) {
					const row =
						(face * EARTH_DATA_RESOLUTION + j * block + dj) *
						EARTH_DATA_RESOLUTION;
					for (let di = 0; di < block; di++) {
						const fineCell = row + i * block + di;
						const fineArea = areas[fineCell] as number;
						total += fineArea * (fine[fineCell] as number);
						area += fineArea;
					}
				}
				elevation[cell] = total / area;
				cell++;
			}
		}
	}
	return elevation;
};

/**
 * A new world with the Earth's terrain, at the default sea level.
 *
 * @remarks
 * At {@link EARTH_DATA_RESOLUTION} the world holds the data as it is. A
 * coarser grid nests in the data's grid exactly: with `k` data cells to a
 * coarse cell along each axis, coarse cell `(face, i, j)` covers data cells
 * `(face, k·i … k·i + k − 1, k·j … k·j + k − 1)`. Each coarse cell takes
 * the mean of the data cells it covers, weighted by their areas, which is
 * the mean elevation of the ground it covers.
 *
 * Every elevation is brought within the limits a cell can hold.
 *
 * @param data - The Earth's elevation, as {@link decodeEarth} gives it. It
 * is not changed.
 * @param resolution - Cells along a face edge; one of
 * {@link SUPPORTED_RESOLUTIONS}.
 * @returns A world with an elevation array of its own, whose origin says it
 * started as the Earth, with Earth's planet settings and a date of year
 * zero: today.
 * @throws RangeError if `resolution` is not a supported resolution, if the
 * data does not hold {@link EARTH_DATA_CELLS} elevations, or if one of them
 * is NaN.
 */
export const earthWorld = (data: EarthData, resolution: number): World => {
	if (!isSupportedResolution(resolution)) {
		throw new RangeError(
			`Unsupported world resolution ${resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	const fine = data.elevation;
	if (fine.length !== EARTH_DATA_CELLS) {
		throw new RangeError(
			`Earth data holds ${EARTH_DATA_CELLS} elevations; got ${fine.length}`,
		);
	}
	const elevation =
		resolution === EARTH_DATA_RESOLUTION
			? Float32Array.from(fine)
			: averageBlocks(fine, resolution);
	clampElevations(elevation);
	return {
		resolution,
		seaLevel: DEFAULT_SEA_LEVEL_M,
		origin: { kind: 'earth' },
		planet: { ...DEFAULT_PLANET },
		ageYears: DEFAULT_AGE_YEARS,
		elevation,
	};
};
