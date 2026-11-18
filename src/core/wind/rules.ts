/**
 * The rules wind model: a sea-level pressure map built by rules from the
 * month's temperature, and the surface wind that follows from it.
 *
 * Each month's pressure is a reference pressure plus two parts:
 *
 * - Zonal bands ({@link zonalBands}): a low along the latitude where the
 *   zonal-mean temperature is highest (moved further from the equator, to
 *   make up for the temperature model's own seasons), highs at the edges of
 *   the overturning tropical cell, and beyond them lows and highs in turn,
 *   one band to each further cell, out to the poles. The cells' width, and
 *   so how many there are, follows the rotation rate and the
 *   equator-to-pole contrast of temperature. In the tropics and subtropics
 *   the low, and the tropical cell's edges with it, lie instead where the
 *   temperature within a long window of longitude is highest
 *   ({@link localBands}), so that the bands over an ocean follow the
 *   ocean's seasons and those over a continent the continent's, blending
 *   into the one pattern round the globe towards the poles.
 * - Thermal highs and lows ({@link thermalPressure}): each cell's
 *   temperature brought down to sea level, less the mean of its latitude,
 *   so that a place colder than its latitude carries higher pressure and a
 *   hotter one lower, more over low land than over the sea or high ground,
 *   smoothed over several hundred kilometres.
 *
 * The parts are then shifted together so that the globe's area-weighted
 * mean is the reference: the model neither makes air nor loses it.
 *
 * The wind follows from the pressure by one balance everywhere
 * ({@link windsFromPressure}): the push of the pressure gradient, the
 * turning of the planet and a linear friction, which gives flow along the
 * isobars and across them towards low pressure away from the equator, and
 * straight down the gradient at it. Land has more friction than sea, and
 * high ground turns the wind along its slopes rather than over them.
 *
 * The model reads the season from the temperature alone: neither the month
 * nor the planet's tilt is read. Its settings ({@link DEFAULT_WIND_SETTINGS},
 * which a run may override) are rough: some start from a
 * published or textbook figure, the rest are guesses, and several were
 * then tuned by hand against the observed Earth, or against the invented
 * cases, so that the winds are right in kind; they are not physical
 * truth.
 *
 * The way in is `solveWinds`, in `solve.ts`, which checks its input and
 * works the pressure out on the 64 grid. Here are the model's parts:
 * {@link rulesPressureMonth} and {@link rulesPressure} for the pressure,
 * {@link windsFromPressure} and {@link windsFromPressures} for the wind
 * that follows, and {@link rulesWindsOnGrid}, the two together on the
 * world's own grid.
 */

import { constantsOf, type ValuesOf, valuesOf, WIND_CONFIG } from '../config';
import { type Grid, getGrid } from '../grid/grid';
import {
	createVectorField,
	type EastNorthField,
	gradient,
	smoothField,
	toEastNorth,
} from '../grid/vector';
import { cellLatitudes, MONTHS_PER_YEAR } from '../planet/insolation';
import {
	DEFAULT_PLANET,
	type PlanetSettings,
	rotationRate,
} from '../planet/planet';
import { lapseCooling } from '../temperature/temperature';
import { PLANET_RADIUS_KM, type World } from '../world/world';
import { type WindResult, type ZonalMean, zonalMean } from './model';

const RADIANS_PER_DEGREE = Math.PI / 180;

/** The model's fixed choices, which a run cannot override: see {@link WIND_CONFIG}. */
const FIXED_CHOICES = constantsOf(WIND_CONFIG);

/** Pascals in a hectopascal, for gradients in pascals a metre. */
const PASCALS_PER_HPA = 100;

/** The planet's radius in metres, for gradients per metre. */
const RADIUS_M = PLANET_RADIUS_KM * 1000;

/**
 * The globe's area-weighted mean sea-level pressure, in hectopascals, that
 * every month's pressure is shifted to.
 *
 * Its value and where it comes from are the `referencePressureHpa` entry of
 * {@link WIND_CONFIG}.
 */
export const REFERENCE_PRESSURE_HPA: number =
	FIXED_CHOICES.referencePressureHpa;

/**
 * The density of the air near the surface, in kilograms a cubic metre,
 * which turns a pressure gradient into the push on the wind.
 *
 * Its value and where it comes from are the `airDensityKgM3` entry of
 * {@link WIND_CONFIG}.
 */
export const AIR_DENSITY_KG_M3: number = FIXED_CHOICES.airDensityKgM3;

/**
 * How many bands of latitude, of 2° each, the month's zonal-mean
 * temperature is taken in: fine enough to place the low to well under a
 * band, and coarse enough that every band holds cells on the 64 grid.
 */
export const PROFILE_BANDS = 90;

/** How fast the Earth turns, for the scalings below. */
const EARTH_ROTATION_RATE = rotationRate(DEFAULT_PLANET);

/**
 * The width of the Earth's tropical (Hadley) cell, in degrees of latitude
 * from the low to the subtropical high, and of each cell beyond it: the
 * width every other planet's cells are scaled from.
 *
 * Its value and where it comes from are the `earthCellWidthDeg` entry of
 * {@link WIND_CONFIG}.
 */
export const EARTH_CELL_WIDTH_DEG: number = FIXED_CHOICES.earthCellWidthDeg;

/**
 * The step, in degrees of latitude, at which {@link zonalBands} tabulates
 * the bands' pressure, which is taken between steps by straight lines:
 * well under a cell's width on the finest grid.
 */
export const TABLE_STEP_DEG = 0.25;

/**
 * The model's settings, each a number, under the names
 * {@link DEFAULT_WIND_SETTINGS} gives them, each with what it is.
 */
export type WindSettings = ValuesOf<typeof WIND_CONFIG>;

/**
 * The model's settings as it runs by default: the rough figures it is
 * built on, written down in {@link WIND_CONFIG} with where each comes from
 * and whether it was tuned. A run may override any of them (see
 * {@link windSettings}); the page and its worker never do, and the tuning
 * script, `npm run tune:winds`, does.
 */
export const DEFAULT_WIND_SETTINGS: WindSettings = valuesOf(WIND_CONFIG);

/** The name of one of the model's settings. */
export type WindSettingName = keyof WindSettings;

/** The names of the model's settings, in the order they are given. */
export const WIND_SETTING_NAMES: readonly WindSettingName[] = Object.freeze(
	Object.keys(DEFAULT_WIND_SETTINGS) as WindSettingName[],
);

const isSettingName = (name: string): name is WindSettingName =>
	Object.hasOwn(DEFAULT_WIND_SETTINGS, name);

/**
 * The model's settings for a run: {@link DEFAULT_WIND_SETTINGS} with some
 * of them overridden.
 *
 * @remarks
 * A setting left out, or given as `undefined`, keeps its default. With
 * nothing overridden the defaults themselves are returned, so a run with
 * no overrides is the default run exactly. The values are not checked
 * against what makes sense, but for one pair: one far from its default, or
 * of the other sign, may give winds that are not finite.
 *
 * @param overrides - The settings to change, by name. Not changed.
 * @returns The full settings, frozen.
 * @throws RangeError if an override's name is not a setting's, or its
 * value is not a finite number; or if `localBandsGlobalFromDeg` does not
 * lie beyond `localBandsFullToDeg`, which would put a step in the bands'
 * pressure.
 */
export const windSettings = (
	overrides: Partial<WindSettings> = {},
): WindSettings => {
	const given = Object.entries(overrides).filter(
		([, value]) => value !== undefined,
	);
	if (given.length === 0) {
		return DEFAULT_WIND_SETTINGS;
	}
	for (const [name, value] of given) {
		if (!isSettingName(name)) {
			throw new RangeError(
				`${name} is not one of the wind model's settings: ${WIND_SETTING_NAMES.join(', ')}`,
			);
		}
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			throw new RangeError(
				`The wind setting ${name} must be a finite number; got ${String(value)}`,
			);
		}
	}
	const settings: WindSettings = Object.freeze({
		...DEFAULT_WIND_SETTINGS,
		...Object.fromEntries(given),
	});
	if (settings.localBandsGlobalFromDeg <= settings.localBandsFullToDeg) {
		throw new RangeError(
			`The wind setting localBandsGlobalFromDeg (${settings.localBandsGlobalFromDeg}) must lie beyond localBandsFullToDeg (${settings.localBandsFullToDeg})`,
		);
	}
	return settings;
};

/** The Coriolis parameter at 45°, for a rotation rate in radians a second. */
const coriolisAt45 = (omega: number): number => 2 * omega * Math.SQRT1_2;

/** The zonal bands of one month's pressure. */
export type ZonalBands = {
	/**
	 * The hottest latitude, in degrees: the mean latitude of the bands
	 * within `hotWindowK` of the hottest.
	 */
	readonly hottestLatitude: number;
	/** The latitude of the low, in degrees. */
	readonly lowLatitude: number;
	/**
	 * The farthest from the equator the low may lie, in degrees: about 70°
	 * for cells no wider than the Earth's, and the pole for cells of 60° and
	 * wider (see `lowLimitDeg`).
	 */
	readonly lowLimit: number;
	/**
	 * The tropical cell's edge towards the north, in degrees: where its
	 * high lies, or 90° when the cell reaches the pole, its high then at the
	 * pole or, when the pole cuts the cell short, nowhere.
	 */
	readonly northEdge: number;
	/** The tropical cell's edge towards the south, from −90°. */
	readonly southEdge: number;
	/**
	 * The cells' natural width in degrees of latitude, up to 90°: the
	 * tropical cell's on the equator, and every cell's beyond it.
	 */
	readonly cellWidth: number;
	/**
	 * How many cells lie between the low and the north pole, the tropical
	 * one's side among them: not always a whole number, since the cells
	 * beyond the tropical one need not fit a whole number of times, and
	 * under 1 when the pole cuts the tropical cell short, down to 0 with the
	 * low at the pole. It is the phase of {@link zonalBands} at the pole.
	 */
	readonly northCells: number;
	/** How many cells lie between the low and the south pole. */
	readonly southCells: number;
	/**
	 * The share, 0 to 1, of the bands' slope kept north of the low, by how
	 * much cooler the north pole is than the low (see `sideContrastK`).
	 */
	readonly northStrength: number;
	/** The share of the bands' slope kept south of the low. */
	readonly southStrength: number;
	/**
	 * Half the tropical cell's rise in hectopascals, before it is scaled by
	 * latitude: `bandAmplitudeHpa` times the cells' width over the Earth's.
	 */
	readonly amplitude: number;
	/** The equator-to-pole contrast of temperature taken, in kelvin. */
	readonly contrast: number;
	/**
	 * The bands' pressure at a latitude, in hectopascals above the low's:
	 * 0 at the low, rising to the tropical cell's highs, then falling and
	 * rising in turn beyond them.
	 *
	 * @param latitude - Degrees, from −90 to 90.
	 */
	readonly offset: (latitude: number) => number;
};

/** A zonal mean's values, a band with no cell taking its nearest band's. */
const filledMeans = (profile: ZonalMean): Float64Array => {
	const { means } = profile;
	const values = new Float64Array(means.length);
	let known = -1;
	for (let band = 0; band < means.length; band++) {
		const mean = means[band];
		if (mean !== null && mean !== undefined) {
			for (let gap = known + 1; gap < band; gap++) {
				const before = known < 0 ? mean : (values[known] as number);
				values[gap] = band - gap <= gap - known ? mean : before;
			}
			values[band] = mean;
			known = band;
		}
	}
	if (known < 0) {
		throw new RangeError('A zonal mean must hold at least one band’s value');
	}
	for (let gap = known + 1; gap < means.length; gap++) {
		values[gap] = values[known] as number;
	}
	return values;
};

/**
 * A profile's value at a latitude, by straight lines between the bands'
 * middles, and the end bands' values beyond them. The bands are of equal
 * width from −90°.
 */
const valueAt = (values: Float64Array, latitude: number): number => {
	const count = values.length;
	const position = ((latitude + 90) * count) / 180 - 0.5;
	if (position <= 0) {
		return values[0] as number;
	}
	if (position >= count - 1) {
		return values[count - 1] as number;
	}
	const below = Math.floor(position);
	const share = position - below;
	return (
		(values[below] as number) * (1 - share) +
		(values[below + 1] as number) * share
	);
};

/** 0 below 0, 1 above 1, and a smooth S between, flat at both ends. */
const smoothStep = (x: number): number => {
	const t = Math.min(1, Math.max(0, x));
	return t * t * (3 - 2 * t);
};

/**
 * Over how many cells of phase the start of the outer bands' weakening
 * turns from the third band to `fullBandsReachDeg` from the low, so that
 * the bands have no corner as the day length changes.
 *
 * Its value and where it comes from are the `fullBandsEaseCells` entry of
 * {@link WIND_CONFIG}.
 */
export const FULL_BANDS_EASE_CELLS: number = FIXED_CHOICES.fullBandsEaseCells;

/**
 * The larger of 0 and a number, eased over {@link FULL_BANDS_EASE_CELLS}
 * above 0: exactly 0 at or below 0, `x²/(2h)` up to `h`, and `x − h/2`
 * beyond, with no corner anywhere.
 */
const easedAbove = (x: number): number => {
	const h = FULL_BANDS_EASE_CELLS;
	if (x <= 0) {
		return 0;
	}
	return x < h ? (x * x) / (2 * h) : x - h / 2;
};

/**
 * The zonal pressure bands of one month, placed from its zonal-mean
 * sea-level temperature and the planet's rotation.
 *
 * @remarks
 * The settings named here are {@link DEFAULT_WIND_SETTINGS}'s, or the
 * run's overrides of them. The hottest latitude is the mean latitude of
 * the bands within `hotWindowK` of the hottest, and the low lies about
 * `lowShiftGain` times as far from the equator near it, and at the hottest
 * latitude itself well away from it (see `lowShiftFadeDeg`). The cells'
 * natural width is {@link EARTH_CELL_WIDTH_DEG} times `(Ω_E / Ω)^½` (see
 * `rotationPower`) times the contrast's share of the Earth's to the power
 * `contrastPower`, that share taken from `minContrastRatio` to
 * `maxContrastRatio`, and the width at most 90°. The contrast is the
 * temperature at the hottest latitude less the mean of the two polar
 * bands'. The low is held short of a limit from the equator,
 * `lowLimitDeg` while the cells are no wider than `lowLimitFromWidthDeg`
 * and moving smoothly to the pole as they widen to `lowLimitToWidthDeg`;
 * it nears the limit smoothly, from a knee short of it (see
 * `lowLimitEaseShare`), so that a low short of the knee, as the Earth's
 * always is, lies where it was placed. The tropical cell's edges lie a
 * cell's width either side of the equator, moved towards the low by
 * `edgeShiftShare` of its latitude (less as the cell widens), and at least
 * `minSummerCellShare` of a width from the low, that least widening to a
 * whole cell as the low lies out from `wideSummerFromShare` to
 * `wideSummerToShare` of a width; an edge that would lie beyond a pole is
 * cut short at it, the side's phase (below) reaching the pole short of 1.
 * Beyond the edges come further cells of the natural width out to the
 * poles, as many as fit, the last perhaps in part.
 *
 * Along each side of the low a phase runs from 0 at the low to 1 at the
 * tropical cell's edge, then up by one for each further cell's width. The
 * bands' pressure goes as `−A cos(π · phase)`, with `A` the
 * {@link ZonalBands.amplitude}: the low, the subtropical high, a subpolar
 * low, a polar high and so on. Its slope in latitude, `A π sin(π · phase)`
 * times the rate at which the phase grows, is then scaled at each
 * latitude by `√(f² + k²)` over its Earth value at 45°, where `f` is the
 * Coriolis parameter there and `k` is `seaFrictionPerS`: the gradient a
 * wind of a given speed is balanced by (see {@link windsFromPressure}), so
 * that the bands' winds are about as strong at every latitude and every
 * day length, as the observed trades and westerlies are, while the
 * pressure rises gently in the tropics and steeply in mid-latitudes.
 * Beyond the second cell from the low, or beyond `fullBandsReachDeg` from
 * it on a planet spinning faster than the Earth, the slope is scaled by
 * `outerCellShare`; on each side of the
 * low it is scaled by that side's strength (see `sideContrastK`), so that
 * a side whose pole is as warm as the low has no bands, and no high stands
 * beyond a low held short of a pole warmer than it; and within
 * `poleTaperDeg` of a pole it is eased to nothing. The slope is summed by
 * the trapezoidal rule every {@link TABLE_STEP_DEG}, so the pressure has
 * no step anywhere.
 *
 * @param profile - The month's zonal-mean sea-level temperature, in
 * degrees Celsius, in bands of equal width from the south, as
 * {@link zonalMean} gives it. A band with no value takes its nearest
 * band's. Not changed.
 * @param planet - The planet's settings: only its day length is read.
 * @param overrides - Settings to change from {@link DEFAULT_WIND_SETTINGS}
 * for this run; none by default. Not changed.
 * @returns New bands.
 * @throws RangeError if the profile holds no value at all, or a value that
 * is not finite; and, from {@link windSettings}, if an override is not a
 * setting or not a finite number.
 */
export const zonalBands = (
	profile: ZonalMean,
	planet: PlanetSettings,
	overrides: Partial<WindSettings> = {},
): ZonalBands => {
	const settings = windSettings(overrides);
	const frame = bandFrame(filledMeans(profile), planet, settings);
	return bandsOf(frame, frame.shapeFor(frame.lowLatitude));
};

/** The zonal bands of a frame and a shape, as {@link zonalBands} gives them. */
const bandsOf = (frame: BandFrame, shape: BandShape): ZonalBands => ({
	hottestLatitude: frame.hottestLatitude,
	lowLatitude: frame.lowLatitude,
	lowLimit: frame.lowLimit,
	northEdge: shape.northEdge,
	southEdge: shape.southEdge,
	cellWidth: frame.cellWidth,
	northCells: shape.northCells,
	southCells: shape.southCells,
	northStrength: frame.northStrength,
	southStrength: frame.southStrength,
	amplitude: frame.amplitude,
	contrast: frame.contrast,
	offset: shape.offset,
});

/**
 * The hottest latitude of a profile's filled values, as {@link zonalBands}
 * takes it: the mean latitude of the bands within `hotWindowK` of the
 * hottest, each weighted by how far above that it is and by its area.
 *
 * @throws RangeError if a value is not finite.
 */
const hottestLatitudeOf = (
	values: Float64Array,
	settings: WindSettings,
): number => {
	const count = values.length;
	let hottest = Number.NEGATIVE_INFINITY;
	for (const [band, value] of values.entries()) {
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`A zonal mean's values must be finite; band ${band} holds ${value}`,
			);
		}
		hottest = Math.max(hottest, value);
	}
	let weights = 0;
	let weighted = 0;
	for (let band = 0; band < count; band++) {
		const above = (values[band] as number) - (hottest - settings.hotWindowK);
		if (above > 0) {
			const latitude = -90 + ((band + 0.5) * 180) / count;
			const weight = above * Math.cos(latitude * RADIANS_PER_DEGREE);
			weights += weight;
			weighted += weight * latitude;
		}
	}
	// The hottest band's weight is above zero, since no band's middle lies
	// at a pole, so the weights never sum to nothing.
	return weighted / weights;
};

/**
 * Where the bands of a month lie for one place of the low: the tropical
 * cell's edges, the phase at each pole, and the bands' pressure.
 */
type BandShape = {
	readonly northEdge: number;
	readonly southEdge: number;
	readonly northCells: number;
	readonly southCells: number;
	/**
	 * The bands' pressure every {@link TABLE_STEP_DEG} from the south pole,
	 * in hectopascals, before it is taken as 0 at the low.
	 */
	readonly table: Float64Array;
	/** The table's value at the low. */
	readonly atLow: number;
	/** The bands' pressure at a latitude, in hectopascals above the low's. */
	readonly offset: (latitude: number) => number;
};

/**
 * What a month's bands are worked out from, all but where the low lies:
 * the hottest latitude, the cells' width, the low's limit, each side's
 * strength and the amplitude, from the whole globe's profile; and the
 * shape of the bands for a low at any latitude.
 */
type BandFrame = {
	readonly hottestLatitude: number;
	/** The low's latitude placed from the whole globe's hottest latitude. */
	readonly lowLatitude: number;
	readonly lowLimit: number;
	readonly cellWidth: number;
	readonly northStrength: number;
	readonly southStrength: number;
	readonly amplitude: number;
	readonly contrast: number;
	/** The low's latitude for a hottest latitude, held short of the limit. */
	readonly placeLow: (hottestLatitude: number) => number;
	/** The bands for a low at a latitude, in degrees. */
	readonly shapeFor: (lowLatitude: number) => BandShape;
};

/** The frame of {@link zonalBands}, from a profile's filled values. */
const bandFrame = (
	values: Float64Array,
	planet: PlanetSettings,
	settings: WindSettings,
): BandFrame => {
	const count = values.length;
	const hottestLatitude = hottestLatitudeOf(values, settings);
	const contrast =
		valueAt(values, hottestLatitude) -
		0.5 * ((values[0] as number) + (values[count - 1] as number));
	const ratio = Math.min(
		settings.maxContrastRatio,
		Math.max(settings.minContrastRatio, contrast / settings.earthContrastK),
	);
	const omega = rotationRate(planet);
	const cellWidth = Math.min(
		90,
		EARTH_CELL_WIDTH_DEG *
			(EARTH_ROTATION_RATE / omega) ** settings.rotationPower *
			ratio ** settings.contrastPower,
	);
	// The farthest the low may lie from the equator: lowLimitDeg for cells
	// no wider than the Earth's, moving smoothly to the pole as they widen.
	const lowLimit =
		settings.lowLimitDeg +
		(90 - settings.lowLimitDeg) *
			smoothStep(
				(cellWidth - settings.lowLimitFromWidthDeg) /
					(settings.lowLimitToWidthDeg - settings.lowLimitFromWidthDeg),
			);
	const ease = settings.lowLimitEaseShare * (90 - lowLimit);
	const knee = lowLimit - ease;
	const placeLow = (hottest: number): number => {
		const shifted =
			hottest *
			(1 +
				(settings.lowShiftGain - 1) *
					Math.exp(-((hottest / settings.lowShiftFadeDeg) ** 2)));
		// A low short of the knee lies where it was placed; beyond it the low
		// nears the limit smoothly, the slope of its latitude against its
		// place 1 at the knee, so nothing steps as the hottest latitude moves.
		const away = Math.abs(shifted);
		return away <= knee
			? shifted
			: Math.sign(shifted) *
					(ease > 0 ? knee + ease * Math.tanh((away - knee) / ease) : lowLimit);
	};
	const lowLatitude = placeLow(hottestLatitude);
	const atLowK = valueAt(values, lowLatitude);
	const northStrength = smoothStep(
		(atLowK - (values[count - 1] as number)) / settings.sideContrastK,
	);
	const southStrength = smoothStep(
		(atLowK - (values[0] as number)) / settings.sideContrastK,
	);
	const shift = Math.min(
		1,
		(settings.edgeShiftShare * (90 - cellWidth)) / (90 - EARTH_CELL_WIDTH_DEG),
	);
	const amplitude =
		(settings.bandAmplitudeHpa * cellWidth) / EARTH_CELL_WIDTH_DEG;
	// Where the weakening of the outer bands starts, in phase: at the third
	// band, or further out on a planet spinning faster than the Earth, as
	// far as fullBandsReachDeg from the low, the larger of the two taken
	// smoothly so that the bands have no corner in the day length.
	const spinWidth =
		EARTH_CELL_WIDTH_DEG *
		(EARTH_ROTATION_RATE / omega) ** settings.rotationPower;
	const outerFrom = 2 + easedAbove(settings.fullBandsReachDeg / spinWidth - 2);
	const friction2 = settings.seaFrictionPerS * settings.seaFrictionPerS;
	const earthBalance = Math.sqrt(
		coriolisAt45(EARTH_ROTATION_RATE) ** 2 + friction2,
	);
	// What the slope at each step of the table owes to its latitude alone,
	// whatever the low's place: the balance of the wind there, and the
	// easing towards the poles.
	const steps = Math.round(180 / TABLE_STEP_DEG);
	const balances = new Float64Array(steps + 1);
	const eases = new Float64Array(steps + 1);
	for (let step = 0; step <= steps; step++) {
		const latitude = -90 + step * TABLE_STEP_DEG;
		const sine = Math.sin(latitude * RADIANS_PER_DEGREE);
		const coriolis = 2 * omega * sine;
		balances[step] = Math.sqrt(coriolis * coriolis + friction2) / earthBalance;
		eases[step] =
			1 -
			smoothStep(
				(Math.abs(latitude) - (90 - settings.poleTaperDeg)) /
					settings.poleTaperDeg,
			);
	}
	const shapeFor = (low: number): BandShape => {
		// The narrowest a side may be: minSummerCellShare of a cell near the
		// equator, widening to a whole cell as the low lies out towards and
		// beyond where the tropical cell's edge would be, so that the side
		// towards a far summer pole is never squeezed into a ridge.
		const reach = Math.abs(low) / cellWidth;
		const gap =
			cellWidth *
			(settings.minSummerCellShare +
				(1 - settings.minSummerCellShare) *
					smoothStep(
						(reach - settings.wideSummerFromShare) /
							(settings.wideSummerToShare - settings.wideSummerFromShare),
					));
		// Each side's width in full, as if no pole stood in its way; an edge
		// beyond a pole is cut short there, the phase reaching the pole short
		// of 1, so no high stands beyond a low near the pole.
		const northSide = Math.max(gap, cellWidth + shift * low - low);
		const southSide = Math.max(gap, cellWidth - shift * low + low);
		const northEdge = Math.min(90, low + northSide);
		const southEdge = Math.max(-90, low - southSide);
		// The phase at a latitude, and how fast it grows northward, per degree.
		const phaseAt = (latitude: number): number => {
			if (latitude >= low) {
				return latitude <= northEdge
					? (latitude - low) / northSide
					: 1 + (latitude - northEdge) / cellWidth;
			}
			return latitude >= southEdge
				? (low - latitude) / southSide
				: 1 + (southEdge - latitude) / cellWidth;
		};
		const phaseRate = (latitude: number): number => {
			if (latitude >= low) {
				return latitude <= northEdge ? 1 / northSide : 1 / cellWidth;
			}
			return latitude >= southEdge ? -1 / southSide : -1 / cellWidth;
		};
		// The slope of the bands' pressure, in hectopascals a degree, at a
		// step of the table.
		const slopeAt = (step: number): number => {
			const latitude = -90 + step * TABLE_STEP_DEG;
			const phase = phaseAt(latitude);
			// Eased in over a quarter of a cell, so that the slope of the wind
			// has no corner where the weakening starts.
			const share =
				1 - (1 - settings.outerCellShare) * smoothStep(4 * (phase - outerFrom));
			// The two sides meet at the low, where the slope is zero, so a
			// side's strength makes no step there.
			const strength = latitude >= low ? northStrength : southStrength;
			return (
				amplitude *
				share *
				strength *
				(balances[step] as number) *
				(eases[step] as number) *
				Math.PI *
				Math.sin(Math.PI * phase) *
				phaseRate(latitude)
			);
		};
		// The pressure at every TABLE_STEP_DEG from the south pole, by the
		// trapezoidal rule, then taken as 0 at the low.
		const table = new Float64Array(steps + 1);
		let previous = slopeAt(0);
		for (let step = 1; step <= steps; step++) {
			const slope = slopeAt(step);
			table[step] =
				(table[step - 1] as number) + 0.5 * TABLE_STEP_DEG * (previous + slope);
			previous = slope;
		}
		const atLow = tableAt(table, low);
		return {
			northEdge,
			southEdge,
			northCells: phaseAt(90),
			southCells: phaseAt(-90),
			table,
			atLow,
			offset: (latitude: number): number => tableAt(table, latitude) - atLow,
		};
	};
	return {
		hottestLatitude,
		lowLatitude,
		lowLimit,
		cellWidth,
		northStrength,
		southStrength,
		amplitude,
		contrast,
		placeLow,
		shapeFor,
	};
};

/**
 * A table of the bands' pressure, one value every {@link TABLE_STEP_DEG}
 * from the south pole, at a latitude, by straight lines between steps.
 */
const tableAt = (table: Float64Array, latitude: number): number => {
	const steps = table.length - 1;
	const position = Math.min(
		steps,
		Math.max(0, (latitude + 90) / TABLE_STEP_DEG),
	);
	const below = Math.min(steps - 1, Math.floor(position));
	const share = position - below;
	return (
		(table[below] as number) * (1 - share) +
		(table[below + 1] as number) * share
	);
};

/**
 * How many longitudes, evenly round the globe from 180°W, the low is placed
 * at when the bands vary by longitude: every 10°, well under the window the
 * temperature is taken in. Between them the bands are taken by a cubic
 * that passes through each and has no corner (see {@link localBands}).
 */
export const LOCAL_BAND_SECTORS = 36;

/** The degrees of longitude from one of {@link LOCAL_BAND_SECTORS} to the next. */
const SECTOR_STEP_DEG = 360 / LOCAL_BAND_SECTORS;

const CELL_LONGITUDES = new WeakMap<Grid, Float64Array>();

/** Each cell's longitude, in degrees east from −180 to 180. */
const cellLongitudes = (grid: Grid): Float64Array => {
	let longitudes = CELL_LONGITUDES.get(grid);
	if (longitudes === undefined) {
		const { centres, cellCount } = grid;
		longitudes = new Float64Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			longitudes[cell] =
				(Math.atan2(
					centres[3 * cell + 1] as number,
					centres[3 * cell] as number,
				) *
					180) /
				Math.PI;
		}
		CELL_LONGITUDES.set(grid, longitudes);
	}
	return longitudes;
};

/**
 * The weight of the temperature some degrees of longitude from the middle
 * of the window: whole over its middle, tapering as the square of a cosine
 * over `localWindowTaperShare` of each half, and nothing beyond its ends.
 */
const windowWeight = (away: number, settings: WindSettings): number => {
	const half = settings.localWindowDeg / 2;
	const distance = Math.abs(away);
	if (distance >= half) {
		return 0;
	}
	const flat = half * (1 - settings.localWindowTaperShare);
	if (distance <= flat) {
		return 1;
	}
	const cosine = Math.cos((0.5 * Math.PI * (distance - flat)) / (half - flat));
	return cosine * cosine;
};

/**
 * The first of the four sectors round a longitude, counted from 180°W and
 * one turn on so that it is never below 0; the cubic's weights on the four
 * are written into `weights` from `at`.
 */
const sectorsAround = (
	longitude: number,
	weights: Float64Array,
	at: number,
): number => {
	const position =
		((((longitude + 180) / SECTOR_STEP_DEG) % LOCAL_BAND_SECTORS) +
			LOCAL_BAND_SECTORS) %
		LOCAL_BAND_SECTORS;
	const below = Math.floor(position);
	const t = position - below;
	const t2 = t * t;
	const t3 = t2 * t;
	weights[at] = 0.5 * (-t3 + 2 * t2 - t);
	weights[at + 1] = 0.5 * (3 * t3 - 5 * t2 + 2);
	weights[at + 2] = 0.5 * (-3 * t3 + 4 * t2 + t);
	weights[at + 3] = 0.5 * (t3 - t2);
	return below - 1 + LOCAL_BAND_SECTORS;
};

/** Each cell's four sectors and the cubic's weights on them. */
type CellSectors = {
	readonly first: Int32Array;
	/** Four weights a cell, in the cells' order. */
	readonly weights: Float64Array;
};

const CELL_SECTORS = new WeakMap<Grid, CellSectors>();

const cellSectors = (grid: Grid): CellSectors => {
	let found = CELL_SECTORS.get(grid);
	if (found === undefined) {
		const longitudes = cellLongitudes(grid);
		const first = new Int32Array(grid.cellCount);
		const weights = new Float64Array(4 * grid.cellCount);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			first[cell] = sectorsAround(
				longitudes[cell] as number,
				weights,
				4 * cell,
			);
		}
		found = { first, weights };
		CELL_SECTORS.set(grid, found);
	}
	return found;
};

const BAND_CENTRES = new WeakMap<Grid, Map<number, Float64Array>>();

/**
 * The area-weighted mean latitude of the cells in each of `count` bands of
 * equal width from the south, as {@link zonalMean} assigns them; a band's
 * middle where it holds no cell.
 *
 * @remarks
 * A grid's cells do not lie evenly in latitude within a band, so a band's
 * mean of a field that varies with latitude is its value at this
 * latitude, not at the band's middle: up to 0.13 K away for a temperature
 * falling 45 K from the equator to the poles on the 64 grid.
 */
const bandCentres = (grid: Grid, count: number): Float64Array => {
	let byCount = BAND_CENTRES.get(grid);
	if (byCount === undefined) {
		byCount = new Map();
		BAND_CENTRES.set(grid, byCount);
	}
	let centres = byCount.get(count);
	if (centres === undefined) {
		const latitudes = cellLatitudes(grid);
		const sums = new Float64Array(count);
		const bandAreas = new Float64Array(count);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const latitude = latitudes[cell] as number;
			const band = Math.min(
				count - 1,
				Math.floor((latitude + 90) / (180 / count)),
			);
			const area = grid.areas[cell] as number;
			sums[band] = (sums[band] as number) + area * latitude;
			bandAreas[band] = (bandAreas[band] as number) + area;
		}
		centres = new Float64Array(count);
		for (let band = 0; band < count; band++) {
			const area = bandAreas[band] as number;
			centres[band] =
				area > 0
					? (sums[band] as number) / area
					: -90 + ((band + 0.5) * 180) / count;
		}
		byCount.set(count, centres);
	}
	return centres;
};

/**
 * A profile's value at a latitude in a band, by straight lines between the
 * bands' {@link bandCentres}, and the end bands' values beyond them.
 */
const centredValueAt = (
	values: Float64Array,
	centres: Float64Array,
	band: number,
	latitude: number,
): number => {
	const count = values.length;
	const below = latitude < (centres[band] as number) ? band - 1 : band;
	if (below < 0) {
		return values[0] as number;
	}
	if (below >= count - 1) {
		return values[count - 1] as number;
	}
	const from = centres[below] as number;
	const share = (latitude - from) / ((centres[below + 1] as number) - from);
	return (
		(values[below] as number) * (1 - share) +
		(values[below + 1] as number) * share
	);
};

/** The bands of one month that vary by longitude. */
export type LocalBands = {
	/**
	 * The bands placed from the whole latitude's temperature, as
	 * {@link zonalBands} gives them: the pattern towards the poles, and
	 * where the cells' width, the sides' strength and the low's limit come
	 * from at every longitude.
	 */
	readonly global: ZonalBands;
	/**
	 * The low's latitude at each of the {@link LOCAL_BAND_SECTORS}
	 * longitudes, from 180°W, in degrees.
	 */
	readonly sectorLows: Float64Array;
	/**
	 * The low's latitude at a longitude, in degrees, by the cubic between
	 * the sectors' lows.
	 *
	 * @param longitude - Degrees east, any number of turns round.
	 */
	readonly lowAt: (longitude: number) => number;
	/**
	 * The bands' pressure at a place, in hectopascals above the low's
	 * pressure, which is nearly the same at every longitude (see
	 * {@link localBands}); {@link rulesPressureMonth} takes the globe's mean
	 * away afterwards.
	 *
	 * @param latitude - Degrees, from −90 to 90.
	 * @param longitude - Degrees east, any number of turns round.
	 */
	readonly offset: (latitude: number, longitude: number) => number;
	/**
	 * The bands' pressure at every cell's centre, as {@link offset} gives
	 * it there, in a new array.
	 */
	readonly offsets: () => Float64Array;
};

/**
 * The zonal pressure bands of one month with the low placed by longitude:
 * {@link zonalBands}, the low and the tropical cell's edges following the
 * temperature near each longitude in the tropics and subtropics.
 *
 * @remarks
 * The settings named here are {@link DEFAULT_WIND_SETTINGS}'s, or the
 * run's overrides of them. Every cell's sea-level temperature less the
 * profile's at its latitude (by straight lines between the bands' cells'
 * mean latitudes, {@link bandCentres}) is summed by the
 * profile's band of latitude and by the nearest of
 * {@link LOCAL_BAND_SECTORS} longitudes, each weighted by its area. At each
 * of those longitudes, the sums within the window of `localWindowDeg`
 * round it, weighted as it tapers (see `localWindowTaperShare`), give each
 * band's mean of that difference near it, which added to the profile gives
 * the temperature by latitude there. Taking the difference from the
 * profile, not the temperature itself, keeps the unevenness of the grid's
 * cells within a band out of it: a temperature that depends on the
 * latitude alone gives every longitude a difference of almost nothing, and
 * so the same low. The low there is placed from that temperature's hottest
 * latitude as {@link zonalBands} places it from the whole latitude's, held
 * short of the same limit, and the bands there are {@link zonalBands}'
 * for a low there: the edges follow it, while the cells' width, each
 * side's strength, the amplitude and the outer bands are those worked out
 * from the whole latitude's temperature.
 *
 * Between the longitudes the bands' pressure is taken by the Catmull–Rom
 * cubic through the four nearest, round the globe, so that it and its
 * change with longitude have no step. It is then blended with the bands
 * placed from the whole latitude: a share of `localBandsShare` of the local
 * bands up to `localBandsFullToDeg` from the equator, falling smoothly to
 * none at `localBandsGlobalFromDeg`, beyond which every longitude has the
 * same bands, so that the pressure at a pole is one value. Every band
 * pattern is 0 at its own low, but between the longitudes, and in the
 * blend, patterns with their lows at different latitudes are mixed, so
 * the blend's low is at nearly the same pressure at every longitude, not
 * exactly: within about 0.03 hPa from one longitude to another on the
 * one-continent world and the Earth in January and July.
 * {@link rulesPressureMonth} then shifts the whole field so that the
 * globe's mean is {@link REFERENCE_PRESSURE_HPA}.
 *
 * @param grid - The grid the temperature is on.
 * @param seaLevelTemperature - The month's air temperature brought down to
 * sea level, one finite value per cell. Not changed.
 * @param profile - Its zonal mean, as {@link zonalMean} gives it, in the
 * same unit. Not changed.
 * @param planet - The planet's settings: only its day length is read.
 * @param overrides - Settings to change from {@link DEFAULT_WIND_SETTINGS}
 * for this run; none by default. Not changed.
 * @returns New bands.
 * @throws RangeError if the field does not hold one value per cell, or as
 * {@link zonalBands} does.
 */
export const localBands = (
	grid: Grid,
	seaLevelTemperature: ArrayLike<number>,
	profile: ZonalMean,
	planet: PlanetSettings,
	overrides: Partial<WindSettings> = {},
): LocalBands => {
	const settings = windSettings(overrides);
	const { cellCount, areas } = grid;
	if (seaLevelTemperature.length !== cellCount) {
		throw new RangeError(
			`A temperature field must hold ${cellCount} values, one per cell; got ${seaLevelTemperature.length}`,
		);
	}
	const values = filledMeans(profile);
	const count = values.length;
	const frame = bandFrame(values, planet, settings);
	const globalShape = frame.shapeFor(frame.lowLatitude);
	const latitudes = cellLatitudes(grid);
	const longitudes = cellLongitudes(grid);
	const centres = bandCentres(grid, count);
	const width = 180 / count;
	const sectors = LOCAL_BAND_SECTORS;
	// Each sector's cells' sums of area and of area times the temperature's
	// difference from the profile, band by band.
	const sums = new Float64Array(count * sectors);
	const sumAreas = new Float64Array(count * sectors);
	for (let cell = 0; cell < cellCount; cell++) {
		const latitude = latitudes[cell] as number;
		const band = Math.min(count - 1, Math.floor((latitude + 90) / width));
		const sector =
			Math.round(((longitudes[cell] as number) + 180) / SECTOR_STEP_DEG) %
			sectors;
		const index = band * sectors + sector;
		const area = areas[cell] as number;
		sums[index] =
			(sums[index] as number) +
			area *
				((seaLevelTemperature[cell] as number) -
					centredValueAt(values, centres, band, latitude));
		sumAreas[index] = (sumAreas[index] as number) + area;
	}
	// The window's weight on each sector from its middle, by how many
	// sectors east, round the globe.
	const reach: { readonly by: number; readonly weight: number }[] = [];
	for (let by = 0; by < sectors; by++) {
		const away = (by <= sectors / 2 ? by : by - sectors) * SECTOR_STEP_DEG;
		const weight = windowWeight(away, settings);
		if (weight > 0) {
			reach.push({ by, weight });
		}
	}
	const sectorLows = new Float64Array(sectors);
	const shapes: BandShape[] = [];
	const near = new Float64Array(count);
	for (let middle = 0; middle < sectors; middle++) {
		for (let band = 0; band < count; band++) {
			let total = 0;
			let area = 0;
			for (const { by, weight } of reach) {
				const index = band * sectors + ((middle + by) % sectors);
				total += weight * (sums[index] as number);
				area += weight * (sumAreas[index] as number);
			}
			near[band] = (values[band] as number) + (area > 0 ? total / area : 0);
		}
		const low = frame.placeLow(hottestLatitudeOf(near, settings));
		sectorLows[middle] = low;
		shapes.push(frame.shapeFor(low));
	}
	const span = settings.localBandsGlobalFromDeg - settings.localBandsFullToDeg;
	const localShare = (latitude: number): number => {
		const distance = Math.abs(latitude) - settings.localBandsFullToDeg;
		// The span is above zero, as windSettings holds it.
		return settings.localBandsShare * (1 - smoothStep(distance / span));
	};
	const steps = globalShape.table.length - 1;
	// The bands' pressure at a latitude, given the four sectors round its
	// longitude and the cubic's weights on them from `at`.
	const blendAt = (
		latitude: number,
		first: number,
		weights: Float64Array,
		at: number,
	): number => {
		const position = Math.min(
			steps,
			Math.max(0, (latitude + 90) / TABLE_STEP_DEG),
		);
		const below = Math.min(steps - 1, Math.floor(position));
		const part = position - below;
		const valueIn = ({ table, atLow }: BandShape): number =>
			(table[below] as number) * (1 - part) +
			(table[below + 1] as number) * part -
			atLow;
		const whole = valueIn(globalShape);
		const share = localShare(latitude);
		if (share === 0) {
			return whole;
		}
		let local = 0;
		for (let step = 0; step < 4; step++) {
			local +=
				(weights[at + step] as number) *
				valueIn(shapes[(first + step) % sectors] as BandShape);
		}
		return whole + share * (local - whole);
	};
	const scratch = new Float64Array(4);
	const lowAt = (longitude: number): number => {
		const first = sectorsAround(longitude, scratch, 0);
		let low = 0;
		for (let step = 0; step < 4; step++) {
			low +=
				(scratch[step] as number) *
				(sectorLows[(first + step) % sectors] as number);
		}
		return low;
	};
	const offset = (latitude: number, longitude: number): number =>
		blendAt(latitude, sectorsAround(longitude, scratch, 0), scratch, 0);
	const offsets = (): Float64Array => {
		const { first, weights } = cellSectors(grid);
		const field = new Float64Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			field[cell] = blendAt(
				latitudes[cell] as number,
				first[cell] as number,
				weights,
				4 * cell,
			);
		}
		return field;
	};
	return {
		global: bandsOf(frame, globalShape),
		sectorLows,
		lowAt,
		offset,
		offsets,
	};
};

/**
 * The thermal highs and lows of one month: each cell's sea-level
 * temperature less its latitude's mean, times −`thermalHpaPerK`,
 * smoothed over `thermalSmoothingKm` by {@link smoothField}, so
 * that cold places carry highs and hot places lows.
 *
 * @remarks
 * The latitude's mean is the profile's, by straight lines between the
 * middles of its bands. A warmth above it counts as `warmLimitK`
 * times its hyperbolic tangent over that; a cold below it counts in full
 * up to `coldKneeK`, and beyond it less and less, levelling off at
 * `coldLimitK`.
 * Over the sea the response is `seaThermalShare` of the land's, and
 * over land it falls by a factor of e every `thermalHeightM` of
 * height above the sea level. Smoothing keeps the area-weighted mean,
 * which is not zero; {@link rulesPressure} takes it away with the rest.
 *
 * @param world - The world: its grid, terrain and sea level. Not changed.
 * @param seaLevelTemperature - The month's air temperature brought down to
 * sea level, in degrees Celsius or kelvin, one value per cell. Not changed.
 * @param profile - Its zonal mean, as {@link zonalMean} gives it, in the
 * same unit. Not changed.
 * @param overrides - Settings to change from {@link DEFAULT_WIND_SETTINGS}
 * for this run; none by default. Not changed.
 * @returns A new array of hectopascals, one per cell.
 * @throws RangeError if the field does not hold one value per cell, or
 * the profile holds no value; and, from {@link smoothField}, if the field
 * holds a value that is not finite, since every such value makes the
 * anomaly at its cell not finite either.
 */
export const thermalPressure = (
	world: World,
	seaLevelTemperature: ArrayLike<number>,
	profile: ZonalMean,
	overrides: Partial<WindSettings> = {},
): Float64Array => {
	const settings = windSettings(overrides);
	const grid = getGrid(world.resolution);
	if (seaLevelTemperature.length !== grid.cellCount) {
		throw new RangeError(
			`A temperature field must hold ${grid.cellCount} values, one per cell; got ${seaLevelTemperature.length}`,
		);
	}
	const values = filledMeans(profile);
	const latitudes = cellLatitudes(grid);
	const anomaly = new Float64Array(grid.cellCount);
	const knee = settings.coldKneeK;
	const span = Math.max(0, settings.coldLimitK - knee);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const warmth =
			(seaLevelTemperature[cell] as number) -
			valueAt(values, latitudes[cell] as number);
		// A cold up to the knee counts in full, so a cell short of it is
		// worked out as it would be with no cold limit at all.
		const beyond = -warmth - knee;
		let felt = warmth;
		if (warmth > 0) {
			felt = settings.warmLimitK * Math.tanh(warmth / settings.warmLimitK);
		} else if (beyond > 0) {
			felt = -(knee + (span > 0 ? span * Math.tanh(beyond / span) : 0));
		}
		const height = (world.elevation[cell] as number) - world.seaLevel;
		const share =
			height > 0
				? Math.exp(-height / settings.thermalHeightM)
				: settings.seaThermalShare;
		anomaly[cell] = -settings.thermalHpaPerK * share * felt;
	}
	return smoothField(grid, anomaly, settings.thermalSmoothingKm, anomaly);
};

/** What the wind needs of a world, worked out once for all its months. */
type Surface = {
	readonly grid: Grid;
	/** The Coriolis parameter at each cell, per second. */
	readonly coriolis: Float64Array;
	/** The friction at each cell, per second. */
	readonly friction: Float64Array;
	/** The direction up the ground's slope at each cell: east and north. */
	readonly slopeEast: Float64Array;
	readonly slopeNorth: Float64Array;
	/**
	 * The share of the wind along that direction that is taken away: above
	 * zero on and beside sloping land, the sea included.
	 */
	readonly blocking: Float64Array;
};

const surfaceOf = (world: World, settings: WindSettings): Surface => {
	const grid = getGrid(world.resolution);
	const { cellCount } = grid;
	const omega = rotationRate(world.planet);
	const latitudes = cellLatitudes(grid);
	const coriolis = new Float64Array(cellCount);
	const friction = new Float64Array(cellCount);
	const height = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		coriolis[cell] =
			2 * omega * Math.sin((latitudes[cell] as number) * RADIANS_PER_DEGREE);
		const above = (world.elevation[cell] as number) - world.seaLevel;
		const land = above > 0;
		friction[cell] =
			settings.seaFrictionPerS * (land ? settings.landFrictionFactor : 1);
		// The sea counts as at the sea level, never as its floor.
		height[cell] = land ? above : 0;
	}
	const slope = toEastNorth(grid, gradient(grid, height, RADIUS_M));
	const blocking = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		const east = slope.east[cell] as number;
		const north = slope.north[cell] as number;
		const steepness = Math.hypot(east, north);
		if (steepness > 0) {
			slope.east[cell] = east / steepness;
			slope.north[cell] = north / steepness;
			blocking[cell] = steepness / (steepness + settings.blockingSlope);
		}
	}
	return {
		grid,
		coriolis,
		friction,
		slopeEast: slope.east,
		slopeNorth: slope.north,
		blocking,
	};
};

/** Room for one month's pressure gradient, reused from month to month. */
type Scratch = {
	readonly field: Float64Array;
	readonly vectors: ReturnType<typeof createVectorField>;
	readonly components: EastNorthField;
};

const scratchOf = (grid: Grid): Scratch => ({
	field: new Float64Array(grid.cellCount),
	vectors: createVectorField(grid),
	components: {
		east: new Float64Array(grid.cellCount),
		north: new Float64Array(grid.cellCount),
	},
});

/** One month's wind on a surface, from its pressure in hectopascals. */
const windsOn = (
	surface: Surface,
	pressure: ArrayLike<number>,
	scratch: Scratch,
): { east: Float32Array; north: Float32Array } => {
	const { grid, coriolis, friction, slopeEast, slopeNorth, blocking } = surface;
	const { cellCount } = grid;
	for (let cell = 0; cell < cellCount; cell++) {
		scratch.field[cell] = PASCALS_PER_HPA * (pressure[cell] as number);
	}
	gradient(grid, scratch.field, RADIUS_M, scratch.vectors);
	const { east: pushEast, north: pushNorth } = toEastNorth(
		grid,
		scratch.vectors,
		scratch.components,
	);
	const east = new Float32Array(cellCount);
	const north = new Float32Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		// The push of the pressure gradient on each kilogram of air, down
		// the gradient.
		const gx = -(pushEast[cell] as number) / AIR_DENSITY_KG_M3;
		const gy = -(pushNorth[cell] as number) / AIR_DENSITY_KG_M3;
		const f = coriolis[cell] as number;
		const k = friction[cell] as number;
		// The steady state of du/dt = −f k̂×u + g − k u: k u − f v = gx and
		// f u + k v = gy.
		const det = k * k + f * f;
		let u = (k * gx + f * gy) / det;
		let v = (k * gy - f * gx) / det;
		const share = blocking[cell] as number;
		if (share > 0) {
			const upEast = slopeEast[cell] as number;
			const upNorth = slopeNorth[cell] as number;
			const along = share * (u * upEast + v * upNorth);
			u -= along * upEast;
			v -= along * upNorth;
		}
		east[cell] = u;
		north[cell] = v;
	}
	return { east, north };
};

/**
 * The surface wind of one month from its sea-level pressure.
 *
 * @remarks
 * One balance everywhere: the steady state of
 * `du/dt = −f k̂×u − ∇p / ρ − k u`, with `f = 2Ω sin φ` from the cell's
 * latitude and the planet's {@link rotationRate}, `ρ` from
 * {@link AIR_DENSITY_KG_M3} and the friction `k` from
 * `seaFrictionPerS`, times `landFrictionFactor` on land.
 * Writing `g = −∇p / ρ`, it is
 * `u = (k gₑ + f gₙ) / (k² + f²)` eastward and
 * `v = (k gₙ − f gₑ) / (k² + f²)` northward: along the isobars, low
 * pressure on the left in the north, where `f` is much more than `k`, and
 * straight down the gradient at the equator, where `f` is zero. Since `k`
 * is never zero, the wind is finite everywhere at every day length.
 *
 * Then, of the wind's part along the slope of the ground, the share
 * `s / (s + s₀)` is taken away, where `s` is the slope and `s₀` is
 * `blockingSlope`, turning the wind along steep high ground rather
 * than over it. The ground is the land's height above the sea level, the
 * sea counting as at the sea level whatever its depth, so the sea floor
 * never blocks the wind; but the slope is {@link gradient}'s, which takes
 * in the cells either side, so a sea cell beside a high coast has a slope
 * too, and the wind there is turned along the coast.
 *
 * The pressure's gradient is {@link gradient}'s on the world's grid, per
 * metre on a planet of {@link PLANET_RADIUS_KM}.
 *
 * @param world - The world: its grid, terrain, sea level and day length.
 * Not changed.
 * @param pressure - Sea-level pressure in hectopascals, one finite value
 * per cell. Not changed.
 * @param overrides - Settings to change from {@link DEFAULT_WIND_SETTINGS}
 * for this run; none by default. Not changed.
 * @returns The eastward and northward wind at each cell's centre, in
 * metres a second, in new arrays.
 * @throws RangeError if the pressure does not hold one value per cell, or
 * an override is not a setting or not a finite number.
 */
export const windsFromPressure = (
	world: World,
	pressure: ArrayLike<number>,
	overrides: Partial<WindSettings> = {},
): { east: Float32Array; north: Float32Array } => {
	const surface = surfaceOf(world, windSettings(overrides));
	if (pressure.length !== surface.grid.cellCount) {
		throw new RangeError(
			`A pressure field must hold ${surface.grid.cellCount} values, one per cell; got ${pressure.length}`,
		);
	}
	return windsOn(surface, pressure, scratchOf(surface.grid));
};

/**
 * The winds of a run of months from their sea-level pressure, on the
 * world's own grid: {@link windsFromPressure} for each, with the part that
 * depends on the terrain and the day length worked out once for them all.
 *
 * @param world - The world: its grid, terrain, sea level and day length.
 * Not changed.
 * @param pressures - Fields of sea-level pressure in hectopascals, one
 * finite value per cell in each, such as twelve months. Not changed.
 * @param overrides - Settings to change from {@link DEFAULT_WIND_SETTINGS}
 * for this run; none by default. Not changed.
 * @returns The eastward and northward wind at each cell's centre, in
 * metres a second, in new arrays, one of each per field given.
 * @throws RangeError if a field does not hold one value per cell, or an
 * override is not a setting or not a finite number.
 */
export const windsFromPressures = (
	world: World,
	pressures: readonly ArrayLike<number>[],
	overrides: Partial<WindSettings> = {},
): { east: Float32Array[]; north: Float32Array[] } => {
	const surface = surfaceOf(world, windSettings(overrides));
	const { cellCount } = surface.grid;
	for (const field of pressures) {
		if (field.length !== cellCount) {
			throw new RangeError(
				`A pressure field must hold ${cellCount} values, one per cell; got ${field.length}`,
			);
		}
	}
	const scratch = scratchOf(surface.grid);
	const east: Float32Array[] = [];
	const north: Float32Array[] = [];
	for (const field of pressures) {
		const winds = windsOn(surface, field, scratch);
		east.push(winds.east);
		north.push(winds.north);
	}
	return { east, north };
};

/**
 * One month of the rules model's sea-level pressure on the world's own
 * grid: the month's zonal bands and its thermal highs and lows, shifted to
 * a mean of {@link REFERENCE_PRESSURE_HPA}.
 *
 * @remarks
 * The month's air temperature is brought down to sea level by adding back
 * the temperature model's own lapse-rate cooling of each cell, as
 * {@link lapseCooling} gives it; with its zonal mean in
 * {@link PROFILE_BANDS} bands it places the bands ({@link localBands}, or
 * {@link zonalBands} when `localBandsShare` is 0), and that mean is what
 * the thermal part is taken against ({@link thermalPressure}). Nothing but the
 * temperature, the terrain, the sea level and the day length is read, so
 * the pressure depends on the month's temperature alone. It is nearly all
 * the model's time, most of that {@link smoothField}'s.
 *
 * @param world - The world. It is not changed.
 * @param temperature - The month's mean near-surface air temperature in
 * degrees Celsius, one value per cell of the world's grid. Not changed.
 * @param cooling - The world's lapse-rate cooling, in kelvin, one value per
 * cell, as {@link lapseCooling} gives it. Not changed.
 * @param overrides - Settings to change from {@link DEFAULT_WIND_SETTINGS}
 * for this run; none by default. Not changed.
 * @returns A new field of hectopascals, in double precision.
 * @throws RangeError if the temperature or the cooling does not hold one
 * value per cell; and, from {@link zonalMean}, if the temperature or the
 * cooling holds a value that is not finite.
 */
export const rulesPressureMonth = (
	world: World,
	temperature: ArrayLike<number>,
	cooling: ArrayLike<number>,
	overrides: Partial<WindSettings> = {},
): Float64Array => {
	const settings = windSettings(overrides);
	const grid = getGrid(world.resolution);
	const { cellCount, areas } = grid;
	for (const [name, field] of [
		['temperature', temperature],
		['cooling', cooling],
	] as const) {
		if (field.length !== cellCount) {
			throw new RangeError(
				`A ${name} field must hold ${cellCount} values, one per cell; got ${field.length}`,
			);
		}
	}
	const latitudes = cellLatitudes(grid);
	const seaLevel = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		seaLevel[cell] = (temperature[cell] as number) + (cooling[cell] as number);
	}
	const profile = zonalMean(grid, seaLevel, PROFILE_BANDS);
	// With no share of the bands placed by longitude, the one pattern round
	// the globe, worked out as it always was.
	let bandsAt: (cell: number) => number;
	if (settings.localBandsShare === 0) {
		const bands = zonalBands(profile, world.planet, settings);
		bandsAt = (cell) => bands.offset(latitudes[cell] as number);
	} else {
		const offsets = localBands(
			grid,
			seaLevel,
			profile,
			world.planet,
			settings,
		).offsets();
		bandsAt = (cell) => offsets[cell] as number;
	}
	const field = thermalPressure(world, seaLevel, profile, settings);
	let total = 0;
	let totalArea = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		const value = (field[cell] as number) + bandsAt(cell);
		field[cell] = value;
		total += (areas[cell] as number) * value;
		totalArea += areas[cell] as number;
	}
	const shift = REFERENCE_PRESSURE_HPA - total / totalArea;
	for (let cell = 0; cell < cellCount; cell++) {
		field[cell] = (field[cell] as number) + shift;
	}
	return field;
};

/**
 * The rules model's sea-level pressure on the world's own grid for a year:
 * {@link rulesPressureMonth} of each month, with the world's cooling
 * worked out once.
 *
 * @param world - The world. It is not changed.
 * @param temperatures - Twelve fields, January to December, of the mean
 * near-surface air temperature in degrees Celsius, one value per cell of the
 * world's grid. They are not changed.
 * @param overrides - Settings to change from {@link DEFAULT_WIND_SETTINGS}
 * for this run; none by default. Not changed.
 * @returns Twelve new fields of hectopascals, in double precision.
 * @throws RangeError if there are not twelve temperature fields of one
 * value per cell, or the world is not valid (from {@link lapseCooling});
 * and, from {@link zonalMean}, if a field holds a value that is not
 * finite.
 */
export const rulesPressure = (
	world: World,
	temperatures: readonly ArrayLike<number>[],
	overrides: Partial<WindSettings> = {},
): Float64Array[] => {
	const settings = windSettings(overrides);
	if (temperatures.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`The rules model needs ${MONTHS_PER_YEAR} months of temperature; got ${temperatures.length}`,
		);
	}
	const cooling = lapseCooling(world);
	return temperatures.map((month) =>
		rulesPressureMonth(world, month, cooling, settings),
	);
};

/**
 * The rules wind model on the world's own grid: each month's sea-level
 * pressure by {@link rulesPressure}, and the wind from it by
 * {@link windsFromPressures}. `solveWinds` checks its input, and on a
 * world finer than 64 cells per face edge works the pressure out on the 64
 * grid instead.
 *
 * @remarks
 * Its time grows with the grid's cells, most of it {@link smoothField}'s;
 * `docs/winds.md` gives it.
 *
 * @param world - The world. It is not changed.
 * @param temperatures - Twelve fields, as {@link rulesPressure} takes them.
 * They are not changed.
 * @param overrides - Settings to change from {@link DEFAULT_WIND_SETTINGS}
 * for this run; none by default. Not changed.
 * @returns New arrays, one value per cell of the world's grid in each.
 * @throws RangeError as {@link rulesPressure} does.
 */
export const rulesWindsOnGrid = (
	world: World,
	temperatures: readonly ArrayLike<number>[],
	overrides: Partial<WindSettings> = {},
): WindResult => {
	const settings = windSettings(overrides);
	const pressure = rulesPressure(world, temperatures, settings);
	return {
		...windsFromPressures(world, pressure, settings),
		pressure: pressure.map((field) => Float32Array.from(field)),
	};
};
