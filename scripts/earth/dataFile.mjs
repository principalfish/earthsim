/**
 * Reads the Earth data files from `public/data/`, for the tests that need
 * the real thing and for the scripts that run on the Earth.
 *
 * Plain JavaScript with its types declared beside it, so that the core's
 * tests can import it while the core is still type-checked without any of
 * Node's types.
 */

import { readFileSync } from 'node:fs';

const EARTH_DATA_FILE = new URL(
	'../../public/data/earth-256.bin',
	import.meta.url,
);

/** The bytes of the Earth data file, read afresh at each call. */
export const readEarthDataFile = () =>
	new Uint8Array(readFileSync(EARTH_DATA_FILE));

const OBSERVED_TEMPERATURE_FILE = new URL(
	'../../public/data/earth-temperature-1deg.bin',
	import.meta.url,
);

/** The bytes of the observed temperature file, read afresh at each call. */
export const readObservedTemperatureFile = () =>
	new Uint8Array(readFileSync(OBSERVED_TEMPERATURE_FILE));
