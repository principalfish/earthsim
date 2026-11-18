import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	readObservedPressureFile,
	readObservedTemperatureFile,
	readObservedWindFile,
} from '../../../scripts/earth/dataFile.mjs';
import {
	decodeObservedPressure,
	decodeObservedTemperature,
	decodeObservedWind,
	getGrid,
	OBSERVED_BYTES,
	OBSERVED_PRESSURE_BYTES,
	OBSERVED_WIND_BYTES,
	observedPressure,
	observedTemperature,
	observedWind,
} from '../../core/index';
import type { EarthResponse } from './earthData';
import {
	createObservedLoader,
	loadObservedPressure,
	loadObservedTemperature,
	loadObservedWinds,
	OBSERVED_DATA_PATH,
	OBSERVED_FETCH_TIMEOUT_MS,
	OBSERVED_PRESSURE_FILE,
	OBSERVED_PRESSURE_PATH,
	OBSERVED_TEMPERATURE_FILE,
	OBSERVED_WIND_FILE,
	OBSERVED_WIND_PATH,
} from './observedData';

const URL_OF_DATA = '/somewhere/data/earth-temperature-1deg.bin';

/**
 * A file of the right length, every value the same stored byte: 200 stands
 * for 20 °C.
 */
const goodBody = (stored = 200): ArrayBuffer =>
	new Uint8Array(OBSERVED_BYTES).fill(stored).buffer;

const respond = (body: ArrayBuffer, status = 200): Promise<EarthResponse> =>
	Promise.resolve({
		ok: status >= 200 && status < 300,
		status,
		arrayBuffer: () => Promise.resolve(body),
	});

/** A fetch that answers each request with the next of the answers given. */
const fetchGiving = (
	...answers: (() => Promise<EarthResponse>)[]
): {
	readonly urls: string[];
	fetchFile(url: string): Promise<EarthResponse>;
} => {
	const urls: string[] = [];
	return {
		urls,
		fetchFile: (url) => {
			const answer = answers[urls.length];
			urls.push(url);
			if (answer === undefined) {
				throw new Error('no further request was expected');
			}
			return answer();
		},
	};
};

describe('createObservedLoader', () => {
	it('fetches the file, decodes it and gives it on the grid asked for', async () => {
		const { urls, fetchFile } = fetchGiving(() => respond(goodBody(200)));
		const load = createObservedLoader({
			fetchFile,
			url: URL_OF_DATA,
			file: OBSERVED_TEMPERATURE_FILE,
		});
		expect(urls).toEqual([]);
		const months = await load(64);
		expect(urls).toEqual([URL_OF_DATA]);
		expect(months).toHaveLength(12);
		for (const month of months) {
			expect(month).toHaveLength(getGrid(64).cellCount);
			expect(month.every((value) => value === 20)).toBe(true);
		}
	});

	it('keeps the file and each grid, fetching once for every resolution', async () => {
		const { urls, fetchFile } = fetchGiving(() => respond(goodBody()));
		const load = createObservedLoader({
			fetchFile,
			url: URL_OF_DATA,
			file: OBSERVED_TEMPERATURE_FILE,
		});
		const first = await load(64);
		expect(await load(64)).toBe(first);
		const finer = await load(128);
		expect(finer[0]).toHaveLength(getGrid(128).cellCount);
		expect(await load(128)).toBe(finer);
		expect(await load(64)).toBe(first);
		expect(urls).toHaveLength(1);
	});

	it('shares one fetch between calls made while it is under way', async () => {
		let answer: (response: EarthResponse) => void = () => {};
		const { urls, fetchFile } = fetchGiving(
			() =>
				new Promise((resolve) => {
					answer = resolve;
				}),
		);
		const load = createObservedLoader({
			fetchFile,
			url: URL_OF_DATA,
			file: OBSERVED_TEMPERATURE_FILE,
		});
		const first = load(64);
		const second = load(64);
		const finer = load(128);
		expect(urls).toHaveLength(1);
		answer(await respond(goodBody()));
		const [a, b, c] = await Promise.all([first, second, finer]);
		expect(a).toBe(b);
		expect(c[0]).toHaveLength(getGrid(128).cellCount);
		expect(urls).toHaveLength(1);
	});

	it('rejects when the server does not answer with the file, and tries again later', async () => {
		const { urls, fetchFile } = fetchGiving(
			() => respond(new ArrayBuffer(0), 404),
			() => respond(goodBody()),
		);
		const load = createObservedLoader({
			fetchFile,
			url: URL_OF_DATA,
			file: OBSERVED_TEMPERATURE_FILE,
		});
		await expect(load(64)).rejects.toThrow(
			'The observed temperature could not be fetched: the server answered 404',
		);
		expect(await load(64)).toHaveLength(12);
		expect(urls).toHaveLength(2);
	});

	it('rejects a body of the wrong length, and tries again later', async () => {
		const { urls, fetchFile } = fetchGiving(
			() => respond(new ArrayBuffer(OBSERVED_BYTES - 1)),
			// What a host that answers every address with its page sends.
			() => respond(new TextEncoder().encode('<!doctype html>').buffer),
			() => respond(goodBody()),
		);
		const load = createObservedLoader({
			fetchFile,
			url: URL_OF_DATA,
			file: OBSERVED_TEMPERATURE_FILE,
		});
		await expect(load(64)).rejects.toThrow(RangeError);
		await expect(load(64)).rejects.toThrow('got 15');
		expect(await load(64)).toHaveLength(12);
		expect(urls).toHaveLength(3);
	});

	it('rejects when the fetch fails, and tries again later', async () => {
		const error = new TypeError('Failed to fetch');
		const { urls, fetchFile } = fetchGiving(
			() => Promise.reject(error),
			() => respond(goodBody()),
		);
		const load = createObservedLoader({
			fetchFile,
			url: URL_OF_DATA,
			file: OBSERVED_TEMPERATURE_FILE,
		});
		await expect(load(64)).rejects.toBe(error);
		expect(await load(64)).toHaveLength(12);
		expect(urls).toHaveLength(2);
	});

	it('rejects when the fetch times out, and tries again later', async () => {
		const timeout = new DOMException(
			'The operation timed out.',
			'TimeoutError',
		);
		const { urls, fetchFile } = fetchGiving(
			() => Promise.reject(timeout),
			() => respond(goodBody()),
		);
		const load = createObservedLoader({
			fetchFile,
			url: URL_OF_DATA,
			file: OBSERVED_TEMPERATURE_FILE,
		});
		await expect(load(64)).rejects.toBe(timeout);
		expect(await load(64)).toHaveLength(12);
		expect(urls).toHaveLength(2);
	});

	it('fails every call that shared a failed fetch, then fetches once more', async () => {
		let fail: (error: Error) => void = () => {};
		const { urls, fetchFile } = fetchGiving(
			() =>
				new Promise((_, reject) => {
					fail = reject;
				}),
			() => respond(goodBody()),
		);
		const load = createObservedLoader({
			fetchFile,
			url: URL_OF_DATA,
			file: OBSERVED_TEMPERATURE_FILE,
		});
		const first = load(64);
		const second = load(128);
		const error = new Error('offline');
		fail(error);
		await expect(first).rejects.toBe(error);
		await expect(second).rejects.toBe(error);
		const [a, b] = await Promise.all([load(64), load(64)]);
		expect(a).toBe(b);
		expect(urls).toHaveLength(2);
	});
});

describe('loadObservedTemperature', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetches the file from beside the page, with a time limit, and keeps it', async () => {
		const file = readObservedTemperatureFile();
		const requests: [unknown, RequestInit | undefined][] = [];
		vi.stubGlobal('fetch', (input: unknown, init?: RequestInit) => {
			requests.push([input, init]);
			return respond(file.buffer);
		});

		const months = await loadObservedTemperature(64);
		expect(requests).toHaveLength(1);
		const [input, init] = requests[0] as [unknown, RequestInit | undefined];
		expect(OBSERVED_DATA_PATH).toBe('data/earth-temperature-1deg.bin');
		expect(input).toBe(
			`${import.meta.env.BASE_URL}data/earth-temperature-1deg.bin`,
		);
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		expect(init?.signal?.aborted).toBe(false);
		expect(OBSERVED_FETCH_TIMEOUT_MS).toBe(60_000);

		expect(months).toEqual(
			observedTemperature(decodeObservedTemperature(file), 64),
		);
		expect(await loadObservedTemperature(64)).toBe(months);
		expect(requests).toHaveLength(1);
	});
});

describe('the observed pressure and winds files', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('read the pressure and the winds as the core reads them, onto the grid asked for', () => {
		const pressure = readObservedPressureFile();
		const wind = readObservedWindFile();
		expect(OBSERVED_PRESSURE_FILE.name).toBe('pressure');
		expect(OBSERVED_WIND_FILE.name).toBe('wind');
		expect(
			OBSERVED_PRESSURE_FILE.onGrid(
				OBSERVED_PRESSURE_FILE.decode(pressure),
				64,
			),
		).toEqual(observedPressure(decodeObservedPressure(pressure), 64));
		expect(
			OBSERVED_WIND_FILE.onGrid(OBSERVED_WIND_FILE.decode(wind), 64),
		).toEqual(observedWind(decodeObservedWind(wind), 64));
		expect(() =>
			OBSERVED_PRESSURE_FILE.decode(
				new Uint8Array(OBSERVED_PRESSURE_BYTES - 1),
			),
		).toThrow(RangeError);
		expect(() =>
			OBSERVED_WIND_FILE.decode(new Uint8Array(OBSERVED_WIND_BYTES - 1)),
		).toThrow(RangeError);
	});

	it('gives the winds on a grid through the general loader, and names them when the fetch fails', async () => {
		const wind = readObservedWindFile();
		const { urls, fetchFile } = fetchGiving(
			() => respond(new ArrayBuffer(0), 404),
			() => respond(wind.buffer as ArrayBuffer),
		);
		const load = createObservedLoader({
			fetchFile,
			url: '/somewhere/data/earth-wind-1deg.bin',
			file: OBSERVED_WIND_FILE,
		});
		await expect(load(64)).rejects.toThrow(
			'The observed wind could not be fetched: the server answered 404',
		);
		const winds = await load(64);
		expect(winds).toEqual(observedWind(decodeObservedWind(wind), 64));
		expect(winds.east).toHaveLength(12);
		expect(winds.east[0]).toHaveLength(getGrid(64).cellCount);
		expect(await load(64)).toBe(winds);
		expect(urls).toHaveLength(2);
	});

	it.each([
		[
			'pressure',
			() => loadObservedPressure(64),
			OBSERVED_PRESSURE_PATH,
			'data/earth-pressure-1deg.bin',
			readObservedPressureFile,
			(bytes: Uint8Array) =>
				observedPressure(decodeObservedPressure(bytes), 64),
		],
		[
			'winds',
			() => loadObservedWinds(64),
			OBSERVED_WIND_PATH,
			'data/earth-wind-1deg.bin',
			readObservedWindFile,
			(bytes: Uint8Array) => observedWind(decodeObservedWind(bytes), 64),
		],
	] as const)(
		'fetches the observed %s from beside the page, with a time limit, and keeps it',
		async (_name, load, path, expectedPath, read, onGrid) => {
			const file = read();
			const requests: [unknown, RequestInit | undefined][] = [];
			vi.stubGlobal('fetch', (input: unknown, init?: RequestInit) => {
				requests.push([input, init]);
				return respond(file.buffer as ArrayBuffer);
			});
			const loaded = await load();
			expect(path).toBe(expectedPath);
			expect(requests).toHaveLength(1);
			const [input, init] = requests[0] as [unknown, RequestInit | undefined];
			expect(input).toBe(`${import.meta.env.BASE_URL}${expectedPath}`);
			expect(init?.signal).toBeInstanceOf(AbortSignal);
			expect(loaded).toEqual(onGrid(file));
			expect(await load()).toBe(loaded);
			expect(requests).toHaveLength(1);
		},
	);
});
