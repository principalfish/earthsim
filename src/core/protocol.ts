/**
 * The messages that pass between the page and the simulation worker.
 *
 * The worker is a compute service whose answers depend on nothing but the
 * request: it keeps no results between requests, only tables it can build
 * again, such as the grid's. Every request carries the whole world it is
 * about, and its answer is computed from what the request carries alone.
 * For a climate request that is the world and, when the page has one, an
 * earlier climate to start from. The page's world stays the one that is
 * edited.
 *
 * A request and its response share an id, so that answers can be told apart
 * whatever order they arrive in, and a kind, which says what is computed.
 * A computation that takes a while may also post progress messages before
 * its response, each carrying the request's id and kind. A climate request
 * also posts a pass message as each pass of its loop finishes, carrying
 * that pass's temperature and winds, and its response then holds only what
 * the passes do not: the last pass's arrays are the result's. Every message
 * is plain data that survives a structured clone.
 */

import type { ClimateProgress, ClimateStart, ClimateSummary } from './climate';
import { MONTHS_PER_YEAR } from './planet/insolation';
import {
	PLANET_SETTINGS,
	TEMPERATURE_SETTINGS,
	temperaturePlanet,
} from './planet/planet';
import type {
	TemperatureConditions,
	TemperatureProgress,
	TemperatureStart,
} from './temperature/temperature';
import type { TerrainStats } from './world/stats';
import type { World } from './world/world';

/**
 * What each kind of request computes.
 *
 * @remarks
 * Adding a kind here adds it to every type of this module. The worker's
 * tables of computations and of buffers to transfer, {@link SimPayloads},
 * {@link isSimKind} and {@link parseSimRequest} then fail to compile until
 * they cover it.
 */
export type SimResults = {
	/** Summary statistics of the terrain at the world's sea level. */
	readonly terrainStats: TerrainStats;
	/**
	 * The world's climate, its temperature and winds solved together: its
	 * day length, the passes taken and whether it settled. The arrays are
	 * the last pass's, which the pass messages carried.
	 */
	readonly climate: ClimateSummary;
};

/** What a request can ask the worker to compute. */
export type SimKind = keyof SimResults;

/**
 * What a request of each kind carries besides its id and kind.
 *
 * @remarks
 * Every kind carries the whole world. Posting a request to a worker copies
 * it, so the worker never sees later edits and the sender's world is
 * untouched by anything the worker does.
 */
export type SimPayloads = {
	readonly [K in SimKind]: {
		/** The world to compute for, as it was when the request was sent. */
		readonly world: World;
	} & SimExtras[K];
};

/** What a request of each kind carries besides the world. */
type SimExtras = {
	readonly terrainStats: Record<never, never>;
	readonly climate: {
		/**
		 * Where the climate starts from: usually the previous settled result
		 * for the world, from before an edit. Left out, it starts from
		 * nothing.
		 */
		readonly start?: ClimateStart;
	};
};

/** What a request of one kind carries besides its id and kind. */
export type SimPayload<K extends SimKind> = SimPayloads[K];

/**
 * A request for one computation on one world: for a kind given, a request
 * of that kind, and otherwise a request of any kind, told apart by `kind`.
 */
export type SimRequest<K extends SimKind = SimKind> = K extends SimKind
	? {
			/**
			 * A finite number chosen by the sender and echoed in the
			 * response. Unique among the sender's requests that have not
			 * been answered.
			 */
			readonly id: number;
			/** What to compute. */
			readonly kind: K;
		} & SimPayloads[K]
	: never;

/** The answer to a request that could be computed. */
export type SimSuccess<K extends SimKind = SimKind> = {
	/** The id of the request this answers. */
	readonly id: number;
	/** The kind of the request this answers. */
	readonly kind: K;
	readonly ok: true;
	/** What was computed: the result of that kind. */
	readonly result: SimResults[K];
};

/** The answer to a request that could not be computed. */
export type SimFailure = {
	/**
	 * The id of the request this answers, or null if the request had no
	 * usable id, in which case nobody is waiting for the answer.
	 */
	readonly id: number | null;
	/** The request's kind, or null if it had none that is known. */
	readonly kind: SimKind | null;
	readonly ok: false;
	/** Why there is no result, in a sentence fit to show or log. */
	readonly error: string;
};

/** What the worker sends back for a request: exactly one per request. */
export type SimResponse = SimSuccess | SimFailure;

/**
 * What the worker may send about a request while it is still computing:
 * any number of these, all before the request's response. They are not a
 * response, and settle nothing.
 */
export type SimProgress = {
	/** The id of the request being computed. */
	readonly id: number;
	/** The kind of that request. */
	readonly kind: SimKind;
	/** How far the computation has come. */
	readonly progress: TemperatureProgress;
	/** The pass of the climate loop the progress is within, from 1. */
	readonly pass: number;
};

/**
 * What the worker sends about a climate request as each pass of its loop
 * finishes: before the request's response, once for each pass, in order.
 * Like a progress message it is not a response, and settles nothing.
 */
export type SimPass = {
	/** The id of the request being computed. */
	readonly id: number;
	/** The kind of that request, always a climate request. */
	readonly kind: 'climate';
	/**
	 * The pass: its temperature and winds, how much it changed the
	 * temperature and whether it settled the climate.
	 */
	readonly climatePass: ClimateProgress;
};

const KINDS: { readonly [K in SimKind]: true } = {
	terrainStats: true,
	climate: true,
};

/** The most characters of an unknown kind that an error message repeats. */
const MAX_ECHOED_KIND_LENGTH = 40;

/** Whether a value's fields can be read by name: any object, arrays included. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

/** Whether a value holds every planet setting as a number of any value. */
const isPlanetShaped = (value: unknown): boolean =>
	isRecord(value) &&
	PLANET_SETTINGS.every((name) => typeof value[name] === 'number');

/** Whether a value has the form of a temperature result's end state. */
const isStateShaped = (value: unknown): boolean =>
	isRecord(value) &&
	value.temperatureK instanceof Float64Array &&
	value.previousK instanceof Float64Array &&
	value.seaTemperatureK instanceof Float64Array &&
	value.seaPreviousK instanceof Float64Array &&
	value.referenceCoolingK instanceof Float64Array &&
	typeof value.stepSeconds === 'number';

/** Whether a value is a finite number. */
const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

/**
 * Whether a value is a record of what a temperature result was solved
 * for: a finite sea level and a planet whose every setting the temperature
 * reads, {@link TEMPERATURE_SETTINGS}, is a finite number. Anything else
 * the planet holds, such as a day length, is not checked.
 */
const isConditionsShaped = (value: unknown): value is TemperatureConditions =>
	isRecord(value) &&
	isFiniteNumber(value.seaLevel) &&
	isRecord(value.planet) &&
	TEMPERATURE_SETTINGS.every((name) =>
		isFiniteNumber((value.planet as Record<string, unknown>)[name]),
	);

/**
 * Whether a value has the form of where a temperature solve starts from:
 * an object with a record of the sea level and planet it was solved for and
 * a state of the form of a result's state.
 *
 * @remarks
 * As for a world, the state is checked for its form only. How many values
 * its arrays hold, the grid they are on included, and what the values are
 * is for the solver to refuse. The record is small and is checked in full.
 */
const isTemperatureStartShaped = (value: unknown): value is TemperatureStart =>
	isRecord(value) &&
	isConditionsShaped(value.solvedFor) &&
	isStateShaped(value.state);

/**
 * Whether a value has the form of a year of a field: an array of twelve
 * `Float32Array`s.
 *
 * @remarks
 * As for a state, how many values each holds and what they are is for the
 * solver to refuse.
 */
const isMonthsShaped = (value: unknown): value is Float32Array[] =>
	Array.isArray(value) &&
	value.length === MONTHS_PER_YEAR &&
	value.every((month) => month instanceof Float32Array);

/**
 * Whether a value has the form of a start for a climate: its temperature
 * with twelve months, a state and a record of what it was solved for, its
 * winds with twelve months each of eastward and northward wind, and a day
 * length that is a finite number.
 *
 * @remarks
 * As for a world, how many values each array holds and what they are is
 * for the solver to refuse. The temperature's record is small and is
 * checked in full.
 */
const isClimateStartShaped = (value: unknown): value is ClimateStart =>
	isRecord(value) &&
	isTemperatureStartShaped(value.temperature) &&
	isMonthsShaped((value.temperature as { months?: unknown }).months) &&
	isMonthsShaped((value.temperature as { seaMonths?: unknown }).seaMonths) &&
	isRecord(value.winds) &&
	isMonthsShaped(value.winds.east) &&
	isMonthsShaped(value.winds.north) &&
	isFiniteNumber(value.dayLengthHours);

/**
 * A copy of a checked record, holding only the sea level and the planet's
 * settings that the temperature reads.
 */
const copyConditions = (
	conditions: TemperatureConditions,
): TemperatureConditions => ({
	seaLevel: conditions.seaLevel,
	planet: temperaturePlanet(conditions.planet),
});

/**
 * Reads what a message of each kind carries besides the world it has
 * already been found to have.
 *
 * @returns The payload, or why the message cannot be read as one.
 */
const PAYLOADS: {
	readonly [K in SimKind]: (
		message: Record<string, unknown>,
		world: World,
	) => SimPayloads[K] | string;
} = {
	terrainStats: (_message, world) => ({ world }),
	climate: (message, world) => {
		const { start } = message;
		if (start === undefined) {
			return { world };
		}
		if (!isClimateStartShaped(start)) {
			return `A climate request's start must be an object whose temperature has ${MONTHS_PER_YEAR} Float32Array months and seaMonths, a state (temperatureK, previousK, seaTemperatureK, seaPreviousK and referenceCoolingK as Float64Arrays and stepSeconds as a number) and a solvedFor with a finite seaLevel and a planet whose settings, the day length aside, are finite, whose winds have ${MONTHS_PER_YEAR} Float32Array months each of east and north, and whose dayLengthHours is a finite number`;
		}
		// Only what a climate starts from is taken, whatever else came with
		// it: the temperature's months, the air's and the sea's, its state
		// and record, the winds' two components, and the day length.
		return {
			world,
			start: {
				temperature: {
					months: [...start.temperature.months],
					seaMonths: [...start.temperature.seaMonths],
					state: start.temperature.state,
					solvedFor: copyConditions(start.temperature.solvedFor),
				},
				winds: {
					east: [...start.winds.east],
					north: [...start.winds.north],
				},
				dayLengthHours: start.dayLengthHours,
			},
		};
	},
};

/**
 * Whether a value names a kind of request.
 *
 * @param value - Anything, such as the `kind` of a message just received.
 */
export const isSimKind = (value: unknown): value is SimKind =>
	typeof value === 'string' && Object.hasOwn(KINDS, value);

/**
 * Whether a value has the form of a world: its fields are present and of
 * the right types.
 *
 * @remarks
 * The values are not checked: a resolution that is not supported, a sea
 * level or a planet setting out of range, a negative date or an elevation
 * array of the wrong length is for whatever computes with the world to
 * refuse.
 *
 * @param value - Anything, such as the `world` of a message just received.
 */
export const isWorldShaped = (value: unknown): value is World =>
	isRecord(value) &&
	typeof value.resolution === 'number' &&
	typeof value.seaLevel === 'number' &&
	isRecord(value.origin) &&
	isPlanetShaped(value.planet) &&
	typeof value.ageYears === 'number' &&
	value.elevation instanceof Float32Array;

/**
 * A response saying that a request could not be computed.
 *
 * @param id - The request's id, or null if it had none that is usable.
 * @param kind - The request's kind, or null if it had none that is known.
 * @param error - Why there is no result.
 */
export const simFailure = (
	id: number | null,
	kind: SimKind | null,
	error: string,
): SimFailure => ({ id, kind, ok: false, error });

/**
 * Reads a message as a request, without trusting anything about it.
 *
 * @remarks
 * The request is built afresh from the fields its kind carries, so that
 * nothing else in the message reaches whatever computes it: a climate
 * request is not given the solver's cap, tolerance or constants, the wind
 * model's settings, nor asked to solve on the world's own grid, whatever
 * the message says, and of its start only the temperature's months (the
 * air's and the sea's), state and record, the winds' eastward and
 * northward parts and the day length are taken, so the pressure of a whole
 * result sent as a start is left behind, and of the record's planet only
 * the settings the temperature reads.
 *
 * @param message - What arrived, of any type at all.
 * @returns The request, or the failure to answer it with: for a message
 * that is not an object, an id that is not a finite number, a kind that is
 * missing or not known, a world that is not {@link isWorldShaped}, or, for
 * a climate request, a start that is there but not of the form of one.
 * The failure carries the message's id and kind where it has usable ones.
 * An unknown kind is repeated in the failure's error, cut short if long.
 */
export const parseSimRequest = (message: unknown): SimRequest | SimFailure => {
	if (!isRecord(message)) {
		return simFailure(null, null, 'A request must be an object');
	}
	const kind = isSimKind(message.kind) ? message.kind : null;
	const { id } = message;
	if (typeof id !== 'number' || !Number.isFinite(id)) {
		return simFailure(null, kind, 'A request needs a finite number as its id');
	}
	if (kind === null) {
		return simFailure(
			id,
			null,
			typeof message.kind === 'string'
				? `Unknown request kind "${message.kind.slice(0, MAX_ECHOED_KIND_LENGTH)}"`
				: 'A request needs the name of a kind as its kind',
		);
	}
	if (!isWorldShaped(message.world)) {
		return simFailure(
			id,
			kind,
			`A ${kind} request needs a world with a resolution, a sea level, an origin, planet settings, a date and an elevation array`,
		);
	}
	const payload = PAYLOADS[kind](message, message.world);
	if (typeof payload === 'string') {
		return simFailure(id, kind, payload);
	}
	// The payload was read for this kind, so the two make a request of it.
	return { id, kind, ...payload } as SimRequest;
};

/**
 * Whether a value has the form of a response.
 *
 * @remarks
 * Only the fields that route a response are checked: its id, whether it
 * succeeded and, for a failure, the reason. A success's result is taken on
 * trust from the worker.
 *
 * A message about progress is not a response: it has no `ok`.
 *
 * @param value - Anything, such as the data of a message just received.
 */
export const isSimResponse = (value: unknown): value is SimResponse => {
	if (!isRecord(value)) {
		return false;
	}
	if (value.ok === true) {
		return typeof value.id === 'number' && 'result' in value;
	}
	return (
		value.ok === false &&
		(typeof value.id === 'number' || value.id === null) &&
		typeof value.error === 'string'
	);
};

/**
 * Whether a value has the form of a message about progress, and so is not
 * a response.
 *
 * @remarks
 * As for a response, only the fields that route it are checked: its id and
 * kind and pass, and that it has no `ok`, which every response has. What
 * it says of the progress is taken on trust from the worker, beyond its
 * being an object.
 *
 * @param value - Anything, such as the data of a message just received.
 */
export const isSimProgress = (value: unknown): value is SimProgress =>
	isRecord(value) &&
	!('ok' in value) &&
	typeof value.id === 'number' &&
	isSimKind(value.kind) &&
	typeof value.pass === 'number' &&
	isRecord(value.progress);

/**
 * Whether a value has the form of a message about a pass of a climate
 * request, and so is neither a response nor a message about progress.
 *
 * @remarks
 * As for the others, only the fields that route it are checked: its id and
 * that its kind is the climate's, that it has no `ok` and that it holds a
 * pass. What the pass says is taken on trust from the worker.
 *
 * @param value - Anything, such as the data of a message just received.
 */
export const isSimPass = (value: unknown): value is SimPass =>
	isRecord(value) &&
	!('ok' in value) &&
	typeof value.id === 'number' &&
	value.kind === 'climate' &&
	isRecord(value.climatePass);
