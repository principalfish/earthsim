import { describe, expect, it } from 'vitest';
import { asksForGdal, VERIFY_OPTION } from './observedBuild';

describe('asksForGdal', () => {
	it('says whether the comparison with GDAL is asked for', () => {
		expect(asksForGdal([])).toBe(false);
		expect(asksForGdal([VERIFY_OPTION])).toBe(true);
		expect(VERIFY_OPTION).toBe('--verify-with-gdal');
	});

	it('refuses any other option', () => {
		expect(() => asksForGdal([VERIFY_OPTION, '--fast', 'x'])).toThrow(
			'Unknown option --fast x: the only option is --verify-with-gdal',
		);
	});
});
