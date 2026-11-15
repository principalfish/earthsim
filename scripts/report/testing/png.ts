/**
 * Reads back the PNG images the wind report writes, for its tests: 8-bit
 * truecolour with every row unfiltered, as `../png.ts` writes them.
 */

import { inflateSync } from 'node:zlib';
import type { RgbImage } from '../png';

const ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** The bytes of padded, standard base64 text. */
export const fromBase64 = (text: string): Uint8Array => {
	const bytes: number[] = [];
	for (let index = 0; index < text.length; index += 4) {
		const values = [...text.slice(index, index + 4)].map((character) =>
			character === '=' ? 0 : ALPHABET.indexOf(character),
		);
		const triple =
			((values[0] as number) << 18) |
			((values[1] as number) << 12) |
			((values[2] as number) << 6) |
			(values[3] as number);
		bytes.push((triple >> 16) & 255);
		if (text[index + 2] !== '=') bytes.push((triple >> 8) & 255);
		if (text[index + 3] !== '=') bytes.push(triple & 255);
	}
	return Uint8Array.from(bytes);
};

/**
 * The image in a `data:image/png;base64,` URL.
 *
 * @throws Error if it is not such a URL, or its PNG is not one of the kind
 * the report writes.
 */
export const decodePngDataUrl = (url: string): RgbImage => {
	const prefix = 'data:image/png;base64,';
	if (!url.startsWith(prefix)) {
		throw new Error('Not a PNG data URL');
	}
	const file = fromBase64(url.slice(prefix.length));
	const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
	let offset = 8;
	let width = 0;
	let height = 0;
	let compressed: Uint8Array = new Uint8Array(0);
	while (offset < file.length) {
		const length = view.getUint32(offset);
		const type = new TextDecoder().decode(
			file.subarray(offset + 4, offset + 8),
		);
		if (type === 'IHDR') {
			width = view.getUint32(offset + 8);
			height = view.getUint32(offset + 12);
		} else if (type === 'IDAT') {
			compressed = file.subarray(offset + 8, offset + 8 + length);
		}
		offset += 12 + length;
	}
	const raw = inflateSync(compressed);
	const rowBytes = 3 * width;
	const pixels = new Uint8Array(rowBytes * height);
	for (let row = 0; row < height; row++) {
		if (raw[row * (rowBytes + 1)] !== 0) {
			throw new Error(`Row ${row} is filtered`);
		}
		pixels.set(
			raw.subarray(row * (rowBytes + 1) + 1, (row + 1) * (rowBytes + 1)),
			row * rowBytes,
		);
	}
	return { width, height, pixels };
};
