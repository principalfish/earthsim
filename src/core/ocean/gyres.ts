/**
 * The wind-driven gyres: the currents the winds drive round each ocean
 * basin, month by month.
 *
 * The wind pushes on the sea with a stress `τ = ρ_air C_d |U| U`, a bulk
 * drag on the surface wind `U`. The sea's transport, summed through the
 * depth of the wind-driven flow, has a streamfunction `ψ` in cubic metres a
 * second, and Stommel's balance between the wind's twist, friction and the
 * change of the Coriolis parameter with latitude sets it:
 *
 * `r ∇²ψ + β ∂ψ/∂x = curl τ / ρ`
 *
 * with `r` a friction rate, `β = 2Ω cos φ / R`, `ρ` the sea water's density
 * and `x` eastward. Its answer is the Sverdrup flow across each basin's
 * interior, returned in a western boundary current about `r / β` wide: the
 * Gulf Stream, the Kuroshio and their kind. It is solved on the grid's
 * corners by {@link createCornerSolver}, and the transport across every
 * edge is the difference of `ψ` at the edge's two corners, so the flows
 * carry nothing net in or out of any cell, and nothing across a coast,
 * along which `ψ` is one value.
 *
 * The coasts come from {@link findBasins}: each piece of sea has one coast
 * held at zero, and every other coast it touches is an island whose value
 * the solve finds from the circulation round it: the equation summed over
 * the island's corners holds as it does over the sea, so that round the
 * island the wind's push is balanced by friction, the island rule of a
 * frictional gyre. A land that reaches round the globe, as Antarctica
 * does, is an island too, and the transport through the channel beside it,
 * the circumpolar current, follows from the same rule. Along a circle of
 * latitude that crosses no land the flow round the globe is held back by
 * friction alone, so the transport there goes as the wind's push over the
 * friction and would grow without bound as the gyres' friction is lowered;
 * those corners, and the corners of a coast that reaches every longitude,
 * take the channel's own friction instead,
 * {@link GyreSettings.channelFrictionPerS}, which stands for the pressure on
 * the sea floor's ridges that holds the observed current back.
 *
 * The wind's curl at a corner is its circulation round the centres of the
 * cells that meet there, the stress along each side the mean of the two
 * cells' it joins, over the corner's area. Summed over any set of corners
 * the circulations telescope to the one round the set's rim, so an
 * island's summed forcing is the wind's circulation round it.
 *
 * The wind's push also drives the Ekman transport, `τ × ẑ / (ρ f)`, to the
 * right of the wind in the north and to the left in the south, which piles
 * water up and draws it down and so has no streamfunction. It is returned
 * apart from the gyres, with `|f|` held at no less than its value
 * {@link GyreSettings.equatorFloorDeg} from the equator, where `f` passes
 * through zero. It is zero over land and over the seas held still within
 * islands, as their gyres are; a planet with no land, whose gyres are held
 * still for want of a coast, keeps its Ekman transport.
 *
 * The flows across the edges and the surface current at the cells' centres
 * are the transport spread over the depth of the wind-driven layer,
 * {@link GyreSettings.layerDepthM}: the flows in square metres a second,
 * laid out as {@link edgeFlows} lays out the wind's, and the current in
 * metres a second.
 *
 * On the Earth, on the development machine, in Node, at the default
 * tolerance, a month takes one to three iterations: about 14 to 25 ms on
 * the 64 grid, 50 to 70 ms on the 128 and 175 to 265 ms on the 256,
 * started from the month before or from the last solve's answer for winds
 * a few percent different. Building the solver takes about 0.25, 0.65 and
 * 2 s, once for a world's land, and {@link solveGyres} keeps the last one
 * built for each grid.
 */

import { constantsOf, OCEAN_CONFIG, type ValuesOf, valuesOf } from '../config';
import {
	type CornerSolver,
	cornerAreas,
	cornerIndex,
	createCornerSolver,
	edgeFlowsFromCorners,
} from '../grid/corners';
import { type Grid, getGrid, NEIGHBOUR_COUNT } from '../grid/grid';
import {
	cellFrames,
	createVectorField,
	type VectorField,
} from '../grid/vector';
import { MONTHS_PER_YEAR } from '../planet/insolation';
import { rotationRate } from '../planet/planet';
import type { MonthlyWind } from '../wind/observedWind';
import { AIR_DENSITY_KG_M3 } from '../wind/rules';
import { PLANET_RADIUS_KM, type World } from '../world/world';
import { type Basins, findBasins } from './basins';

/** The number of sides of every cell. */
const SIDES = NEIGHBOUR_COUNT;

/** The planet's radius in metres. */
const RADIUS_M = PLANET_RADIUS_KM * 1000;

/** The settings of the gyres: see {@link OCEAN_CONFIG}. */
export type GyreSettings = ValuesOf<typeof OCEAN_CONFIG>;

/**
 * The gyres' settings as they run by default, written down in
 * {@link OCEAN_CONFIG} with where each comes from.
 */
export const DEFAULT_GYRE_SETTINGS: GyreSettings = valuesOf(OCEAN_CONFIG);

/** The density of sea water, in kilograms a cubic metre: see {@link OCEAN_CONFIG}. */
export const SEA_WATER_DENSITY_KG_M3 =
	constantsOf(OCEAN_CONFIG).seaWaterDensityKgM3;

/**
 * The gyres' solver for one world's land and one set of settings, built
 * once and used for any number of months' winds.
 */
export type GyreSolver = {
	/** The grid of the world it was built for. */
	readonly grid: Grid;
	/** The seas and coasts it solves between. */
	readonly basins: Basins;
	/** The settings it was built with. */
	readonly settings: GyreSettings;
	/** The planet's rotation rate it was built for, in radians a second. */
	readonly rotationRate: number;
	/** The solver of Stommel's equation on the grid's corners. */
	readonly corners: CornerSolver;
	/** Every corner of an island, in increasing order. */
	readonly netCorners: Int32Array;
	/**
	 * For each of {@link GyreSolver.netCorners}, its coast, counting from 0
	 * as {@link Basins.coasts} does.
	 */
	readonly netCoasts: Int32Array;
	/**
	 * Which of the world's cells were land when it was built, one per cell:
	 * 1 above the sea level, 0 at or below it.
	 */
	readonly worldLand: Uint8Array;
};

/** Twelve months of gyres on a world's grid, from {@link solveGyres}. */
export type GyreResult = {
	/**
	 * The flow across every edge of every cell, January to December, in
	 * square metres a second: the transport over
	 * {@link GyreSettings.layerDepthM}, laid out as {@link edgeFlows} lays
	 * out the wind's. Each cell's four sum to zero to rounding, and an edge
	 * beside land carries exactly nothing.
	 */
	readonly flows: readonly Float64Array[];
	/**
	 * The eastward surface current at each cell's centre, January to
	 * December, in metres a second; zero over land.
	 */
	readonly east: readonly Float32Array[];
	/** The northward surface current, in the same way. */
	readonly north: readonly Float32Array[];
	/**
	 * The eastward Ekman transport at each cell's centre, January to
	 * December, in square metres a second, with the Coriolis parameter
	 * floored near the equator; zero over land, over the seas held still
	 * within islands, and on the equator itself.
	 */
	readonly ekmanEast: readonly Float32Array[];
	/** The northward Ekman transport, in the same way. */
	readonly ekmanNorth: readonly Float32Array[];
	/**
	 * The transport's streamfunction `ψ` at every corner, January to
	 * December, in cubic metres a second: the flows times the layer's depth
	 * are its differences. Each month's may be given back as the next
	 * solve's guess.
	 */
	readonly streamfunction: readonly Float64Array[];
	/** The iterations each month's solve took. */
	readonly iterations: readonly number[];
};

/** How {@link solveGyres} is run. */
export type SolveGyresOptions = {
	/**
	 * The settings; {@link DEFAULT_GYRE_SETTINGS} when left out. Ignored
	 * when a solver is given, which carries its own.
	 */
	readonly settings?: GyreSettings;
	/**
	 * A solver built by {@link createGyreSolver} for the world as it is now.
	 * When left out, the solver last built for the world's grid is used if it
	 * was built for the same land, settings and rotation, and a new one is
	 * built and kept otherwise.
	 */
	readonly solver?: GyreSolver;
	/**
	 * A first guess at each month's streamfunction, twelve arrays of one
	 * value per corner, such as the last solve's
	 * {@link GyreResult.streamfunction}. When left out, each month starts
	 * from the month before's answer, and January from zero.
	 */
	readonly guess?: readonly ArrayLike<number>[];
};

/** What the gyres need of each cell, edge and corner of a grid, built once. */
type Geometry = {
	/**
	 * For every cell's four corners, in the order of
	 * {@link CornerIndex.cellCorners}, the weights of their values in the
	 * least-squares slope eastward across the cell, per metre.
	 */
	readonly slopeEast: Float64Array;
	/** The same, northward. */
	readonly slopeNorth: Float64Array;
	/**
	 * For every edge, as an entry `4c + k`, the chord from cell `c`'s centre
	 * to its neighbour's across side `k`, in metres: x, y and z at
	 * `3(4c + k)`.
	 */
	readonly chords: Float64Array;
	/** For every corner, its area in square metres. */
	readonly areas: Float64Array;
	/**
	 * For every corner, the area the circulation round it is taken over, in
	 * square metres: its own area, but at the eight cube corners, where three
	 * cells meet and their centres make a triangle of about half the three
	 * quarter cells, that triangle's.
	 */
	readonly circuits: Float64Array;
};

const GEOMETRIES = new WeakMap<Grid, Geometry>();

/** The cells' slopes and chords and the corners' areas of a grid. */
const geometryOf = (grid: Grid): Geometry => {
	const held = GEOMETRIES.get(grid);
	if (held !== undefined) {
		return held;
	}
	const { cellCount, centres, neighbours } = grid;
	const { cellCorners, directions } = cornerIndex(grid);
	const frames = cellFrames(grid);
	const slopeEast = new Float64Array(SIDES * cellCount);
	const slopeNorth = new Float64Array(SIDES * cellCount);
	const chords = new Float64Array(3 * SIDES * cellCount);
	const east = new Float64Array(SIDES);
	const north = new Float64Array(SIDES);
	for (let cell = 0; cell < cellCount; cell++) {
		const ex = frames.east.x[cell] as number;
		const ey = frames.east.y[cell] as number;
		const nx = frames.north.x[cell] as number;
		const ny = frames.north.y[cell] as number;
		const nz = frames.north.z[cell] as number;
		const cx = centres[3 * cell] as number;
		const cy = centres[3 * cell + 1] as number;
		const cz = centres[3 * cell + 2] as number;
		let meanEast = 0;
		let meanNorth = 0;
		for (let k = 0; k < SIDES; k++) {
			const p = cellCorners[SIDES * cell + k] as number;
			const dx = (directions[3 * p] as number) - cx;
			const dy = (directions[3 * p + 1] as number) - cy;
			const dz = (directions[3 * p + 2] as number) - cz;
			east[k] = (dx * ex + dy * ey) * RADIUS_M;
			north[k] = (dx * nx + dy * ny + dz * nz) * RADIUS_M;
			meanEast += east[k] as number;
			meanNorth += north[k] as number;
		}
		let ee = 0;
		let en = 0;
		let nn = 0;
		for (let k = 0; k < SIDES; k++) {
			const e = (east[k] as number) - meanEast / SIDES;
			const n = (north[k] as number) - meanNorth / SIDES;
			east[k] = e;
			north[k] = n;
			ee += e * e;
			en += e * n;
			nn += n * n;
		}
		// The slope (g_e, g_n) that best fits the four values solves
		// [ee en; en nn] g = Σ (e_k, n_k) ψ_k.
		const determinant = ee * nn - en * en;
		for (let k = 0; k < SIDES; k++) {
			const e = east[k] as number;
			const n = north[k] as number;
			slopeEast[SIDES * cell + k] = (nn * e - en * n) / determinant;
			slopeNorth[SIDES * cell + k] = (ee * n - en * e) / determinant;
			const other = neighbours[SIDES * cell + k] as number;
			for (let axis = 0; axis < 3; axis++) {
				chords[3 * (SIDES * cell + k) + axis] =
					((centres[3 * other + axis] as number) -
						(centres[3 * cell + axis] as number)) *
					RADIUS_M;
			}
		}
	}
	const areas = Float64Array.from(
		cornerAreas(grid),
		(area) => area * RADIUS_M * RADIUS_M,
	);
	const circuits = new Float64Array(areas);
	const { cornerCells } = cornerIndex(grid);
	for (let p = 0; p < circuits.length; p++) {
		if ((cornerCells[4 * p + 3] as number) < 0) {
			const [a, b, c] = [0, 1, 2].map((slot) => {
				const cell = cornerCells[4 * p + slot] as number;
				return [0, 1, 2].map((axis) => centres[3 * cell + axis] as number);
			}) as [number[], number[], number[]];
			const u = [0, 1, 2].map(
				(axis) => (b[axis] as number) - (a[axis] as number),
			);
			const v = [0, 1, 2].map(
				(axis) => (c[axis] as number) - (a[axis] as number),
			);
			const cross = Math.hypot(
				(u[1] as number) * (v[2] as number) -
					(u[2] as number) * (v[1] as number),
				(u[2] as number) * (v[0] as number) -
					(u[0] as number) * (v[2] as number),
				(u[0] as number) * (v[1] as number) -
					(u[1] as number) * (v[0] as number),
			);
			circuits[p] = 0.5 * cross * RADIUS_M * RADIUS_M;
		}
	}
	const geometry = { slopeEast, slopeNorth, chords, areas, circuits };
	GEOMETRIES.set(grid, geometry);
	return geometry;
};

/** Throws unless every setting is in range. */
const assertSettings = (settings: GyreSettings): void => {
	const positive = [
		'frictionPerS',
		'channelFrictionPerS',
		'layerDepthM',
		'gyreTolerance',
	] as const;
	for (const name of positive) {
		const value = settings[name];
		if (!(value > 0 && Number.isFinite(value))) {
			throw new RangeError(
				`The gyres' ${name} must be positive and finite; got ${value}`,
			);
		}
	}
	const { dragCoefficient, equatorFloorDeg, maxIslands } = settings;
	if (!(dragCoefficient >= 0 && Number.isFinite(dragCoefficient))) {
		throw new RangeError(
			`The gyres' dragCoefficient must be finite and not negative; got ${dragCoefficient}`,
		);
	}
	if (!(equatorFloorDeg > 0 && equatorFloorDeg < 90)) {
		throw new RangeError(
			`The gyres' equatorFloorDeg must be above 0° and below 90°; got ${equatorFloorDeg}`,
		);
	}
	if (!(Number.isInteger(maxIslands) && maxIslands >= 0)) {
		throw new RangeError(
			`The gyres' maxIslands must be a whole number from 0; got ${maxIslands}`,
		);
	}
};

/** Which of a world's cells are land: above its sea level. */
const landOf = (world: World): Uint8Array => {
	const land = new Uint8Array(world.elevation.length);
	for (let cell = 0; cell < land.length; cell++) {
		land[cell] = (world.elevation[cell] as number) > world.seaLevel ? 1 : 0;
	}
	return land;
};

/** Whether two arrays hold the same values. */
const sameValues = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) {
		return false;
	}
	for (let k = 0; k < a.length; k++) {
		if (a[k] !== b[k]) {
			return false;
		}
	}
	return true;
};

/** Whether two sets of settings hold the same values. */
const sameSettings = (a: GyreSettings, b: GyreSettings): boolean =>
	(Object.keys(a) as (keyof GyreSettings)[]).every((key) => a[key] === b[key]);

/**
 * The gyres' solver for a world's land: its basins found, and Stommel's
 * operator built on its grid's corners, with the friction and `β` of the
 * world's planet.
 *
 * @remarks
 * Building it costs about what a few months' solves do; it is then used for
 * every month of every pass, and must be built again only when the land,
 * the sea level, the day length or the settings change.
 *
 * @param world - The world. Not changed, and not kept.
 * @param settings - The settings; {@link DEFAULT_GYRE_SETTINGS} when left
 * out.
 * @throws RangeError if a setting is out of range.
 */
export const createGyreSolver = (
	world: World,
	settings: GyreSettings = DEFAULT_GYRE_SETTINGS,
): GyreSolver => {
	assertSettings(settings);
	const grid = getGrid(world.resolution);
	const worldLand = landOf(world);
	const basins = findBasins(grid, worldLand, {
		maxIslands: settings.maxIslands,
	});
	const index = cornerIndex(grid);
	const { cornerCount, directions } = index;
	const omega = rotationRate(world.planet);
	const beta = new Float64Array(cornerCount);
	for (let p = 0; p < cornerCount; p++) {
		const z = directions[3 * p + 2] as number;
		beta[p] = (2 * omega * Math.sqrt(Math.max(0, 1 - z * z))) / RADIUS_M;
	}
	// A sea with no coast is held still by holding every corner as one coast.
	const noCoast = basins.coasts.length === 0;
	const friction = new Float64Array(cornerCount);
	for (let p = 0; p < cornerCount; p++) {
		friction[p] =
			basins.channel[p] === 1
				? settings.channelFrictionPerS
				: settings.frictionPerS;
	}
	const corners = createCornerSolver(grid, {
		diffusion: friction,
		eastward: beta,
		labels: noCoast ? new Int32Array(cornerCount).fill(1) : basins.labels,
		coasts: noCoast ? ['value'] : basins.coasts,
		radius: RADIUS_M,
	});
	const onIslands: number[] = [];
	for (let p = 0; p < cornerCount; p++) {
		const label = basins.labels[p] as number;
		if (label !== 0 && basins.coasts[label - 1] === 'net') {
			onIslands.push(p);
		}
	}
	const netCorners = Int32Array.from(onIslands);
	const netCoasts = netCorners.map((p) => (basins.labels[p] as number) - 1);
	return {
		grid,
		basins,
		settings,
		rotationRate: omega,
		corners,
		netCorners,
		netCoasts,
		worldLand,
	};
};

/** The solver last built for each grid, kept for the next solve. */
const KEPT = new Map<number, GyreSolver>();

/** The solver kept for a world and settings, or a new one, then kept. */
const keptSolver = (world: World, settings: GyreSettings): GyreSolver => {
	const held = KEPT.get(world.resolution);
	if (
		held !== undefined &&
		held.rotationRate === rotationRate(world.planet) &&
		sameSettings(held.settings, settings) &&
		sameValues(held.worldLand, landOf(world))
	) {
		return held;
	}
	const made = createGyreSolver(world, settings);
	KEPT.set(world.resolution, made);
	return made;
};

/** Throws unless a field holds `length` finite values. */
const assertField = (
	values: ArrayLike<number>,
	length: number,
	what: string,
	when: string,
): void => {
	if (values.length !== length) {
		throw new RangeError(
			`The ${what}${when} must hold ${length} values; got ${values.length}`,
		);
	}
	for (let k = 0; k < length; k++) {
		if (!Number.isFinite(values[k])) {
			throw new RangeError(
				`The ${what}${when} must be finite; entry ${k} is ${values[k]}`,
			);
		}
	}
};

/** Throws unless there are twelve months of `length` finite values. */
const assertMonths = (
	months: readonly ArrayLike<number>[],
	length: number,
	what: string,
): void => {
	if (months.length !== MONTHS_PER_YEAR) {
		throw new RangeError(
			`The ${what} must be ${MONTHS_PER_YEAR} months; got ${months.length}`,
		);
	}
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		assertField(
			months[month] as ArrayLike<number>,
			length,
			what,
			` for month ${month + 1}`,
		);
	}
};

/**
 * Writes the wind's stress at each cell, as a vector, and the forcing of
 * Stommel's equation at each corner, the stress's curl over the sea water's
 * density: the circulation of the stress round the centres of the cells
 * that meet at the corner over the corner's area.
 */
const writeForcing = (
	grid: Grid,
	windEast: ArrayLike<number>,
	windNorth: ArrayLike<number>,
	drag: number,
	stress: VectorField,
	forcing: Float64Array,
): void => {
	const { cellCount, neighbours } = grid;
	const { edgeCorners, cornerCount } = cornerIndex(grid);
	const { chords, circuits } = geometryOf(grid);
	const frames = cellFrames(grid);
	const eastX = frames.east.x;
	const eastY = frames.east.y;
	const northX = frames.north.x;
	const northY = frames.north.y;
	const northZ = frames.north.z;
	const stressX = stress.x;
	const stressY = stress.y;
	const stressZ = stress.z;
	for (let cell = 0; cell < cellCount; cell++) {
		const u = windEast[cell] as number;
		const v = windNorth[cell] as number;
		const push = drag * Math.sqrt(u * u + v * v);
		const te = push * u;
		const tn = push * v;
		stressX[cell] =
			te * (eastX[cell] as number) + tn * (northX[cell] as number);
		stressY[cell] =
			te * (eastY[cell] as number) + tn * (northY[cell] as number);
		stressZ[cell] = tn * (northZ[cell] as number);
	}
	// Across side k of cell c the chord from c's centre to its neighbour's
	// runs anticlockwise round the edge's second corner and clockwise round
	// its first. Each edge is met from both its cells, so each takes half.
	forcing.fill(0);
	for (let entry = 0; entry < SIDES * cellCount; entry++) {
		const cell = (entry / SIDES) | 0;
		const other = neighbours[entry] as number;
		const along =
			0.25 *
			(((stressX[cell] as number) + (stressX[other] as number)) *
				(chords[3 * entry] as number) +
				((stressY[cell] as number) + (stressY[other] as number)) *
					(chords[3 * entry + 1] as number) +
				((stressZ[cell] as number) + (stressZ[other] as number)) *
					(chords[3 * entry + 2] as number));
		const first = edgeCorners[2 * entry] as number;
		const second = edgeCorners[2 * entry + 1] as number;
		forcing[second] = (forcing[second] as number) + along;
		forcing[first] = (forcing[first] as number) - along;
	}
	const rho = SEA_WATER_DENSITY_KG_M3;
	for (let p = 0; p < cornerCount; p++) {
		forcing[p] = (forcing[p] as number) / ((circuits[p] as number) * rho);
	}
};

/**
 * The forcing of the gyres by one month's wind: the curl of the wind's
 * stress on the sea over the sea water's density, at every corner, in
 * metres a second squared.
 *
 * @remarks
 * The stress is `ρ_air C_d |U| U` at each cell's centre; its curl at a
 * corner is its circulation round the centres of the cells that meet there,
 * the stress along each side the mean of its two cells', over the corner's
 * area. Summed over a set of corners times their areas it is the
 * circulation round the set's rim.
 *
 * @param grid - The grid.
 * @param east - The eastward wind at each cell's centre, in metres a
 * second; finite. Not changed.
 * @param north - The northward wind, in the same way.
 * @param dragCoefficient - The drag coefficient; that of
 * {@link DEFAULT_GYRE_SETTINGS} when left out.
 * @returns A new array, one value per corner.
 * @throws RangeError if a wind has the wrong length or a value that is not
 * finite.
 */
export const gyreForcing = (
	grid: Grid,
	east: ArrayLike<number>,
	north: ArrayLike<number>,
	dragCoefficient: number = DEFAULT_GYRE_SETTINGS.dragCoefficient,
): Float64Array => {
	assertField(east, grid.cellCount, 'eastward wind', '');
	assertField(north, grid.cellCount, 'northward wind', '');
	const forcing = new Float64Array(cornerIndex(grid).cornerCount);
	writeForcing(
		grid,
		east,
		north,
		AIR_DENSITY_KG_M3 * dragCoefficient,
		createVectorField(grid),
		forcing,
	);
	return forcing;
};

/**
 * The wind-driven gyres of a world through its year, one solve for each
 * month's wind.
 *
 * @remarks
 * See the head of this module. The gyres are solved on the world's own
 * grid; a world that is solved on a coarser grid, as the temperature of a
 * world of 256 is (see `solveResolution`), has its gyres solved on that
 * grid's world and winds, so that the flows are those of the coasts the
 * heat is carried between.
 *
 * @param world - The world, whose land is the cells above its sea level.
 * Not changed.
 * @param winds - Twelve months of the surface wind at each cell's centre,
 * eastward and northward, in metres a second: the wind model's, or the
 * observed Earth's. Not changed.
 * @param options - The settings, a solver built already, and a first guess.
 * @returns New arrays of the flows, the surface current, the Ekman
 * transport and the streamfunction, for each month.
 * @throws RangeError if the winds or the guess are not twelve months of
 * finite values of the right length, a setting is out of range, or the
 * solver given was built for another grid, another land or another
 * rotation rate.
 * @throws Error if a month's solve does not converge.
 */
export const solveGyres = (
	world: World,
	winds: MonthlyWind,
	options: SolveGyresOptions = {},
): GyreResult => {
	const grid = getGrid(world.resolution);
	const { cellCount } = grid;
	assertMonths(winds.east, cellCount, 'eastward winds');
	assertMonths(winds.north, cellCount, 'northward winds');
	const gyres =
		options.solver ??
		keptSolver(world, options.settings ?? DEFAULT_GYRE_SETTINGS);
	if (gyres.grid !== grid || !sameValues(gyres.worldLand, landOf(world))) {
		throw new RangeError(
			"The gyres' solver was built for another grid or another land",
		);
	}
	if (gyres.rotationRate !== rotationRate(world.planet)) {
		throw new RangeError(
			`The gyres' solver was built for a rotation rate of ${gyres.rotationRate} rad/s; the world's planet turns at ${rotationRate(world.planet)} rad/s`,
		);
	}
	const index = cornerIndex(grid);
	const { cornerCount, cellCorners } = index;
	if (options.guess !== undefined) {
		assertMonths(options.guess, cornerCount, 'guesses at the streamfunction');
	}
	const { basins, settings, corners, netCorners, netCoasts } = gyres;
	const { slopeEast, slopeNorth, areas } = geometryOf(grid);
	const { centres } = grid;
	const flowedOver = basins.flowedOver;
	const rho = SEA_WATER_DENSITY_KG_M3;
	const drag = AIR_DENSITY_KG_M3 * settings.dragCoefficient;
	const twiceOmega = 2 * gyres.rotationRate;
	const floor =
		twiceOmega * Math.sin((settings.equatorFloorDeg * Math.PI) / 180);
	const depth = settings.layerDepthM;
	const noCoast = basins.coasts.length === 0;
	// The sea the wind drives an Ekman transport in: not the world's land,
	// and not the seas held still, but all of a planet with no land.
	const driven = new Uint8Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		driven[cell] =
			gyres.worldLand[cell] === 0 && (noCoast || basins.land[cell] === 0)
				? 1
				: 0;
	}

	const stress = {
		x: new Float64Array(cellCount),
		y: new Float64Array(cellCount),
		z: new Float64Array(cellCount),
	};
	const forcing = new Float64Array(cornerCount);
	const coastValues = new Float64Array(Math.max(1, basins.coasts.length));
	const layer = new Float64Array(cornerCount);
	const flows: Float64Array[] = [];
	const east: Float32Array[] = [];
	const north: Float32Array[] = [];
	const ekmanEast: Float32Array[] = [];
	const ekmanNorth: Float32Array[] = [];
	const streamfunction: Float64Array[] = [];
	const iterations: number[] = [];
	let previous: ArrayLike<number> | undefined;
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const windEast = winds.east[month] as ArrayLike<number>;
		const windNorth = winds.north[month] as ArrayLike<number>;
		const pushEast = new Float32Array(cellCount);
		const pushNorth = new Float32Array(cellCount);
		writeForcing(grid, windEast, windNorth, drag, stress, forcing);
		for (let cell = 0; cell < cellCount; cell++) {
			if (driven[cell] === 1) {
				const f = twiceOmega * (centres[3 * cell + 2] as number);
				if (f !== 0) {
					const u = windEast[cell] as number;
					const v = windNorth[cell] as number;
					const push = drag * Math.sqrt(u * u + v * v);
					const floored = f > 0 ? Math.max(f, floor) : Math.min(f, -floor);
					pushEast[cell] = (push * v) / (rho * floored);
					pushNorth[cell] = -(push * u) / (rho * floored);
				}
			}
		}
		// Each island's condition: the wind's circulation round it, as a sum
		// over its corners of the forcing times their areas on the unit
		// sphere, as the corner solver sums the operator.
		coastValues.fill(0);
		for (let k = 0; k < netCorners.length; k++) {
			const p = netCorners[k] as number;
			const coast = netCoasts[k] as number;
			coastValues[coast] =
				(coastValues[coast] as number) +
				((areas[p] as number) / (RADIUS_M * RADIUS_M)) * (forcing[p] as number);
		}
		const solved = noCoast
			? {
					values: new Float64Array(cornerCount),
					iterations: 0,
					converged: true,
				}
			: corners.solve(forcing, coastValues, {
					tolerance: settings.gyreTolerance,
					guess: options.guess?.[month] ?? previous,
				});
		if (!solved.converged) {
			throw new Error(
				`The gyres for month ${month + 1} did not converge in ${solved.iterations} iterations`,
			);
		}
		const psi = solved.values;
		for (const island of flowedOver) {
			let sum = 0;
			for (const p of island) {
				sum += psi[p] as number;
			}
			const mean = sum / island.length;
			for (const p of island) {
				psi[p] = mean;
			}
		}
		previous = psi;
		for (let p = 0; p < cornerCount; p++) {
			layer[p] = (psi[p] as number) / depth;
		}
		const currentEast = new Float32Array(cellCount);
		const currentNorth = new Float32Array(cellCount);
		// The current is r̂ × ∇ψ over the depth: eastward −∂ψ/∂y, northward
		// ∂ψ/∂x.
		for (let cell = 0; cell < cellCount; cell++) {
			// The weights sum to zero, so each value is taken from the first
			// corner's, which leaves a cell whose corners agree exactly still.
			const base = layer[cellCorners[SIDES * cell] as number] as number;
			let slopeE = 0;
			let slopeN = 0;
			for (let k = 1; k < SIDES; k++) {
				const at = SIDES * cell + k;
				const value = (layer[cellCorners[at] as number] as number) - base;
				slopeE += (slopeEast[at] as number) * value;
				slopeN += (slopeNorth[at] as number) * value;
			}
			currentEast[cell] = 0 - slopeN;
			currentNorth[cell] = 0 + slopeE;
		}
		flows.push(edgeFlowsFromCorners(grid, layer));
		east.push(currentEast);
		north.push(currentNorth);
		ekmanEast.push(pushEast);
		ekmanNorth.push(pushNorth);
		streamfunction.push(psi);
		iterations.push(solved.iterations);
	}
	return {
		flows,
		east,
		north,
		ekmanEast,
		ekmanNorth,
		streamfunction,
		iterations,
	};
};
