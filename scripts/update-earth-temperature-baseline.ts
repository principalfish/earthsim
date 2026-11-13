/**
 * Writes the Earth temperature baseline afresh: the error figures of the
 * Earth preset, as the model solves it now, against the observed
 * temperature, into `src/core/baseline/earthTemperature.json`.
 *
 * Run with `npm run baseline:temperature` after a change that is meant to
 * move the figures, and commit the file with the change. It prints each
 * figure that moved, from the file's value before to its value now.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
	BASELINE_RESOLUTION,
	baselineText,
	type EarthTemperatureFigures,
	earthTemperatureFigures,
} from '../src/core/baseline/earthTemperature';
import {
	decodeEarth,
	decodeObservedTemperature,
	earthWorld,
	getGrid,
	observedTemperature,
	solveTemperature,
} from '../src/core/index';
import {
	readEarthDataFile,
	readObservedTemperatureFile,
} from './earth/dataFile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = join(
	ROOT,
	'src',
	'core',
	'baseline',
	'earthTemperature.json',
);

/**
 * The figures of a baseline text as name and value, in the file's order.
 *
 * @param text - The baseline, as JSON.
 * @returns Each number in it, under its path: the keys that lead to it
 * joined by dots, an array's elements keyed by their index. Anything that
 * is not a number, an object or an array is left out.
 */
export const flatten = (text: string): Map<string, number> => {
	const figures = new Map<string, number>();
	const walk = (value: unknown, path: string): void => {
		if (typeof value === 'number') {
			figures.set(path, value);
		} else if (typeof value === 'object' && value !== null) {
			for (const [key, inner] of Object.entries(value)) {
				walk(inner, path === '' ? key : `${path}.${key}`);
			}
		}
	};
	walk(JSON.parse(text), '');
	return figures;
};

/** The baseline as it was, or null if there is none to read. */
const previousText = (): string | null => {
	try {
		return new TextDecoder().decode(readFileSync(BASELINE_FILE));
	} catch {
		return null;
	}
};

/**
 * Solves the Earth preset and writes its figures to the baseline file.
 *
 * @param args - Not used; there are no options.
 */
export const main = (args: readonly string[]): void => {
	if (args.length > 0) {
		throw new Error(`Unknown option ${args.join(' ')}: there are no options`);
	}
	const world = earthWorld(
		decodeEarth(readEarthDataFile()),
		BASELINE_RESOLUTION,
	);
	const observed = observedTemperature(
		decodeObservedTemperature(readObservedTemperatureFile()),
		BASELINE_RESOLUTION,
	);
	const figures: EarthTemperatureFigures = earthTemperatureFigures(
		solveTemperature(world).months,
		observed,
		getGrid(BASELINE_RESOLUTION),
	);
	const text = baselineText(figures);
	const before = previousText();
	writeFileSync(BASELINE_FILE, new TextEncoder().encode(text));

	const now = flatten(text);
	const was = before === null ? new Map<string, number>() : flatten(before);
	const moved = [...now].filter(([name, value]) => was.get(name) !== value);
	if (moved.length === 0) {
		stdout.write('The baseline is unchanged.\n');
		return;
	}
	for (const [name, value] of moved) {
		stdout.write(`${name}: ${was.get(name) ?? 'none'} -> ${value}\n`);
	}
	stdout.write(`Wrote ${BASELINE_FILE}\n`);
};
