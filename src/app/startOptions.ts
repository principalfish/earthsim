/**
 * The world the page opens on, optionally chosen by the page's address.
 *
 * A stand-in for choosing a world in the page itself: `?resolution=128`,
 * `?seed=7` and `?land=0.4` each override one default, and a value that is
 * missing or not valid falls back to its default.
 */

import {
	DEFAULT_RESOLUTION,
	isSeed,
	isSupportedResolution,
	type Resolution,
} from '../core/index';

/** What the starting world is generated from. */
export type StartOptions = {
	/** Cells along a face edge of the grid. */
	readonly resolution: Resolution;
	/** The seed that selects the continents. */
	readonly seed: number;
	/** Share of the surface to make land, 0 to 1. */
	readonly landFraction: number;
};

/** The starting world when the address asks for nothing else. */
export const DEFAULT_START_OPTIONS: StartOptions = {
	resolution: DEFAULT_RESOLUTION,
	seed: 1977,
	landFraction: 0.3,
};

/** The number a parameter holds, or NaN when it is absent or not a number. */
const numberParam = (params: URLSearchParams, name: string): number => {
	const text = params.get(name);
	return text === null || text.trim() === '' ? Number.NaN : Number(text);
};

/**
 * Reads the starting world's options from a query string.
 *
 * @param search - The query string of the page's address, with or without
 * its leading `?`.
 * @returns The options, each one from the query string when it is valid
 * there and from {@link DEFAULT_START_OPTIONS} otherwise.
 */
export const parseStartOptions = (search: string): StartOptions => {
	const params = new URLSearchParams(search);
	const resolution = numberParam(params, 'resolution');
	const seed = numberParam(params, 'seed');
	const land = numberParam(params, 'land');
	return {
		resolution: isSupportedResolution(resolution)
			? resolution
			: DEFAULT_START_OPTIONS.resolution,
		seed: isSeed(seed) ? seed : DEFAULT_START_OPTIONS.seed,
		landFraction:
			land >= 0 && land <= 1 ? land : DEFAULT_START_OPTIONS.landFraction,
	};
};
