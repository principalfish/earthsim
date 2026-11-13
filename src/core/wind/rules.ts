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
 *   equator-to-pole contrast of temperature.
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
 * nor the planet's tilt is read. Its constants are rough: some start from a
 * published or textbook figure, the rest are guesses, and several were
 * then tuned by hand against the observed Earth, or against the invented
 * cases, so that the winds are right in kind; they are not physical
 * truth.
 */

import { type Grid, getGrid } from '../grid';
import { cellLatitudes, MONTHS_PER_YEAR } from '../insolation';
import { DEFAULT_PLANET, type PlanetSettings, rotationRate } from '../planet';
import { lapseCooling } from '../temperature';
import {
	createVectorField,
	type EastNorthField,
	gradient,
	smoothField,
	toEastNorth,
} from '../vector';
import { PLANET_RADIUS_KM, type World } from '../world';
import {
	type WindModel,
	type WindResult,
	type ZonalMean,
	zonalMean,
} from './model';

const RADIANS_PER_DEGREE = Math.PI / 180;

/** Pascals in a hectopascal, for gradients in pascals a metre. */
const PASCALS_PER_HPA = 100;

/** The planet's radius in metres, for gradients per metre. */
const RADIUS_M = PLANET_RADIUS_KM * 1000;

/**
 * The globe's area-weighted mean sea-level pressure, in hectopascals, that
 * every month's pressure is shifted to. The observed Earth's mean of 1981
 * to 2010, over every month, on the 64 grid, rounded to a whole
 * hectopascal; it is below the standard atmosphere's 1,013.25 hPa because
 * the observed pressure is reduced to sea level over high ground too.
 */
export const REFERENCE_PRESSURE_HPA = 1011;

/**
 * The density of the air near the surface, in kilograms a cubic metre: the
 * standard atmosphere's 1.225 kg m⁻³ at sea level and 15 °C, rounded down
 * for air a little warmer and higher on average.
 */
export const AIR_DENSITY_KG_M3 = 1.2;

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
 * from the low to the subtropical high: the observed subtropical highs lie
 * near 30° in both hemispheres. It is also the width of each cell beyond:
 * the observed subpolar lows lie near 60° and the polar highs at the poles.
 */
export const EARTH_CELL_WIDTH_DEG = 30;

/**
 * How the cells' width follows the rotation rate: as `(Ω_E / Ω)` to this
 * power.
 *
 * @remarks
 * The power ½ is the eddy-limited Hadley cell of Held (2000), "The general
 * circulation of the atmosphere" (Woods Hole lectures), whose edge lies at
 * `φ_H ≈ (g H Δ_v / (Ω² a²))^¼` radians: where the shear of a wind that
 * keeps its angular momentum first becomes baroclinically unstable. It sits
 * between the axisymmetric cell of Held and Hou (1980), whose width goes as
 * `1/Ω`, and the weaker dependence general circulation models find at fast
 * rotation. The same power for the cells beyond follows the Rhines scale,
 * `π (2U / β)^½` with `β = 2Ω cos φ / a`, which sets the spacing of
 * eddy-driven jets. It gives about 17° and five cells in each hemisphere
 * for an 8-hour day, 30° and three for 24 hours, 60° and one and a half
 * for 96 hours, and one cell reaching the pole from about 216 hours.
 */
export const ROTATION_POWER = 0.5;

/**
 * The Earth's equator-to-pole contrast of zonal-mean sea-level temperature,
 * in kelvin, as {@link zonalBands} measures it: the temperature at the
 * hottest latitude less the mean of the two polar bands'. The contrast of
 * other planets is taken against it. The simulated Earth's on the 64 grid
 * is 41.8 K in January and 39.9 K in July, and 41.6 K over the twelve
 * months; this is the mean of January's and July's, rounded. Not tuned.
 */
export const EARTH_CONTRAST_K = 41;

/**
 * How the cells' width follows the equator-to-pole contrast: as the
 * contrast over {@link EARTH_CONTRAST_K} to this power.
 *
 * @remarks
 * Held's (2000) edge goes as the quarter power of the vertical contrast of
 * potential temperature, and Held and Hou's (1980) as the half power of
 * the horizontal one; the horizontal contrast is what the model has, so
 * it takes the quarter power, the weaker of the two. A guess, not tuned.
 */
export const CONTRAST_POWER = 0.25;

/**
 * The lowest contrast taken, as a share of {@link EARTH_CONTRAST_K}, so
 * that a planet with almost none, or a negative one, keeps cells of a sane
 * width: about 0.7 times the Earth's at the Earth's rotation. A guess, not
 * tuned.
 */
export const MIN_CONTRAST_RATIO = 0.25;

/**
 * The highest contrast taken, as a share of {@link EARTH_CONTRAST_K}, so
 * that a planet with a huge one keeps cells of a sane width: about 1.4
 * times the Earth's at the Earth's rotation. A guess, not tuned.
 */
export const MAX_CONTRAST_RATIO = 4;

/**
 * How far below the hottest band, in kelvin, a band still counts towards
 * the hottest latitude: the mean latitude of the bands within this of the
 * hottest, each weighted by how far above that it is and by its area. It
 * keeps the hottest latitude from jumping between two bands about as hot
 * as each other. Started at 2 K; tuned by hand to 4 K, which moves the
 * simulated Earth's hottest latitude a little further from the equator.
 */
export const HOT_WINDOW_K = 4;

/**
 * How many times as far from the equator as the hottest latitude the low
 * lies, near the equator.
 *
 * @remarks
 * On the observed Earth the zonal-mean low moves from about 5°S in January
 * to about 15°N in July, with the hottest latitude. The simulated Earth's
 * hottest latitude moves only from about 4°S to 5°N, a bias of the
 * temperature model (its July land in the northern subtropics is too cool
 * against its sea), so without this the low sits too near the equator in
 * July and South Asia has no south-westerly monsoon. Tuned by hand against
 * the observed Earth; 1 would be the rule as it stands.
 *
 * The low lies at `φ (1 + (G − 1) exp(−(φ / F)²))` for the hottest
 * latitude `φ`, this `G` and {@link LOW_SHIFT_FADE_DEG} `F`: about `G φ`
 * near the equator, where the temperature model's seasons are too weak,
 * and the hottest latitude itself well away from it, at a pole when the
 * hottest latitude is.
 */
export const LOW_SHIFT_GAIN = 2.5;

/**
 * Over how many degrees from the equator {@link LOW_SHIFT_GAIN} fades: by
 * a factor of e at this latitude, to almost nothing at twice it. The
 * simulated Earth's hottest latitude stays within 5° of the equator, where
 * the gain is almost whole; a planet with a steep tilt, whose hottest
 * latitude can reach a pole, has its low at the hottest latitude. A guess,
 * not tuned; the mapping from the hottest latitude to the low rises at
 * every latitude with it.
 */
export const LOW_SHIFT_FADE_DEG = 20;

/**
 * How far the tropical cell's edges follow the low off the equator, as a
 * share of the low's latitude, at the Earth's cell width: on the observed
 * Earth the subtropical highs move about half as far through the year as
 * the band of low pressure between them. The share falls to nothing as the
 * cell widens to reach the poles. Not tuned.
 */
export const EDGE_SHIFT_SHARE = 0.5;

/**
 * How far from the equator, in degrees, the low starts to be moved on
 * towards its pole: by none of the way here, rising smoothly to all of it
 * at {@link POLE_LOW_TO_DEG}.
 *
 * @remarks
 * Weighting the bands by their area, the hottest latitude of a planet
 * whose summer pole is hottest lies short of that pole: about 86° on the
 * case tilted 60°, and about 76° for a profile falling as the cosine of
 * the distance from the pole. Moving such a low on to the pole puts the
 * low over the hottest place, with the summer side of the tropical cell
 * shrunk to nothing. A guess, not tuned; the low still rises with the
 * hottest latitude at every latitude.
 */
export const POLE_LOW_FROM_DEG = 60;

/**
 * How far from the equator, in degrees, the low is moved all the way on
 * to its pole: see {@link POLE_LOW_FROM_DEG}. A guess, not tuned.
 */
export const POLE_LOW_TO_DEG = 80;

/**
 * The narrowest the tropical cell may be on the side of the low towards
 * the summer pole, as a share of the cells' width, so that a low far from
 * the equator still has a side of some width; a side that would reach
 * beyond the pole is cut short there. A guess, not tuned.
 */
export const MIN_SUMMER_CELL_SHARE = 0.3;

/**
 * How far from the equator the low lies, as a share of the cells' width,
 * when the narrowest side of the tropical cell starts to widen from
 * {@link MIN_SUMMER_CELL_SHARE} of a cell: up to a whole cell at
 * {@link WIDE_SUMMER_TO_SHARE}.
 *
 * @remarks
 * The summer side of a cell carries a whole band's rise of pressure
 * whatever its width, so squeezed to a third of a cell it rises three
 * times as steeply as a band in full: on the case tilted 60°, whose July
 * low lies near 58°N, it made a ridge 12.5 hPa high within 8° of the low,
 * over air only 3 K cooler. Widening it as the low moves out past where
 * the subtropical high would be keeps the rise as gentle as a band's,
 * reaching the pole, the coolest place on that side, as a high. 0.4 is
 * just beyond the simulated Earth's own low, which lies at most 0.40 of a
 * cell from the equator, so the Earth's bands are unchanged. Set by hand
 * against the tilted case, not against the observed Earth.
 */
export const WIDE_SUMMER_FROM_SHARE = 0.4;

/**
 * How far from the equator the low lies, as a share of the cells' width,
 * when the narrowest side of the tropical cell is a whole cell: see
 * {@link WIDE_SUMMER_FROM_SHARE}. Set by hand with it.
 */
export const WIDE_SUMMER_TO_SHARE = 0.8;

/**
 * How much cooler, in kelvin, a side's pole must be than the low for the
 * bands on that side to be in full.
 *
 * @remarks
 * The bands stand for the overturning driven by the warmth of the low
 * against the cold towards the poles. On the side of a low near a summer
 * pole as warm as itself, nothing drives a cell, and a high there would
 * cap the hottest place on the planet. Each side's slope is scaled by
 * `s²(3 − 2s)` of `s`, its pole's drop below the low's temperature over
 * this, from 0 to 1, fading to none as the pole on its side warms to the
 * low's temperature.
 *
 * Started at 20 K; set by hand to 30 K against the case tilted 60°, whose
 * July Arctic, 16 K cooler than its hottest latitude near 58°N, had a high
 * rising 15 hPa within 8° of the low. Both sides of the simulated Earth's
 * low keep their bands all but in full: its poles are about 30 K and more
 * cooler than it in every month.
 */
export const SIDE_CONTRAST_K = 30;

/**
 * The share of the bands' slope that is kept beyond the first cell past
 * the tropical one, eased in over the first quarter of the cell beyond:
 * the observed surface polar easterlies are weak, about a fifth as strong
 * in the zonal mean as the westerlies. Started at 1; tuned by hand against
 * the observed Earth's polar winds.
 */
export const OUTER_CELL_SHARE = 0.3;

/**
 * Over how many degrees from each pole the bands' slope is eased to
 * nothing, so that the pressure has no point at the pole when the cells do
 * not fit a whole number of times between the tropical cell and the pole.
 * Started at 15°; 10° keeps more of the polar cell. Not tuned against the
 * observed Earth.
 */
export const POLE_TAPER_DEG = 10;

/**
 * The step, in degrees of latitude, at which {@link zonalBands} tabulates
 * the bands' pressure, which is taken between steps by straight lines:
 * well under a cell's width on the finest grid.
 */
export const TABLE_STEP_DEG = 0.25;

/**
 * Half the rise of the Earth's tropical cell, in hectopascals, before the
 * rise is scaled by latitude (see {@link zonalBands}): it sets the speed of
 * the bands' winds, about 6.5 m/s over the sea at the middle of the first
 * two cells, and a third of that in the cells beyond. The observed
 * zonal-mean sea-level pressure rises about 8 hPa from the low to the
 * subtropical highs and falls 15 to 25 hPa from them to the subpolar
 * lows. Started at 5; tuned by hand against the observed Earth's winds.
 */
export const BAND_AMPLITUDE_HPA = 9;

/**
 * Hectopascals of pressure for each kelvin a place's sea-level temperature
 * lies below its latitude's mean, on low land.
 *
 * @remarks
 * By the hypsometric equation, a layer of air `h` deep colder by `ΔT` than
 * its surroundings at temperature `T` weighs more by `p h ΔT / (T H)` at
 * the ground, with `H` the scale height, about 8 km. For a layer 1.5 km
 * deep, as the shallow cold highs over winter continents are, that is
 * about 0.7 hPa a kelvin at 1,000 hPa and 270 K, which is where it
 * started. Tuned by hand to 3 against the observed Earth's Siberian high
 * and its summer low over South Asia, which the simulated temperature
 * makes too weak at the start's value.
 */
export const THERMAL_HPA_PER_K = 3;

/**
 * How far the thermal highs and lows are smoothed, in kilometres, as
 * {@link smoothField} takes it: about the size of the observed Siberian
 * high and the summer lows over the continents. Started at 750 km; tuned
 * by hand to 900.
 */
export const THERMAL_SMOOTHING_KM = 900;

/**
 * The share of the thermal response over the sea.
 *
 * @remarks
 * Air over a sea warmer or colder than its latitude is mixed deep by
 * convection or sits over a sea whose warmth lies in the water, not the
 * air, so it does not make the shallow dome of cold or hot air that land
 * does; and in winter the subtropical oceans, warm against cold land, would
 * otherwise carry lows where the observed Earth has its subtropical highs
 * and trade winds. A guess, brought in at 0.3 while tuning by hand against
 * the observed Earth's Pacific trades and kept there; 1, the land's, was
 * the rule before it.
 */
export const SEA_THERMAL_SHARE = 0.3;

/**
 * The warmth, in kelvin above a latitude's mean, at which a warm place's
 * low stops deepening as fast: a warmth `w` counts as `W tanh(w / W)`.
 *
 * @remarks
 * Cold air pools in a shallow, stable dome, so a cold high keeps growing
 * with the cold; hot air mixes deep, and the low it makes is partly undone
 * by a high above it. The simulated Earth's continental interiors are far
 * hotter in summer than its coasts at the same latitude, which without a
 * limit gives a deep low over Siberia and none to speak of over South
 * Asia. A guess, first tried at 5 K, then at 4, 6 and 8 K by hand against
 * the observed Earth's July, and kept at 6; with no limit at all, the rule
 * before it, a warm place's low deepens without end.
 */
export const WARM_LIMIT_K = 6;

/**
 * The height, in metres, over which the thermal response of high ground
 * falls by a factor of e.
 *
 * @remarks
 * The temperature of a plateau brought down to sea level stands for air
 * that is not there: the cold of the Tibetan Plateau in winter is not a
 * dome of cold air above the sea, and taken in full it centres the Asian
 * winter high on the plateau rather than on Mongolia and Siberia, with
 * winds of 15 to 20 m/s down into India. A guess, first tried at 1,500 m,
 * which took too much of the Siberian high on the Mongolian plateau, then
 * set by hand to 2,500 m; with no fall at all, the rule before it, high
 * ground counts in full.
 */
export const THERMAL_HEIGHT_M = 2500;

/**
 * The linear friction on the wind over the sea, per second.
 *
 * @remarks
 * With friction `k` and Coriolis parameter `f` the wind crosses the
 * isobars at `atan(k / f)`. The 10-metre wind over the sea crosses them at
 * about 20° in mid-latitudes, where `f` is about 1.0e-4 s⁻¹, which gives
 * `k` about 3.7e-5 s⁻¹, a spin-down time of about 7.5 hours; that is where
 * it started. Tuned by hand to 2.5e-5 s⁻¹, about 14° in mid-latitudes and
 * 34° at 15°, for trade winds less across the isobars.
 */
export const SEA_FRICTION_PER_S = 2.5e-5;

/**
 * How many times the sea's friction the land's is. Started at 2, for the
 * 10-metre wind over land crossing the isobars at about 35° against the
 * sea friction's starting value of 3.7e-5 s⁻¹; tuned by hand
 * to 5, which brings the simulated Earth's mean speed over land near the
 * observed 1.8 m/s, at the cost of crossing the isobars at about 50° in
 * mid-latitudes.
 */
export const LAND_FRICTION_FACTOR = 5;

/**
 * The slope of the ground, rise over run, at which high ground takes away
 * half of the wind's part up or down that slope, turning the wind along
 * it: a rise of 1 km over 200 km, a little over a cell's width on the 64
 * grid. A guess, not tuned.
 */
export const BLOCKING_SLOPE = 0.005;

/** The Coriolis parameter at 45°, for a rotation rate in radians a second. */
const coriolisAt45 = (omega: number): number => 2 * omega * Math.SQRT1_2;

/** The zonal bands of one month's pressure. */
export type ZonalBands = {
	/**
	 * The hottest latitude, in degrees: the mean latitude of the bands
	 * within {@link HOT_WINDOW_K} of the hottest.
	 */
	readonly hottestLatitude: number;
	/** The latitude of the low, in degrees. */
	readonly lowLatitude: number;
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
	 * much cooler the north pole is than the low (see
	 * {@link SIDE_CONTRAST_K}).
	 */
	readonly northStrength: number;
	/** The share of the bands' slope kept south of the low. */
	readonly southStrength: number;
	/**
	 * Half the tropical cell's rise in hectopascals, before it is scaled by
	 * latitude: {@link BAND_AMPLITUDE_HPA} times the cells' width over the
	 * Earth's.
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
 * The zonal pressure bands of one month, placed from its zonal-mean
 * sea-level temperature and the planet's rotation.
 *
 * @remarks
 * The hottest latitude is the mean latitude of the bands within
 * {@link HOT_WINDOW_K} of the hottest, and the low lies about
 * {@link LOW_SHIFT_GAIN} times as far from the equator near it, and at the
 * hottest latitude itself well away from it (see
 * {@link LOW_SHIFT_FADE_DEG}). A low so placed that lies more than
 * {@link POLE_LOW_FROM_DEG} from the equator is then moved on towards its
 * pole, smoothly, all the way to it from {@link POLE_LOW_TO_DEG}. The cells'
 * natural width is {@link EARTH_CELL_WIDTH_DEG} times `(Ω_E / Ω)^½` (see
 * {@link ROTATION_POWER}) times the contrast's share of the Earth's to the
 * power {@link CONTRAST_POWER}, that share taken from
 * {@link MIN_CONTRAST_RATIO} to {@link MAX_CONTRAST_RATIO}, and the width at
 * most 90°. The contrast is the temperature at the hottest latitude less
 * the mean of the two polar bands'. The tropical cell's edges lie a cell's
 * width either side of the equator, moved towards the low by
 * {@link EDGE_SHIFT_SHARE} of its latitude (less as the cell widens), and
 * at least {@link MIN_SUMMER_CELL_SHARE} of a width from the low, that
 * least widening to a whole cell as the low lies out from
 * {@link WIDE_SUMMER_FROM_SHARE} to {@link WIDE_SUMMER_TO_SHARE} of a
 * width; an edge that would lie beyond a pole is cut short at it, the
 * side's phase (below) reaching the pole short of 1. Beyond the edges come further cells of the
 * natural width out to the poles, as many as fit, the last perhaps in
 * part.
 *
 * Along each side of the low a phase runs from 0 at the low to 1 at the
 * tropical cell's edge, then up by one for each further cell's width. The
 * bands' pressure goes as `−A cos(π · phase)`, with `A` the
 * {@link ZonalBands.amplitude}: the low, the subtropical high, a subpolar
 * low, a polar high and so on. Its slope in latitude, `A π sin(π · phase)`
 * times the rate at which the phase grows, is then scaled at each
 * latitude by `√(f² + k²)` over its Earth value at 45°, where `f` is the
 * Coriolis parameter there and `k` is {@link SEA_FRICTION_PER_S}: the
 * gradient a wind of a given speed is balanced by (see
 * {@link windsFromPressure}), so that the bands' winds are about as
 * strong at every latitude and every day length, as the observed trades
 * and westerlies are, while the pressure rises gently in the tropics and
 * steeply in mid-latitudes. Beyond the second cell the slope is scaled by
 * {@link OUTER_CELL_SHARE}, on each side of the low by that side's strength
 * (see {@link SIDE_CONTRAST_K}), so that a side whose pole is as warm as
 * the low has no bands, and within {@link POLE_TAPER_DEG} of a pole it is
 * eased to nothing. The slope is summed by the trapezoidal rule every
 * {@link TABLE_STEP_DEG}, so the pressure has no step anywhere.
 *
 * @param profile - The month's zonal-mean sea-level temperature, in
 * degrees Celsius, in bands of equal width from the south, as
 * {@link zonalMean} gives it. A band with no value takes its nearest
 * band's. Not changed.
 * @param planet - The planet's settings: only its day length is read.
 * @returns New bands.
 * @throws RangeError if the profile holds no value at all, or a value that
 * is not finite.
 */
export const zonalBands = (
	profile: ZonalMean,
	planet: PlanetSettings,
): ZonalBands => {
	const values = filledMeans(profile);
	const count = values.length;
	const bandLatitude = (band: number): number =>
		-90 + ((band + 0.5) * 180) / count;
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
		const above = (values[band] as number) - (hottest - HOT_WINDOW_K);
		if (above > 0) {
			const latitude = bandLatitude(band);
			const weight = above * Math.cos(latitude * RADIANS_PER_DEGREE);
			weights += weight;
			weighted += weight * latitude;
		}
	}
	// The hottest band's weight is above zero, since no band's middle lies
	// at a pole, so the weights never sum to nothing.
	const hottestLatitude = weighted / weights;
	const shifted =
		hottestLatitude *
		(1 +
			(LOW_SHIFT_GAIN - 1) *
				Math.exp(-((hottestLatitude / LOW_SHIFT_FADE_DEG) ** 2)));
	// A low near a pole moves on to it, so that the low, not a high, lies
	// over a pole that is the hottest place.
	const away = Math.abs(shifted);
	const lowLatitude =
		shifted +
		Math.sign(shifted) *
			smoothStep(
				(away - POLE_LOW_FROM_DEG) / (POLE_LOW_TO_DEG - POLE_LOW_FROM_DEG),
			) *
			(90 - away);
	const atLowK = valueAt(values, lowLatitude);
	const northStrength = smoothStep(
		(atLowK - (values[count - 1] as number)) / SIDE_CONTRAST_K,
	);
	const southStrength = smoothStep(
		(atLowK - (values[0] as number)) / SIDE_CONTRAST_K,
	);
	const contrast =
		valueAt(values, hottestLatitude) -
		0.5 * ((values[0] as number) + (values[count - 1] as number));
	const ratio = Math.min(
		MAX_CONTRAST_RATIO,
		Math.max(MIN_CONTRAST_RATIO, contrast / EARTH_CONTRAST_K),
	);
	const omega = rotationRate(planet);
	const cellWidth = Math.min(
		90,
		EARTH_CELL_WIDTH_DEG *
			(EARTH_ROTATION_RATE / omega) ** ROTATION_POWER *
			ratio ** CONTRAST_POWER,
	);
	const shift = Math.min(
		1,
		(EDGE_SHIFT_SHARE * (90 - cellWidth)) / (90 - EARTH_CELL_WIDTH_DEG),
	);
	// The narrowest a side may be: MIN_SUMMER_CELL_SHARE of a cell near the
	// equator, widening to a whole cell as the low lies out towards and
	// beyond where the tropical cell's edge would be, so that the side
	// towards a far summer pole is never squeezed into a ridge.
	const reach = Math.abs(lowLatitude) / cellWidth;
	const gap =
		cellWidth *
		(MIN_SUMMER_CELL_SHARE +
			(1 - MIN_SUMMER_CELL_SHARE) *
				smoothStep(
					(reach - WIDE_SUMMER_FROM_SHARE) /
						(WIDE_SUMMER_TO_SHARE - WIDE_SUMMER_FROM_SHARE),
				));
	// Each side's width in full, as if no pole stood in its way; an edge
	// beyond a pole is cut short there, the phase reaching the pole short
	// of 1, so no high stands beyond a low near the pole.
	const northSide = Math.max(
		gap,
		cellWidth + shift * lowLatitude - lowLatitude,
	);
	const southSide = Math.max(
		gap,
		cellWidth - shift * lowLatitude + lowLatitude,
	);
	const northEdge = Math.min(90, lowLatitude + northSide);
	const southEdge = Math.max(-90, lowLatitude - southSide);
	const amplitude = (BAND_AMPLITUDE_HPA * cellWidth) / EARTH_CELL_WIDTH_DEG;
	// The phase at a latitude, and how fast it grows northward, per degree.
	const phaseAt = (latitude: number): number => {
		if (latitude >= lowLatitude) {
			return latitude <= northEdge
				? (latitude - lowLatitude) / northSide
				: 1 + (latitude - northEdge) / cellWidth;
		}
		return latitude >= southEdge
			? (lowLatitude - latitude) / southSide
			: 1 + (southEdge - latitude) / cellWidth;
	};
	const phaseRate = (latitude: number): number => {
		if (latitude >= lowLatitude) {
			return latitude <= northEdge ? 1 / northSide : 1 / cellWidth;
		}
		return latitude >= southEdge ? -1 / southSide : -1 / cellWidth;
	};
	const friction2 = SEA_FRICTION_PER_S * SEA_FRICTION_PER_S;
	const earthBalance = Math.sqrt(
		coriolisAt45(EARTH_ROTATION_RATE) ** 2 + friction2,
	);
	// The slope of the bands' pressure, in hectopascals a degree.
	const slopeAt = (latitude: number): number => {
		const sine = Math.sin(latitude * RADIANS_PER_DEGREE);
		const coriolis = 2 * omega * sine;
		const balance = Math.sqrt(coriolis * coriolis + friction2) / earthBalance;
		const ease =
			1 -
			smoothStep((Math.abs(latitude) - (90 - POLE_TAPER_DEG)) / POLE_TAPER_DEG);
		const phase = phaseAt(latitude);
		// Eased in over the first quarter of the cell beyond the second, so
		// that the slope of the wind has no corner where it starts.
		const share = 1 - (1 - OUTER_CELL_SHARE) * smoothStep(4 * (phase - 2));
		// The two sides meet at the low, where the slope is zero, so a side's
		// strength makes no step there.
		const strength = latitude >= lowLatitude ? northStrength : southStrength;
		return (
			amplitude *
			share *
			strength *
			balance *
			ease *
			Math.PI *
			Math.sin(Math.PI * phase) *
			phaseRate(latitude)
		);
	};
	// The pressure at every TABLE_STEP_DEG from the south pole, by the
	// trapezoidal rule, then taken as 0 at the low.
	const steps = Math.round(180 / TABLE_STEP_DEG);
	const table = new Float64Array(steps + 1);
	let previous = slopeAt(-90);
	for (let step = 1; step <= steps; step++) {
		const slope = slopeAt(-90 + step * TABLE_STEP_DEG);
		table[step] =
			(table[step - 1] as number) + 0.5 * TABLE_STEP_DEG * (previous + slope);
		previous = slope;
	}
	const tableAt = (latitude: number): number => {
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
	const atLow = tableAt(lowLatitude);
	const offset = (latitude: number): number => tableAt(latitude) - atLow;
	const northCells = phaseAt(90);
	const southCells = phaseAt(-90);
	return {
		hottestLatitude,
		lowLatitude,
		northEdge,
		southEdge,
		cellWidth,
		northCells,
		southCells,
		northStrength,
		southStrength,
		amplitude,
		contrast,
		offset,
	};
};

/**
 * The thermal highs and lows of one month: each cell's sea-level
 * temperature less its latitude's mean, times −{@link THERMAL_HPA_PER_K},
 * smoothed over {@link THERMAL_SMOOTHING_KM} by {@link smoothField}, so
 * that cold places carry highs and hot places lows.
 *
 * @remarks
 * The latitude's mean is the profile's, by straight lines between the
 * middles of its bands. A warmth above it counts as {@link WARM_LIMIT_K}
 * times its hyperbolic tangent over that; a cold below it counts in full.
 * Over the sea the response is {@link SEA_THERMAL_SHARE} of the land's, and
 * over land it falls by a factor of e every {@link THERMAL_HEIGHT_M} of
 * height above the sea level. Smoothing keeps the area-weighted mean,
 * which is not zero; {@link rulesWinds} takes it away with the rest.
 *
 * @param world - The world: its grid, terrain and sea level. Not changed.
 * @param seaLevelTemperature - The month's air temperature brought down to
 * sea level, in degrees Celsius or kelvin, one value per cell. Not changed.
 * @param profile - Its zonal mean, as {@link zonalMean} gives it, in the
 * same unit. Not changed.
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
): Float64Array => {
	const grid = getGrid(world.resolution);
	if (seaLevelTemperature.length !== grid.cellCount) {
		throw new RangeError(
			`A temperature field must hold ${grid.cellCount} values, one per cell; got ${seaLevelTemperature.length}`,
		);
	}
	const values = filledMeans(profile);
	const latitudes = cellLatitudes(grid);
	const anomaly = new Float64Array(grid.cellCount);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const warmth =
			(seaLevelTemperature[cell] as number) -
			valueAt(values, latitudes[cell] as number);
		const felt =
			warmth > 0 ? WARM_LIMIT_K * Math.tanh(warmth / WARM_LIMIT_K) : warmth;
		const height = (world.elevation[cell] as number) - world.seaLevel;
		const share =
			height > 0 ? Math.exp(-height / THERMAL_HEIGHT_M) : SEA_THERMAL_SHARE;
		anomaly[cell] = -THERMAL_HPA_PER_K * share * felt;
	}
	return smoothField(grid, anomaly, THERMAL_SMOOTHING_KM, anomaly);
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

const surfaceOf = (world: World): Surface => {
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
		friction[cell] = SEA_FRICTION_PER_S * (land ? LAND_FRICTION_FACTOR : 1);
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
			blocking[cell] = steepness / (steepness + BLOCKING_SLOPE);
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
 * {@link SEA_FRICTION_PER_S}, times {@link LAND_FRICTION_FACTOR} on land.
 * Writing `g = −∇p / ρ`, it is
 * `u = (k gₑ + f gₙ) / (k² + f²)` eastward and
 * `v = (k gₙ − f gₑ) / (k² + f²)` northward: along the isobars, low
 * pressure on the left in the north, where `f` is much more than `k`, and
 * straight down the gradient at the equator, where `f` is zero. Since `k`
 * is never zero, the wind is finite everywhere at every day length.
 *
 * Then, of the wind's part along the slope of the ground, the share
 * `s / (s + s₀)` is taken away, where `s` is the slope and `s₀` is
 * {@link BLOCKING_SLOPE}, turning the wind along steep high ground rather
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
 * @returns The eastward and northward wind at each cell's centre, in
 * metres a second, in new arrays.
 * @throws RangeError if the pressure does not hold one value per cell.
 */
export const windsFromPressure = (
	world: World,
	pressure: ArrayLike<number>,
): { east: Float32Array; north: Float32Array } => {
	const surface = surfaceOf(world);
	if (pressure.length !== surface.grid.cellCount) {
		throw new RangeError(
			`A pressure field must hold ${surface.grid.cellCount} values, one per cell; got ${pressure.length}`,
		);
	}
	return windsOn(surface, pressure, scratchOf(surface.grid));
};

/**
 * The rules wind model: each month's sea-level pressure from its zonal
 * bands and its thermal highs and lows, shifted to a mean of
 * {@link REFERENCE_PRESSURE_HPA}, and the wind from that pressure.
 *
 * @remarks
 * Each month's air temperature is brought down to sea level by adding back
 * the temperature model's own lapse-rate cooling of each cell
 * ({@link lapseCooling}); its zonal mean in {@link PROFILE_BANDS} bands
 * places the bands ({@link zonalBands}) and gives the mean the thermal part
 * is taken against ({@link thermalPressure}); the wind follows by
 * {@link windsFromPressure}. Nothing but the temperatures, the terrain, the
 * sea level and the day length is read, so a month's winds depend on its
 * temperature alone.
 *
 * @throws RangeError if there are not twelve temperature fields of one
 * value per cell; and, from {@link thermalPressure}, if a field holds a
 * value that is not finite.
 */
export const rulesWinds: WindModel = (world, temperatures): WindResult => {
	if (temperatures.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`The rules model needs ${MONTHS_PER_YEAR} months of temperature; got ${temperatures.length}`,
		);
	}
	const surface = surfaceOf(world);
	const { grid } = surface;
	const { cellCount, areas } = grid;
	const latitudes = cellLatitudes(grid);
	const cooling = lapseCooling(world);
	const scratch = scratchOf(grid);
	const seaLevel = new Float64Array(cellCount);
	let totalArea = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		totalArea += areas[cell] as number;
	}
	const east: Float32Array[] = [];
	const north: Float32Array[] = [];
	const pressure: Float32Array[] = [];
	for (const month of temperatures) {
		if (month.length !== cellCount) {
			throw new RangeError(
				`A temperature field must hold ${cellCount} values, one per cell; got ${month.length}`,
			);
		}
		for (let cell = 0; cell < cellCount; cell++) {
			seaLevel[cell] = (month[cell] as number) + (cooling[cell] as number);
		}
		const profile = zonalMean(grid, seaLevel, PROFILE_BANDS);
		const bands = zonalBands(profile, world.planet);
		const field = thermalPressure(world, seaLevel, profile);
		let total = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const value =
				(field[cell] as number) + bands.offset(latitudes[cell] as number);
			field[cell] = value;
			total += (areas[cell] as number) * value;
		}
		const shift = REFERENCE_PRESSURE_HPA - total / totalArea;
		for (let cell = 0; cell < cellCount; cell++) {
			field[cell] = (field[cell] as number) + shift;
		}
		const winds = windsOn(surface, field, scratch);
		east.push(winds.east);
		north.push(winds.north);
		pressure.push(Float32Array.from(field));
	}
	return { east, north, pressure };
};
