import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PAGE_VIEW,
	LAYERS,
	offersMonth,
	SCALAR_LAYER_IDS,
	SUMMARIES,
} from './view';

describe('the view the page opens on', () => {
	it('has sunlight off', () => {
		expect(DEFAULT_PAGE_VIEW.sunlight).toBe(false);
	});

	it('has the winds off', () => {
		expect(DEFAULT_PAGE_VIEW.winds).toBe(false);
	});

	it('opens each computed layer on its Month view and the simulation', () => {
		expect(DEFAULT_PAGE_VIEW.summaries).toEqual({
			temperature: 'month',
			pressure: 'month',
		});
		expect(DEFAULT_PAGE_VIEW.sources).toEqual({
			temperature: 'simulated',
			pressure: 'simulated',
		});
	});
});

describe('the layers', () => {
	it('are Terrain, Temperature and Pressure, in that order', () => {
		expect(LAYERS).toEqual(['terrain', 'temperature', 'pressure']);
		expect(SCALAR_LAYER_IDS).toEqual(['temperature', 'pressure']);
	});
});

describe('offersMonth', () => {
	it('offers the month in the Month view alone, with sunlight and the winds on or off', () => {
		for (const sunlight of [false, true]) {
			for (const winds of [false, true]) {
				for (const summary of SUMMARIES) {
					expect(
						offersMonth({
							...DEFAULT_PAGE_VIEW,
							layer: 'temperature',
							summaries: { temperature: summary, pressure: 'month' },
							sunlight,
							winds,
						}),
					).toBe(summary === 'month');
				}
			}
		}
	});

	it('offers the month in Pressure view in its Month view alone', () => {
		for (const summary of ['month', 'annualMean'] as const) {
			expect(
				offersMonth({
					...DEFAULT_PAGE_VIEW,
					layer: 'pressure',
					summaries: { temperature: 'month', pressure: summary },
				}),
			).toBe(summary === 'month');
		}
	});

	it('offers the month in Terrain view only while sunlight or the winds are on', () => {
		for (const summary of SUMMARIES) {
			const terrain = {
				...DEFAULT_PAGE_VIEW,
				summaries: { temperature: summary, pressure: summary },
			};
			expect(offersMonth(terrain)).toBe(false);
			expect(offersMonth({ ...terrain, sunlight: true })).toBe(true);
			expect(offersMonth({ ...terrain, winds: true })).toBe(true);
			expect(offersMonth({ ...terrain, sunlight: true, winds: true })).toBe(
				true,
			);
		}
	});
});
