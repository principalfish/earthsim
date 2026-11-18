/**
 * The ranges of relief exaggeration and drawn sea level the view offers, the
 * floor below which the coastline over a data layer is not drawn, and how
 * the sunlit globe's night side and twilight are drawn.
 */

import { normaliseSeaLevel } from '../../../core/index';

/** The lowest relief exaggeration the view offers: true scale. */
export const MIN_EXAGGERATION = 1;

/** The highest relief exaggeration the view offers. */
export const MAX_EXAGGERATION = 100;

/** The relief exaggeration a new view starts with. */
export const DEFAULT_EXAGGERATION = 40;

/** The lowest sea level the globe draws, in metres against the datum. */
export const MIN_DRAWN_SEA_LEVEL_M = -6000;

/** The highest sea level the globe draws, in metres against the datum. */
export const MAX_DRAWN_SEA_LEVEL_M = 6000;

/**
 * The change in the surface's height above sea level, in metres a pixel,
 * below which the coastline drawn over a data layer counts the surface as
 * level and draws no line there.
 *
 * @remarks
 * While a layer is shown, the height above sea level is blended from each
 * cell's own height above it, so a stretch of cells all at the sea level,
 * such as a blank world with the sea level moved to its floor, comes out as
 * exactly zero, with no change from pixel to pixel at all, and has no coast
 * to draw. A level stretch a little above or below the sea level has none
 * either, but its height still changes from pixel to pixel by rounding,
 * about a ten-millionth of the height, so the test is a floor on the change
 * rather than a test for no change at all. The floor is far below the
 * change a pixel across any real shore: even one rising a centimetre a cell
 * changes by tens of times the floor a pixel when the view is as close as
 * it goes.
 */
export const COAST_MIN_CHANGE_M = 1e-6;

/**
 * The sea level the globe draws for a sea level it is given.
 *
 * @remarks
 * Land is raised by its height above the drawn sea level, so the lower
 * bound is what limits how tall the drawn relief can be.
 *
 * @param metres - Sea level in metres against the datum; may be infinite.
 * @returns The single-precision number nearest to the value, or the nearer
 * of {@link MIN_DRAWN_SEA_LEVEL_M} and {@link MAX_DRAWN_SEA_LEVEL_M} if the
 * value lies outside them.
 * @throws RangeError if `metres` is NaN.
 */
export const drawnSeaLevel = (metres: number): number =>
	Math.min(
		MAX_DRAWN_SEA_LEVEL_M,
		Math.max(MIN_DRAWN_SEA_LEVEL_M, normaliseSeaLevel(metres)),
	);

/**
 * The brightness of the night side while the globe is lit by the sun, as a
 * share of the day side's.
 */
export const NIGHT_BRIGHTNESS = 0.3;

/**
 * Half the width of the band over which day turns to night while the globe
 * is lit by the sun, in degrees of the sun's height either side of the
 * horizon.
 */
export const TWILIGHT_HALF_WIDTH_DEG = 6;
