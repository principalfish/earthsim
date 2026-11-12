import { describe, expect, it } from 'vitest';
import { PLANET_SETTINGS } from './planet';
import {
	isSimKind,
	isSimProgress,
	isSimResponse,
	isWorldShaped,
	parseSimRequest,
	type SimFailure,
	type SimProgress,
	type SimRequest,
	simFailure,
} from './protocol';
import { computeTerrainStats } from './stats';
import type { TemperatureProgress, TemperatureState } from './temperature';
import { createBlankWorld } from './world';

const world = createBlankWorld(64);

/** A state of the right form; its lengths and values are for the solver. */
const state = (): TemperatureState => ({
	temperatureK: new Float64Array(3),
	previousK: new Float64Array(3),
	guessK: new Float64Array(3),
	stepSeconds: 1,
});

const months = (): Float32Array[] =>
	Array.from({ length: 12 }, () => new Float32Array(3));

const BAD_START =
	"A temperature request's start must be an object whose months, if any, are 12 Float32Arrays and whose state, if any, has temperatureK, previousK and guessK as Float64Arrays and stepSeconds as a number";

const PROGRESS: TemperatureProgress = {
	yearsDone: 2,
	maxYears: 60,
	changeK: 0.3,
	toleranceK: 0.05,
	estimatedYearsLeft: 3,
};

/** The failure a message is refused with; fails the test if it is accepted. */
const refusal = (message: unknown): SimFailure => {
	const parsed = parseSimRequest(message);
	if (!('ok' in parsed)) {
		throw new Error('the message was read as a request');
	}
	return parsed;
};

describe('isSimKind', () => {
	it('accepts the kinds of request', () => {
		expect(isSimKind('terrainStats')).toBe(true);
		expect(isSimKind('temperature')).toBe(true);
	});

	it('refuses other strings', () => {
		expect(isSimKind('erosion')).toBe(false);
		expect(isSimKind('')).toBe(false);
		expect(isSimKind('TerrainStats')).toBe(false);
	});

	it('refuses the names every object inherits', () => {
		for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
			expect(isSimKind(name)).toBe(false);
		}
		expect(isSimKind('__proto__')).toBe(false);
	});

	it('refuses values that are not strings', () => {
		for (const value of [undefined, null, 0, true, {}, ['terrainStats']]) {
			expect(isSimKind(value)).toBe(false);
		}
	});
});

describe('isWorldShaped', () => {
	it('accepts a world', () => {
		expect(isWorldShaped(world)).toBe(true);
	});

	it('accepts a world whose values are out of range, leaving them unchecked', () => {
		expect(
			isWorldShaped({
				resolution: 7,
				seaLevel: Number.NaN,
				origin: {},
				planet: {
					axialTiltDeg: -400,
					starBrightness: Number.NaN,
					starMass: 0,
					orbitDistanceAu: Infinity,
					greenhouseStrength: 99,
				},
				ageYears: -5,
				elevation: new Float32Array(3),
			}),
		).toBe(true);
	});

	it('refuses values that are not objects', () => {
		for (const value of [undefined, null, 64, 'world', true]) {
			expect(isWorldShaped(value)).toBe(false);
		}
	});

	it('refuses a world with a field missing or of the wrong type', () => {
		expect(isWorldShaped({ ...world, resolution: '64' })).toBe(false);
		expect(isWorldShaped({ ...world, seaLevel: null })).toBe(false);
		expect(isWorldShaped({ ...world, origin: 'blank' })).toBe(false);
		expect(isWorldShaped({ ...world, origin: null })).toBe(false);
		expect(isWorldShaped({ ...world, elevation: [0, 1, 2] })).toBe(false);
		expect(
			isWorldShaped({ ...world, elevation: new Float64Array(6 * 64 * 64) }),
		).toBe(false);
		const { elevation: _elevation, ...rest } = world;
		expect(isWorldShaped(rest)).toBe(false);
	});

	it('refuses a world whose planet or date is missing or of the wrong type', () => {
		const { planet: _planet, ...noPlanet } = world;
		expect(isWorldShaped(noPlanet)).toBe(false);
		const { ageYears: _ageYears, ...noAge } = world;
		expect(isWorldShaped(noAge)).toBe(false);
		for (const planet of [null, 'earth', 1, []]) {
			expect(isWorldShaped({ ...world, planet }), String(planet)).toBe(false);
		}
		for (const name of PLANET_SETTINGS) {
			for (const setting of [undefined, null, '1', [1], true]) {
				expect(
					isWorldShaped({
						...world,
						planet: { ...world.planet, [name]: setting },
					}),
					`${name}: ${String(setting)}`,
				).toBe(false);
			}
		}
		for (const ageYears of [undefined, null, '0', [0]]) {
			expect(isWorldShaped({ ...world, ageYears }), String(ageYears)).toBe(
				false,
			);
		}
	});
});

describe('simFailure', () => {
	it('builds a failure response', () => {
		expect(simFailure(3, 'terrainStats', 'no')).toEqual({
			id: 3,
			kind: 'terrainStats',
			ok: false,
			error: 'no',
		});
		expect(simFailure(null, null, 'no')).toEqual({
			id: null,
			kind: null,
			ok: false,
			error: 'no',
		});
	});
});

describe('parseSimRequest', () => {
	it('reads a request, keeping the very world it carries', () => {
		const parsed = parseSimRequest({ id: 12, kind: 'terrainStats', world });
		expect(parsed).toEqual({ id: 12, kind: 'terrainStats', world });
		expect((parsed as SimRequest).world).toBe(world);
	});

	it('accepts any finite id', () => {
		for (const id of [0, -1, 2.5, Number.MAX_SAFE_INTEGER]) {
			expect(parseSimRequest({ id, kind: 'terrainStats', world })).toEqual({
				id,
				kind: 'terrainStats',
				world,
			});
		}
	});

	it('leaves out whatever else the message holds', () => {
		expect(
			parseSimRequest({ id: 1, kind: 'terrainStats', world, ok: true }),
		).toEqual({ id: 1, kind: 'terrainStats', world });
	});

	it('refuses a message that is not an object', () => {
		for (const message of [undefined, null, 5, 'terrainStats', true]) {
			expect(refusal(message)).toEqual({
				id: null,
				kind: null,
				ok: false,
				error: 'A request must be an object',
			});
		}
	});

	it('refuses an id that is not a finite number, keeping the kind', () => {
		for (const id of [
			undefined,
			null,
			'1',
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			expect(refusal({ id, kind: 'terrainStats', world })).toEqual({
				id: null,
				kind: 'terrainStats',
				ok: false,
				error: 'A request needs a finite number as its id',
			});
		}
		expect(refusal({ kind: 'erosion', world }).kind).toBeNull();
	});

	it('refuses an unknown kind by name, keeping the id', () => {
		expect(refusal({ id: 4, kind: 'erosion', world })).toEqual({
			id: 4,
			kind: null,
			ok: false,
			error: 'Unknown request kind "erosion"',
		});
		expect(refusal({ id: 4, kind: 'toString', world }).error).toBe(
			'Unknown request kind "toString"',
		);
	});

	it('repeats no more than the start of a long unknown kind', () => {
		const { error } = refusal({ id: 4, kind: 'x'.repeat(5000), world });
		expect(error).toBe(`Unknown request kind "${'x'.repeat(40)}"`);
	});

	it('refuses a kind that is missing or not a string', () => {
		for (const kind of [undefined, null, 7, { name: 'terrainStats' }]) {
			expect(refusal({ id: 4, kind, world })).toEqual({
				id: 4,
				kind: null,
				ok: false,
				error: 'A request needs the name of a kind as its kind',
			});
		}
	});

	it('refuses a request without a world of the right form', () => {
		for (const payload of [
			undefined,
			null,
			'world',
			{ ...world, elevation: Array.from({ length: 6 }, () => 0) },
			{ ...world, planet: { ...world.planet, starMass: '1' } },
			{ ...world, planet: undefined },
		]) {
			expect(refusal({ id: 9, kind: 'terrainStats', world: payload })).toEqual({
				id: 9,
				kind: 'terrainStats',
				ok: false,
				error:
					'A terrainStats request needs a world with a resolution, a sea level, an origin, planet settings, a date and an elevation array',
			});
		}
	});
});

describe('parseSimRequest for temperature', () => {
	it('reads a request with no start', () => {
		expect(parseSimRequest({ id: 2, kind: 'temperature', world })).toEqual({
			id: 2,
			kind: 'temperature',
			world,
		});
	});

	it('keeps the very months and state of a start, and nothing else of it', () => {
		const start = {
			months: months(),
			state: state(),
			yearsRun: 4,
			converged: true,
		};
		const parsed = parseSimRequest({
			id: 3,
			kind: 'temperature',
			world,
			start,
		});
		expect(parsed).toEqual({
			id: 3,
			kind: 'temperature',
			world,
			start: { months: start.months, state: start.state },
		});
		const { start: kept } = parsed as SimRequest<'temperature'>;
		expect(kept?.months).toBe(start.months);
		expect(kept?.state).toBe(start.state);
		expect(kept).not.toHaveProperty('yearsRun');
	});

	it('takes no cap, tolerance, constants or callback from the message', () => {
		const parsed = parseSimRequest({
			id: 4,
			kind: 'temperature',
			world,
			maxYears: 1,
			tolerance: 100,
			model: { stepsPerMonth: 1 },
			onYear: 'call me',
		});
		expect(parsed).toEqual({ id: 4, kind: 'temperature', world });
		expect(Object.keys(parsed)).toEqual(['id', 'kind', 'world']);
	});

	it('leaves the lengths of the fields and the values of a start for the solver to judge', () => {
		for (const start of [
			{},
			[],
			{ months: Array.from({ length: 12 }, () => new Float32Array(1)) },
			{ state: { ...state(), stepSeconds: Number.NaN } },
		]) {
			expect(
				parseSimRequest({ id: 5, kind: 'temperature', world, start }),
			).toMatchObject({ id: 5, kind: 'temperature' });
		}
	});

	it('refuses a start of the wrong form, keeping the id and kind', () => {
		for (const start of [
			null,
			'last time',
			5,
			{ months: 'twelve' },
			{ months: [new Float64Array(3)] },
			{ months: [[1, 2, 3]] },
			{ months: [...months().slice(1), null] },
			{ months: [] },
			{ months: months().slice(1) },
			{ months: [...months(), new Float32Array(3)] },
			{ state: null },
			{ state: [] },
			{ state: { ...state(), temperatureK: new Float32Array(3) } },
			{ state: { ...state(), previousK: [0, 0, 0] } },
			{ state: { ...state(), guessK: undefined } },
			{ state: { ...state(), stepSeconds: '1' } },
			{ months: months(), state: 'state' },
		]) {
			expect(
				refusal({ id: 6, kind: 'temperature', world, start }),
				JSON.stringify(start),
			).toEqual({ id: 6, kind: 'temperature', ok: false, error: BAD_START });
		}
	});

	it('refuses months that claim an enormous length at once, without walking them', () => {
		// Holds nothing, so walking every place in it would take seconds
		// rather than the moment this test takes.
		const huge: unknown[] = [];
		huge.length = 2 ** 32 - 1;
		expect(
			refusal({ id: 6, kind: 'temperature', world, start: { months: huge } }),
		).toEqual({ id: 6, kind: 'temperature', ok: false, error: BAD_START });
	});

	it('refuses months with an empty place as missing a month', () => {
		const empty: unknown[] = [];
		empty.length = 12;
		const holed: unknown[] = months();
		delete holed[5];
		for (const sparse of [empty, holed]) {
			expect(sparse).toHaveLength(12);
			expect(
				refusal({
					id: 6,
					kind: 'temperature',
					world,
					start: { months: sparse },
				}),
			).toEqual({ id: 6, kind: 'temperature', ok: false, error: BAD_START });
		}
	});

	it('takes no start for the statistics, whatever it holds', () => {
		expect(
			parseSimRequest({
				id: 7,
				kind: 'terrainStats',
				world,
				start: 'nonsense',
			}),
		).toEqual({ id: 7, kind: 'terrainStats', world });
	});
});

describe('isSimProgress', () => {
	const progress: SimProgress = {
		id: 1,
		kind: 'temperature',
		progress: PROGRESS,
	};

	it('accepts a message about progress', () => {
		expect(isSimProgress(progress)).toBe(true);
	});

	it('refuses one with a bad id, kind or progress', () => {
		expect(isSimProgress({ ...progress, id: '1' })).toBe(false);
		expect(isSimProgress({ ...progress, id: null })).toBe(false);
		expect(isSimProgress({ ...progress, kind: 'erosion' })).toBe(false);
		expect(isSimProgress({ ...progress, progress: 3 })).toBe(false);
		expect(isSimProgress({ id: 1, kind: 'temperature' })).toBe(false);
	});

	it('refuses responses and values that are not objects', () => {
		expect(isSimProgress({ ...progress, ok: true, result: {} })).toBe(false);
		expect(isSimProgress(simFailure(1, 'temperature', 'no'))).toBe(false);
		for (const value of [undefined, null, 1, 'progress']) {
			expect(isSimProgress(value)).toBe(false);
		}
	});

	it('is never taken for a response', () => {
		expect(isSimResponse(progress)).toBe(false);
	});
});

describe('isSimResponse', () => {
	it('accepts a success', () => {
		expect(
			isSimResponse({
				id: 1,
				kind: 'terrainStats',
				ok: true,
				result: computeTerrainStats(world),
			}),
		).toBe(true);
	});

	it('accepts a failure, with or without an id', () => {
		expect(isSimResponse(simFailure(1, 'terrainStats', 'no'))).toBe(true);
		expect(isSimResponse(simFailure(null, null, 'no'))).toBe(true);
	});

	it('refuses values that are not objects', () => {
		for (const value of [undefined, null, 1, 'ok', true]) {
			expect(isSimResponse(value)).toBe(false);
		}
	});

	it('refuses a success with no id or no result', () => {
		expect(isSimResponse({ id: null, ok: true, result: {} })).toBe(false);
		expect(isSimResponse({ id: '1', ok: true, result: {} })).toBe(false);
		expect(isSimResponse({ id: 1, ok: true })).toBe(false);
	});

	it('refuses a failure with a bad id or no reason', () => {
		expect(isSimResponse({ id: '1', ok: false, error: 'no' })).toBe(false);
		expect(isSimResponse({ ok: false, error: 'no' })).toBe(false);
		expect(isSimResponse({ id: 1, ok: false })).toBe(false);
		expect(isSimResponse({ id: 1, ok: false, error: 5 })).toBe(false);
	});

	it('refuses a message that does not say whether it succeeded', () => {
		expect(isSimResponse({ id: 1, result: {} })).toBe(false);
		expect(isSimResponse({ id: 1, ok: 'yes', result: {} })).toBe(false);
		expect(isSimResponse({ id: 1, kind: 'terrainStats', world })).toBe(false);
	});
});
