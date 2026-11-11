import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../core/index';
import { clientToNdc, raySphere } from './picking';

const expectVec = (actual: Vec3 | null, expected: Vec3): void => {
	expect(actual).not.toBeNull();
	for (let axis = 0; axis < 3; axis++) {
		expect((actual as Vec3)[axis]).toBeCloseTo(expected[axis] as number, 12);
	}
};

describe('raySphere', () => {
	it('hits the near point of the sphere', () => {
		expectVec(raySphere([0, 0, 5], [0, 0, -1]), [0, 0, 1]);
	});

	it('ignores the length of the direction', () => {
		expectVec(raySphere([0, 0, 5], [0, 0, -40]), [0, 0, 1]);
	});

	it('hits a point off the axis', () => {
		const hit = raySphere([0.6, 0, 5], [0, 0, -1]);
		expectVec(hit, [0.6, 0, 0.8]);
	});

	it('misses outside the limb', () => {
		expect(raySphere([1.001, 0, 5], [0, 0, -1])).toBeNull();
		expect(raySphere([0, 0, 5], [1, 0, -1])).toBeNull();
	});

	it('touches the limb itself', () => {
		expectVec(raySphere([1, 0, 5], [0, 0, -1]), [1, 0, 0]);
	});

	it('returns the exit point for a ray starting inside', () => {
		expectVec(raySphere([0, 0, 0], [0, 1, 0]), [0, 1, 0]);
		expectVec(raySphere([0, 0, 0.5], [0, 0, -1]), [0, 0, -1]);
	});

	it('misses a sphere behind the ray', () => {
		expect(raySphere([0, 0, 5], [0, 0, 1])).toBeNull();
	});

	it('uses the radius it is given', () => {
		expectVec(raySphere([0, 0, 5], [0, 0, -1], 2), [0, 0, 2]);
		expect(raySphere([1.5, 0, 5], [0, 0, -1], 1)).toBeNull();
		expectVec(raySphere([0, 2, 5], [0, 0, -1], 2), [0, 2, 0]);
	});

	it('has no hit for a ray without a direction', () => {
		expect(raySphere([0, 0, 5], [0, 0, 0])).toBeNull();
		expect(raySphere([0, 0, 5], [0, 0, Number.NaN])).toBeNull();
		expect(raySphere([0, 0, 5], [0, 0, Number.POSITIVE_INFINITY])).toBeNull();
	});
});

describe('clientToNdc', () => {
	const rect = { left: 100, top: 50, width: 800, height: 400 };

	it('puts the middle of the rectangle at the origin', () => {
		expect(clientToNdc(500, 250, rect)).toEqual([0, 0]);
	});

	it('puts the top left corner at (-1, 1)', () => {
		expect(clientToNdc(100, 50, rect)).toEqual([-1, 1]);
	});

	it('puts the bottom right corner at (1, -1)', () => {
		expect(clientToNdc(900, 450, rect)).toEqual([1, -1]);
	});
});
