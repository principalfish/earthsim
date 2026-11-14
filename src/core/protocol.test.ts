import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PLANET,
	PLANET_SETTINGS,
	TEMPERATURE_SETTINGS,
	temperaturePlanet,
} from './planet';
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
import type {
	TemperatureConditions,
	TemperatureProgress,
	TemperatureState,
} from './temperature';
import { createBlankWorld } from './world';

const world = createBlankWorld(64);

/** A state of the right form; its lengths and values are for the solver. */
const state = (): TemperatureState => ({
	temperatureK: new Float64Array(3),
	previousK: new Float64Array(3),
	referenceCoolingK: new Float64Array(3),
	stepSeconds: 1,
});

/** A record of the right form; its values are for the solver. */
const solvedFor = (): TemperatureConditions => ({
	seaLevel: 0,
	planet: temperaturePlanet(DEFAULT_PLANET),
});

const months = (): Float32Array[] =>
	Array.from({ length: 12 }, () => new Float32Array(3));

const BAD_START =
	"A temperature request's start must be an object whose solvedFor has a finite seaLevel and a planet whose settings, the day length aside, are finite, and whose state has temperatureK, previousK and referenceCoolingK as Float64Arrays and stepSeconds as a number";

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
		expect(isSimKind('winds')).toBe(true);
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
					dayLengthHours: 0,
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

	it('reads a world with a day length', () => {
		const tenHours = {
			...world,
			planet: { ...world.planet, dayLengthHours: 10 },
		};
		const parsed = parseSimRequest({
			id: 9,
			kind: 'temperature',
			world: tenHours,
		});
		expect(
			(parsed as SimRequest<'temperature'>).world.planet.dayLengthHours,
		).toBe(10);
	});

	it('refuses a request without a world of the right form, a planet without a day length or with one that is not a number included', () => {
		const { dayLengthHours: _, ...noDay } = world.planet;
		for (const payload of [
			undefined,
			null,
			'world',
			{ ...world, elevation: Array.from({ length: 6 }, () => 0) },
			{ ...world, planet: { ...world.planet, starMass: '1' } },
			{ ...world, planet: undefined },
			{ ...world, planet: noDay },
			{ ...world, planet: { ...world.planet, dayLengthHours: '24' } },
			{ ...world, planet: { ...world.planet, dayLengthHours: null } },
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

	it('keeps the very state of a start and a copy of its record, and nothing else of it, a whole result’s months included', () => {
		const record = solvedFor();
		const start = {
			months: months(),
			state: state(),
			solvedFor: {
				...record,
				planet: { ...record.planet, name: 'Earth' },
				date: 3,
			},
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
			start: { state: start.state, solvedFor: record },
		});
		const { start: kept } = parsed as SimRequest<'temperature'>;
		expect(kept).not.toHaveProperty('months');
		expect(kept?.state).toBe(start.state);
		expect(kept?.state?.referenceCoolingK).toBe(start.state.referenceCoolingK);
		expect(kept).not.toHaveProperty('yearsRun');
		expect(kept?.solvedFor).toEqual(record);
		expect(Object.keys(kept?.solvedFor.planet ?? {})).toEqual(
			TEMPERATURE_SETTINGS,
		);
	});

	it('keeps of a record’s planet only the settings the temperature reads, leaving any day length behind', () => {
		for (const dayLengthHours of [24, '24', Number.NaN]) {
			const planet = { ...DEFAULT_PLANET, dayLengthHours };
			const parsed = parseSimRequest({
				id: 3,
				kind: 'temperature',
				world,
				start: { state: state(), solvedFor: { seaLevel: 0, planet } },
			});
			const kept = (parsed as SimRequest<'temperature'>).start?.solvedFor;
			expect(kept, String(dayLengthHours)).toEqual(solvedFor());
			expect(Object.keys(kept?.planet ?? {})).toEqual(TEMPERATURE_SETTINGS);
		}
	});

	it('keeps a record whose sea level and settings lie beyond their limits, for the solver to bring within them', () => {
		const record = {
			seaLevel: 1e9,
			planet: { ...solvedFor().planet, axialTiltDeg: 400, starMass: -1 },
		};
		const parsed = parseSimRequest({
			id: 3,
			kind: 'temperature',
			world,
			start: { state: state(), solvedFor: record },
		});
		expect((parsed as SimRequest<'temperature'>).start?.solvedFor).toEqual(
			record,
		);
	});

	it('takes no cap, tolerance, constants, grid or callback from the message', () => {
		const parsed = parseSimRequest({
			id: 4,
			kind: 'temperature',
			world,
			maxYears: 1,
			tolerance: 100,
			model: { stepsPerMonth: 1 },
			fullResolution: true,
			onYear: 'call me',
		});
		expect(parsed).toEqual({ id: 4, kind: 'temperature', world });
		expect(Object.keys(parsed)).toEqual(['id', 'kind', 'world']);
		const started = parseSimRequest({
			id: 4,
			kind: 'temperature',
			world,
			start: { state: state(), solvedFor: solvedFor(), fullResolution: true },
		}) as SimRequest<'temperature'>;
		expect(Object.keys(started.start ?? {})).toEqual(['state', 'solvedFor']);
	});

	it('leaves the lengths of the fields and the values of a start for the solver to judge', () => {
		for (const start of [
			Object.assign([], { state: state(), solvedFor: solvedFor() }),
			{
				state: {
					...state(),
					temperatureK: new Float64Array(6 * 128 * 128),
					previousK: new Float64Array(6 * 128 * 128),
				},
				solvedFor: solvedFor(),
			},
			{
				state: { ...state(), stepSeconds: Number.NaN },
				solvedFor: solvedFor(),
			},
			{
				state: { ...state(), referenceCoolingK: new Float64Array(1) },
				solvedFor: solvedFor(),
			},
		]) {
			expect(
				parseSimRequest({ id: 5, kind: 'temperature', world, start }),
			).toMatchObject({ id: 5, kind: 'temperature' });
		}
	});

	it('refuses a start of the wrong form, keeping the id and kind', () => {
		const record = solvedFor();
		for (const start of [
			null,
			'last time',
			5,
			{},
			{ months: months() },
			{ state: null },
			{ state: [] },
			{ state: { ...state(), temperatureK: new Float32Array(3) } },
			{ state: { ...state(), previousK: [0, 0, 0] } },
			{ state: { ...state(), previousK: undefined } },
			{ state: { ...state(), referenceCoolingK: undefined } },
			{ state: { ...state(), referenceCoolingK: new Float32Array(3) } },
			{ state: { ...state(), referenceCoolingK: [0, 0, 0] } },
			{ state: { ...state(), stepSeconds: '1' } },
			{ months: months(), state: 'state' },
		].map((start) =>
			start !== null && typeof start === 'object'
				? { ...start, solvedFor: record }
				: start,
		)) {
			expect(
				refusal({ id: 6, kind: 'temperature', world, start }),
				JSON.stringify(start),
			).toEqual({ id: 6, kind: 'temperature', ok: false, error: BAD_START });
		}
	});

	it('refuses a start without a record, or with a malformed one, keeping the id and kind', () => {
		const record = solvedFor();
		const { starMass: _, ...missing } = record.planet;
		for (const solved of [
			undefined,
			null,
			'Earth',
			[],
			{ planet: record.planet },
			{ ...record, seaLevel: '0' },
			{ ...record, seaLevel: Number.NaN },
			{ ...record, seaLevel: Number.POSITIVE_INFINITY },
			{ seaLevel: 0 },
			{ ...record, planet: null },
			{ ...record, planet: missing },
			{ ...record, planet: { ...record.planet, axialTiltDeg: '23.44' } },
			{
				...record,
				planet: { ...record.planet, starBrightness: Number.NEGATIVE_INFINITY },
			},
			{ ...record, planet: { ...record.planet, orbitDistanceAu: Number.NaN } },
		]) {
			const start = { state: state(), solvedFor: solved };
			expect(
				refusal({ id: 6, kind: 'temperature', world, start }),
				JSON.stringify(solved),
			).toEqual({ id: 6, kind: 'temperature', ok: false, error: BAD_START });
		}
		expect(
			refusal({
				id: 6,
				kind: 'temperature',
				world,
				start: { months: months(), state: state() },
			}),
		).toEqual({ id: 6, kind: 'temperature', ok: false, error: BAD_START });
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

describe('parseSimRequest for winds', () => {
	const BAD_TEMPERATURES =
		"A winds request's temperatures must be an array of 12 Float32Arrays, one a month";

	it('keeps the very months in a new array, and nothing else of the message', () => {
		const temperatures = months();
		const parsed = parseSimRequest({
			id: 8,
			kind: 'winds',
			world,
			temperatures,
			fullResolution: true,
		});
		expect(parsed).toEqual({ id: 8, kind: 'winds', world, temperatures });
		const request = parsed as SimRequest<'winds'>;
		expect(request.temperatures).not.toBe(temperatures);
		request.temperatures.forEach((month, index) => {
			expect(month).toBe(temperatures[index]);
		});
	});

	it('leaves the lengths and values of the months for the solver to judge', () => {
		const temperatures = [
			...months().slice(1),
			Float32Array.of(Number.NaN, 1, 2, 3, 4),
		];
		expect(
			parseSimRequest({ id: 9, kind: 'winds', world, temperatures }),
		).toEqual({ id: 9, kind: 'winds', world, temperatures });
	});

	it('refuses temperatures that are not twelve Float32Arrays, keeping the id and kind', () => {
		for (const temperatures of [
			undefined,
			null,
			'warm',
			months()[0],
			{ length: 12 },
			months().slice(1),
			[...months(), new Float32Array(3)],
			[],
			[...months().slice(1), new Float64Array(3)],
			[...months().slice(1), [0, 0, 0]],
			[...months().slice(1), null],
		]) {
			expect(
				refusal({ id: 10, kind: 'winds', world, temperatures }),
				String(temperatures),
			).toEqual({
				id: 10,
				kind: 'winds',
				ok: false,
				error: BAD_TEMPERATURES,
			});
		}
	});

	it('refuses a request without a world of the right form, keeping the id and kind', () => {
		expect(
			refusal({
				id: 11,
				kind: 'winds',
				world: { ...world, elevation: [0] },
				temperatures: months(),
			}),
		).toMatchObject({ id: 11, kind: 'winds', ok: false });
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
