/**
 * Downloading a source file into the cache once, checked against the
 * length and SHA-256 pinned for it, and reusing it from there.
 */

import { createHash } from 'node:crypto';
import {
	closeSync,
	mkdirSync,
	openSync,
	readSync,
	statSync,
	unlinkSync,
	writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { stdout } from 'node:process';
import {
	contentRangeProblem,
	digestMismatch,
	downloadOverrun,
	type PinnedFile,
} from './earth/pinnedFile';

/** How much of a file is read at a time to hash it, in bytes. */
const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

const say = (text: string): void => {
	stdout.write(`${text}\n`);
};

const megabytes = (bytes: number): string => (bytes / 1e6).toFixed(0);

/** The length of a file in bytes, or 0 if there is no file. */
export const fileSize = (path: string): number =>
	statSync(path, { throwIfNoEntry: false })?.size ?? 0;

/** The SHA-256 of a file in hexadecimal, read a chunk at a time. */
export const sha256Of = (path: string): string => {
	const hash = createHash('sha256');
	const chunk = new Uint8Array(HASH_CHUNK_BYTES);
	const file = openSync(path, 'r');
	try {
		let position = 0;
		for (;;) {
			const length = readSync(file, chunk, 0, chunk.length, position);
			if (length === 0) {
				break;
			}
			hash.update(chunk.subarray(0, length));
			position += length;
		}
	} finally {
		closeSync(file);
	}
	return hash.digest('hex');
};

/**
 * Checks that the cached file is the one pinned, byte for byte, and deletes
 * it if it is not.
 *
 * @throws Error if the file's SHA-256 is not the one pinned.
 */
const assertDigest = (source: PinnedFile, path: string): void => {
	say(`Checking the SHA-256 of ${path}`);
	const mismatch = digestMismatch(source, sha256Of(path));
	if (mismatch !== null) {
		unlinkSync(path);
		throw new Error(
			`${mismatch}; the cached file was deleted, so run the script again to download it afresh`,
		);
	}
};

/** How a download is made. */
export type DownloadOptions = {
	/** The directory the file is kept in; made if it is not there. */
	readonly directory: string;
	/** How often the download says how far it has got, in bytes. */
	readonly reportEveryBytes: number;
};

/**
 * Makes sure the whole of a pinned file is in the cache, downloading what is
 * missing.
 *
 * @remarks
 * A file already there at its full length is used if its SHA-256 is the one
 * pinned. A shorter one is taken to be a download that was cut off, and
 * only the rest is asked for; if the server sends the whole file all the
 * same, the file is started again. A longer one cannot be part of the right
 * file and is replaced. A finished download has its SHA-256 checked too,
 * which also catches a file put together from the wrong parts.
 *
 * Nothing is written past the file's full length: a server that sends more
 * is cut off there and what was written is deleted. A server that answers
 * the request for the rest of the file with some other part is refused
 * before anything is written, and what is there is left as it was.
 *
 * @param source - The file to download.
 * @param options - Where to keep it, and how often to report.
 * @returns The path of the file.
 * @throws Error if the server refuses, if it sends another part of the file
 * than the one asked for, if it sends more than the file's length, in which
 * case the file is deleted, if the file is not its full length once the
 * download ends, or if its SHA-256 is not the one pinned, in which case the
 * file is deleted.
 */
export const ensurePinnedFile = async (
	source: PinnedFile,
	options: DownloadOptions,
): Promise<string> => {
	mkdirSync(options.directory, { recursive: true });
	const path = join(options.directory, source.name);
	const have = fileSize(path);
	if (have === source.bytes) {
		say(`Using ${path}`);
		assertDigest(source, path);
		return path;
	}
	const resumeFrom = have < source.bytes ? have : 0;
	say(
		resumeFrom > 0
			? `Resuming the download at ${megabytes(resumeFrom)} of ${megabytes(source.bytes)} MB`
			: `Downloading ${megabytes(source.bytes)} MB from ${source.url}`,
	);
	const response = await fetch(
		source.url,
		resumeFrom > 0 ? { headers: { Range: `bytes=${resumeFrom}-` } } : {},
	);
	if (!response.ok || response.body === null) {
		throw new Error(`The download was refused with status ${response.status}`);
	}
	// 206 says the server sent only the part asked for; anything else that
	// is a success is the whole file from its start.
	const appending = resumeFrom > 0 && response.status === 206;
	if (appending) {
		const problem = contentRangeProblem(
			source,
			response.headers.get('content-range'),
			resumeFrom,
		);
		if (problem !== null) {
			await response.body.cancel();
			throw new Error(
				`${problem}; delete ${path} to download the file from its start`,
			);
		}
	}
	let written = appending ? resumeFrom : 0;
	let nextReport = written + options.reportEveryBytes;
	let overrun: string | null = null;
	const file = openSync(path, appending ? 'a' : 'w');
	try {
		const reader = response.body.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done || value === undefined) {
				break;
			}
			overrun = downloadOverrun(source, written + value.length);
			if (overrun !== null) {
				await reader.cancel();
				break;
			}
			writeSync(file, value);
			written += value.length;
			if (written >= nextReport) {
				say(`  ${megabytes(written)} MB`);
				nextReport += options.reportEveryBytes;
			}
		}
	} finally {
		closeSync(file);
	}
	if (overrun !== null) {
		unlinkSync(path);
		throw new Error(
			`${overrun}; the download was stopped and what was written was deleted`,
		);
	}
	const size = fileSize(path);
	if (size !== source.bytes) {
		throw new Error(
			`The download ended with ${size} of ${source.bytes} bytes; run the script again to carry on`,
		);
	}
	assertDigest(source, path);
	return path;
};
