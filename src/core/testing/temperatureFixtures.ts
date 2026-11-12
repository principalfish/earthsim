/**
 * Temperature results and progress of the right form, for tests of whatever
 * passes them along: none of them comes from a solve, and their values are
 * not meant to be looked at.
 */

import {
	DEFAULT_PLANET,
	type SimProgress,
	type TemperatureProgress,
	type TemperatureResult,
} from '../index';

/**
 * A result of the right form, told apart from others by its years run.
 *
 * @param yearsRun - The years the result says were run.
 * @param cells - How many cells each month and the state hold; 2 when left
 * out.
 * @returns A new result whose arrays, the months and the state's, are all
 * zero, with a `stepSeconds` of 1, solved for a sea level of 0 m and
 * Earth's planet, `converged` true, a `finalChangeK` of 0 and the years
 * run given.
 */
export const temperatureOf = (
	yearsRun: number,
	cells = 2,
): TemperatureResult => ({
	months: Array.from({ length: 12 }, () => new Float32Array(cells)),
	state: {
		temperatureK: new Float64Array(cells),
		previousK: new Float64Array(cells),
		referenceCoolingK: new Float64Array(cells),
		stepSeconds: 1,
	},
	solvedFor: { seaLevel: 0, planet: { ...DEFAULT_PLANET } },
	yearsRun,
	converged: true,
	finalChangeK: 0,
});

/**
 * How far a solve has come, told apart from others by its years done.
 *
 * @param yearsDone - The years the solve says are done, of 60 at most.
 * @returns New progress with nothing yet known of the years left.
 */
export const progressOf = (yearsDone: number): TemperatureProgress => ({
	yearsDone,
	maxYears: 60,
	changeK: 1,
	toleranceK: 0.05,
	estimatedYearsLeft: null,
});

/**
 * A worker's message about the progress of the temperature request with
 * that id.
 *
 * @param id - The id of the request.
 * @param yearsDone - The years done, as for {@link progressOf}.
 * @returns The message, its progress that of {@link progressOf}.
 */
export const progressMessageOf = (
	id: number,
	yearsDone: number,
): SimProgress => ({
	id,
	kind: 'temperature',
	progress: progressOf(yearsDone),
});
