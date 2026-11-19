import { describe, expect, it } from 'vitest';
import { assertValuesDigest, float32Sha256 } from './decodedDigest';

/** SHA-256 of the eight bytes 00 00 80 3f (1.0 as a float) and 00 00 c0 7f (NaN). */
const ONE_THEN_NAN =
	'c5a9838fc5dcd30b553f91b142049c4fd057c83c043c7534ef12c4bc9439041d';

describe('float32Sha256', () => {
	it('hashes each value as a little-endian 32-bit float, array after array', () => {
		expect(
			float32Sha256([Float64Array.of(1), Float64Array.of(Number.NaN)]),
		).toBe(ONE_THEN_NAN);
		expect(float32Sha256([Float64Array.of(1, Number.NaN)])).toBe(ONE_THEN_NAN);
	});

	it('hashes every NaN as the same bits', () => {
		const odd = new Float32Array(new Uint32Array([0x7fc00001]).buffer);
		expect(Number.isNaN(odd[0])).toBe(true);
		expect(float32Sha256([Float64Array.of(1), odd])).toBe(ONE_THEN_NAN);
	});

	it('rounds a double to the float it would be stored as', () => {
		expect(float32Sha256([Float64Array.of(1 + 2 ** -30)])).toBe(
			float32Sha256([Float64Array.of(1)]),
		);
	});

	it('hashes arrays longer than its working chunk', () => {
		const long = Float64Array.from({ length: 200_000 }, (_, index) => index);
		const whole = float32Sha256([long]);
		expect(whole).toMatch(/^[0-9a-f]{64}$/);
		expect(
			float32Sha256([long.subarray(0, 70_000), long.subarray(70_000)]),
		).toBe(whole);
	});
});

describe('assertValuesDigest', () => {
	it('accepts the digest expected and refuses another, giving both', () => {
		expect(() => assertValuesDigest('a file', 'abc', 'abc')).not.toThrow();
		expect(() => assertValuesDigest('a file', 'abc', 'def')).toThrow(
			'The values of a file are not those expected: their SHA-256 is abc, expected def',
		);
	});
});
