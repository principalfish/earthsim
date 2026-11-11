import { describe, expect, it } from 'vitest';
import * as core from './index';

describe('core', () => {
	it('exports a semantic version string', () => {
		expect(core.CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('exports the planet settings and what follows from them', () => {
		for (const name of [
			'DEFAULT_PLANET',
			'PLANET_LIMITS',
			'normalisePlanet',
			'sunlightRelativeToEarth',
			'yearLengthDays',
			'normaliseAgeYears',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});

	it('exports sunlight by latitude and season', () => {
		for (const name of [
			'SOLAR_CONSTANT_W_M2',
			'NORTHERN_SOLSTICE_FRACTION',
			'MONTHS_PER_YEAR',
			'dailyInsolation',
			'monthlyInsolation',
			'subsolarLatitude',
			'cellLatitudes',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});

	it('exports the observed temperature and its regridding', () => {
		for (const name of [
			'OBSERVED_BYTES',
			'OBSERVED_ROWS',
			'OBSERVED_COLUMNS',
			'decodeObservedTemperature',
			'encodeObservedTemperature',
			'observedTemperature',
			'observedTemperatureAt',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});
});
