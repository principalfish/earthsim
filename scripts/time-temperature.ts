/**
 * Measures how long the temperature solver takes, and how far its Earth is
 * from the observed one.
 *
 * Run with `npm run time:temperature`. It prints Markdown tables:
 *
 * - solve times at every resolution for the Earth preset and a generated
 *   world, from nothing as the page solves it (on the grid a step coarser
 *   above 64 cells per face edge) and, above 64, on the world's own grid
 *   beside it, and started from the page's converged answer after two small
 *   edits (a patch of land raised by 500 m, which carries on from the
 *   answer's end state, and the sea level raised by 10 m, which sets the
 *   start aside and so is a solve from nothing), with the years each solve
 *   ran and whether it converged;
 * - above 64 cells per face edge, how far the page's solve lies from the
 *   one on the world's own grid: the area-weighted root-mean-square
 *   difference over every cell and month, and the worst cells, where they
 *   are, whether land or sea, their height and whether they lie within one
 *   coarse cell of a coast;
 * - the Earth at the coarsest resolution with its sea level taken 6,000 m
 *   down and back up in steps of 500 m, each solve started from the last
 *   result as the page starts it: at each level on the way up, the largest
 *   difference from a solve of that world from nothing, which is 0 when
 *   each start is set aside, as a change of sea level sets it;
 * - the simulated Earth, as the page solves it, against the observed
 *   temperature at every resolution: the area-weighted mean and
 *   root-mean-square difference for each month and for the annual mean, the
 *   global and tropical means, the mean by bands of latitude, July less
 *   January by hemisphere over land and ocean, and the bands and months with
 *   the largest errors.
 *
 * One solve is run first and not timed, so that the times do not include
 * the JavaScript engine's warming up. The output depends on the machine
 * only in its times.
 */

import { stdout } from 'node:process';
import {
	cellLatitudes,
	cellsWithin,
	clampElevation,
	compareFields,
	decodeEarth,
	decodeObservedTemperature,
	directionToLatLon,
	earthWorld,
	generateWorld,
	getGrid,
	latLonToDirection,
	MONTH_NAMES,
	MONTHS_PER_YEAR,
	normaliseSeaLevel,
	observedTemperature,
	SUPPORTED_RESOLUTIONS,
	solveResolution,
	solveTemperature,
	summariseTemperature,
	type TemperatureResult,
	type World,
} from '../src/core/index';
import {
	readEarthDataFile,
	readObservedTemperatureFile,
} from './earth/dataFile.mjs';

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

/** How far the sea level goes down in the run down and back, in metres. */
const SEA_RUN_DEPTH_M = 6000;
/** The step of that run, in metres. */
const SEA_RUN_STEP_M = 500;

/** The bounds of the tropics, in degrees either side of the equator. */
const TROPICS_DEG = 20;

/** The width of a band of latitude, in degrees. */
const BAND_DEG = 10;

/** How many of the largest errors by band and month are listed. */
const LARGEST_ERRORS = 5;

/**
 * How many of the cells where the page's solve of the Earth lies furthest
 * from the full one are listed.
 */
const WORST_CELLS = 10;

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
	options: { readonly start?: TemperatureResult; readonly full?: boolean } = {},
): { readonly result: TemperatureResult; readonly seconds: number } => {
	const began = performance.now();
	const result = solveTemperature(world, {
		...(options.start === undefined ? {} : { start: options.start }),
		...(options.full === true ? { fullResolution: true } : {}),
	});
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
	const { latitudeDeg, longitudeDeg } = directionToLatLon([
		grid.centres[3 * highest] as number,
		grid.centres[3 * highest + 1] as number,
		grid.centres[3 * highest + 2] as number,
	]);
	return { latitude: latitudeDeg, longitude: longitudeDeg };
};

type Timing = {
	readonly world: string;
	readonly resolution: number;
	/** The cells along a face edge of the grid the solve was worked out on. */
	readonly solvedOn: number;
	readonly start: string;
	readonly seconds: number;
	readonly result: TemperatureResult;
};

/** A world's page solve from nothing, and its full solve where it has one. */
type ColdSolves = {
	readonly name: string;
	readonly world: World;
	readonly page: TemperatureResult;
	/** On the world's own grid; left out at 64, where it is the page's. */
	readonly full?: TemperatureResult;
};

/**
 * Times a world from nothing, as the page solves it and, above 64 cells per
 * face edge, on its own grid, and after each edit from the page's answer.
 */
const timeWorld = (
	name: string,
	world: World,
	edit: { readonly latitude: number; readonly longitude: number },
	timings: Timing[],
): ColdSolves => {
	const pageGrid = solveResolution(world.resolution);
	const row = (start: string, solvedOn: number) => ({
		world: name,
		resolution: world.resolution,
		solvedOn,
		start,
	});
	const cold = timed(world);
	timings.push({ ...row('cold', pageGrid), ...cold });
	let full: TemperatureResult | undefined;
	if (pageGrid !== world.resolution) {
		const fullCold = timed(world, { full: true });
		timings.push({
			...row('cold, on the world’s own grid', world.resolution),
			...fullCold,
		});
		full = fullCold.result;
	}
	const raised = timed(raisedPatch(world, edit.latitude, edit.longitude), {
		start: cold.result,
	});
	timings.push({
		...row(
			`warm, ${EDIT_RADIUS_DEG * 2}° patch raised ${EDIT_RAISE_M} m`,
			pageGrid,
		),
		...raised,
	});
	const flooded = copyWorld(world);
	flooded.seaLevel = normaliseSeaLevel(world.seaLevel + SEA_LEVEL_RISE_M);
	const risen = timed(flooded, { start: cold.result });
	timings.push({
		...row(`sea level ${SEA_LEVEL_RISE_M} m higher, start set aside`, pageGrid),
		...risen,
	});
	return {
		name,
		world,
		page: cold.result,
		...(full === undefined ? {} : { full }),
	};
};

/** One cell where the page's solve and the full one differ. */
type CellDifference = {
	readonly cell: number;
	/** The page's less the full, in kelvin, in the month it is largest. */
	readonly differenceK: number;
	readonly month: number;
};

/** How far the page's solve of a world lies from its full solve. */
type CoarseAgainstFull = {
	/** Area-weighted root-mean-square over every cell and month, kelvin. */
	readonly rmsK: number;
	/** Every cell, the largest difference first. */
	readonly cells: readonly CellDifference[];
};

/** Compares the page's solve of a world with its full solve. */
const coarseAgainstFull = (
	world: World,
	page: TemperatureResult,
	full: TemperatureResult,
): CoarseAgainstFull => {
	const { areas, cellCount } = getGrid(world.resolution);
	let squares = 0;
	let area = 0;
	const cells: CellDifference[] = [];
	for (let cell = 0; cell < cellCount; cell++) {
		let worst: CellDifference = { cell, differenceK: 0, month: 0 };
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const difference =
				((page.months[month] as Float32Array)[cell] as number) -
				((full.months[month] as Float32Array)[cell] as number);
			squares += (areas[cell] as number) * difference * difference;
			area += areas[cell] as number;
			if (Math.abs(difference) > Math.abs(worst.differenceK)) {
				worst = { cell, differenceK: difference, month };
			}
		}
		cells.push(worst);
	}
	cells.sort((a, b) => Math.abs(b.differenceK) - Math.abs(a.differenceK));
	return { rmsK: Math.sqrt(squares / area), cells };
};

/**
 * Where a cell is and what it stands on: its latitude and longitude, land
 * or sea and its height, and whether a cell of the other kind lies within
 * the width of one cell of the grid the world is solved on.
 */
const describeCell = (world: World, cell: number): string[] => {
	const grid = getGrid(world.resolution);
	const direction = [
		grid.centres[3 * cell] as number,
		grid.centres[3 * cell + 1] as number,
		grid.centres[3 * cell + 2] as number,
	] as const;
	const { latitudeDeg, longitudeDeg } = directionToLatLon(direction);
	const isLand = (index: number): boolean =>
		(world.elevation[index] as number) > world.seaLevel;
	const land = isLand(cell);
	const coarseWidth = getGrid(solveResolution(world.resolution)).cellWidth;
	const nearCoast = cellsWithin(grid, direction, coarseWidth).some(
		(other) => isLand(other) !== land,
	);
	return [
		`${fixed(Math.abs(latitudeDeg))}°${latitudeDeg >= 0 ? 'N' : 'S'}`,
		`${fixed(Math.abs(longitudeDeg))}°${longitudeDeg >= 0 ? 'E' : 'W'}`,
		land ? 'land' : 'sea',
		String(Math.round(world.elevation[cell] as number)),
		nearCoast ? 'yes' : 'no',
	];
};

const reportCoarseAgainstFull = (solves: readonly ColdSolves[]): void => {
	say('## The page’s solve against the full one');
	say();
	say(
		'Above 64 cells per face edge the page solves a world on the grid a step coarser and carries the sea-level temperatures back to the world’s grid, each cell then cooled by its own height. Here that is compared with the solve on the world’s own grid: the page’s less the full, in kelvin, as the root-mean-square over every cell and month weighted by area, and the cell and month where it is largest. Its height is in metres against the datum; “near a coast” means a cell of the other kind, land or sea, lies within one coarse cell’s width.',
	);
	say();
	const compared = solves.flatMap((solve) =>
		solve.full === undefined
			? []
			: [
					{
						...solve,
						against: coarseAgainstFull(solve.world, solve.page, solve.full),
					},
				],
	);
	table(
		[
			'World',
			'Cells per face edge',
			'RMS, K',
			'Worst, K',
			'Month',
			'Latitude',
			'Longitude',
			'Land or sea',
			'Height, m',
			'Near a coast',
		],
		compared.map(({ name, world, against }) => {
			const worst = against.cells[0] as CellDifference;
			return [
				name,
				String(world.resolution),
				fixed(against.rmsK, 3),
				signed(worst.differenceK, 2),
				MONTH_NAMES[worst.month] as string,
				...describeCell(world, worst.cell),
			];
		}),
	);
	for (const { name, world, against } of compared) {
		if (world.origin.kind !== 'earth') {
			continue;
		}
		say(
			`The ${WORST_CELLS} worst cells of the ${name} at ${world.resolution}:`,
		);
		say();
		table(
			[
				'Difference, K',
				'Month',
				'Latitude',
				'Longitude',
				'Land or sea',
				'Height, m',
				'Near a coast',
			],
			against.cells
				.slice(0, WORST_CELLS)
				.map(({ cell, differenceK, month }) => [
					signed(differenceK, 2),
					MONTH_NAMES[month] as string,
					...describeCell(world, cell),
				]),
		);
	}
};

/** The largest difference between two sets of monthly fields, in kelvin. */
const largestDifference = (
	a: readonly Float32Array[],
	b: readonly Float32Array[],
): number => {
	let largest = 0;
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const first = a[month] as Float32Array;
		const second = b[month] as Float32Array;
		for (let cell = 0; cell < first.length; cell++) {
			largest = Math.max(
				largest,
				Math.abs((first[cell] as number) - (second[cell] as number)),
			);
		}
	}
	return largest;
};

/** One level of the sea level's run back up. */
type SeaLevelStep = {
	readonly seaLevel: number;
	readonly warm: TemperatureResult;
	readonly cold: TemperatureResult;
	readonly meanC: number;
};

/**
 * Takes a world's sea level down by {@link SEA_RUN_DEPTH_M} and back in
 * steps of {@link SEA_RUN_STEP_M}, each solve started from the last result,
 * and solves each level on the way back up from nothing as well. Every step
 * changes the sea level, so every start is set aside and the two solves at
 * a level are the same, bit for bit.
 *
 * @returns Each level on the way back up, from one step above the lowest to
 * the world's own, with both solves there and the started one's global
 * annual mean.
 */
const runSeaLevel = (world: World): SeaLevelStep[] => {
	const atSeaLevel = (seaLevel: number): World => ({
		...world,
		seaLevel: normaliseSeaLevel(seaLevel),
	});
	let previous = solveTemperature(world);
	for (
		let drop = SEA_RUN_STEP_M;
		drop <= SEA_RUN_DEPTH_M;
		drop += SEA_RUN_STEP_M
	) {
		previous = solveTemperature(atSeaLevel(world.seaLevel - drop), {
			start: previous,
		});
	}
	const steps: SeaLevelStep[] = [];
	for (
		let drop = SEA_RUN_DEPTH_M - SEA_RUN_STEP_M;
		drop >= 0;
		drop -= SEA_RUN_STEP_M
	) {
		const level = atSeaLevel(world.seaLevel - drop);
		const warm = solveTemperature(level, { start: previous });
		const cold = solveTemperature(level);
		steps.push({
			seaLevel: level.seaLevel,
			warm,
			cold,
			meanC: meanWhere(
				level,
				summariseTemperature(warm.months).annualMean,
				() => true,
			),
		});
		previous = warm;
	}
	return steps;
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
		'Simulated less observed, in kelvin, weighted by area, the simulated Earth as the page solves it. The annual row compares the annual means (the mean of the twelve months, cell by cell).',
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
	const earth = decodeEarth(readEarthDataFile());
	const observedData = decodeObservedTemperature(readObservedTemperatureFile());

	// Warm-up, not timed.
	solveTemperature(earthWorld(earth, SUPPORTED_RESOLUTIONS[0]));

	const timings: Timing[] = [];
	const figures: EarthFigures[] = [];
	const solves: ColdSolves[] = [];
	for (const resolution of SUPPORTED_RESOLUTIONS) {
		const world = earthWorld(earth, resolution);
		const cold = timeWorld(
			'Earth',
			world,
			{ latitude: EARTH_EDIT_LATITUDE, longitude: EARTH_EDIT_LONGITUDE },
			timings,
		);
		solves.push(cold);
		figures.push({
			world,
			simulated: cold.page.months,
			observed: observedTemperature(observedData, resolution),
		});
	}
	for (const resolution of SUPPORTED_RESOLUTIONS) {
		const world = generateWorld({
			resolution,
			seed: GENERATED_SEED,
			landFraction: GENERATED_LAND_FRACTION,
		});
		solves.push(
			timeWorld(
				`Generated (seed ${GENERATED_SEED}, ${GENERATED_LAND_FRACTION * 100}% land)`,
				world,
				highestPoint(world),
				timings,
			),
		);
	}

	const seaRun = runSeaLevel(earthWorld(earth, SUPPORTED_RESOLUTIONS[0]));

	say('## Solve times');
	say();
	say(
		'Each world is solved from nothing as the page solves it, on the grid a step coarser above 64 cells per face edge, and above 64 on the world’s own grid as well, for comparison. Each edited world starts from the page’s cold solve for the world before the edit, which is how the page uses it: `solveTemperature(edited, { start: result })`. The raised patch carries on from that result’s end state; the change of sea level sets the start aside, so its solve is one from nothing. The patch is raised around the Tibetan Plateau’s edge on the Earth and around the highest point on the generated world.',
	);
	say();
	table(
		[
			'World',
			'Cells per face edge',
			'Solved on',
			'Start',
			'Seconds',
			'Years run',
			'Converged',
		],
		timings.map(({ world, resolution, solvedOn, start, seconds, result }) => [
			world,
			String(resolution),
			String(solvedOn),
			start,
			fixed(seconds, 2),
			String(result.yearsRun),
			result.converged ? 'yes' : `no (${fixed(result.finalChangeK, 3)} K)`,
		]),
	);
	reportCoarseAgainstFull(solves);

	say('## Sea level down and back');
	say();
	say(
		`The Earth at ${SUPPORTED_RESOLUTIONS[0]} cells per face edge, its sea level taken ${SEA_RUN_DEPTH_M.toLocaleString('en-GB')} m down and back up in steps of ${SEA_RUN_STEP_M} m, each solve started from the last result. At each level on the way back up: the global annual mean, the years run, those a solve from nothing ran, and the largest difference from that solve in any month and cell. Every step changes the sea level, so a difference of 0 confirms that each start was set aside and the solve started from nothing.`,
	);
	say();
	table(
		[
			'Sea level, m',
			'Global mean, °C',
			'Years run',
			'Years from nothing',
			'Largest difference, K',
		],
		seaRun.map(({ seaLevel, warm, cold, meanC }) => [
			String(seaLevel),
			fixed(meanC),
			String(warm.yearsRun),
			String(cold.yearsRun),
			fixed(largestDifference(warm.months, cold.months), 3),
		]),
	);
	reportErrors(figures);
};
