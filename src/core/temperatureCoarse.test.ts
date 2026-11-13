/**
 * How far a world solved on the grid a step coarser lies from the same
 * world solved on its own grid: the Earth at 128 cells per face edge.
 *
 * In a file of its own, so that the runner solves it beside the rest. The
 * solve on the world's own grid is the slow part, about four seconds.
 */

import { describe, expect, it } from 'vitest';
import { readEarthDataFile } from '../../scripts/earth/dataFile.mjs';
import { decodeEarth, earthWorld } from './earth';
import { getGrid } from './grid';
import { MONTHS_PER_YEAR } from './insolation';
import { solveTemperature } from './temperature';

/** Allows for coverage instrumentation, which makes the solves slower. */
const SOLVE_TIMEOUT_MS = 120_000;

/** The most the two may differ, in kelvin. */
const MAX_RMS_K = 0.15;
const MAX_CELL_K = 2;

describe('solveTemperature on the grid a step coarser', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	it('lies within 0.15 K root-mean-square and 2 K in every cell and month of the full solve, on the Earth at 128', () => {
		const world = earthWorld(decodeEarth(readEarthDataFile()), 128);
		const coarse = solveTemperature(world);
		const full = solveTemperature(world, { fullResolution: true });
		expect(coarse.converged).toBe(true);
		expect(full.converged).toBe(true);
		const { areas, cellCount } = getGrid(128);
		let squares = 0;
		let area = 0;
		let largest = 0;
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const a = coarse.months[month] as Float32Array;
			const b = full.months[month] as Float32Array;
			for (let cell = 0; cell < cellCount; cell++) {
				const difference = (a[cell] as number) - (b[cell] as number);
				squares += (areas[cell] as number) * difference * difference;
				area += areas[cell] as number;
				largest = Math.max(largest, Math.abs(difference));
			}
		}
		// Measured: 0.10 K and 1.36 K, the worst in June on the Caspian
		// Sea's northern shore.
		expect(Math.sqrt(squares / area)).toBeLessThan(MAX_RMS_K);
		expect(largest).toBeLessThan(MAX_CELL_K);
		// Not the same solve: the coarse grid makes a difference.
		expect(largest).toBeGreaterThan(0.1);
	});
});
