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
});
