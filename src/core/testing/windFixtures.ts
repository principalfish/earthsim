/**
 * Wind results of the right form, for tests of whatever passes them along:
 * none of them comes from a solve, and their values are not meant to be
 * looked at.
 */

import type { WindResult } from '../index';

/**
 * A year of winds and pressure of the right form, told apart from others
 * by its values.
 *
 * @param value - The value every field holds at every cell.
 * @param cells - How many cells each month holds; 2 when left out.
 * @returns New arrays, twelve months each of eastward wind, northward wind
 * and pressure.
 */
export const windResultOf = (value: number, cells = 2): WindResult => {
	const field = (): Float32Array[] =>
		Array.from({ length: 12 }, () => new Float32Array(cells).fill(value));
	return { east: field(), north: field(), pressure: field() };
};
