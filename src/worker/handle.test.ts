import { describe, expect, it } from 'vitest';
import {
	computeTerrainStats,
	createBlankWorld,
	DEFAULT_MAX_YEARS,
	generateWorld,
	type SimPass,
	type SimProgress,
	type SimRequest,
	type SimResponse,
	solveClimate,
	TEMPERATURE_MODEL,
	temperatureConditions,
	type World,
} from '../core/index';
import { handleRequest } from './handle';

/** The response to a message, without its transfer list. */
const respond = (message: unknown): SimResponse =>
	handleRequest(message).response;

const generated = (seed = 1977, landFraction = 0.3): World =>
	generateWorld({ resolution: 64, seed, landFraction });

const statsRequest = (world: World, id = 1): SimRequest => ({
	id,
	kind: 'terrainStats',
	world,
});

describe('handleRequest', () => {
	it('returns the statistics the core computes directly', () => {
		const world = generated();
		world.seaLevel = 250;
		expect(respond(statsRequest(world, 7))).toEqual({
			id: 7,
			kind: 'terrainStats',
			ok: true,
			result: computeTerrainStats(world),
		});
	});

	it('returns the same statistics for a copy of the world, as a worker gets', () => {
		const world = generated(42, 0.55);
		const response = respond(structuredClone(statsRequest(world)));
		expect(response).toEqual({
			id: 1,
			kind: 'terrainStats',
			ok: true,
			result: computeTerrainStats(world),
		});
	});

	it('returns a response that survives a structured clone', () => {
		const response = respond(statsRequest(generated()));
		expect(structuredClone(response)).toEqual(response);
	});

	it('answers an unknown kind with a failure rather than throwing', () => {
		const world = createBlankWorld(64);
		expect(respond({ id: 3, kind: 'erosion', world })).toEqual({
			id: 3,
			kind: null,
			ok: false,
			error: 'Unknown request kind "erosion"',
		});
	});

	it('answers a message that is not a request with a failure', () => {
		for (const message of [undefined, null, 'terrainStats', 12, []]) {
			const response = respond(message);
			expect(response.ok).toBe(false);
			expect(response.id).toBeNull();
		}
		expect(respond({ id: 5, kind: 'terrainStats' })).toEqual({
			id: 5,
			kind: 'terrainStats',
			ok: false,
			error:
				'A terrainStats request needs a world with a resolution, a sea level, an origin, planet settings, a date and an elevation array',
		});
	});

	it('answers a world the core refuses with its reason and the id', () => {
		const world = createBlankWorld(64);
		const short = { ...world, elevation: new Float32Array(10) };
		expect(respond(statsRequest(short, 11))).toEqual({
			id: 11,
			kind: 'terrainStats',
			ok: false,
			error: 'A world of resolution 64 has 24576 cells; its elevation holds 10',
		});

		const drowned = { ...world, seaLevel: Number.NaN };
		const response = respond(statsRequest(drowned, 12));
		expect(response).toMatchObject({ id: 12, kind: 'terrainStats', ok: false });
		expect(response).toHaveProperty(
			'error',
			expect.stringContaining('A sea level must be from'),
		);

		const coarse = { ...world, resolution: 7 } as unknown as World;
		expect(respond(statsRequest(coarse, 13))).toMatchObject({
			id: 13,
			ok: false,
			error: expect.stringContaining('Unsupported grid resolution 7'),
		});

		world.elevation[100] = Number.POSITIVE_INFINITY;
		expect(respond(statsRequest(world, 14))).toMatchObject({
			id: 14,
			ok: false,
			error: expect.stringContaining('finite elevations'),
		});
	});

	it('answers a message that throws when read with a failure', () => {
		const hostile = {
			get id(): number {
				throw new Error('no id for you');
			},
			kind: 'terrainStats',
		};
		expect(respond(hostile)).toEqual({
			id: null,
			kind: null,
			ok: false,
			error: 'no id for you',
		});

		const rude = {
			id: 1,
			get kind(): string {
				throw 'not even an error';
			},
		};
		expect(respond(rude)).toEqual({
			id: null,
			kind: null,
			ok: false,
			error: 'not even an error',
		});
	});

	it('leaves the world it is given exactly as it was', () => {
		const world = generated();
		world.seaLevel = -120;
		const before = world.elevation.slice();
		const buffer = world.elevation.buffer;
		const request = Object.freeze(statsRequest(Object.freeze(world)));

		respond(request);
		respond({ ...request, kind: 'erosion' });

		expect(world.elevation).toEqual(before);
		expect(world.elevation.buffer).toBe(buffer);
		expect(world.elevation.byteLength).toBe(before.byteLength);
		expect(world.seaLevel).toBe(-120);
	});

	it('keeps nothing between requests', () => {
		const land = generated(1, 0.6);
		const sea = createBlankWorld(64);

		const first = respond(statsRequest(land, 1));
		const second = respond(statsRequest(sea, 2));
		const third = respond(statsRequest(land, 3));

		expect(second).toMatchObject({ id: 2, result: { landFraction: 0 } });
		expect(third).toEqual({ ...first, id: 3 });
	});
});

describe('handleRequest for statistics', () => {
	it('transfers nothing and tells of no progress', () => {
		const reports: SimProgress[] = [];
		const { response, transfer } = handleRequest(
			statsRequest(generated()),
			(progress) => reports.push(progress),
		);
		expect(response.ok).toBe(true);
		expect(transfer).toEqual([]);
		expect(reports).toEqual([]);
	});
});

/** A value worked out on first use and then shared. */
const shared = <T>(make: () => T): (() => T) => {
	let value: T | undefined;
	return () => {
		value ??= make();
		return value;
	};
};

/**
 * Time allowed for the tests that solve a climate: several seconds a run,
 * several times that under coverage instrumentation.
 */
const CLIMATE_SOLVE_TIMEOUT_MS = 300_000;

describe('handleRequest for climate', {
	timeout: CLIMATE_SOLVE_TIMEOUT_MS,
}, () => {
	// A blank ocean on the smallest grid: its climate settles in three
	// passes, at about half the cost of a generated world's, so it has
	// passes before the last, whose arrays are posted as copies, and a
	// settled result for a start to carry on from.
	const CLIMATE_WORLD = createBlankWorld(64);
	const climateRequest = (extras: Record<string, unknown> = {}) => ({
		id: 50,
		kind: 'climate',
		world: CLIMATE_WORLD,
		...extras,
	});

	/** What the core gives directly, which a post must not disturb. */
	const directClimate = shared(() => solveClimate(CLIMATE_WORLD));

	/**
	 * A climate request answered as the worker answers it: each pass posted
	 * with its transfer list, which empties the arrays it names, as soon as
	 * the loop finishes it, so that the loop must not need them again.
	 */
	const answered = shared(() => {
		const passes: SimPass[] = [];
		const transfers: ArrayBuffer[][] = [];
		const reports: SimProgress[] = [];
		const handledRun = handleRequest(
			climateRequest(),
			(progress) => reports.push(progress),
			(pass, transfer) => {
				transfers.push(transfer);
				passes.push(structuredClone(pass, { transfer }));
			},
		);
		return { ...handledRun, passes, transfers, reports };
	});

	it('answers with the day length, the passes, whether it settled and the last change the core gives, and nothing else', () => {
		const direct = directClimate();
		expect(answered().response).toEqual({
			id: 50,
			kind: 'climate',
			ok: true,
			result: {
				dayLengthHours: direct.dayLengthHours,
				passes: direct.passes,
				settled: direct.settled,
				changeC: direct.changeC,
			},
		});
		expect(answered().transfer).toEqual([]);
	});

	it('tells of each pass in order, with its temperature and winds, whatever posting the earlier passes did to the arrays the loop uses', () => {
		const { passes } = answered();
		const direct = directClimate();
		expect(passes).toHaveLength(direct.passes);
		expect(passes.map((message) => message.climatePass.pass)).toEqual(
			Array.from({ length: direct.passes }, (_, index) => index + 1),
		);
		for (const message of passes) {
			expect(message.id).toBe(50);
			expect(message.kind).toBe('climate');
		}
		const last = passes[passes.length - 1]?.climatePass;
		expect(last?.last).toBe(true);
		expect(last?.settled).toBe(direct.settled);
		expect(
			passes.slice(0, -1).every((message) => !message.climatePass.last),
		).toBe(true);
		// The loop went on from passes whose arrays had been posted: it
		// reached the core's answer, so it never read them emptied, and the
		// last pass's arrays, posted from the loop's own, are that answer.
		expect(last?.temperature.months).toEqual(direct.temperature.months);
		expect(last?.temperature.seaMonths).toEqual(direct.temperature.seaMonths);
		expect(last?.winds).toEqual(direct.winds);
		expect(last?.currents).toEqual(direct.currents);
		expect(last?.temperature.state).toEqual(direct.temperature.state);
		// An earlier pass's arrays arrived whole.
		const first = passes[0]?.climatePass;
		expect(first?.changeC).toBeNull();
		expect(first?.temperature.months.every((month) => month.length > 0)).toBe(
			true,
		);
		expect(
			first?.temperature.seaMonths.every((month) => month.length > 0),
		).toBe(true);
		expect(first?.temperature.state.seaTemperatureK.length).toBeGreaterThan(0);
		expect(first?.temperature.state.seaPreviousK.length).toBeGreaterThan(0);
		expect(first?.winds.pressure.every((month) => month.length > 0)).toBe(true);
		for (const field of [
			'flows',
			'east',
			'north',
			'ekmanEast',
			'ekmanNorth',
			'streamfunction',
		] as const) {
			expect(
				first?.currents[field].every((month) => month.length > 0),
				field,
			).toBe(true);
		}
	});

	it('transfers each pass’s 137 buffers, the twelve months of the air’s temperature and twelve of the sea’s, five of state, thirty-six of winds and seventy-two of currents, each once', () => {
		const { transfers } = answered();
		expect(transfers).toHaveLength(directClimate().passes);
		for (const transfer of transfers) {
			expect(transfer).toHaveLength(137);
			expect(new Set(transfer).size).toBe(137);
		}
		// A pass shares no buffer with another: an earlier pass's are copies.
		const all = transfers.flat();
		expect(new Set(all).size).toBe(all.length);
	});

	it('tells of each year as it finishes with the pass it is in', () => {
		const { reports } = answered();
		expect(reports.length).toBeGreaterThan(directClimate().passes - 1);
		expect(
			reports.every((report) => report.kind === 'climate' && report.id === 50),
		).toBe(true);
		const passNumbers = reports.map((report) => report.pass ?? 0);
		expect(passNumbers.every((pass) => pass >= 1)).toBe(true);
		expect([...passNumbers].sort((a, b) => a - b)).toEqual(passNumbers);
		expect(new Set(passNumbers).size).toBe(directClimate().passes);
		expect(reports[0]?.progress.yearsDone).toBe(1);
		expect(reports[0]?.progress.maxYears).toBe(DEFAULT_MAX_YEARS);
		expect(reports.at(-1)?.progress.estimatedYearsLeft).toBe(0);
	});

	it('takes no cap, tolerance or settings of the model or of the winds from the message', () => {
		// A message that asked for one pass would stop the loop after one, and
		// a cap of one year, that tolerance or one step a month would change
		// the first pass's temperature.
		const passes: SimPass[] = [];
		const { response } = handleRequest(
			climateRequest({
				model: { ...TEMPERATURE_MODEL, climateMaxPasses: 1, stepsPerMonth: 1 },
				windSettings: { thermalHpaPerK: 50 },
				maxPasses: 1,
				maxYears: 1,
				tolerance: 1000,
			}),
			() => {},
			(pass) => passes.push(pass),
		);
		expect(response.ok && response.result).toMatchObject({
			passes: directClimate().passes,
		});
		expect(passes[0]?.climatePass.temperature.yearsRun).toBeGreaterThan(1);
		expect(passes.at(-1)?.climatePass.temperature.months).toEqual(
			directClimate().temperature.months,
		);
	});

	it('carries on from the start it is given, a result as the page keeps it, and settles at the second pass', () => {
		const last = answered().passes.at(-1)?.climatePass;
		if (last === undefined) {
			throw new Error('no pass was told');
		}
		const passes: SimPass[] = [];
		const { response } = handleRequest(
			structuredClone(
				climateRequest({
					start: {
						temperature: last.temperature,
						winds: last.winds,
						dayLengthHours: CLIMATE_WORLD.planet.dayLengthHours,
					},
				}),
			),
			() => {},
			(pass) => passes.push(pass),
		);
		expect(response.ok && response.result).toMatchObject({
			passes: 2,
			settled: true,
		});
		expect(passes).toHaveLength(2);
		// The start's record is carried through the copy and back.
		expect(passes[0]?.climatePass.temperature.solvedFor).toEqual(
			last.temperature.solvedFor,
		);
	});

	/** Twelve months of a field on a world's cells. */
	const monthsOf = (cells: number): Float32Array[] =>
		Array.from({ length: 12 }, () => new Float32Array(cells));

	/**
	 * A start of the right form for a world, solved for it, whose state has
	 * the arrays given, on a grid of its own choosing.
	 */
	const startFor = (
		world: World,
		state: Record<string, unknown>,
	): Record<string, unknown> => ({
		temperature: {
			months: monthsOf(world.elevation.length),
			seaMonths: monthsOf(world.elevation.length),
			state,
			solvedFor: temperatureConditions(world),
		},
		winds: {
			east: monthsOf(world.elevation.length),
			north: monthsOf(world.elevation.length),
		},
		dayLengthHours: world.planet.dayLengthHours,
	});

	/** A state of the right form, with values everywhere, on that many cells. */
	const stateOn = (cells: number) => ({
		temperatureK: new Float64Array(cells).fill(280),
		previousK: new Float64Array(cells).fill(280),
		seaTemperatureK: new Float64Array(cells).fill(280),
		seaPreviousK: new Float64Array(cells).fill(280),
		referenceCoolingK: new Float64Array(cells),
		stepSeconds: 86_400,
	});

	it('answers a start of the wrong form with a failure, and tells of no pass', () => {
		const good = startFor(CLIMATE_WORLD, stateOn(6 * 64 * 64));
		const temperature = good.temperature as Record<string, unknown>;
		const solvedFor = temperature.solvedFor as Record<string, unknown>;
		for (const start of [
			{ dayLengthHours: 24 },
			{ ...good, temperature: { ...temperature, state: 'last time' } },
			{
				...good,
				temperature: {
					...temperature,
					solvedFor: { ...solvedFor, seaLevel: Number.NaN },
				},
			},
			{
				...good,
				temperature: {
					...temperature,
					state: {
						...stateOn(6 * 64 * 64),
						referenceCoolingK: new Float32Array(3),
					},
				},
			},
		]) {
			const passes: SimPass[] = [];
			const { response, transfer } = handleRequest(
				climateRequest({ start }),
				() => {},
				(pass) => passes.push(pass),
			);
			expect(response).toMatchObject({
				id: 50,
				kind: 'climate',
				ok: false,
				error: expect.stringContaining("A climate request's start"),
			});
			expect(transfer).toEqual([]);
			expect(passes).toEqual([]);
		}
	});

	it('answers a start the solver refuses with its reason, rather than throwing', () => {
		const state = {
			...stateOn(6 * 64 * 64),
			referenceCoolingK: new Float64Array(5),
		};
		expect(
			respond(climateRequest({ start: startFor(CLIMATE_WORLD, state) })),
		).toEqual({
			id: 50,
			kind: 'climate',
			ok: false,
			error:
				"A starting state's referenceCoolingK must be a Float64Array of 24576 values",
		});
	});

	it('answers a start on another grid than the world is solved on with a failure, rather than throwing', () => {
		// A world of 128 cells per face edge is solved on the 64 grid, so a
		// state on its own grid is on the wrong one.
		const world = createBlankWorld(128);
		const { response, transfer } = handleRequest(
			structuredClone({
				id: 33,
				kind: 'climate',
				world,
				start: startFor(world, stateOn(6 * 128 * 128)),
			}),
		);
		expect(response).toEqual({
			id: 33,
			kind: 'climate',
			ok: false,
			error:
				'A starting state must be on the grid of 64 cells per face edge, which this world is solved on, 24576 values an array; its temperatureK holds 98304',
		});
		expect(transfer).toEqual([]);
	});

	it('answers with a failure when the progress cannot be told', () => {
		const { response, transfer } = handleRequest(climateRequest(), () => {
			throw new Error('nobody to tell');
		});
		expect(response).toEqual({
			id: 50,
			kind: 'climate',
			ok: false,
			error: 'nobody to tell',
		});
		expect(transfer).toEqual([]);
	});

	it('answers a world the core refuses with its reason, and tells of no pass', () => {
		const passes: SimPass[] = [];
		const { response } = handleRequest(
			climateRequest({ world: { ...CLIMATE_WORLD, resolution: 63 } }),
			() => {},
			(pass) => passes.push(pass),
		);
		expect(response).toMatchObject({
			id: 50,
			kind: 'climate',
			ok: false,
			error: expect.stringContaining('63'),
		});
		expect(passes).toEqual([]);
	});

	it('answers with a failure when a pass cannot be told', () => {
		const { response } = handleRequest(climateRequest(), undefined, () => {
			throw new Error('the post failed');
		});
		expect(response).toEqual({
			id: 50,
			kind: 'climate',
			ok: false,
			error: 'the post failed',
		});
	});
});
