import { describe, expect, it } from 'vitest';
import { latLonToDirection, type Vec3 } from '../../core/index';
import { coreToThree, threeToCore } from './coords';

const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];

describe('coreToThree', () => {
	it('sends the north pole to +Y', () => {
		const [x, y, z] = coreToThree(latLonToDirection(90, 0));
		expect(x).toBeCloseTo(0, 12);
		expect(y).toBeCloseTo(1, 12);
		expect(z).toBeCloseTo(0, 12);
		expect(coreToThree([0, 0, 1])).toEqual([0, 1, 0]);
	});

	it('faces longitude 0 towards +Z with east to the right, on +X', () => {
		expect(coreToThree([1, 0, 0])).toEqual([0, 0, 1]);
		expect(coreToThree([0, 1, 0])).toEqual([1, 0, 0]);
	});

	it('is a rotation, not a mirror', () => {
		const x = coreToThree([1, 0, 0]);
		const y = coreToThree([0, 1, 0]);
		const z = coreToThree([0, 0, 1]);
		expect(cross(x, y)).toEqual(z);
	});

	it('keeps the length of a vector', () => {
		const v: Vec3 = [0.3, -1.7, 2.2];
		expect(Math.hypot(...coreToThree(v))).toBeCloseTo(Math.hypot(...v), 12);
	});
});

describe('threeToCore', () => {
	it('undoes coreToThree', () => {
		const v: Vec3 = [0.25, -0.5, 0.75];
		expect(threeToCore(coreToThree(v))).toEqual(v);
		expect(coreToThree(threeToCore(v))).toEqual(v);
	});

	it('sends +Y back to the north pole', () => {
		expect(threeToCore([0, 1, 0])).toEqual([0, 0, 1]);
	});
});
