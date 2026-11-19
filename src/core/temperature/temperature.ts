/**
 * Near-surface air temperature through the year: a seasonal energy balance
 * on the world's own grid.
 *
 * Every cell holds the temperature its air would have at sea level, in
 * kelvin, and a sea cell the sea's too (see below). Over land, the air's
 * heat capacity times the rate at which that temperature changes is the
 * sunlight it absorbs, less the heat it radiates to space, plus the heat
 * its four neighbours pass it:
 *
 * `C dT/dt = (1 − α) Q − ε σ T⁴ + Σ_k D w_k (T_k − T) / A`
 *
 * where `Q` is the daily-mean sunlight at the top of the atmosphere for the
 * cell's latitude and the time of year, `α` the reflectivity, `ε` an
 * emissivity that falls as the greenhouse effect strengthens, `D` a
 * diffusivity, `w_k` the edge weights of {@link edgeGeometry} and `A` the
 * cell's area on the unit sphere. The air over land is cooled by a fixed
 * lapse rate for the land's height above sea level. As that air
 * temperature falls below freezing, reflectivity rises smoothly, standing
 * for snow and ice.
 *
 * A sea cell holds a second temperature, the sea's: its mixed top layer,
 * with that layer's heat capacity, under the air with the air's own. The
 * sunlight reaching the sea warms the sea, and the sea and the air pass
 * heat as their difference drives it, at `k`,
 * {@link TemperatureModel.airSeaExchange}:
 *
 * `C_s dT_s/dt = (1 − α) Q − c S̄ − c k (T_s − T)`
 *
 * while the air's balance above has, in place of the sunlight, `c S̄ +
 * c k (T_s − T)`. `S̄` is the year's mean sunlight the sea absorbs clear of
 * ice, which it gives up to the air as evaporation and long-wave radiation
 * whatever their difference, so that the sea stores the sunlight's swing
 * through the year and the two come to the same temperature where nothing
 * else moves heat; `c` is the share of the sea clear of ice. The ice share
 * follows the sea's own temperature: the sea ices over as it nears
 * freezing, which brightens it and cuts it off from the air, and it does
 * not cool below freezing, while the air above can. The sea does not spread
 * heat to its neighbours itself: the air's diffusivity over the sea stands
 * for all the heat carried sideways there. A world with no sea is solved
 * exactly as before the sea had a temperature of its own.
 *
 * Time runs in real seconds: a year lasts {@link yearLengthDays}, split into
 * twelve equal months, January first, each stepped a fixed number of times
 * by second-order backward differences. Each step is implicit: the exchange
 * between cells and the outgoing heat, linearised about where the step is
 * expected to end, are solved for together (see
 * {@link createExchangeSolver}); the air's reflectivity is read at that
 * expected end, the sea's ice share at the step's start. The year is
 * repeated until it stops changing.
 *
 * A solve may be given a year of winds, as the flows they carry across the
 * cells' edges. Each step is then followed by an implicit upwind step that
 * carries heat along the flows (see {@link createHeatAdvector}), with the
 * flows of the time the step ends at, interpolated between the months'; it
 * is skipped when {@link TemperatureModel.windHeatCapacity} is 0. The winds
 * carry the air's heat; at sea the heat they bring is shared with the sea
 * as the exchange shares it over a step.
 *
 * A sea cell's sea has no neighbour but its air, so within each step it is
 * solved for at once in terms of the air's temperature at the step's end
 * (see {@link seaStep}), and the air's equations keep their form.
 *
 * A world of more than 64 cells per face edge is worked out on the grid a
 * step coarser (see {@link solveResolution}) and its sea-level temperatures
 * carried back to the world's own grid, where each cell's air is cooled by
 * its own height: see {@link solveTemperature}.
 *
 * The constants are those of published simple energy-balance models, then
 * tuned against the observed Earth; they are tuning parameters, not
 * physical truth.
 */

import { constantsOf, TEMPERATURE_CONFIG, valuesOf } from '../config';
import { coarsenWorld, refineField } from '../grid/coarsen';
import {
	edgeGeometry,
	type Grid,
	getGrid,
	isSupportedResolution,
	NEIGHBOUR_COUNT,
	type Resolution,
	SUPPORTED_RESOLUTIONS,
} from '../grid/grid';
import {
	cellLatitudes,
	dailyInsolation,
	MONTHS_PER_YEAR,
	monthlyInsolation,
} from '../planet/insolation';
import {
	clampSetting,
	DEFAULT_PLANET,
	normalisePlanet,
	PLANET_LIMITS,
	type PlanetSettings,
	TEMPERATURE_SETTINGS,
	type TemperaturePlanet,
	temperaturePlanet,
	yearLengthDays,
} from '../planet/planet';
import { MAX_ELEVATION_M, MIN_ELEVATION_M, type World } from '../world/world';
import {
	createHeatAdvector,
	type HeatAdvector,
	interpolateFlows,
} from './advection';
import { createExchangeSolver, type ExchangeSolver } from './exchange';
import type { MonthlyTemperature } from './observed';

/**
 * The constants of the temperature model.
 *
 * @remarks
 * All of them are tuning parameters. Where the physical ones start from is
 * given in {@link TEMPERATURE_CONFIG}; the numerical ones were chosen by
 * measurement.
 */
export type TemperatureModel = {
	/**
	 * Strength of the heat exchange between neighbouring cells, in watts per
	 * square metre per kelvin, for gradients measured on the unit sphere.
	 */
	readonly diffusivity: number;
	/**
	 * The same over land. An edge between land and ocean takes the mean of
	 * the two, so its coupling is the same seen from either side.
	 */
	readonly landDiffusivity: number;
	/**
	 * Heat capacity of the sea's mixed top layer, in joules per square metre
	 * per kelvin.
	 */
	readonly oceanHeatCapacity: number;
	/** Heat capacity of a land cell, in joules per square metre per kelvin. */
	readonly landHeatCapacity: number;
	/**
	 * Heat capacity of the air over the sea, in joules per square metre per
	 * kelvin: the air's own, apart from the sea's below it.
	 */
	readonly seaAirHeatCapacity: number;
	/**
	 * How readily heat passes between the sea and the air over it, in watts
	 * per square metre per kelvin of their difference, where the sea is
	 * clear of ice. Not negative.
	 */
	readonly airSeaExchange: number;
	/**
	 * The heat capacity per square metre of the air that carries heat along
	 * the wind, in joules per square metre per kelvin: how strongly the wind
	 * carries it. Not negative; at 0 the winds carry none and the winds
	 * given to a solve are not used.
	 */
	readonly windHeatCapacity: number;
	/** Cooling of the air with height above sea level, in kelvin per metre. */
	readonly lapseRate: number;
	/**
	 * How fast emissivity falls as the greenhouse effect strengthens: the
	 * emissivity is `1 / (1 + k g)` for greenhouse strength `g`.
	 */
	readonly greenhouseFactor: number;
	/** Reflectivity of ground clear of ice, averaged over the globe. */
	readonly albedo: number;
	/**
	 * How much more clear ground reflects towards the poles: the
	 * coefficient of the second Legendre polynomial of the sine of
	 * latitude, which averages to zero over the globe.
	 */
	readonly albedoPoleward: number;
	/** How much more land reflects than ocean, clear of ice. */
	readonly landAlbedoExtra: number;
	/** Reflectivity of ground wholly covered by snow or ice. */
	readonly iceAlbedo: number;
	/** Air temperature, in degrees Celsius, below which ice begins. */
	readonly iceStartC: number;
	/** Air temperature, in degrees Celsius, at and below which ice is complete. */
	readonly iceFullC: number;
	/**
	 * Sea temperature, in degrees Celsius, below which the sea starts to ice
	 * over.
	 */
	readonly seaIceStartC: number;
	/**
	 * The freezing point of sea water, in degrees Celsius: the sea is wholly
	 * iced over there and does not cool below it.
	 */
	readonly seaFreezingC: number;
	/** Implicit steps per month. */
	readonly stepsPerMonth: number;
	/**
	 * Accuracy to which each step's equations are solved, in kelvin: the
	 * estimated root-mean-square error, weighted by the step's masses (each
	 * cell's area times its heat capacity over the step, plus the rise of
	 * its outgoing heat with temperature).
	 */
	readonly solverToleranceK: number;
	/**
	 * The most iterations one solve of a step's equations may take, a whole
	 * number from 1 to {@link MAX_SOLVER_ITERATIONS}. A solve that runs out
	 * stops the result counting as converged.
	 */
	readonly solverMaxIterations: number;
	/**
	 * How far the terrain may drift, in kelvin, from the world of the solve
	 * from nothing that a starting state descends from, before the state is
	 * set aside and the solve starts from nothing: the drift is measured as
	 * {@link coolingDrift} measures it, against the state's
	 * {@link TemperatureState.referenceCoolingK}, and a state at or past the
	 * limit is set aside. Not negative; at 0 no state is carried on.
	 */
	readonly terrainDriftLimitK: number;
	/**
	 * The largest correction at the end of a year, in kelvin, below which the
	 * first pass of the correction is kept as it is and the later passes are
	 * not solved: they refine the slope of the outgoing heat over the shift,
	 * which for a shift this small is the tangent already. Not negative; at
	 * 0 every pass is solved.
	 */
	readonly correctionRefineK: number;
	/**
	 * How small the root-mean-square change a pass of the climate loop makes
	 * to the monthly temperature, weighted by area and over the twelve
	 * months, must be, in degrees Celsius, for the climate to count as
	 * settled. Above 0.
	 */
	readonly climateToleranceC: number;
	/**
	 * The most passes of the climate loop, a whole number from 1 to
	 * {@link MAX_CLIMATE_PASSES}. At 1, no climate settles, and none is
	 * carried on from.
	 */
	readonly climateMaxPasses: number;
	/**
	 * The share of a pass's change that is applied when the pass changes
	 * the temperature by more than the pass before: above 0 and at most 1.
	 */
	readonly climateOvershootShare: number;
};

/**
 * The model's constants as tuned against the observed Earth.
 *
 * @remarks
 * Built from {@link TEMPERATURE_CONFIG}, where each setting's value, unit
 * and explanation, and where it starts from, are written down.
 */
export const TEMPERATURE_MODEL: TemperatureModel = valuesOf(TEMPERATURE_CONFIG);

/**
 * The sea level and planet a temperature result was solved for, in the
 * forms the solver uses them: see {@link temperatureConditions}.
 *
 * @remarks
 * A plain object of numbers, so that it survives a structured clone.
 */
export type TemperatureConditions = {
	/** The sea level, in metres, as the single-precision number nearest it. */
	readonly seaLevel: number;
	/**
	 * The planet's settings that the temperature reads, as
	 * {@link normalisePlanet} gives them. The day length is not one of
	 * them: a solve of the temperature alone does not depend on it. A
	 * climate's record names it separately.
	 */
	readonly planet: TemperaturePlanet;
};

/**
 * The state a solve ended in, from which another solve can carry on
 * exactly: the sea-level temperature of every cell at the turn of the
 * year, and one step before it.
 *
 * @remarks
 * Plain typed arrays in a plain object, so that it survives a structured
 * clone and its arrays can be transferred. The temperatures are at sea
 * level, so they stay meaningful after the terrain changes; a solve that
 * carries on from them applies the world's own lapse rate and land, as
 * they are then. A state is carried on only for the sea level and planet
 * it was solved for: see {@link solveTemperature}.
 *
 * Its arrays hold one value per cell of the grid the world is solved on,
 * {@link solveResolution} of the world's (or the world's own, for a solve
 * with {@link SolveTemperatureOptions.fullResolution}): for a world of 128
 * cells per face edge, the 64 grid's cells.
 */
export type TemperatureState = {
	/** Sea-level temperature at the turn of the year, kelvin, per cell. */
	readonly temperatureK: Float64Array;
	/** The same one step earlier, kelvin, per cell. */
	readonly previousK: Float64Array;
	/**
	 * The sea's temperature at the turn of the year, kelvin, per cell; where
	 * the cell is land, its air's sea-level temperature, so that a cell a
	 * later edit floods starts its sea from its air.
	 */
	readonly seaTemperatureK: Float64Array;
	/** The same one step earlier, kelvin, per cell. */
	readonly seaPreviousK: Float64Array;
	/**
	 * The length of that step, in seconds, from {@link MIN_STEP_SECONDS} to
	 * {@link MAX_STEP_SECONDS}.
	 */
	readonly stepSeconds: number;
	/**
	 * The lapse-rate cooling of every cell's air, in kelvin, 0 at sea, in
	 * the world of the solve from nothing that this state descends from, on
	 * the grid that world was solved on: a solve from nothing records its
	 * own world's, and a solve that carries on from a state passes that
	 * state's on unchanged. A later solve measures how far its terrain has
	 * drifted from it (see {@link TemperatureModel.terrainDriftLimitK}).
	 */
	readonly referenceCoolingK: Float64Array;
};

/**
 * Where a solve may start from: a previous result's end state and the sea
 * level and planet it was solved for.
 *
 * @remarks
 * A {@link TemperatureResult} is one. The state is used only for the sea
 * level and planet in `solvedFor`; for any other the start is set aside.
 * The planet's day length is not part of this: a solve of the temperature
 * alone does not depend on it. It is also set aside once its terrain has
 * drifted to {@link TemperatureModel.terrainDriftLimitK} or past it. A start set aside
 * leaves the solve starting from nothing: see {@link solveTemperature} for
 * the rules and their order.
 */
export type TemperatureStart = {
	/** A previous result's end state. */
	readonly state: TemperatureState;
	/** The sea level and planet the previous result was solved for. */
	readonly solvedFor: TemperatureConditions;
};

/**
 * What the winds carry, for heat to be carried along with them: a year of
 * monthly flows across the edges of the grid the world is solved on.
 */
export type TemperatureWinds = {
	/**
	 * Twelve fields, January to December, of what the wind carries across
	 * every edge, in square metres a second, laid out as {@link edgeFlows}
	 * gives them: `4 * cellCount` values each, on the grid the world is
	 * solved on, which is {@link solveResolution} of the world's own unless
	 * `fullResolution` is set. Each should have no net flow in or out of
	 * any cell, as {@link flowingPart} gives them, so that heat is moved
	 * and never made. They must not be changed while the solve runs.
	 */
	readonly flows: readonly ArrayLike<number>[];
};

/** What {@link solveTemperature} may be given besides the world. */
export type SolveTemperatureOptions = {
	/**
	 * Where to start from instead of a first guess, usually the previous
	 * result for the world, before an edit. A start close to the answer
	 * needs fewer years.
	 */
	readonly start?: TemperatureStart;
	/**
	 * The most years to run, a whole number from 1 to
	 * {@link MAX_YEARS_LIMIT}; defaults to {@link DEFAULT_MAX_YEARS}.
	 */
	readonly maxYears?: number;
	/**
	 * How small a year's change must be to stop, in kelvin, finite and
	 * above zero; defaults to {@link DEFAULT_TOLERANCE_K}. See
	 * {@link TemperatureResult.converged}.
	 */
	readonly tolerance?: number;
	/** The model's constants; defaults to {@link TEMPERATURE_MODEL}. */
	readonly model?: TemperatureModel;
	/**
	 * The winds heat is carried along with, in each time step after the
	 * exchange between cells: an implicit upwind step by
	 * {@link createHeatAdvector}, the air's heat capacity the model's
	 * {@link TemperatureModel.windHeatCapacity}. Left out, or with that at
	 * 0, the solve is the one with no winds, bit for bit. The first guess
	 * for a solve from nothing does not use them.
	 */
	readonly winds?: TemperatureWinds;
	/**
	 * Whether to solve on the world's own grid whatever its resolution,
	 * rather than on {@link solveResolution} of it; defaults to false.
	 *
	 * @remarks
	 * For the tests and the timing script, which measure how far the coarser
	 * solve lies from the full one; it takes about four times as long at 128
	 * cells per face edge and five times at 256. The page never asks for it,
	 * and the worker takes nothing from a message but the world and a start,
	 * so no message can. A result's state is on the grid it was solved on,
	 * and is carried on only by a solve on the same grid.
	 */
	readonly fullResolution?: boolean;
	/**
	 * Called once as each year finishes, with how far the solve has come.
	 *
	 * @remarks
	 * It is given plain numbers and nothing of the solve's own, so it cannot
	 * change the result: a solve with it gives the same output, bit for bit,
	 * as one without. Whatever it throws ends the solve and is thrown from
	 * {@link solveTemperature} as it is.
	 */
	readonly onYear?: (progress: TemperatureProgress) => void;
};

/**
 * How far a solve has come, as each year finishes.
 *
 * @remarks
 * The solve cannot know how many years it will take: it stops when a year
 * changes little enough, and how fast the change shrinks depends on the
 * world and the start. {@link TemperatureProgress.estimatedYearsLeft} is
 * a guess from the last two years, and is left out where there is no
 * basis for one.
 */
export type TemperatureProgress = {
	/** The years finished so far, from 1. */
	readonly yearsDone: number;
	/** The most years the solve may run: it ends by then at the latest. */
	readonly maxYears: number;
	/**
	 * The year's change, in kelvin, measured as
	 * {@link TemperatureResult.finalChangeK} is.
	 */
	readonly changeK: number;
	/** The change below which the solve stops, in kelvin. */
	readonly toleranceK: number;
	/**
	 * How many more years the solve will run: exactly 0 when this year is
	 * its last, and otherwise an estimate, from 1 to the years left under
	 * the cap, or null when there is no basis for one. See
	 * {@link estimateYearsLeft}.
	 */
	readonly estimatedYearsLeft: number | null;
};

/** The temperature of a world through its year. */
export type TemperatureResult = {
	/**
	 * Twelve fields, January to December, of the mean near-surface air
	 * temperature over each month, in degrees Celsius, one value per cell
	 * of the world's own grid in cell order: the month's mean sea-level
	 * temperature, cooled by the lapse rate for the cell's own height. That
	 * is the mean of the air temperature itself everywhere except where the
	 * cooling is limited to half the sea-level temperature, on the high
	 * ground of the coldest planets. Above 64 cells per face edge the
	 * sea-level temperature is carried from the grid the world was solved on
	 * by {@link refineField}.
	 */
	readonly months: Float32Array[];
	/**
	 * Twelve fields, January to December, of the sea's own mean temperature
	 * over each month, in degrees Celsius, one value per cell of the world's
	 * own grid in cell order, and NaN where the cell is land, as the
	 * observed sea temperature marks it. It is the temperature of the sea's
	 * mixed top layer, apart from the air's in {@link months}. Above 64
	 * cells per face edge it is carried from the grid the world was solved
	 * on by {@link refineField}, a coarse land cell standing in with its
	 * air's sea-level temperature.
	 */
	readonly seaMonths: Float32Array[];
	/**
	 * The state the solve ended in, to carry on from, on the grid the world
	 * was solved on.
	 */
	readonly state: TemperatureState;
	/** The sea level and planet the result was solved for. */
	readonly solvedFor: TemperatureConditions;
	/** The number of years the solve ran, from 1. */
	readonly yearsRun: number;
	/**
	 * Whether the last year changed by less than the tolerance, and every
	 * step of that year, and its end's correction, were solved to their
	 * accuracy. The first guess is not counted.
	 *
	 * @remarks
	 * The last year changed by less than the tolerance when no cell's
	 * sea-level temperature ended it more than the tolerance from where it
	 * began it, and the correction made at its end for the heat it gained
	 * or lost moved no cell by more than the tolerance either. That bounds
	 * the change per year, not the distance left to the year that repeats
	 * exactly: where the ocean settles slowly, a year's change understates
	 * what is left, and the answer may lie a few times the tolerance from
	 * the repeating year (0.21 K, at the default tolerance of 0.05 K, for
	 * the Earth with a star 0.9 times as bright; 0.06 K for the Earth as it
	 * is).
	 */
	readonly converged: boolean;
	/**
	 * The last year's change, in kelvin: the largest change of any cell's
	 * sea-level temperature from the year's start to its end, or the
	 * largest correction made for the heat the year gained or lost if that
	 * is larger. See {@link solveTemperature}.
	 */
	readonly finalChangeK: number;
};

/** The annual summaries of a temperature result, one value per cell. */
export type TemperatureSummary = {
	/** The mean of the twelve months, in degrees Celsius. */
	readonly annualMean: Float32Array;
	/** The warmest month's temperature, in degrees Celsius. */
	readonly warmest: Float32Array;
	/** The coldest month's temperature, in degrees Celsius. */
	readonly coldest: Float32Array;
	/** The warmest less the coldest, in kelvin. */
	readonly range: Float32Array;
};

/** The Stefan–Boltzmann constant, in W m⁻² K⁻⁴ (CODATA 2018). */
export const STEFAN_BOLTZMANN = 5.670374419e-8;

/** Zero degrees Celsius in kelvin. */
export const ZERO_CELSIUS_K = 273.15;

/** The default most years a solve may run. */
export const DEFAULT_MAX_YEARS = 60;

/** The most years a solve may be allowed to run. */
export const MAX_YEARS_LIMIT = 1000;

/** The most steps a month the model may take. */
export const MAX_STEPS_PER_MONTH = 48;

/** The most iterations the model may allow one solve. */
export const MAX_SOLVER_ITERATIONS = 10_000;

/** The most passes the climate loop may be set to take. */
export const MAX_CLIMATE_PASSES = 100;

const SECONDS_PER_DAY = 86_400;

/**
 * The highest sea-level temperature a starting state may hold, in kelvin:
 * well above anything the hottest settings give.
 */
const MAX_START_K = 10_000;

/**
 * The shortest step any planet and model can take, in seconds: the
 * shortest year, about 19 days, in {@link MAX_STEPS_PER_MONTH} steps a
 * month.
 */
export const MIN_STEP_SECONDS =
	(yearLengthDays({
		...DEFAULT_PLANET,
		starMass: PLANET_LIMITS.starMass.max,
		orbitDistanceAu: PLANET_LIMITS.orbitDistanceAu.min,
	}) *
		SECONDS_PER_DAY) /
	(MONTHS_PER_YEAR * MAX_STEPS_PER_MONTH);

/**
 * The longest step any planet and model can take, in seconds: the longest
 * year, about 16 Earth years, in one step a month.
 */
export const MAX_STEP_SECONDS =
	(yearLengthDays({
		...DEFAULT_PLANET,
		starMass: PLANET_LIMITS.starMass.min,
		orbitDistanceAu: PLANET_LIMITS.orbitDistanceAu.max,
	}) *
		SECONDS_PER_DAY) /
	MONTHS_PER_YEAR;

/** The default change between years below which a solve stops, in kelvin. */
export const DEFAULT_TOLERANCE_K = 0.05;

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * The lowest sea-level temperature a cell may hold, in kelvin: the cosmic
 * background. The implicit step keeps temperatures positive by itself; this
 * only guards against rounding on the coldest planets.
 */
const MIN_TEMPERATURE_K = 2.7;

/** Spacing of the table step sunlight is interpolated from, in degrees. */
const SUNLIGHT_STEP_DEG = 0.1;

/** Rows of that table, from the south pole to the north inclusive. */
const SUNLIGHT_ROWS = Math.round(180 / SUNLIGHT_STEP_DEG) + 1;

const FIXED_CHOICES = constantsOf(TEMPERATURE_CONFIG);

/**
 * The least share of its outgoing heat's rise with temperature that a
 * cell's damping is taken to be when the year's end is corrected.
 */
const MIN_DAMPING_SHARE: number = FIXED_CHOICES.minDampingShare;

/** Times the year-end correction is solved, each with a better slope. */
const CORRECTION_PASSES: number = FIXED_CHOICES.correctionPasses;

/** Steps of the first guess at most, and the change at which it stops. */
const GUESS_ITERATIONS: number = FIXED_CHOICES.guessIterations;
const GUESS_CHANGE_K: number = FIXED_CHOICES.guessChangeK;

/**
 * Air temperature from sea-level temperature, both in kelvin, for a cell
 * whose ground stands `cooling` kelvin's worth of lapse rate above sea
 * level.
 *
 * @remarks
 * The cooling is limited to half the sea-level temperature, so that the
 * highest ground of the coldest planets does not reach absolute zero.
 * Anywhere warmer than twice the cooling, which is every planet near
 * Earth's, it is the lapse rate exactly.
 */
const airTemperature = (seaLevelK: number, cooling: number): number =>
	seaLevelK - Math.min(cooling, 0.5 * seaLevelK);

/** Everything about a world the model needs, worked out once per solve. */
type Setup = {
	/** Cells along a face edge of the grid solved on. */
	readonly resolution: Resolution;
	readonly cellCount: number;
	readonly areas: Float64Array;
	/** Lapse-rate cooling of each cell's air, in kelvin; 0 at sea. */
	readonly cooling: Float64Array;
	/** 1 for a land cell, 0 for ocean. */
	readonly land: Uint8Array;
	/** Reflectivity clear of ice. */
	readonly clearAlbedo: Float64Array;
	/** The planet's settings, within their limits. */
	readonly planet: PlanetSettings;
	/** The sea level, as the single-precision number nearest it. */
	readonly seaLevel: number;
	/** The row of {@link SUNLIGHT_ROWS} below each cell's latitude. */
	readonly sunlightRow: Int32Array;
	/** How far each cell's latitude lies from that row to the next, 0 to 1. */
	readonly sunlightWeight: Float64Array;
	/** Annual-mean sunlight, W m⁻². */
	readonly annualSunlight: Float64Array;
	/** Emissivity times the Stefan–Boltzmann constant. */
	readonly emission: number;
	readonly yearSeconds: number;
	readonly model: TemperatureModel;
};

/**
 * Throws unless a world is one the temperature can be solved for: a
 * supported resolution, one finite elevation per cell, and a sea level
 * from {@link MIN_ELEVATION_M} to {@link MAX_ELEVATION_M}.
 *
 * @param world - The world. It is not changed.
 * @throws RangeError naming the first thing found wrong.
 */
export const assertSolvableWorld = (world: World): void => {
	if (!isSupportedResolution(world.resolution)) {
		throw new RangeError(
			`Unsupported world resolution ${world.resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	const { cellCount } = getGrid(world.resolution);
	if (world.elevation.length !== cellCount) {
		throw new RangeError(
			`A world of resolution ${world.resolution} has ${cellCount} cells; its elevation holds ${world.elevation.length}`,
		);
	}
	// A sea level within the elevation limits also stays finite as the
	// single-precision number a result records it as.
	if (
		!(world.seaLevel >= MIN_ELEVATION_M && world.seaLevel <= MAX_ELEVATION_M)
	) {
		throw new RangeError(
			`A sea level must lie from ${MIN_ELEVATION_M} to ${MAX_ELEVATION_M} m; got ${world.seaLevel}`,
		);
	}
	for (let cell = 0; cell < cellCount; cell++) {
		if (!Number.isFinite(world.elevation[cell])) {
			throw new RangeError(
				`Temperature needs finite elevations; cell ${cell} holds ${world.elevation[cell]}`,
			);
		}
	}
};

export const assertModel = (model: TemperatureModel): void => {
	if (typeof model !== 'object' || model === null) {
		throw new RangeError("A model's constants must be an object");
	}
	for (const name of Object.keys(
		TEMPERATURE_MODEL,
	) as (keyof TemperatureModel)[]) {
		const value: unknown = model[name];
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			throw new RangeError(
				`The model's ${name} must be a finite number; got ${String(value)}`,
			);
		}
	}
	const positive: (keyof TemperatureModel)[] = [
		'diffusivity',
		'landDiffusivity',
		'oceanHeatCapacity',
		'landHeatCapacity',
		'seaAirHeatCapacity',
		'solverToleranceK',
	];
	for (const name of positive) {
		if (!(model[name] > 0)) {
			throw new RangeError(`The model's ${name} must be above zero`);
		}
	}
	for (const name of [
		'greenhouseFactor',
		'windHeatCapacity',
		'airSeaExchange',
		'lapseRate',
		'terrainDriftLimitK',
		'correctionRefineK',
	] as const) {
		if (!(model[name] >= 0)) {
			throw new RangeError(`The model's ${name} must not be negative`);
		}
	}
	// The second Legendre polynomial runs from -1/2 at the equator to 1 at
	// the poles, so these are the clear-ground extremes at any latitude.
	const { albedo, albedoPoleward, landAlbedoExtra, iceAlbedo } = model;
	const lowest =
		albedo +
		Math.min(-0.5 * albedoPoleward, albedoPoleward) +
		Math.min(0, landAlbedoExtra);
	const highest =
		albedo +
		Math.max(-0.5 * albedoPoleward, albedoPoleward) +
		Math.max(0, landAlbedoExtra);
	if (!(lowest >= 0 && highest <= 1 && iceAlbedo >= 0 && iceAlbedo <= 1)) {
		throw new RangeError(
			"The model's albedos must lie from 0 to 1 at every latitude, on land and sea",
		);
	}
	if (
		!(
			Number.isInteger(model.solverMaxIterations) &&
			model.solverMaxIterations >= 1 &&
			model.solverMaxIterations <= MAX_SOLVER_ITERATIONS
		)
	) {
		throw new RangeError(
			`The model's solverMaxIterations must be a whole number from 1 to ${MAX_SOLVER_ITERATIONS}`,
		);
	}
	const { stepsPerMonth } = model;
	if (
		!(
			Number.isInteger(stepsPerMonth) &&
			stepsPerMonth >= 1 &&
			stepsPerMonth <= MAX_STEPS_PER_MONTH
		)
	) {
		throw new RangeError(
			`The model's stepsPerMonth must be a whole number from 1 to ${MAX_STEPS_PER_MONTH}`,
		);
	}
	if (!(model.climateToleranceC > 0)) {
		throw new RangeError("The model's climateToleranceC must be above zero");
	}
	if (
		!(
			Number.isInteger(model.climateMaxPasses) &&
			model.climateMaxPasses >= 1 &&
			model.climateMaxPasses <= MAX_CLIMATE_PASSES
		)
	) {
		throw new RangeError(
			`The model's climateMaxPasses must be a whole number from 1 to ${MAX_CLIMATE_PASSES}`,
		);
	}
	if (!(model.climateOvershootShare > 0 && model.climateOvershootShare <= 1)) {
		throw new RangeError(
			"The model's climateOvershootShare must be above zero and at most one",
		);
	}
	if (!(model.iceStartC > model.iceFullC)) {
		throw new RangeError("The model's iceStartC must be above its iceFullC");
	}
	if (!(model.seaIceStartC > model.seaFreezingC)) {
		throw new RangeError(
			"The model's seaIceStartC must be above its seaFreezingC",
		);
	}
};

/**
 * Each cell's lapse-rate cooling, in kelvin, written into `into`: the lapse
 * rate times the cell's height above the sea level on land, 0 at sea.
 */
const coolingInto = (
	world: World,
	lapseRate: number,
	into: Float64Array,
): void => {
	const level = Math.fround(world.seaLevel);
	for (let cell = 0; cell < into.length; cell++) {
		const height = (world.elevation[cell] as number) - level;
		into[cell] = height > 0 ? lapseRate * height : 0;
	}
};

const setUp = (world: World, model: TemperatureModel): Setup => {
	const planet = normalisePlanet(world.planet);
	const grid = getGrid(world.resolution);
	const { cellCount, areas } = grid;
	const latitudes = cellLatitudes(grid);
	const level = Math.fround(world.seaLevel);
	const cooling = new Float64Array(cellCount);
	coolingInto(world, model.lapseRate, cooling);
	const landMask = new Uint8Array(cellCount);
	const clearAlbedo = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		const land = (world.elevation[cell] as number) - level > 0;
		const sine = Math.sin((latitudes[cell] as number) * RADIANS_PER_DEGREE);
		const legendre = 0.5 * (3 * sine * sine - 1);
		landMask[cell] = land ? 1 : 0;
		clearAlbedo[cell] =
			model.albedo +
			model.albedoPoleward * legendre +
			(land ? model.landAlbedoExtra : 0);
	}
	const sunlightRow = new Int32Array(cellCount);
	const sunlightWeight = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		const position = ((latitudes[cell] as number) + 90) / SUNLIGHT_STEP_DEG;
		const row = Math.min(Math.floor(position), SUNLIGHT_ROWS - 2);
		sunlightRow[cell] = row;
		sunlightWeight[cell] = position - row;
	}
	const annualSunlight = new Float64Array(cellCount);
	for (const month of monthlyInsolation(latitudes, planet)) {
		for (let cell = 0; cell < cellCount; cell++) {
			annualSunlight[cell] =
				(annualSunlight[cell] as number) +
				(month[cell] as number) / MONTHS_PER_YEAR;
		}
	}
	return {
		resolution: world.resolution,
		cellCount,
		areas,
		cooling,
		land: landMask,
		clearAlbedo,
		planet,
		seaLevel: level,
		sunlightRow,
		sunlightWeight,
		annualSunlight,
		emission:
			STEFAN_BOLTZMANN /
			(1 + model.greenhouseFactor * planet.greenhouseStrength),
		yearSeconds: yearLengthDays(planet) * SECONDS_PER_DAY,
		model,
	};
};

/**
 * The sunlight on every cell at one time of year, in watts per square
 * metre.
 *
 * @remarks
 * Sunlight changes smoothly through the year, so each step takes it at
 * the time the step ends, which is where backward differences evaluate
 * the rate of change. Holding it at the month's mean instead would make it
 * jump at every month's end, and taking a step's mean would put it half a
 * step early; either costs the stepping its second order. It is worked out
 * on a table of latitudes and interpolated to each cell.
 *
 * @param time - The time of year, as a fraction of the year.
 */
const sunlightAt = (
	setup: Setup,
	time: number,
	table: Float64Array,
	into: Float64Array,
): void => {
	const { planet, sunlightRow, sunlightWeight, cellCount } = setup;
	for (let row = 0; row < SUNLIGHT_ROWS; row++) {
		const latitude = Math.min(90, -90 + row * SUNLIGHT_STEP_DEG);
		table[row] = dailyInsolation(latitude, time, planet);
	}
	for (let cell = 0; cell < cellCount; cell++) {
		const row = sunlightRow[cell] as number;
		const low = table[row] as number;
		into[cell] =
			low +
			(sunlightWeight[cell] as number) * ((table[row + 1] as number) - low);
	}
};

/**
 * The coupling of every edge: its weight times the mean of the
 * diffusivities of the cells either side, the same value from both sides.
 */
const coupling = (setup: Setup, grid: Grid): Float64Array => {
	const { weights } = edgeGeometry(grid);
	const { land, model } = setup;
	const { neighbours } = grid;
	const result = new Float64Array(weights.length);
	for (let entry = 0; entry < weights.length; entry++) {
		const here = land[Math.floor(entry / NEIGHBOUR_COUNT)]
			? model.landDiffusivity
			: model.diffusivity;
		const there = land[neighbours[entry] as number]
			? model.landDiffusivity
			: model.diffusivity;
		result[entry] = 0.5 * (here + there) * (weights[entry] as number);
	}
	return result;
};

/**
 * The share of a cell clear of snow and ice at an air temperature in
 * kelvin: 1 above {@link TemperatureModel.iceStartC}, 0 at and below
 * {@link TemperatureModel.iceFullC}, and a smooth step between whose slope
 * is zero at both ends.
 */
const clearShare = (airK: number, model: TemperatureModel): number => {
	const share =
		(airK - ZERO_CELSIUS_K - model.iceFullC) /
		(model.iceStartC - model.iceFullC);
	if (share >= 1) {
		return 1;
	}
	if (share <= 0) {
		return 0;
	}
	return share * share * (3 - 2 * share);
};

/**
 * The rate at which {@link clearShare} rises with air temperature, per
 * kelvin.
 */
const clearShareSlope = (airK: number, model: TemperatureModel): number => {
	const width = model.iceStartC - model.iceFullC;
	const share = (airK - ZERO_CELSIUS_K - model.iceFullC) / width;
	if (share >= 1 || share <= 0) {
		return 0;
	}
	return (6 * share * (1 - share)) / width;
};

/**
 * The one temperature, in kelvin, at which the whole world would radiate
 * what it absorbs of the year's mean sunlight with its ground clear of ice.
 */
const uniformBalance = (setup: Setup): number => {
	const { cellCount, areas, annualSunlight, clearAlbedo, emission } = setup;
	let absorbed = 0;
	let area = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		absorbed +=
			(areas[cell] as number) *
			(1 - (clearAlbedo[cell] as number)) *
			(annualSunlight[cell] as number);
		area += areas[cell] as number;
	}
	return Math.max(MIN_TEMPERATURE_K, (absorbed / area / emission) ** 0.25);
};

/**
 * The area-weighted mean of how far apart, in kelvin, two fields of one
 * value per cell lie.
 */
const distanceFrom = (
	areas: Float64Array,
	first: Float64Array,
	second: Float64Array,
): number => {
	let total = 0;
	let area = 0;
	for (let cell = 0; cell < areas.length; cell++) {
		total +=
			(areas[cell] as number) *
			Math.abs((first[cell] as number) - (second[cell] as number));
		area += areas[cell] as number;
	}
	return total / area;
};

/**
 * The balance with the year's mean sunlight and no heat capacity: where
 * each cell's absorbed sunlight, outgoing heat and exchange cancel.
 *
 * @remarks
 * Newton's method on the outgoing heat, with the reflectivity taken from
 * the previous iterate, from a uniform temperature that balances the
 * global mean sunlight. A first guess for a solve from nothing, which
 * spares most of the years the ocean would otherwise take to warm up.
 *
 * @returns The guess, sea-level temperature in kelvin, in a new array.
 */
const startGuess = (setup: Setup, solver: ExchangeSolver): Float64Array => {
	const {
		cellCount,
		areas,
		annualSunlight,
		clearAlbedo,
		cooling,
		emission,
		model,
	} = setup;
	const state = new Float64Array(cellCount).fill(uniformBalance(setup));
	const mass = new Float64Array(cellCount);
	const rhs = new Float64Array(cellCount);
	const next = new Float64Array(cellCount);
	for (let iteration = 0; iteration < GUESS_ITERATIONS; iteration++) {
		for (let cell = 0; cell < cellCount; cell++) {
			const t = state[cell] as number;
			const clear = clearShare(
				airTemperature(t, cooling[cell] as number),
				model,
			);
			const albedo =
				model.iceAlbedo +
				((clearAlbedo[cell] as number) - model.iceAlbedo) * clear;
			const radiation = emission * t * t * t;
			const cellArea = areas[cell] as number;
			mass[cell] = cellArea * 4 * radiation;
			rhs[cell] =
				cellArea *
				((1 - albedo) * (annualSunlight[cell] as number) + 3 * radiation * t);
		}
		solver.setMass(mass);
		next.set(state);
		solver.solve(rhs, next, model.solverToleranceK);
		let change = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const value = Math.max(MIN_TEMPERATURE_K, next[cell] as number);
			change = Math.max(change, Math.abs(value - (state[cell] as number)));
			state[cell] = value;
		}
		if (change < GUESS_CHANGE_K) {
			break;
		}
	}
	return state;
};

/** {@link annualBalance} for arguments already checked. */
const balanceOnGrid = (world: World, model: TemperatureModel): Float64Array => {
	const setup = setUp(world, model);
	const grid = getGrid(world.resolution);
	const solver = createExchangeSolver(
		grid,
		coupling(setup, grid),
		model.solverMaxIterations,
	);
	return startGuess(setup, solver);
};

/**
 * The balance with the year's mean sunlight and no heat capacity of a world
 * on its own grid: where each cell's absorbed sunlight, outgoing heat and
 * exchange cancel, as sea-level temperature in kelvin.
 *
 * @remarks
 * Worked out to within 0.1 K a step, in at most 20 steps of Newton's method
 * on the outgoing heat, from a uniform temperature. It is the first guess of
 * a solve from nothing on the coarsest grid; on a finer grid a solve from
 * nothing starts from this balance for {@link coarsenWorld} of its world,
 * carried to its own grid by {@link refineField}: see
 * {@link solveTemperature}.
 *
 * @param world - The world. It is not changed.
 * @param model - The model; defaults to {@link TEMPERATURE_MODEL}.
 * @returns A new array, one value per cell in cell order.
 * @throws RangeError if the world's resolution is not supported, if its
 * elevations are not one finite value per cell, if its sea level does not
 * lie from {@link MIN_ELEVATION_M} to {@link MAX_ELEVATION_M}, if a planet
 * setting is not a number, or if a model constant is missing or out of
 * range.
 */
export const annualBalance = (
	world: World,
	model: TemperatureModel = TEMPERATURE_MODEL,
): Float64Array => {
	assertModel(model);
	assertSolvableWorld(world);
	return balanceOnGrid(world, model);
};

/**
 * How much of a cell's departure from its repeating cycle is still there
 * after a year, compared with what its heat gained over the year implies.
 *
 * @remarks
 * A lone cell whose departure decays as `e^(−t/τ)` keeps `ρ = e^(−x)` of
 * it after a year, where `x` is the year over `τ`; its heat gained over
 * the year implies a departure, at the balance with no heat capacity, of
 * `(1 − ρ) / x` of it. The ratio of the two, `x / (eˣ − 1)`, is near 1 for
 * a cell that hardly changes in a year, so the correction removes almost
 * all of its departure, and near 0 for one that settles within the year
 * by itself, which needs none. A cell's time to settle is taken at its
 * least heat capacity over the year: sea that freezes for part of it
 * forgets its departure then.
 *
 * @param x - The year's length over the cell's time to settle, from 0.
 */
const memory = (x: number): number => (x > 1e-9 ? x / Math.expm1(x) : 1);

/**
 * The state a step before a turn of the year, for steps of a new length,
 * keeping the rate of change the old step implies: `T − (T − T⁻) · new /
 * old`, brought within the limits of a state.
 *
 * @param temperatureK - The state at the turn of the year, kelvin.
 * @param previousK - The state one old step before it, kelvin.
 * @param fromSeconds - The old step's length, above zero.
 * @param toSeconds - The new step's length, above zero.
 * @returns A new array; a copy of `previousK` when the lengths are equal.
 */
export const stepBefore = (
	temperatureK: Float64Array,
	previousK: Float64Array,
	fromSeconds: number,
	toSeconds: number,
): Float64Array => {
	const scale = toSeconds / fromSeconds;
	if (scale === 1) {
		return Float64Array.from(previousK);
	}
	const before = new Float64Array(temperatureK.length);
	for (let cell = 0; cell < before.length; cell++) {
		const t = temperatureK[cell] as number;
		before[cell] = clampStart(t - (t - (previousK[cell] as number)) * scale);
	}
	return before;
};

/** Brings a temperature in kelvin within what a state may hold. */
const clampStart = (value: number): number =>
	Math.min(MAX_START_K, Math.max(MIN_TEMPERATURE_K, value));

/**
 * A caller's array copied into a new Float64Array by index, so that what
 * is checked and used afterwards is this module's own copy, whatever the
 * caller's array does.
 *
 * @throws RangeError unless `values` is a Float64Array or a Float32Array,
 * as `kind` says, of `count` values.
 */
const copyChecked = (
	values: unknown,
	kind: 'Float64Array' | 'Float32Array',
	count: number,
	what: string,
): Float64Array => {
	const ok =
		kind === 'Float64Array'
			? values instanceof Float64Array
			: values instanceof Float32Array;
	if (!ok || (values as Float64Array | Float32Array).length !== count) {
		throw new RangeError(`${what} must be a ${kind} of ${count} values`);
	}
	const source = values as Float64Array | Float32Array;
	const copy = new Float64Array(count);
	for (let cell = 0; cell < count; cell++) {
		copy[cell] = source[cell] as number;
	}
	return copy;
};

/** Throws unless every value is a temperature a state may hold. */
const assertStartTemperatures = (values: Float64Array, what: string): void => {
	for (let cell = 0; cell < values.length; cell++) {
		const value = values[cell] as number;
		if (!(value >= MIN_TEMPERATURE_K && value <= MAX_START_K)) {
			throw new RangeError(
				`${what} holds ${value} K at sea level at cell ${cell}; it must be from ${MIN_TEMPERATURE_K} to ${MAX_START_K} K`,
			);
		}
	}
};

/**
 * The state at the turn of the year carried on from a previous solve's end
 * state, and the state a step before it, in kelvin, the air's and the
 * sea's, with the state's reference cooling.
 *
 * @remarks
 * The arrays are copied first and only the copies are checked and used. If
 * this solve's steps are of another length, as when the model's steps a
 * month differ, the state a step before is moved so that the rate of
 * change it implies is kept, and brought within the limits of a state.
 *
 * @throws RangeError if the state is not four Float64Arrays of one
 * temperature per cell of the grid the world is solved on, each from
 * {@link MIN_TEMPERATURE_K} to {@link MAX_START_K}, and a Float64Array of
 * one finite cooling per cell, none negative, with a step length from
 * {@link MIN_STEP_SECONDS} to {@link MAX_STEP_SECONDS}.
 */
const fromState = (
	setup: Setup,
	start: TemperatureState,
): {
	readonly state: Float64Array;
	readonly before: Float64Array;
	readonly sea: Float64Array;
	readonly seaBefore: Float64Array;
	readonly reference: Float64Array;
} => {
	const { cellCount } = setup;
	if (typeof start !== 'object' || start === null) {
		throw new RangeError('A starting state must be an object');
	}
	const { stepSeconds, temperatureK } = start;
	if (
		temperatureK instanceof Float64Array &&
		temperatureK.length !== cellCount
	) {
		throw new RangeError(
			`A starting state must be on the grid of ${setup.resolution} cells per face edge, which this world is solved on, ${cellCount} values an array; its temperatureK holds ${temperatureK.length}`,
		);
	}
	const state = copyChecked(
		temperatureK,
		'Float64Array',
		cellCount,
		"A starting state's temperatureK",
	);
	const previous = copyChecked(
		start.previousK,
		'Float64Array',
		cellCount,
		"A starting state's previousK",
	);
	const sea = copyChecked(
		start.seaTemperatureK,
		'Float64Array',
		cellCount,
		"A starting state's seaTemperatureK",
	);
	const seaPrevious = copyChecked(
		start.seaPreviousK,
		'Float64Array',
		cellCount,
		"A starting state's seaPreviousK",
	);
	const reference = copyChecked(
		start.referenceCoolingK,
		'Float64Array',
		cellCount,
		"A starting state's referenceCoolingK",
	);
	assertStartTemperatures(state, "A starting state's temperatureK");
	assertStartTemperatures(previous, "A starting state's previousK");
	assertStartTemperatures(sea, "A starting state's seaTemperatureK");
	assertStartTemperatures(seaPrevious, "A starting state's seaPreviousK");
	for (let cell = 0; cell < cellCount; cell++) {
		const value = reference[cell] as number;
		if (!(value >= 0 && Number.isFinite(value))) {
			throw new RangeError(
				`A starting state's referenceCoolingK holds ${value} K at cell ${cell}; it must be finite and not negative`,
			);
		}
	}
	if (
		typeof stepSeconds !== 'number' ||
		!(stepSeconds >= MIN_STEP_SECONDS && stepSeconds <= MAX_STEP_SECONDS)
	) {
		throw new RangeError(
			`A starting state's step must last from ${MIN_STEP_SECONDS} to ${MAX_STEP_SECONDS} seconds, as some planet's can; got ${String(stepSeconds)}`,
		);
	}
	const stepNow = stepSecondsOf(setup);
	return {
		state,
		before: stepBefore(state, previous, stepSeconds, stepNow),
		sea,
		seaBefore: stepBefore(sea, seaPrevious, stepSeconds, stepNow),
		reference,
	};
};

/** The length of each step of a solve, in seconds. */
const stepSecondsOf = (setup: Setup): number =>
	setup.yearSeconds / (MONTHS_PER_YEAR * setup.model.stepsPerMonth);

/** The time stepping of one solve, holding the state it steps. */
type Stepper = {
	/** The sea-level air temperature now, in kelvin. */
	readonly state: Float64Array;
	/** The sea-level air temperature a step before now, in kelvin. */
	readonly previous: Float64Array;
	/**
	 * The sea's temperature now, in kelvin; at a land cell, its air's
	 * sea-level temperature.
	 */
	readonly sea: Float64Array;
	/** The sea's temperature a step before now, in kelvin, likewise. */
	readonly seaPrevious: Float64Array;
	/**
	 * How much of a lasting shift of its air each sea cell's sea takes on, in
	 * the latest step: its exchange with the air over that and the opening of
	 * its ice (see {@link seaStep}), 1 for a sea clear of ice, near 0 for one
	 * at the ice's edge whose own balance holds it; 0 on land.
	 */
	readonly seaFollows: Float64Array;
	/**
	 * Each cell's heat capacity in the latest step: land's, or at sea the
	 * air's and the share of the sea's it was coupled to over the step.
	 */
	readonly capacity: Float64Array;
	/**
	 * Each cell's least heat capacity over the year's steps so far: land's,
	 * or at sea the air's and the sea's, the sea's by the share of it clear
	 * of ice.
	 */
	readonly leastCapacity: Float64Array;
	/** The rise of outgoing heat with temperature, summed likewise. */
	readonly damping: Float64Array;
	/** The rise of absorbed sunlight with temperature, summed likewise. */
	readonly feedback: Float64Array;
	/**
	 * Whether every step since the year's sums were last cleared was solved
	 * to its accuracy.
	 */
	allSolved(): boolean;
	/** Clears the sums kept over a year. */
	startYear(): void;
	/**
	 * Steps through one month, adding each step's mean air temperature to
	 * `sum` and each step's mean sea temperature to `seaSum`.
	 */
	runMonth(month: number, sum: Float64Array, seaSum: Float64Array): void;
};

/** What a stepper needs to carry heat along the winds. */
type Advection = {
	readonly advector: HeatAdvector;
	readonly flows: readonly ArrayLike<number>[];
};

/**
 * The share of the sea clear of ice at a sea temperature in kelvin: 1 above
 * {@link TemperatureModel.seaIceStartC}, 0 at and below
 * {@link TemperatureModel.seaFreezingC}, and a smooth step between whose
 * slope is zero at both ends.
 */
const seaClearShare = (seaK: number, model: TemperatureModel): number => {
	const share =
		(seaK - ZERO_CELSIUS_K - model.seaFreezingC) /
		(model.seaIceStartC - model.seaFreezingC);
	if (share >= 1) {
		return 1;
	}
	if (share <= 0) {
		return 0;
	}
	return share * share * (3 - 2 * share);
};

/**
 * The rate at which {@link seaClearShare} rises with sea temperature, per
 * kelvin.
 */
const seaClearShareSlope = (seaK: number, model: TemperatureModel): number => {
	const width = model.seaIceStartC - model.seaFreezingC;
	const share = (seaK - ZERO_CELSIUS_K - model.seaFreezingC) / width;
	if (share >= 1 || share <= 0) {
		return 0;
	}
	return (6 * share * (1 - share)) / width;
};

/**
 * One implicit step of a sea cell's sea, with the exchange between it and
 * the air over it, written in terms of the air's temperature at the step's
 * end.
 *
 * @remarks
 * The sea's balance over a step of second-order backward differences is
 *
 * `C_s (3 T_s' − 4 T_s + T_s⁻) / 2Δt = S − k (T_s' − T_a') − (g − b) (T_s' − T_s)`
 *
 * for its heat capacity `C_s`, the sunlight it keeps `S` (what it absorbs
 * less what it gives up at a steady rate), the exchange `k` with the air at
 * `T_a'`, and `g`, how much faster the sea gives heat up per kelvin of its
 * own warming as its ice opens, less `b`, how much more sunlight it absorbs
 * per kelvin as the ice's brightness goes: the ice share's change over the
 * step, taken at the sea's temperature now and solved for with the rest,
 * which keeps a sea at the ice's edge from swinging between iced and open
 * from step to step. `b` is taken at no more than three quarters of the
 * sea's heat capacity over the step, so that the step stays well posed;
 * only `g` is heat given to the air. The sea has no other neighbour, so it
 * is solved for at once: `T_s' = base + gain · T_a'`. What it gives the
 * air, `k (T_s' − T_a') + g (T_s' − T_s)`, is then `(k + g) · base − g T_s
 * − (k − (k + g) gain) T_a'`: the air's mass grows by `k − (k + g) gain`,
 * which is not negative, and its right-hand side by `(k + g) · base − g
 * T_s`. The heat the air gains is exactly what the sea loses, whatever
 * `T_a'` the air's solve settles on.
 *
 * @param step - The sea's temperature now and a step before, in kelvin; the
 * sunlight it keeps, W m⁻²; the exchange `k`, the opening `g` and the
 * brightening `b`, W m⁻² K⁻¹, none negative; and its heat capacity over the
 * step's length.
 * @returns The sea's `base` in kelvin, its `gain`, from 0 to below 1, and
 * `coupling`, `k + g`.
 */
export const seaStep = (step: {
	readonly sea: number;
	readonly earlier: number;
	readonly sunlight: number;
	readonly exchange: number;
	readonly opening: number;
	readonly brightening: number;
	readonly storage: number;
}): {
	readonly base: number;
	readonly gain: number;
	readonly coupling: number;
} => {
	const { sea, earlier, sunlight, exchange, opening, storage } = step;
	const brightening = Math.min(step.brightening, 0.75 * storage);
	const coupling = exchange + opening;
	const diagonal = 1.5 * storage + coupling - brightening;
	return {
		base:
			(storage * (2 * sea - 0.5 * earlier) +
				sunlight +
				(opening - brightening) * sea) /
			diagonal,
		gain: exchange / diagonal,
		coupling,
	};
};

const createStepper = (
	setup: Setup,
	solver: ExchangeSolver,
	initial: Float64Array,
	before: Float64Array,
	initialSea: Float64Array,
	beforeSea: Float64Array,
	advection?: Advection,
): Stepper => {
	const { cellCount, areas, clearAlbedo, cooling, emission, land, model } =
		setup;
	const {
		stepsPerMonth,
		solverToleranceK,
		iceAlbedo,
		landHeatCapacity,
		oceanHeatCapacity,
		seaAirHeatCapacity,
		airSeaExchange,
	} = model;
	const freezingK = model.seaFreezingC + ZERO_CELSIUS_K;
	const stepSeconds = stepSecondsOf(setup);
	const seaStorage = oceanHeatCapacity / stepSeconds;
	const seaAirStorage = seaAirHeatCapacity / stepSeconds;
	// The year's mean sunlight each cell's sea absorbs clear of ice, W m⁻².
	const seaSunlight = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		seaSunlight[cell] =
			(1 - (clearAlbedo[cell] as number)) *
			(setup.annualSunlight[cell] as number);
	}
	const state = Float64Array.from(initial);
	const previous = Float64Array.from(before);
	const sea = Float64Array.from(initialSea);
	const seaPrevious = Float64Array.from(beforeSea);
	for (let cell = 0; cell < cellCount; cell++) {
		if (land[cell]) {
			sea[cell] = state[cell] as number;
			seaPrevious[cell] = previous[cell] as number;
		} else {
			sea[cell] = Math.max(freezingK, sea[cell] as number);
			seaPrevious[cell] = Math.max(freezingK, seaPrevious[cell] as number);
		}
	}
	const seaFollows = new Float64Array(cellCount);
	const capacity = new Float64Array(cellCount);
	const leastCapacity = new Float64Array(cellCount);
	const damping = new Float64Array(cellCount);
	const feedback = new Float64Array(cellCount);
	const mass = new Float64Array(cellCount);
	const rhs = new Float64Array(cellCount);
	const next = new Float64Array(cellCount);
	const seaNext = new Float64Array(cellCount);
	// Each sea cell's sea at the step's end as base + gain · the air's: see
	// seaStep. Reused every step.
	const seaBase = new Float64Array(cellCount);
	const seaGain = new Float64Array(cellCount);
	// The share of the air's change over the winds' step that the sea takes
	// with it, and the air before that step.
	const seaShare = new Float64Array(cellCount);
	const airBefore = new Float64Array(advection === undefined ? 0 : cellCount);
	const table = new Float64Array(SUNLIGHT_ROWS);
	const light = new Float64Array(cellCount);
	const stepFlows = new Float64Array(
		advection === undefined ? 0 : NEIGHBOUR_COUNT * cellCount,
	);

	let solved = true;

	const startYear = (): void => {
		solved = true;
		leastCapacity.fill(Number.POSITIVE_INFINITY);
		damping.fill(0);
		feedback.fill(0);
	};

	const runMonth = (
		month: number,
		sum: Float64Array,
		seaSum: Float64Array,
	): void => {
		sum.fill(0);
		seaSum.fill(0);
		for (let step = 0; step < stepsPerMonth; step++) {
			sunlightAt(
				setup,
				(month * stepsPerMonth + step + 1) / (MONTHS_PER_YEAR * stepsPerMonth),
				table,
				light,
			);
			for (let cell = 0; cell < cellCount; cell++) {
				const t = state[cell] as number;
				const earlier = previous[cell] as number;
				// The temperature the step is expected to end at, carrying
				// the last step's change on: the first guess for the solve,
				// where reflectivity and heat capacity are read and about
				// which outgoing heat is linearised, so that each of them is
				// as accurate as the second-order stepping.
				const ahead = Math.max(MIN_TEMPERATURE_K, 2 * t - earlier);
				const radiation = emission * ahead * ahead * ahead;
				const cellArea = areas[cell] as number;
				const sunlight = light[cell] as number;
				const clearValue = clearAlbedo[cell] as number;
				damping[cell] = (damping[cell] as number) + 4 * radiation;
				next[cell] = ahead;
				if (land[cell]) {
					const air = airTemperature(ahead, cooling[cell] as number);
					const clear = clearShare(air, model);
					const albedo = iceAlbedo + (clearValue - iceAlbedo) * clear;
					capacity[cell] = landHeatCapacity;
					leastCapacity[cell] = Math.min(
						leastCapacity[cell] as number,
						landHeatCapacity,
					);
					const storage = landHeatCapacity / stepSeconds;
					// Second-order backward differences:
					// (3 T' − 4 T + T⁻) / 2Δt for the rate of change.
					mass[cell] = cellArea * (1.5 * storage + 4 * radiation);
					rhs[cell] =
						cellArea *
						(storage * (2 * t - 0.5 * earlier) +
							(1 - albedo) * sunlight +
							3 * radiation * ahead);
					// How much more sunlight the cell absorbs per kelvin of
					// warming as its snow and ice retreat.
					feedback[cell] =
						(feedback[cell] as number) +
						(iceAlbedo - clearValue) * clearShareSlope(air, model) * sunlight;
					continue;
				}
				// At sea the air radiates and spreads heat, and the sea below
				// it takes the sunlight and passes heat to the air as their
				// difference drives it, cut by the share of it iced over, which
				// follows the sea's own temperature.
				const seaNow = sea[cell] as number;
				const seaEarlier = seaPrevious[cell] as number;
				// The sea's ice share is read at the sea's temperature now, not
				// where the step is expected to end as the air's is: the sea
				// moves slowly, and read ahead, a sea nearing freezing in steps
				// of a month swings between iced and open from one year to the
				// next (the Earth and a generated world at one step a month did
				// not settle in 60 years; read now, they settle in 6).
				const clear = seaClearShare(seaNow, model);
				const albedo = iceAlbedo + (clearValue - iceAlbedo) * clear;
				const exchange = airSeaExchange * clear;
				// The sunlight the sea absorbs over the year, clear of ice, it
				// gives up to the air at a steady rate as evaporation and
				// long-wave radiation, whatever their difference: so it is the
				// sunlight's swing through the year that the sea stores, and
				// the sea and the air come to the same temperature where
				// nothing else moves heat. Ice cuts this as it cuts the
				// exchange.
				const meanSunlight = seaSunlight[cell] as number;
				const throughput = clear * meanSunlight;
				// What the sea gives up rises as its ice opens with its warming:
				// solved for with the rest, where it speeds the sea's loss, about
				// the air the step is expected to end at. Taken as it is, a sea at
				// the ice's edge under very cold air swings between iced and open
				// from step to step, and a frozen Earth did not settle in 60
				// years; solved for, it settles in 3.
				const opening = Math.max(
					0,
					seaClearShareSlope(seaNow, model) *
						(meanSunlight + airSeaExchange * (seaNow - ahead)),
				);
				const { base, gain, coupling } = seaStep({
					sea: seaNow,
					earlier: seaEarlier,
					sunlight: (1 - albedo) * sunlight - throughput,
					exchange,
					opening,
					brightening:
						(iceAlbedo - clearValue) *
						seaClearShareSlope(seaNow, model) *
						sunlight,
					storage: seaStorage,
				});
				seaBase[cell] = base;
				seaGain[cell] = gain;
				seaFollows[cell] = coupling > 0 ? exchange / coupling : 0;
				// Over a step of the winds, a backward-difference step, the sea
				// follows this share of the air's change.
				const share =
					(exchange * stepSeconds) /
					(oceanHeatCapacity + coupling * stepSeconds);
				seaShare[cell] = share;
				capacity[cell] = seaAirHeatCapacity + share * oceanHeatCapacity;
				leastCapacity[cell] = Math.min(
					leastCapacity[cell] as number,
					seaAirHeatCapacity + clear * oceanHeatCapacity,
				);
				mass[cell] =
					cellArea *
					(1.5 * seaAirStorage + 4 * radiation + exchange - coupling * gain);
				rhs[cell] =
					cellArea *
					(seaAirStorage * (2 * t - 0.5 * earlier) +
						3 * radiation * ahead +
						throughput -
						opening * seaNow +
						coupling * base);
				feedback[cell] =
					(feedback[cell] as number) +
					(iceAlbedo - clearValue) *
						seaClearShareSlope(seaNow, model) *
						sunlight;
			}
			solver.setMass(mass);
			if (!solver.solve(rhs, next, solverToleranceK).converged) {
				solved = false;
			}
			for (let cell = 0; cell < cellCount; cell++) {
				if (!land[cell]) {
					seaNext[cell] =
						(seaBase[cell] as number) +
						(seaGain[cell] as number) * (next[cell] as number);
				}
			}
			if (advection !== undefined) {
				// The heat the winds carry, after the exchange: an operator
				// split, with the flows of the time the step ends at.
				for (let cell = 0; cell < cellCount; cell++) {
					next[cell] = Math.max(MIN_TEMPERATURE_K, next[cell] as number);
				}
				airBefore.set(next);
				advection.advector.setFlows(
					interpolateFlows(
						advection.flows,
						(month * stepsPerMonth + step + 1) /
							(MONTHS_PER_YEAR * stepsPerMonth),
						stepFlows,
					),
				);
				if (
					!advection.advector.advect(
						next,
						capacity,
						stepSeconds,
						solverToleranceK,
					).converged
				) {
					solved = false;
				}
				// The heat the winds bring a sea cell is shared between its air
				// and its sea as the exchange shares it over the step, which is
				// what the capacity the winds' step was given holds.
				for (let cell = 0; cell < cellCount; cell++) {
					if (!land[cell]) {
						seaNext[cell] =
							(seaNext[cell] as number) +
							(seaShare[cell] as number) *
								((next[cell] as number) - (airBefore[cell] as number));
					}
				}
			}
			for (let cell = 0; cell < cellCount; cell++) {
				const t = state[cell] as number;
				const value = Math.max(MIN_TEMPERATURE_K, next[cell] as number);
				sum[cell] = (sum[cell] as number) + 0.5 * (t + value);
				previous[cell] = t;
				state[cell] = value;
				if (land[cell]) {
					seaPrevious[cell] = t;
					sea[cell] = value;
				} else {
					const seaNow = sea[cell] as number;
					// The sea does not cool below freezing: the ice that would
					// form keeps it there.
					const seaValue = Math.max(freezingK, seaNext[cell] as number);
					seaSum[cell] = (seaSum[cell] as number) + 0.5 * (seaNow + seaValue);
					seaPrevious[cell] = seaNow;
					sea[cell] = seaValue;
				}
			}
		}
	};

	return {
		state,
		previous,
		sea,
		seaPrevious,
		seaFollows,
		capacity,
		leastCapacity,
		damping,
		feedback,
		allSolved: () => solved,
		startYear,
		runMonth,
	};
};

/**
 * The correction for the heat each cell gained or lost over the year,
 * into `correction`, in kelvin: zero exactly when the year ended where it
 * began.
 *
 * @remarks
 * The heat gained per second is the change of temperature over the year
 * at the latest heat capacity, over the year's length, scaled by
 * {@link memory}; at sea, the air's change at its own heat capacity and
 * the sea's at the sea's, times the share of the correction the sea keeps
 * (see {@link Stepper.seaFollows}). The correction is applied to the air,
 * and to the sea by that share, so a sea that keeps none of it (with no
 * exchange with the air, or held at its own balance by ice) does not turn
 * its own drift into a shift of the air. The correction is the shift that
 * heat implies at the balance with no heat capacity: the outgoing heat's
 * rise with temperature, less the rise of absorbed sunlight as ice
 * retreats (kept to at least {@link MIN_DAMPING_SHARE} of the former, so
 * that the correction stays bounded where the two nearly cancel), with the
 * exchange between cells.
 *
 * Outgoing heat goes as T⁴, so its rise taken at the year's temperatures
 * badly understates it for a large warming, and a correction worked out
 * from it would overshoot, to thousands of kelvin after a big change of
 * planet. So the rise is taken over the whole shift instead, as the slope
 * of the chord of `ε σ T⁴` from the cell's temperature `a` (the one whose
 * rise is the year's mean) to `a` plus the shift, and the correction is
 * solved again with it, {@link CORRECTION_PASSES} times in all. For a small
 * shift the chord is the tangent and nothing changes, so a first pass whose
 * largest correction is under {@link TemperatureModel.correctionRefineK}
 * is kept and the later passes are not solved.
 *
 * @returns Whether every solve came within the solver's tolerance.
 */
const correctYearEnd = (
	setup: Setup,
	solver: ExchangeSolver,
	stepper: Stepper,
	yearStart: Float64Array,
	yearSeaStart: Float64Array,
	correction: Float64Array,
	mass: Float64Array,
	rhs: Float64Array,
): boolean => {
	const { cellCount, areas, emission, yearSeconds, model } = setup;
	const { state, sea } = stepper;
	const steps = MONTHS_PER_YEAR * model.stepsPerMonth;
	correction.fill(0);
	let solved = true;
	for (let pass = 0; pass < CORRECTION_PASSES; pass++) {
		for (let cell = 0; cell < cellCount; cell++) {
			const cellArea = areas[cell] as number;
			const tangent = (stepper.damping[cell] as number) / steps;
			const a = Math.cbrt(tangent / (4 * emission));
			const b = Math.max(MIN_TEMPERATURE_K, a + (correction[cell] as number));
			const radiationDamping = emission * (a * a + b * b) * (a + b);
			const meanDamping = Math.max(
				radiationDamping - (stepper.feedback[cell] as number) / steps,
				MIN_DAMPING_SHARE * radiationDamping,
			);
			mass[cell] = cellArea * meanDamping;
			const airChange = (state[cell] as number) - (yearStart[cell] as number);
			const gained = setup.land[cell]
				? cellArea * (stepper.capacity[cell] as number) * airChange
				: cellArea *
					(model.seaAirHeatCapacity * airChange +
						model.oceanHeatCapacity *
							(stepper.seaFollows[cell] as number) *
							((sea[cell] as number) - (yearSeaStart[cell] as number)));
			rhs[cell] =
				(gained *
					memory(
						(meanDamping * yearSeconds) /
							(stepper.leastCapacity[cell] as number),
					)) /
				yearSeconds;
		}
		solver.setMass(mass);
		if (!solver.solve(rhs, correction, model.solverToleranceK).converged) {
			solved = false;
		}
		if (pass === 0 && largestMagnitude(correction) < model.correctionRefineK) {
			break;
		}
	}
	return solved;
};

/** The largest absolute value in an array. */
const largestMagnitude = (values: Float64Array): number => {
	let largest = 0;
	for (let cell = 0; cell < values.length; cell++) {
		largest = Math.max(largest, Math.abs(values[cell] as number));
	}
	return largest;
};

/**
 * The most of the year before's change that a year's change may be for the
 * two to give a guess at the years left, as a ratio of the two: a change
 * that is a larger share of the one before says too little about how fast
 * the solve is settling.
 *
 * Its value and where it comes from are the `slowestShrinkTrusted` entry of
 * {@link TEMPERATURE_CONFIG}.
 */
const SLOWEST_SHRINK_TRUSTED: number = FIXED_CHOICES.slowestShrinkTrusted;

/**
 * A guess at how many more years a solve that has not finished will run,
 * from how much its change shrank over the last year.
 *
 * @remarks
 * It assumes the change goes on shrinking by the same factor every year,
 * which is roughly how the slow warming or cooling of the ocean dies away,
 * and counts the years until the change would be below the tolerance. It is
 * a guess and no more: the factor itself changes from year to year, and in
 * the first year or two after a start far from the answer it is a poor
 * guide. Where the change did not shrink there is no basis for one at all,
 * and where it shrank by too little (see {@link SLOWEST_SHRINK_TRUSTED})
 * there is none worth giving: a year that barely moved the change, as the
 * second or third of a solve sometimes does before the next settles it,
 * would otherwise be read as dozens of years still to run.
 *
 * A year whose change is already below the tolerance but that did not end
 * the solve, because some of its steps were not solved to their accuracy,
 * counts as needing one more: the answer is then 1, whatever the year
 * before was, and in the first year too. This is looked at before anything
 * else, so only a change at or above the tolerance can give null.
 *
 * @param previousChangeK - The change of the year before, in kelvin, or
 * null in the first year.
 * @param changeK - The change of the year just finished, in kelvin.
 * @param toleranceK - The change below which the solve stops, in kelvin.
 * @param yearsLeftUnderCap - How many more years the cap allows, from 1.
 * @returns 1 when the change of the year just finished is below the
 * tolerance, in the first year or any other. Otherwise a whole number of
 * years from 1 to `yearsLeftUnderCap`, or null in the first year, or when
 * the change shrank by too little or not at all, or either change is not a
 * finite number.
 */
export const estimateYearsLeft = (
	previousChangeK: number | null,
	changeK: number,
	toleranceK: number,
	yearsLeftUnderCap: number,
): number | null => {
	if (changeK < toleranceK) {
		return Math.min(1, yearsLeftUnderCap);
	}
	if (
		previousChangeK === null ||
		!Number.isFinite(previousChangeK) ||
		!Number.isFinite(changeK) ||
		!(changeK <= SLOWEST_SHRINK_TRUSTED * previousChangeK)
	) {
		return null;
	}
	// The fewest further years n with changeK · factorⁿ below the tolerance.
	// Both logarithms are of numbers from 0 to 1, so their ratio is not
	// negative and n is at least 1.
	const factor = changeK / previousChangeK;
	const years =
		Math.floor(Math.log(toleranceK / changeK) / Math.log(factor)) + 1;
	return Math.min(years, yearsLeftUnderCap);
};

/**
 * Throws unless the winds are twelve flows of four values for each of the
 * `cellCount` cells of the grid solved on, all finite.
 */
const assertWinds = (winds: TemperatureWinds, cellCount: number): void => {
	const { flows } = winds;
	if (!Array.isArray(flows) || flows.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`The winds must be ${MONTHS_PER_YEAR} monthly flows; got ${Array.isArray(flows) ? flows.length : typeof flows}`,
		);
	}
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const field = flows[month] as ArrayLike<number>;
		if (field?.length !== NEIGHBOUR_COUNT * cellCount) {
			throw new RangeError(
				`The winds' flows for month ${month + 1} must hold ${NEIGHBOUR_COUNT * cellCount} values, four for each cell of the grid solved on; got ${field?.length}`,
			);
		}
		for (let entry = 0; entry < field.length; entry++) {
			if (!Number.isFinite(field[entry])) {
				throw new RangeError(
					`Every flow of the winds must be finite; month ${month + 1} entry ${entry} is ${field[entry]}`,
				);
			}
		}
	}
};

const assertOptions = (maxYears: number, tolerance: number): void => {
	if (
		!(
			Number.isInteger(maxYears) &&
			maxYears >= 1 &&
			maxYears <= MAX_YEARS_LIMIT
		)
	) {
		throw new RangeError(
			`The most years must be a whole number from 1 to ${MAX_YEARS_LIMIT}; got ${maxYears}`,
		);
	}
	if (!(tolerance > 0 && Number.isFinite(tolerance))) {
		throw new RangeError(
			`A tolerance must be a finite number of kelvin above zero; got ${tolerance}`,
		);
	}
};

/**
 * The sea level and planet a solve of a world is for, in the forms the
 * solver uses them: the sea level as the single-precision number nearest
 * it, as elevations are stored, and the planet's settings that the
 * temperature reads, {@link TEMPERATURE_SETTINGS}, as
 * {@link normalisePlanet} gives them. A result's
 * {@link TemperatureResult.solvedFor} is this for the world it was solved
 * for.
 *
 * @param world - The world. It is not changed.
 * @returns A new object.
 * @throws RangeError if a planet setting is not a number, NaN included.
 */
export const temperatureConditions = (world: World): TemperatureConditions => ({
	seaLevel: Math.fround(world.seaLevel),
	planet: temperaturePlanet(normalisePlanet(world.planet)),
});

/**
 * Each cell's lapse-rate cooling in a world, in kelvin: how much colder its
 * air is than air at sea level, the lapse rate times the cell's height
 * above the sea level on land, and 0 at sea.
 *
 * @remarks
 * It is the cooling the solver applies to the world's air. For the world
 * a solve is worked out on, which is {@link coarsenWorld} of the world above
 * 64 cells per face edge, it is what a state's
 * {@link TemperatureState.referenceCoolingK} holds for the solve from
 * nothing the state descends from.
 *
 * @param world - The world. It is not changed.
 * @param model - The model, whose lapse rate is used; defaults to
 * {@link TEMPERATURE_MODEL}.
 * @returns A new array, one value per cell in cell order.
 * @throws RangeError if the world's resolution is not supported, if its
 * elevations are not one finite value per cell, if its sea level does not
 * lie from {@link MIN_ELEVATION_M} to {@link MAX_ELEVATION_M}, or if a model
 * constant is missing or out of range.
 */
export const lapseCooling = (
	world: World,
	model: TemperatureModel = TEMPERATURE_MODEL,
): Float64Array => {
	assertModel(model);
	assertSolvableWorld(world);
	const cooling = new Float64Array(getGrid(world.resolution).cellCount);
	coolingInto(world, model.lapseRate, cooling);
	return cooling;
};

/**
 * How far a world's terrain has drifted from a reference, in kelvin: the
 * area-weighted mean over the globe of the absolute difference between
 * each cell's lapse-rate cooling in the world, as {@link lapseCooling}
 * gives it, and in the reference.
 *
 * @remarks
 * Measured for the world a solve is worked out on, which is
 * {@link coarsenWorld} of the world above 64 cells per face edge, it is the
 * measure {@link solveTemperature} compares with
 * {@link TemperatureModel.terrainDriftLimitK}, and gives the same value,
 * bit for bit. A cell at sea has no cooling, so sea floor moved beneath
 * the sea counts for nothing, and land lowered beneath it counts its whole
 * former cooling. Every land cell raised by `h` metres, with no new land,
 * drifts by the lapse rate times `h` times the share of the globe's area
 * that is land. It is symmetric: two worlds, each measured against the
 * other's cooling, give the same value.
 *
 * @param world - The world. It is not changed.
 * @param referenceK - Each cell's cooling in the reference, in kelvin, as
 * a state's {@link TemperatureState.referenceCoolingK} or
 * {@link lapseCooling} gives it. It is not changed.
 * @param model - The model, whose lapse rate is used; defaults to
 * {@link TEMPERATURE_MODEL}.
 * @returns The drift, in kelvin, from 0.
 * @throws RangeError as {@link lapseCooling} does, or if `referenceK` is
 * not a Float64Array of one value per cell.
 */
export const coolingDrift = (
	world: World,
	referenceK: Float64Array,
	model: TemperatureModel = TEMPERATURE_MODEL,
): number => {
	const cooling = lapseCooling(world, model);
	if (
		!(referenceK instanceof Float64Array) ||
		referenceK.length !== cooling.length
	) {
		throw new RangeError(
			`A reference cooling must be a Float64Array of ${cooling.length} values`,
		);
	}
	return distanceFrom(getGrid(world.resolution).areas, cooling, referenceK);
};

/**
 * Throws unless a start's record is an object of a finite sea level and a
 * planet whose settings the temperature reads, {@link TEMPERATURE_SETTINGS},
 * are each a finite number. Anything else it holds, such as a day length,
 * is not read.
 */
const assertConditions = (value: unknown): void => {
	if (typeof value !== 'object' || value === null) {
		throw new RangeError(
			'A start must record, as solvedFor, the sea level and planet it was solved for',
		);
	}
	const { seaLevel, planet } = value as Record<string, unknown>;
	if (typeof seaLevel !== 'number' || !Number.isFinite(seaLevel)) {
		throw new RangeError(
			`A start's recorded sea level must be a finite number; got ${String(seaLevel)}`,
		);
	}
	if (typeof planet !== 'object' || planet === null) {
		throw new RangeError("A start's record must hold the planet's settings");
	}
	for (const name of TEMPERATURE_SETTINGS) {
		const setting: unknown = (planet as Record<string, unknown>)[name];
		if (typeof setting !== 'number' || !Number.isFinite(setting)) {
			throw new RangeError(
				`A start's recorded ${name} must be a finite number; got ${String(setting)}`,
			);
		}
	}
};

/**
 * Whether a record, already checked, names the given sea level and planet,
 * both brought to the forms the solver uses and compared exactly. Only the
 * settings the temperature reads, {@link TEMPERATURE_SETTINGS}, are
 * compared, each brought within its limits by {@link clampSetting}, so a
 * record of another day length, or of none, names the same planet.
 */
const recordNames = (
	seaLevel: number,
	planet: TemperaturePlanet,
	conditions: TemperatureConditions,
): boolean => {
	if (Math.fround(conditions.seaLevel) !== seaLevel) {
		return false;
	}
	// Setting by setting rather than through normalisePlanet, which refuses
	// settings without a day length, as a record's may be.
	return TEMPERATURE_SETTINGS.every(
		(name) => clampSetting(name, conditions.planet[name]) === planet[name],
	);
};

/** {@link recordNames} for the world being solved. */
const sameConditions = (
	setup: Setup,
	conditions: TemperatureConditions,
): boolean => recordNames(setup.seaLevel, setup.planet, conditions);

/**
 * Whether a record of the conditions a result was solved for names a
 * world's sea level and planet, as {@link solveTemperature} judges a start
 * by its record: each brought to the forms the solver uses and compared
 * exactly, only the settings the temperature reads compared, the day length
 * not among them.
 *
 * @param world - The world. It is not changed.
 * @param conditions - The record, such as {@link TemperatureResult.solvedFor}.
 * @throws RangeError if the record does not hold a finite sea level and a
 * finite number for each of the planet's {@link TEMPERATURE_SETTINGS}, or
 * the world's planet has a setting that is not a number.
 */
export const conditionsMatch = (
	world: World,
	conditions: TemperatureConditions,
): boolean => {
	assertConditions(conditions);
	const wanted = temperatureConditions(world);
	return recordNames(wanted.seaLevel, wanted.planet, conditions);
};

/**
 * Reads and checks a solve's start, and sets it aside if it does not suit
 * the world: see {@link solveTemperature} for the order of the tests.
 *
 * @returns The state to carry on from, or nothing for a solve from nothing.
 * @throws RangeError if the start is not an object holding a state and a
 * valid record, or if a state that is read is not valid.
 */
const readStart = (
	setup: Setup,
	start: TemperatureStart | undefined,
): ReturnType<typeof fromState> | undefined => {
	if (start === undefined) {
		return undefined;
	}
	if (typeof start !== 'object' || start === null) {
		throw new RangeError('A start must be an object with a state');
	}
	const { state, solvedFor } = start;
	if (state === undefined) {
		throw new RangeError('A start must hold a state');
	}
	assertConditions(solvedFor);
	if (!sameConditions(setup, solvedFor)) {
		return undefined;
	}
	const carried = fromState(setup, state);
	const drift = distanceFrom(setup.areas, setup.cooling, carried.reference);
	return drift < setup.model.terrainDriftLimitK ? carried : undefined;
};

/**
 * The cells along a face edge of the grid a world's temperature is worked
 * out on: a step coarser than the world's own above 64 cells per face edge,
 * so 64 for a world of 128 and 128 for one of 256, and the world's own at
 * 64.
 *
 * @remarks
 * A solve costs four to five times as much on each finer grid (the Earth
 * from nothing, in Node: 0.88 s on the 64 grid, 3.5 s on the 128 grid,
 * 16.7 s on the 256 grid), and the coarser grid's answer, carried back to
 * the world's grid with each cell cooled by its own height, lies close to
 * the full one: measured on the Earth, 0.10 K root-mean-square,
 * area-weighted over all cells and months, and 1.36 K in the worst cell
 * and month at 128; 0.065 K and 0.92 K at 256, the worst cells at coasts.
 * See {@link solveTemperature}.
 *
 * @param resolution - The world's cells along a face edge; one of
 * {@link SUPPORTED_RESOLUTIONS}.
 * @throws RangeError if the resolution is not supported.
 */
export const solveResolution = (resolution: number): Resolution => {
	if (!isSupportedResolution(resolution)) {
		throw new RangeError(
			`Unsupported world resolution ${resolution}: expected one of ${SUPPORTED_RESOLUTIONS.join(', ')}`,
		);
	}
	const index = SUPPORTED_RESOLUTIONS.indexOf(resolution);
	return SUPPORTED_RESOLUTIONS[Math.max(0, index - 1)] as Resolution;
};

/**
 * Twelve monthly fields of sea-level temperature carried onto a world's grid
 * from the grid a step coarser, and each cell's air cooled by its own
 * height: the near-surface air temperature, in degrees Celsius.
 *
 * @remarks
 * The sea-level temperature is carried by {@link refineField}, bilinear in
 * each face's coordinates and, beside a cube edge, linear along it on
 * either side and across it, without regard to land and sea, so that the
 * coarse grid's contrast between a coast's land and sea is spread over
 * about one coarse cell either side of it. Each cell is then cooled by the
 * lapse rate for its own height above the sea level, limited to half its
 * sea-level temperature, as on the grid solved on: a peak narrower than a
 * coarse cell keeps its own cold. This is how
 * {@link solveTemperature} makes a coarser solve's months.
 *
 * @param seaLevelK - Twelve fields, January to December, of the monthly
 * mean sea-level temperature in kelvin, one value per cell of the grid a
 * step coarser than the world's. They are not changed.
 * @param world - The world the months are for, of more than 64 cells per
 * face edge. It is not changed.
 * @param model - The model, whose lapse rate is used; defaults to
 * {@link TEMPERATURE_MODEL}.
 * @returns Twelve new fields, one value per cell of the world's grid.
 * @throws RangeError if there are not twelve fields of one value per cell
 * of the coarser grid, if the world is not valid or is of 64 cells per face
 * edge, which has no coarser grid, or if a model constant is missing or out
 * of range.
 */
export const refineMonths = (
	seaLevelK: readonly ArrayLike<number>[],
	world: World,
	model: TemperatureModel = TEMPERATURE_MODEL,
): Float32Array[] => {
	const cooling = lapseCooling(world, model);
	if (!Array.isArray(seaLevelK) || seaLevelK.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`A year has ${MONTHS_PER_YEAR} months to refine; got ${Array.isArray(seaLevelK) ? seaLevelK.length : typeof seaLevelK}`,
		);
	}
	return refineInto(seaLevelK, world.resolution, cooling);
};

/** {@link refineMonths} for arguments already checked. */
const refineInto = (
	seaLevelK: readonly ArrayLike<number>[],
	resolution: Resolution,
	cooling: Float64Array,
): Float32Array[] => {
	const fine = new Float64Array(cooling.length);
	return seaLevelK.map((month) => {
		refineField(month, resolution, fine);
		const field = new Float32Array(cooling.length);
		for (let cell = 0; cell < field.length; cell++) {
			field[cell] =
				airTemperature(fine[cell] as number, cooling[cell] as number) -
				ZERO_CELSIUS_K;
		}
		return field;
	});
};

/**
 * The sea's monthly temperatures in degrees Celsius on a world's own grid,
 * NaN over its land, from those of the grid it was solved on.
 *
 * @remarks
 * A world solved on a coarser grid has its sea carried to its own grid by
 * {@link refineField}, which reads the coarse cells around each fine one.
 * A fine sea cell may lie beside, or under, a coarse cell that is land, which
 * has no sea: such a coarse cell stands in with the mean of its neighbours'
 * seas, or where none is sea, with its air's sea-level temperature, kept
 * from below freezing.
 *
 * @param seaK - Twelve fields of the sea's monthly mean temperature in
 * kelvin on the grid solved on, a land cell holding its air's sea-level
 * temperature. Not changed.
 * @param world - The world.
 * @param setup - The solve's setup: of the world itself, or of the coarser
 * world it was solved as, whose fields are then carried to the world's grid.
 */
const seaMonthsOf = (
	seaK: readonly Float64Array[],
	world: World,
	setup: Setup,
): Float32Array[] => {
	const level = Math.fround(world.seaLevel);
	const count = world.elevation.length;
	const onOwnGrid = setup.cellCount === count;
	const freezingK = setup.model.seaFreezingC + ZERO_CELSIUS_K;
	const { neighbours } = getGrid(setup.resolution);
	const filled = new Float64Array(onOwnGrid ? 0 : setup.cellCount);
	const fine = new Float64Array(onOwnGrid ? 0 : count);
	return seaK.map((month) => {
		let values: ArrayLike<number> = month;
		if (!onOwnGrid) {
			for (let cell = 0; cell < setup.cellCount; cell++) {
				if (!setup.land[cell]) {
					filled[cell] = month[cell] as number;
					continue;
				}
				let total = 0;
				let seas = 0;
				for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
					const next = neighbours[NEIGHBOUR_COUNT * cell + side] as number;
					if (!setup.land[next]) {
						total += month[next] as number;
						seas++;
					}
				}
				filled[cell] =
					seas > 0 ? total / seas : Math.max(freezingK, month[cell] as number);
			}
			values = refineField(filled, world.resolution, fine);
		}
		const field = new Float32Array(count);
		for (let cell = 0; cell < count; cell++) {
			field[cell] =
				(world.elevation[cell] as number) - level > 0
					? Number.NaN
					: (values[cell] as number) - ZERO_CELSIUS_K;
		}
		return field;
	});
};

/** A year solved on one grid, before its months are made air temperatures. */
type GridSolve = Omit<
	TemperatureResult,
	'months' | 'seaMonths' | 'solvedFor'
> & {
	/** The monthly mean sea-level temperature, in kelvin, per cell. */
	readonly seaLevelMonths: Float64Array[];
	/**
	 * The monthly mean sea temperature, in kelvin, per cell; at a land cell,
	 * its air's sea-level temperature.
	 */
	readonly seaKMonths: Float64Array[];
	readonly setup: Setup;
};

/**
 * The solve of a world on its own grid, its months left as sea-level
 * temperatures: everything of {@link solveTemperature} but making them air
 * temperatures on the world's grid.
 */
const solveOnGrid = (
	world: World,
	start: TemperatureStart | undefined,
	maxYears: number,
	tolerance: number,
	model: TemperatureModel,
	onYear: SolveTemperatureOptions['onYear'],
	winds: TemperatureWinds | undefined,
): GridSolve => {
	const setup = setUp(world, model);
	const { cellCount, cooling } = setup;
	const { stepsPerMonth } = model;
	const grid = getGrid(world.resolution);
	// The start is read, checked and judged before anything costly is built.
	const carried = readStart(setup, start);

	const solver = createExchangeSolver(
		grid,
		coupling(setup, grid),
		model.solverMaxIterations,
	);
	const advection: Advection | undefined =
		winds !== undefined && model.windHeatCapacity > 0
			? {
					advector: createHeatAdvector(grid, model.windHeatCapacity),
					flows: winds.flows,
				}
			: undefined;
	let stepper: Stepper;
	let reference: Float64Array;
	if (carried !== undefined) {
		stepper = createStepper(
			setup,
			solver,
			carried.state,
			carried.before,
			carried.sea,
			carried.seaBefore,
			advection,
		);
		reference = carried.reference;
	} else {
		// Above the coarsest grid the balance is worked out a grid coarser:
		// see solveTemperature.
		const guess =
			world.resolution === SUPPORTED_RESOLUTIONS[0]
				? startGuess(setup, solver)
				: refineField(
						balanceOnGrid(coarsenWorld(world), model),
						world.resolution,
					);
		// The sea starts at its air's temperature, the balance having none
		// of its own; the stepper keeps it from below freezing.
		stepper = createStepper(
			setup,
			solver,
			guess,
			guess,
			guess,
			guess,
			advection,
		);
		reference = Float64Array.from(cooling);
	}
	const { state, previous, sea, seaPrevious } = stepper;
	const { land } = setup;
	const freezingK = model.seaFreezingC + ZERO_CELSIUS_K;

	const monthSums = Array.from(
		{ length: MONTHS_PER_YEAR },
		() => new Float64Array(cellCount),
	);
	const seaSums = Array.from(
		{ length: MONTHS_PER_YEAR },
		() => new Float64Array(cellCount),
	);
	const yearStart = new Float64Array(cellCount);
	const yearSeaStart = new Float64Array(cellCount);
	const correction = new Float64Array(cellCount);
	const mass = new Float64Array(cellCount);
	const rhs = new Float64Array(cellCount);

	let yearsRun = 0;
	let converged = false;
	let finalChangeK = Number.POSITIVE_INFINITY;
	while (yearsRun < maxYears && !converged) {
		yearStart.set(state);
		yearSeaStart.set(sea);
		stepper.startYear();
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			stepper.runMonth(
				month,
				monthSums[month] as Float64Array,
				seaSums[month] as Float64Array,
			);
		}
		yearsRun++;

		let drift = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			drift = Math.max(
				drift,
				Math.abs((state[cell] as number) - (yearStart[cell] as number)),
			);
			if (!land[cell]) {
				drift = Math.max(
					drift,
					Math.abs((sea[cell] as number) - (yearSeaStart[cell] as number)),
				);
			}
		}
		const correctionSolved = correctYearEnd(
			setup,
			solver,
			stepper,
			yearStart,
			yearSeaStart,
			correction,
			mass,
			rhs,
		);
		let largestShift = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const shift = correction[cell] as number;
			largestShift = Math.max(largestShift, Math.abs(shift));
			const value = Math.max(
				MIN_TEMPERATURE_K,
				(state[cell] as number) + shift,
			);
			previous[cell] =
				(previous[cell] as number) + (value - (state[cell] as number));
			state[cell] = value;
			if (land[cell]) {
				sea[cell] = value;
				seaPrevious[cell] = previous[cell] as number;
			} else {
				// The sea takes on the share of the shift that it keeps: all of
				// it clear of ice, little at the ice's edge, where its own
				// balance holds it.
				const seaValue = Math.max(
					freezingK,
					(sea[cell] as number) + shift * (stepper.seaFollows[cell] as number),
				);
				seaPrevious[cell] =
					(seaPrevious[cell] as number) + (seaValue - (sea[cell] as number));
				sea[cell] = seaValue;
			}
		}
		const previousChangeK = yearsRun === 1 ? null : finalChangeK;
		finalChangeK = Math.max(drift, largestShift);
		converged =
			finalChangeK < tolerance && stepper.allSolved() && correctionSolved;
		onYear?.({
			yearsDone: yearsRun,
			maxYears,
			changeK: finalChangeK,
			toleranceK: tolerance,
			estimatedYearsLeft:
				converged || yearsRun === maxYears
					? 0
					: estimateYearsLeft(
							previousChangeK,
							finalChangeK,
							tolerance,
							maxYears - yearsRun,
						),
		});
	}

	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const sum = monthSums[month] as Float64Array;
		const seaSum = seaSums[month] as Float64Array;
		for (let cell = 0; cell < cellCount; cell++) {
			sum[cell] = (sum[cell] as number) / stepsPerMonth;
			seaSum[cell] = land[cell]
				? (sum[cell] as number)
				: (seaSum[cell] as number) / stepsPerMonth;
		}
	}
	return {
		seaLevelMonths: monthSums,
		seaKMonths: seaSums,
		setup,
		state: {
			temperatureK: state.map(clampStart),
			previousK: previous.map(clampStart),
			seaTemperatureK: sea.map(clampStart),
			seaPreviousK: seaPrevious.map(clampStart),
			stepSeconds: stepSecondsOf(setup),
			referenceCoolingK: reference,
		},
		yearsRun,
		converged,
		finalChangeK,
	};
};

/**
 * The near-surface air temperature of a world through its year: twelve
 * monthly means.
 *
 * @remarks
 * A pure function of the world and the options: the same input gives the
 * same output, bit for bit. The world's planet is passed through
 * {@link normalisePlanet} first, so a setting beyond its limits is brought
 * to the limit and one that is not a number is refused.
 *
 * A world of 64 cells per face edge is solved on its own grid. A world of
 * more than 64 cells per face edge is solved on the grid a step coarser,
 * {@link solveResolution} of its own: the world is averaged onto that grid
 * by {@link coarsenWorld}, where a coarse cell is land by the mean
 * elevation of the four cells it covers, and solved there as a world of
 * its own; its monthly mean sea-level
 * temperatures are then carried back to the world's grid and each cell
 * cooled by its own height, by {@link refineMonths}. Land and sea differ
 * smoothly across a coast, over about one coarse cell (156 km on a world
 * of 128, 78 km on one of 256), and an island or a neck of land narrower
 * than a coarse cell does not shape the solve, though it keeps the cooling
 * of its own height. `fullResolution` solves on the world's own grid
 * instead, for tests and measurement.
 *
 * Everything below is about the grid the world is solved on: the state a
 * result ends in is on it, its terrain drift and the balance it solves are
 * of the world on it, and a start must be on it too. The result's months
 * are on the world's own grid.
 *
 * Without a start, the solve begins from the balance with the year's mean
 * sunlight and no heat capacity, {@link annualBalance}. On the coarsest
 * grid it is worked out on the grid solved on; on a finer one, for the
 * world on the grid a step coarser, by {@link coarsenWorld}, and carried
 * to the grid solved on by {@link refineField}. Measured in Node, a solve
 * from nothing on the 128 grid then runs the same years in 9 to 12% less
 * time than one from the balance worked out on the 128 grid (the Earth:
 * 3.29 s against 3.74 s, the median of seven; a generated world: 3.92 s
 * against 4.33 s), and their months differ by at most 0.004 K in any cell
 * and month, within what each year's change allows of a converged answer.
 *
 * With a start, it carries on from the start's state exactly, as if the
 * earlier solve had run on, but in the world as it is now: a start from a
 * solve that had not finished settles about as fast as that solve would
 * have.
 *
 * A start is used only for a world it suits. The model has two settled
 * climates for some worlds, an ordinary one and a frozen one, and a solve
 * carried on from a start stays in whichever it was handed: measured at 64
 * cells per face edge, the Earth with its sea level 6,000 m down freezes
 * over, to a mean of −50.8 °C, and carried on from there back at 0 m it
 * stays at −28.5 °C, where a solve from nothing gives 14.5 °C. So a start
 * is set aside, and the solve is then the same, bit for bit, as one from
 * nothing, at the first of these tests it fails, taken in this order:
 *
 * 1. Its record, `solvedFor`, must name the world's sea level and planet,
 *    each brought to the forms of {@link temperatureConditions} and
 *    compared exactly. Of the planet, only the settings the temperature
 *    reads, {@link TEMPERATURE_SETTINGS}, are compared: a start solved for
 *    another day length suits the world. A start set aside here costs only
 *    the comparison: its state is not read.
 * 2. Its state's terrain must have drifted from its reference, as
 *    {@link coolingDrift} measures it against
 *    {@link TemperatureState.referenceCoolingK} for the world on the grid
 *    solved on, by less than {@link TemperatureModel.terrainDriftLimitK}. A
 *    start set aside here costs the reading and checking of its state and
 *    the measure.
 *
 * Every solve that does not carry on a state, whether from nothing or from
 * a start set aside, returns its own world's cooling on the grid solved on
 * as its state's reference; one that carries on a state returns that
 * state's reference unchanged. So a run of terrain edits, each started from
 * the last result, carries on until the terrain has drifted past the limit
 * from the last solve from nothing, and then starts afresh. Within the
 * limit, a result carried on can still differ from a solve from nothing.
 * The returned state is always one a later solve of a world of the same
 * resolution, solved the same way, accepts as a start.
 *
 * Each year steps through the twelve months. At the end of a year, the
 * heat each cell gained or lost over it says how far the ocean is from its
 * own repeating cycle, and the state is corrected by solving the balance
 * for that heat with no heat capacity, which removes most of the slow
 * warming or cooling the ocean would otherwise take years to finish, on a
 * year of any length.
 *
 * The solve stops when the last year changed by less than the tolerance,
 * as {@link TemperatureResult.converged} defines it, or when `maxYears`
 * have run; the result says which. A year's change is measured as each
 * cell's change from the year's start to its end, not as the change of its
 * annual mean from the year before: after an edit, the first year's annual
 * mean is off because that year began from the old state, which is gone by
 * the second year's start, and comparing annual means would ask for a
 * third year that changes nothing.
 *
 * Takes time in proportion to the number of cells solved on and the years
 * run; `npm run time:temperature` measures it. `onYear`, if given, hears
 * of each year as it finishes, so that a caller can show how far it has
 * come.
 *
 * @param world - The world. It is not changed.
 * @param options - A starting state, the most years, the tolerance, the
 * model's constants, whether to solve on the world's own grid and whom to
 * tell as each year finishes.
 * @returns New arrays the caller owns.
 * @throws RangeError if the world's resolution is not supported, if its
 * elevations are not one finite value per cell, if its sea level does not
 * lie from {@link MIN_ELEVATION_M} to {@link MAX_ELEVATION_M}, if a planet
 * setting is not a number, if `maxYears` is not a whole number from 1 to
 * {@link MAX_YEARS_LIMIT}, if `tolerance` is not finite and above zero, if
 * a model constant is missing or out of range, if `start` is not an object
 * with a state and a record of a finite sea level and a finite number for
 * each of the planet's {@link TEMPERATURE_SETTINGS}, or if a start that
 * passes the first test has a state that is not valid (see
 * {@link TemperatureState}), on another grid included.
 * @throws Whatever `onYear` throws, as it is.
 */
export const solveTemperature = (
	world: World,
	options: SolveTemperatureOptions = {},
): TemperatureResult => {
	const {
		maxYears = DEFAULT_MAX_YEARS,
		tolerance = DEFAULT_TOLERANCE_K,
		model = TEMPERATURE_MODEL,
		fullResolution = false,
		onYear,
		winds,
	} = options;
	assertOptions(maxYears, tolerance);
	assertModel(model);
	assertSolvableWorld(world);
	const coarse =
		fullResolution || solveResolution(world.resolution) === world.resolution
			? null
			: coarsenWorld(world);
	if (winds !== undefined) {
		assertWinds(winds, (coarse ?? world).elevation.length);
	}
	const solved = solveOnGrid(
		coarse ?? world,
		options.start,
		maxYears,
		tolerance,
		model,
		onYear,
		winds,
	);
	const {
		seaLevelMonths,
		seaKMonths,
		setup,
		state,
		yearsRun,
		converged,
		finalChangeK,
	} = solved;
	let months: Float32Array[];
	if (coarse === null) {
		const { cooling } = setup;
		months = seaLevelMonths.map((month) => {
			const field = new Float32Array(month.length);
			for (let cell = 0; cell < field.length; cell++) {
				field[cell] =
					airTemperature(month[cell] as number, cooling[cell] as number) -
					ZERO_CELSIUS_K;
			}
			return field;
		});
	} else {
		const cooling = new Float64Array(world.elevation.length);
		coolingInto(world, model.lapseRate, cooling);
		months = refineInto(seaLevelMonths, world.resolution, cooling);
	}
	return {
		months,
		seaMonths: seaMonthsOf(seaKMonths, world, setup),
		state,
		solvedFor: {
			seaLevel: setup.seaLevel,
			planet: temperaturePlanet(setup.planet),
		},
		yearsRun,
		converged,
		finalChangeK,
	};
};

/**
 * The annual mean, the warmest and coldest months and the seasonal range of
 * every cell.
 *
 * @param months - Twelve fields of equal length, in degrees Celsius, such as
 * {@link TemperatureResult.months}. They are not changed.
 * @returns New arrays, one value per cell.
 * @throws RangeError if there are not twelve fields of equal length.
 */
export const summariseTemperature = (
	months: MonthlyTemperature,
): TemperatureSummary => {
	if (months.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`A year has ${MONTHS_PER_YEAR} months; got ${months.length}`,
		);
	}
	const count = (months[0] as Float32Array).length;
	if (months.some((field) => field.length !== count)) {
		throw new RangeError('Every month must hold one value per cell');
	}
	const annualMean = new Float32Array(count);
	const warmest = new Float32Array(count);
	const coldest = new Float32Array(count);
	const range = new Float32Array(count);
	for (let cell = 0; cell < count; cell++) {
		let total = 0;
		let high = Number.NEGATIVE_INFINITY;
		let low = Number.POSITIVE_INFINITY;
		for (const field of months) {
			const value = field[cell] as number;
			total += value;
			high = Math.max(high, value);
			low = Math.min(low, value);
		}
		annualMean[cell] = total / MONTHS_PER_YEAR;
		warmest[cell] = high;
		coldest[cell] = low;
		range[cell] = high - low;
	}
	return { annualMean, warmest, coldest, range };
};
