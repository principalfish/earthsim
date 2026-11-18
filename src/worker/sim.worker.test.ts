import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimPass, SimProgress, SimResponse } from '../core/index';
import { passMessageOf } from '../core/testing/climateFixtures';
import { progressMessageOf } from '../core/testing/temperatureFixtures';

/** What the worker's script sets up when it is loaded. */
type Listener = (event: { data: unknown }) => void;

const handleRequest = vi.fn();
vi.mock('./handle', () => ({
	handleRequest: (...args: unknown[]) => handleRequest(...args),
}));

describe('the worker script', () => {
	let listener: Listener | undefined;
	const posted: [unknown, ArrayBuffer[] | undefined][] = [];

	beforeEach(async () => {
		listener = undefined;
		posted.length = 0;
		handleRequest.mockReset();
		vi.stubGlobal('addEventListener', (type: string, handler: Listener) => {
			if (type === 'message') {
				listener = handler;
			}
		});
		vi.stubGlobal(
			'postMessage',
			(message: unknown, transfer?: ArrayBuffer[]) => {
				posted.push([message, transfer]);
			},
		);
		vi.resetModules();
		await import('./sim.worker');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('listens for messages, and answers each with its response and the buffers to transfer', () => {
		expect(listener).toBeTypeOf('function');
		const response: SimResponse = {
			id: 1,
			kind: 'terrainStats',
			ok: true,
			result: {
				landFraction: 0.3,
				landAreaKm2: 0,
				seaAreaKm2: 0,
				highestM: 0,
				deepestM: 0,
				meanLandHeightM: 0,
				meanOceanDepthM: 0,
			},
		};
		const buffer = new ArrayBuffer(8);
		handleRequest.mockReturnValue({ response, transfer: [buffer] });
		listener?.({ data: { id: 1 } });
		expect(handleRequest.mock.calls[0]?.[0]).toEqual({ id: 1 });
		expect(posted).toEqual([[response, [buffer]]]);
	});

	it('posts each message about progress, and each pass with its buffers, before the response', () => {
		const progress: SimProgress = progressMessageOf(2, 1);
		const pass: SimPass = passMessageOf(2, 1);
		const buffer = new ArrayBuffer(4);
		const response: SimResponse = {
			id: 2,
			kind: 'climate',
			ok: true,
			result: { dayLengthHours: 24, passes: 1, settled: true, changeC: 0 },
		};
		handleRequest.mockImplementation(
			(
				_message: unknown,
				onProgress: (progress: SimProgress) => void,
				onPass: (pass: SimPass, transfer: ArrayBuffer[]) => void,
			) => {
				onProgress(progress);
				onPass(pass, [buffer]);
				return { response, transfer: [] };
			},
		);
		listener?.({ data: { id: 2 } });
		expect(posted).toEqual([
			[progress, undefined],
			[pass, [buffer]],
			[response, []],
		]);
	});
});
