/**
 * Fetching an observed year of the Earth, such as its temperature, which
 * the page loads only when it is first chosen to compare the simulated
 * Earth with, and then keeps.
 */

import {
	decodeObservedTemperature,
	type MonthlyTemperature,
	type ObservedTemperature,
	observedTemperature,
	type Resolution,
} from '../core/index';
import type { EarthResponse } from './earthData';

/** Where the observed temperature file is, from the page's base address. */
export const OBSERVED_DATA_PATH = 'data/earth-temperature-1deg.bin';

/**
 * A file of an observed year, and how its contents are read and taken onto
 * a world's grid.
 *
 * @typeParam D - What the file holds once decoded.
 */
export type ObservedFile<D> = {
	/** What the file holds, as an error names it, such as `temperature`. */
	readonly name: string;
	/**
	 * Reads the file's bytes.
	 *
	 * @throws If they are not the file, as when their length is wrong.
	 */
	readonly decode: (bytes: Uint8Array) => D;
	/**
	 * Takes what the file holds onto a world's grid: twelve months, January
	 * to December, one value per cell.
	 */
	readonly onGrid: (data: D, resolution: Resolution) => MonthlyTemperature;
};

/**
 * The observed temperature file: twelve months of the near-surface air
 * temperature, in degrees Celsius.
 */
export const OBSERVED_TEMPERATURE_FILE: ObservedFile<ObservedTemperature> = {
	name: 'temperature',
	decode: decodeObservedTemperature,
	onGrid: observedTemperature,
};

/**
 * How long the fetch may take before it is given up, in milliseconds. The
 * file is under a megabyte, so only a connection that has stalled takes
 * longer.
 */
export const OBSERVED_FETCH_TIMEOUT_MS = 60_000;

/**
 * What an observed year's loader fetches with, from where, and what it
 * fetches.
 *
 * @typeParam D - What the file holds once decoded.
 */
export type ObservedLoaderOptions<D> = {
	/** Requests a file; rejects if no answer arrives. */
	readonly fetchFile: (url: string) => Promise<EarthResponse>;
	/** The address of the file. */
	readonly url: string;
	/** The file, and how it is read. */
	readonly file: ObservedFile<D>;
};

/**
 * Loads an observed year on a world's grid: twelve months, January to
 * December, one value per cell, such as the temperature in degrees
 * Celsius, which must be treated as read-only.
 */
export type ObservedLoader = (
	resolution: Resolution,
) => Promise<MonthlyTemperature>;

/**
 * Makes a function that loads an observed year once, and keeps it on each
 * grid it is asked for.
 *
 * @remarks
 * The first call fetches the file and decodes it, as the Earth's elevation
 * is loaded: every call after it, and every call made while the first is
 * still under way, shares that one fetch. The decoded file is kept, and so
 * is the year on each grid once it is worked out from it, on the page's
 * own thread, so a resolution asked for again gets the same arrays.
 *
 * A fetch that fails, an answer that is not the file and a body of the
 * wrong length all reject, and none of them is kept: the next call fetches
 * again.
 *
 * @param options - How to fetch the file, and its address.
 * @returns The loading function.
 */
export const createObservedLoader = <D>(
	options: ObservedLoaderOptions<D>,
): ObservedLoader => {
	const { file } = options;
	let pending: Promise<D> | null = null;
	const onGrid = new Map<Resolution, MonthlyTemperature>();

	const load = async (): Promise<D> => {
		const response = await options.fetchFile(options.url);
		if (!response.ok) {
			throw new Error(
				`The observed ${file.name} could not be fetched: the server answered ${response.status}`,
			);
		}
		return file.decode(new Uint8Array(await response.arrayBuffer()));
	};

	/** Stops keeping an attempt once it has failed. */
	const forgetIfFailed = async (attempt: Promise<D>): Promise<void> => {
		try {
			await attempt;
		} catch {
			if (pending === attempt) {
				pending = null;
			}
		}
	};

	return async (resolution) => {
		if (pending === null) {
			pending = load();
			// Waits on the attempt before the caller can, so that a caller
			// who sees it fail can already try again.
			void forgetIfFailed(pending);
		}
		const data = await pending;
		let months = onGrid.get(resolution);
		if (months === undefined) {
			months = file.onGrid(data, resolution);
			onGrid.set(resolution, months);
		}
		return months;
	};
};

/**
 * The Earth's observed temperature on a world's grid, fetched from beside
 * the page the first time it is asked for and kept in memory from then on.
 *
 * @remarks
 * The address is taken from the page's base, so the file is found when the
 * site is served from a folder as well as from the root of a host. A fetch
 * that has not finished after {@link OBSERVED_FETCH_TIMEOUT_MS} is given up.
 *
 * @param resolution - Cells along a face edge of the world's grid.
 * @returns A promise of the twelve months, which must be treated as
 * read-only. It rejects if the file cannot be fetched or is not the length
 * it should be; a later call then tries again.
 */
export const loadObservedTemperature: ObservedLoader = createObservedLoader({
	url: `${import.meta.env.BASE_URL}${OBSERVED_DATA_PATH}`,
	file: OBSERVED_TEMPERATURE_FILE,
	fetchFile: (url) =>
		fetch(url, { signal: AbortSignal.timeout(OBSERVED_FETCH_TIMEOUT_MS) }),
});
