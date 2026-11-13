import { describe, expect, it } from 'vitest';
import {
	getGrid,
	MONTHS_PER_YEAR,
	type WindModel,
	type World,
} from '../../src/core/index';
import {
	readEarthDataFile,
	readObservedPressureFile,
	readObservedWindFile,
} from '../earth/dataFile.mjs';
import { cases } from './cases';
import { workOutReport } from './run';

const sources = {
	earth: readEarthDataFile(),
	wind: readObservedWindFile(),
	pressure: readObservedPressureFile(),
};

/** A clock that moves on by a quarter of a second each time it is read. */
const steppingClock = () => {
	let time = 0;
	return () => {
		time += 250;
		return time;
	};
};

describe('workOutReport', () => {
	it('with no model solves nothing and shows the observed Earth', () => {
		const page = workOutReport({
			sources,
			models: [],
			now: () => {
				throw new Error('Nothing is timed without a model');
			},
		});
		expect(page).toContain('No wind model is registered yet');
		for (const shown of cases.filter(({ invented }) => invented)) {
			expect(page).toContain(`${shown.title}: the coast`);
		}
	});

	it('refuses cases without the Earth before solving anything', () => {
		const model: WindModel = () => {
			throw new Error('No model is run without the Earth');
		};
		expect(() =>
			workOutReport({
				sources,
				models: [{ name: 'Never run', model }],
				now: () => {
					throw new Error('Nothing is timed without the Earth');
				},
				cases: cases.filter(({ id }) => id === 'ocean'),
			}),
		).toThrow(/must include one named earth/);
	});

	// This test solves two temperatures: the Earth's at 64 cells per face
	// edge, for the case, and at 128, to time the model there (about a
	// second each, but several under coverage, hence the longer time
	// allowed).
	it('runs each model on each case with its temperatures, and times it', () => {
		const calls: { world: World; temperatures: readonly Float32Array[] }[] = [];
		// A made-up model: an eastward wind of a tenth of the temperature.
		const model: WindModel = (world, temperatures) => {
			calls.push({ world, temperatures });
			const { cellCount } = getGrid(world.resolution);
			return {
				east: temperatures.map((month) => month.map((value) => value / 10)),
				north: temperatures.map(() => new Float32Array(cellCount)),
				pressure: temperatures.map(() =>
					new Float32Array(cellCount).fill(1013),
				),
			};
		};
		const page = workOutReport({
			sources,
			models: [{ name: 'Tenth of the temperature', model }],
			now: steppingClock(),
			cases: cases.filter(({ id }) => id === 'earth'),
			timingResolutions: [64, 128],
		});
		// Once on the case, and once to time it at each resolution.
		expect(calls).toHaveLength(3);
		const [first, second, third] = calls;
		expect(first?.world.origin.kind).toBe('earth');
		expect(first?.temperatures).toHaveLength(MONTHS_PER_YEAR);
		expect(first?.temperatures[0]).toHaveLength(getGrid(64).cellCount);
		// The Earth's January is somewhere between -60 and 40 °C.
		const january = first?.temperatures[0] as Float32Array;
		expect(Math.min(...january)).toBeGreaterThan(-70);
		expect(Math.max(...january)).toBeLessThan(45);
		// The timing reuses the case's world and temperatures at 64.
		expect(second?.world).toBe(first?.world);
		expect(second?.temperatures).toBe(first?.temperatures);
		// At 128 it gets the Earth on that grid and its own temperatures.
		expect(third?.world.resolution).toBe(128);
		expect(third?.world.origin.kind).toBe('earth');
		expect(third?.temperatures).toHaveLength(MONTHS_PER_YEAR);
		for (const month of third?.temperatures ?? []) {
			expect(month).toHaveLength(getGrid(128).cellCount);
		}
		expect(page).toContain('<h2>Model: Tenth of the temperature</h2>');
		// The stepping clock makes each run take 0.25 s.
		expect(page).toContain(
			'<tr><td class="number">64</td><td class="number">0.250</td></tr><tr><td class="number">128</td><td class="number">0.250</td></tr>',
		);
		expect(page).toContain('<td>The whole year</td>');
	}, 60_000);
});
