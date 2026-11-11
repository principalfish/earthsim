import { describe, expect, it } from 'vitest';
import {
	computeTerrainStats,
	createBlankWorld,
	generateWorld,
	type TerrainStats,
} from '../../core/index';
import {
	formatLandFraction,
	STATS_NOTE_TEXT,
	STATS_PENDING_TEXT,
	STATS_UNAVAILABLE_TEXT,
	statsFigures,
} from './statsPanel';

const stats = (values: Partial<TerrainStats> = {}): TerrainStats => ({
	landFraction: 0.298,
	landAreaKm2: 152_000_000,
	seaAreaKm2: 358_000_000,
	highestM: 4812.4,
	deepestM: -7203.6,
	meanLandHeightM: 812.2,
	meanOceanDepthM: 3720.5,
	...values,
});

const valuesOf = (values: TerrainStats): string[] =>
	statsFigures(values).map((figure) => figure.value);

describe('formatLandFraction', () => {
	it('writes a percentage to one decimal place', () => {
		expect(formatLandFraction(0.298)).toBe('29.8%');
		expect(formatLandFraction(0.3)).toBe('30.0%');
		expect(formatLandFraction(0.29949)).toBe('29.9%');
		expect(formatLandFraction(0.29951)).toBe('30.0%');
	});

	it('writes no land and all land in full', () => {
		expect(formatLandFraction(0)).toBe('0.0%');
		expect(formatLandFraction(1)).toBe('100.0%');
	});

	it('does not round a little land down to none', () => {
		expect(formatLandFraction(0.0004)).toBe('<0.1%');
		expect(formatLandFraction(0.00099)).toBe('<0.1%');
		expect(formatLandFraction(0.001)).toBe('0.1%');
	});

	it('does not round a little ocean down to none', () => {
		expect(formatLandFraction(0.999)).toBe('99.9%');
		expect(formatLandFraction(0.9991)).toBe('>99.9%');
		expect(formatLandFraction(0.99999)).toBe('>99.9%');
	});

	it('keeps one decimal place between the two', () => {
		expect(formatLandFraction(0.5)).toBe('50.0%');
	});
});

describe('statsFigures', () => {
	it('gives the five figures in the order they are shown', () => {
		expect(statsFigures(stats())).toEqual([
			{ label: 'Land', value: '29.8%' },
			{ label: 'Highest point', value: '4,812 m' },
			{ label: 'Deepest point', value: '−7,204 m' },
			{ label: 'Mean land height', value: '812 m' },
			{ label: 'Mean ocean depth', value: '3,721 m' },
		]);
	});

	it('shows a world with no land, whose highest point is under the datum', () => {
		expect(valuesOf(computeTerrainStats(createBlankWorld(64)))).toEqual([
			'0.0%',
			'−4,000 m',
			'−4,000 m',
			'0 m',
			'4,000 m',
		]);
		const { elevation } = createBlankWorld(64);
		elevation[0] = -250;
		expect(
			valuesOf(
				computeTerrainStats({ ...createBlankWorld(64), elevation }),
			).slice(0, 4),
		).toEqual(['0.0%', '−250 m', '−4,000 m', '0 m']);
	});

	it('shows a world with no sea, whose mean ocean depth is nothing', () => {
		const world = createBlankWorld(64);
		world.elevation.fill(1500);
		world.elevation[0] = 20;
		expect(valuesOf(computeTerrainStats(world))).toEqual([
			'100.0%',
			'1,500 m',
			'20 m',
			'1,500 m',
			'0 m',
		]);
	});

	it('shows the statistics of a generated world', () => {
		const computed = computeTerrainStats(
			generateWorld({ resolution: 64, seed: 1977, landFraction: 0.3 }),
		);
		const [land, highest, deepest, height, depth] = valuesOf(computed);
		expect(land).toMatch(/^(29|30)\.\d%$/);
		expect(highest).toMatch(/^[\d,]+ m$/);
		expect(deepest).toMatch(/^−[\d,]+ m$/);
		expect(height).toMatch(/^[\d,]+ m$/);
		expect(depth).toMatch(/^[\d,]+ m$/);
	});

	it('writes the two points as signed elevations and the means unsigned', () => {
		const [, highest, deepest, height, depth] = valuesOf(
			stats({
				highestM: -12.3,
				deepestM: 5,
				meanLandHeightM: 0,
				meanOceanDepthM: 11_999.6,
			}),
		);
		expect(highest).toBe('−12 m');
		expect(deepest).toBe('5 m');
		expect(height).toBe('0 m');
		expect(depth).toBe('12,000 m');
	});
});

describe('the wording of the readout', () => {
	it('tells waiting from failure', () => {
		expect(STATS_PENDING_TEXT).toBe('Calculating…');
		expect(STATS_UNAVAILABLE_TEXT).toBe('Statistics unavailable');
	});

	it('says what each figure is measured from', () => {
		expect(STATS_NOTE_TEXT).toContain('elevations');
		expect(STATS_NOTE_TEXT).toContain('sea level');
	});
});
