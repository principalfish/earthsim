/**
 * Downloading a file whose bytes are not the same from one request to the
 * next, such as a subset a server cuts from a larger dataset and stamps with
 * the time it was made: a polite download that waits and tries again when
 * the server asks it to slow down, and keeps the file once it has it.
 *
 * What the file means, rather than its bytes, is what a build checks it
 * against, so nothing here pins a checksum.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The statuses that say to try again later: too many requests, and the server's own trouble. */
const isRetryable = (status: number): boolean =>
	status === 429 || (status >= 500 && status <= 599);

/** A refusal that asking again would not change. */
class DownloadRefused extends Error {}

/** How a download is made and retried. */
export type RetryOptions = {
	/** How many requests to make in all before giving up. */
	readonly attempts: number;
	/** How long to wait after the first failed request, in milliseconds; each wait after it is twice the one before. */
	readonly firstDelayMs: number;
	/** The longest the file may be, in bytes. A longer one is refused. */
	readonly maxBytes: number;
	/** Makes a request. */
	readonly fetchFile: (url: string) => Promise<ScriptResponse>;
	/** Waits for a time in milliseconds. */
	readonly sleep: (ms: number) => Promise<void>;
	/** Where a line about a retry is written. */
	readonly say: (line: string) => void;
};

/**
 * How long a server asks to be left alone, from a `Retry-After` header that
 * gives a number of seconds.
 *
 * @param header - The header's value, or null if there is none.
 * @returns The time in milliseconds, or null if the header is absent or not
 * a number of seconds.
 */
export const retryAfterMs = (header: string | null): number | null => {
	if (header === null || !/^\d{1,6}$/.test(header.trim())) {
		return null;
	}
	return Number(header.trim()) * 1000;
};

/**
 * Reads the body of a successful response a part at a time, stopping and
 * refusing as soon as it is longer than allowed, whether or not the response
 * said how long it was.
 *
 * @throws DownloadRefused if the body is longer than `maxBytes`.
 */
const readCapped = async (
	url: string,
	response: ScriptResponse,
	maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> => {
	const tooLong = (bytes: number): DownloadRefused =>
		new DownloadRefused(
			`${url} is ${bytes} bytes, more than the ${maxBytes} expected`,
		);
	const declared = Number(response.headers.get('content-length'));
	if (declared > maxBytes) {
		await response.body?.cancel();
		throw tooLong(declared);
	}
	if (response.body === null) {
		return new Uint8Array(0);
	}
	const reader = response.body.getReader();
	const parts: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done || value === undefined) {
			break;
		}
		total += value.length;
		if (total > maxBytes) {
			await reader.cancel();
			throw tooLong(total);
		}
		parts.push(value);
	}
	const bytes = new Uint8Array(total);
	let at = 0;
	for (const part of parts) {
		bytes.set(part, at);
		at += part.length;
	}
	return bytes;
};

/**
 * Downloads a file, waiting and asking again if the server is busy.
 *
 * @remarks
 * A request that is answered with 429 or a 5xx status, or that fails before
 * any answer, is made again after a wait that doubles each time, or after
 * the time the server's `Retry-After` gives if that is longer. Any other
 * refusal, a body longer than `maxBytes` and a failure on the last attempt
 * end the download at once.
 *
 * @param url - The address of the file.
 * @param options - How to make and retry the request.
 * @returns The file's bytes.
 * @throws Error naming the url and the last status or failure.
 */
export const downloadWithRetry = async (
	url: string,
	options: RetryOptions,
): Promise<Uint8Array<ArrayBuffer>> => {
	let delayMs = options.firstDelayMs;
	for (let attempt = 1; ; attempt++) {
		let problem: string;
		let asked: number | null = null;
		try {
			const response = await options.fetchFile(url);
			if (response.ok) {
				return await readCapped(url, response, options.maxBytes);
			}
			await response.body?.cancel();
			if (!isRetryable(response.status)) {
				throw new DownloadRefused(
					`The download of ${url} was refused with status ${response.status}`,
				);
			}
			problem = `status ${response.status}`;
			asked = retryAfterMs(response.headers.get('retry-after'));
		} catch (error) {
			// A refusal is final; any other error is a failure to get an
			// answer, which is tried again.
			if (error instanceof DownloadRefused) {
				throw error;
			}
			problem = error instanceof Error ? error.message : String(error);
		}
		if (attempt >= options.attempts) {
			throw new Error(
				`The download of ${url} failed after ${attempt} attempts: ${problem}`,
			);
		}
		const wait = Math.max(delayMs, asked ?? 0);
		options.say(
			`  ${problem}; trying again in ${Math.round(wait / 1000)} s (attempt ${attempt + 1} of ${options.attempts})`,
		);
		await options.sleep(wait);
		delayMs *= 2;
	}
};

/**
 * Writes a file so that it is either all there or not there at all: to a
 * part file beside it, which is then moved into place.
 *
 * @param path - Where the file goes; its folder is made if it is not there.
 * @param bytes - What it holds.
 */
export const writeFileWhole = (path: string, bytes: Uint8Array): void => {
	mkdirSync(dirname(path), { recursive: true });
	const part = `${path}.part`;
	writeFileSync(part, bytes);
	renameSync(part, path);
};

/**
 * Makes sure a file is at a path, downloading it if it is not.
 *
 * @param url - Where to download it from.
 * @param path - Where it is kept.
 * @param options - How to make and retry the request.
 * @returns Whether the file was downloaded now, rather than already there.
 * @throws Error as {@link downloadWithRetry} does.
 */
export const ensureDownloaded = async (
	url: string,
	path: string,
	options: RetryOptions,
): Promise<boolean> => {
	if (existsSync(path)) {
		return false;
	}
	writeFileWhole(path, await downloadWithRetry(url, options));
	return true;
};
