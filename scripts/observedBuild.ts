/**
 * What the builds of the observed data share: their one option, where they
 * keep their sources and write their files, and reading a source.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { ensurePinnedFile } from './download';
import { ensureDownloaded } from './downloadRetry';
import { type NetcdfFile, readNetcdf3 } from './earth/netcdf';
import type { PinnedFile, SubsetSource } from './earth/pinnedFile';

/** The option that asks for the comparison with GDAL. */
export const VERIFY_OPTION = '--verify-with-gdal';

/** How often the download says how far it has got, in bytes. */
const DOWNLOAD_REPORT_BYTES = 1_000_000;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIRECTORY = join(ROOT, '.cache', 'observed');
const OUTPUT_DIRECTORY = join(ROOT, 'public', 'data');

/**
 * Writes a line of what a build is doing.
 *
 * @param text - The line, without its line break.
 */
export const say = (text: string): void => {
	stdout.write(`${text}\n`);
};

/**
 * Whether a build's arguments ask for the comparison with GDAL.
 *
 * @param args - The command line's arguments after the script's name.
 * @throws Error naming any argument that is not {@link VERIFY_OPTION}.
 */
export const asksForGdal = (args: readonly string[]): boolean => {
	const unknown = args.filter((arg) => arg !== VERIFY_OPTION);
	if (unknown.length > 0) {
		throw new Error(
			`Unknown option ${unknown.join(' ')}: the only option is ${VERIFY_OPTION}`,
		);
	}
	return args.includes(VERIFY_OPTION);
};

/** A source file, downloaded and read. */
export type ReadSource = {
	/** Where the file is kept. */
	readonly path: string;
	/** The file as this project's reader read it. */
	readonly file: NetcdfFile;
};

/**
 * Makes sure a source file is in `.cache/observed/`, downloading it if it
 * is not, then reads it.
 *
 * @param source - The file.
 * @returns The file's path and what it holds.
 * @throws Error if it cannot be downloaded, is not the file pinned, or
 * cannot be read as netCDF-3.
 */
export const readObservedSource = async (
	source: PinnedFile,
): Promise<ReadSource> => {
	const path = await ensurePinnedFile(source, {
		directory: CACHE_DIRECTORY,
		reportEveryBytes: DOWNLOAD_REPORT_BYTES,
	});
	const result = readNetcdf3(readFileSync(path));
	if (!result.ok) {
		throw new Error(
			`${path} cannot be read (${result.error}): ${result.detail}`,
		);
	}
	return { path, file: result.file };
};

/** How a subset is asked for: how often to try, and how long to wait. */
const SUBSET_ATTEMPTS = 6;
const SUBSET_FIRST_DELAY_MS = 10_000;

/** The most a subset may be, in bytes; the largest are about 90 MB. */
const SUBSET_MAX_BYTES = 200_000_000;

/**
 * Makes sure a subset a server cuts at each request is in `.cache/observed/`,
 * downloading it if it is not, then reads it.
 *
 * @remarks
 * Its bytes differ from one download to the next, so they are not pinned:
 * the caller checks what the values are. A file that cannot be read as
 * netCDF-3 is deleted, so that the next run asks again. A busy server, one
 * that answers 429 or an error of its own, is waited out with a pause that
 * doubles each time.
 *
 * @param source - The file's address and name.
 * @returns The file's path and what it holds.
 * @throws Error if it cannot be downloaded or cannot be read as netCDF-3.
 */
export const readSubsetSource = async (
	source: SubsetSource,
): Promise<ReadSource> => {
	const path = join(CACHE_DIRECTORY, source.name);
	const retry = {
		attempts: SUBSET_ATTEMPTS,
		firstDelayMs: SUBSET_FIRST_DELAY_MS,
		maxBytes: SUBSET_MAX_BYTES,
		fetchFile: (url: string) => fetch(url),
		sleep: (ms: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, ms)),
		say,
	};
	if (existsSync(path)) {
		say(`Using ${path}`);
	} else {
		say(`Downloading ${source.url}`);
	}
	if (await ensureDownloaded(source.url, path, retry)) {
		say(`Saved ${path}`);
	}
	const result = readNetcdf3(readFileSync(path));
	if (!result.ok) {
		unlinkSync(path);
		throw new Error(
			`${path} cannot be read (${result.error}): ${result.detail}; it was deleted, so run the script again to download it afresh`,
		);
	}
	return { path, file: result.file };
};

/**
 * Deletes a cached subset, for a build that found its values were not the
 * ones expected.
 *
 * @param source - The file's address and name.
 */
export const forgetSubset = (source: SubsetSource): void => {
	unlinkSync(join(CACHE_DIRECTORY, source.name));
};

/**
 * Writes a finished data file into `public/data/` and says so.
 *
 * @param name - The file's name.
 * @param bytes - What it holds.
 */
export const writeDataFile = (name: string, bytes: Uint8Array): void => {
	mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
	const output = join(OUTPUT_DIRECTORY, name);
	writeFileSync(output, bytes);
	say(`Wrote ${bytes.length} bytes to ${output}`);
};
