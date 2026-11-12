/**
 * Near-surface air temperature through the year: a seasonal energy balance
 * on the world's own grid.
 *
 * Every cell holds one temperature, the temperature its air would have at
 * sea level, in kelvin. Its heat capacity times the rate at which that
 * temperature changes is the sunlight it absorbs, less the heat it
 * radiates to space, plus the heat its four neighbours pass it:
 *
 * `C dT/dt = (1 − α) Q − ε σ T⁴ + Σ_k D w_k (T_k − T) / A`
 *
 * where `Q` is the daily-mean sunlight at the top of the atmosphere for the
 * cell's latitude and the time of year, `α` the reflectivity, `ε` an
 * emissivity that falls as the greenhouse effect strengthens, `D` a
 * diffusivity, `w_k` the edge weights of {@link edgeGeometry} and `A` the
 * cell's area on the unit sphere. Ocean cells hold the heat capacity of a
 * mixed layer of water, land cells much less. The air over land is cooled
 * by a fixed lapse rate for the land's height above sea level. As that air
 * temperature falls below freezing, reflectivity rises smoothly, standing
 * for snow and sea ice, and an ocean cell's heat capacity falls towards
 * land's, standing for sea ice cutting the air off from the water.
 *
 * Time runs in real seconds: a year lasts {@link yearLengthDays}, split into
 * twelve equal months, January first, each stepped a fixed number of times
 * by second-order backward differences. Each step is implicit: the exchange
 * between cells and the outgoing heat, linearised about where the step is
 * expected to end, are solved for together (see
 * {@link createExchangeSolver}); reflectivity and heat capacity are read at
 * that expected end. The year is repeated until it stops changing.
 *
 * The constants are those of published simple energy-balance models, then
 * tuned against the observed Earth; they are tuning parameters, not
 * physical truth.
 */

import {
	createExchangeSolver,
	EXCHANGE_MAX_ITERATIONS,
	type ExchangeSolver,
} from './exchange';
import {
	edgeGeometry,
	type Grid,
	getGrid,
	isSupportedResolution,
	NEIGHBOUR_COUNT,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import {
	cellLatitudes,
	dailyInsolation,
	MONTHS_PER_YEAR,
	monthlyInsolation,
} from './insolation';
import type { MonthlyTemperature } from './observed';
import {
	DEFAULT_PLANET,
	normalisePlanet,
	PLANET_LIMITS,
	type PlanetSettings,
	yearLengthDays,
} from './planet';
import type { World } from './world';

/**
 * The constants of the temperature model.
 *
 * @remarks
 * All of them are tuning parameters. Where the physical ones start from is
 * given in {@link TEMPERATURE_MODEL}; the numerical ones were chosen by
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
	/** Heat capacity of an ocean cell, in joules per square metre per kelvin. */
	readonly oceanHeatCapacity: number;
	/** Heat capacity of a land cell, in joules per square metre per kelvin. */
	readonly landHeatCapacity: number;
	/**
	 * Heat capacity of an ocean cell wholly covered by ice, in joules per
	 * square metre per kelvin: the ice cuts the air off from the water
	 * below, so the surface warms and cools like land.
	 */
	readonly seaIceHeatCapacity: number;
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
};

/**
 * The model's constants as tuned against the observed Earth.
 *
 * @remarks
 * Where each one starts from:
 *
 * - `diffusivity`: 0.55 W m⁻² K⁻¹, a little below the value North, Cahalan
 *   and Coakley (1981), "Energy balance climate models", Reviews of
 *   Geophysics 19, use for diffusion on the unit sphere with outgoing heat
 *   linear in temperature.
 * - `landDiffusivity`: tuned down to 0.35 so that continents keep more of
 *   their own seasons; with one diffusivity everywhere, the ocean's heat
 *   reaches too far inland and halves the seasonal range of the continents'
 *   interiors.
 * - `oceanHeatCapacity`: a mixed layer of 60 m of sea water at
 *   4.18 MJ m⁻³ K⁻¹.
 * - `landHeatCapacity`: about the atmosphere's column alone, 10⁴ kg m⁻² of
 *   air at 1004 J kg⁻¹ K⁻¹, as simple seasonal models with continents take
 *   it.
 * - `seaIceHeatCapacity`: taken equal to land's, as ice insulates the water
 *   below; without it the Arctic winter is 10 K too warm.
 * - `lapseRate`: the standard atmosphere's 6.5 K km⁻¹ (ICAO, 1993).
 * - `greenhouseFactor`: chosen so Earth (`g = 1`) radiates with emissivity
 *   about 0.61, the ratio of its outgoing 239 W m⁻² (Trenberth, Fasullo
 *   and Kiehl, 2009, "Earth's global energy budget", BAMS 90) to a black
 *   body at its mean surface temperature of 288 K.
 * - `albedo`, `albedoPoleward` and `iceAlbedo`: tuned, starting from the
 *   form North, Cahalan and Coakley (1981) use for ground clear of ice, a
 *   constant plus a multiple of the second Legendre polynomial of the sine
 *   of latitude, with a higher value over ice. `albedo` sets the global
 *   mean, here to the observed one; ice comes in over a smooth ramp from
 *   0 °C to −10 °C rather than at a single temperature.
 * - `landAlbedoExtra`: 0, no starting point; left for tuning.
 * - `solverMaxIterations`: the solver normally needs 5 to 25, so 200 only
 *   stops a solve that would not converge.
 * - `stepsPerMonth` and `solverToleranceK`: chosen by measurement on the
 *   Earth at 64 cells per face edge against 24 steps a month solved to
 *   1e-4 K: two steps a month differ from it by at most 0.4 K in any
 *   month's root-mean-square and 0.07 K in the annual mean, about a tenth
 *   of the model's error against the observed Earth, for half the time of
 *   four steps.
 */
export const TEMPERATURE_MODEL: TemperatureModel = Object.freeze({
	diffusivity: 0.55,
	landDiffusivity: 0.35,
	oceanHeatCapacity: 2.5e8,
	landHeatCapacity: 1e7,
	seaIceHeatCapacity: 1e7,
	lapseRate: 6.5e-3,
	greenhouseFactor: 0.633,
	albedo: 0.27,
	albedoPoleward: 0.078,
	landAlbedoExtra: 0,
	iceAlbedo: 0.62,
	iceStartC: 0,
	iceFullC: -10,
	stepsPerMonth: 2,
	solverToleranceK: 5e-3,
	solverMaxIterations: EXCHANGE_MAX_ITERATIONS,
});

/**
 * The state a solve ended in, from which another solve can carry on
 * exactly: the sea-level temperature of every cell at the turn of the
 * year, and one step before it.
 *
 * @remarks
 * Plain typed arrays in a plain object, so that it survives a structured
 * clone and its arrays can be transferred. The temperatures are at sea
 * level, so they stay meaningful after the terrain, the sea level or the
 * planet change; a solve that carries on from them applies the world's own
 * lapse rate and land, as they are then.
 */
export type TemperatureState = {
	/** Sea-level temperature at the turn of the year, kelvin, per cell. */
	readonly temperatureK: Float64Array;
	/** The same one step earlier, kelvin, per cell. */
	readonly previousK: Float64Array;
	/**
	 * The length of that step, in seconds, from {@link MIN_STEP_SECONDS} to
	 * {@link MAX_STEP_SECONDS}.
	 */
	readonly stepSeconds: number;
	/**
	 * The rough guess of the world the state was solved for, kelvin, per
	 * cell: the first guess two iterations in, from which a later solve
	 * judges how far its own world has moved (see {@link STATE_FALLBACK_K}).
	 */
	readonly guessK: Float64Array;
};

/**
 * Where a solve may start from: a previous result, or the parts of one.
 *
 * @remarks
 * A {@link TemperatureResult} is one. With a `state`, the solve carries on
 * from it and `months` are not read. With only `months`, as when the state
 * was not kept, the state at the turn of the year is rebuilt from them,
 * which costs a year or so more to settle.
 */
export type TemperatureStart = {
	/** A previous result's twelve monthly fields, in degrees Celsius. */
	readonly months?: MonthlyTemperature;
	/** A previous result's end state. */
	readonly state?: TemperatureState;
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
	 * in cell order: the month's mean sea-level temperature, cooled by the
	 * lapse rate. That is the mean of the air temperature itself everywhere
	 * except where the cooling is limited to half the sea-level temperature,
	 * on the high ground of the coldest planets.
	 */
	readonly months: Float32Array[];
	/** The state the solve ended in, to carry on from. */
	readonly state: TemperatureState;
	/** The number of years the solve ran, from 1. */
	readonly yearsRun: number;
	/**
	 * Whether the last year changed by less than the tolerance, and every
	 * step of that year, and its end's correction, were solved to their
	 * accuracy. The first guess and the matching of January to a start's
	 * months are not counted.
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

/**
 * How far a world may have moved from the one a starting state was solved
 * for, before the state is set aside and the solve starts from the first
 * guess, exactly as from nothing: the area-weighted mean difference, in
 * kelvin, between the two worlds' rough guesses (the first guess two
 * iterations in).
 *
 * @remarks
 * The rough guesses are compared rather than the state with the new
 * world's guess, because a seasonal or hot planet's own answer lies far
 * from its annual-mean guess, so that measure would set aside the state
 * even for the same world. Measured at 64 cells per face edge: a 500 m
 * patch moves the rough guess by under 0.01 K and a 3 km plateau by about
 * 1 K on any planet; a star 1.1 times as bright, 7 K; a moderately
 * different planet, 55 K; a jump between corners of the settings, 250 to
 * over 1,000 K, where the slow ocean takes longer to get there from the old
 * state than from the new first guess.
 *
 * Changes that leave the annual-mean sunlight alone are not seen: a cold
 * planet whose tilt goes from 90 to 0 degrees has the same rough guess, so
 * its state is carried on, and takes 5 or 6 years against 1 from nothing,
 * though it settles to the same answer.
 */
export const STATE_FALLBACK_K = 50;

/** First-guess iterations in a rough guess. */
const FALLBACK_GUESS_ITERATIONS = 2;

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

/**
 * The least share of its outgoing heat's rise with temperature that a
 * cell's damping is taken to be when the year's end is corrected.
 */
const MIN_DAMPING_SHARE = 0.5;

/**
 * How far the whole starting state is moved, in kelvin, to measure how
 * much each cell's January mean follows its starting temperature.
 */
const JANUARY_NUDGE_K = 1;

/**
 * The least share of a starting error a cell's January mean is taken to
 * carry when it is corrected, which bounds the correction to this many
 * times its January error over.
 */
const MIN_JANUARY_RESPONSE = 0.25;

/** Times the year-end correction is solved, each with a better slope. */
const CORRECTION_PASSES = 4;

/** Steps of the first guess at most, and the change at which it stops. */
const GUESS_ITERATIONS = 20;
const GUESS_CHANGE_K = 0.1;

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

/** The inverse of {@link airTemperature}. */
const seaLevelTemperature = (airK: number, cooling: number): number =>
	airK >= cooling ? airK + cooling : 2 * airK;

/** Everything about a world the model needs, worked out once per solve. */
type Setup = {
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

const assertWorld = (world: World): void => {
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
	if (!Number.isFinite(world.seaLevel)) {
		throw new RangeError(`A sea level must be finite; got ${world.seaLevel}`);
	}
	for (let cell = 0; cell < cellCount; cell++) {
		if (!Number.isFinite(world.elevation[cell])) {
			throw new RangeError(
				`Temperature needs finite elevations; cell ${cell} holds ${world.elevation[cell]}`,
			);
		}
	}
};

const assertModel = (model: TemperatureModel): void => {
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
		'seaIceHeatCapacity',
		'solverToleranceK',
	];
	for (const name of positive) {
		if (!(model[name] > 0)) {
			throw new RangeError(`The model's ${name} must be above zero`);
		}
	}
	for (const name of ['greenhouseFactor', 'lapseRate'] as const) {
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
	if (!(model.iceStartC > model.iceFullC)) {
		throw new RangeError("The model's iceStartC must be above its iceFullC");
	}
};

const setUp = (world: World, model: TemperatureModel): Setup => {
	const planet = normalisePlanet(world.planet);
	const grid = getGrid(world.resolution);
	const { cellCount, areas } = grid;
	const latitudes = cellLatitudes(grid);
	const level = Math.fround(world.seaLevel);
	const cooling = new Float64Array(cellCount);
	const landMask = new Uint8Array(cellCount);
	const clearAlbedo = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		const height = (world.elevation[cell] as number) - level;
		const land = height > 0;
		const sine = Math.sin((latitudes[cell] as number) * RADIANS_PER_DEGREE);
		const legendre = 0.5 * (3 * sine * sine - 1);
		cooling[cell] = land ? model.lapseRate * height : 0;
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
		cellCount,
		areas,
		cooling,
		land: landMask,
		clearAlbedo,
		planet,
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

/** A first guess being worked out: see {@link startGuess}. */
type Guess = {
	/** The guess so far, sea-level temperature in kelvin. */
	readonly state: Float64Array;
	/** Takes up to this many more iterations, stopping once settled. */
	advance(iterations: number): void;
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
 * temperature per cell lie.
 */
const distanceFrom = (
	setup: Setup,
	state: Float64Array,
	guess: Float64Array,
): number => {
	const { cellCount, areas } = setup;
	let total = 0;
	let area = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		total +=
			(areas[cell] as number) *
			Math.abs((state[cell] as number) - (guess[cell] as number));
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
 * It is taken a few iterations at a time, so that a rough guess can be had
 * first and carried on to the full one, which is then the same as if it
 * had been run in one go.
 */
const startGuess = (setup: Setup, solver: ExchangeSolver): Guess => {
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
	let taken = 0;
	let settled = false;
	const advance = (iterations: number): void => {
		for (
			let iteration = 0;
			iteration < iterations && taken < GUESS_ITERATIONS && !settled;
			iteration++
		) {
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
			taken++;
			settled = change < GUESS_CHANGE_K;
		}
	};
	return { state, advance };
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
 * state, and the state a step before it, in kelvin.
 *
 * @remarks
 * The arrays are copied first and only the copies are checked and used. If
 * this solve's steps are of another length, as when the planet's year
 * changed, the state a step before is moved so that the rate of change it
 * implies is kept, and brought within the limits of a state.
 *
 * @throws RangeError if the state is not three Float64Arrays of one
 * temperature per cell, each from {@link MIN_TEMPERATURE_K} to
 * {@link MAX_START_K}, with a step length from {@link MIN_STEP_SECONDS} to
 * {@link MAX_STEP_SECONDS}.
 */
const fromState = (
	setup: Setup,
	start: TemperatureState,
): {
	readonly state: Float64Array;
	readonly before: Float64Array;
	readonly guess: Float64Array;
} => {
	const { cellCount } = setup;
	if (typeof start !== 'object' || start === null) {
		throw new RangeError('A starting state must be an object');
	}
	const { stepSeconds } = start;
	const state = copyChecked(
		start.temperatureK,
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
	const guess = copyChecked(
		start.guessK,
		'Float64Array',
		cellCount,
		"A starting state's guessK",
	);
	assertStartTemperatures(state, "A starting state's temperatureK");
	assertStartTemperatures(previous, "A starting state's previousK");
	assertStartTemperatures(guess, "A starting state's guessK");
	if (
		typeof stepSeconds !== 'number' ||
		!(stepSeconds >= MIN_STEP_SECONDS && stepSeconds <= MAX_STEP_SECONDS)
	) {
		throw new RangeError(
			`A starting state's step must last from ${MIN_STEP_SECONDS} to ${MAX_STEP_SECONDS} seconds, as some planet's can; got ${String(stepSeconds)}`,
		);
	}
	return {
		state,
		before: stepBefore(state, previous, stepSeconds, stepSecondsOf(setup)),
		guess,
	};
};

/** The length of each step of a solve, in seconds. */
const stepSecondsOf = (setup: Setup): number =>
	setup.yearSeconds / (MONTHS_PER_YEAR * setup.model.stepsPerMonth);

/**
 * The sea-level temperature at the start of January rebuilt from a previous
 * result's months, the temperature one step before it, and that result's
 * January mean, all in kelvin.
 *
 * @remarks
 * The months are copied first and only the copies are checked and used.
 * The previous result is air temperature, so each land cell's lapse-rate
 * cooling, for the world as it is now, is added back, and every month must
 * then be a temperature a state may hold. The state at the turn of the year
 * and its rate of change are those of the cubic whose means over November
 * to February are the result's; the state a step earlier follows from the
 * rate, so that the second-order stepping starts at full accuracy. Both are
 * brought within the limits of a state.
 */
const fromMonths = (
	setup: Setup,
	start: MonthlyTemperature,
): {
	readonly state: Float64Array;
	readonly before: Float64Array;
	readonly january: Float64Array;
} => {
	const { cellCount, cooling, model } = setup;
	if (!Array.isArray(start) || start.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`A start's months must be ${MONTHS_PER_YEAR} fields; got ${Array.isArray(start) ? start.length : typeof start}`,
		);
	}
	const seaLevel: Float64Array[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const what = `Month ${month} of a start`;
		const field = copyChecked(start[month], 'Float32Array', cellCount, what);
		for (let cell = 0; cell < cellCount; cell++) {
			const value = field[cell] as number;
			// NaN and infinities are refused just below, after conversion.
			field[cell] = Number.isFinite(value)
				? seaLevelTemperature(value + ZERO_CELSIUS_K, cooling[cell] as number)
				: Number.NaN;
		}
		assertStartTemperatures(field, what);
		seaLevel.push(field);
	}
	const january = seaLevel[0] as Float64Array;
	const february = seaLevel[1] as Float64Array;
	const november = seaLevel[MONTHS_PER_YEAR - 2] as Float64Array;
	const december = seaLevel[MONTHS_PER_YEAR - 1] as Float64Array;
	const state = new Float64Array(cellCount);
	const before = new Float64Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		const nov = november[cell] as number;
		const dec = december[cell] as number;
		const jan = january[cell] as number;
		const feb = february[cell] as number;
		const turn = (7 * (dec + jan) - (nov + feb)) / 12;
		// Kelvin per month.
		const rate = (15 * (jan - dec) - (feb - nov)) / 12;
		state[cell] = clampStart(turn);
		before[cell] = clampStart(turn - rate / model.stepsPerMonth);
	}
	return { state, before, january };
};

/** The time stepping of one solve, holding the state it steps. */
type Stepper = {
	/** The sea-level temperature now, in kelvin. */
	readonly state: Float64Array;
	/** The sea-level temperature a step before now, in kelvin. */
	readonly previous: Float64Array;
	/** Each cell's heat capacity in the latest step. */
	readonly capacity: Float64Array;
	/** Each cell's least heat capacity over the year's steps so far. */
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
	 * Steps through one month, adding each step's mean temperature to
	 * `sum`.
	 */
	runMonth(month: number, sum: Float64Array): void;
};

const createStepper = (
	setup: Setup,
	solver: ExchangeSolver,
	initial: Float64Array,
	before: Float64Array,
): Stepper => {
	const { cellCount, areas, clearAlbedo, cooling, emission, land, model } =
		setup;
	const {
		stepsPerMonth,
		solverToleranceK,
		iceAlbedo,
		landHeatCapacity,
		oceanHeatCapacity,
		seaIceHeatCapacity,
	} = model;
	const stepSeconds = stepSecondsOf(setup);
	const state = Float64Array.from(initial);
	const previous = Float64Array.from(before);
	const capacity = new Float64Array(cellCount);
	const leastCapacity = new Float64Array(cellCount);
	const damping = new Float64Array(cellCount);
	const feedback = new Float64Array(cellCount);
	const mass = new Float64Array(cellCount);
	const rhs = new Float64Array(cellCount);
	const next = new Float64Array(cellCount);
	const table = new Float64Array(SUNLIGHT_ROWS);
	const light = new Float64Array(cellCount);

	let solved = true;

	const startYear = (): void => {
		solved = true;
		leastCapacity.fill(Number.POSITIVE_INFINITY);
		damping.fill(0);
		feedback.fill(0);
	};

	const runMonth = (month: number, sum: Float64Array): void => {
		sum.fill(0);
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
				const air = airTemperature(ahead, cooling[cell] as number);
				const clear = clearShare(air, model);
				const clearValue = clearAlbedo[cell] as number;
				const albedo = iceAlbedo + (clearValue - iceAlbedo) * clear;
				const heatCapacity = land[cell]
					? landHeatCapacity
					: seaIceHeatCapacity +
						(oceanHeatCapacity - seaIceHeatCapacity) * clear;
				capacity[cell] = heatCapacity;
				leastCapacity[cell] = Math.min(
					leastCapacity[cell] as number,
					heatCapacity,
				);
				const radiation = emission * ahead * ahead * ahead;
				const storage = heatCapacity / stepSeconds;
				const cellArea = areas[cell] as number;
				const sunlight = light[cell] as number;
				// Second-order backward differences:
				// (3 T' − 4 T + T⁻) / 2Δt for the rate of change.
				mass[cell] = cellArea * (1.5 * storage + 4 * radiation);
				rhs[cell] =
					cellArea *
					(storage * (2 * t - 0.5 * earlier) +
						(1 - albedo) * sunlight +
						3 * radiation * ahead);
				damping[cell] = (damping[cell] as number) + 4 * radiation;
				// How much more sunlight the cell absorbs per kelvin of
				// warming as its snow and ice retreat.
				feedback[cell] =
					(feedback[cell] as number) +
					(iceAlbedo - clearValue) * clearShareSlope(air, model) * sunlight;
				next[cell] = ahead;
			}
			solver.setMass(mass);
			if (!solver.solve(rhs, next, solverToleranceK).converged) {
				solved = false;
			}
			for (let cell = 0; cell < cellCount; cell++) {
				const t = state[cell] as number;
				const value = Math.max(MIN_TEMPERATURE_K, next[cell] as number);
				sum[cell] = (sum[cell] as number) + 0.5 * (t + value);
				previous[cell] = t;
				state[cell] = value;
			}
		}
	};

	return {
		state,
		previous,
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
 * Corrects a starting state rebuilt from monthly means so that January
 * comes out as the start says.
 *
 * @remarks
 * Monthly means do not fix the temperature at the turn of the year
 * exactly, least of all where the sea freezes, and an error there that the
 * ocean remembers takes years to go. So January is run twice: once from
 * the rebuilt state, and once from that state 1 K warmer everywhere. The
 * difference between the two runs' January means is how much of a
 * starting error each cell's January carries: nearly all of it over open
 * ocean, less over land and ice, which forget their start within weeks.
 * Each cell is then moved by its January error divided by that share, one
 * step of Newton's method, with the share held between
 * {@link MIN_JANUARY_RESPONSE} and 1: at most 1, so no cell is moved by
 * less than its error, and at least the minimum, so no cell is moved by
 * more than its error over the minimum. Both the state and the state a
 * step before it move by the same amount, and the stepper's year sums are
 * cleared again.
 *
 * After an edit, January differs from the start's for real, not only by
 * the rebuilding's error, and the correction holds the first January back
 * towards the old one; the years that follow begin from the stepping's own
 * state and are not affected.
 *
 * @param january - The start's January mean, at sea level, in kelvin.
 */
const matchJanuary = (
	setup: Setup,
	stepper: Stepper,
	january: Float64Array,
): void => {
	const { cellCount, model } = setup;
	const { state, previous } = stepper;
	const steps = model.stepsPerMonth;
	const state0 = Float64Array.from(state);
	const previous0 = Float64Array.from(previous);
	const reset = (shift: number): void => {
		for (let cell = 0; cell < cellCount; cell++) {
			state[cell] = (state0[cell] as number) + shift;
			previous[cell] = (previous0[cell] as number) + shift;
		}
	};
	const base = new Float64Array(cellCount);
	const nudged = new Float64Array(cellCount);
	stepper.runMonth(0, base);
	reset(JANUARY_NUDGE_K);
	stepper.runMonth(0, nudged);
	for (let cell = 0; cell < cellCount; cell++) {
		const error = (base[cell] as number) / steps - (january[cell] as number);
		const response =
			((nudged[cell] as number) - (base[cell] as number)) /
			(steps * JANUARY_NUDGE_K);
		const shift =
			-error / Math.min(1, Math.max(MIN_JANUARY_RESPONSE, response));
		state[cell] = Math.max(MIN_TEMPERATURE_K, (state0[cell] as number) + shift);
		previous[cell] = Math.max(
			MIN_TEMPERATURE_K,
			(previous0[cell] as number) + shift,
		);
	}
	stepper.startYear();
};

/**
 * The correction for the heat each cell gained or lost over the year,
 * into `correction`, in kelvin: zero exactly when the year ended where it
 * began.
 *
 * @remarks
 * The heat gained per second is the change of temperature over the year
 * at the latest heat capacity, over the year's length, scaled by
 * {@link memory}. The correction is the shift that heat implies at the
 * balance with no heat capacity: the outgoing heat's rise with
 * temperature, less the rise of absorbed sunlight as ice retreats (kept to
 * at least {@link MIN_DAMPING_SHARE} of the former, so that the correction
 * stays bounded where the two nearly cancel), with the exchange between
 * cells.
 *
 * Outgoing heat goes as T⁴, so its rise taken at the year's temperatures
 * badly understates it for a large warming, and a correction worked out
 * from it would overshoot, to thousands of kelvin after a big change of
 * planet. So the rise is taken over the whole shift instead, as the slope
 * of the chord of `ε σ T⁴` from the cell's temperature `a` (the one whose
 * rise is the year's mean) to `a` plus the shift, and the correction is
 * solved again with it, {@link CORRECTION_PASSES} times in all. For a small
 * shift the chord is the tangent and nothing changes.
 *
 * @returns Whether every solve came within the solver's tolerance.
 */
const correctYearEnd = (
	setup: Setup,
	solver: ExchangeSolver,
	stepper: Stepper,
	yearStart: Float64Array,
	correction: Float64Array,
	mass: Float64Array,
	rhs: Float64Array,
): boolean => {
	const { cellCount, areas, emission, yearSeconds, model } = setup;
	const { state } = stepper;
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
			rhs[cell] =
				(cellArea *
					(stepper.capacity[cell] as number) *
					((state[cell] as number) - (yearStart[cell] as number)) *
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
	}
	return solved;
};

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
 * guide. Where the change did not shrink there is no basis for one at all.
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
 * the change did not shrink or either change is not a finite number.
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
		!(changeK < previousChangeK)
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
 * The near-surface air temperature of a world through its year: twelve
 * monthly means.
 *
 * @remarks
 * A pure function of the world and the options: the same input gives the
 * same output, bit for bit. The world's planet is passed through
 * {@link normalisePlanet} first, so a setting beyond its limits is brought
 * to the limit and one that is not a number is refused.
 *
 * Without a start, the solve begins from the balance with the year's mean
 * sunlight and no heat capacity. With a start that has a state, it carries
 * on from that state exactly, as if the earlier solve had run on, but in
 * the world as it is now: a start from a solve that had not finished
 * settles about as fast as that solve would have. If the world's rough
 * guess lies more than {@link STATE_FALLBACK_K} from the rough guess the
 * state carries of its own world, as after a large change of the planet,
 * the state is set aside and the solve is the same as one from nothing. A
 * start of months alone is always used. The returned state is always one
 * a later solve accepts as a start. With a start that has only months, it
 * begins from the state at the turn of the year that the months imply,
 * corrected by running January so that the start's January comes out
 * again. Each year then steps through the twelve months. At the
 * end of a year, the heat each cell gained or lost over it says how far
 * the ocean is from its own repeating cycle, and the state is corrected by
 * solving the balance for that heat with no heat capacity, which removes
 * most of the slow warming or cooling the ocean would otherwise take years
 * to finish, on a year of any length.
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
 * Takes time in proportion to the number of cells and the years run;
 * `npm run time:temperature` measures it. `onYear`, if given, hears of
 * each year as it finishes, so that a caller can show how far it has come.
 *
 * @param world - The world. It is not changed.
 * @param options - A starting state, the most years, the tolerance, the
 * model's constants and whom to tell as each year finishes.
 * @returns New arrays the caller owns.
 * @throws RangeError if the world's resolution, elevations or sea level are
 * not valid, if a planet setting is not a number, if `maxYears` is not a
 * whole number from 1 to {@link MAX_YEARS_LIMIT}, if `tolerance` is not
 * finite and above zero, if a model constant is missing or out of range,
 * or if `start` is not an object with a valid state (see
 * {@link TemperatureState}) or twelve months of Float32Arrays of one
 * temperature per cell that, brought to sea level, lies from 2.7 to
 * 10,000 K.
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
		onYear,
	} = options;
	assertOptions(maxYears, tolerance);
	assertModel(model);
	assertWorld(world);
	const setup = setUp(world, model);
	const { cellCount, cooling } = setup;
	const { stepsPerMonth } = model;
	const grid = getGrid(world.resolution);
	// The start is read and checked before anything costly is built.
	const { start } = options;
	let carried: ReturnType<typeof fromState> | undefined;
	let rebuilt: ReturnType<typeof fromMonths> | undefined;
	if (start !== undefined) {
		if (typeof start !== 'object' || start === null) {
			throw new RangeError('A start must be an object with a state or months');
		}
		if (start.state !== undefined) {
			carried = fromState(setup, start.state);
		} else if (start.months !== undefined) {
			rebuilt = fromMonths(setup, start.months);
		} else {
			throw new RangeError('A start must hold a state or months');
		}
	}

	const solver = createExchangeSolver(
		grid,
		coupling(setup, grid),
		model.solverMaxIterations,
	);
	// Every solve takes the rough guess of its world, which it returns with
	// its state for a later solve to compare its own world with.
	const guess = startGuess(setup, solver);
	guess.advance(FALLBACK_GUESS_ITERATIONS);
	const roughGuess = guess.state.map(clampStart);
	let stepper: Stepper;
	if (
		carried !== undefined &&
		distanceFrom(setup, carried.guess, roughGuess) <= STATE_FALLBACK_K
	) {
		stepper = createStepper(setup, solver, carried.state, carried.before);
	} else if (rebuilt !== undefined) {
		// A start of months alone has no guess to compare with, and is
		// always used.
		stepper = createStepper(setup, solver, rebuilt.state, rebuilt.before);
		matchJanuary(setup, stepper, rebuilt.january);
	} else {
		// From nothing, or from a state whose world has moved too far: the
		// first guess, carried on from the rough one, the same as if it had
		// been taken in one go.
		guess.advance(GUESS_ITERATIONS);
		stepper = createStepper(setup, solver, guess.state, guess.state);
	}
	const { state, previous } = stepper;

	const monthSums = Array.from(
		{ length: MONTHS_PER_YEAR },
		() => new Float64Array(cellCount),
	);
	const yearStart = new Float64Array(cellCount);
	const correction = new Float64Array(cellCount);
	const mass = new Float64Array(cellCount);
	const rhs = new Float64Array(cellCount);

	let yearsRun = 0;
	let converged = false;
	let finalChangeK = Number.POSITIVE_INFINITY;
	while (yearsRun < maxYears && !converged) {
		yearStart.set(state);
		stepper.startYear();
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			stepper.runMonth(month, monthSums[month] as Float64Array);
		}
		yearsRun++;

		let drift = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			drift = Math.max(
				drift,
				Math.abs((state[cell] as number) - (yearStart[cell] as number)),
			);
		}
		const correctionSolved = correctYearEnd(
			setup,
			solver,
			stepper,
			yearStart,
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

	const months = monthSums.map((sum) => {
		const field = new Float32Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			field[cell] =
				airTemperature(
					(sum[cell] as number) / stepsPerMonth,
					cooling[cell] as number,
				) - ZERO_CELSIUS_K;
		}
		return field;
	});
	return {
		months,
		state: {
			temperatureK: state.map(clampStart),
			previousK: previous.map(clampStart),
			guessK: roughGuess,
			stepSeconds: stepSecondsOf(setup),
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
