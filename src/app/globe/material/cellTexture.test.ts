import { NearestFilter } from 'three';
import { describe, expect, it } from 'vitest';
import { createCellTexture } from './cellTexture';

describe('createCellTexture', () => {
	it('lays six faces out from views into the values, unfiltered', () => {
		const values = Float32Array.from({ length: 6 * 4 }, (_, i) => i);
		const { texture, resolution, faces } = createCellTexture(values, 2);
		expect(resolution).toBe(2);
		expect(faces).toHaveLength(6);
		faces.forEach((face, index) => {
			expect(face.buffer).toBe(values.buffer);
			expect(Array.from(face)).toEqual([0, 1, 2, 3].map((k) => index * 4 + k));
		});
		expect(texture.images).toHaveLength(6);
		expect(texture.magFilter).toBe(NearestFilter);
		expect(texture.minFilter).toBe(NearestFilter);
		expect(texture.generateMipmaps).toBe(false);
		expect(texture.flipY).toBe(false);
	});

	it('refuses values that are not one per cell', () => {
		expect(() => createCellTexture(new Float32Array(23), 2)).toThrow(
			RangeError,
		);
	});
});
