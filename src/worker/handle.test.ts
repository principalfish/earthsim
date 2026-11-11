import { describe, expect, it } from 'vitest';
import {
	computeTerrainStats,
	createBlankWorld,
	generateWorld,
	type SimRequest,
	type World,
} from '../core/index';
import { handleRequest } from './handle';

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
		expect(handleRequest(statsRequest(world, 7))).toEqual({
			id: 7,
			kind: 'terrainStats',
			ok: true,
			result: computeTerrainStats(world),
		});
	});

	it('returns the same statistics for a copy of the world, as a worker gets', () => {
		const world = generated(42, 0.55);
		const response = handleRequest(structuredClone(statsRequest(world)));
		expect(response).toEqual({
			id: 1,
			kind: 'terrainStats',
			ok: true,
			result: computeTerrainStats(world),
		});
	});

	it('returns a response that survives a structured clone', () => {
		const response = handleRequest(statsRequest(generated()));
		expect(structuredClone(response)).toEqual(response);
	});

	it('answers an unknown kind with a failure rather than throwing', () => {
		const world = createBlankWorld(64);
		expect(handleRequest({ id: 3, kind: 'erosion', world })).toEqual({
			id: 3,
			kind: null,
			ok: false,
			error: 'Unknown request kind "erosion"',
		});
	});

	it('answers a message that is not a request with a failure', () => {
		for (const message of [undefined, null, 'terrainStats', 12, []]) {
			const response = handleRequest(message);
			expect(response.ok).toBe(false);
			expect(response.id).toBeNull();
		}
		expect(handleRequest({ id: 5, kind: 'terrainStats' })).toEqual({
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
		expect(handleRequest(statsRequest(short, 11))).toEqual({
			id: 11,
			kind: 'terrainStats',
			ok: false,
			error: 'A world of resolution 64 has 24576 cells; its elevation holds 10',
		});

		const drowned = { ...world, seaLevel: Number.NaN };
		const response = handleRequest(statsRequest(drowned, 12));
		expect(response).toMatchObject({ id: 12, kind: 'terrainStats', ok: false });
		expect(response).toHaveProperty(
			'error',
			expect.stringContaining('A sea level must be from'),
		);

		const coarse = { ...world, resolution: 7 } as unknown as World;
		expect(handleRequest(statsRequest(coarse, 13))).toMatchObject({
			id: 13,
			ok: false,
			error: expect.stringContaining('Unsupported grid resolution 7'),
		});

		world.elevation[100] = Number.POSITIVE_INFINITY;
		expect(handleRequest(statsRequest(world, 14))).toMatchObject({
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
		expect(handleRequest(hostile)).toEqual({
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
		expect(handleRequest(rude)).toEqual({
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

		handleRequest(request);
		handleRequest({ ...request, kind: 'erosion' });

		expect(world.elevation).toEqual(before);
		expect(world.elevation.buffer).toBe(buffer);
		expect(world.elevation.byteLength).toBe(before.byteLength);
		expect(world.seaLevel).toBe(-120);
	});

	it('keeps nothing between requests', () => {
		const land = generated(1, 0.6);
		const sea = createBlankWorld(64);

		const first = handleRequest(statsRequest(land, 1));
		const second = handleRequest(statsRequest(sea, 2));
		const third = handleRequest(statsRequest(land, 3));

		expect(second).toMatchObject({ id: 2, result: { landFraction: 0 } });
		expect(third).toEqual({ ...first, id: 3 });
	});
});
