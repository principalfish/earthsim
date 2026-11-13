import { describe, expect, it } from 'vitest';
import {
	ETOPO_FILE,
	ETOPO_FILE_BYTES,
	ETOPO_FILE_NAME,
	ETOPO_FILE_SHA256,
} from './etopo';
import {
	contentRangeProblem,
	digestMismatch,
	downloadOverrun,
	type PinnedFile,
} from './pinnedFile';

// The checks are shown on the ETOPO file, the largest the project downloads.

describe('digestMismatch', () => {
	it('accepts the digest of the file, in either case', () => {
		expect(digestMismatch(ETOPO_FILE, ETOPO_FILE_SHA256)).toBeNull();
		expect(
			digestMismatch(ETOPO_FILE, ETOPO_FILE_SHA256.toUpperCase()),
		).toBeNull();
	});

	it('says that any other digest is not of the NOAA file, with both', () => {
		// The SHA-256 of no bytes at all.
		const empty =
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
		expect(digestMismatch(ETOPO_FILE, empty)).toBe(
			`The file does not match the expected file ETOPO_2022_v1_60s_N90W180_surface.tif: its SHA-256 is ${empty}, expected 9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e`,
		);
		for (const digest of [
			'',
			ETOPO_FILE_SHA256.slice(0, -1),
			`${ETOPO_FILE_SHA256}0`,
			` ${ETOPO_FILE_SHA256}`,
			`${ETOPO_FILE_SHA256.slice(0, -1)}f`,
		]) {
			expect(digestMismatch(ETOPO_FILE, digest), digest).not.toBeNull();
		}
	});
});

describe('downloadOverrun', () => {
	it('allows a download up to the length of the file', () => {
		expect(downloadOverrun(ETOPO_FILE, 0)).toBeNull();
		expect(downloadOverrun(ETOPO_FILE, ETOPO_FILE_BYTES - 1)).toBeNull();
		expect(downloadOverrun(ETOPO_FILE, ETOPO_FILE_BYTES)).toBeNull();
	});

	it('refuses a download as soon as it is longer than the file', () => {
		expect(downloadOverrun(ETOPO_FILE, ETOPO_FILE_BYTES + 1)).toBe(
			`The server sent more than the 465969062 bytes of ${ETOPO_FILE_NAME}`,
		);
		expect(downloadOverrun(ETOPO_FILE, ETOPO_FILE_BYTES * 4)).not.toBeNull();
		expect(downloadOverrun(ETOPO_FILE, Infinity)).not.toBeNull();
	});

	it('stops a server that never stops sending at the first part too many', () => {
		// A response of 64 KiB parts with no end, written as the script does.
		const part = 65_536;
		let written = 0;
		let parts = 0;
		while (downloadOverrun(ETOPO_FILE, written + part) === null) {
			written += part;
			parts++;
		}
		expect(written).toBeLessThanOrEqual(ETOPO_FILE_BYTES);
		expect(written + part).toBeGreaterThan(ETOPO_FILE_BYTES);
		expect(parts).toBe(Math.floor(ETOPO_FILE_BYTES / part));
	});

	it('counts what a resumed download already has', () => {
		const have = ETOPO_FILE_BYTES - 100;
		expect(downloadOverrun(ETOPO_FILE, have + 100)).toBeNull();
		expect(downloadOverrun(ETOPO_FILE, have + 101)).not.toBeNull();
	});
});

describe('contentRangeProblem', () => {
	const LAST = ETOPO_FILE_BYTES - 1;

	it('accepts the rest of the file from the byte asked for', () => {
		expect(
			contentRangeProblem(
				ETOPO_FILE,
				`bytes 1000-${LAST}/${ETOPO_FILE_BYTES}`,
				1000,
			),
		).toBeNull();
		expect(
			contentRangeProblem(
				ETOPO_FILE,
				`bytes ${LAST}-${LAST}/${ETOPO_FILE_BYTES}`,
				LAST,
			),
		).toBeNull();
	});

	it('accepts a part that stops before the end of the file', () => {
		expect(
			contentRangeProblem(
				ETOPO_FILE,
				`bytes 1000-1999/${ETOPO_FILE_BYTES}`,
				1000,
			),
		).toBeNull();
	});

	it('accepts a part that leaves the length of the file unsaid', () => {
		expect(
			contentRangeProblem(ETOPO_FILE, `bytes 1000-${LAST}/*`, 1000),
		).toBeNull();
	});

	it('allows white space around the value', () => {
		expect(
			contentRangeProblem(
				ETOPO_FILE,
				` bytes 1000-${LAST}/${ETOPO_FILE_BYTES} `,
				1000,
			),
		).toBeNull();
	});

	it('refuses a part that starts anywhere else', () => {
		for (const first of [0, 999, 1001]) {
			const header = `bytes ${first}-${LAST}/${ETOPO_FILE_BYTES}`;
			expect(contentRangeProblem(ETOPO_FILE, header, 1000)).toBe(
				`The server sent the part "${header}" of a file, expected "bytes 1000-${LAST}/${ETOPO_FILE_BYTES}"`,
			);
		}
	});

	it('refuses a part of a file of another length', () => {
		expect(
			contentRangeProblem(
				ETOPO_FILE,
				`bytes 1000-${LAST}/${ETOPO_FILE_BYTES + 1}`,
				1000,
			),
		).not.toBeNull();
		expect(
			contentRangeProblem(ETOPO_FILE, 'bytes 1000-1999/2000', 1000),
		).not.toBeNull();
	});

	it('refuses a part that runs past the end of the file', () => {
		expect(
			contentRangeProblem(
				ETOPO_FILE,
				`bytes 1000-${LAST + 1}/${ETOPO_FILE_BYTES}`,
				1000,
			),
		).not.toBeNull();
		expect(
			contentRangeProblem(ETOPO_FILE, `bytes 1000-${LAST + 1}/*`, 1000),
		).not.toBeNull();
	});

	it('refuses a part that ends before it starts', () => {
		expect(
			contentRangeProblem(
				ETOPO_FILE,
				`bytes 1000-999/${ETOPO_FILE_BYTES}`,
				1000,
			),
		).not.toBeNull();
	});

	it('refuses a response with no Content-Range', () => {
		expect(contentRangeProblem(ETOPO_FILE, null, 1000)).toBe(
			`The server sent part of a file without a Content-Range, expected "bytes 1000-${LAST}/${ETOPO_FILE_BYTES}"`,
		);
	});

	it('refuses a Content-Range it cannot read', () => {
		for (const header of [
			'',
			'bytes',
			`bytes */${ETOPO_FILE_BYTES}`,
			`items 1000-${LAST}/${ETOPO_FILE_BYTES}`,
			`bytes=1000-${LAST}/${ETOPO_FILE_BYTES}`,
			`bytes 1000-${LAST}`,
			`bytes -1000-${LAST}/${ETOPO_FILE_BYTES}`,
			`bytes 1000.5-${LAST}/${ETOPO_FILE_BYTES}`,
			`bytes 1000-${LAST}/${ETOPO_FILE_BYTES} and more`,
		]) {
			expect(contentRangeProblem(ETOPO_FILE, header, 1000)).not.toBeNull();
		}
	});
});

describe('another pinned file', () => {
	const SMALL: PinnedFile = {
		url: 'https://example.org/small.nc',
		name: 'small.nc',
		bytes: 10,
		sha256: 'ab'.repeat(32),
	};

	it('is checked against its own length and digest', () => {
		expect(digestMismatch(SMALL, 'AB'.repeat(32))).toBeNull();
		expect(digestMismatch(SMALL, ETOPO_FILE_SHA256)).toContain('small.nc');
		expect(downloadOverrun(SMALL, 10)).toBeNull();
		expect(downloadOverrun(SMALL, 11)).toBe(
			'The server sent more than the 10 bytes of small.nc',
		);
		expect(contentRangeProblem(SMALL, 'bytes 4-9/10', 4)).toBeNull();
		expect(contentRangeProblem(SMALL, 'bytes 4-10/10', 4)).not.toBeNull();
		expect(
			contentRangeProblem(SMALL, `bytes 4-9/${ETOPO_FILE_BYTES}`, 4),
		).not.toBeNull();
	});
});
