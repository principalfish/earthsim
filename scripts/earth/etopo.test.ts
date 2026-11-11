import { describe, expect, it } from 'vitest';
import {
	assertEtopoLayout,
	contentRangeProblem,
	downloadOverrun,
	ETOPO_FILE_BYTES,
	ETOPO_FILE_NAME,
	ETOPO_FILE_SHA256,
	ETOPO_HEIGHT,
	ETOPO_NO_DATA,
	ETOPO_PIXEL_DEG,
	ETOPO_URL,
	ETOPO_WIDTH,
	etopoDigestMismatch,
} from './etopo';
import type { TiffLayout } from './tiff';

/** The layout of the real file, as far as it is checked. */
const ETOPO_LAYOUT: TiffLayout = {
	width: 21_600,
	height: 10_800,
	bitsPerSample: 32,
	sampleFormat: 3,
	samplesPerPixel: 1,
	compression: 8,
	predictor: 3,
	planarConfiguration: 1,
	tileWidth: 256,
	tileHeight: 256,
	tilesAcross: 85,
	tilesDown: 43,
	tileOffsets: [],
	tileByteCounts: [],
	pixelScale: [0.016666666666666666, 0.016666666666666666, 0],
	tiepoint: [0, 0, 0, -180, 90, 0],
	rasterType: 1,
	noData: '-99999',
};

describe('the source', () => {
	it('is the ice-surface file at 60 arc-seconds', () => {
		expect(ETOPO_URL).toBe(
			'https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif',
		);
		expect(ETOPO_URL.endsWith(`/${ETOPO_FILE_NAME}`)).toBe(true);
		expect(ETOPO_FILE_BYTES).toBe(465_969_062);
		expect(ETOPO_WIDTH * ETOPO_PIXEL_DEG).toBeCloseTo(360, 9);
		expect(ETOPO_HEIGHT * ETOPO_PIXEL_DEG).toBeCloseTo(180, 9);
		expect(ETOPO_NO_DATA).toBe(-99_999);
	});
});

describe('etopoDigestMismatch', () => {
	it('pins the SHA-256 of the file', () => {
		expect(ETOPO_FILE_SHA256).toBe(
			'9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e',
		);
	});

	it('accepts the digest of the file, in either case', () => {
		expect(etopoDigestMismatch(ETOPO_FILE_SHA256)).toBeNull();
		expect(etopoDigestMismatch(ETOPO_FILE_SHA256.toUpperCase())).toBeNull();
	});

	it('says that any other digest is not of the NOAA file, with both', () => {
		// The SHA-256 of no bytes at all.
		const empty =
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
		expect(etopoDigestMismatch(empty)).toBe(
			`The file does not match the expected NOAA file ETOPO_2022_v1_60s_N90W180_surface.tif: its SHA-256 is ${empty}, expected 9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e`,
		);
		for (const digest of [
			'',
			ETOPO_FILE_SHA256.slice(0, -1),
			`${ETOPO_FILE_SHA256}0`,
			` ${ETOPO_FILE_SHA256}`,
			`${ETOPO_FILE_SHA256.slice(0, -1)}f`,
		]) {
			expect(etopoDigestMismatch(digest), digest).not.toBeNull();
		}
	});
});

describe('assertEtopoLayout', () => {
	it('accepts the layout of the real file', () => {
		expect(() => assertEtopoLayout(ETOPO_LAYOUT)).not.toThrow();
		// A pixel size written with fewer digits is the same size.
		expect(() =>
			assertEtopoLayout({
				...ETOPO_LAYOUT,
				pixelScale: [0.0166666666667, 0.0166666666667, 0],
			}),
		).not.toThrow();
	});

	it('refuses an image of another size', () => {
		expect(() => assertEtopoLayout({ ...ETOPO_LAYOUT, width: 43_200 })).toThrow(
			'the image is 43200 × 10800 pixels, expected 21600 × 10800',
		);
		expect(() =>
			assertEtopoLayout({ ...ETOPO_LAYOUT, height: 10_801 }),
		).toThrow('the image is 21600 × 10801 pixels');
	});

	it('refuses pixels of another size, or of none stated', () => {
		expect(() =>
			assertEtopoLayout({ ...ETOPO_LAYOUT, pixelScale: null }),
		).toThrow('the pixel size is missing');
		expect(() =>
			assertEtopoLayout({ ...ETOPO_LAYOUT, pixelScale: [1 / 30, 1 / 60, 0] }),
		).toThrow('the pixel size is');
		expect(() =>
			assertEtopoLayout({ ...ETOPO_LAYOUT, pixelScale: [1 / 60, 1 / 30, 0] }),
		).toThrow('the pixel size is');
		expect(() =>
			assertEtopoLayout({ ...ETOPO_LAYOUT, pixelScale: [1 / 60] }),
		).toThrow('the pixel size is');
	});

	it('refuses an image that starts anywhere but 180° west, 90° north', () => {
		expect(() =>
			assertEtopoLayout({ ...ETOPO_LAYOUT, tiepoint: null }),
		).toThrow('the tiepoint is missing');
		for (const tiepoint of [
			[0, 0, 0, 0, 90, 0],
			[0, 0, 0, -180, -90, 0],
			[1, 0, 0, -180, 90, 0],
			[0, 1, 0, -180, 90, 0],
			[0, 0, 0, -180],
		]) {
			expect(() => assertEtopoLayout({ ...ETOPO_LAYOUT, tiepoint })).toThrow(
				'the tiepoint is',
			);
		}
	});

	it('refuses pixels that stand for points, or for nothing stated', () => {
		expect(() => assertEtopoLayout({ ...ETOPO_LAYOUT, rasterType: 2 })).toThrow(
			'the raster type is 2, expected 1 (pixel is area)',
		);
		expect(() =>
			assertEtopoLayout({ ...ETOPO_LAYOUT, rasterType: null }),
		).toThrow('the raster type is null');
	});

	it('refuses another no-data value, or none', () => {
		expect(() => assertEtopoLayout({ ...ETOPO_LAYOUT, noData: null })).toThrow(
			'the no-data value is missing, expected -99999',
		);
		expect(() =>
			assertEtopoLayout({ ...ETOPO_LAYOUT, noData: '-32768' }),
		).toThrow('the no-data value is -32768');
		expect(() => assertEtopoLayout({ ...ETOPO_LAYOUT, noData: 'nan' })).toThrow(
			'the no-data value is nan',
		);
	});

	it('names everything that is wrong at once', () => {
		expect(() =>
			assertEtopoLayout({
				...ETOPO_LAYOUT,
				width: 1,
				pixelScale: null,
				tiepoint: null,
				rasterType: 2,
				noData: null,
			}),
		).toThrow(
			/^The file is not laid out as ETOPO 2022 at 60 arc-seconds: the image is .*; the pixel size is .*; the tiepoint is .*; the raster type is .*; the no-data value is /,
		);
	});
});

describe('downloadOverrun', () => {
	it('allows a download up to the length of the file', () => {
		expect(downloadOverrun(0)).toBeNull();
		expect(downloadOverrun(ETOPO_FILE_BYTES - 1)).toBeNull();
		expect(downloadOverrun(ETOPO_FILE_BYTES)).toBeNull();
	});

	it('refuses a download as soon as it is longer than the file', () => {
		expect(downloadOverrun(ETOPO_FILE_BYTES + 1)).toBe(
			`The server sent more than the 465969062 bytes of ${ETOPO_FILE_NAME}`,
		);
		expect(downloadOverrun(ETOPO_FILE_BYTES * 4)).not.toBeNull();
		expect(downloadOverrun(Infinity)).not.toBeNull();
	});

	it('stops a server that never stops sending at the first part too many', () => {
		// A response of 64 KiB parts with no end, written as the script does.
		const part = 65_536;
		let written = 0;
		let parts = 0;
		while (downloadOverrun(written + part) === null) {
			written += part;
			parts++;
		}
		expect(written).toBeLessThanOrEqual(ETOPO_FILE_BYTES);
		expect(written + part).toBeGreaterThan(ETOPO_FILE_BYTES);
		expect(parts).toBe(Math.floor(ETOPO_FILE_BYTES / part));
	});

	it('counts what a resumed download already has', () => {
		const have = ETOPO_FILE_BYTES - 100;
		expect(downloadOverrun(have + 100)).toBeNull();
		expect(downloadOverrun(have + 101)).not.toBeNull();
	});
});

describe('contentRangeProblem', () => {
	const LAST = ETOPO_FILE_BYTES - 1;

	it('accepts the rest of the file from the byte asked for', () => {
		expect(
			contentRangeProblem(`bytes 1000-${LAST}/${ETOPO_FILE_BYTES}`, 1000),
		).toBeNull();
		expect(
			contentRangeProblem(`bytes ${LAST}-${LAST}/${ETOPO_FILE_BYTES}`, LAST),
		).toBeNull();
	});

	it('accepts a part that stops before the end of the file', () => {
		expect(
			contentRangeProblem(`bytes 1000-1999/${ETOPO_FILE_BYTES}`, 1000),
		).toBeNull();
	});

	it('accepts a part that leaves the length of the file unsaid', () => {
		expect(contentRangeProblem(`bytes 1000-${LAST}/*`, 1000)).toBeNull();
	});

	it('allows white space around the value', () => {
		expect(
			contentRangeProblem(` bytes 1000-${LAST}/${ETOPO_FILE_BYTES} `, 1000),
		).toBeNull();
	});

	it('refuses a part that starts anywhere else', () => {
		for (const first of [0, 999, 1001]) {
			const header = `bytes ${first}-${LAST}/${ETOPO_FILE_BYTES}`;
			expect(contentRangeProblem(header, 1000)).toBe(
				`The server sent the part "${header}" of a file, expected "bytes 1000-${LAST}/${ETOPO_FILE_BYTES}"`,
			);
		}
	});

	it('refuses a part of a file of another length', () => {
		expect(
			contentRangeProblem(`bytes 1000-${LAST}/${ETOPO_FILE_BYTES + 1}`, 1000),
		).not.toBeNull();
		expect(contentRangeProblem('bytes 1000-1999/2000', 1000)).not.toBeNull();
	});

	it('refuses a part that runs past the end of the file', () => {
		expect(
			contentRangeProblem(`bytes 1000-${LAST + 1}/${ETOPO_FILE_BYTES}`, 1000),
		).not.toBeNull();
		expect(
			contentRangeProblem(`bytes 1000-${LAST + 1}/*`, 1000),
		).not.toBeNull();
	});

	it('refuses a part that ends before it starts', () => {
		expect(
			contentRangeProblem(`bytes 1000-999/${ETOPO_FILE_BYTES}`, 1000),
		).not.toBeNull();
	});

	it('refuses a response with no Content-Range', () => {
		expect(contentRangeProblem(null, 1000)).toBe(
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
			expect(contentRangeProblem(header, 1000)).not.toBeNull();
		}
	});
});
