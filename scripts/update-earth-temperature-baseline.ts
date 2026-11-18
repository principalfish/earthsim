/**
 * Writes the Earth temperature baseline afresh: the error figures of the
 * Earth preset, as the climate loop solves it now, against the observed
 * temperature, and its west–east coast contrasts, into
 * `src/core/temperature/baseline/earthTemperature.json`.
 *
 * Run with `npm run baseline:temperature` after a change that is meant to
 * move the figures, and commit the file with the change. It prints each
 * figure that moved, from the file's value before to its value now.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	decodeEarth,
	decodeObservedTemperature,
	earthWorld,
	getGrid,
	observedTemperature,
	solveClimate,
} from '../src/core/index';
import {
	BASELINE_RESOLUTION,
	baselineText,
	type EarthTemperatureFigures,
	earthTemperatureFigures,
} from '../src/core/temperature/baseline/earthTemperature';
import { writeBaseline } from './baselineUpdate';
import {
	readEarthDataFile,
	readObservedTemperatureFile,
} from './earth/dataFile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = join(
	ROOT,
	'src',
	'core',
	'temperature',
	'baseline',
	'earthTemperature.json',
);

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
		solveClimate(world).temperature.months,
		observed,
		getGrid(BASELINE_RESOLUTION),
		world,
	);
	writeBaseline(BASELINE_FILE, baselineText(figures));
};
