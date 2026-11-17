import { describe, expect, it } from 'vitest';
import { WIND_STYLES } from './globe/windMotion';
import type { PanelStorage } from './panelMemory';
import {
	createPreferences,
	GRID_KEY,
	LAYER_KEY,
	OFF_ENTRY,
	ON_ENTRY,
	type Preferences,
	SUNLIGHT_KEY,
	storedView,
	storeView,
	summaryKey,
	WIND_SPEED_UNIT_KEY,
	WIND_STYLE_KEY,
	WINDS_KEY,
} from './preferences';
import { PRESSURE_LAYER, TEMPERATURE_LAYER } from './scalarLayer';
import { createFakeStorage } from './testing/fakeStorage';
import {
	DEFAULT_PAGE_VIEW,
	LAYERS,
	SCALAR_LAYER_IDS,
	type StoredView,
} from './view';
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

describe('createPreferences, how the winds are drawn', () => {
	it('is kept under its own name', () => {
		expect(WIND_STYLE_KEY).toBe('earth_sim.preference.windStyle');
	});

	it('starts on streaks', () => {
		expect(createPreferences(createFakeStorage()).windStyle()).toBe('streaks');
		expect(
			createPreferences(createFakeStorage(), {
				reducedMotion: false,
			}).windStyle(),
		).toBe('streaks');
	});

	it('starts on arrows where the system asks for reduced motion', () => {
		expect(
			createPreferences(createFakeStorage(), {
				reducedMotion: true,
			}).windStyle(),
		).toBe('arrows');
	});

	it.each([
		[false, 'arrows'],
		[true, 'streaks'],
	] as const)(
		'keeps a stored way over the start, with reduced motion %s',
		(reducedMotion, style) => {
			const preferences = createPreferences(
				createFakeStorage({ [WIND_STYLE_KEY]: style }),
				{ reducedMotion },
			);
			expect(preferences.windStyle()).toBe(style);
		},
	);

	it('falls back to arrows with reduced motion when the entry is unreadable', () => {
		const preferences = createPreferences(
			createFakeStorage({ [WIND_STYLE_KEY]: 'lines' }),
			{ reducedMotion: true },
		);
		expect(preferences.windStyle()).toBe('arrows');
		expect(
			createPreferences(refusingStorage, { reducedMotion: true }).windStyle(),
		).toBe('arrows');
	});

	it('remembers each way chosen in one entry, apart from the unit', () => {
		const storage = createFakeStorage();
		const preferences = createPreferences(storage);
		preferences.setWindSpeedUnit('km/h');
		for (const style of WIND_STYLES) {
			preferences.setWindStyle(style);
			expect(preferences.windStyle()).toBe(style);
		}
		preferences.setWindStyle('streaks');
		expect(preferences.windSpeedUnit()).toBe('km/h');
		expect(storage.entries).toEqual(
			new Map([
				[WIND_SPEED_UNIT_KEY, 'km/h'],
				[WIND_STYLE_KEY, 'streaks'],
			]),
		);
	});

	it('restores the way an earlier visit chose', () => {
		const first = createFakeStorage();
		createPreferences(first).setWindStyle('streaks');
		const again = createPreferences(
			createFakeStorage(Object.fromEntries(first.entries)),
		);
		expect(again.windStyle()).toBe('streaks');
	});

	it.each(['', 'Streaks', 'streak', 'lines', 'arrows ', '1'])(
		'falls back to streaks for an entry of %j',
		(entry) => {
			const preferences = createPreferences(
				createFakeStorage({ [WIND_STYLE_KEY]: entry }),
			);
			expect(preferences.windStyle()).toBe('streaks');
		},
	);

	it('falls back to streaks, and no error, from storage that throws on reading', () => {
		expect(createPreferences(refusingStorage).windStyle()).toBe('streaks');
	});

	it('carries on, without an error, past storage that throws on writing', () => {
		const storage = createFakeStorage();
		const preferences = createPreferences({
			getItem: storage.getItem,
			setItem: refusingStorage.setItem,
		});
		expect(() => preferences.setWindStyle('arrows')).not.toThrow();
		expect(preferences.windStyle()).toBe('streaks');
		expect(() =>
			createPreferences(refusingStorage).setWindStyle('arrows'),
		).not.toThrow();
	});

	it('falls back to streaks, and no error, with no storage at all', () => {
		for (const storage of [null, undefined]) {
			const preferences = createPreferences(storage);
			expect(() => preferences.setWindStyle('arrows')).not.toThrow();
			expect(preferences.windStyle()).toBe('streaks');
		}
	});
});

describe('createPreferences, the layer', () => {
	it('is kept under its own name', () => {
		expect(LAYER_KEY).toBe('earth_sim.preference.layer');
	});

	it('starts on Terrain', () => {
		expect(createPreferences(createFakeStorage()).layer()).toBe('terrain');
	});

	it('remembers each layer chosen in one entry', () => {
		const storage = createFakeStorage();
		const preferences = createPreferences(storage);
		for (const layer of LAYERS) {
			preferences.setLayer(layer);
			expect(preferences.layer()).toBe(layer);
		}
		preferences.setLayer('temperature');
		expect(storage.entries).toEqual(new Map([[LAYER_KEY, 'temperature']]));
	});

	it.each(['', 'Temperature', 'humidity', 'terrain ', 'winds'])(
		'falls back to Terrain for an entry of %j, such as a layer no longer offered',
		(entry) => {
			const preferences = createPreferences(
				createFakeStorage({ [LAYER_KEY]: entry }),
			);
			expect(preferences.layer()).toBe('terrain');
		},
	);
});

describe('createPreferences, each layer’s view of its year', () => {
	it('is kept under a name of each layer’s own', () => {
		expect(summaryKey('temperature')).toBe(
			'earth_sim.preference.temperatureSummary',
		);
		expect(summaryKey('pressure')).toBe('earth_sim.preference.pressureSummary');
	});

	it('starts each layer on the Month view', () => {
		const preferences = createPreferences(createFakeStorage());
		for (const id of SCALAR_LAYER_IDS) {
			expect(preferences.summary(id)).toBe('month');
		}
	});

	it('remembers every view each layer offers, each layer apart from the other', () => {
		const storage = createFakeStorage();
		const preferences = createPreferences(storage);
		for (const { id } of TEMPERATURE_LAYER.summaries) {
			preferences.setSummary('temperature', id);
			expect(preferences.summary('temperature')).toBe(id);
		}
		for (const { id } of PRESSURE_LAYER.summaries) {
			preferences.setSummary('pressure', id);
			expect(preferences.summary('pressure')).toBe(id);
		}
		preferences.setSummary('temperature', 'coldest');
		expect(preferences.summary('pressure')).toBe('annualMean');
		expect(storage.entries).toEqual(
			new Map([
				[summaryKey('temperature'), 'coldest'],
				[summaryKey('pressure'), 'annualMean'],
			]),
		);
	});

	it.each(['', 'Annual average', 'mean', 'annualMean ', 'range', 'warmest'])(
		'falls back to the Month view for a pressure entry of %j, which it does not offer',
		(entry) => {
			const preferences = createPreferences(
				createFakeStorage({ [summaryKey('pressure')]: entry }),
			);
			expect(preferences.summary('pressure')).toBe('month');
		},
	);

	it('keeps a view the temperature offers that the pressure does not', () => {
		const preferences = createPreferences(
			createFakeStorage({
				[summaryKey('temperature')]: 'range',
				[summaryKey('pressure')]: 'range',
			}),
		);
		expect(preferences.summary('temperature')).toBe('range');
		expect(preferences.summary('pressure')).toBe('month');
	});
});

/** Each toggle's name, its entry's name and its reading and writing. */
const TOGGLES: readonly {
	readonly name: string;
	readonly key: string;
	readonly read: (preferences: Preferences) => boolean;
	readonly write: (preferences: Preferences, on: boolean) => void;
}[] = [
	{
		name: 'sunlight',
		key: SUNLIGHT_KEY,
		read: (preferences) => preferences.sunlight(),
		write: (preferences, on) => preferences.setSunlight(on),
	},
	{
		name: 'winds',
		key: WINDS_KEY,
		read: (preferences) => preferences.winds(),
		write: (preferences, on) => preferences.setWinds(on),
	},
	{
		name: 'grid',
		key: GRID_KEY,
		read: (preferences) => preferences.grid(),
		write: (preferences, on) => preferences.setGrid(on),
	},
];

describe.each(TOGGLES)(
	'createPreferences, the $name toggle',
	({ name, key, read, write }) => {
		it('is kept under its own name', () => {
			expect(key).toBe(`earth_sim.preference.${name}`);
		});

		it('starts off', () => {
			expect(read(createPreferences(createFakeStorage()))).toBe(false);
		});

		it('remembers on and off in one entry, apart from the other toggles', () => {
			const storage = createFakeStorage();
			const preferences = createPreferences(storage);
			write(preferences, true);
			expect(read(preferences)).toBe(true);
			for (const other of TOGGLES.filter((each) => each.key !== key)) {
				expect(other.read(preferences)).toBe(false);
			}
			expect(storage.entries).toEqual(new Map([[key, ON_ENTRY]]));
			write(preferences, false);
			expect(read(preferences)).toBe(false);
			expect(storage.entries).toEqual(new Map([[key, OFF_ENTRY]]));
		});

		it.each(['', 'on', 'True', 'true ', '1', 'yes'])(
			'falls back to off for an entry of %j',
			(entry) => {
				expect(
					read(createPreferences(createFakeStorage({ [key]: entry }))),
				).toBe(false);
			},
		);
	},
);

describe('createPreferences, the view settings, with storage that fails', () => {
	/** Every view setting, read. */
	const readAll = (preferences: Preferences) => ({
		layer: preferences.layer(),
		summaries: SCALAR_LAYER_IDS.map((id) => preferences.summary(id)),
		toggles: TOGGLES.map(({ read }) => read(preferences)),
	});
	/** Every view setting, written away from its default. */
	const writeAll = (preferences: Preferences): void => {
		preferences.setLayer('pressure');
		preferences.setSummary('temperature', 'range');
		preferences.setSummary('pressure', 'annualMean');
		for (const { write } of TOGGLES) {
			write(preferences, true);
		}
	};
	const DEFAULTS = {
		layer: 'terrain',
		summaries: ['month', 'month'],
		toggles: [false, false, false],
	};

	it('gives the defaults, and no error, from storage that throws on reading', () => {
		expect(readAll(createPreferences(refusingStorage))).toEqual(DEFAULTS);
	});

	it('carries on, without an error, past storage that throws on writing', () => {
		const storage = createFakeStorage();
		const preferences = createPreferences({
			getItem: storage.getItem,
			setItem: refusingStorage.setItem,
		});
		expect(() => writeAll(preferences)).not.toThrow();
		expect(readAll(preferences)).toEqual(DEFAULTS);
		expect(() => writeAll(createPreferences(refusingStorage))).not.toThrow();
	});

	it('gives the defaults, and no error, with no storage at all', () => {
		for (const storage of [null, undefined]) {
			const preferences = createPreferences(storage);
			expect(() => writeAll(preferences)).not.toThrow();
			expect(readAll(preferences)).toEqual(DEFAULTS);
		}
	});
});

describe('storedView', () => {
	it('is the default view, but for the month and the source, with nothing stored', () => {
		const { month, source, ...rest } = DEFAULT_PAGE_VIEW;
		expect(storedView(createPreferences(createFakeStorage()))).toEqual(rest);
	});

	it('reads every view setting the browser remembers, and nothing else', () => {
		const view = storedView(
			createPreferences(
				createFakeStorage({
					[LAYER_KEY]: 'pressure',
					[summaryKey('temperature')]: 'warmest',
					[summaryKey('pressure')]: 'annualMean',
					[SUNLIGHT_KEY]: ON_ENTRY,
					[WINDS_KEY]: OFF_ENTRY,
					[GRID_KEY]: ON_ENTRY,
				}),
			),
		);
		expect(view).toEqual({
			layer: 'pressure',
			summaries: { temperature: 'warmest', pressure: 'annualMean' },
			sunlight: true,
			winds: false,
			grid: true,
		});
	});
});

describe('storeView', () => {
	const { month, source, ...BEFORE } = DEFAULT_PAGE_VIEW;

	it('writes nothing when nothing remembered has changed, whatever the month and the source', () => {
		const storage = createFakeStorage();
		storeView(createPreferences(storage), BEFORE, {
			...DEFAULT_PAGE_VIEW,
			month: 2,
			source: 'observed',
		} as StoredView);
		expect(storage.writes).toEqual([]);
	});

	it('writes each setting that changed, and no other', () => {
		const storage = createFakeStorage();
		const preferences = createPreferences(storage);
		storeView(preferences, BEFORE, { ...BEFORE, layer: 'temperature' });
		storeView(preferences, BEFORE, {
			...BEFORE,
			summaries: { ...BEFORE.summaries, pressure: 'annualMean' },
		});
		storeView(preferences, BEFORE, {
			...BEFORE,
			sunlight: true,
			winds: true,
			grid: true,
		});
		expect(storage.writes).toEqual([
			[LAYER_KEY, 'temperature'],
			[summaryKey('pressure'), 'annualMean'],
			[SUNLIGHT_KEY, ON_ENTRY],
			[WINDS_KEY, ON_ENTRY],
			[GRID_KEY, ON_ENTRY],
		]);
	});

	it('round-trips through the storage', () => {
		const after: StoredView = {
			layer: 'temperature',
			summaries: { temperature: 'range', pressure: 'annualMean' },
			sunlight: true,
			winds: false,
			grid: true,
		};
		const storage = createFakeStorage();
		storeView(createPreferences(storage), BEFORE, after);
		expect(
			storedView(
				createPreferences(
					createFakeStorage(Object.fromEntries(storage.entries)),
				),
			),
		).toEqual(after);
	});
});
