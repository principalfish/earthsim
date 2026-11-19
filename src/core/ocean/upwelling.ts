/**
 * Upwelling: where the wind's Ekman transport draws the sea's top layer
 * apart, water wells up from below to take its place, and the colder water
 * cools the sea's mixed layer.
 *
 * The Ekman transport (see {@link ekmanTransport}) carries water across
 * each edge between two cells the wind drives it in, as {@link edgeFlows}
 * gives it across the edge's great-circle normal, and nothing across an
 * edge to land or to a sea held still. What leaves a cell net over its area
 * is the speed `w` at which water rises into it from below, in metres a
 * second: square metres a second times the edges' lengths over the cell's
 * area. A flow that spreads out of no cell, such as a solid body's turning,
 * gives none, on the cube's seams as within its faces. Beside a
 * coast whose wind drives the transport offshore, as the equatorward winds
 * along the eastern sides of the oceans do, nothing comes in across the
 * coast to replace what leaves, and the water comes from below; under the
 * trades the transport turns poleward on both sides of the equator and the
 * water is drawn apart along it.
 *
 * Only that is counted: a sea cell wells up where `w` is above zero and it
 * touches a coast, or lies within {@link UpwellingSettings.upwellingEquatorDeg}
 * of the equator. That band is 0 by default, so only the coasts well up:
 * the Ekman transport held at its value at `equatorFloorDeg` draws about
 * three times the observed water apart along the equator. The Ekman
 * pumping of the open sea, the twist of the wind's push drawing water up or
 * down across the gyres, about 10⁻⁶ m/s against 10⁻⁵ m/s beside a coast
 * over a cell of the 64 grid, is left out, as is the water sinking where
 * the transport converges.
 *
 * The water rises from {@link UpwellingSettings.upwellingSourceDepthM}, and
 * the sea below the mixed layer is taken to cool with depth toward
 * {@link UpwellingSettings.deepSeaC}, its excess over that falling by 1/e in
 * {@link UpwellingSettings.thermoclineScaleM}. So the water that wells up has
 * the temperature
 *
 * `T_b = T_d + r (T_s − T_d)`, `r = exp(−(D − H) / h)`
 *
 * for the sea's temperature `T_s`, the deep sea's `T_d`, the source depth
 * `D`, the mixed layer's depth `H` and the scale `h`, and as it mixes into
 * the mixed layer it takes heat from the sea at `ρc w (T_s − T_b)` watts a
 * square metre, which is `ρc w (1 − r) (T_s − T_d)`: the sea relaxes toward
 * `T_d` at the rate {@link Upwelling.rates} gives, in watts a square metre
 * for each kelvin. It only cools: where the sea is no warmer than the water
 * below, nothing is taken. The heat taken leaves the climate, into the deep
 * sea, which is not modelled.
 *
 * The mixed layer's depth is the one the temperature model's
 * `oceanHeatCapacity` is reckoned at, 60 m of sea water.
 */

import { type Grid, getGrid, NEIGHBOUR_COUNT } from '../grid/grid';
import { createVectorField, edgeFlows, fromEastNorth } from '../grid/vector';
import { MONTHS_PER_YEAR } from '../planet/insolation';
import {
	SEA_WATER_HEAT_CAPACITY_J_M3_K,
	TEMPERATURE_MODEL,
	type TemperatureUpwelling,
} from '../temperature/temperature';
import type { MonthlyWind } from '../wind/observedWind';
import { PLANET_RADIUS_KM, type World } from '../world/world';
import {
	DEFAULT_GYRE_SETTINGS,
	ekmanTransport,
	type GyreSettings,
	type GyreSolver,
} from './gyres';

/** The settings upwelling reads: the gyres', which hold its own. */
export type UpwellingSettings = GyreSettings;

/** A world's upwelling through its year, from {@link upwelling}. */
export type Upwelling = TemperatureUpwelling & {
	/**
	 * Twelve fields, January to December, of the rate at which the water
	 * welling up takes heat from each cell's sea for each kelvin the sea is
	 * above the deep sea's temperature, in watts a square metre a kelvin:
	 * `ρc w (1 − r)`, zero or above, and zero where the cell does not well
	 * up.
	 */
	readonly rates: readonly Float32Array[];
	/**
	 * Twelve fields, January to December, of the speed at which water wells
	 * up into each cell's mixed layer, in metres a second: zero or above, and
	 * zero where the cell does not well up.
	 */
	readonly velocity: readonly Float32Array[];
	/**
	 * How much colder than the sea the water welling up is, as a share of the
	 * sea's excess over the deep sea's temperature: `1 − r`, from 0 to 1.
	 */
	readonly contrast: number;
};

/** How {@link upwelling} is run. */
export type UpwellingOptions = {
	/** The settings; {@link DEFAULT_GYRE_SETTINGS} when left out. */
	readonly settings?: UpwellingSettings;
	/**
	 * A gyres' solver built for the world as it is now, whose basins say
	 * which seas are held still; the one kept for the world's grid, or a new
	 * one, when left out.
	 */
	readonly solver?: GyreSolver;
	/**
	 * The depth of the sea's mixed layer, in metres: above 0 and finite.
	 * Defaults to the depth the temperature model's `oceanHeatCapacity` is
	 * reckoned at.
	 */
	readonly mixedLayerDepthM?: number;
};

/**
 * The depth of the mixed layer the temperature model's `oceanHeatCapacity`
 * is reckoned at, in metres: 60 m.
 */
export const MIXED_LAYER_DEPTH_M =
	TEMPERATURE_MODEL.oceanHeatCapacity / SEA_WATER_HEAT_CAPACITY_J_M3_K;

/** The planet's radius in metres. */
const RADIUS_M = PLANET_RADIUS_KM * 1000;

/** What the divergence of the Ekman transport needs of a grid, built once. */
type Geometry = {
	/** Each cell's area, in square metres. */
	readonly areas: Float64Array;
	/** Each cell's latitude, in degrees. */
	readonly latitudes: Float64Array;
};

const GEOMETRIES = new WeakMap<Grid, Geometry>();

/** The cells' areas and latitudes of a grid. */
const geometryOf = (grid: Grid): Geometry => {
	const held = GEOMETRIES.get(grid);
	if (held !== undefined) {
		return held;
	}
	const { cellCount, centres } = grid;
	const areas = Float64Array.from(
		grid.areas,
		(area) => area * RADIUS_M * RADIUS_M,
	);
	const latitudes = Float64Array.from(
		{ length: cellCount },
		(_, cell) =>
			(Math.asin(Math.max(-1, Math.min(1, centres[3 * cell + 2] as number))) *
				180) /
			Math.PI,
	);
	const geometry = { areas, latitudes };
	GEOMETRIES.set(grid, geometry);
	return geometry;
};

/** Throws unless the upwelling's settings and the mixed layer are in range. */
const assertSettings = (
	settings: UpwellingSettings,
	mixedLayerDepthM: number,
): void => {
	const { upwellingEquatorDeg, deepSeaC } = settings;
	if (!(upwellingEquatorDeg >= 0 && upwellingEquatorDeg <= 90)) {
		throw new RangeError(
			`The upwelling's upwellingEquatorDeg must be from 0° to 90°; got ${upwellingEquatorDeg}`,
		);
	}
	if (!Number.isFinite(deepSeaC)) {
		throw new RangeError(
			`The upwelling's deepSeaC must be finite; got ${deepSeaC}`,
		);
	}
	const positive: [string, number][] = [
		['upwellingSourceDepthM', settings.upwellingSourceDepthM],
		['thermoclineScaleM', settings.thermoclineScaleM],
		['mixedLayerDepthM', mixedLayerDepthM],
	];
	for (const [name, value] of positive) {
		if (!(value > 0 && Number.isFinite(value))) {
			throw new RangeError(
				`The upwelling's ${name} must be positive and finite; got ${value}`,
			);
		}
	}
};

/**
 * How much colder than the sea the water welling up is, as a share of the
 * sea's excess over the deep sea's temperature: `1 − exp(−(D − H) / h)`,
 * and 0 for water that rises from within the mixed layer.
 */
export const upwellingContrast = (
	settings: UpwellingSettings,
	mixedLayerDepthM: number = MIXED_LAYER_DEPTH_M,
): number => {
	assertSettings(settings, mixedLayerDepthM);
	const below = settings.upwellingSourceDepthM - mixedLayerDepthM;
	return below > 0 ? 1 - Math.exp(-below / settings.thermoclineScaleM) : 0;
};

/**
 * A world's upwelling through its year, from its winds: where and how fast
 * the water wells up into the sea's mixed layer, and the rate at which it
 * cools it.
 *
 * @remarks
 * See the head of this module. Worked out on the world's own grid, in one
 * pass over its cells for each month, after the Ekman transport; the
 * climate loop gives it the world on the grid the temperature is solved
 * on, with the winds on that grid, as it gives the gyres.
 *
 * @param world - The world, whose land is the cells above its sea level.
 * Not changed.
 * @param winds - Twelve months of the surface wind at each cell's centre,
 * eastward and northward, in metres a second. Not changed.
 * @param options - The settings, a gyres' solver built already, and the
 * mixed layer's depth.
 * @returns New arrays.
 * @throws RangeError if the winds are not twelve months of finite values of
 * the right length, a setting or the mixed layer's depth is out of range,
 * or the solver given was built for another grid, another land or another
 * rotation rate.
 */
export const upwelling = (
	world: World,
	winds: MonthlyWind,
	options: UpwellingOptions = {},
): Upwelling => {
	const settings =
		options.solver?.settings ?? options.settings ?? DEFAULT_GYRE_SETTINGS;
	const mixedLayerDepthM = options.mixedLayerDepthM ?? MIXED_LAYER_DEPTH_M;
	const contrast = upwellingContrast(settings, mixedLayerDepthM);
	const grid = getGrid(world.resolution);
	const { cellCount, neighbours } = grid;
	const ekman = ekmanTransport(world, winds, {
		settings,
		solver: options.solver,
	});
	const { driven } = ekman;
	const { areas, latitudes } = geometryOf(grid);
	// The cells that may well up: the sea the wind drives beside a coast, or
	// within the band of the equator.
	const open = new Uint8Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		if (driven[cell] === 0) {
			continue;
		}
		let coast = false;
		for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
			if (driven[neighbours[NEIGHBOUR_COUNT * cell + side] as number] === 0) {
				coast = true;
			}
		}
		open[cell] =
			coast ||
			Math.abs(latitudes[cell] as number) < settings.upwellingEquatorDeg
				? 1
				: 0;
	}
	const vectors = createVectorField(grid);
	const flows = new Float64Array(NEIGHBOUR_COUNT * cellCount);
	const velocity: Float32Array[] = [];
	const rates: Float32Array[] = [];
	const heat = SEA_WATER_HEAT_CAPACITY_J_M3_K * contrast;
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		// What the transport carries across each edge, in cubic metres a
		// second: across the edge's great-circle normal times its length.
		edgeFlows(
			grid,
			fromEastNorth(
				grid,
				{
					east: ekman.east[month] as Float32Array,
					north: ekman.north[month] as Float32Array,
				},
				vectors,
			),
			RADIUS_M,
			flows,
		);
		const speed = new Float32Array(cellCount);
		const rate = new Float32Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			if (open[cell] === 0) {
				continue;
			}
			let leaving = 0;
			for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
				const entry = NEIGHBOUR_COUNT * cell + side;
				if (driven[neighbours[entry] as number] === 1) {
					leaving += flows[entry] as number;
				}
			}
			const w = leaving / (areas[cell] as number);
			if (w > 0) {
				speed[cell] = w;
				rate[cell] = heat * w;
			}
		}
		velocity.push(speed);
		rates.push(rate);
	}
	return { velocity, rates, deepC: settings.deepSeaC, contrast };
};
