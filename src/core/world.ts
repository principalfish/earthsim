/**
 * A world: its settings and the elevation of every cell of its grid.
 *
 * Elevation is in metres against a fixed zero datum, one value per cell in
 * the grid's cell order (`face * n * n + j * n + i`). Sea level is a setting
 * measured against the same datum, so moving it changes which cells are land
 * without touching the terrain.
 *
 * A world is plain data: it holds no grid geometry, which is derived from the
 * resolution alone, and it survives a structured clone unchanged.
 */

import {
	DEFAULT_RESOLUTION,
	FACE_COUNT,
	isSupportedResolution,
	type Resolution,
	SUPPORTED_RESOLUTIONS,
} from './grid';

/** Radius of the planet in kilometres: Earth's mean radius. */
export const PLANET_RADIUS_KM = 6371;

/** Surface area of the planet in square kilometres: about 510.1 million. */
export const PLANET_SURFACE_AREA_KM2 =
	4 * Math.PI * PLANET_RADIUS_KM * PLANET_RADIUS_KM;

/** The lowest elevation a cell can hold, in metres against the datum. */
export const MIN_ELEVATION_M = -12_000;

/** The highest elevation a cell can hold, in metres against the datum. */
export const MAX_ELEVATION_M = 12_000;

/** The sea level of a new world, in metres against the datum. */
export const DEFAULT_SEA_LEVEL_M = 0;

/** The elevation of every cell of a blank ocean world, in metres. */
export const BLANK_OCEAN_ELEVATION_M = -4_000;

/**
 * How a world's terrain started, before any editing.
 *
 * @remarks
 * A union discriminated on `kind`, so that further ways of starting a world
 * can be added as new variants. Code that depends on the origin should switch
 * on `kind` rather than assume the variants listed here are the only ones.
 */
export type WorldOrigin = {
	/** A uniform ocean with no land. */
	readonly kind: 'blank';
};

/**
 * A world's settings and terrain.
 *
 * @remarks
 * The resolution, the origin and the elevation array itself are fixed when
 * the world is created; the sea level and the contents of the array are
 * edited in place. Every elevation must be a finite number within
 * {@link MIN_ELEVATION_M} and {@link MAX_ELEVATION_M}, which is the
 * responsibility of whatever writes to the array: see {@link clampElevation}.
 * The sea level has the same limits and is written through
 * {@link normaliseSeaLevel}.
 */
export type World = {
	/** Cells along a face edge of the world's grid. */
	readonly resolution: Resolution;
	/**
	 * Sea level in metres against the datum. A cell is land when its
	 * elevation is strictly above this, and sea otherwise.
	 *
	 * Always a single-precision value within {@link MIN_ELEVATION_M} and
	 * {@link MAX_ELEVATION_M}, so that a cell set to the sea level holds
	 * exactly the sea level. Every write goes through
	 * {@link normaliseSeaLevel}.
	 */
	seaLevel: number;
	/** How the terrain started. */
	readonly origin: WorldOrigin;
	/**
	 * Elevation of each cell in metres against the datum, `6 * n * n` long
	 * and indexed like the grid's cells.
	 */
	readonly elevation: Float32Array;
};

/**
 * A new world covered by a uniform ocean, with the default sea level.
 *
 * @param resolution - Cells along a face edge; one of
 * {@link SUPPORTED_RESOLUTIONS}.
 * @returns A world whose every cell is at {@link BLANK_OCEAN_ELEVATION_M},
 * with an elevation array of its own.
 * @throws RangeError if `resolution` is not a supported resolution.
 */
export const createBlankWorld = (
	resolution: number = DEFAULT_RESOLUTION,
): World => {
	if (!isSupportedResolution(resolution)) {
		throw new RangeError(
			`Unsupported world resolution ${resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	return {
		resolution,
		seaLevel: DEFAULT_SEA_LEVEL_M,
		origin: { kind: 'blank' },
		elevation: new Float32Array(FACE_COUNT * resolution * resolution).fill(
			BLANK_OCEAN_ELEVATION_M,
		),
	};
};

/**
 * An elevation brought within the limits a cell can hold.
 *
 * @remarks
 * NaN has no nearest limit, and stored in a cell it would spread through
 * every calculation that reads the terrain, so it is rejected rather than
 * mapped to an arbitrary height.
 *
 * @param value - Elevation in metres; may be infinite.
 * @returns The value, or the nearer of {@link MIN_ELEVATION_M} and
 * {@link MAX_ELEVATION_M} if it lies outside them.
 * @throws RangeError if `value` is NaN.
 */
export const clampElevation = (value: number): number => {
	if (Number.isNaN(value)) {
		throw new RangeError('An elevation must be a number of metres; got NaN');
	}
	return Math.min(MAX_ELEVATION_M, Math.max(MIN_ELEVATION_M, value));
};

/**
 * Brings every elevation of an array within the limits, in place.
 *
 * @remarks
 * Intended for terrain produced or read in bulk, whose values have not each
 * passed through {@link clampElevation}.
 *
 * @param elevation - Elevations in metres, one per cell.
 * @throws RangeError if a value is NaN. Values before it have already been
 * clamped; those after it are untouched.
 */
export const clampElevations = (elevation: Float32Array): void => {
	for (let cell = 0; cell < elevation.length; cell++) {
		const value = elevation[cell] as number;
		if (value > MAX_ELEVATION_M) {
			elevation[cell] = MAX_ELEVATION_M;
		} else if (value < MIN_ELEVATION_M) {
			elevation[cell] = MIN_ELEVATION_M;
		} else if (Number.isNaN(value)) {
			throw new RangeError(
				`An elevation must be a number of metres; cell ${cell} holds NaN`,
			);
		}
	}
};

/**
 * A sea level in the form a world stores: within the elevation limits and
 * exactly representable in single precision.
 *
 * @remarks
 * Everything that sets {@link World.seaLevel} from outside the core, such as
 * a control or a loaded file, must pass the value through here. Elevations
 * are stored in single precision, so a sea level with more precision than
 * that could not be matched by any cell: a cell set to it would be rounded
 * to just above or just below it.
 *
 * @param value - Sea level in metres against the datum; may be infinite.
 * @returns The single-precision number nearest to the value, or to the
 * nearer of {@link MIN_ELEVATION_M} and {@link MAX_ELEVATION_M} if the value
 * lies outside them.
 * @throws RangeError if `value` is NaN.
 */
export const normaliseSeaLevel = (value: number): number => {
	if (Number.isNaN(value)) {
		throw new RangeError('A sea level must be a number of metres; got NaN');
	}
	return Math.fround(
		Math.min(MAX_ELEVATION_M, Math.max(MIN_ELEVATION_M, value)),
	);
};
