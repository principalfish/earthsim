/**
 * A checksum of what a source file means rather than of its bytes, for the
 * sources a server cuts afresh at each request and stamps with the time, so
 * that no two downloads are the same file though they hold the same values.
 */

import { createHash } from 'node:crypto';

/** How many values are hashed at a time. */
const CHUNK_VALUES = 65_536;

/** The bits of the one NaN that is hashed, whatever NaN the values hold. */
const CANONICAL_NAN_BITS = 0x7fc00000;

/**
 * The SHA-256 in hexadecimal of some arrays of numbers, each value as a
 * 32-bit float, little-endian, in the order given: all of the first array,
 * then all of the second, and so on.
 *
 * @remarks
 * Every NaN is hashed as the same bits, so the checksum does not depend on
 * which NaN a source or a platform uses to say a value is missing.
 *
 * @param arrays - The values.
 */
export const float32Sha256 = (arrays: readonly ArrayLike<number>[]): string => {
	const hash = createHash('sha256');
	const buffer = new ArrayBuffer(4 * CHUNK_VALUES);
	const view = new DataView(buffer);
	for (const values of arrays) {
		for (let start = 0; start < values.length; start += CHUNK_VALUES) {
			const count = Math.min(CHUNK_VALUES, values.length - start);
			for (let index = 0; index < count; index++) {
				const value = values[start + index] as number;
				if (Number.isNaN(value)) {
					view.setUint32(4 * index, CANONICAL_NAN_BITS, true);
				} else {
					view.setFloat32(4 * index, value, true);
				}
			}
			hash.update(new Uint8Array(buffer, 0, 4 * count));
		}
	}
	return hash.digest('hex');
};

/**
 * Checks the SHA-256 of a source's values against the one pinned for it.
 *
 * @param what - What was hashed, as the message names it.
 * @param actual - The SHA-256 of the values read.
 * @param expected - The one pinned.
 * @throws Error giving both if they differ.
 */
export const assertValuesDigest = (
	what: string,
	actual: string,
	expected: string,
): void => {
	if (actual !== expected) {
		throw new Error(
			`The values of ${what} are not those expected: their SHA-256 is ${actual}, expected ${expected}`,
		);
	}
};
