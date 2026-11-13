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
import { firstNonFinite, workOutReport } from './run';

const sources = {
	earth: readEarthDataFile(),
	wind: readObservedWindFile(),
	pressure: readObservedPressureFile(),
};

/** A warning where none is expected. */
const noWarning = (message: string): never => {
	throw new Error(`No warning was expected; got ${message}`);
};

/** A clock that moves on by a quarter of a second each time it is read. */
const steppingClock = () => {
	let time = 0;
	return () => {
		time += 250;
		return time;
	};
};

/** A year of zeros on the 64 grid, as a model would give it. */
const calmYear = () => {
	const { cellCount } = getGrid(64);
	const months = () =>
		Array.from({ length: MONTHS_PER_YEAR }, () => new Float32Array(cellCount));
	return { east: months(), north: months(), pressure: months() };
};

describe('firstNonFinite', () => {
	it('finds the earliest month, and in it the first field, that holds a value that is not a finite number', () => {
		const year = calmYear();
		expect(firstNonFinite(year)).toBeNull();
		(year.pressure[2] as Float32Array)[7] = Number.NaN;
		expect(firstNonFinite(year)).toEqual({ month: 2, field: 'pressure' });
		(year.north[2] as Float32Array)[100] = Number.POSITIVE_INFINITY;
		expect(firstNonFinite(year)).toEqual({ month: 2, field: 'north' });
		(year.east[5] as Float32Array)[0] = Number.NEGATIVE_INFINITY;
		expect(firstNonFinite(year)).toEqual({ month: 2, field: 'north' });
		(year.east[1] as Float32Array)[3] = Number.NaN;
		expect(firstNonFinite(year)).toEqual({ month: 1, field: 'east' });
	});

	it('searches a result whose fields hold different numbers of months', () => {
		const year = calmYear();
		const short = { ...year, north: year.north.slice(0, MONTHS_PER_YEAR - 1) };
		expect(firstNonFinite(short)).toBeNull();
		(short.pressure[MONTHS_PER_YEAR - 1] as Float32Array)[0] = Number.NaN;
		expect(firstNonFinite(short)).toEqual({
			month: MONTHS_PER_YEAR - 1,
			field: 'pressure',
		});
	});
});

describe('workOutReport', () => {
	it('with no model solves nothing and shows the observed Earth', () => {
		const page = workOutReport({
			sources,
			models: [],
			now: () => {
				throw new Error('Nothing is timed without a model');
			},
			warn: noWarning,
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
				warn: noWarning,
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
			warn: noWarning,
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

	// This test solves two temperatures, the Earth's and the ocean world's,
	// at 64 cells per face edge (about a second each, but several under
	// coverage, hence the longer time allowed).
	it('notes each case a model gives a value that is not a finite number on, warns once for each in the cases’ order, and carries on with the times and the other models', () => {
		const warnings: string[] = [];
		// A made-up model that gives a value that is not a finite number in
		// the Earth's March pressure and the ocean world's January eastward
		// wind, and nowhere else.
		const faulty: WindModel = (world) => {
			const year = calmYear();
			if (world.origin.kind === 'earth') {
				(year.pressure[2] as Float32Array)[10] = Number.NaN;
			} else {
				(year.east[0] as Float32Array)[3] = Number.POSITIVE_INFINITY;
			}
			return year;
		};
		const page = workOutReport({
			sources,
			models: [
				{ name: 'Faulty', model: faulty },
				{ name: 'Calm', model: () => calmYear() },
			],
			now: steppingClock(),
			warn: (message) => warnings.push(message),
			cases: cases.filter(({ id }) => ['earth', 'ocean'].includes(id)),
			timingResolutions: [64],
		});
		// One warning for each case, in the cases' order.
		expect(warnings).toEqual([
			'The wind model Faulty gave a value that is not a finite number on the case The Earth; its maps and figures for it are left out. The sea-level pressure in March is the first value that is not a finite number.',
			'The wind model Faulty gave a value that is not a finite number on the case An ocean world; its maps and figures for it are left out. The eastward wind in January is the first value that is not a finite number.',
		]);
		const faultySection = page.slice(
			page.indexOf('<h2>Model: Faulty</h2>'),
			page.indexOf('<h2>Model: Calm</h2>'),
		);
		const calmSection = page.slice(page.indexOf('<h2>Model: Calm</h2>'));
		// The faulty model's cases are notes; its times are shown.
		expect(faultySection).toContain(
			'<strong>Not drawn:</strong> the model gave a value that is not a finite number on this case. The sea-level pressure in March is the first value that is not a finite number. Its maps, its figures against the observed Earth and its chart for this case are left out.',
		);
		expect(faultySection).toContain('<h3>Solve times on the Earth</h3>');
		expect(faultySection).toContain('<td class="number">0.250</td>');
		expect(faultySection).not.toContain(
			'<figcaption>Faulty, January: The Earth',
		);
		expect(faultySection).not.toContain('<td>The whole year</td>');
		expect(faultySection).toContain(
			'The eastward wind in January is the first value that is not a finite number. Its maps for this case are left out.',
		);
		expect(faultySection).not.toContain('<figcaption>Faulty, January');
		// The other model is shown in full.
		expect(calmSection).not.toContain('Not drawn');
		expect(calmSection).toContain(
			'<figcaption>Calm, January: The Earth</figcaption>',
		);
		expect(calmSection).toContain('<td>The whole year</td>');
		expect(calmSection).toContain(
			'<figcaption>Calm, January: An ocean world</figcaption>',
		);
	}, 60_000);
});
