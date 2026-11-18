/** Per-cell values made into the cube texture the shaders read. */

import {
	CubeTexture,
	DataTexture,
	FloatType,
	NearestFilter,
	RedFormat,
} from 'three';
import { FACE_COUNT } from '../../../core/index';

/** Per-cell values as a cube texture, and the views it uploads from. */
export type CellTexture = {
	readonly texture: CubeTexture;
	/** Cells along a face edge. */
	readonly resolution: number;
	/** Each face's cells: a view into the values given, not a copy. */
	readonly faces: readonly Float32Array[];
};

/**
 * Makes the cube texture the shaders read per-cell values from, one texel
 * per cell.
 *
 * @remarks
 * The grid lays its faces out as a cube map in core coordinates, so the
 * faces go in as they are, in order and unflipped: cell (face, i, j) is
 * texel (i, j) of that face. The texture keeps hold of the values without
 * copying them, and is uploaded when it is next drawn.
 *
 * @param values - One value per cell of the grid, in cell order.
 * @param resolution - Cells along a face edge.
 * @returns The texture, with the views of each face.
 * @throws RangeError if `values` does not hold exactly one value per cell.
 */
export const createCellTexture = (
	values: Float32Array,
	resolution: number,
): CellTexture => {
	const n = resolution;
	if (values.length !== FACE_COUNT * n * n) {
		throw new RangeError(
			`Per-cell values for resolution ${n} need ${FACE_COUNT * n * n} values; got ${values.length}`,
		);
	}
	const faces: Float32Array[] = [];
	for (let face = 0; face < FACE_COUNT; face++) {
		faces.push(values.subarray(face * n * n, (face + 1) * n * n));
	}
	const texture = new CubeTexture(
		faces.map((data) => new DataTexture(data, n, n, RedFormat, FloatType)),
	);
	texture.format = RedFormat;
	texture.type = FloatType;
	// Linear filtering of float textures is an optional extension, and its
	// blend weights are too coarse for a cell magnified over many pixels.
	texture.magFilter = NearestFilter;
	texture.minFilter = NearestFilter;
	texture.generateMipmaps = false;
	texture.flipY = false;
	texture.needsUpdate = true;
	return { texture, resolution: n, faces };
};
