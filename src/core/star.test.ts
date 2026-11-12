import { describe, expect, it } from 'vitest';
import { directionToLatLon } from './grid';
import { NORTHERN_SOLSTICE_FRACTION, subsolarLatitude } from './insolation';
import { DEFAULT_PLANET, PLANET_LIMITS, type PlanetSettings } from './planet';
import {
	type Rgb,
	STAR_COLOUR_MAX_K,
	STAR_COLOUR_MIN_K,
	SUN_ANGULAR_DIAMETER_DEG,
	SUN_DRAWN_DIAMETER_DEG,
	SUN_LONGITUDE_DEG,
	SUN_TEMPERATURE_K,
	starColour,
	starRadius,
	starTemperature,
	sunApparentSize,
	sunColour,
	sunDirection,
	sunDrawnSize,
} from './star';

const planetWith = (changes: Partial<PlanetSettings>): PlanetSettings => ({
	...DEFAULT_PLANET,
	...changes,
});

/** The share of red against blue in a tint. */
const redOverBlue = (colour: Rgb): number => colour[0] / colour[2];

/** Every pairing of the lowest and highest of the star's settings. */
const CORNERS: PlanetSettings[] = [];
for (const starBrightness of Object.values(PLANET_LIMITS.starBrightness)) {
	for (const starMass of Object.values(PLANET_LIMITS.starMass)) {
		for (const orbitDistanceAu of Object.values(
			PLANET_LIMITS.orbitDistanceAu,
		)) {
			for (const axialTiltDeg of Object.values(PLANET_LIMITS.axialTiltDeg)) {
				CORNERS.push(
					planetWith({
						starBrightness,
						starMass,
						orbitDistanceAu,
						axialTiltDeg,
					}),
				);
			}
		}
	}
}

describe('a Sun-like star', () => {
	it('has the radius and the surface temperature of the Sun', () => {
		expect(starRadius(1)).toBe(1);
		expect(starTemperature(1, 1)).toBeCloseTo(SUN_TEMPERATURE_K, 6);
		expect(SUN_TEMPERATURE_K).toBe(5772);
	});

	it('is tinted near white', () => {
		const colour = starColour(starTemperature(1, 1));
		for (const channel of colour) {
			expect(channel).toBeGreaterThan(0.85);
			expect(channel).toBeLessThanOrEqual(1);
		}
		expect(Math.max(...colour)).toBe(1);
	});
});

describe('starRadius', () => {
	it('follows the main-sequence relation on each side of the Sun', () => {
		expect(starRadius(0.5)).toBeCloseTo(0.5 ** 0.8, 12);
		expect(starRadius(2)).toBeCloseTo(2 ** 0.57, 12);
	});

	it('is continuous at the Sun and grows with mass', () => {
		expect(starRadius(1 - 1e-9)).toBeCloseTo(1, 6);
		expect(starRadius(1 + 1e-9)).toBeCloseTo(1, 6);
		const masses = [0.1, 0.3, 0.9, 1, 1.1, 3, 10];
		const radii = masses.map(starRadius);
		radii.slice(1).forEach((radius, index) => {
			expect(radius).toBeGreaterThan(radii[index] as number);
		});
	});
});

describe('starTemperature', () => {
	it('rises with brightness at a fixed mass', () => {
		expect(starTemperature(2, 1)).toBeGreaterThan(starTemperature(1, 1));
		expect(starTemperature(0.5, 3)).toBeLessThan(starTemperature(1, 3));
	});

	it('falls with mass at a fixed brightness', () => {
		expect(starTemperature(1, 2)).toBeLessThan(starTemperature(1, 1));
		expect(starTemperature(1, 0.5)).toBeGreaterThan(starTemperature(1, 1));
	});
});

describe('starColour', () => {
	it('is redder for a dim, light star and bluer for a bright, heavy one', () => {
		const sun = redOverBlue(starColour(starTemperature(1, 1)));
		const dim = redOverBlue(starColour(starTemperature(0.04, 0.5)));
		const bright = redOverBlue(starColour(starTemperature(16, 2)));
		expect(dim).toBeGreaterThan(sun);
		expect(bright).toBeLessThan(sun);
		expect(dim).toBeGreaterThan(1.5);
		expect(bright).toBeLessThan(0.9);
	});

	it('loses red against blue as the temperature rises, all the way', () => {
		let previous = Number.POSITIVE_INFINITY;
		for (
			let kelvin = STAR_COLOUR_MIN_K;
			kelvin <= STAR_COLOUR_MAX_K;
			kelvin += 50
		) {
			const ratio = redOverBlue(starColour(kelvin));
			expect(ratio).toBeLessThan(previous);
			previous = ratio;
		}
	});

	it('clamps the temperature at both ends', () => {
		expect(STAR_COLOUR_MIN_K).toBe(2500);
		expect(STAR_COLOUR_MAX_K).toBe(15000);
		expect(starColour(1000)).toEqual(starColour(STAR_COLOUR_MIN_K));
		expect(starColour(Number.NEGATIVE_INFINITY)).toEqual(
			starColour(STAR_COLOUR_MIN_K),
		);
		expect(starColour(40000)).toEqual(starColour(STAR_COLOUR_MAX_K));
		expect(starColour(Number.POSITIVE_INFINITY)).toEqual(
			starColour(STAR_COLOUR_MAX_K),
		);
	});

	it('blends linearly between two entries of its table', () => {
		// A quarter of the way from the 2,500 K entry to the 3,000 K one, in
		// display values from 0 to 255.
		const lower = [255, 161, 72] as const;
		const upper = [255, 180, 107] as const;
		const colour = starColour(2625);
		for (const index of [0, 1, 2] as const) {
			expect(colour[index]).toBeCloseTo(
				(lower[index] + 0.25 * (upper[index] - lower[index])) / 255,
				12,
			);
		}
	});

	it('refuses a NaN temperature', () => {
		expect(() => starColour(Number.NaN)).toThrow(RangeError);
	});

	it('runs from red at the cool end to blue-white at the hot end', () => {
		const [coolRed, , coolBlue] = starColour(STAR_COLOUR_MIN_K);
		const [hotRed, , hotBlue] = starColour(STAR_COLOUR_MAX_K);
		expect(coolRed).toBe(1);
		expect(coolBlue).toBeLessThan(0.5);
		expect(hotBlue).toBe(1);
		expect(hotRed).toBeGreaterThan(0.5);
		expect(hotRed).toBeLessThan(0.8);
	});
});

describe('sunColour', () => {
	it('is the tint of the star’s temperature from its brightness and mass', () => {
		const planet = planetWith({ starBrightness: 0.3, starMass: 0.7 });
		expect(sunColour(planet)).toEqual(starColour(starTemperature(0.3, 0.7)));
	});
});

describe('sunApparentSize', () => {
	it('is the Sun’s from Earth for Earth’s settings', () => {
		expect(sunApparentSize(DEFAULT_PLANET)).toBeCloseTo(
			SUN_ANGULAR_DIAMETER_DEG,
			12,
		);
		expect(SUN_ANGULAR_DIAMETER_DEG).toBe(0.533);
	});

	it('doubles when the orbit distance halves', () => {
		const far = sunApparentSize(planetWith({ orbitDistanceAu: 2 }));
		const near = sunApparentSize(planetWith({ orbitDistanceAu: 1 }));
		expect(near).toBeCloseTo(2 * far, 12);
	});

	it('grows with the star’s mass', () => {
		expect(sunApparentSize(planetWith({ starMass: 2 }))).toBeGreaterThan(
			sunApparentSize(DEFAULT_PLANET),
		);
		expect(sunApparentSize(planetWith({ starMass: 0.5 }))).toBeLessThan(
			sunApparentSize(DEFAULT_PLANET),
		);
	});
});

describe('sunDrawnSize', () => {
	it('is 2.7° for Earth’s settings', () => {
		expect(SUN_DRAWN_DIAMETER_DEG).toBe(2.7);
		expect(sunDrawnSize(DEFAULT_PLANET)).toBeCloseTo(2.7, 12);
	});

	it('follows the square root of the true size', () => {
		// A quarter of the distance makes the true size four times as large.
		const near = planetWith({ orbitDistanceAu: 0.5 });
		const far = planetWith({ orbitDistanceAu: 2 });
		expect(sunDrawnSize(near)).toBeCloseTo(2 * sunDrawnSize(far), 12);
		expect(sunDrawnSize(near) / sunDrawnSize(DEFAULT_PLANET)).toBeCloseTo(
			Math.sqrt(sunApparentSize(near) / sunApparentSize(DEFAULT_PLANET)),
			12,
		);
	});

	it('runs from about 0.6° to 9.5° across the settings', () => {
		const sizes = CORNERS.map(sunDrawnSize);
		expect(Math.min(...sizes)).toBeCloseTo(0.62, 2);
		expect(Math.max(...sizes)).toBeCloseTo(9.5, 1);
	});
});

describe('at every corner of the settings', () => {
	it.each(
		CORNERS.map((planet) => [
			`${planet.starBrightness} ${planet.starMass} ${planet.orbitDistanceAu} ${planet.axialTiltDeg}`,
			planet,
		]),
	)('gives finite values within their clamps: %s', (_name, planet) => {
		const radius = starRadius(planet.starMass);
		const temperature = starTemperature(planet.starBrightness, planet.starMass);
		expect(Number.isFinite(radius) && radius > 0).toBe(true);
		expect(Number.isFinite(temperature) && temperature > 0).toBe(true);
		for (const channel of starColour(temperature)) {
			expect(channel).toBeGreaterThan(0);
			expect(channel).toBeLessThanOrEqual(1);
		}
		const apparent = sunApparentSize(planet);
		const drawn = sunDrawnSize(planet);
		expect(Number.isFinite(apparent) && apparent > 0).toBe(true);
		expect(drawn).toBeGreaterThan(0.6);
		expect(drawn).toBeLessThan(9.6);
		for (let month = 0; month < 12; month++) {
			const direction = sunDirection(month, planet);
			expect(Math.hypot(...direction)).toBeCloseTo(1, 12);
		}
	});
});

describe('the latitude the star stands overhead at', () => {
	const JUNE = NORTHERN_SOLSTICE_FRACTION;
	const DECEMBER = NORTHERN_SOLSTICE_FRACTION + 0.5;

	it('is the tilt north in June, south in December and zero at the equinoxes', () => {
		expect(subsolarLatitude(JUNE, DEFAULT_PLANET)).toBeCloseTo(23.44, 10);
		expect(subsolarLatitude(DECEMBER, DEFAULT_PLANET)).toBeCloseTo(-23.44, 10);
		expect(subsolarLatitude(JUNE - 0.25, DEFAULT_PLANET)).toBeCloseTo(0, 10);
		expect(subsolarLatitude(JUNE + 0.25, DEFAULT_PLANET)).toBeCloseTo(0, 10);
	});

	it('is always the equator at no tilt', () => {
		const upright = planetWith({ axialTiltDeg: 0 });
		for (let step = 0; step <= 24; step++) {
			expect(subsolarLatitude(step / 24, upright)).toBe(0);
		}
	});

	it('reaches the pole at a tilt of 90°', () => {
		const sideways = planetWith({ axialTiltDeg: 90 });
		expect(subsolarLatitude(JUNE, sideways)).toBeCloseTo(90, 10);
		expect(subsolarLatitude(DECEMBER, sideways)).toBeCloseTo(-90, 10);
	});
});

describe('sunDirection', () => {
	it('stands 60° west of longitude 0', () => {
		expect(SUN_LONGITUDE_DEG).toBe(-60);
	});

	it('is a unit vector over the fixed longitude in every month', () => {
		for (let month = 0; month < 12; month++) {
			const direction = sunDirection(month, DEFAULT_PLANET);
			expect(Math.hypot(...direction)).toBeCloseTo(1, 12);
			expect(directionToLatLon(direction).longitudeDeg).toBeCloseTo(
				SUN_LONGITUDE_DEG,
				10,
			);
		}
	});

	it('is at the latitude overhead in the middle of the month', () => {
		const direction = sunDirection(3, DEFAULT_PLANET);
		expect(directionToLatLon(direction).latitudeDeg).toBeCloseTo(
			subsolarLatitude(3.5 / 12, DEFAULT_PLANET),
			10,
		);
	});

	it('is north of the equator in June and south of it in December', () => {
		expect(sunDirection(5, DEFAULT_PLANET)[2]).toBeGreaterThan(0.3);
		expect(sunDirection(11, DEFAULT_PLANET)[2]).toBeLessThan(-0.3);
	});

	it('refuses a month that is not finite', () => {
		expect(() => sunDirection(Number.NaN, DEFAULT_PLANET)).toThrow(RangeError);
	});
});
