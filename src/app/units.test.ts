import { describe, expect, it } from 'vitest';
import {
	createPreferences,
	OLD_WIND_SPEED_UNIT_KEY,
	UNIT_SYSTEM_KEY,
	unitOverrideKey,
} from './preferences';
import { createFakeStorage } from './testing/fakeStorage';
import {
	COMPASS_POINTS,
	compassPoint,
	convert,
	convertDifference,
	createUnitStore,
	DEFAULT_UNIT_CHOICE,
	formatNumber,
	formatQuantity,
	formatWind,
	isUnitOf,
	isUnitSystem,
	QUANTITIES,
	type Quantity,
	resolveUnits,
	SYSTEM_UNITS,
	UNIT_SYSTEMS,
	UNITS,
	type UnitChoice,
	type UnitPreferences,
	unitSpec,
	unitsOf,
	WIND_CALM_TEXT,
	windFromDeg,
} from './units';

describe('the units', () => {
	it('offers the five quantities, each its metric unit, its imperial unit, then the others', () => {
		expect(QUANTITIES).toEqual([
			'temperature',
			'pressure',
			'windSpeed',
			'height',
			'distance',
		]);
		expect(unitsOf('temperature')).toEqual(['°C', '°F', 'K']);
		expect(unitsOf('pressure')).toEqual(['hPa', 'inHg']);
		expect(unitsOf('windSpeed')).toEqual(['m/s', 'mph', 'km/h', 'knots']);
		expect(unitsOf('height')).toEqual(['m', 'ft']);
		expect(unitsOf('distance')).toEqual(['km', 'mi']);
		for (const quantity of QUANTITIES) {
			expect(unitsOf(quantity).slice(0, 2)).toEqual([
				SYSTEM_UNITS.metric[quantity],
				SYSTEM_UNITS.imperial[quantity],
			]);
		}
	});

	it('writes inHg with two decimals and every other unit with none', () => {
		for (const quantity of QUANTITIES) {
			for (const [unit, spec] of Object.entries(UNITS[quantity])) {
				expect(spec.decimals, unit).toBe(unit === 'inHg' ? 2 : 0);
				expect(spec.label, unit).toBe(unit);
			}
		}
	});

	it('knows its own units and systems from anything else', () => {
		expect(UNIT_SYSTEMS).toEqual(['metric', 'imperial']);
		expect(isUnitSystem('metric')).toBe(true);
		expect(isUnitSystem('imperial')).toBe(true);
		for (const other of ['Metric', 'si', '', null, undefined, 1]) {
			expect(isUnitSystem(other)).toBe(false);
		}
		for (const quantity of QUANTITIES) {
			for (const unit of unitsOf(quantity)) {
				expect(isUnitOf(quantity, unit)).toBe(true);
			}
		}
		expect(isUnitOf('windSpeed', 'knots')).toBe(true);
		for (const other of ['°C', 'M/S', 'kn', '', null, undefined, 3.6]) {
			expect(isUnitOf('windSpeed', other)).toBe(false);
		}
		expect(isUnitOf('temperature', 'm/s')).toBe(false);
	});
});

describe('convert', () => {
	it('gives 0 °C as 0 °C, 32 °F and 273.15 K', () => {
		expect(convert('temperature', '°C', 0)).toBe(0);
		expect(convert('temperature', '°F', 0)).toBeCloseTo(32, 12);
		expect(convert('temperature', 'K', 0)).toBeCloseTo(273.15, 12);
		expect(convert('temperature', '°F', 100)).toBeCloseTo(212, 12);
		expect(convert('temperature', '°F', -40)).toBeCloseTo(-40, 12);
	});

	it('gives 1013.25 hPa as 29.92 inHg', () => {
		expect(convert('pressure', 'hPa', 1013.25)).toBe(1013.25);
		expect(convert('pressure', 'inHg', 1013.25)).toBeCloseTo(29.92, 2);
	});

	it('gives 10 m/s as 36 km/h, 22.4 mph and 19.4 knots', () => {
		expect(convert('windSpeed', 'm/s', 10)).toBe(10);
		expect(convert('windSpeed', 'km/h', 10)).toBeCloseTo(36, 12);
		expect(convert('windSpeed', 'mph', 10)).toBeCloseTo(22.369362920544, 12);
		expect(convert('windSpeed', 'knots', 10)).toBeCloseTo(19.438444924406, 12);
	});

	it('gives 1000 m as 3281 ft, and 100 km as 62.1 mi', () => {
		expect(convert('height', 'm', 1000)).toBe(1000);
		expect(convert('height', 'ft', 1000)).toBeCloseTo(3280.84, 2);
		expect(convert('distance', 'km', 100)).toBe(100);
		expect(convert('distance', 'mi', 100)).toBeCloseTo(62.137, 3);
	});
});

describe('convertDifference', () => {
	it('gives a difference of 10 °C as 18 °F and 10 K, without the offset', () => {
		expect(convertDifference('temperature', '°C', 10)).toBe(10);
		expect(convertDifference('temperature', '°F', 10)).toBeCloseTo(18, 12);
		expect(convertDifference('temperature', 'K', 10)).toBe(10);
	});

	it('scales every other quantity as convert does', () => {
		expect(convertDifference('windSpeed', 'km/h', 10)).toBeCloseTo(36, 12);
		expect(convertDifference('pressure', 'inHg', 1013.25)).toBeCloseTo(
			29.92,
			2,
		);
	});
});

describe('formatQuantity', () => {
	it('writes each known point in its unit, to the unit’s decimals', () => {
		expect(formatQuantity('temperature', '°F', 0)).toBe('32 °F');
		expect(formatQuantity('temperature', 'K', 0)).toBe('273 K');
		expect(formatQuantity('temperature', '°C', 0)).toBe('0 °C');
		expect(formatQuantity('pressure', 'inHg', 1013.25)).toBe('29.92 inHg');
		expect(formatQuantity('pressure', 'hPa', 1013.25)).toBe('1,013 hPa');
		expect(formatQuantity('windSpeed', 'km/h', 10)).toBe('36 km/h');
		expect(formatQuantity('windSpeed', 'mph', 10)).toBe('22 mph');
		expect(formatQuantity('windSpeed', 'knots', 10)).toBe('19 knots');
		expect(formatQuantity('height', 'ft', 1000)).toBe('3,281 ft');
		expect(formatQuantity('distance', 'mi', 100)).toBe('62 mi');
	});

	it('writes the decimals given in place of the unit’s', () => {
		expect(formatQuantity('distance', 'mi', 100, 1)).toBe('62.1 mi');
		expect(formatQuantity('windSpeed', 'mph', 10, 1)).toBe('22.4 mph');
		expect(formatQuantity('pressure', 'inHg', 1013.25, 0)).toBe('30 inHg');
		expect(formatQuantity('distance', 'km', 2, 1)).toBe('2.0 km');
	});

	it('rounds a half upwards, with a true minus sign and never −0', () => {
		expect(formatQuantity('windSpeed', 'm/s', 6.5)).toBe('7 m/s');
		expect(formatQuantity('windSpeed', 'm/s', 6.49)).toBe('6 m/s');
		expect(formatQuantity('temperature', '°C', -0.5)).toBe('0 °C');
		expect(formatQuantity('temperature', '°C', -0.2)).toBe('0 °C');
		expect(formatQuantity('temperature', '°C', -18)).toBe('−18 °C');
		expect(formatQuantity('temperature', '°F', -20)).toBe('−4 °F');
		expect(formatQuantity('height', 'm', -10994)).toBe('−10,994 m');
	});
});

describe('resolveUnits', () => {
	it('gives each system’s units with no override', () => {
		expect(resolveUnits(DEFAULT_UNIT_CHOICE)).toEqual({
			temperature: '°C',
			pressure: 'hPa',
			windSpeed: 'm/s',
			height: 'm',
			distance: 'km',
		});
		expect(resolveUnits({ system: 'imperial', overrides: {} })).toEqual({
			temperature: '°F',
			pressure: 'inHg',
			windSpeed: 'mph',
			height: 'ft',
			distance: 'mi',
		});
	});

	it.each(UNIT_SYSTEMS)(
		'gives each override under %s, and the system’s unit for the rest',
		(system) => {
			for (const quantity of QUANTITIES) {
				for (const unit of unitsOf(quantity)) {
					const choice = {
						system,
						overrides: { [quantity]: unit },
					} as UnitChoice;
					expect(resolveUnits(choice), `${quantity} ${unit}`).toEqual({
						...SYSTEM_UNITS[system],
						[quantity]: unit,
					});
				}
			}
		},
	);

	it('gives an override that names the system’s own unit as that unit', () => {
		expect(
			resolveUnits({ system: 'imperial', overrides: { windSpeed: 'mph' } }),
		).toEqual(SYSTEM_UNITS.imperial);
		expect(
			resolveUnits({ system: 'metric', overrides: { temperature: '°C' } }),
		).toEqual(SYSTEM_UNITS.metric);
	});

	it('gives every override at once over the system', () => {
		expect(
			resolveUnits({
				system: 'imperial',
				overrides: {
					temperature: 'K',
					pressure: 'hPa',
					windSpeed: 'knots',
					height: 'm',
					distance: 'km',
				},
			}),
		).toEqual({
			temperature: 'K',
			pressure: 'hPa',
			windSpeed: 'knots',
			height: 'm',
			distance: 'km',
		});
	});
});

/** Preferences that hold a choice and record each write. */
const createFakeUnitPreferences = (start: UnitChoice = DEFAULT_UNIT_CHOICE) => {
	const writes: string[] = [];
	let reads = 0;
	const preferences: UnitPreferences = {
		unitChoice: () => {
			reads += 1;
			return start;
		},
		setUnitSystem: (system) => writes.push(`system ${system}`),
		setUnitOverride: (quantity: Quantity, unit: string | null) =>
			writes.push(`${quantity} ${unit ?? 'none'}`),
	};
	return { preferences, writes, reads: () => reads };
};

describe('createUnitStore', () => {
	it('starts on the choice the preferences remember, read once', () => {
		const fake = createFakeUnitPreferences({
			system: 'imperial',
			overrides: { windSpeed: 'knots' },
		});
		const store = createUnitStore(fake.preferences);
		expect(store.choice()).toEqual({
			system: 'imperial',
			overrides: { windSpeed: 'knots' },
		});
		expect(store.units()).toEqual({
			...SYSTEM_UNITS.imperial,
			windSpeed: 'knots',
		});
		store.units();
		store.choice();
		expect(fake.reads()).toBe(1);
		expect(fake.writes).toEqual([]);
	});

	it('remembers each change and tells every listener once, in order', () => {
		const fake = createFakeUnitPreferences();
		const store = createUnitStore(fake.preferences);
		const told: string[] = [];
		store.addListener(() => told.push(`first ${store.units().windSpeed}`));
		store.addListener(() => told.push(`second ${store.units().windSpeed}`));
		store.chooseSystem('imperial');
		expect(told).toEqual(['first mph', 'second mph']);
		store.setOverride('windSpeed', 'knots');
		expect(told).toEqual([
			'first mph',
			'second mph',
			'first knots',
			'second knots',
		]);
		store.setOverride('windSpeed', null);
		expect(store.units().windSpeed).toBe('mph');
		expect(store.choice()).toEqual({ system: 'imperial', overrides: {} });
		expect(told).toHaveLength(6);
		expect(fake.writes).toEqual([
			'system imperial',
			'temperature none',
			'pressure none',
			'windSpeed none',
			'height none',
			'distance none',
			'windSpeed knots',
			'windSpeed none',
		]);
	});

	it('tells nobody and writes nothing when an override is chosen again', () => {
		const fake = createFakeUnitPreferences({
			system: 'metric',
			overrides: { temperature: 'K' },
		});
		const store = createUnitStore(fake.preferences);
		let told = 0;
		store.addListener(() => {
			told += 1;
		});
		store.setOverride('temperature', 'K');
		store.setOverride('pressure', null);
		expect(told).toBe(0);
		expect(fake.writes).toEqual([]);
	});

	it.each([
		['the other system', 'imperial'],
		['the system already chosen', 'metric'],
	] as const)(
		'clears every override, and its entry, on choosing %s, as one change',
		(_, system) => {
			const fake = createFakeUnitPreferences({
				system: 'metric',
				overrides: { temperature: 'K', windSpeed: 'knots', distance: 'mi' },
			});
			const store = createUnitStore(fake.preferences);
			const told: UnitChoice[] = [];
			store.addListener(() => told.push(store.choice()));
			store.chooseSystem(system);
			expect(store.choice()).toEqual({ system, overrides: {} });
			expect(store.units()).toEqual(SYSTEM_UNITS[system]);
			expect(told).toEqual([{ system, overrides: {} }]);
			expect(fake.writes).toEqual([
				...(system === 'imperial' ? ['system imperial'] : []),
				'temperature none',
				'pressure none',
				'windSpeed none',
				'height none',
				'distance none',
			]);
		},
	);

	it('tells nobody when the system already chosen is chosen with no overrides, and still clears each entry', () => {
		const fake = createFakeUnitPreferences({
			system: 'imperial',
			overrides: {},
		});
		const store = createUnitStore(fake.preferences);
		let told = 0;
		store.addListener(() => {
			told += 1;
		});
		store.chooseSystem('imperial');
		expect(told).toBe(0);
		expect(store.choice()).toEqual({ system: 'imperial', overrides: {} });
		expect(fake.writes).toEqual([
			'temperature none',
			'pressure none',
			'windSpeed none',
			'height none',
			'distance none',
		]);
	});

	it('keeps an override that names the system’s own unit apart from none', () => {
		const fake = createFakeUnitPreferences({
			system: 'imperial',
			overrides: {},
		});
		const store = createUnitStore(fake.preferences);
		let told = 0;
		store.addListener(() => {
			told += 1;
		});
		store.setOverride('windSpeed', 'mph');
		expect(told).toBe(1);
		expect(store.choice().overrides).toEqual({ windSpeed: 'mph' });
		store.chooseSystem('imperial');
		expect(told).toBe(2);
		expect(store.choice().overrides).toEqual({});
	});

	it('removes every override’s stored entry and the old wind speed entry on choosing a system', () => {
		const storage = createFakeStorage({
			[UNIT_SYSTEM_KEY]: 'imperial',
			[unitOverrideKey('temperature')]: 'K',
			[unitOverrideKey('windSpeed')]: 'knots',
			[OLD_WIND_SPEED_UNIT_KEY]: 'mph',
		});
		const store = createUnitStore(createPreferences(storage));
		expect(store.choice().overrides).toEqual({
			temperature: 'K',
			windSpeed: 'knots',
		});
		store.chooseSystem('metric');
		expect(storage.entries).toEqual(new Map([[UNIT_SYSTEM_KEY, 'metric']]));
		expect(createPreferences(storage).unitChoice()).toEqual({
			system: 'metric',
			overrides: {},
		});
	});

	it('gives the cleared choice for the visit where the storage will not remove the entries', () => {
		const storage = createFakeStorage({
			[unitOverrideKey('pressure')]: 'inHg',
		});
		const store = createUnitStore(
			createPreferences({
				getItem: storage.getItem,
				setItem: storage.setItem,
				removeItem: () => {
					throw new Error('Storage is blocked');
				},
			}),
		);
		let told = 0;
		store.addListener(() => {
			told += 1;
		});
		store.chooseSystem('metric');
		expect(told).toBe(1);
		expect(store.choice()).toEqual({ system: 'metric', overrides: {} });
		expect(store.units()).toEqual(SYSTEM_UNITS.metric);
		expect(storage.entries.get(unitOverrideKey('pressure'))).toBe('inHg');
	});

	it('keeps and remembers an override chosen after a system', () => {
		const fake = createFakeUnitPreferences({
			system: 'metric',
			overrides: { height: 'ft' },
		});
		const store = createUnitStore(fake.preferences);
		store.chooseSystem('imperial');
		store.setOverride('pressure', 'hPa');
		expect(store.choice()).toEqual({
			system: 'imperial',
			overrides: { pressure: 'hPa' },
		});
		expect(store.units()).toEqual({
			...SYSTEM_UNITS.imperial,
			pressure: 'hPa',
		});
		expect(fake.writes.at(-1)).toBe('pressure hPa');
	});
});

describe('compassPoint', () => {
	it('names each of the eight points at its own direction', () => {
		expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassPoint)).toEqual([
			...COMPASS_POINTS,
		]);
		expect(COMPASS_POINTS).toEqual([
			'N',
			'NE',
			'E',
			'SE',
			'S',
			'SW',
			'W',
			'NW',
		]);
	});

	it('starts each point at its lower boundary, 45° wide and centred on its direction', () => {
		const below = 1e-9;
		COMPASS_POINTS.forEach((point, index) => {
			const boundary = (index * 45 + 337.5) % 360;
			const before = COMPASS_POINTS.at(index - 1);
			expect(compassPoint(boundary), `${boundary}°`).toBe(point);
			expect(compassPoint(boundary - below), `just under ${boundary}°`).toBe(
				before,
			);
		});
	});

	it('takes 22.5° as north-east, just under it as north, and 337.5° as north', () => {
		expect(compassPoint(22.5)).toBe('NE');
		expect(compassPoint(22.499)).toBe('N');
		expect(compassPoint(337.5)).toBe('N');
		expect(compassPoint(337.499)).toBe('NW');
		expect(compassPoint(67.5)).toBe('E');
		expect(compassPoint(67.499)).toBe('NE');
	});

	it('takes a bearing below 0° or from 360° up round the circle', () => {
		expect(compassPoint(360)).toBe('N');
		expect(compassPoint(-0)).toBe('N');
		expect(compassPoint(-1)).toBe('N');
		expect(compassPoint(-22.5)).toBe('N');
		expect(compassPoint(-22.501)).toBe('NW');
		expect(compassPoint(-90)).toBe('W');
		expect(compassPoint(405)).toBe('NE');
		expect(compassPoint(720 + 180)).toBe('S');
		expect(compassPoint(-720 - 135)).toBe('SW');
	});
});

describe('windFromDeg', () => {
	it('gives the bearing the wind blows from, the other way from where it blows', () => {
		expect(windFromDeg(1, 0)).toBe(270);
		expect(windFromDeg(-1, 0)).toBe(90);
		expect(windFromDeg(0, 1)).toBe(180);
		expect(windFromDeg(0, -1)).toBe(0);
		expect(windFromDeg(-1, -1)).toBeCloseTo(45, 12);
		expect(windFromDeg(1, 1)).toBeCloseTo(225, 12);
	});

	it('stays within 0° up to but not including 360°', () => {
		for (const [east, north] of [
			[0, -1],
			[-0, -1],
			[1e-12, -1],
			[-1e-12, -1],
			[0, 0],
		] as const) {
			const deg = windFromDeg(east, north);
			expect(deg).toBeGreaterThanOrEqual(0);
			expect(deg).toBeLessThan(360);
		}
	});
});

describe('formatWind', () => {
	it('writes the speed in the unit and the point it blows from', () => {
		expect(formatWind(7.2, 45, 'm/s')).toBe('7 m/s NE');
		expect(formatWind(10, 270, 'km/h')).toBe('36 km/h W');
		expect(formatWind(10, 180, 'mph')).toBe('22 mph S');
		expect(formatWind(10, 90, 'knots')).toBe('19 knots E');
	});

	it('reads calm below 0.5 m/s in every unit, and not from 0.5 m/s', () => {
		expect(WIND_CALM_TEXT).toBe('calm');
		for (const unit of unitsOf('windSpeed')) {
			expect(formatWind(0, 0, unit), unit).toBe('calm');
			expect(formatWind(0.49, 90, unit), unit).toBe('calm');
			expect(formatWind(0.5, 90, unit), unit).not.toBe('calm');
		}
		expect(formatWind(0.5, 90, 'm/s')).toBe('1 m/s E');
		expect(formatWind(0.5, 90, 'km/h')).toBe('2 km/h E');
		expect(formatWind(0.5, 90, 'mph')).toBe('1 mph E');
	});

	it('writes a strong wind uncapped, its digits grouped in threes', () => {
		expect(formatWind(123.4, 0, 'm/s')).toBe('123 m/s N');
		expect(formatWind(300, 0, 'km/h')).toBe('1,080 km/h N');
	});
});

describe('unitSpec', () => {
	it('gives how a unit of a quantity is written and converted', () => {
		expect(unitSpec('pressure', 'inHg')).toBe(UNITS.pressure.inHg);
		expect(unitSpec('temperature', 'K').offset).toBe(273.15);
	});

	it('refuses a unit of another quantity', () => {
		const pressureOrTemperature = 'pressure' as 'pressure' | 'temperature';
		expect(() => unitSpec(pressureOrTemperature, '°F')).toThrow(RangeError);
		expect(() => formatQuantity(pressureOrTemperature, 'K', 1)).toThrow(
			RangeError,
		);
	});
});

describe('formatNumber', () => {
	it('writes a number to the decimals given, grouped, with a true minus', () => {
		expect(formatNumber(1018.4, 0)).toBe('1,018');
		expect(formatNumber(29.921, 2)).toBe('29.92');
		expect(formatNumber(-4.4, 0)).toBe('−4');
		expect(formatNumber(30, 2)).toBe('30.00');
	});

	it('signs a value above zero when asked, and never writes −0 or +0', () => {
		expect(formatNumber(2.2, 0, true)).toBe('+2');
		expect(formatNumber(-0.126, 2, true)).toBe('−0.13');
		expect(formatNumber(0.004, 2, true)).toBe('0.00');
		expect(formatNumber(-0.4, 0, true)).toBe('0');
		expect(formatNumber(-0, 0)).toBe('0');
	});
});
