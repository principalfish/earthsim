import { describe, expect, it } from 'vitest';
import { SEVEN_STOP_RAMP, TWO_STOP_RAMP } from '../testing/rampFixtures';
import {
	type ColourRamp,
	checkRamp,
	cssColour,
	MAX_RAMP_STOPS,
	rampColourAt,
	rampGradient,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from './ramp';

/** CIE L* lightness, 0 to 100, of display (sRGB) channels from 0 to 1. */
const lightness = ([r, g, b]: readonly [number, number, number]): number => {
	const linear = (c: number): number =>
		c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	const y = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
	const f = y > 216 / 24389 ? Math.cbrt(y) : ((24389 / 27) * y + 16) / 116;
	return 116 * f - 16;
};

/**
 * The hue, in degrees from 0 to 360 with red at 0 and blue at 240, of
 * channels from 0 to 1 that are not all equal.
 */
const hue = ([r, g, b]: readonly [number, number, number]): number => {
	const max = Math.max(r, g, b);
	const span = max - Math.min(r, g, b);
	const sector =
		max === r
			? (g - b) / span
			: max === g
				? (b - r) / span + 2
				: (r - g) / span + 4;
	return (sector * 60 + 360) % 360;
};

describe('checkRamp', () => {
	it('passes the temperature ramp and gives it back', () => {
		expect(checkRamp(TEMPERATURE_RAMP)).toBe(TEMPERATURE_RAMP);
	});

	it('passes a ramp of the most stops there is room for but one', () => {
		expect(SEVEN_STOP_RAMP.stops).toHaveLength(MAX_RAMP_STOPS - 1);
		expect(checkRamp(SEVEN_STOP_RAMP)).toBe(SEVEN_STOP_RAMP);
	});

	it.each([
		['one stop', [{ at: 0, colour: 0 }]],
		[
			'too many stops',
			Array.from({ length: MAX_RAMP_STOPS + 1 }, (_, i) => ({
				at: i / MAX_RAMP_STOPS,
				colour: 0,
			})),
		],
		[
			'a first stop past 0',
			[
				{ at: 0.1, colour: 0 },
				{ at: 1, colour: 0 },
			],
		],
		[
			'a last stop short of 1',
			[
				{ at: 0, colour: 0 },
				{ at: 0.9, colour: 0 },
			],
		],
		[
			'stops out of order',
			[
				{ at: 0, colour: 0 },
				{ at: 0.6, colour: 0 },
				{ at: 0.6, colour: 0 },
				{ at: 1, colour: 0 },
			],
		],
		[
			'a colour out of range',
			[
				{ at: 0, colour: 0x1000000 },
				{ at: 1, colour: 0 },
			],
		],
		[
			'a colour that is not whole',
			[
				{ at: 0, colour: 0 },
				{ at: 1, colour: 0.5 },
			],
		],
	])('rejects a ramp with %s', (_, stops) => {
		expect(() => checkRamp({ name: 'bad', stops })).toThrow(RangeError);
	});
});

describe('rampColourAt', () => {
	it('blends linearly in display values between stops', () => {
		const [r, g, b] = rampColourAt(TWO_STOP_RAMP, 0.5);
		expect(r).toBeCloseTo(0.5, 10);
		expect(g).toBeCloseTo(0x80 / 255 / 2, 10);
		expect(b).toBe(0);
	});

	it('keeps to the end colours outside the ramp', () => {
		expect(rampColourAt(TWO_STOP_RAMP, -1)).toEqual([0, 0, 0]);
		expect(rampColourAt(TWO_STOP_RAMP, 2)).toEqual([1, 0x80 / 255, 0]);
	});
});

describe('rampGradient', () => {
	it('writes a stop for each of the ramp, in percent', () => {
		expect(rampGradient(TWO_STOP_RAMP)).toBe(
			'linear-gradient(to right, #000000 0%, #ff8000 100%)',
		);
	});

	it('writes stops between the ends to a few decimals', () => {
		expect(rampGradient(SEVEN_STOP_RAMP)).toContain('#2a2a2a 16.667%');
	});
});

describe('cssColour', () => {
	it('pads to six digits', () => {
		expect(cssColour(0x0b1d51)).toBe('#0b1d51');
		expect(cssColour(0)).toBe('#000000');
	});
});

describe('the temperature ramp', () => {
	it('starts dark blue', () => {
		const start = rampColourAt(TEMPERATURE_RAMP, 0);
		const [r, g, b] = start;
		expect(b).toBeGreaterThan(r * 2);
		expect(b).toBeGreaterThan(g * 2);
		expect(lightness(start)).toBeLessThan(20);
	});

	it('is red at the middle', () => {
		const [r, g, b] = rampColourAt(TEMPERATURE_RAMP, 0.5);
		expect(r).toBeGreaterThan(0.8);
		expect(r).toBeGreaterThan(g * 2.5);
		expect(r).toBeGreaterThan(b * 2.5);
	});

	it('ends pale yellow', () => {
		const end = rampColourAt(TEMPERATURE_RAMP, 1);
		const [r, g, b] = end;
		expect(r).toBeGreaterThan(0.95);
		expect(g).toBeGreaterThan(0.85);
		expect(b).toBeLessThan(g - 0.15);
		expect(b).toBeGreaterThan(0.55);
		expect(lightness(end)).toBeGreaterThan(90);
	});

	it('grows lighter at every step from the cold end to the hot', () => {
		const samples = 1000;
		let previous = lightness(rampColourAt(TEMPERATURE_RAMP, 0));
		for (let i = 1; i <= samples; i++) {
			const next = lightness(rampColourAt(TEMPERATURE_RAMP, i / samples));
			expect(next).toBeGreaterThan(previous);
			previous = next;
		}
	});
});

describe('the seasonal range ramp', () => {
	it('is one the globe can draw', () => {
		expect(checkRamp(SEASONAL_RANGE_RAMP)).toBe(SEASONAL_RANGE_RAMP);
	});

	it('starts nearly white and ends dark', () => {
		expect(lightness(rampColourAt(SEASONAL_RANGE_RAMP, 0))).toBeGreaterThan(95);
		expect(lightness(rampColourAt(SEASONAL_RANGE_RAMP, 1))).toBeLessThan(20);
	});

	it('keeps to one purple hue past its near-white end', () => {
		// The near-white end, up to the second stop, has too little colour
		// for its hue to mean much.
		const from = SEASONAL_RANGE_RAMP.stops[1]?.at as number;
		const samples = 100;
		for (let i = 0; i <= samples; i++) {
			const colour = rampColourAt(
				SEASONAL_RANGE_RAMP,
				from + ((1 - from) * i) / samples,
			);
			expect(Math.abs(hue(colour) - 255)).toBeLessThanOrEqual(20);
		}
	});

	it('gives the low end most of the colour, its stops at the squares of even steps', () => {
		expect(SEASONAL_RANGE_RAMP.stops.map((stop) => stop.at)).toEqual([
			0, 0.04, 0.16, 0.36, 0.64, 1,
		]);
	});

	it('is darker between its ends than the same colours evenly spaced', () => {
		const even: ColourRamp = {
			name: 'even',
			stops: SEASONAL_RANGE_RAMP.stops.map((stop, index, stops) => ({
				at: index / (stops.length - 1),
				colour: stop.colour,
			})),
		};
		// A quarter of the way up is darker than the evenly spaced colours
		// are at 45%.
		expect(lightness(rampColourAt(SEASONAL_RANGE_RAMP, 0.25))).toBeLessThan(
			lightness(rampColourAt(even, 0.45)),
		);
		const samples = 100;
		for (let i = 1; i < samples; i++) {
			const t = i / samples;
			expect(lightness(rampColourAt(SEASONAL_RANGE_RAMP, t))).toBeLessThan(
				lightness(rampColourAt(even, t)),
			);
		}
	});

	it('grows darker at every step from the low end to the high', () => {
		const samples = 1000;
		let previous = lightness(rampColourAt(SEASONAL_RANGE_RAMP, 0));
		for (let i = 1; i <= samples; i++) {
			const next = lightness(rampColourAt(SEASONAL_RANGE_RAMP, i / samples));
			expect(next).toBeLessThan(previous);
			previous = next;
		}
	});
});
