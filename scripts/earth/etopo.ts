/**
 * The source of the Earth data: NOAA's ETOPO 2022 global relief model at 60
 * arc-seconds, in the version that follows the top of the ice sheets.
 *
 * The file is a GeoTIFF of 21,600 × 10,800 pixels, each one arc-minute
 * square, from 180° west and 90° north. A pixel stands for the area it
 * covers and holds its elevation in metres against the EGM2008 geoid, which
 * is in effect mean sea level.
 */

import { RASTER_PIXEL_IS_AREA, type TiffLayout } from './tiff';

/** Where the file is downloaded from. */
export const ETOPO_URL =
	'https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif';

/** The name the downloaded file is kept under. */
export const ETOPO_FILE_NAME = 'ETOPO_2022_v1_60s_N90W180_surface.tif';

/** The exact length of the file, in bytes. */
export const ETOPO_FILE_BYTES = 465_969_062;

/** The SHA-256 of the file, in lower-case hexadecimal. */
export const ETOPO_FILE_SHA256 =
	'9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e';

/** Pixels across the file: 360° at 60 to the degree. */
export const ETOPO_WIDTH = 21_600;

/** Pixels down the file: 180° at 60 to the degree. */
export const ETOPO_HEIGHT = 10_800;

/** The size of a pixel in degrees: one arc-minute. */
export const ETOPO_PIXEL_DEG = 1 / 60;

/** The longitude of the file's western edge, in degrees. */
export const ETOPO_WEST_DEG = -180;

/** The latitude of the file's northern edge, in degrees. */
export const ETOPO_NORTH_DEG = 90;

/** The value of a pixel that holds no elevation. */
export const ETOPO_NO_DATA = -99_999;

/**
 * How far a pixel size or a corner read from the file may be from what is
 * expected, in degrees: far less than a pixel, and more than the rounding
 * of 1/60 in double precision.
 */
const GEOREFERENCE_TOLERANCE_DEG = 1e-9;

const near = (actual: number | undefined, expected: number): boolean =>
	actual !== undefined &&
	Math.abs(actual - expected) <= GEOREFERENCE_TOLERANCE_DEG;

/**
 * Says what is wrong with a file's SHA-256, if it is not that of the ETOPO
 * file.
 *
 * @param digest - The SHA-256 of a file, in hexadecimal of either case.
 * @returns `null` if it is {@link ETOPO_FILE_SHA256}; otherwise a sentence
 * that says the file is not the one expected, with both digests.
 */
export const etopoDigestMismatch = (digest: string): string | null =>
	digest.toLowerCase() === ETOPO_FILE_SHA256
		? null
		: `The file does not match the expected NOAA file ${ETOPO_FILE_NAME}: its SHA-256 is ${digest}, expected ${ETOPO_FILE_SHA256}`;

/**
 * Says what is wrong with a download that would come to a given length, if
 * that is more than the ETOPO file has.
 *
 * @remarks
 * Asked before each part of a response is written, this keeps a server that
 * sends more than the file, or never stops sending, from filling the disk:
 * the length and the SHA-256 of what was written can only be checked once
 * the response has ended.
 *
 * @param bytes - The length the file on disk would have, in bytes.
 * @returns `null` if that is within {@link ETOPO_FILE_BYTES}; otherwise a
 * sentence that says the server sent too much.
 */
export const downloadOverrun = (bytes: number): string | null =>
	bytes <= ETOPO_FILE_BYTES
		? null
		: `The server sent more than the ${ETOPO_FILE_BYTES} bytes of ${ETOPO_FILE_NAME}`;

/** A `Content-Range` in bytes: the first and last byte sent, then the total. */
const CONTENT_RANGE_PATTERN = /^bytes (\d+)-(\d+)\/(\d+|\*)$/;

/**
 * Says what is wrong with the `Content-Range` of a partial response, if it
 * is not the rest of the ETOPO file from a given byte.
 *
 * @remarks
 * A download that was cut off is carried on by asking for the bytes from
 * where it stopped and adding them to what is there. A server may answer
 * with another part than the one asked for, which added to the file would
 * make it wrong. The part must start at the byte asked for and end within
 * the file, and the length it gives for the whole file must be the file's;
 * a server may leave that length unsaid, as `*`.
 *
 * @param header - The response's `Content-Range`, or `null` if it has none.
 * @param firstByte - The byte the request asked the part to start at.
 * @returns `null` if the part is the one asked for; otherwise a sentence
 * that says what the server sent instead.
 */
export const contentRangeProblem = (
	header: string | null,
	firstByte: number,
): string | null => {
	const wanted = `bytes ${firstByte}-${ETOPO_FILE_BYTES - 1}/${ETOPO_FILE_BYTES}`;
	if (header === null) {
		return `The server sent part of a file without a Content-Range, expected "${wanted}"`;
	}
	const match = CONTENT_RANGE_PATTERN.exec(header.trim());
	const first = Number(match?.[1]);
	const last = Number(match?.[2]);
	const total = match?.[3];
	const right =
		match !== null &&
		first === firstByte &&
		last >= first &&
		last < ETOPO_FILE_BYTES &&
		(total === '*' || Number(total) === ETOPO_FILE_BYTES);
	return right
		? null
		: `The server sent the part "${header}" of a file, expected "${wanted}"`;
};

/**
 * Checks that a TIFF image is laid out as the ETOPO file is: its size, the
 * size of its pixels, where its corner lies, that pixels stand for areas,
 * and its no-data value.
 *
 * @remarks
 * Averaging the file into cells takes all of these for granted, so a file
 * that differs in any of them would give a wrong Earth without any other
 * sign.
 *
 * @param layout - What the image says about itself.
 * @throws Error naming everything that is not as expected.
 */
export const assertEtopoLayout = (layout: TiffLayout): void => {
	const wrong: string[] = [];
	if (layout.width !== ETOPO_WIDTH || layout.height !== ETOPO_HEIGHT) {
		wrong.push(
			`the image is ${layout.width} × ${layout.height} pixels, expected ${ETOPO_WIDTH} × ${ETOPO_HEIGHT}`,
		);
	}
	const { pixelScale, tiepoint } = layout;
	if (
		pixelScale === null ||
		!near(pixelScale[0], ETOPO_PIXEL_DEG) ||
		!near(pixelScale[1], ETOPO_PIXEL_DEG)
	) {
		wrong.push(
			`the pixel size is ${pixelScale === null ? 'missing' : pixelScale.join(', ')}, expected ${ETOPO_PIXEL_DEG} degrees each way`,
		);
	}
	if (
		tiepoint === null ||
		tiepoint[0] !== 0 ||
		tiepoint[1] !== 0 ||
		!near(tiepoint[3], ETOPO_WEST_DEG) ||
		!near(tiepoint[4], ETOPO_NORTH_DEG)
	) {
		wrong.push(
			`the tiepoint is ${tiepoint === null ? 'missing' : tiepoint.join(', ')}, expected pixel 0, 0 at ${ETOPO_WEST_DEG}, ${ETOPO_NORTH_DEG}`,
		);
	}
	if (layout.rasterType !== RASTER_PIXEL_IS_AREA) {
		wrong.push(
			`the raster type is ${layout.rasterType}, expected ${RASTER_PIXEL_IS_AREA} (pixel is area)`,
		);
	}
	if (layout.noData === null || Number(layout.noData) !== ETOPO_NO_DATA) {
		wrong.push(
			`the no-data value is ${layout.noData ?? 'missing'}, expected ${ETOPO_NO_DATA}`,
		);
	}
	if (wrong.length > 0) {
		throw new Error(
			`The file is not laid out as ETOPO 2022 at 60 arc-seconds: ${wrong.join('; ')}`,
		);
	}
};
