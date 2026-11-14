import { describe, expect, it } from 'vitest';
import {
	DEFAULT_WIND_SETTINGS,
	WIND_SETTING_NAMES,
} from '../../src/core/index';
import {
	parseCommand,
	SETTING_BOUNDS,
	startingValue,
	TUNED_SETTINGS,
} from './command';
import { isWithin } from './search';

describe('parseCommand', () => {
	it('lists the settings when given no arguments', () => {
		expect(parseCommand([])).toEqual({ kind: 'list' });
	});

	it('reads a sweep, with settings held', () => {
		expect(
			parseCommand([
				'sweep',
				'bandAmplitudeHpa',
				'7',
				'11',
				'5',
				'warmLimitK=5',
			]),
		).toEqual({
			kind: 'sweep',
			name: 'bandAmplitudeHpa',
			values: [7, 8, 9, 10, 11],
			fixed: { warmLimitK: 5 },
		});
	});

	it('reads a search over named settings or the tuned ones, with its step and rounds', () => {
		expect(
			parseCommand([
				'search',
				'hotWindowK',
				'seaFrictionPerS',
				'--rounds=2',
				'thermalHpaPerK=2.5',
			]),
		).toEqual({
			kind: 'search',
			names: ['hotWindowK', 'seaFrictionPerS'],
			fixed: { thermalHpaPerK: 2.5 },
			step: 0.1,
			rounds: 2,
		});
		const tuned = parseCommand(['search', 'tuned', '--step=0.05']);
		expect(tuned).toMatchObject({
			kind: 'search',
			names: TUNED_SETTINGS,
			step: 0.05,
			rounds: 3,
		});
	});

	it('reads the cases and the diagnostic, with settings held', () => {
		expect(parseCommand(['cases'])).toEqual({ kind: 'cases', fixed: {} });
		expect(parseCommand(['diagnose', 'coldKneeK=30'])).toEqual({
			kind: 'diagnose',
			fixed: { coldKneeK: 30 },
		});
	});

	it('refuses an unknown command, setting or argument, and a value that is not a number', () => {
		for (const args of [
			['tune'],
			['sweep', 'bandAmplitude', '7', '11', '5'],
			['sweep', 'bandAmplitudeHpa', '7', '11'],
			['sweep', 'bandAmplitudeHpa', '7', 'x', '5'],
			['sweep', 'bandAmplitudeHpa', '7', '11', '5', 'extra'],
			['search'],
			['search', 'hotWindow'],
			['search', 'hotWindowK', '--step=big'],
			['cases', 'extra'],
			['cases', 'warmLimitK='],
			['diagnose', 'warm=5'],
		]) {
			expect(() => parseCommand(args), args.join(' ')).toThrow(RangeError);
		}
	});
});

describe('TUNED_SETTINGS', () => {
	it('names settings of the model, at least the eleven tuned against the observed Earth', () => {
		expect(TUNED_SETTINGS.length).toBeGreaterThanOrEqual(11);
		for (const name of TUNED_SETTINGS) {
			expect(WIND_SETTING_NAMES).toContain(name);
		}
		expect(new Set(TUNED_SETTINGS).size).toBe(TUNED_SETTINGS.length);
	});
});

describe('SETTING_BOUNDS', () => {
	it('bounds every setting, its default within them: shares to (0, 1], latitudes to (0°, 90°], the rest above 0', () => {
		for (const name of WIND_SETTING_NAMES) {
			const bounds = SETTING_BOUNDS[name];
			expect(isWithin(DEFAULT_WIND_SETTINGS[name], bounds), name).toBe(true);
			expect(bounds.above, name).toBe(0);
		}
		expect(SETTING_BOUNDS.outerCellShare).toEqual({ above: 0, atMost: 1 });
		expect(SETTING_BOUNDS.seaThermalShare.atMost).toBe(1);
		expect(SETTING_BOUNDS.lowLimitDeg.atMost).toBe(90);
		expect(SETTING_BOUNDS.bandAmplitudeHpa.atMost).toBeUndefined();
	});
});

describe('startingValue', () => {
	it('takes a held value, or else the default', () => {
		expect(startingValue('warmLimitK', { warmLimitK: 4 })).toBe(4);
		expect(startingValue('warmLimitK', {})).toBe(
			DEFAULT_WIND_SETTINGS.warmLimitK,
		);
	});
});
