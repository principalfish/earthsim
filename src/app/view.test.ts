import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_VIEW, offersMonth, TEMPERATURE_VIEWS } from './view';

describe('the view the page opens on', () => {
	it('has sunlight off', () => {
		expect(DEFAULT_PAGE_VIEW.sunlight).toBe(false);
	});

	it('has the winds off', () => {
		expect(DEFAULT_PAGE_VIEW.winds).toBe(false);
	});
});

describe('offersMonth', () => {
	it('offers the month in the Month view alone, with sunlight and the winds on or off', () => {
		for (const sunlight of [false, true]) {
			for (const winds of [false, true]) {
				for (const temperatureView of TEMPERATURE_VIEWS) {
					expect(
						offersMonth({
							...DEFAULT_PAGE_VIEW,
							layer: 'temperature',
							temperatureView,
							sunlight,
							winds,
						}),
					).toBe(temperatureView === 'month');
				}
			}
		}
	});

	it('offers the month in Terrain view only while sunlight or the winds are on', () => {
		for (const temperatureView of TEMPERATURE_VIEWS) {
			const terrain = { ...DEFAULT_PAGE_VIEW, temperatureView };
			expect(offersMonth(terrain)).toBe(false);
			expect(offersMonth({ ...terrain, sunlight: true })).toBe(true);
			expect(offersMonth({ ...terrain, winds: true })).toBe(true);
			expect(offersMonth({ ...terrain, sunlight: true, winds: true })).toBe(
				true,
			);
		}
	});
});
