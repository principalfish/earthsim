/**
 * Fetching the Earth's elevation data, which the page loads only when an
 * Earth world is first asked for and then keeps.
 */

import { decodeEarth, type EarthData } from '../core/index';

/** Where the data file is, from the page's base address. */
export const EARTH_DATA_PATH = 'data/earth-256.bin';

/**
 * How long the fetch may take before it is given up, in milliseconds. The
 * file is under a megabyte, so only a connection that has stalled takes
 * longer.
 */
export const EARTH_FETCH_TIMEOUT_MS = 60_000;

/** A response to a request for the data file, as far as it is read. */
export type EarthResponse = {
	/** Whether the server answered with the file. */
	readonly ok: boolean;
	/** The HTTP status of the answer. */
	readonly status: number;
	/** The body of the answer. */
	arrayBuffer(): Promise<ArrayBuffer>;
};

/** What an Earth loader fetches with, and from where. */
export type EarthLoaderOptions = {
	/** Requests a file; rejects if no answer arrives. */
	readonly fetchFile: (url: string) => Promise<EarthResponse>;
	/** The address of the data file. */
	readonly url: string;
};

/**
 * Makes a function that loads the Earth data once and then keeps it.
 *
 * @remarks
 * The first call fetches the file and decodes it. Every call after it, and
 * every call made while the first is still under way, gets the same promise,
 * so the file is fetched once however often the Earth is asked for.
 *
 * A fetch that fails, an answer that is not the file and a body of the
 * wrong length all reject, and none of them is kept: the next call fetches
 * again.
 *
 * @param options - How to fetch the file, and its address.
 * @returns The loading function. Its promise resolves to the same data
 * every time, which must be treated as read-only.
 */
export const createEarthLoader = (
	options: EarthLoaderOptions,
): (() => Promise<EarthData>) => {
	let pending: Promise<EarthData> | null = null;

	const load = async (): Promise<EarthData> => {
		const response = await options.fetchFile(options.url);
		if (!response.ok) {
			throw new Error(
				`The Earth data could not be fetched: the server answered ${response.status}`,
			);
		}
		return decodeEarth(new Uint8Array(await response.arrayBuffer()));
	};

	/** Stops keeping an attempt once it has failed. */
	const forgetIfFailed = async (attempt: Promise<EarthData>): Promise<void> => {
		try {
			await attempt;
		} catch {
			if (pending === attempt) {
				pending = null;
			}
		}
	};

	return () => {
		if (pending === null) {
			pending = load();
			// Waits on the attempt before the caller can, so that a caller
			// who sees it fail can already try again.
			void forgetIfFailed(pending);
		}
		return pending;
	};
};

/**
 * The Earth's elevation, fetched from beside the page the first time it is
 * asked for and kept in memory from then on.
 *
 * @remarks
 * The address is taken from the page's base, so the file is found when the
 * site is served from a folder as well as from the root of a host. A fetch
 * that has not finished after {@link EARTH_FETCH_TIMEOUT_MS} is given up.
 *
 * @returns A promise of the data, which must be treated as read-only. It
 * rejects if the file cannot be fetched or is not the length it should be;
 * a later call then tries again.
 */
export const loadEarthData: () => Promise<EarthData> = createEarthLoader({
	url: `${import.meta.env.BASE_URL}${EARTH_DATA_PATH}`,
	fetchFile: (url) =>
		fetch(url, { signal: AbortSignal.timeout(EARTH_FETCH_TIMEOUT_MS) }),
});
