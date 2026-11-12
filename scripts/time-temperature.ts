/**
 * Measures how long the temperature solver takes, and how far its Earth is
 * from the observed one.
 *
 * Run with `npm run time:temperature`. It prints Markdown tables:
 *
 * - solve times at every resolution for the Earth preset and a generated
 *   world, from nothing and carrying on from the converged answer's end
 *   state after two small edits (a patch of land raised by 500 m, and the
 *   sea level raised by 10 m), with the years each solve ran and whether it
 *   converged;
 * - the simulated Earth against the observed temperature at every
 *   resolution: the area-weighted mean and root-mean-square difference for
 *   each month and for the annual mean, the global and tropical means, the
 *   mean by bands of latitude, July less January by hemisphere over land
 *   and ocean, and the bands and months with the largest errors.
 *
 * One solve is run first and not timed, so that the times do not include
 * the JavaScript engine's warming up. The output depends on the machine
 * only in its times.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
	cellLatitudes,
	cellsWithin,
	clampElevation,
	compareFields,
	decodeEarth,
	decodeObservedTemperature,
	earthWorld,
	generateWorld,
	getGrid,
	latLonToDirection,
	MONTHS_PER_YEAR,
	normaliseSeaLevel,
	observedTemperature,
	SUPPORTED_RESOLUTIONS,
	solveTemperature,
	summariseTemperature,
	type TemperatureResult,
	type World,
} from '../src/core/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EARTH_FILE = join(ROOT, 'public', 'data', 'earth-256.bin');
const OBSERVED_FILE = join(
	ROOT,
	'public',
	'data',
	'earth-temperature-1deg.bin',
);

/** The generated world timed beside the Earth. */
const GENERATED_SEED = 20_261_111;
const GENERATED_LAND_FRACTION = 0.3;

/** The terrain edit: a patch of this radius raised by this much. */
const EDIT_RADIUS_DEG = 2.5;
const EDIT_RAISE_M = 500;
/** Where the Earth's patch is raised: the Tibetan Plateau's edge. */
const EARTH_EDIT_LATITUDE = 35;
const EARTH_EDIT_LONGITUDE = 100;

/** The sea-level edit, in metres. */
const SEA_LEVEL_RISE_M = 10;

/** The bounds of the tropics, in degrees either side of the equator. */
const TROPICS_DEG = 20;

/** The width of a band of latitude, in degrees. */
const BAND_DEG = 10;

/** How many of the largest errors by band and month are listed. */
const LARGEST_ERRORS = 5;

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

const JANUARY = 0;
const JULY = 6;

declare const performance: { now(): number };

const say = (text = ''): void => {
	stdout.write(`${text}\n`);
};

/** A Markdown table, with the minimal separator line. */
const table = (
	header: readonly string[],
	rows: readonly (readonly string[])[],
): void => {
	say(`| ${header.join(' | ')} |`);
	say(`|${header.map(() => '-').join('|')}|`);
	for (const row of rows) {
		say(`| ${row.join(' | ')} |`);
	}
	say();
};

const fixed = (value: number, digits = 1): string => value.toFixed(digits);

const signed = (value: number, digits = 1): string =>
	`${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

/** A solve and how long it took, in seconds. */
const timed = (
	world: World,
	start?: TemperatureResult,
): { readonly result: TemperatureResult; readonly seconds: number } => {
	const began = performance.now();
	const result = solveTemperature(world, start === undefined ? {} : { start });
	return { result, seconds: (performance.now() - began) / 1000 };
};

/** A copy of a world with its own elevation array. */
const copyWorld = (world: World): World => ({
	...world,
	elevation: Float32Array.from(world.elevation),
});

/** The world with a patch raised around a point. */
const raisedPatch = (
	world: World,
	latitudeDeg: number,
	longitudeDeg: number,
): World => {
	const edited = copyWorld(world);
	const cells = cellsWithin(
		getGrid(world.resolution),
		latLonToDirection(latitudeDeg, longitudeDeg),
		(EDIT_RADIUS_DEG * Math.PI) / 180,
	);
	for (const cell of cells) {
		edited.elevation[cell] = clampElevation(
			(edited.elevation[cell] as number) + EDIT_RAISE_M,
		);
	}
	return edited;
};

/** The latitude and longitude of a world's highest cell. */
const highestPoint = (
	world: World,
): { readonly latitude: number; readonly longitude: number } => {
	const grid = getGrid(world.resolution);
	let highest = 0;
	for (let cell = 1; cell < grid.cellCount; cell++) {
		if (
			(world.elevation[cell] as number) > (world.elevation[highest] as number)
		) {
			highest = cell;
		}
	}
	const [x, y, z] = [
		grid.centres[3 * highest] as number,
		grid.centres[3 * highest + 1] as number,
		grid.centres[3 * highest + 2] as number,
	];
	return {
		latitude: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
		longitude: (Math.atan2(y, x) * 180) / Math.PI,
	};
};

type Timing = {
	readonly world: string;
	readonly resolution: number;
	readonly start: string;
	readonly seconds: number;
	readonly result: TemperatureResult;
};

/** Times a world from nothing and after each edit. */
const timeWorld = (
	name: string,
	world: World,
	edit: { readonly latitude: number; readonly longitude: number },
	timings: Timing[],
): TemperatureResult => {
	const cold = timed(world);
	timings.push({
		world: name,
		resolution: world.resolution,
		start: 'cold',
		...cold,
	});
	const raised = timed(
		raisedPatch(world, edit.latitude, edit.longitude),
		cold.result,
	);
	timings.push({
		world: name,
		resolution: world.resolution,
		start: `warm, ${EDIT_RADIUS_DEG * 2}° patch raised ${EDIT_RAISE_M} m`,
		...raised,
	});
	const flooded = copyWorld(world);
	flooded.seaLevel = normaliseSeaLevel(world.seaLevel + SEA_LEVEL_RISE_M);
	const risen = timed(flooded, cold.result);
	timings.push({
		world: name,
		resolution: world.resolution,
		start: `warm, sea level ${SEA_LEVEL_RISE_M} m higher`,
		...risen,
	});
	return cold.result;
};

/** Area-weighted means over the cells a test picks, one per field. */
const meanWhere = (
	world: World,
	field: ArrayLike<number>,
	picks: (cell: number) => boolean,
): number => {
	const { areas, cellCount } = getGrid(world.resolution);
	let total = 0;
	let area = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		if (picks(cell)) {
			total += (areas[cell] as number) * (field[cell] as number);
			area += areas[cell] as number;
		}
	}
	return total / area;
};

const bandsOf = (): readonly number[] => {
	const bands: number[] = [];
	for (let south = -90; south < 90; south += BAND_DEG) {
		bands.push(south);
	}
	return bands;
};

const bandName = (south: number): string => {
	const name = (latitude: number): string =>
		latitude === 0 ? '0°' : `${Math.abs(latitude)}°${latitude > 0 ? 'N' : 'S'}`;
	return `${name(south)} to ${name(south + BAND_DEG)}`;
};

type EarthFigures = {
	readonly world: World;
	readonly simulated: readonly Float32Array[];
	readonly observed: readonly Float32Array[];
};

const reportErrors = (figures: readonly EarthFigures[]): void => {
	say('## Simulated Earth against observed');
	say();
	say(
		'Simulated less observed, in kelvin, weighted by area. The annual row compares the annual means (the mean of the twelve months, cell by cell).',
	);
	say();
	const comparisons = figures.map(({ world, simulated, observed }) =>
		compareFields(simulated, observed, getGrid(world.resolution)),
	);
	const header = ['Month'];
	for (const { world } of figures) {
		header.push(`${world.resolution} mean`, `${world.resolution} RMS`);
	}
	const rows = MONTH_NAMES.map((name, month) => [
		name,
		...comparisons.flatMap((comparison) => {
			const { meanDifference, rmsDifference } = comparison.months[
				month
			] as (typeof comparison.months)[number];
			return [signed(meanDifference, 2), fixed(rmsDifference, 2)];
		}),
	]);
	rows.push([
		'Annual mean',
		...comparisons.flatMap(({ annual }) => [
			signed(annual.meanDifference, 2),
			fixed(annual.rmsDifference, 2),
		]),
	]);
	table(header, rows);

	const summaries = figures.map(({ world, simulated, observed }) => ({
		world,
		latitudes: cellLatitudes(getGrid(world.resolution)),
		simulated: summariseTemperature(simulated),
		observed: summariseTemperature(observed),
		land: (cell: number): boolean =>
			(world.elevation[cell] as number) > world.seaLevel,
	}));
	const pair = (simulated: number, observed: number): string =>
		`${fixed(simulated)} / ${fixed(observed)}`;
	const perResolution = (): string[] =>
		summaries.map(({ world }) => `${world.resolution}: simulated / observed`);

	say('### Global and tropical annual means, °C');
	say();
	table(
		['Region', ...perResolution()],
		[
			[
				'Globe',
				...summaries.map(({ world, simulated, observed }) =>
					pair(
						meanWhere(world, simulated.annualMean, () => true),
						meanWhere(world, observed.annualMean, () => true),
					),
				),
			],
			[
				`Tropics (within ${TROPICS_DEG}° of the equator)`,
				...summaries.map(({ world, simulated, observed, latitudes }) => {
					const tropical = (cell: number): boolean =>
						Math.abs(latitudes[cell] as number) < TROPICS_DEG;
					return pair(
						meanWhere(world, simulated.annualMean, tropical),
						meanWhere(world, observed.annualMean, tropical),
					);
				}),
			],
		],
	);

	say(`### Annual mean by ${BAND_DEG}° band of latitude, °C`);
	say();
	table(
		['Band', ...perResolution()],
		bandsOf()
			.slice()
			.reverse()
			.map((south) => [
				bandName(south),
				...summaries.map(({ world, simulated, observed, latitudes }) => {
					const inBand = (cell: number): boolean => {
						const latitude = latitudes[cell] as number;
						return latitude >= south && latitude < south + BAND_DEG;
					};
					return pair(
						meanWhere(world, simulated.annualMean, inBand),
						meanWhere(world, observed.annualMean, inBand),
					);
				}),
			]),
	);

	say('### July less January by hemisphere, K');
	say();
	const julyLessJanuary = (
		world: World,
		months: readonly Float32Array[],
		picks: (cell: number) => boolean,
	): number =>
		meanWhere(world, months[JULY] as Float32Array, picks) -
		meanWhere(world, months[JANUARY] as Float32Array, picks);
	const hemispheres = [
		{ name: 'Northern', north: true },
		{ name: 'Southern', north: false },
	];
	const surfaces = [
		{ name: 'land', land: true },
		{ name: 'ocean', land: false },
	];
	const seasonRows: string[][] = [];
	for (const hemisphere of hemispheres) {
		for (const surface of surfaces) {
			seasonRows.push([
				`${hemisphere.name} ${surface.name}`,
				...summaries.map(({ world, latitudes, land }, index) => {
					const picks = (cell: number): boolean =>
						(latitudes[cell] as number) > 0 === hemisphere.north &&
						land(cell) === surface.land;
					const { simulated, observed } = figures[index] as EarthFigures;
					return `${signed(julyLessJanuary(world, simulated, picks))} / ${signed(julyLessJanuary(world, observed, picks))}`;
				}),
			]);
		}
	}
	table(['Region', ...perResolution()], seasonRows);

	say(
		`### The ${LARGEST_ERRORS} bands and months with the largest errors in the band mean, K`,
	);
	say();
	for (const [index, { world, latitudes }] of summaries.entries()) {
		const { simulated, observed } = figures[index] as EarthFigures;
		const errors: { band: number; month: number; error: number }[] = [];
		for (const south of bandsOf()) {
			const inBand = (cell: number): boolean => {
				const latitude = latitudes[cell] as number;
				return latitude >= south && latitude < south + BAND_DEG;
			};
			for (let month = 0; month < MONTHS_PER_YEAR; month++) {
				errors.push({
					band: south,
					month,
					error:
						meanWhere(world, simulated[month] as Float32Array, inBand) -
						meanWhere(world, observed[month] as Float32Array, inBand),
				});
			}
		}
		errors.sort((a, b) => Math.abs(b.error) - Math.abs(a.error));
		say(`At ${world.resolution}:`);
		say();
		table(
			['Band', 'Month', 'Simulated less observed'],
			errors
				.slice(0, LARGEST_ERRORS)
				.map(({ band, month, error }) => [
					bandName(band),
					MONTH_NAMES[month] as string,
					signed(error),
				]),
		);
	}
};

/**
 * Prints the solve times and the Earth's error figures.
 *
 * @param args - Not used; there are no options.
 */
export const main = (args: readonly string[]): void => {
	if (args.length > 0) {
		throw new Error(`Unknown option ${args.join(' ')}: there are no options`);
	}
	const earth = decodeEarth(new Uint8Array(readFileSync(EARTH_FILE)));
	const observedData = decodeObservedTemperature(
		new Uint8Array(readFileSync(OBSERVED_FILE)),
	);

	// Warm-up, not timed.
	solveTemperature(earthWorld(earth, SUPPORTED_RESOLUTIONS[0]));

	const timings: Timing[] = [];
	const figures: EarthFigures[] = [];
	for (const resolution of SUPPORTED_RESOLUTIONS) {
		const world = earthWorld(earth, resolution);
		const simulated = timeWorld(
			'Earth',
			world,
			{ latitude: EARTH_EDIT_LATITUDE, longitude: EARTH_EDIT_LONGITUDE },
			timings,
		);
		figures.push({
			world,
			simulated: simulated.months,
			observed: observedTemperature(observedData, resolution),
		});
	}
	for (const resolution of SUPPORTED_RESOLUTIONS) {
		const world = generateWorld({
			resolution,
			seed: GENERATED_SEED,
			landFraction: GENERATED_LAND_FRACTION,
		});
		timeWorld(
			`Generated (seed ${GENERATED_SEED}, ${GENERATED_LAND_FRACTION * 100}% land)`,
			world,
			highestPoint(world),
			timings,
		);
	}

	say('## Solve times');
	say();
	say(
		'Warm starts carry on from the end state of the cold solve for the world before the edit, which is how the page is to use it: `solveTemperature(edited, { start: result })`. The patch is raised around the Tibetan Plateau’s edge on the Earth and around the highest point on the generated world.',
	);
	say();
	table(
		[
			'World',
			'Cells per face edge',
			'Start',
			'Seconds',
			'Years run',
			'Converged',
		],
		timings.map(({ world, resolution, start, seconds, result }) => [
			world,
			String(resolution),
			start,
			fixed(seconds, 2),
			String(result.yearsRun),
			result.converged ? 'yes' : `no (${fixed(result.finalChangeK, 3)} K)`,
		]),
	);
	reportErrors(figures);
};
