import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { base64, crc32, encodePng, PNG_SIGNATURE, pngDataUrl } from './png';

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

/** The chunks of a PNG file, each checked against its CRC. */
const chunksOf = (file: Uint8Array) => {
	const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
	const chunks: { type: string; data: Uint8Array }[] = [];
	let offset = PNG_SIGNATURE.length;
	while (offset < file.length) {
		const length = view.getUint32(offset);
		const type = new TextDecoder().decode(
			file.subarray(offset + 4, offset + 8),
		);
		const data = file.subarray(offset + 8, offset + 8 + length);
		expect(view.getUint32(offset + 8 + length)).toBe(
			crc32(file.subarray(offset + 4, offset + 8 + length)),
		);
		chunks.push({ type, data });
		offset += 12 + length;
	}
	expect(offset).toBe(file.length);
	return chunks;
};

describe('crc32', () => {
	it('gives the standard check value', () => {
		// The CRC-32 of the nine digits "123456789" is 0xCBF43926.
		expect(crc32(ascii('123456789'))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array(0))).toBe(0);
	});

	it('gives the known CRC of the empty IEND chunk', () => {
		// Every PNG ends with the same twelve bytes: AE 42 60 82 is the CRC.
		expect(crc32(ascii('IEND'))).toBe(0xae426082);
	});
});

describe('base64', () => {
	it('encodes the RFC 4648 test vectors', () => {
		const vectors = [
			['', ''],
			['f', 'Zg=='],
			['fo', 'Zm8='],
			['foo', 'Zm9v'],
			['foob', 'Zm9vYg=='],
			['fooba', 'Zm9vYmE='],
			['foobar', 'Zm9vYmFy'],
		];
		for (const [text, encoded] of vectors) {
			expect(base64(ascii(text as string))).toBe(encoded);
		}
	});

	it('uses the whole alphabet, + and / included', () => {
		expect(base64(Uint8Array.of(0xfb, 0xff, 0xbf))).toBe('+/+/');
	});
});

describe('encodePng', () => {
	// A 3 by 2 image: red, green, blue on the top row; black, white and grey
	// below.
	const pixels = Uint8Array.of(
		255,
		0,
		0,
		0,
		255,
		0,
		0,
		0,
		255,
		0,
		0,
		0,
		255,
		255,
		255,
		128,
		128,
		128,
	);

	it('writes a PNG that decodes to the pixels put in', () => {
		const file = encodePng({ width: 3, height: 2, pixels });
		expect([...file.subarray(0, 8)]).toEqual([...PNG_SIGNATURE]);
		const chunks = chunksOf(file);
		expect(chunks.map(({ type }) => type)).toEqual(['IHDR', 'IDAT', 'IEND']);
		const header = chunks[0]?.data as Uint8Array;
		const view = new DataView(header.buffer, header.byteOffset, 13);
		expect(view.getUint32(0)).toBe(3);
		expect(view.getUint32(4)).toBe(2);
		// 8 bits, truecolour, deflate, the one filter method, no interlace.
		expect([...header.subarray(8)]).toEqual([8, 2, 0, 0, 0]);
		const raw = inflateSync(chunks[1]?.data as Uint8Array);
		// Each row is its filter type, 0, and then its pixels.
		expect([...raw]).toEqual([
			0,
			...pixels.subarray(0, 9),
			0,
			...pixels.subarray(9),
		]);
		expect(chunks[2]?.data).toHaveLength(0);
	});

	it('refuses a size that is not whole or pixels of the wrong length', () => {
		expect(() => encodePng({ width: 0, height: 2, pixels })).toThrow(
			RangeError,
		);
		expect(() => encodePng({ width: 1.5, height: 2, pixels })).toThrow(
			RangeError,
		);
		expect(() => encodePng({ width: 2, height: 2, pixels })).toThrow(
			/needs 12 bytes; got 18/,
		);
	});

	it('gives a data URL of the file in base64', () => {
		const image = { width: 3, height: 2, pixels };
		expect(pngDataUrl(image)).toBe(
			`data:image/png;base64,${base64(encodePng(image))}`,
		);
	});
});
