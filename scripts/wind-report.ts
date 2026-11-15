/**
 * Writes the wind report: one self-contained HTML page,
 * `reports/winds/index.html`, to open in a browser. It shows the observed
 * Earth's winds and sea-level pressure in January and July, the worlds the
 * wind models are run on, and each registered model's winds on them, its
 * error figures against the observed Earth, its solve times, and its
 * measures set beside what published studies report.
 *
 * Run with `npm run report:winds`. It prints the file's path, its size and
 * the time taken. The file is not committed.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { solveWinds } from '../src/core/index';
import {
	readEarthDataFile,
	readObservedPressureFile,
	readObservedWindFile,
} from './earth/dataFile.mjs';
import { type RegisteredModel, workOutReport } from './report/run';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIRECTORY = join(ROOT, 'reports', 'winds');
const REPORT_FILE = join(REPORT_DIRECTORY, 'index.html');

declare const performance: { now(): number };
declare const console: { warn(message: string): void };

/** The wind models the report runs, in the order it shows them. */
export const WIND_MODELS: readonly RegisteredModel[] = [
	{ name: 'Rules plus a pressure map', model: solveWinds },
];

/**
 * Works out the report and writes it.
 *
 * @param args - Not used; there are no options.
 */
export const main = (args: readonly string[]): void => {
	if (args.length > 0) {
		throw new Error(`Unknown option ${args.join(' ')}: there are no options`);
	}
	const began = performance.now();
	const page = workOutReport({
		sources: {
			earth: readEarthDataFile(),
			wind: readObservedWindFile(),
			pressure: readObservedPressureFile(),
		},
		models: WIND_MODELS,
		now: () => performance.now(),
		warn: (message) => console.warn(message),
	});
	const bytes = new TextEncoder().encode(page);
	mkdirSync(REPORT_DIRECTORY, { recursive: true });
	writeFileSync(REPORT_FILE, bytes);
	const seconds = (performance.now() - began) / 1000;
	stdout.write(
		`Wrote ${REPORT_FILE}: ${(bytes.length / 1024).toFixed(0)} KiB in ${seconds.toFixed(1)} s\n`,
	);
};
