import { describe, expect, it } from 'vitest';
import type { PanelStorage } from './panelMemory';
import { createPreferences, WIND_SPEED_UNIT_KEY } from './preferences';
import { createFakeStorage } from './testing/fakeStorage';
import { DEFAULT_WIND_UNIT, WIND_UNITS } from './windUnits';

/** Storage that throws on every read and every write. */
const refusingStorage: PanelStorage = {
	getItem: () => {
		throw new Error('Storage is blocked');
	},
	setItem: () => {
		throw new Error('Storage is blocked');
	},
};

describe('createPreferences, the wind speed unit', () => {
	it('is kept under its own name', () => {
		expect(WIND_SPEED_UNIT_KEY).toBe('earth_sim.preference.windSpeedUnit');
	});

	it('starts in metres a second', () => {
		expect(DEFAULT_WIND_UNIT).toBe('m/s');
		expect(createPreferences(createFakeStorage()).windSpeedUnit()).toBe('m/s');
	});

	it('remembers each unit chosen in one entry', () => {
		const storage = createFakeStorage();
		const preferences = createPreferences(storage);
		for (const unit of WIND_UNITS) {
			preferences.setWindSpeedUnit(unit);
			expect(preferences.windSpeedUnit()).toBe(unit);
		}
		expect(storage.entries).toEqual(new Map([[WIND_SPEED_UNIT_KEY, 'mph']]));
	});

	it('restores the unit an earlier visit chose', () => {
		const first = createFakeStorage();
		createPreferences(first).setWindSpeedUnit('km/h');
		const again = createPreferences(
			createFakeStorage(Object.fromEntries(first.entries)),
		);
		expect(again.windSpeedUnit()).toBe('km/h');
	});

	it.each(['', 'knots', 'KM/H', 'm/s ', '3.6'])(
		'falls back to m/s for an entry of %j',
		(entry) => {
			const preferences = createPreferences(
				createFakeStorage({ [WIND_SPEED_UNIT_KEY]: entry }),
			);
			expect(preferences.windSpeedUnit()).toBe('m/s');
		},
	);

	it('falls back to m/s, and no error, from storage that throws on reading', () => {
		expect(createPreferences(refusingStorage).windSpeedUnit()).toBe('m/s');
	});

	it('carries on, without an error, past storage that throws on writing', () => {
		const storage = createFakeStorage();
		const preferences = createPreferences({
			getItem: storage.getItem,
			setItem: refusingStorage.setItem,
		});
		expect(() => preferences.setWindSpeedUnit('mph')).not.toThrow();
		expect(preferences.windSpeedUnit()).toBe('m/s');
		expect(() =>
			createPreferences(refusingStorage).setWindSpeedUnit('km/h'),
		).not.toThrow();
	});

	it('falls back to m/s, and no error, with no storage at all', () => {
		for (const storage of [null, undefined]) {
			const preferences = createPreferences(storage);
			expect(() => preferences.setWindSpeedUnit('mph')).not.toThrow();
			expect(preferences.windSpeedUnit()).toBe('m/s');
		}
	});
});
