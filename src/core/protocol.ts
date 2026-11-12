/**
 * The messages that pass between the page and the simulation worker.
 *
 * The worker is a compute service that keeps nothing between requests:
 * every request carries the whole world it is about, and its answer is
 * computed from what the request carries alone. For a temperature request
 * that is the world and, when the page has one, an earlier result to start
 * from. The page's world stays the one that is edited.
 *
 * A request and its response share an id, so that answers can be told apart
 * whatever order they arrive in, and a kind, which says what is computed.
 * A computation that takes a while may also post progress messages before
 * its response, each carrying the request's id and kind. Every message is
 * plain data that survives a structured clone.
 */

import { MONTHS_PER_YEAR } from './insolation';
import {
	PLANET_SETTINGS,
	type PlanetSetting,
	type PlanetSettings,
} from './planet';
import type { TerrainStats } from './stats';
import type {
	TemperatureConditions,
	TemperatureProgress,
	TemperatureResult,
	TemperatureStart,
} from './temperature';
import type { World } from './world';

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
	/** The world's near-surface air temperature through its year. */
	readonly temperature: TemperatureResult;
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
	readonly temperature: {
		/**
		 * Where the solve starts from: usually the previous result for the
		 * world, its months, its state and the sea level and planet it was
		 * solved for, from before an edit. Left out, the solve starts from
		 * nothing.
		 */
		readonly start?: TemperatureStart;
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
};

const KINDS: { readonly [K in SimKind]: true } = {
	terrainStats: true,
	temperature: true,
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
	value.guessK instanceof Float64Array &&
	value.referenceCoolingK instanceof Float64Array &&
	typeof value.stepSeconds === 'number';

/** Whether a value is a finite number. */
const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

/**
 * Whether a value is a record of what a temperature result was solved
 * for: a finite sea level and a planet whose every setting is a finite
 * number.
 */
const isConditionsShaped = (value: unknown): value is TemperatureConditions =>
	isRecord(value) &&
	isFiniteNumber(value.seaLevel) &&
	isRecord(value.planet) &&
	PLANET_SETTINGS.every((name) =>
		isFiniteNumber((value.planet as Record<string, unknown>)[name]),
	);

/**
 * Whether a value has the form of a start for a temperature solve: an
 * object with a record of the sea level and planet it was solved for,
 * whose months, if it has them, are an array of exactly 12 Float32Arrays,
 * one a month, and whose state, if it has one, is of the form of a
 * result's state.
 *
 * @remarks
 * As for a world, the months and the state are checked for their form
 * only. How many values each month and the state hold and what the values
 * are is for the solver to refuse, as it does a start that has neither
 * months nor a state. The record is small and is checked in full.
 */
const isTemperatureStartShaped = (value: unknown): value is TemperatureStart =>
	isRecord(value) &&
	isConditionsShaped(value.solvedFor) &&
	(value.months === undefined || isTwelveMonths(value.months)) &&
	(value.state === undefined || isStateShaped(value.state));

/** A copy of a checked record, holding only the sea level and planet. */
const copyConditions = (
	conditions: TemperatureConditions,
): TemperatureConditions => {
	const planet = {} as Record<PlanetSetting, number>;
	for (const name of PLANET_SETTINGS) {
		planet[name] = conditions.planet[name];
	}
	return { seaLevel: conditions.seaLevel, planet: planet as PlanetSettings };
};

/**
 * Whether a value is an array of exactly 12 Float32Arrays, none missing.
 *
 * @remarks
 * The number of months is checked before any month is looked at. An array
 * can claim a length of up to 2^32 - 1 while holding nothing, and it keeps
 * that length through the copy a worker is sent; walking every place in it
 * would hold up the worker for as long as that takes.
 *
 * Then each of the 12 places is looked at in turn, rather than with
 * `every`, which passes over an empty place in a sparse array: an empty
 * place is a missing month, and refused as one.
 */
const isTwelveMonths = (value: unknown): boolean => {
	if (!Array.isArray(value) || value.length !== MONTHS_PER_YEAR) {
		return false;
	}
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		if (!(value[month] instanceof Float32Array)) {
			return false;
		}
	}
	return true;
};

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
	temperature: (message, world) => {
		const { start } = message;
		if (start === undefined) {
			return { world };
		}
		if (!isTemperatureStartShaped(start)) {
			return "A temperature request's start must be an object whose solvedFor has a finite seaLevel and a planet of finite settings, whose months, if any, are 12 Float32Arrays and whose state, if any, has temperatureK, previousK, guessK and referenceCoolingK as Float64Arrays and stepSeconds as a number";
		}
		// Only what a solve starts from is taken, whatever else came with it.
		return {
			world,
			start: {
				months: start.months,
				state: start.state,
				solvedFor: copyConditions(start.solvedFor),
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
 * nothing else in the message reaches whatever computes it: a temperature
 * request is not given the solver's cap, tolerance or constants, whatever
 * the message says.
 *
 * @param message - What arrived, of any type at all.
 * @returns The request, or the failure to answer it with: for a message
 * that is not an object, an id that is not a finite number, a kind that is
 * missing or not known, a world that is not {@link isWorldShaped}, or, for
 * a temperature request, a start that is there but not of the form of one.
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
 * kind, and that it has no `ok`, which every response has. What it says of
 * the progress is taken on trust from the worker, beyond its being an
 * object.
 *
 * @param value - Anything, such as the data of a message just received.
 */
export const isSimProgress = (value: unknown): value is SimProgress =>
	isRecord(value) &&
	!('ok' in value) &&
	typeof value.id === 'number' &&
	isSimKind(value.kind) &&
	isRecord(value.progress);
