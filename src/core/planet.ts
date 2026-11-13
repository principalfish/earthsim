/**
 * The settings of a planet and its star, and what follows from them.
 *
 * A planet is set by six numbers, each with its own limits: the tilt of its
 * axis, the brightness and mass of its star, the radius of its orbit, the
 * strength of its greenhouse effect, and the length of its day. The orbit is
 * a circle. Brightness and mass are separate settings, so any brightness can
 * go with any mass. The temperature depends on every setting but the day
 * length.
 *
 * Values follow from the settings alone: the sunlight the planet receives
 * compared with Earth, the length of its year, and how fast it turns.
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
	/** The time of one full turn of the planet, in hours. */
	readonly dayLengthHours: number;
};

/** The name of one of a planet's settings. */
export type PlanetSetting = keyof PlanetSettings;

/**
 * The name of one of the settings the temperature reads: every setting but
 * the day length, which the temperature does not depend on.
 */
export type TemperatureSetting = Exclude<PlanetSetting, 'dayLengthHours'>;

/**
 * The settings of a planet that the temperature reads. A planet's whole
 * {@link PlanetSettings} are also these.
 */
export type TemperaturePlanet = Pick<PlanetSettings, TemperatureSetting>;

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
	dayLengthHours: 24,
});

/** The values each setting can take. */
export const PLANET_LIMITS: { readonly [K in PlanetSetting]: PlanetLimit } =
	Object.freeze({
		axialTiltDeg: Object.freeze({ min: 0, max: 90 }),
		starBrightness: Object.freeze({ min: 0.1, max: 10 }),
		starMass: Object.freeze({ min: 0.1, max: 10 }),
		orbitDistanceAu: Object.freeze({ min: 0.3, max: 3 }),
		greenhouseStrength: Object.freeze({ min: 0, max: 3 }),
		dayLengthHours: Object.freeze({ min: 3, max: 720 }),
	});

/** Every setting's name, in the order the settings are listed and written. */
export const PLANET_SETTINGS: readonly PlanetSetting[] = Object.freeze([
	'axialTiltDeg',
	'starBrightness',
	'starMass',
	'orbitDistanceAu',
	'greenhouseStrength',
	'dayLengthHours',
]);

/**
 * The names of the settings the temperature reads, in the order of
 * {@link PLANET_SETTINGS}: every setting but the day length, which the
 * temperature does not depend on.
 */
export const TEMPERATURE_SETTINGS: readonly TemperatureSetting[] =
	Object.freeze([
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
 * A setting's value brought within its limits: a value beyond a limit,
 * infinity included, is brought to that limit, and a negative zero becomes
 * zero.
 *
 * @param name - The setting.
 * @param value - The value, a number that is not NaN.
 */
export const clampSetting = (name: PlanetSetting, value: number): number => {
	const { min, max } = PLANET_LIMITS[name];
	return Math.min(max, Math.max(min, value));
};

/**
 * The settings of a planet that the temperature reads, and nothing else.
 *
 * @param planet - The settings, whole or only those the temperature reads.
 * They are not changed.
 * @returns New settings, holding only {@link TEMPERATURE_SETTINGS}, in
 * their order.
 */
export const temperaturePlanet = (
	planet: TemperaturePlanet,
): TemperaturePlanet => ({
	axialTiltDeg: planet.axialTiltDeg,
	starBrightness: planet.starBrightness,
	starMass: planet.starMass,
	orbitDistanceAu: planet.orbitDistanceAu,
	greenhouseStrength: planet.greenhouseStrength,
});

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
 * @returns New settings, holding only the six settings, in the order of
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
		clamped[name] = clampSetting(name, value);
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

/** The number of seconds in an hour. */
const SECONDS_PER_HOUR = 3600;

/**
 * How fast a planet turns, in radians per second.
 *
 * @remarks
 * One full turn, 2π, over the day length in seconds. The day length is
 * taken as the time of one full turn, not corrected for the planet's
 * motion along its orbit through the year, so Earth's 24 hours give a rate
 * about 0.3% below its true one.
 *
 * @param planet - The planet's settings.
 */
export const rotationRate = (planet: PlanetSettings): number =>
	(2 * Math.PI) / (planet.dayLengthHours * SECONDS_PER_HOUR);

/**
 * The shortest day, in hours, that the winds are trusted for. This day
 * itself is trusted.
 */
export const TRUSTED_DAY_MIN_HOURS = 6;

/**
 * The longest day, in hours, that the winds are trusted for. This day
 * itself is trusted.
 */
export const TRUSTED_DAY_MAX_HOURS = 96;

/** Which way a planet's day lies outside the band the winds are trusted for. */
export type WindRoughSide = 'fast' | 'slow';

/**
 * Whether the winds for a planet are rough because of the length of its
 * day, and on which side.
 *
 * @param planet - The planet's settings.
 * @returns `'fast'` for a planet that turns too fast, its day shorter than
 * {@link TRUSTED_DAY_MIN_HOURS}; `'slow'` for one that turns too slowly, its
 * day longer than {@link TRUSTED_DAY_MAX_HOURS}; and null within the band,
 * both ends included.
 */
export const windTrustNote = (planet: PlanetSettings): WindRoughSide | null => {
	if (planet.dayLengthHours < TRUSTED_DAY_MIN_HOURS) {
		return 'fast';
	}
	if (planet.dayLengthHours > TRUSTED_DAY_MAX_HOURS) {
		return 'slow';
	}
	return null;
};

/**
 * How fast the temperature model's emissivity falls as the greenhouse
 * effect strengthens: the emissivity is `1 / (1 + k g)` for greenhouse
 * strength `g`, so Earth (`g = 1`) radiates with emissivity about 0.61.
 * The model takes its own greenhouse factor from here.
 */
export const GREENHOUSE_FACTOR = 0.633;

/**
 * The lowest warmth, from {@link warmthRelativeToEarth}, that the
 * temperature model is trusted for. This warmth itself is trusted.
 *
 * @remarks
 * The model is calibrated on the Earth, and at its cold edge a world
 * freezes over. Measured at 64 cells per face edge, solving from nothing,
 * the Earth freezes over at a warmth of 0.857 to 0.868 at every greenhouse
 * strength from 0 to 3: at sunlight 1.404 to 1.411 times Earth's with no
 * greenhouse effect, 1.068 to 1.073 at half Earth's, 0.864 to 0.868 at
 * Earth's, 0.723 to 0.727 at 1.5, 0.622 to 0.625 at 2 and 0.483 to 0.485
 * at 3. At Earth's greenhouse strength it is wholly frozen at 0.865 times
 * Earth's sunlight, with a mean of −37 °C, and ordinary at 0.87, at −1 °C
 * with 5% of it frozen. A generated world with 30% land freezes over at a
 * warmth of 0.860 to 0.872, and one all ocean at 0.835 to 0.848. The band
 * starts a little above all of these.
 */
export const TRUSTED_WARMTH_MIN = 0.9;

/**
 * The highest warmth, from {@link warmthRelativeToEarth}, that the
 * temperature model is trusted for. This warmth itself is trusted.
 *
 * @remarks
 * Measured as for {@link TRUSTED_WARMTH_MIN}, the Earth's mean temperature
 * passes 33 °C at a warmth of 1.243 to 1.274 at every greenhouse strength
 * from 0 to 3: at sunlight 2.069 to 2.081 times Earth's with no greenhouse
 * effect, 1.562 to 1.571 at half Earth's, 1.251 to 1.258 at Earth's, 1.043
 * to 1.049 at 1.5, 0.896 to 0.901 at 2 and 0.701 to 0.705 at 3. A
 * generated world with 30% land passes it at 1.237 to 1.259, and one all
 * ocean at 1.215 to 1.237. The band ends near the lowest of the Earth's.
 */
export const TRUSTED_WARMTH_MAX = 1.25;

/**
 * The sunlight a planet receives and the strength of its greenhouse effect
 * as one measure of how warm they make it, with Earth's 1.
 *
 * @remarks
 * The sunlight from {@link sunlightRelativeToEarth}, times `1 + k g` over
 * Earth's `1 + k`, for greenhouse strength `g` and the model's
 * {@link GREENHOUSE_FACTOR} `k`: the sunlight over the emissivity, against
 * Earth's. The model's edges, where a world freezes over and where it grows
 * very hot, fall at nearly the same warmth whatever the greenhouse
 * strength.
 *
 * @param planet - The planet's settings.
 */
export const warmthRelativeToEarth = (planet: PlanetSettings): number =>
	sunlightRelativeToEarth(planet) *
	((1 + GREENHOUSE_FACTOR * planet.greenhouseStrength) /
		(1 + GREENHOUSE_FACTOR));

/** Which way a planet lies outside the band the model is trusted for. */
export type RoughSide = 'cold' | 'hot';

/**
 * Whether the temperature model's results for a planet are rough, and on
 * which side.
 *
 * @param planet - The planet's settings.
 * @returns `'cold'` for a warmth below {@link TRUSTED_WARMTH_MIN}, `'hot'`
 * for one above {@link TRUSTED_WARMTH_MAX}, and null within the band, both
 * ends included.
 */
export const trustNote = (planet: PlanetSettings): RoughSide | null => {
	const warmth = warmthRelativeToEarth(planet);
	if (warmth < TRUSTED_WARMTH_MIN) {
		return 'cold';
	}
	if (warmth > TRUSTED_WARMTH_MAX) {
		return 'hot';
	}
	return null;
};

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
