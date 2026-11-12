/**
 * Answering one request: the whole of what the simulation worker does with
 * a message, as a plain function that needs no worker to run.
 */

import {
	computeTerrainStats,
	parseSimRequest,
	type SimKind,
	type SimProgress,
	type SimRequest,
	type SimResponse,
	type SimResults,
	simFailure,
	solveTemperature,
	type TemperatureProgress,
	type TemperatureResult,
} from '../core/index';

/** A response, and the buffers to transfer with it rather than copy. */
export type HandledRequest = {
	/** The response to post back. */
	readonly response: SimResponse;
	/**
	 * The buffers of the response's arrays, each once, to post as its
	 * transfer list. Posting them so hands them over without copying and
	 * leaves the sender's arrays empty, which is right for a result nobody
	 * here will read again.
	 */
	readonly transfer: ArrayBuffer[];
};

/**
 * How each kind of request is computed from what it carries, telling of
 * its progress, if it has any to tell, as it goes.
 *
 * @remarks
 * Only what the request carries is passed on. A temperature request in
 * particular has no say over the solver's cap, tolerance or constants,
 * which are always the solver's own, nor over the grid it is solved on, so
 * that no message can make a solve run longer than the solver allows by
 * default.
 */
const COMPUTE: {
	readonly [K in SimKind]: (
		request: SimRequest<K>,
		report: (progress: TemperatureProgress) => void,
	) => SimResults[K];
} = {
	terrainStats: (request) => computeTerrainStats(request.world),
	temperature: (request, report) =>
		solveTemperature(request.world, { start: request.start, onYear: report }),
};

/** The buffers of a temperature result's arrays. */
const temperatureBuffers = (result: TemperatureResult): ArrayBufferLike[] => [
	...result.months.map((month) => month.buffer),
	result.state.temperatureK.buffer,
	result.state.previousK.buffer,
	result.state.referenceCoolingK.buffer,
];

/** The buffers each kind of result can hand over, which may repeat. */
const BUFFERS: {
	readonly [K in SimKind]: (result: SimResults[K]) => ArrayBufferLike[];
} = {
	terrainStats: () => [],
	temperature: temperatureBuffers,
};

/**
 * Each buffer once, leaving out any that cannot be transferred: a buffer
 * named twice in a transfer list, or a shared one, fails the post.
 */
const transferList = (buffers: readonly ArrayBufferLike[]): ArrayBuffer[] => [
	...new Set(
		buffers.filter(
			(buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer,
		),
	),
];

/** What went wrong, in words, whatever was thrown. */
const reasonOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The response to a message sent to the simulation worker, with the
 * buffers to transfer with it.
 *
 * @remarks
 * Never throws: a message that is not a request, a kind that is not known
 * and a world or start the computation refuses, such as one whose
 * elevation array has the wrong length, each come back as a failure
 * response saying why, with the request's id when it has one. So does an
 * error thrown by `onProgress`, which ends the computation.
 *
 * A temperature request is solved with the start it carries, if any, and
 * the solver's own cap, tolerance, constants and grid. A start on another
 * grid than the one the world is solved on, which the solver refuses, comes
 * back as a failure like any other. Its planet settings are brought within
 * their limits by the solver, as for any other caller. While it runs,
 * `onProgress` hears of each year as it finishes; nothing else reports
 * progress.
 *
 * Nothing is kept between calls, and the world and start in the request
 * are only read, never changed.
 *
 * @param request - The message, of any type at all: it is checked before
 * anything in it is used.
 * @param onProgress - Told how far the computation has come, while it
 * runs, with the request's id and kind. Left out, nobody is told.
 * @returns The response to post back, and its transfer list: for a
 * temperature result, the buffers of its twelve months and of the three
 * arrays of its state; for anything else, nothing.
 */
export const handleRequest = (
	request: unknown,
	onProgress: (progress: SimProgress) => void = () => {},
): HandledRequest => {
	let id: number | null = null;
	let kind: SimKind | null = null;
	try {
		const parsed = parseSimRequest(request);
		if ('ok' in parsed) {
			return { response: parsed, transfer: [] };
		}
		({ id, kind } = parsed);
		const known = { id, kind };
		// The request was read for its own kind, so the computation of that
		// kind takes it and gives that kind's result.
		const compute = COMPUTE[kind] as (
			request: SimRequest,
			report: (progress: TemperatureProgress) => void,
		) => SimResults[SimKind];
		const result = compute(parsed, (progress) =>
			onProgress({ ...known, progress }),
		);
		const buffers = BUFFERS[kind] as (
			result: SimResults[SimKind],
		) => ArrayBufferLike[];
		return {
			response: { id, kind, ok: true, result },
			transfer: transferList(buffers(result)),
		};
	} catch (error) {
		return { response: simFailure(id, kind, reasonOf(error)), transfer: [] };
	}
};
