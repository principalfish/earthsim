/**
 * Writes the Earth winds baseline afresh: the error figures of the Earth
 * preset's winds and sea-level pressure, as the models solve them now,
 * against the observed, into `src/core/baseline/earthWinds.json`.
 *
 * Run with `npm run baseline:winds` after a change that is meant to move
 * the figures, and commit the file with the change. The winds are worked
 * out from the temperature model's temperatures, so a change to that model
 * moves these figures too: run `npm run baseline:temperature` and this
 * both. It prints each figure that moved, from the file's value before to
 * its value now.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	type EarthWindFigures,
	earthWindFigures,
	WIND_BASELINE_RESOLUTION,
	windBaselineText,
} from '../src/core/baseline/earthWinds';
import {
	decodeEarth,
	decodeObservedPressure,
	decodeObservedWind,
	earthWorld,
	getGrid,
	observedPressure,
	observedWind,
	solveTemperature,
	solveWinds,
} from '../src/core/index';
import { writeBaseline } from './baselineUpdate';
import {
	readEarthDataFile,
	readObservedPressureFile,
	readObservedWindFile,
} from './earth/dataFile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the baseline is written. */
export const WIND_BASELINE_FILE = join(
	ROOT,
	'src',
	'core',
	'baseline',
	'earthWinds.json',
);

/**
 * The Earth preset's wind and pressure figures as the models solve them
 * now: its temperature solved, its winds worked out from that with the
 * wind model's default settings, both at
 * {@link WIND_BASELINE_RESOLUTION}, against the observed winds and
 * pressure on the same cells.
 *
 * @returns New figures, unrounded.
 */
export const earthWindFiguresNow = (): EarthWindFigures => {
	const world = earthWorld(
		decodeEarth(readEarthDataFile()),
		WIND_BASELINE_RESOLUTION,
	);
	const observed = {
		...observedWind(
			decodeObservedWind(readObservedWindFile()),
			WIND_BASELINE_RESOLUTION,
		),
		pressure: observedPressure(
			decodeObservedPressure(readObservedPressureFile()),
			WIND_BASELINE_RESOLUTION,
		),
	};
	return earthWindFigures(
		solveWinds(world, solveTemperature(world).months),
		observed,
		getGrid(WIND_BASELINE_RESOLUTION),
	);
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
	writeBaseline(WIND_BASELINE_FILE, windBaselineText(earthWindFiguresNow()));
};
