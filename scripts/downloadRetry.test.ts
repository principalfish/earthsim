import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	downloadWithRetry,
	ensureDownloaded,
	type RetryOptions,
	retryAfterMs,
	writeFileWhole,
} from './downloadRetry';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const URL = 'https://example.org/subset.nc';

/** What a test learns of how a body was read. */
type Reading = { chunksRead: number; cancelled: boolean };

/**
 * A response as far as a download reads one, whose body arrives in chunks
 * of `chunkBytes`.
 */
const respond = (
	status: number,
	body: Uint8Array = new Uint8Array(0),
	headers: Record<string, string> = {},
	chunkBytes = 1000,
	reading: Reading = { chunksRead: 0, cancelled: false },
): ScriptResponse => {
	let next = 0;
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (name) => headers[name.toLowerCase()] ?? null },
		body: {
			cancel: () => Promise.resolve(),
			getReader: () => ({
				read: () => {
					if (next >= body.length) {
						return Promise.resolve({ done: true });
					}
					const value = body.slice(next, next + chunkBytes);
					next += chunkBytes;
					reading.chunksRead++;
					return Promise.resolve({ done: false, value });
				},
				cancel: () => {
					reading.cancelled = true;
					return Promise.resolve();
				},
			}),
		},
	};
};

/**
 * A response whose body, and the body's reader, fail when cancelled, with
 * `reading.cancelled` set when a cancel was asked for.
 */
const cancelRejects = (
	response: ScriptResponse,
	reading: Reading,
): ScriptResponse => {
	const { body } = response;
	if (body === null) {
		return response;
	}
	const refuse = (): Promise<void> => {
		reading.cancelled = true;
		return Promise.reject(new Error('the connection was already closed'));
	};
	return {
		...response,
		body: {
			cancel: refuse,
			getReader: () => ({ ...body.getReader(), cancel: refuse }),
		},
	};
};

/** Options whose requests are answered in turn, and that record what they wait and say. */
const scripted = (
	answers: (ScriptResponse | Error)[],
	overrides: Partial<RetryOptions> = {},
) => {
	const waits: number[] = [];
	const lines: string[] = [];
	const urls: string[] = [];
	const options: RetryOptions = {
		attempts: 4,
		firstDelayMs: 1000,
		maxBytes: 1000,
		fetchFile: (url) => {
			urls.push(url);
			const answer = answers.shift();
			if (answer === undefined) {
				throw new Error('No answer left');
			}
			return answer instanceof Error
				? Promise.reject(answer)
				: Promise.resolve(answer);
		},
		sleep: (ms) => {
			waits.push(ms);
			return Promise.resolve();
		},
		say: (line) => lines.push(line),
		...overrides,
	};
	return { options, waits, lines, urls };
};

describe('retryAfterMs', () => {
	it('reads a number of seconds, and nothing else', () => {
		expect(retryAfterMs('12')).toBe(12_000);
		expect(retryAfterMs(' 3 ')).toBe(3000);
		expect(retryAfterMs(null)).toBeNull();
		expect(retryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
		expect(retryAfterMs('-5')).toBeNull();
	});
});

describe('downloadWithRetry', () => {
	it('gives the body of the first answer that succeeds', async () => {
		const { options, waits, urls } = scripted([
			respond(200, Uint8Array.of(1, 2, 3)),
		]);
		expect(await downloadWithRetry(URL, options)).toEqual(
			Uint8Array.of(1, 2, 3),
		);
		expect(waits).toEqual([]);
		expect(urls).toEqual([URL]);
	});

	it('waits, doubling each time, and asks again after 429 and server errors', async () => {
		const { options, waits, lines } = scripted([
			respond(429),
			respond(503),
			respond(200, Uint8Array.of(7)),
		]);
		expect(await downloadWithRetry(URL, options)).toEqual(Uint8Array.of(7));
		expect(waits).toEqual([1000, 2000]);
		expect(lines).toEqual([
			'  status 429; trying again in 1 s (attempt 2 of 4)',
			'  status 503; trying again in 2 s (attempt 3 of 4)',
		]);
	});

	it('waits at least as long as the server asks', async () => {
		const { options, waits } = scripted([
			respond(429, new Uint8Array(0), { 'retry-after': '30' }),
			respond(200, Uint8Array.of(1)),
		]);
		await downloadWithRetry(URL, options);
		expect(waits).toEqual([30_000]);
	});

	it('asks again after a request that gets no answer', async () => {
		const { options, waits } = scripted([
			new Error('connection reset'),
			respond(200, Uint8Array.of(1)),
		]);
		expect(await downloadWithRetry(URL, options)).toEqual(Uint8Array.of(1));
		expect(waits).toEqual([1000]);
	});

	it('gives up after the attempts allowed, naming the last problem', async () => {
		const { options, urls } = scripted(
			[respond(429), respond(429), respond(500)],
			{ attempts: 3 },
		);
		await expect(downloadWithRetry(URL, options)).rejects.toThrow(
			`The download of ${URL} failed after 3 attempts: status 500`,
		);
		expect(urls).toHaveLength(3);
	});

	it('does not ask again after any other refusal', async () => {
		const { options, urls } = scripted([respond(404), respond(200)]);
		await expect(downloadWithRetry(URL, options)).rejects.toThrow(
			`The download of ${URL} was refused with status 404`,
		);
		expect(urls).toHaveLength(1);
	});

	it('refuses a body whose declared length is more than allowed, without reading it', async () => {
		const reading: Reading = { chunksRead: 0, cancelled: false };
		const declared = scripted([
			respond(
				200,
				new Uint8Array(5000),
				{ 'content-length': '5000' },
				1000,
				reading,
			),
		]);
		await expect(downloadWithRetry(URL, declared.options)).rejects.toThrow(
			'is 5000 bytes, more than the 1000 expected',
		);
		expect(reading.chunksRead).toBe(0);
		expect(declared.urls).toHaveLength(1);
	});

	it('stops reading a body that has no declared length once it passes the cap', async () => {
		const reading: Reading = { chunksRead: 0, cancelled: false };
		const chunked = scripted([
			respond(200, new Uint8Array(100_000), {}, 400, reading),
		]);
		await expect(downloadWithRetry(URL, chunked.options)).rejects.toThrow(
			'is 1200 bytes, more than the 1000 expected',
		);
		// Three chunks of 400 passed the cap; the other 247 were never read.
		expect(reading.chunksRead).toBe(3);
		expect(reading.cancelled).toBe(true);
		expect(chunked.urls).toHaveLength(1);
	});

	it('still refuses a body over the cap, declared or not, when cancelling it fails', async () => {
		const declaredReading: Reading = { chunksRead: 0, cancelled: false };
		const declared = scripted([
			cancelRejects(
				respond(200, new Uint8Array(5000), { 'content-length': '5000' }),
				declaredReading,
			),
		]);
		await expect(downloadWithRetry(URL, declared.options)).rejects.toThrow(
			'is 5000 bytes, more than the 1000 expected',
		);
		expect(declaredReading.cancelled).toBe(true);
		const chunkedReading: Reading = { chunksRead: 0, cancelled: false };
		const chunked = scripted([
			cancelRejects(
				respond(200, new Uint8Array(100_000), {}, 400, chunkedReading),
				chunkedReading,
			),
		]);
		await expect(downloadWithRetry(URL, chunked.options)).rejects.toThrow(
			'is 1200 bytes, more than the 1000 expected',
		);
		expect(chunkedReading.chunksRead).toBe(3);
		expect(chunkedReading.cancelled).toBe(true);
	});

	it('still names the refused status when cancelling its body fails', async () => {
		const reading: Reading = { chunksRead: 0, cancelled: false };
		const { options, urls } = scripted([
			cancelRejects(respond(404), reading),
			respond(200),
		]);
		await expect(downloadWithRetry(URL, options)).rejects.toThrow(
			`The download of ${URL} was refused with status 404`,
		);
		expect(reading.cancelled).toBe(true);
		expect(urls).toHaveLength(1);
	});

	it('accepts a body of exactly the cap, joined from its chunks', async () => {
		const body = Uint8Array.from({ length: 1000 }, (_, index) => index % 251);
		const { options } = scripted([respond(200, body, {}, 300)]);
		expect([...(await downloadWithRetry(URL, options))]).toEqual([...body]);
	});
});

describe('keeping a download', () => {
	let directory = '';
	beforeEach(() => {
		const cache = join(ROOT, '.cache');
		mkdirSync(cache, { recursive: true });
		directory = mkdtempSync(join(cache, 'retry-test-'));
	});
	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	it('writes a file whole, leaving no part file behind', () => {
		const path = join(directory, 'inner', 'file.nc');
		writeFileWhole(path, Uint8Array.of(4, 5, 6));
		expect([...readFileSync(path)]).toEqual([4, 5, 6]);
		expect(existsSync(`${path}.part`)).toBe(false);
	});

	it('downloads a file that is not there, and uses one that is without asking', async () => {
		const path = join(directory, 'file.nc');
		const first = scripted([respond(200, Uint8Array.of(9))]);
		expect(await ensureDownloaded(URL, path, first.options)).toBe(true);
		expect([...readFileSync(path)]).toEqual([9]);
		const second = scripted([]);
		expect(await ensureDownloaded(URL, path, second.options)).toBe(false);
		expect(second.urls).toEqual([]);
	});

	it('keeps nothing when the download fails', async () => {
		const path = join(directory, 'file.nc');
		const { options } = scripted([respond(404)]);
		await expect(ensureDownloaded(URL, path, options)).rejects.toThrow();
		expect(existsSync(path)).toBe(false);
		expect(existsSync(`${path}.part`)).toBe(false);
	});
});
