import { describe, expect, it } from 'vitest';
import {
	assertEtopoLayout,
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
