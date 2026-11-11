import { describe, expect, it } from 'vitest';
import {
	DEFAULT_AGE_YEARS,
	DEFAULT_PLANET,
	EARTH_YEAR_DAYS,
	normaliseAgeYears,
	normalisePlanet,
	PLANET_LIMITS,
	PLANET_SETTINGS,
	type PlanetSettings,
	sunlightRelativeToEarth,
	yearLengthDays,
} from './planet';

/**
 * The host's structured clone, which is how a world reaches a worker. It is
 * not part of the ES2022 library the core is type-checked against.
 */
declare const structuredClone: <T>(value: T) => T;

/** Earth's settings with some of them changed. */
const planetWith = (changes: Partial<PlanetSettings>): PlanetSettings => ({
	...DEFAULT_PLANET,
	...changes,
});

describe('the settings', () => {
	it('start from Earth’s', () => {
		expect(DEFAULT_PLANET).toEqual({
			axialTiltDeg: 23.44,
			starBrightness: 1,
			starMass: 1,
			orbitDistanceAu: 1,
			greenhouseStrength: 1,
		});
		expect(DEFAULT_AGE_YEARS).toBe(0);
	});

	it('have the limits of their controls', () => {
		expect(PLANET_LIMITS).toEqual({
			axialTiltDeg: { min: 0, max: 90 },
			starBrightness: { min: 0.1, max: 10 },
			starMass: { min: 0.1, max: 10 },
			orbitDistanceAu: { min: 0.3, max: 3 },
			greenhouseStrength: { min: 0, max: 3 },
		});
	});

	it('are listed once each, in the order Earth’s are', () => {
		expect(PLANET_SETTINGS).toEqual(Object.keys(DEFAULT_PLANET));
		expect(Object.keys(PLANET_LIMITS)).toEqual(PLANET_SETTINGS);
	});

	it('start within their limits', () => {
		for (const name of PLANET_SETTINGS) {
			expect(DEFAULT_PLANET[name]).toBeGreaterThanOrEqual(
				PLANET_LIMITS[name].min,
			);
			expect(DEFAULT_PLANET[name]).toBeLessThanOrEqual(PLANET_LIMITS[name].max);
		}
	});

	it('cannot be changed where they are shared', () => {
		expect(Object.isFrozen(DEFAULT_PLANET)).toBe(true);
		expect(Object.isFrozen(PLANET_LIMITS)).toBe(true);
		expect(Object.isFrozen(PLANET_LIMITS.starMass)).toBe(true);
		expect(Object.isFrozen(PLANET_SETTINGS)).toBe(true);
	});

	it('are plain data that survive a structured clone', () => {
		const copy = structuredClone(DEFAULT_PLANET);
		expect(copy).toEqual(DEFAULT_PLANET);
		expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
	});
});

describe('normalisePlanet', () => {
	it('leaves settings within the limits as they are', () => {
		const planet: PlanetSettings = {
			axialTiltDeg: 60,
			starBrightness: 0.5,
			starMass: 2,
			orbitDistanceAu: 1.5,
			greenhouseStrength: 0,
		};
		expect(normalisePlanet(planet)).toEqual(planet);
		expect(normalisePlanet(DEFAULT_PLANET)).toEqual(DEFAULT_PLANET);
	});

	it('gives new settings and leaves those it was given alone', () => {
		const planet = planetWith({ starMass: 50 });
		const normalised = normalisePlanet(planet);
		expect(normalised).not.toBe(planet);
		expect(planet.starMass).toBe(50);
		expect(normalisePlanet(DEFAULT_PLANET)).not.toBe(DEFAULT_PLANET);
	});

	it.each(PLANET_SETTINGS)('clamps %s at both limits', (name) => {
		const { min, max } = PLANET_LIMITS[name];
		const at = (value: number): number =>
			normalisePlanet(planetWith({ [name]: value }))[name];
		expect(at(min)).toBe(min);
		expect(at(max)).toBe(max);
		expect(at(min - 0.001)).toBe(min);
		expect(at(max + 0.001)).toBe(max);
		expect(at(-1e9)).toBe(min);
		expect(at(1e9)).toBe(max);
		expect(at(Number.NEGATIVE_INFINITY)).toBe(min);
		expect(at(Number.POSITIVE_INFINITY)).toBe(max);
	});

	it.each(PLANET_SETTINGS)(
		'rejects a value of %s that is not a number',
		(name) => {
			for (const value of [Number.NaN, undefined, null, '1', [1], true]) {
				const planet = { ...DEFAULT_PLANET, [name]: value } as PlanetSettings;
				expect(() => normalisePlanet(planet), String(value)).toThrow(
					RangeError,
				);
			}
		},
	);

	it('turns a negative zero into zero', () => {
		const normalised = normalisePlanet(
			planetWith({ axialTiltDeg: -0, greenhouseStrength: -0 }),
		);
		expect(Object.is(normalised.axialTiltDeg, 0)).toBe(true);
		expect(Object.is(normalised.greenhouseStrength, 0)).toBe(true);
	});

	it('keeps only the five settings, in their order', () => {
		const planet = {
			moons: 3,
			...planetWith({ greenhouseStrength: 2 }),
		} as PlanetSettings;
		const normalised = normalisePlanet(planet);
		expect(Object.keys(normalised)).toEqual(PLANET_SETTINGS);
		expect(normalised.greenhouseStrength).toBe(2);
	});
});

describe('sunlightRelativeToEarth', () => {
	it('is 1 for Earth', () => {
		expect(sunlightRelativeToEarth(DEFAULT_PLANET)).toBeCloseTo(1, 12);
	});

	it('follows the star’s brightness over the distance squared', () => {
		for (const starBrightness of [0.1, 0.5, 1, 4, 10]) {
			for (const orbitDistanceAu of [0.3, 0.7, 1, 2, 3]) {
				expect(
					sunlightRelativeToEarth(
						planetWith({ starBrightness, orbitDistanceAu }),
					),
				).toBeCloseTo(starBrightness / orbitDistanceAu ** 2, 12);
			}
		}
		expect(sunlightRelativeToEarth(planetWith({ orbitDistanceAu: 2 }))).toBe(
			0.25,
		);
		expect(sunlightRelativeToEarth(planetWith({ starBrightness: 4 }))).toBe(4);
	});

	it('does not depend on the star’s mass, the tilt or the greenhouse', () => {
		const earth = sunlightRelativeToEarth(DEFAULT_PLANET);
		for (const changes of [
			{ starMass: 0.1 },
			{ starMass: 10 },
			{ axialTiltDeg: 90 },
			{ greenhouseStrength: 3 },
		]) {
			expect(sunlightRelativeToEarth(planetWith(changes))).toBe(earth);
		}
	});
});

describe('yearLengthDays', () => {
	it('is 365.25 days for Earth, within 0.1%', () => {
		expect(EARTH_YEAR_DAYS).toBe(365.25);
		const days = yearLengthDays(DEFAULT_PLANET);
		expect(Math.abs(days - 365.25) / 365.25).toBeLessThan(0.001);
	});

	it('is about 2.83 Earth years at twice the distance from a star like the Sun', () => {
		const years =
			yearLengthDays(planetWith({ orbitDistanceAu: 2 })) / EARTH_YEAR_DAYS;
		expect(years).toBeCloseTo(2 * Math.SQRT2, 10);
		expect(years).toBeCloseTo(2.83, 2);
	});

	it('is half an Earth year at Earth’s distance from a star of four solar masses', () => {
		expect(yearLengthDays(planetWith({ starMass: 4 }))).toBeCloseTo(
			EARTH_YEAR_DAYS / 2,
			10,
		);
	});

	it('follows the square root of the distance cubed over the mass', () => {
		for (const orbitDistanceAu of [0.3, 0.5, 1, 1.7, 3]) {
			for (const starMass of [0.1, 0.5, 1, 3, 10]) {
				expect(
					yearLengthDays(planetWith({ orbitDistanceAu, starMass })),
				).toBeCloseTo(
					EARTH_YEAR_DAYS * Math.sqrt(orbitDistanceAu ** 3 / starMass),
					8,
				);
			}
		}
	});

	it('does not depend on the star’s brightness, the tilt or the greenhouse', () => {
		const earth = yearLengthDays(DEFAULT_PLANET);
		for (const changes of [
			{ starBrightness: 0.1 },
			{ starBrightness: 10 },
			{ axialTiltDeg: 90 },
			{ greenhouseStrength: 0 },
		]) {
			expect(yearLengthDays(planetWith(changes))).toBe(earth);
		}
	});
});

describe('normaliseAgeYears', () => {
	it.each([0, 1, 0.5, 12_000, 2.4e6, 4.5e9, Number.MAX_VALUE])(
		'leaves an age of %d years as it is',
		(years) => {
			expect(normaliseAgeYears(years)).toBe(years);
		},
	);

	it('turns a negative zero into zero', () => {
		expect(Object.is(normaliseAgeYears(-0), 0)).toBe(true);
	});

	it.each([
		-1,
		-1e-9,
		-Number.MAX_VALUE,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	])('rejects an age of %d years', (years) => {
		expect(() => normaliseAgeYears(years)).toThrow(RangeError);
	});
});
