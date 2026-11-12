/**
 * The star as the planet sees it: how big and what colour it is, and where
 * in the sky it stands.
 *
 * The star's radius is estimated from its mass alone, as for a star on the
 * main sequence, and its surface temperature from its brightness and that
 * radius. Brightness and mass are separate settings, so a pairing no real
 * star has gives a radius and a temperature no real star has either; every
 * value here is still finite, and the colour is clamped to the range real
 * stars span.
 *
 * Directions are in core coordinates: +Z north, longitude 0 at +X and east
 * towards +Y.
 */

import { latLonToDirection, type Vec3 } from './grid';
import { MONTHS_PER_YEAR, subsolarLatitude } from './insolation';
import type { PlanetSettings } from './planet';

/** A colour as red, green and blue, each from 0 to 1. */
export type Rgb = readonly [number, number, number];

/** The Sun's surface temperature, in kelvin. */
export const SUN_TEMPERATURE_K = 5772;

/**
 * The Sun's angular diameter seen from Earth's mean distance, in degrees.
 */
export const SUN_ANGULAR_DIAMETER_DEG = 0.533;

/**
 * The diameter the star is drawn at for Earth's settings, in degrees.
 */
export const SUN_DRAWN_DIAMETER_DEG = 2.7;

/** The coolest surface temperature a star's colour is taken at, in kelvin. */
export const STAR_COLOUR_MIN_K = 2500;

/** The hottest surface temperature a star's colour is taken at, in kelvin. */
export const STAR_COLOUR_MAX_K = 15000;

/**
 * The longitude the star stands over, in degrees east: −60, 60° west of
 * longitude 0, which is the longitude the camera faces when the page opens.
 *
 * @remarks
 * The star stays over this longitude through the year, moving only north
 * and south, so the day side always faces it. When the page opens it is
 * behind the viewer and to the left, so sunlight falls on the globe from
 * the left with the edge of the night in view; the star itself comes into
 * sight only once the globe is turned to show its night side.
 */
export const SUN_LONGITUDE_DEG = -60;

/**
 * The exponent of the star's mass that gives its radius, for a star no
 * heavier than the Sun.
 */
const LIGHT_STAR_RADIUS_EXPONENT = 0.8;

/**
 * The exponent of the star's mass that gives its radius, for a star heavier
 * than the Sun.
 */
const HEAVY_STAR_RADIUS_EXPONENT = 0.57;

/** A surface temperature in kelvin and the colour of a black body at it. */
type BlackBody = { readonly kelvin: number; readonly rgb: Rgb };

/** A temperature's colour, given in display values from 0 to 255. */
const blackBody = (
	kelvin: number,
	red: number,
	green: number,
	blue: number,
): BlackBody => ({
	kelvin,
	rgb: [red / 255, green / 255, blue / 255],
});

/**
 * The colour of a black body at a range of surface temperatures, as display
 * (sRGB) values with a D65 white, scaled so that the brightest channel is
 * 1: approximately the colours of stars of those temperatures. In order of
 * temperature, from {@link STAR_COLOUR_MIN_K} to {@link STAR_COLOUR_MAX_K}.
 */
const STAR_COLOURS: readonly BlackBody[] = [
	blackBody(2500, 255, 161, 72),
	blackBody(3000, 255, 180, 107),
	blackBody(3500, 255, 196, 137),
	blackBody(4000, 255, 209, 163),
	blackBody(4500, 255, 219, 186),
	blackBody(5000, 255, 228, 206),
	blackBody(5500, 255, 236, 224),
	blackBody(6000, 255, 243, 239),
	blackBody(6500, 255, 249, 253),
	blackBody(7000, 245, 243, 255),
	blackBody(8000, 227, 233, 255),
	blackBody(9000, 214, 225, 255),
	blackBody(10000, 204, 219, 255),
	blackBody(12000, 191, 211, 255),
	blackBody(15000, 179, 204, 255),
];

/**
 * A star's radius from its mass, by the main-sequence relation.
 *
 * @remarks
 * The mass to the power 0.8 for a star no heavier than the Sun and to the
 * power 0.57 for a heavier one: the two meet at the Sun, whose radius is 1.
 *
 * @param mass - The star's mass as a multiple of the Sun's; positive.
 * @returns The radius as a multiple of the Sun's.
 */
export const starRadius = (mass: number): number =>
	mass <= 1
		? mass ** LIGHT_STAR_RADIUS_EXPONENT
		: mass ** HEAVY_STAR_RADIUS_EXPONENT;

/**
 * A star's surface temperature from its brightness and mass.
 *
 * @remarks
 * A star's brightness is its surface area times the fourth power of its
 * temperature, so against the Sun the temperature is the Sun's times the
 * fourth root of the brightness over the radius squared, with the radius
 * from {@link starRadius}.
 *
 * @param brightness - The star's luminosity as a multiple of the Sun's;
 * positive.
 * @param mass - The star's mass as a multiple of the Sun's; positive.
 * @returns The temperature in kelvin.
 */
export const starTemperature = (brightness: number, mass: number): number => {
	const radius = starRadius(mass);
	return SUN_TEMPERATURE_K * (brightness / (radius * radius)) ** 0.25;
};

/**
 * The tint of a star of a surface temperature.
 *
 * @remarks
 * Red for the coolest stars, through orange and yellow to near white at the
 * Sun's temperature and blue-white for the hottest: the colour of a black
 * body, blended linearly between temperatures a few hundred to a few
 * thousand kelvin apart. The temperature is first brought within
 * {@link STAR_COLOUR_MIN_K} and {@link STAR_COLOUR_MAX_K}. The share of red
 * against blue falls as the temperature rises.
 *
 * @param temperature - The surface temperature in kelvin; not NaN.
 * @returns The tint, its brightest channel 1.
 * @throws RangeError for a NaN temperature.
 */
export const starColour = (temperature: number): Rgb => {
	if (Number.isNaN(temperature)) {
		throw new RangeError("A star's surface temperature must not be NaN");
	}
	const kelvin = Math.min(
		STAR_COLOUR_MAX_K,
		Math.max(STAR_COLOUR_MIN_K, temperature),
	);
	/** The colour at `kelvin`, blended between an entry and the one before. */
	const blend = (index: number): Rgb => {
		const low = STAR_COLOURS[index - 1] as BlackBody;
		const high = STAR_COLOURS[index] as BlackBody;
		const t = (kelvin - low.kelvin) / (high.kelvin - low.kelvin);
		const channel = (at: 0 | 1 | 2): number =>
			low.rgb[at] + t * (high.rgb[at] - low.rgb[at]);
		return [channel(0), channel(1), channel(2)];
	};
	// The last entry is STAR_COLOUR_MAX_K, so a temperature above every
	// other entry lies between the last two.
	const last = STAR_COLOURS.length - 1;
	for (let index = 1; index < last; index++) {
		if (kelvin <= (STAR_COLOURS[index] as BlackBody).kelvin) {
			return blend(index);
		}
	}
	return blend(last);
};

/**
 * The tint of a planet's star, from {@link starColour} at the temperature
 * {@link starTemperature} gives for the star's brightness and mass.
 *
 * @param planet - The planet's settings.
 */
export const sunColour = (planet: PlanetSettings): Rgb =>
	starColour(starTemperature(planet.starBrightness, planet.starMass));

/**
 * The star's true angular diameter seen from the planet, in degrees.
 *
 * @remarks
 * The Sun's from Earth, {@link SUN_ANGULAR_DIAMETER_DEG}, times the star's
 * radius from {@link starRadius} over the orbit distance. Small enough
 * that the angle is taken as proportional to the ratio.
 *
 * @param planet - The planet's settings.
 */
export const sunApparentSize = (planet: PlanetSettings): number =>
	(SUN_ANGULAR_DIAMETER_DEG * starRadius(planet.starMass)) /
	planet.orbitDistanceAu;

/**
 * The diameter the star is drawn at, in degrees: not to scale.
 *
 * @remarks
 * {@link SUN_DRAWN_DIAMETER_DEG} times the square root of the true diameter,
 * from {@link sunApparentSize}, over the Sun's from Earth. True to scale,
 * the star would be a fraction of a pixel across at most settings and fill
 * most of the view at the extremes; the square root keeps it a visible disc
 * at every setting, about 0.6° to 9.5° across the settings' ranges, while
 * still growing and shrinking with the true size.
 *
 * @param planet - The planet's settings.
 */
export const sunDrawnSize = (planet: PlanetSettings): number =>
	SUN_DRAWN_DIAMETER_DEG *
	Math.sqrt(sunApparentSize(planet) / SUN_ANGULAR_DIAMETER_DEG);

/**
 * The direction of the star from the planet in a month.
 *
 * @remarks
 * Over {@link SUN_LONGITUDE_DEG}, at the latitude where the star stands
 * overhead in the middle of the month, from {@link subsolarLatitude}.
 *
 * @param month - The month, from January at 0 to December at 11.
 * @param planet - The planet's settings.
 * @returns A unit vector in core coordinates.
 * @throws RangeError if `month` is not finite.
 */
export const sunDirection = (month: number, planet: PlanetSettings): Vec3 =>
	latLonToDirection(
		subsolarLatitude((month + 0.5) / MONTHS_PER_YEAR, planet),
		SUN_LONGITUDE_DEG,
	);
