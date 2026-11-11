/**
 * The messages that pass between the page and the simulation worker.
 *
 * The worker is a compute service that keeps nothing between requests:
 * every request carries the whole world it is about, and its answer is
 * computed from that alone. The page's world stays the one that is edited.
 *
 * A request and its response share an id, so that answers can be told apart
 * whatever order they arrive in, and a kind, which says what is computed.
 * Every message is plain data that survives a structured clone.
 */

import type { TerrainStats } from './stats';
import type { World } from './world';

/**
 * What each kind of request computes.
 *
 * @remarks
 * Adding a kind here adds it to every type of this module. The worker's
 * table of computations and {@link isSimKind} then fail to compile until
 * they cover it.
 */
export type SimResults = {
	/** Summary statistics of the terrain at the world's sea level. */
	readonly terrainStats: TerrainStats;
};

/** What a request can ask the worker to compute. */
export type SimKind = keyof SimResults;

/**
 * A request for one computation on one world.
 *
 * @remarks
 * Every kind takes the same payload: the world. Posting a request to a
 * worker copies the world, so the worker never sees later edits and the
 * sender's world is untouched by anything the worker does.
 */
export type SimRequest<K extends SimKind = SimKind> = {
	/**
	 * A finite number chosen by the sender and echoed in the response.
	 * Unique among the sender's requests that have not been answered.
	 */
	readonly id: number;
	/** What to compute. */
	readonly kind: K;
	/** The world to compute it for, as it was when the request was sent. */
	readonly world: World;
};

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

const KINDS: { readonly [K in SimKind]: true } = { terrainStats: true };

/** The most characters of an unknown kind that an error message repeats. */
const MAX_ECHOED_KIND_LENGTH = 40;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

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
 * level out of range or an elevation array of the wrong length is for
 * whatever computes with the world to refuse.
 *
 * @param value - Anything, such as the `world` of a message just received.
 */
export const isWorldShaped = (value: unknown): value is World =>
	isRecord(value) &&
	typeof value.resolution === 'number' &&
	typeof value.seaLevel === 'number' &&
	isRecord(value.origin) &&
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
 * @param message - What arrived, of any type at all.
 * @returns The request, or the failure to answer it with: for a message
 * that is not an object, an id that is not a finite number, a kind that is
 * missing or not known, or a world that is not {@link isWorldShaped}. The
 * failure carries the message's id and kind where it has usable ones. An
 * unknown kind is repeated in the failure's error, cut short if long.
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
			`A ${kind} request needs a world with a resolution, a sea level, an origin and an elevation array`,
		);
	}
	return { id, kind, world: message.world };
};

/**
 * Whether a value has the form of a response.
 *
 * @remarks
 * Only the fields that route a response are checked: its id, whether it
 * succeeded and, for a failure, the reason. A success's result is taken on
 * trust from the worker.
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
