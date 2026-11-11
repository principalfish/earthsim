import { describe, expect, it } from 'vitest';
import {
	createBlankWorld,
	generateWorld,
	MAX_SEED,
	SUPPORTED_RESOLUTIONS,
	type World,
} from '../../core/index';
import { describeWorld, formatLandPercent } from './worldPanel';

/** A world that says it was generated, without the cost of generating it. */
const generatedWorld = (
	resolution: number,
	seed: number,
	landFraction: number,
): World => ({
	...createBlankWorld(resolution),
	origin: { kind: 'generated', seed, landFraction },
});

describe('formatLandPercent', () => {
	it('writes every whole percentage the slider gives as that percentage', () => {
		for (let percent = 0; percent <= 100; percent++) {
			expect(formatLandPercent(percent / 100)).toBe(`${percent}%`);
		}
	});

	it('writes a fraction that is not a whole percentage in full', () => {
		expect(formatLandPercent(0.125)).toBe('12.5%');
		expect(formatLandPercent(0.305)).toBe('30.5%');
		expect(formatLandPercent(0.3001)).toBe('30.01%');
		expect(formatLandPercent(1 / 3)).toBe('33.3333333333%');
		expect(formatLandPercent(0.004)).toBe('0.4%');
	});

	it('does not show the noise of binary fractions', () => {
		// 0.123 * 100 is 12.299999999999999 in double precision.
		expect(formatLandPercent(0.123)).toBe('12.3%');
	});
});

describe('describeWorld', () => {
	it('describes a blank world by its resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			expect(describeWorld(createBlankWorld(resolution))).toBe(
				`Blank ocean · ${resolution}`,
			);
		}
	});

	it('describes a generated world by its resolution, seed and land', () => {
		expect(
			describeWorld(generateWorld({ seed: 1977, landFraction: 0.3 })),
		).toBe('Generated · 64 · seed 1977 · 30% land');
		expect(describeWorld(generatedWorld(128, 0, 0))).toBe(
			'Generated · 128 · seed 0 · 0% land',
		);
		expect(describeWorld(generatedWorld(256, 42, 1))).toBe(
			'Generated · 256 · seed 42 · 100% land',
		);
	});

	it('writes the seed without grouping its digits', () => {
		expect(describeWorld(generatedWorld(64, MAX_SEED, 0.3))).toBe(
			'Generated · 64 · seed 4294967295 · 30% land',
		);
	});

	it('writes land that is not a whole percentage in full', () => {
		expect(describeWorld(generatedWorld(64, 7, 0.455))).toBe(
			'Generated · 64 · seed 7 · 45.5% land',
		);
	});

	it('describes how the world started, whatever has been done to it since', () => {
		const world = generatedWorld(64, 7, 0.3);
		world.seaLevel = 500;
		world.elevation.fill(1000);
		expect(describeWorld(world)).toBe('Generated · 64 · seed 7 · 30% land');
	});
});
