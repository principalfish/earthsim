import { describe, expect, it } from 'vitest';
import {
	cellLatitudes,
	DEFAULT_PLANET,
	decodeEarth,
	getGrid,
	PLANET_SETTINGS,
	type World,
} from '../../src/core/index';
import { readEarthDataFile } from '../earth/dataFile.mjs';
import { CASE_RESOLUTION, cases, landShare, oneContinentWorld } from './cases';

const earth = decodeEarth(readEarthDataFile());
const built = new Map(cases.map((shown) => [shown.id, shown.build(earth)]));
const worldOf = (id: string): World => {
	const world = built.get(id);
	if (world === undefined) {
		throw new Error(`No case ${id}`);
	}
	return world;
};

describe('cases', () => {
	it('are all on the 64 grid, with names of their own, the Earth first', () => {
		expect(CASE_RESOLUTION).toBe(64);
		expect(cases[0]?.id).toBe('earth');
		expect(new Set(cases.map(({ id }) => id)).size).toBe(cases.length);
		for (const world of built.values()) {
			expect(world.resolution).toBe(64);
		}
		expect(cases.map(({ id }) => id)).toEqual([
			'earth',
			'earth-day-8h',
			'earth-day-96h',
			'earth-tilt-0',
			'earth-tilt-60',
			'generated',
			'ocean',
			'one-continent',
		]);
	});

	it('change the Earth in the one setting each names', () => {
		const changes: Record<string, Partial<typeof DEFAULT_PLANET>> = {
			'earth-day-8h': { dayLengthHours: 8 },
			'earth-day-96h': { dayLengthHours: 96 },
			'earth-tilt-0': { axialTiltDeg: 0 },
			'earth-tilt-60': { axialTiltDeg: 60 },
		};
		const plain = worldOf('earth');
		expect(plain.planet).toEqual(DEFAULT_PLANET);
		for (const [id, change] of Object.entries(changes)) {
			const world = worldOf(id);
			expect(world.planet).toEqual({ ...DEFAULT_PLANET, ...change });
			const differing = PLANET_SETTINGS.filter(
				(name) => world.planet[name] !== DEFAULT_PLANET[name],
			);
			expect(differing).toEqual(Object.keys(change));
			expect(world.elevation).toEqual(plain.elevation);
			expect(world.seaLevel).toBe(plain.seaLevel);
			expect(world.origin).toEqual(plain.origin);
		}
	});

	it('give the invented worlds the land they are meant to have', () => {
		expect(landShare(worldOf('generated'))).toBeCloseTo(0.3, 2);
		expect(landShare(worldOf('ocean'))).toBe(0);
		for (const id of ['generated', 'ocean', 'one-continent']) {
			expect(cases.find((shown) => shown.id === id)?.invented).toBe(true);
			expect(worldOf(id).planet).toEqual(DEFAULT_PLANET);
		}
		expect(cases.filter(({ invented }) => invented)).toHaveLength(3);
	});
});

describe('oneContinentWorld', () => {
	const world = oneContinentWorld();

	it('makes a fifth of the surface land', () => {
		expect(Math.abs(landShare(world) - 0.2)).toBeLessThan(0.002);
	});

	it('keeps its land between 15°S and 55°N, and reaches both', () => {
		const latitudes = cellLatitudes(getGrid(64));
		let south = 90;
		let north = -90;
		for (let cell = 0; cell < latitudes.length; cell++) {
			if ((world.elevation[cell] as number) > world.seaLevel) {
				south = Math.min(south, latitudes[cell] as number);
				north = Math.max(north, latitudes[cell] as number);
			}
		}
		expect(south).toBeGreaterThanOrEqual(-15);
		expect(south).toBeLessThan(-14);
		expect(north).toBeLessThanOrEqual(55);
		expect(north).toBeGreaterThan(54);
	});

	it('is a flat plain in an ocean', () => {
		const heights = new Set(world.elevation);
		expect([...heights].sort((a, b) => a - b)).toEqual([-4000, 500]);
	});
});
