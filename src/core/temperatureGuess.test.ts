/**
 * The first guess of a solve from nothing on a grid finer than the
 * coarsest, which is worked out a grid coarser: how far the answer it leads
 * to lies from the answer of a solve that starts from the balance worked
 * out on the solve's own grid.
 *
 * In a file of its own, so that the runner solves it beside the rest. It
 * makes two solves on the 128 grid, about four seconds each.
 */

import { describe, expect, it } from 'vitest';
import { generateWorld } from './generate';
import { getGrid } from './grid';
import { MONTHS_PER_YEAR } from './insolation';
import {
	annualBalance,
	lapseCooling,
	solveTemperature,
	type TemperatureStart,
	temperatureConditions,
} from './temperature';
import type { World } from './world';

/** Allows for coverage instrumentation, which makes the solves slower. */
const SOLVE_TIMEOUT_MS = 120_000;

/**
 * The most the two answers may differ in any cell and month, in kelvin.
 * Both are converged, each year's change below 0.05 K, so they differ by
 * no more than that slack allows: measured, 0.0038 K in the worst cell and
 * month and 0.0004 K root-mean-square on this world, and 0.0016 K and
 * 0.0001 K on the Earth at 128.
 */
const MAX_CELL_K = 0.01;

/**
 * A start that makes a solve begin exactly as a solve from nothing on the
 * world's own grid would if its first guess were worked out there: the
 * balance on that grid as the state at the turn of the year and the state a
 * step before, and the world's own cooling as the reference.
 */
const balanceStart = (world: World, stepSeconds: number): TemperatureStart => {
	const balance = annualBalance(world);
	return {
		state: {
			temperatureK: balance,
			previousK: Float64Array.from(balance),
			stepSeconds,
			referenceCoolingK: lapseCooling(world),
		},
		solvedFor: temperatureConditions(world),
	};
};

describe('solveTemperature from nothing on the 128 grid', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	it('ends within 0.01 K of the solve from the balance on its own grid, in no more years', () => {
		const world = generateWorld({
			resolution: 128,
			seed: 20_261_111,
			landFraction: 0.3,
		});
		const cold = solveTemperature(world, { fullResolution: true });
		const fromOwnGrid = solveTemperature(world, {
			fullResolution: true,
			start: balanceStart(world, cold.state.stepSeconds),
		});
		expect(cold.converged).toBe(true);
		expect(fromOwnGrid.converged).toBe(true);
		expect(cold.yearsRun).toBeLessThanOrEqual(fromOwnGrid.yearsRun);
		const { cellCount } = getGrid(128);
		let largest = 0;
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const a = cold.months[month] as Float32Array;
			const b = fromOwnGrid.months[month] as Float32Array;
			for (let cell = 0; cell < cellCount; cell++) {
				largest = Math.max(
					largest,
					Math.abs((a[cell] as number) - (b[cell] as number)),
				);
			}
		}
		expect(largest).toBeLessThan(MAX_CELL_K);
		// Not the same solve: the first guess makes a difference.
		expect(largest).toBeGreaterThan(0);
	});
});

describe('annualBalance', () => {
	it('gives one sea-level temperature per cell, in kelvin', () => {
		const world = generateWorld({
			resolution: 64,
			seed: 20_261_111,
			landFraction: 0.3,
		});
		const balance = annualBalance(world);
		const { cellCount } = getGrid(64);
		expect(balance).toHaveLength(cellCount);
		for (const value of balance) {
			expect(value).toBeGreaterThan(150);
			expect(value).toBeLessThan(350);
		}
	});

	it('refuses a world of an unsupported resolution', () => {
		const world = generateWorld({
			resolution: 64,
			seed: 20_261_111,
			landFraction: 0.3,
		});
		expect(() =>
			annualBalance({ ...world, resolution: 32 } as unknown as World),
		).toThrow('Unsupported world resolution 32');
	});
});
