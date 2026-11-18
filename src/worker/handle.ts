/**
 * Answering one request: the whole of what the simulation worker does with
 * a message, as a plain function that needs no worker to run.
 */

import {
	type ClimateProgress,
	computeTerrainStats,
	parseSimRequest,
	type SimKind,
	type SimPass,
	type SimProgress,
	type SimRequest,
	type SimResponse,
	type SimResults,
	simFailure,
	solveClimate,
	solveTemperature,
	solveWinds,
	type TemperatureProgress,
	type TemperatureResult,
	type WindResult,
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

/** What a computation may tell of itself as it goes. */
type Reports = {
	/**
	 * How far a year of a temperature solve has come, with the pass of a
	 * climate's loop it is in.
	 */
	readonly progress: (progress: TemperatureProgress, pass?: number) => void;
	/** That a pass of a climate's loop has finished. */
	readonly pass: (pass: ClimateProgress) => void;
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
 * default. Nor has a winds request: its winds are always solved on the
 * solver's own grid. Nor has a climate request: it is solved with the
 * model's own settings and the wind model's own, and of its start only the
 * temperature's months, state and record, the winds' two components and the
 * day length are used.
 */
const COMPUTE: {
	readonly [K in SimKind]: (
		request: SimRequest<K>,
		report: Reports,
	) => SimResults[K];
} = {
	terrainStats: (request) => computeTerrainStats(request.world),
	temperature: (request, report) =>
		solveTemperature(request.world, {
			start: request.start,
			onYear: (progress) => report.progress(progress),
		}),
	winds: (request) => solveWinds(request.world, request.temperatures),
	climate: (request, report) => {
		const { dayLengthHours, passes, settled, changeC } = solveClimate(
			request.world,
			{
				start: request.start,
				onYear: report.progress,
				onPass: report.pass,
			},
		);
		// The arrays are the last pass's, which were sent with it.
		return { dayLengthHours, passes, settled, changeC };
	},
};

/** The buffers of a temperature result's arrays. */
const temperatureBuffers = (result: TemperatureResult): ArrayBufferLike[] => [
	...result.months.map((month) => month.buffer),
	result.state.temperatureK.buffer,
	result.state.previousK.buffer,
	result.state.referenceCoolingK.buffer,
];

/** The buffers of a winds result's arrays. */
const windBuffers = (result: WindResult): ArrayBufferLike[] =>
	[...result.east, ...result.north, ...result.pressure].map(
		(month) => month.buffer,
	);

/** The buffers of a pass's temperature and winds arrays. */
const passBuffers = (pass: ClimateProgress): ArrayBufferLike[] => [
	...temperatureBuffers(pass.temperature),
	...windBuffers(pass.winds),
];

/**
 * A pass with arrays of its own: the arrays of what is sent, as the loop
 * goes on to read the pass's, which a transfer would empty.
 */
const copyOfPass = (pass: ClimateProgress): ClimateProgress => {
	const { temperature, winds } = pass;
	return {
		...pass,
		temperature: {
			...temperature,
			months: temperature.months.map((month) => month.slice()),
			state: {
				...temperature.state,
				temperatureK: temperature.state.temperatureK.slice(),
				previousK: temperature.state.previousK.slice(),
				referenceCoolingK: temperature.state.referenceCoolingK.slice(),
			},
		},
		winds: {
			east: winds.east.map((month) => month.slice()),
			north: winds.north.map((month) => month.slice()),
			pressure: winds.pressure.map((month) => month.slice()),
		},
	};
};

/** The buffers each kind of result can hand over, which may repeat. */
const BUFFERS: {
	readonly [K in SimKind]: (result: SimResults[K]) => ArrayBufferLike[];
} = {
	terrainStats: () => [],
	temperature: temperatureBuffers,
	winds: windBuffers,
	climate: () => [],
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
 * error thrown by `onProgress` or `onPass`, which ends the computation.
 *
 * A temperature request is solved with the start it carries, if any, and
 * the solver's own cap, tolerance, constants and grid. A start on another
 * grid than the one the world is solved on, which the solver refuses, comes
 * back as a failure like any other. Its planet settings are brought within
 * their limits by the solver, as for any other caller. While it runs,
 * `onProgress` hears of each year as it finishes, and of a climate's each
 * year of each pass with that pass; nothing else reports progress. A winds
 * request is solved from the world and the twelve months of temperature it
 * carries; temperatures the solver refuses, such as
 * months of the wrong length, come back as a failure. A climate request is
 * solved from the world and the start it carries, if any, and `onPass`
 * hears of each pass of its loop as it finishes, in order, with the buffers
 * to transfer with it; the last pass's own arrays are sent, since nothing
 * reads them after, and an earlier pass's are copies, since the loop goes
 * on to read them. The climate's response holds only the day length, the
 * passes taken, whether it settled and the last change: its arrays are the
 * last pass's.
 *
 * Nothing is kept between calls, and the world and start in the request
 * are only read, never changed.
 *
 * @param request - The message, of any type at all: it is checked before
 * anything in it is used.
 * @param onProgress - Told how far the computation has come, while it
 * runs, with the request's id and kind. Left out, nobody is told.
 * @param onPass - Told of each pass of a climate request as it finishes,
 * with its transfer list. Left out, nobody is told.
 * @returns The response to post back, and its transfer list: for a
 * temperature result, the buffers of its twelve months and of the three
 * arrays of its state; for a winds result, those of its twelve months each
 * of eastward wind, northward wind and pressure; for anything else,
 * nothing.
 */
export const handleRequest = (
	request: unknown,
	onProgress: (progress: SimProgress) => void = () => {},
	onPass: (pass: SimPass, transfer: ArrayBuffer[]) => void = () => {},
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
			report: Reports,
		) => SimResults[SimKind];
		const result = compute(parsed, {
			progress: (progress, pass) =>
				onProgress(
					pass === undefined
						? { ...known, progress }
						: { ...known, progress, pass },
				),
			pass: (pass) => {
				// The last pass is the one nothing reads again.
				const sent = pass.last ? pass : copyOfPass(pass);
				onPass(
					{ id: parsed.id, kind: 'climate', climatePass: sent },
					transferList(passBuffers(sent)),
				);
			},
		});
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
