/**
 * A minimal PNG writer, for the images the wind report embeds in its
 * pages: 8-bit RGB, no filtering, compressed by Node's own zlib.
 */

import { deflateSync } from 'node:zlib';

/** An image as rows of red, green and blue bytes, from the top left. */
export type RgbImage = {
	/** Pixels across, from 1. */
	readonly width: number;
	/** Pixels down, from 1. */
	readonly height: number;
	/**
	 * Three bytes a pixel, red, green then blue, row by row from the top,
	 * each row left to right: `3 · width · height` bytes in all.
	 */
	readonly pixels: Uint8Array;
};

/** The eight bytes every PNG file starts with. */
export const PNG_SIGNATURE = Uint8Array.of(
	0x89,
	0x50,
	0x4e,
	0x47,
	0x0d,
	0x0a,
	0x1a,
	0x0a,
);

/** The CRC-32 lookup table, for the polynomial PNG and zlib use. */
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let byte = 0; byte < 256; byte++) {
		let value = byte;
		for (let bit = 0; bit < 8; bit++) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[byte] = value >>> 0;
	}
	return table;
})();

/**
 * The CRC-32 of some bytes, as PNG computes it for each chunk.
 *
 * @param bytes - The bytes. Not changed.
 * @returns A whole number from 0 to 4,294,967,295.
 */
export const crc32 = (bytes: Uint8Array): number => {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
};

const ASCII = new TextEncoder();

/** One chunk: its length, its type, its data and the CRC of type and data. */
const chunk = (type: string, data: Uint8Array): Uint8Array => {
	const bytes = new Uint8Array(12 + data.length);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, data.length);
	bytes.set(ASCII.encode(type), 4);
	bytes.set(data, 8);
	view.setUint32(8 + data.length, crc32(bytes.subarray(4, 8 + data.length)));
	return bytes;
};

/**
 * The bytes of a PNG file of an image.
 *
 * @param image - The image. Not changed.
 * @returns A whole PNG file: 8-bit truecolour, not interlaced, each row
 * stored unfiltered.
 * @throws RangeError if the size is not whole numbers from 1 or the pixels
 * are not `3 · width · height` bytes.
 */
export const encodePng = (image: RgbImage): Uint8Array => {
	const { width, height, pixels } = image;
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < 1 ||
		height < 1
	) {
		throw new RangeError(
			`An image's size must be whole numbers from 1; got ${width} by ${height}`,
		);
	}
	const rowBytes = 3 * width;
	if (pixels.length !== rowBytes * height) {
		throw new RangeError(
			`A ${width} by ${height} image needs ${rowBytes * height} bytes; got ${pixels.length}`,
		);
	}
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	header[8] = 8; // bits per sample
	header[9] = 2; // colour type: truecolour
	// Compression, filter method and interlacing are all 0: deflate, the
	// one filter method, and no interlacing.

	// Each row is preceded by its filter type, 0 for none.
	const raw = new Uint8Array((rowBytes + 1) * height);
	for (let row = 0; row < height; row++) {
		raw.set(
			pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
			row * (rowBytes + 1) + 1,
		);
	}
	const parts = [
		PNG_SIGNATURE,
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', new Uint8Array(0)),
	];
	const file = new Uint8Array(
		parts.reduce((sum, part) => sum + part.length, 0),
	);
	let offset = 0;
	for (const part of parts) {
		file.set(part, offset);
		offset += part.length;
	}
	return file;
};

const BASE64_ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Some bytes in base64, as a `data:` URL holds them.
 *
 * @param bytes - The bytes. Not changed.
 * @returns The standard alphabet, padded with `=` to a multiple of four
 * characters, with no line breaks.
 */
export const base64 = (bytes: Uint8Array): string => {
	const characters: string[] = [];
	for (let index = 0; index < bytes.length; index += 3) {
		const a = bytes[index] as number;
		const b = bytes[index + 1];
		const c = bytes[index + 2];
		const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
		characters.push(
			BASE64_ALPHABET[(triple >> 18) & 63] as string,
			BASE64_ALPHABET[(triple >> 12) & 63] as string,
			b === undefined ? '=' : (BASE64_ALPHABET[(triple >> 6) & 63] as string),
			c === undefined ? '=' : (BASE64_ALPHABET[triple & 63] as string),
		);
	}
	return characters.join('');
};

/**
 * A PNG of an image as a `data:` URL, to put in a page.
 *
 * @param image - The image. Not changed.
 * @throws RangeError as {@link encodePng} does.
 */
export const pngDataUrl = (image: RgbImage): string =>
	`data:image/png;base64,${base64(encodePng(image))}`;
