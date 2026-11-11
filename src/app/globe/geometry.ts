/**
 * The mesh the globe is drawn with: a unit sphere built from the six faces
 * of a cube, each split into a square lattice of quads.
 *
 * Vertices are spaced equiangularly, like the cells of the core grid, so
 * when the lattice has a whole number of quads per cell every cell boundary
 * runs along quad edges. Positions are unit vectors in core coordinates.
 */

import { FACE_AXES, FACE_COUNT, faceToDirection } from '../../core/index';

/**
 * The most quads along a face edge the mesh is ever given.
 *
 * @remarks
 * The mesh only carries the shape of the relief; colour and shading are
 * worked out per pixel from the elevation itself. Past this size the
 * silhouette of raised terrain no longer changes visibly, while the cost
 * of every frame keeps growing with the number of vertices.
 */
export const MAX_MESH_SEGMENTS = 128;

/** Quads along a cell edge while the mesh is below its largest size. */
const SEGMENTS_PER_CELL = 2;

/** Vertex positions and triangles of a sphere mesh. */
export type SphereMesh = {
	/** Unit vectors in core coordinates, three numbers per vertex. */
	readonly positions: Float32Array;
	/**
	 * Vertex indices, three per triangle, wound anticlockwise as seen from
	 * outside the sphere.
	 */
	readonly indices: Uint32Array;
};

/**
 * How finely to mesh the globe for a world.
 *
 * @remarks
 * Two quads per cell edge let raised terrain follow the smooth surface
 * between cell centres, up to {@link MAX_MESH_SEGMENTS}: about 197,000
 * triangles.
 *
 * @param resolution - Cells along a face edge of the world's grid.
 * @returns Quads along a face edge of the mesh.
 */
export const meshSegments = (resolution: number): number =>
	Math.min(MAX_MESH_SEGMENTS, resolution * SEGMENTS_PER_CELL);

/**
 * A unit sphere as six lattices of quads, one per cube face.
 *
 * @remarks
 * Faces share the vertices along the cube's edges and at its corners, so
 * the mesh is closed: neighbouring faces cannot drift apart by a rounding
 * error and let the background show through.
 *
 * @param segments - Quads along a face edge; a positive integer.
 * @returns `6 * segments² + 2` vertices and `12 * segments²` triangles.
 * @throws RangeError if `segments` is not a positive integer.
 */
export const buildSphereMesh = (segments: number): SphereMesh => {
	if (!Number.isInteger(segments) || segments < 1) {
		throw new RangeError(
			`A mesh needs a positive whole number of segments; got ${segments}`,
		);
	}
	const side = segments + 1;
	const vertexCount = FACE_COUNT * segments * segments + 2;
	const positions = new Float32Array(vertexCount * 3);
	const indices = new Uint32Array(FACE_COUNT * segments * segments * 6);

	// A lattice point on a cube edge belongs to two or three faces. Its
	// position on the cube, in whole steps from -segments to segments along
	// each axis, is the same from every face it belongs to.
	const span = 2 * segments + 1;
	const shared = new Map<number, number>();
	const faceVertices = new Uint32Array(side * side);
	let nextVertex = 0;
	let nextIndex = 0;

	for (let face = 0; face < FACE_COUNT; face++) {
		const { normal, u, v } = FACE_AXES[face] as (typeof FACE_AXES)[number];
		for (let j = 0; j < side; j++) {
			for (let i = 0; i < side; i++) {
				const onEdge = i === 0 || j === 0 || i === segments || j === segments;
				let key = -1;
				if (onEdge) {
					const a = 2 * i - segments;
					const b = 2 * j - segments;
					const x = normal[0] * segments + u[0] * a + v[0] * b + segments;
					const y = normal[1] * segments + u[1] * a + v[1] * b + segments;
					const z = normal[2] * segments + u[2] * a + v[2] * b + segments;
					key = (x * span + y) * span + z;
					const existing = shared.get(key);
					if (existing !== undefined) {
						faceVertices[j * side + i] = existing;
						continue;
					}
				}
				const direction = faceToDirection(face, i / segments, j / segments);
				positions[3 * nextVertex] = direction[0];
				positions[3 * nextVertex + 1] = direction[1];
				positions[3 * nextVertex + 2] = direction[2];
				if (onEdge) {
					shared.set(key, nextVertex);
				}
				faceVertices[j * side + i] = nextVertex;
				nextVertex++;
			}
		}
		// A face's `u` and `v` axes and its outward normal form a left-handed
		// set, so going round a quad from `u` towards `v` is clockwise from
		// outside; the triangles go the other way.
		for (let j = 0; j < segments; j++) {
			for (let i = 0; i < segments; i++) {
				const p00 = faceVertices[j * side + i] as number;
				const p10 = faceVertices[j * side + i + 1] as number;
				const p01 = faceVertices[(j + 1) * side + i] as number;
				const p11 = faceVertices[(j + 1) * side + i + 1] as number;
				indices[nextIndex++] = p00;
				indices[nextIndex++] = p01;
				indices[nextIndex++] = p10;
				indices[nextIndex++] = p10;
				indices[nextIndex++] = p01;
				indices[nextIndex++] = p11;
			}
		}
	}

	return { positions, indices };
};
