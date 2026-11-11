/**
 * The settings of a planet and its star, and what follows from them.
 *
 * A planet is set by five numbers, each a control with its own limits: the
 * tilt of its axis, the brightness and mass of its star, the radius of its
 * orbit, and the strength of its greenhouse effect. The orbit is a circle.
 * Brightness and mass are separate settings, so any brightness can go with
 * any mass.
 *
 * Two values follow from the settings alone: the sunlight the planet
 * receives compared with Earth, and the length of its year.
 *
 * A world also has a date, counted in years since it began.
 */

/** A planet's settings, each within its {@link PLANET_LIMITS}. */
export type PlanetSettings = {
	/** Angle between the planet's axis and its orbit's axis, in degrees. */
	readonly axialTiltDeg: number;
	/** The star's luminosity as a multiple of the Sun's. */
	readonly starBrightness: number;
	/** The star's mass as a multiple of the Sun's. */
	readonly starMass: number;
	/**
	 * The radius of the orbit in astronomical units: multiples of the mean
	 * distance between Earth and the Sun.
	 */
	readonly orbitDistanceAu: number;
	/**
	 * How strongly the atmosphere holds in heat, as a multiple of Earth's:
	 * 0 is no greenhouse effect at all.
	 */
	readonly greenhouseStrength: number;
};

/** The name of one of a planet's settings. */
export type PlanetSetting = keyof PlanetSettings;

/** The lowest and highest value a setting can take, both allowed. */
export type PlanetLimit = {
	readonly min: number;
	readonly max: number;
};

/** The settings of Earth, which every new world starts with. */
export const DEFAULT_PLANET: PlanetSettings = Object.freeze({
	axialTiltDeg: 23.44,
	starBrightness: 1,
	starMass: 1,
	orbitDistanceAu: 1,
	greenhouseStrength: 1,
});

/** The values each setting can take. */
export const PLANET_LIMITS: { readonly [K in PlanetSetting]: PlanetLimit } =
	Object.freeze({
		axialTiltDeg: Object.freeze({ min: 0, max: 90 }),
		starBrightness: Object.freeze({ min: 0.1, max: 10 }),
		starMass: Object.freeze({ min: 0.1, max: 10 }),
		orbitDistanceAu: Object.freeze({ min: 0.3, max: 3 }),
		greenhouseStrength: Object.freeze({ min: 0, max: 3 }),
	});

/** Every setting's name, in the order the settings are listed and written. */
export const PLANET_SETTINGS: readonly PlanetSetting[] = Object.freeze([
	'axialTiltDeg',
	'starBrightness',
	'starMass',
	'orbitDistanceAu',
	'greenhouseStrength',
]);

/** The date of a new world, in years since it began. */
export const DEFAULT_AGE_YEARS = 0;

/** The length of Earth's year in days: the Julian year. */
export const EARTH_YEAR_DAYS = 365.25;

/**
 * Settings in the form a world stores: every one a number within its
 * limits.
 *
 * @remarks
 * Everything that sets a world's planet from outside the core, such as a
 * control, must pass the settings through here. A setting that is not a
 * number, NaN included, has no nearest limit and is rejected; one beyond a
 * limit, infinity included, is brought to that limit.
 *
 * @param settings - The settings to normalise. They are not changed.
 * @returns New settings, holding only the five settings, in the order of
 * {@link PLANET_SETTINGS}.
 * @throws RangeError if any setting is not a number, NaN included.
 */
export const normalisePlanet = (settings: PlanetSettings): PlanetSettings => {
	const clamped: Record<PlanetSetting, number> = { ...DEFAULT_PLANET };
	for (const name of PLANET_SETTINGS) {
		const value: unknown = settings[name];
		if (typeof value !== 'number' || Number.isNaN(value)) {
			throw new RangeError(
				`A planet's ${name} must be a number; got ${typeof value}`,
			);
		}
		const { min, max } = PLANET_LIMITS[name];
		clamped[name] = Math.min(max, Math.max(min, value));
	}
	return clamped;
};

/**
 * The sunlight a planet receives, as a multiple of what Earth receives.
 *
 * @remarks
 * Sunlight falls off with the square of the distance from the star, so this
 * is the star's brightness over the orbit distance squared. It does not
 * depend on the star's mass.
 *
 * @param planet - The planet's settings.
 */
export const sunlightRelativeToEarth = (planet: PlanetSettings): number =>
	planet.starBrightness / (planet.orbitDistanceAu * planet.orbitDistanceAu);

/**
 * The length of a planet's year, in Earth days.
 *
 * @remarks
 * Kepler's third law, in Earth years for a distance in astronomical units
 * and a mass in multiples of the Sun's: the square root of the distance
 * cubed over the star's mass. The planet's own mass is taken as negligible
 * against the star's. It does not depend on the star's brightness.
 *
 * @param planet - The planet's settings.
 */
export const yearLengthDays = (planet: PlanetSettings): number =>
	EARTH_YEAR_DAYS * Math.sqrt(planet.orbitDistanceAu ** 3 / planet.starMass);

/** Whether a value is a date a world can hold: finite years from zero up. */
export const isAgeYears = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * A date in the form a world stores: a finite number of years from zero
 * up.
 *
 * @remarks
 * Everything that sets a world's date from outside the core must pass it
 * through here. A date has no upper limit to bring a value to, so a value
 * that is not a date is rejected rather than changed.
 *
 * @param value - Years since the world began.
 * @returns The value, with a negative zero turned to zero.
 * @throws RangeError if `value` is NaN, infinite or below zero.
 */
export const normaliseAgeYears = (value: number): number => {
	if (!isAgeYears(value)) {
		throw new RangeError(
			`A world's age must be a finite number of years from zero up; got ${value}`,
		);
	}
	return value + 0;
};
