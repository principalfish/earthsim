/**
 * Answering one request: the whole of what the simulation worker does with
 * a message, as a plain function that needs no worker to run.
 */

import {
	computeTerrainStats,
	parseSimRequest,
	type SimKind,
	type SimResponse,
	type SimResults,
	simFailure,
	type World,
} from '../core/index';

/** How each kind of request is computed from the world it carries. */
const COMPUTE: {
	readonly [K in SimKind]: (world: World) => SimResults[K];
} = {
	terrainStats: computeTerrainStats,
};

/** What went wrong, in words, whatever was thrown. */
const reasonOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The response to a message sent to the simulation worker.
 *
 * @remarks
 * Never throws: a message that is not a request, a kind that is not known
 * and a world the computation refuses, such as one whose elevation array
 * has the wrong length, each come back as a failure response saying why,
 * with the request's id when it has one.
 *
 * Nothing is kept between calls, and the world in the request is only
 * read, never changed.
 *
 * @param request - The message, of any type at all: it is checked before
 * anything in it is used.
 * @returns The response to post back.
 */
export const handleRequest = (request: unknown): SimResponse => {
	let id: number | null = null;
	let kind: SimKind | null = null;
	try {
		const parsed = parseSimRequest(request);
		if ('ok' in parsed) {
			return parsed;
		}
		({ id, kind } = parsed);
		return { id, kind, ok: true, result: COMPUTE[kind](parsed.world) };
	} catch (error) {
		return simFailure(id, kind, reasonOf(error));
	}
};
