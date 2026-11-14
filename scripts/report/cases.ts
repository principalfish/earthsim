/**
 * The worlds the wind report runs every model on: the Earth, the Earth
 * with one planet setting changed, and four invented worlds.
 */

import {
	BLANK_OCEAN_ELEVATION_M,
	createBlankWorld,
	DEFAULT_PLANET,
	directionToLatLon,
	type EarthData,
	earthWorld,
	generateWorld,
	getGrid,
	normalisePlanet,
	type PlanetSettings,
	type Resolution,
	type World,
} from '../../src/core/index';

/** The grid every case is worked out on. */
export const CASE_RESOLUTION: Resolution = 64;

/** The seed of the generated world. */
export const GENERATED_SEED = 20_261_111;

/** The share of the generated world's surface asked to be land. */
export const GENERATED_LAND_FRACTION = 0.3;

/** The latitude of the one continent's middle, in degrees north. */
export const CONTINENT_MIDDLE_LATITUDE = 20;

/** The longitude of the one continent's middle, in degrees east. */
export const CONTINENT_MIDDLE_LONGITUDE = 0;

/**
 * How far the one continent reaches north and south of its middle, in
 * degrees of latitude: from 15° south to 55° north.
 */
export const CONTINENT_HALF_HEIGHT_DEG = 35;

/**
 * How far the one continent reaches east and west of its middle at its
 * middle latitude, in degrees of longitude. With
 * {@link CONTINENT_HALF_HEIGHT_DEG} and {@link CONTINENT_ROUNDNESS} it
 * makes the continent 20% of the surface.
 */
export const CONTINENT_HALF_WIDTH_DEG = 71.6;

/**
 * The power of the one continent's outline: 2 would be an ellipse in
 * latitude and longitude; 4 squares it off, keeping the corners round.
 */
export const CONTINENT_ROUNDNESS = 4;

/** The height of the one continent's land, in metres: a flat plain. */
export const CONTINENT_ELEVATION_M = 500;

/**
 * The steep tilt of two cases, in degrees: the Earth's and an ocean
 * world's. It lies between the 54° and the 90° of the ocean planets of
 * Ferreira, Marshall, O'Gorman and Seager, "Climate at high-obliquity"
 * (Icarus, 2014), which the report sets these cases beside.
 */
export const STEEP_TILT_DEG = 60;

/** The depth of the invented worlds' ocean, as the descriptions give it. */
const OCEAN_DEPTH = (-BLANK_OCEAN_ELEVATION_M).toLocaleString('en-GB');

/** A world the report shows, and how to build it. */
export type ReportCase = {
	/**
	 * A name for the case, unique among them, from lower-case letters,
	 * digits and hyphens.
	 */
	readonly id: string;
	/** The case's name, for headings. */
	readonly title: string;
	/** What sets the case apart, as a sentence. */
	readonly description: string;
	/**
	 * Whether the terrain is not the Earth's, so that its coast is worth
	 * showing on its own.
	 */
	readonly invented: boolean;
	/**
	 * Builds the world afresh, on the {@link CASE_RESOLUTION} grid.
	 *
	 * @param earth - The Earth's elevation, for the cases built from it.
	 * Not changed.
	 */
	readonly build: (earth: EarthData) => World;
};

/**
 * Whether a latitude and longitude lie on the one continent: within the
 * curve `|Δφ / h|^p + |Δλ / w|^p = 1` around its middle, where `Δφ` and
 * `Δλ` are the degrees of latitude and longitude from the middle (the
 * longitude taken the short way round), `h` is
 * {@link CONTINENT_HALF_HEIGHT_DEG}, `w` is {@link CONTINENT_HALF_WIDTH_DEG}
 * and `p` is {@link CONTINENT_ROUNDNESS}.
 */
export const onContinent = (latitude: number, longitude: number): boolean => {
	const across =
		((((longitude - CONTINENT_MIDDLE_LONGITUDE) % 360) + 540) % 360) - 180;
	return (
		Math.abs(
			(latitude - CONTINENT_MIDDLE_LATITUDE) / CONTINENT_HALF_HEIGHT_DEG,
		) **
			CONTINENT_ROUNDNESS +
			Math.abs(across / CONTINENT_HALF_WIDTH_DEG) ** CONTINENT_ROUNDNESS <=
		1
	);
};

/**
 * A world of ocean with one continent: every cell whose centre lies
 * {@link onContinent} is a plain at {@link CONTINENT_ELEVATION_M}, the rest
 * ocean floor at {@link BLANK_OCEAN_ELEVATION_M}, with the Earth's planet
 * settings.
 *
 * @param resolution - Cells along a face edge. Defaults to
 * {@link CASE_RESOLUTION}.
 * @returns A new world, whose origin is a blank one: it is a blank world
 * with its terrain set.
 */
export const oneContinentWorld = (
	resolution: Resolution = CASE_RESOLUTION,
): World => {
	const world = createBlankWorld(resolution);
	const { centres, cellCount } = getGrid(resolution);
	for (let cell = 0; cell < cellCount; cell++) {
		const { latitudeDeg, longitudeDeg } = directionToLatLon([
			centres[3 * cell] as number,
			centres[3 * cell + 1] as number,
			centres[3 * cell + 2] as number,
		]);
		if (onContinent(latitudeDeg, longitudeDeg)) {
			world.elevation[cell] = CONTINENT_ELEVATION_M;
		}
	}
	return world;
};

/** The Earth with some of its planet settings changed. */
const earthWith = (
	earth: EarthData,
	settings: Partial<PlanetSettings>,
): World => {
	const world = earthWorld(earth, CASE_RESOLUTION);
	world.planet = normalisePlanet({ ...DEFAULT_PLANET, ...settings });
	return world;
};

/** A world with no land, tilted {@link STEEP_TILT_DEG}. */
const steepOceanWorld = (): World => {
	const world = createBlankWorld(CASE_RESOLUTION);
	world.planet = normalisePlanet({
		...DEFAULT_PLANET,
		axialTiltDeg: STEEP_TILT_DEG,
	});
	return world;
};

/** Every case, the Earth first. */
export const cases: readonly ReportCase[] = [
	{
		id: 'earth',
		title: 'The Earth',
		description: 'The Earth as it is: its terrain and its planet settings.',
		invented: false,
		build: (earth) => earthWorld(earth, CASE_RESOLUTION),
	},
	{
		id: 'earth-day-8h',
		title: 'The Earth with an 8-hour day',
		description: 'The Earth turning three times as fast.',
		invented: false,
		build: (earth) => earthWith(earth, { dayLengthHours: 8 }),
	},
	{
		id: 'earth-day-96h',
		title: 'The Earth with a 4-day day',
		description: 'The Earth turning once in 96 hours, a quarter as fast.',
		invented: false,
		build: (earth) => earthWith(earth, { dayLengthHours: 96 }),
	},
	{
		id: 'earth-tilt-0',
		title: 'The Earth with no tilt',
		description: 'The Earth with its axis upright: no seasons.',
		invented: false,
		build: (earth) => earthWith(earth, { axialTiltDeg: 0 }),
	},
	{
		id: 'earth-tilt-60',
		title: `The Earth tilted ${STEEP_TILT_DEG}°`,
		description: `The Earth with its axis tilted ${STEEP_TILT_DEG}°: the sun overhead as far as ${STEEP_TILT_DEG}° from the equator.`,
		invented: false,
		build: (earth) => earthWith(earth, { axialTiltDeg: STEEP_TILT_DEG }),
	},
	{
		id: 'ocean-tilt-60',
		title: `An ocean world tilted ${STEEP_TILT_DEG}°`,
		description: `No land at all: ocean ${OCEAN_DEPTH} m deep everywhere, with its axis tilted ${STEEP_TILT_DEG}° and the Earth’s other planet settings.`,
		invented: true,
		build: steepOceanWorld,
	},
	{
		id: 'generated',
		title: 'A generated world',
		description: `Continents from the seed ${GENERATED_SEED}, ${GENERATED_LAND_FRACTION * 100}% of the surface land, with the Earth’s planet settings.`,
		invented: true,
		build: () =>
			generateWorld({
				resolution: CASE_RESOLUTION,
				seed: GENERATED_SEED,
				landFraction: GENERATED_LAND_FRACTION,
			}),
	},
	{
		id: 'ocean',
		title: 'An ocean world',
		description: `No land at all: ocean ${OCEAN_DEPTH} m deep everywhere, with the Earth’s planet settings.`,
		invented: true,
		build: () => createBlankWorld(CASE_RESOLUTION),
	},
	{
		id: 'one-continent',
		title: 'A one-continent world',
		description: `One flat continent ${CONTINENT_ELEVATION_M} m high, a fifth of the surface, from 15°S to 55°N and ${2 * CONTINENT_HALF_WIDTH_DEG}° of longitude across at ${CONTINENT_MIDDLE_LATITUDE}°N, its corners rounded, in an ocean ${OCEAN_DEPTH} m deep, with the Earth’s planet settings.`,
		invented: true,
		build: () => oneContinentWorld(),
	},
];

/**
 * The share of a world's surface that is land, by area: the cells above
 * its sea level.
 */
export const landShare = (world: World): number => {
	const { areas, cellCount } = getGrid(world.resolution);
	let land = 0;
	let total = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		total += areas[cell] as number;
		if ((world.elevation[cell] as number) > world.seaLevel) {
			land += areas[cell] as number;
		}
	}
	return land / total;
};
