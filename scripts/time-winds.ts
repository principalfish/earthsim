/**
 * Measures how long the wind model takes, and how far its solve for a
 * finer world, the pressure worked out on the 64 grid and carried back to
 * the world's grid and the winds worked out there, lies from a solve
 * wholly on the world's own grid.
 *
 * Run with `npm run time:winds`. It prints Markdown tables:
 *
 * - a year's solve times for the Earth preset at every resolution, as
 *   `solveWinds` solves it by default (the pressure on the 64 grid) and,
 *   above 64, wholly on the world's own grid beside it, each given the
 *   temperatures the page's temperature solve gives;
 * - above 64 cells per face edge, how far the default solve lies from the
 *   one wholly on the world's own grid: the area-weighted root-mean-square of the
 *   difference over every cell and month, of the wind as vectors and of the
 *   pressure, and the largest in any cell and month.
 *
 * One solve is run first and not timed, so that the times do not include
 * the JavaScript engine's warming up. Each time of the default solve is
 * the median of {@link REPEATS} runs; each wholly on a finer world's own
 * grid is of one. The output depends on the machine only in its times.
 */

import { stdout } from 'node:process';
import {
	decodeEarth,
	earthWorld,
	getGrid,
	MONTHS_PER_YEAR,
	type Resolution,
	SUPPORTED_RESOLUTIONS,
	solveTemperature,
	solveWinds,
	WIND_SOLVE_RESOLUTION,
	type WindResult,
	type World,
} from '../src/core/index';
import { readEarthDataFile } from './earth/dataFile.mjs';

/** The runs each default solve is timed over, the median taken. */
const REPEATS = 5;

declare const performance: { now(): number };

const say = (text = ''): void => {
	stdout.write(`${text}\n`);
};

/** A Markdown table, with the minimal separator line. */
const table = (
	header: readonly string[],
	rows: readonly (readonly string[])[],
): void => {
	say(`| ${header.join(' | ')} |`);
	say(`|${header.map(() => '-').join('|')}|`);
	for (const row of rows) {
		say(`| ${row.join(' | ')} |`);
	}
	say();
};

const fixed = (value: number, digits = 1): string => value.toFixed(digits);

/** A solve of a year's winds and how long it took, in seconds. */
const timed = (
	world: World,
	temperatures: readonly Float32Array[],
	full: boolean,
): { readonly result: WindResult; readonly seconds: number } => {
	const began = performance.now();
	const result = solveWinds(
		world,
		temperatures,
		full ? { fullResolution: true } : {},
	);
	return { result, seconds: (performance.now() - began) / 1000 };
};

/** The median of some numbers. */
const median = (values: readonly number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? (sorted[middle] as number)
		: ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};

/** How far one year of winds lies from another on the same grid. */
type Difference = {
	/** Area-weighted RMS of the wind's difference as vectors, m/s. */
	readonly windRms: number;
	/** The largest such difference in any cell and month, m/s. */
	readonly windLargest: number;
	/** Area-weighted RMS of the pressure's difference, hPa. */
	readonly pressureRms: number;
	/** The largest such difference in any cell and month, hPa. */
	readonly pressureLargest: number;
};

const differenceOf = (
	a: WindResult,
	b: WindResult,
	resolution: Resolution,
): Difference => {
	const { areas, cellCount } = getGrid(resolution);
	let area = 0;
	let windSquares = 0;
	let pressureSquares = 0;
	let windLargest = 0;
	let pressureLargest = 0;
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const aEast = a.east[month] as Float32Array;
		const aNorth = a.north[month] as Float32Array;
		const aPressure = a.pressure[month] as Float32Array;
		const bEast = b.east[month] as Float32Array;
		const bNorth = b.north[month] as Float32Array;
		const bPressure = b.pressure[month] as Float32Array;
		for (let cell = 0; cell < cellCount; cell++) {
			const weight = areas[cell] as number;
			const wind = Math.hypot(
				(aEast[cell] as number) - (bEast[cell] as number),
				(aNorth[cell] as number) - (bNorth[cell] as number),
			);
			const pressure = Math.abs(
				(aPressure[cell] as number) - (bPressure[cell] as number),
			);
			area += weight;
			windSquares += weight * wind * wind;
			pressureSquares += weight * pressure * pressure;
			windLargest = Math.max(windLargest, wind);
			pressureLargest = Math.max(pressureLargest, pressure);
		}
	}
	return {
		windRms: Math.sqrt(windSquares / area),
		windLargest,
		pressureRms: Math.sqrt(pressureSquares / area),
		pressureLargest,
	};
};

export const main = (args: readonly string[]): void => {
	if (args.length > 0) {
		throw new Error(`Unknown option ${args.join(' ')}: there are no options`);
	}
	const earth = decodeEarth(readEarthDataFile());

	const timings: string[][] = [];
	const differences: string[][] = [];
	for (const resolution of SUPPORTED_RESOLUTIONS) {
		const world = earthWorld(earth, resolution);
		const temperatures = solveTemperature(world).months;
		if (resolution === SUPPORTED_RESOLUTIONS[0]) {
			// Warm-up, not timed.
			solveWinds(world, temperatures);
		}
		const runs = Array.from({ length: REPEATS }, () =>
			timed(world, temperatures, false),
		);
		const solved = runs[0] as (typeof runs)[number];
		timings.push([
			String(resolution),
			String(WIND_SOLVE_RESOLUTION),
			fixed(median(runs.map(({ seconds }) => seconds)), 2),
		]);
		if (resolution === WIND_SOLVE_RESOLUTION) {
			continue;
		}
		const full = timed(world, temperatures, true);
		timings.push([
			String(resolution),
			String(resolution),
			fixed(full.seconds, 2),
		]);
		const difference = differenceOf(solved.result, full.result, resolution);
		differences.push([
			String(resolution),
			fixed(difference.windRms, 2),
			fixed(difference.windLargest, 1),
			fixed(difference.pressureRms, 2),
			fixed(difference.pressureLargest, 1),
		]);
	}

	say('## Solve times');
	say();
	say(
		`A year of the Earth’s winds, given the temperatures the page’s temperature solve gives, solved as \`solveWinds\` solves it by default, the pressure on the ${WIND_SOLVE_RESOLUTION} grid whatever the world’s own and the winds from it on the world’s grid, and above ${WIND_SOLVE_RESOLUTION} wholly on the world’s own grid as well, for comparison: \`solveWinds(world, months, { fullResolution: true })\`. Each time of the default solve is the median of ${REPEATS} runs.`,
	);
	say();
	table(['Cells per face edge', 'Pressure solved on', 'Seconds'], timings);

	say(`## The ${WIND_SOLVE_RESOLUTION} grid against the world’s own`);
	say();
	say(
		`How far the default solve, its pressure carried back to the world’s grid and its winds worked out there, lies from the solve wholly on the world’s own grid, over every cell and month of the year: the area-weighted root-mean-square difference of the wind as vectors and of the pressure, and the largest in any cell and month.`,
	);
	say();
	table(
		[
			'Cells per face edge',
			'Wind RMS, m/s',
			'Wind largest, m/s',
			'Pressure RMS, hPa',
			'Pressure largest, hPa',
		],
		differences,
	);
};
