import { describe, expect, it } from 'vitest';
import { directionToFace, SUPPORTED_RESOLUTIONS } from '../../core/index';
import { buildSphereMesh, MAX_MESH_SEGMENTS, meshSegments } from './geometry';

describe('meshSegments', () => {
	it('gives two quads per cell edge while that fits', () => {
		expect(meshSegments(16)).toBe(32);
		expect(meshSegments(64)).toBe(128);
	});

	it('never exceeds the largest mesh', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			expect(meshSegments(resolution)).toBeLessThanOrEqual(MAX_MESH_SEGMENTS);
		}
		expect(meshSegments(256)).toBe(MAX_MESH_SEGMENTS);
	});
});

describe('buildSphereMesh', () => {
	it.each([1, 2, 5, 16])(
		'has the vertices and triangles of %i segments',
		(segments) => {
			const { positions, indices } = buildSphereMesh(segments);
			expect(positions.length).toBe(3 * (6 * segments * segments + 2));
			expect(indices.length).toBe(3 * 12 * segments * segments);
		},
	);

	it('puts every vertex on the unit sphere', () => {
		const { positions } = buildSphereMesh(8);
		for (let vertex = 0; vertex < positions.length / 3; vertex++) {
			const length = Math.hypot(
				positions[3 * vertex] as number,
				positions[3 * vertex + 1] as number,
				positions[3 * vertex + 2] as number,
			);
			expect(length).toBeCloseTo(1, 6);
		}
	});

	it('uses every vertex and no index out of range', () => {
		const { positions, indices } = buildSphereMesh(6);
		const used = new Set(indices);
		expect(used.size).toBe(positions.length / 3);
		expect(Math.max(...indices)).toBe(positions.length / 3 - 1);
	});

	it('shares vertices along cube edges, with no two in one place', () => {
		const { positions } = buildSphereMesh(6);
		const seen = new Set<string>();
		for (let vertex = 0; vertex < positions.length / 3; vertex++) {
			const key = [0, 1, 2]
				.map((axis) => (positions[3 * vertex + axis] as number).toFixed(5))
				.join(',');
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
	});

	it('is closed: every edge belongs to two triangles, once each way', () => {
		const { indices } = buildSphereMesh(5);
		const edges = new Set<string>();
		for (let t = 0; t < indices.length; t += 3) {
			for (let k = 0; k < 3; k++) {
				const from = indices[t + k] as number;
				const to = indices[t + ((k + 1) % 3)] as number;
				expect(edges.has(`${from}>${to}`)).toBe(false);
				edges.add(`${from}>${to}`);
			}
		}
		for (const edge of edges) {
			const [from, to] = edge.split('>');
			expect(edges.has(`${to}>${from}`)).toBe(true);
		}
	});

	it('winds every triangle anticlockwise seen from outside', () => {
		const { positions, indices } = buildSphereMesh(4);
		const point = (vertex: number): [number, number, number] => [
			positions[3 * vertex] as number,
			positions[3 * vertex + 1] as number,
			positions[3 * vertex + 2] as number,
		];
		for (let t = 0; t < indices.length; t += 3) {
			const a = point(indices[t] as number);
			const b = point(indices[t + 1] as number);
			const c = point(indices[t + 2] as number);
			const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
			const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
			const normal = [
				ab[1] * ac[2] - ab[2] * ac[1],
				ab[2] * ac[0] - ab[0] * ac[2],
				ab[0] * ac[1] - ab[1] * ac[0],
			] as const;
			const outward =
				normal[0] * (a[0] + b[0] + c[0]) +
				normal[1] * (a[1] + b[1] + c[1]) +
				normal[2] * (a[2] + b[2] + c[2]);
			expect(outward).toBeGreaterThan(0);
		}
	});

	it('places lattice points at equal steps of the face coordinates', () => {
		const segments = 4;
		const { positions } = buildSphereMesh(segments);
		for (let vertex = 0; vertex < positions.length / 3; vertex++) {
			const { s, t } = directionToFace([
				positions[3 * vertex] as number,
				positions[3 * vertex + 1] as number,
				positions[3 * vertex + 2] as number,
			]);
			expect(s * segments).toBeCloseTo(Math.round(s * segments), 5);
			expect(t * segments).toBeCloseTo(Math.round(t * segments), 5);
		}
	});

	it.each([0, -2, 1.5, Number.NaN])('rejects %j segments', (segments) => {
		expect(() => buildSphereMesh(segments)).toThrow(RangeError);
	});
});
