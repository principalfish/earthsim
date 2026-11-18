import { describe, expect, it } from 'vitest';
import {
	deriveSeed,
	fractalNoise3,
	gradientNoise3,
	isSeed,
	MAX_SEED,
	OCTAVE_GAIN,
	OCTAVE_LACUNARITY,
	ridgedNoise3,
} from './noise';

const SEED = 20_261_110;

/**
 * Values recorded from this implementation. The noise is built from exactly
 * specified operations, so they must match to the last bit on every engine;
 * a change here means every seed now gives a different world.
 */
const PINNED_DERIVED_SEEDS = [
	878_757_171, 2_878_796_419, 3_891_511_729,
] as const;
const PINNED_GRADIENT = [
	0.12061519151231861, -0.31156002474509004, 0.2649614938894037,
] as const;
const PINNED_FRACTAL = [
	0.16486018908819086, -0.2722299709248125, 0.24470774568751777,
] as const;
const PINNED_RIDGED = [0.6201566448189753, 0.6972346184499381] as const;

/** Sample positions spread through a few hundred lattice cells. */
const SAMPLE_COUNT = 20_000;

/**
 * The `index`-th sample position: steps by irrational-looking amounts so
 * that the samples fall all over their lattice cells, on both sides of the
 * origin.
 */
const samplePoint = (index: number): [number, number, number] => [
	index * 0.013_71 - 137.1,
	index * 0.007_13 + 0.5,
	71.3 - index * 0.003_37,
];

type Noise = (x: number, y: number, z: number) => number;

/** The lowest, highest and mean value of a noise over the sample positions. */
const summarise = (
	noise: Noise,
): { min: number; max: number; mean: number } => {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	let sum = 0;
	for (let index = 0; index < SAMPLE_COUNT; index++) {
		const value = noise(...samplePoint(index));
		min = Math.min(min, value);
		max = Math.max(max, value);
		sum += value;
	}
	return { min, max, mean: sum / SAMPLE_COUNT };
};

/** The largest change of a noise over a step of `step` along each axis. */
const largestStep = (noise: Noise, step: number): number => {
	let largest = 0;
	for (let index = 0; index < SAMPLE_COUNT; index++) {
		const [x, y, z] = samplePoint(index);
		const here = noise(x, y, z);
		largest = Math.max(
			largest,
			Math.abs(noise(x + step, y, z) - here),
			Math.abs(noise(x, y + step, z) - here),
			Math.abs(noise(x, y, z + step) - here),
		);
	}
	return largest;
};

describe('seeds', () => {
	it('are the unsigned 32-bit integers', () => {
		expect(MAX_SEED).toBe(4_294_967_295);
	});

	it.each([0, 1, 20_261_110, MAX_SEED])('accepts %d', (value) => {
		expect(isSeed(value)).toBe(true);
	});

	it.each([
		-1,
		0.5,
		MAX_SEED + 1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	])('rejects %d', (value) => {
		expect(isSeed(value)).toBe(false);
	});
});

describe('deriveSeed', () => {
	it('gives a seed, and the same one every time', () => {
		for (const seed of [0, 1, SEED, MAX_SEED]) {
			for (let stream = 0; stream < 8; stream++) {
				const derived = deriveSeed(seed, stream);
				expect(isSeed(derived)).toBe(true);
				expect(deriveSeed(seed, stream)).toBe(derived);
			}
		}
	});

	it('gives every stream of every seed a seed of its own', () => {
		const derived = new Set<number>();
		for (let seed = 0; seed < 64; seed++) {
			for (let stream = 0; stream < 16; stream++) {
				derived.add(deriveSeed(seed, stream));
			}
		}
		expect(derived.size).toBe(64 * 16);
	});

	it('scatters neighbouring seeds across the whole range', () => {
		let sum = 0;
		for (let seed = 0; seed < 4096; seed++) {
			sum += deriveSeed(seed, 1) / MAX_SEED;
		}
		// The mean of 4,096 even draws from 0 to 1 has a standard deviation
		// of 0.0045.
		expect(sum / 4096).toBeGreaterThan(0.47);
		expect(sum / 4096).toBeLessThan(0.53);
	});

	it('is pinned', () => {
		expect(deriveSeed(0, 0)).toBe(PINNED_DERIVED_SEEDS[0]);
		expect(deriveSeed(SEED, 1)).toBe(PINNED_DERIVED_SEEDS[1]);
		expect(deriveSeed(MAX_SEED, 7)).toBe(PINNED_DERIVED_SEEDS[2]);
	});
});

describe('gradientNoise3', () => {
	const noise: Noise = (x, y, z) => gradientNoise3(SEED, x, y, z);

	it('is zero at every lattice point', () => {
		for (const [x, y, z] of [
			[0, 0, 0],
			[1, 2, 3],
			[-4, 5, -6],
			[1000, -1000, 17],
		] as const) {
			// The sign of the zero is of no interest.
			expect(Math.abs(gradientNoise3(SEED, x, y, z))).toBe(0);
		}
	});

	it('stays within -1 to 1 and uses most of that range', () => {
		const { min, max, mean } = summarise(noise);
		expect(min).toBeGreaterThanOrEqual(-1);
		expect(max).toBeLessThanOrEqual(1);
		expect(min).toBeLessThan(-0.6);
		expect(max).toBeGreaterThan(0.6);
		expect(Math.abs(mean)).toBeLessThan(0.05);
	});

	it('gives the same value for the same seed and position', () => {
		expect(gradientNoise3(SEED, 1.25, -2.5, 3.75)).toBe(
			gradientNoise3(SEED, 1.25, -2.5, 3.75),
		);
	});

	it('gives another field for another seed', () => {
		let different = 0;
		for (let index = 0; index < 1000; index++) {
			const [x, y, z] = samplePoint(index);
			if (gradientNoise3(SEED, x, y, z) !== gradientNoise3(SEED + 1, x, y, z)) {
				different++;
			}
		}
		expect(different).toBeGreaterThan(990);
	});

	it('is continuous, across lattice planes as within cells', () => {
		// The steepest the noise can be is a few units per unit of distance.
		expect(largestStep(noise, 1e-6)).toBeLessThan(1e-5);
		for (const edge of [-3, 0, 1, 250]) {
			const below = gradientNoise3(SEED, edge - 1e-9, 0.3, 0.7);
			const above = gradientNoise3(SEED, edge + 1e-9, 0.3, 0.7);
			expect(Math.abs(above - below)).toBeLessThan(1e-7);
		}
	});

	it('is pinned', () => {
		expect(gradientNoise3(SEED, 0.5, 0.5, 0.5)).toBe(PINNED_GRADIENT[0]);
		expect(gradientNoise3(SEED, -3.7, 12.1, 0.3)).toBe(PINNED_GRADIENT[1]);
		expect(gradientNoise3(0, 100.25, -50.75, 7.125)).toBe(PINNED_GRADIENT[2]);
	});
});

describe('fractalNoise3', () => {
	it('is the gradient noise when it has one octave', () => {
		for (let index = 0; index < 100; index++) {
			const [x, y, z] = samplePoint(index);
			expect(fractalNoise3(SEED, x, y, z, 1)).toBe(
				gradientNoise3(SEED, x, y, z),
			);
		}
	});

	it('halves the amplitude and doubles the frequency by default', () => {
		expect(OCTAVE_GAIN).toBe(0.5);
		expect(OCTAVE_LACUNARITY).toBe(2);
		expect(fractalNoise3(SEED, 0.3, 0.6, 0.9, 5)).toBe(
			fractalNoise3(SEED, 0.3, 0.6, 0.9, 5, OCTAVE_GAIN),
		);
	});

	it('stays within -1 to 1 around a mean of zero', () => {
		const { min, max, mean } = summarise((x, y, z) =>
			fractalNoise3(SEED, x, y, z, 6),
		);
		expect(min).toBeGreaterThanOrEqual(-1);
		expect(max).toBeLessThanOrEqual(1);
		expect(min).toBeLessThan(-0.3);
		expect(max).toBeGreaterThan(0.3);
		expect(Math.abs(mean)).toBeLessThan(0.05);
	});

	it('does not vanish where its first octave does', () => {
		expect(Math.abs(fractalNoise3(SEED, 1, 2, 3, 1))).toBe(0);
		expect(fractalNoise3(SEED, 1, 2, 3, 4)).not.toBe(0);
	});

	it('is rougher with more octaves and with a higher gain', () => {
		const roughness = (octaves: number, gain?: number): number =>
			largestStep(
				(x, y, z) => fractalNoise3(SEED, x, y, z, octaves, gain),
				0.01,
			);
		expect(roughness(6)).toBeGreaterThan(roughness(1));
		expect(roughness(6, 0.7)).toBeGreaterThan(roughness(6));
	});

	it('is pinned', () => {
		expect(fractalNoise3(SEED, 0.5, 0.5, 0.5, 6)).toBe(PINNED_FRACTAL[0]);
		expect(fractalNoise3(SEED, -3.7, 12.1, 0.3, 4)).toBe(PINNED_FRACTAL[1]);
		expect(fractalNoise3(0, 0.25, -0.75, 0.125, 6, 0.6)).toBe(
			PINNED_FRACTAL[2],
		);
	});
});

describe('ridgedNoise3', () => {
	it('is the squared distance from a zero of the gradient noise with one octave', () => {
		for (let index = 0; index < 100; index++) {
			const [x, y, z] = samplePoint(index);
			const ridge = 1 - Math.abs(gradientNoise3(SEED, x, y, z));
			expect(ridgedNoise3(SEED, x, y, z, 1)).toBe(ridge * ridge);
		}
	});

	it('peaks at 1 where the gradient noise is zero', () => {
		expect(ridgedNoise3(SEED, 1, 2, 3, 1)).toBe(1);
	});

	it('stays within 0 to 1, with crests well above the valleys', () => {
		const { min, max, mean } = summarise((x, y, z) =>
			ridgedNoise3(SEED, x, y, z, 4),
		);
		expect(min).toBeGreaterThanOrEqual(0);
		expect(max).toBeLessThanOrEqual(1);
		expect(min).toBeLessThan(0.2);
		expect(max).toBeGreaterThan(0.85);
		expect(mean).toBeGreaterThan(0.3);
		expect(mean).toBeLessThan(0.7);
	});

	it('is pinned', () => {
		expect(ridgedNoise3(SEED, 0.5, 0.5, 0.5, 4)).toBe(PINNED_RIDGED[0]);
		expect(ridgedNoise3(0, -3.7, 12.1, 0.3, 3)).toBe(PINNED_RIDGED[1]);
	});
});
