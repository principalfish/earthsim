import { describe, expect, it } from 'vitest';
import {
	computeTerrainStats,
	createBlankWorld,
	DEFAULT_MAX_YEARS,
	DEFAULT_PLANET,
	generateWorld,
	PLANET_LIMITS,
	type SimProgress,
	type SimRequest,
	type SimResponse,
	solveTemperature,
	TEMPERATURE_MODEL,
	type TemperatureResult,
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

/**
 * Time allowed for each test here that solves a world's year: well under a
 * second each, but coverage makes them several times slower.
 */
const SOLVE_TIMEOUT_MS = 30_000;

/** A value worked out on first use and then shared. */
const shared = <T>(make: () => T): (() => T) => {
	let value: T | undefined;
	return () => {
		value ??= make();
		return value;
	};
};

/**
 * A blank ocean whose axis is tilted beyond the limit, as a message may
 * carry it. Brought to the limit, 90 degrees, it takes several years to
 * settle from nothing, so a cap of one year would show.
 */
const TILTED: World = {
	...createBlankWorld(64),
	planet: { ...DEFAULT_PLANET, axialTiltDeg: 200 },
};

/** The solver's own answer for the tilted world, called directly. */
const direct = shared(() =>
	solveTemperature({
		...TILTED,
		planet: { ...TILTED.planet, axialTiltDeg: PLANET_LIMITS.axialTiltDeg.max },
	}),
);

/**
 * The handler's answer for the tilted world, from a message that also
 * tries to set the solver's cap, tolerance and constants, as it arrives
 * in a worker, with every message about progress.
 */
const handled = shared(() => {
	const reports: SimProgress[] = [];
	const { response, transfer } = handleRequest(
		structuredClone({
			id: 21,
			kind: 'temperature',
			world: TILTED,
			maxYears: 1,
			tolerance: 1000,
			model: { ...TEMPERATURE_MODEL, stepsPerMonth: 1 },
		}),
		(progress) => reports.push(progress),
	);
	return { response, transfer, reports };
});

/** The result a response carries; fails the test if it has none. */
const resultOf = (response: SimResponse): TemperatureResult => {
	if (!response.ok || response.kind !== 'temperature') {
		throw new Error(
			`expected a temperature result: ${JSON.stringify(response)}`,
		);
	}
	return response.result as TemperatureResult;
};

const temperatureRequest = (
	extras: Record<string, unknown> = {},
): Record<string, unknown> => ({
	id: 30,
	kind: 'temperature',
	world: TILTED,
	...extras,
});

describe('handleRequest for temperature', { timeout: SOLVE_TIMEOUT_MS }, () => {
	it('returns the fields the solver gives directly, the planet brought to its limits as the solver does', () => {
		expect(handled().response).toEqual({
			id: 21,
			kind: 'temperature',
			ok: true,
			result: direct(),
		});
	});

	it('takes no cap, tolerance or constants from the message', () => {
		// Either a cap of one year or that tolerance would stop the solve
		// after its first year, and one step a month would change every
		// value.
		const result = resultOf(handled().response);
		expect(direct().yearsRun).toBeGreaterThan(1);
		expect(result.yearsRun).toBe(direct().yearsRun);
		expect(result.months).toEqual(direct().months);
	});

	it('transfers the buffers of the twelve months and the three state arrays, each once', () => {
		const { response, transfer } = handled();
		const result = resultOf(response);
		const expected = [
			...result.months.map((month) => month.buffer),
			result.state.temperatureK.buffer,
			result.state.previousK.buffer,
			result.state.referenceCoolingK.buffer,
		];
		expect(transfer).toHaveLength(15);
		expect(new Set(transfer).size).toBe(15);
		for (const buffer of expected) {
			expect(transfer).toContain(buffer);
		}
	});

	it('gives a transfer list a post accepts, which hands the arrays over', () => {
		const { response, transfer } = handleRequest(
			temperatureRequest({ start: direct() }),
		);
		const values = resultOf(response).months[0]?.slice();
		const posted = structuredClone(response, { transfer });
		expect(resultOf(posted).months[0]).toEqual(values);
		expect(resultOf(response).months[0]?.byteLength).toBe(0);
		expect(resultOf(response).state.previousK.byteLength).toBe(0);
		expect(resultOf(response).state.referenceCoolingK.byteLength).toBe(0);
	});

	it('carries a start’s record and reference through a copy of the request and back in the result', () => {
		// The tilted world is all sea, with no cooling of its own, so a
		// reference of a tenth of the limit everywhere has drifted only that
		// far: the state is carried on and passes the reference back.
		const start = direct();
		const reference = new Float64Array(
			start.state.referenceCoolingK.length,
		).fill(TEMPERATURE_MODEL.terrainDriftLimitK / 10);
		const { response, transfer } = handleRequest(
			structuredClone(
				temperatureRequest({
					id: 32,
					start: {
						...start,
						state: { ...start.state, referenceCoolingK: reference },
					},
				}),
			),
		);
		const result = resultOf(response);
		expect(result.yearsRun).toBe(1);
		expect(result.state.referenceCoolingK).toEqual(reference);
		expect(result.solvedFor).toEqual(start.solvedFor);
		expect(transfer).toContain(result.state.referenceCoolingK.buffer);
		const posted = resultOf(structuredClone(response, { transfer }));
		expect(posted.state.referenceCoolingK).toEqual(reference);
		expect(posted.solvedFor).toEqual(start.solvedFor);
	});

	it('answers a start without a record, or a malformed one, with a failure rather than throwing', () => {
		const { months, state, solvedFor } = direct();
		for (const start of [
			{ months, state },
			{ state, solvedFor: { ...solvedFor, seaLevel: Number.NaN } },
			{
				state,
				solvedFor: {
					...solvedFor,
					planet: { ...solvedFor.planet, starMass: undefined },
				},
			},
			{
				state: { ...state, referenceCoolingK: new Float32Array(3) },
				solvedFor,
			},
		]) {
			const { response, transfer } = handleRequest(
				temperatureRequest({ start }),
			);
			expect(response).toMatchObject({
				id: 30,
				kind: 'temperature',
				ok: false,
				error: expect.stringContaining("A temperature request's start must"),
			});
			expect(transfer).toEqual([]);
		}
		expect(
			respond(
				temperatureRequest({
					start: {
						state: { ...state, referenceCoolingK: new Float64Array(5) },
						solvedFor,
					},
				}),
			),
		).toEqual({
			id: 30,
			kind: 'temperature',
			ok: false,
			error:
				"A starting state's referenceCoolingK must be a Float64Array of 24576 values",
		});
	});

	it('tells of each year as it finishes, with the id and kind, before answering', () => {
		const { reports } = handled();
		const { yearsRun } = direct();
		expect(reports.map((report) => report.progress.yearsDone)).toEqual(
			Array.from({ length: yearsRun }, (_, year) => year + 1),
		);
		for (const report of reports) {
			expect(report).toMatchObject({ id: 21, kind: 'temperature' });
			expect(report.progress.maxYears).toBe(DEFAULT_MAX_YEARS);
		}
		expect(reports.at(-1)?.progress.estimatedYearsLeft).toBe(0);
		expect(reports.at(-1)?.progress.changeK).toBe(direct().finalChangeK);
	});

	it('carries on from the start it is given, as the solver does, leaving it as it was', () => {
		const start = direct();
		const before = start.state.temperatureK.slice();
		const { response } = handleRequest(
			structuredClone(temperatureRequest({ id: 31, start })),
		);
		expect(response).toEqual({
			id: 31,
			kind: 'temperature',
			ok: true,
			result: solveTemperature(TILTED, { start }),
		});
		expect(start.state.temperatureK).toEqual(before);
	});

	it('answers a start of months alone with a failure, rather than throwing', () => {
		for (const start of [
			{ months: direct().months, solvedFor: direct().solvedFor },
			{ solvedFor: direct().solvedFor },
		]) {
			expect(respond(temperatureRequest({ start }))).toMatchObject({
				id: 30,
				kind: 'temperature',
				ok: false,
				error: expect.stringContaining("A temperature request's start must"),
			});
		}
	});

	it('answers a start the solver refuses with its reason, rather than throwing', () => {
		const short = {
			...direct().state,
			temperatureK: new Float64Array(5),
		};
		expect(
			respond(
				temperatureRequest({
					start: { state: short, solvedFor: direct().solvedFor },
				}),
			),
		).toMatchObject({
			id: 30,
			kind: 'temperature',
			ok: false,
			error: expect.stringContaining('temperatureK'),
		});
	});

	it('answers a start on another grid than the world is solved on with a failure, rather than throwing', () => {
		// A world of 128 cells per face edge is solved on the 64 grid, so a
		// state on its own grid is on the wrong one.
		const world = createBlankWorld(128);
		const cells = 6 * 128 * 128;
		const fine = {
			temperatureK: new Float64Array(cells).fill(280),
			previousK: new Float64Array(cells).fill(280),
			referenceCoolingK: new Float64Array(cells),
			stepSeconds: direct().state.stepSeconds,
		};
		const { response, transfer } = handleRequest(
			structuredClone({
				id: 33,
				kind: 'temperature',
				world,
				start: { state: fine, solvedFor: temperatureConditions(world) },
			}),
		);
		expect(response).toEqual({
			id: 33,
			kind: 'temperature',
			ok: false,
			error:
				'A starting state must be on the grid of 64 cells per face edge, which this world is solved on, 24576 values an array; its temperatureK holds 98304',
		});
		expect(transfer).toEqual([]);
	});

	it('cannot be made to solve on the world’s own grid by a message', () => {
		const world = createBlankWorld(128);
		const { response } = handleRequest(
			structuredClone({
				id: 34,
				kind: 'temperature',
				world,
				fullResolution: true,
				options: { fullResolution: true },
			}),
		);
		const result = resultOf(response);
		expect(result.months[0]).toHaveLength(6 * 128 * 128);
		expect(result.state.temperatureK).toHaveLength(6 * 64 * 64);
	});

	it('answers a start of the wrong form with a failure, and transfers nothing', () => {
		const handledBadly = handleRequest(
			temperatureRequest({
				start: { state: 'last time', solvedFor: direct().solvedFor },
			}),
		);
		expect(handledBadly.response).toMatchObject({
			id: 30,
			kind: 'temperature',
			ok: false,
			error: expect.stringContaining("A temperature request's start must be"),
		});
		expect(handledBadly.transfer).toEqual([]);
	});

	it('answers with a failure when the progress cannot be told', () => {
		const { response, transfer } = handleRequest(temperatureRequest(), () => {
			throw new Error('nobody to tell');
		});
		expect(response).toEqual({
			id: 30,
			kind: 'temperature',
			ok: false,
			error: 'nobody to tell',
		});
		expect(transfer).toEqual([]);
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
