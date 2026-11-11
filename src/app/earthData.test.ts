import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEarthDataFile } from '../../scripts/earth/dataFile.mjs';
import { decodeEarth, EARTH_DATA_BYTES, EARTH_DATA_CELLS } from '../core/index';
import {
	createEarthLoader,
	EARTH_DATA_PATH,
	EARTH_FETCH_TIMEOUT_MS,
	type EarthResponse,
	loadEarthData,
} from './earthData';

const URL_OF_DATA = '/somewhere/data/earth-256.bin';

/** A file of the right length whose first cell holds a known elevation. */
const goodBody = (first = 1234): ArrayBuffer => {
	const bytes = new Uint8Array(EARTH_DATA_BYTES);
	new DataView(bytes.buffer).setInt16(0, first, true);
	return bytes.buffer;
};

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

describe('createEarthLoader', () => {
	it('fetches the file from the address given and decodes it', async () => {
		const { urls, fetchFile } = fetchGiving(() => respond(goodBody(-321)));
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		expect(urls).toEqual([]);
		const data = await load();
		expect(urls).toEqual([URL_OF_DATA]);
		expect(data.resolution).toBe(256);
		expect(data.elevation.length).toBe(EARTH_DATA_CELLS);
		expect(data.elevation[0]).toBe(-321);
		expect(data.elevation[1]).toBe(0);
	});

	it('keeps the data, so the file is fetched once', async () => {
		const { urls, fetchFile } = fetchGiving(() => respond(goodBody()));
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		const first = await load();
		const second = await load();
		const third = await load();
		expect(urls).toHaveLength(1);
		expect(second).toBe(first);
		expect(third).toBe(first);
	});

	it('shares one fetch between calls made while it is under way', async () => {
		let answer: (response: EarthResponse) => void = () => {};
		const { urls, fetchFile } = fetchGiving(
			() =>
				new Promise((resolve) => {
					answer = resolve;
				}),
		);
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		const first = load();
		const second = load();
		expect(second).toBe(first);
		expect(urls).toHaveLength(1);
		answer(await respond(goodBody(77)));
		const [a, b] = await Promise.all([first, second]);
		expect(a).toBe(b);
		expect(a.elevation[0]).toBe(77);
		expect(urls).toHaveLength(1);
	});

	it('rejects when the server does not answer with the file, and tries again later', async () => {
		const { urls, fetchFile } = fetchGiving(
			() => respond(new ArrayBuffer(0), 404),
			() => respond(goodBody(5)),
		);
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		await expect(load()).rejects.toThrow(
			'The Earth data could not be fetched: the server answered 404',
		);
		expect((await load()).elevation[0]).toBe(5);
		expect(urls).toHaveLength(2);
		await load();
		expect(urls).toHaveLength(2);
	});

	it('does not read the body of an answer that is not the file', async () => {
		const { fetchFile } = fetchGiving(() =>
			Promise.resolve({
				ok: false,
				status: 500,
				arrayBuffer: () => {
					throw new Error('the body was read');
				},
			}),
		);
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		await expect(load()).rejects.toThrow('the server answered 500');
	});

	it('rejects when no answer arrives, and tries again later', async () => {
		const error = new TypeError('Failed to fetch');
		const { urls, fetchFile } = fetchGiving(
			() => Promise.reject(error),
			() => Promise.reject(error),
			() => respond(goodBody(9)),
		);
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		await expect(load()).rejects.toBe(error);
		await expect(load()).rejects.toBe(error);
		expect((await load()).elevation[0]).toBe(9);
		expect(urls).toHaveLength(3);
	});

	it('rejects when the fetch itself throws, and tries again later', async () => {
		const error = new Error('no network stack');
		const { urls, fetchFile } = fetchGiving(
			() => {
				throw error;
			},
			() => respond(goodBody(3)),
		);
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		const failed = load();
		await expect(failed).rejects.toBe(error);
		expect((await load()).elevation[0]).toBe(3);
		expect(urls).toHaveLength(2);
	});

	it('rejects a body of the wrong length, and tries again later', async () => {
		const { urls, fetchFile } = fetchGiving(
			() => respond(new ArrayBuffer(EARTH_DATA_BYTES - 1)),
			() => respond(new ArrayBuffer(EARTH_DATA_BYTES + 1)),
			// What a host that answers every address with its page sends.
			() => respond(new TextEncoder().encode('<!doctype html>').buffer),
			() => respond(goodBody(11)),
		);
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		await expect(load()).rejects.toThrow(RangeError);
		await expect(load()).rejects.toThrow(RangeError);
		await expect(load()).rejects.toThrow('got 15');
		expect((await load()).elevation[0]).toBe(11);
		expect(urls).toHaveLength(4);
	});

	it('rejects when the body cannot be read, and tries again later', async () => {
		const error = new Error('connection reset');
		const { urls, fetchFile } = fetchGiving(
			() =>
				Promise.resolve({
					ok: true,
					status: 200,
					arrayBuffer: () => Promise.reject(error),
				}),
			() => respond(goodBody(13)),
		);
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		await expect(load()).rejects.toBe(error);
		expect((await load()).elevation[0]).toBe(13);
		expect(urls).toHaveLength(2);
	});

	it('fails every call that shared a failed fetch, then fetches once more', async () => {
		let fail: (error: Error) => void = () => {};
		const { urls, fetchFile } = fetchGiving(
			() =>
				new Promise((_, reject) => {
					fail = reject;
				}),
			() => respond(goodBody(21)),
		);
		const load = createEarthLoader({ fetchFile, url: URL_OF_DATA });
		const first = load();
		const second = load();
		const error = new Error('offline');
		fail(error);
		await expect(first).rejects.toBe(error);
		await expect(second).rejects.toBe(error);
		const [a, b] = await Promise.all([load(), load()]);
		expect(a).toBe(b);
		expect(a.elevation[0]).toBe(21);
		expect(urls).toHaveLength(2);
	});

	it('keeps loaders apart', async () => {
		const one = fetchGiving(() => respond(goodBody(1)));
		const two = fetchGiving(() => respond(goodBody(2)));
		const loadOne = createEarthLoader({ ...one, url: 'one.bin' });
		const loadTwo = createEarthLoader({ ...two, url: 'two.bin' });
		expect((await loadOne()).elevation[0]).toBe(1);
		expect((await loadTwo()).elevation[0]).toBe(2);
		expect(one.urls).toEqual(['one.bin']);
		expect(two.urls).toEqual(['two.bin']);
	});
});

describe('loadEarthData', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetches the data file from beside the page, with a time limit, and keeps it', async () => {
		const file = readEarthDataFile();
		const requests: [unknown, RequestInit | undefined][] = [];
		vi.stubGlobal('fetch', (input: unknown, init?: RequestInit) => {
			requests.push([input, init]);
			return respond(file.buffer);
		});

		const data = await loadEarthData();
		expect(requests).toHaveLength(1);
		const [input, init] = requests[0] as [unknown, RequestInit | undefined];
		expect(EARTH_DATA_PATH).toBe('data/earth-256.bin');
		expect(input).toBe(`${import.meta.env.BASE_URL}data/earth-256.bin`);
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		expect(init?.signal?.aborted).toBe(false);
		expect(EARTH_FETCH_TIMEOUT_MS).toBe(60_000);

		expect(data.elevation).toEqual(decodeEarth(file).elevation);
		expect(await loadEarthData()).toBe(data);
		expect(requests).toHaveLength(1);
	});
});
