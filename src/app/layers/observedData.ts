/**
 * Fetching an observed year of the Earth, such as its temperature, its
 * sea-level pressure or its winds, which the page loads only when it is
 * first chosen to compare the simulated Earth with, and then keeps.
 */

import {
	decodeObservedPressure,
	decodeObservedTemperature,
	decodeObservedWind,
	type MonthlyTemperature,
	type MonthlyWind,
	type ObservedPressure,
	type ObservedTemperature,
	type ObservedWind,
	observedPressure,
	observedTemperature,
	observedWind,
	type Resolution,
} from '../../core/index';
import type { EarthResponse } from './earthData';

/** Where the observed temperature file is, from the page's base address. */
export const OBSERVED_DATA_PATH = 'data/earth-temperature-1deg.bin';

/** Where the observed sea-level pressure file is, from the page's base address. */
export const OBSERVED_PRESSURE_PATH = 'data/earth-pressure-1deg.bin';

/** Where the observed winds file is, from the page's base address. */
export const OBSERVED_WIND_PATH = 'data/earth-wind-1deg.bin';

/**
 * A file of an observed year, and how its contents are read and taken onto
 * a world's grid.
 *
 * @typeParam D - What the file holds once decoded.
 * @typeParam G - What it gives on a world's grid: twelve fields of one
 * value per cell unless said otherwise.
 */
export type ObservedFile<D, G = MonthlyTemperature> = {
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
	 * to December, of one value per cell, or of what `G` holds for each.
	 */
	readonly onGrid: (data: D, resolution: Resolution) => G;
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
 * The observed sea-level pressure file: twelve months of the air pressure
 * reduced to sea level, in hectopascals.
 */
export const OBSERVED_PRESSURE_FILE: ObservedFile<ObservedPressure> = {
	name: 'pressure',
	decode: decodeObservedPressure,
	onGrid: observedPressure,
};

/**
 * The observed winds file: twelve months of the eastward and northward
 * wind ten metres up, in metres a second.
 */
export const OBSERVED_WIND_FILE: ObservedFile<ObservedWind, MonthlyWind> = {
	name: 'wind',
	decode: decodeObservedWind,
	onGrid: observedWind,
};

/**
 * How long a fetch may take before it is given up, in milliseconds. The
 * largest file, the winds', is under two megabytes, so only a connection
 * that has stalled takes longer.
 */
export const OBSERVED_FETCH_TIMEOUT_MS = 60_000;

/**
 * What an observed year's loader fetches with, from where, and what it
 * fetches.
 *
 * @typeParam D - What the file holds once decoded.
 * @typeParam G - What it gives on a world's grid.
 */
export type ObservedLoaderOptions<D, G = MonthlyTemperature> = {
	/** Requests a file; rejects if no answer arrives. */
	readonly fetchFile: (url: string) => Promise<EarthResponse>;
	/** The address of the file. */
	readonly url: string;
	/** The file, and how it is read. */
	readonly file: ObservedFile<D, G>;
};

/**
 * Loads an observed year on a world's grid: twelve months, January to
 * December, one value per cell, such as the temperature in degrees
 * Celsius, or, for another `G`, what that holds, such as the winds' two
 * components; either must be treated as read-only.
 *
 * @typeParam G - What it gives on a world's grid.
 */
export type ObservedLoader<G = MonthlyTemperature> = (
	resolution: Resolution,
) => Promise<G>;

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
export const createObservedLoader = <D, G = MonthlyTemperature>(
	options: ObservedLoaderOptions<D, G>,
): ObservedLoader<G> => {
	const { file } = options;
	let pending: Promise<D> | null = null;
	const onGrid = new Map<Resolution, G>();

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

/**
 * The Earth's observed sea-level pressure on a world's grid, in
 * hectopascals, fetched and kept as {@link loadObservedTemperature} fetches
 * and keeps the temperature, from {@link OBSERVED_PRESSURE_PATH}.
 *
 * @param resolution - Cells along a face edge of the world's grid.
 * @returns A promise of the twelve months, which must be treated as
 * read-only; it rejects as the temperature's does.
 */
export const loadObservedPressure: ObservedLoader = createObservedLoader({
	url: `${import.meta.env.BASE_URL}${OBSERVED_PRESSURE_PATH}`,
	file: OBSERVED_PRESSURE_FILE,
	fetchFile: (url) =>
		fetch(url, { signal: AbortSignal.timeout(OBSERVED_FETCH_TIMEOUT_MS) }),
});

/**
 * The Earth's observed winds on a world's grid, in metres a second,
 * fetched and kept as {@link loadObservedTemperature} fetches and keeps the
 * temperature, from {@link OBSERVED_WIND_PATH}.
 *
 * @param resolution - Cells along a face edge of the world's grid.
 * @returns A promise of the twelve months of each component, which must be
 * treated as read-only; it rejects as the temperature's does.
 */
export const loadObservedWinds: ObservedLoader<MonthlyWind> =
	createObservedLoader({
		url: `${import.meta.env.BASE_URL}${OBSERVED_WIND_PATH}`,
		file: OBSERVED_WIND_FILE,
		fetchFile: (url) =>
			fetch(url, { signal: AbortSignal.timeout(OBSERVED_FETCH_TIMEOUT_MS) }),
	});
