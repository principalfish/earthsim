/**
 * Climate passes of the right form, for tests of whatever passes them
 * along: none of them comes from a solve, and their values are not meant to
 * be looked at.
 */

import type { ClimateProgress, GyreResult, SimPass } from '../index';
import { temperatureOf } from './temperatureFixtures';
import { windResultOf } from './windFixtures';

/**
 * Currents of the right form, every value `value`: twelve months of four
 * flows a cell, a current and an Ekman transport a cell, and a
 * streamfunction of one value a cell, standing for one a corner.
 */
export const currentsResultOf = (value: number, cells = 2): GyreResult => {
	const months = <T>(make: () => T): T[] => Array.from({ length: 12 }, make);
	return {
		flows: months(() => new Float64Array(4 * cells).fill(value)),
		east: months(() => new Float32Array(cells).fill(value)),
		north: months(() => new Float32Array(cells).fill(value)),
		ekmanEast: months(() => new Float32Array(cells).fill(value)),
		ekmanNorth: months(() => new Float32Array(cells).fill(value)),
		streamfunction: months(() => new Float64Array(cells).fill(value)),
		iterations: months(() => 1),
	};
};

/**
 * A pass of a climate, told apart from others by its number.
 *
 * @param pass - The pass, from 1.
 * @param options - Whether it is the last, and whether it settled; neither
 * by default.
 * @param cells - How many cells each field holds; 2 when left out.
 * @returns A new pass whose temperature is {@link temperatureOf}, whose
 * winds are {@link windResultOf} and whose currents are
 * {@link currentsResultOf}, of the pass's number, with a change of 1 for any
 * pass but the first.
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
	currents: currentsResultOf(pass, cells),
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
