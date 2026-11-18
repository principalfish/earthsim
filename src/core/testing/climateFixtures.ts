/**
 * Climate passes of the right form, for tests of whatever passes them
 * along: none of them comes from a solve, and their values are not meant to
 * be looked at.
 */

import type { ClimateProgress, SimPass } from '../index';
import { temperatureOf } from './temperatureFixtures';
import { windResultOf } from './windFixtures';

/**
 * A pass of a climate, told apart from others by its number.
 *
 * @param pass - The pass, from 1.
 * @param options - Whether it is the last, and whether it settled; neither
 * by default.
 * @param cells - How many cells each field holds; 2 when left out.
 * @returns A new pass whose temperature is {@link temperatureOf} and whose
 * winds are {@link windResultOf}, of the pass's number, with a change of 1
 * for any pass but the first.
 */
export const climatePassOf = (
	pass: number,
	options: { last?: boolean; settled?: boolean } = {},
	cells = 2,
): ClimateProgress => ({
	pass,
	maxPasses: 8,
	temperature: temperatureOf(pass, cells),
	winds: windResultOf(pass, cells),
	changeC: pass === 1 ? null : 1,
	settled: options.settled ?? false,
	last: options.last ?? false,
});

/**
 * A worker's message about a pass of the climate request with that id.
 *
 * @param id - The id of the request.
 * @param pass - The pass, from 1.
 * @param options - As for {@link climatePassOf}.
 */
export const passMessageOf = (
	id: number,
	pass: number,
	options: { last?: boolean; settled?: boolean } = {},
): SimPass => ({
	id,
	kind: 'climate',
	climatePass: climatePassOf(pass, options),
});
