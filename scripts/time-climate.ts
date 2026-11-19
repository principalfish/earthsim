/**
 * Measures how long the climate loop takes: the temperature, the winds and
 * the currents solved together, pass by pass.
 *
 * Run with `npm run time:climate`. It prints Markdown tables:
 *
 * - for the Earth preset at every resolution, from nothing: the passes it
 *   takes, the time of the first pass and of each later pass, and the time
 *   in all;
 * - the same carried on from the settled result, which is the case after an
 *   edit that changes little: the passes and the time;
 * - the currents' part of a pass: the gyres of the settled winds, on the
 *   grid the temperature is solved on, started from the settled currents'
 *   streamfunction, as a later pass solves them.
 *
 * One climate is solved first and not timed, so that the times do not
 * include the JavaScript engine's warming up. The output depends on the
 * machine only in its times.
 */

import { stdout } from 'node:process';
import {
	type ClimateStart,
	coarsenField,
	coarsenWorld,
	decodeEarth,
	earthWorld,
	SUPPORTED_RESOLUTIONS,
	solveClimate,
	solveGyres,
	solveResolution,
	TEMPERATURE_MODEL,
} from '../src/core/index';
import { readEarthDataFile } from './earth/dataFile.mjs';

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

const seconds = (value: number): string => value.toFixed(2);

/** The time of each pass of a climate, in seconds, and the climate. */
const passTimes = (
	world: ReturnType<typeof earthWorld>,
	start?: ClimateStart,
) => {
	const times: number[] = [];
	let last = performance.now();
	const result = solveClimate(world, {
		start,
		onPass: () => {
			const now = performance.now();
			times.push((now - last) / 1000);
			last = now;
		},
	});
	return { result, times };
};

export const main = (): void => {
	const data = decodeEarth(readEarthDataFile());
	say(
		`The model's loop: stops on a root-mean-square change of ${TEMPERATURE_MODEL.climateToleranceC} °C or after ${TEMPERATURE_MODEL.climateMaxPasses} passes.`,
	);
	say();
	const cold: string[][] = [];
	const warm: string[][] = [];
	const currents: string[][] = [];
	for (const resolution of SUPPORTED_RESOLUTIONS) {
		const world = earthWorld(data, resolution);
		if (resolution === SUPPORTED_RESOLUTIONS[0]) {
			solveClimate(world);
		}
		const first = passTimes(world);
		const later = first.times.slice(1);
		cold.push([
			String(resolution),
			String(first.result.passes),
			first.result.settled ? 'yes' : 'no',
			seconds(first.times[0] as number),
			later.length === 0
				? 'none'
				: seconds(later.reduce((a, b) => a + b, 0) / later.length),
			seconds(first.times.reduce((a, b) => a + b, 0)),
		]);
		const again = passTimes(world, first.result);
		warm.push([
			String(resolution),
			String(again.result.passes),
			seconds(again.times.reduce((a, b) => a + b, 0)),
		]);
		const solvedOn = solveResolution(resolution);
		const own = solvedOn === resolution;
		const onGrid = (field: Float32Array): Float32Array =>
			own ? field : Float32Array.from(coarsenField(field, resolution));
		const { winds } = again.result;
		const begun = performance.now();
		solveGyres(
			own ? world : coarsenWorld(world),
			{ east: winds.east.map(onGrid), north: winds.north.map(onGrid) },
			{ guess: again.result.currents.streamfunction },
		);
		currents.push([
			String(resolution),
			String(solvedOn),
			seconds((performance.now() - begun) / 1000),
		]);
	}
	say('## From nothing, on the Earth');
	say();
	table(
		[
			'Cells per face edge',
			'Passes',
			'Settled',
			'First pass (s)',
			'A later pass (s)',
			'In all (s)',
		],
		cold,
	);
	say('## Carried on from the settled result');
	say();
	table(['Cells per face edge', 'Passes', 'In all (s)'], warm);
	say("## The currents' part of a pass");
	say();
	table(['Cells per face edge', 'Solved on', 'Twelve months (s)'], currents);
};
