import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WindStyle } from '../globe/windMotion';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { DEFAULT_UNIT_CHOICE, QUANTITIES, type UnitChoice } from '../units';
import {
	AS_THE_SYSTEM,
	asTheSystemLabel,
	createSettingsPanel,
	UNIT_SYSTEM_NAME,
	unitSelectId,
} from './settingsPanel';

/** The ids of the drop-downs a body holds, in order. */
const selectIds = (body: FakeElement): string[] =>
	byClass(body, 'field__select').map((select) => select.id);

describe('createSettingsPanel', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/**
	 * The settings in a section of their own.
	 *
	 * @param windStyle - How the winds are drawn at first.
	 * @param units - The units chosen at first.
	 */
	const make = (
		windStyle: WindStyle = 'streaks',
		units: UnitChoice = DEFAULT_UNIT_CHOICE,
	) => {
		const told: string[] = [];
		const section = fake.createElement('div');
		const panel = createSettingsPanel(section as unknown as HTMLElement, {
			windStyle,
			units,
			onWindStyle: (style) => told.push(`wind style ${style}`),
			onUnitSystem: (system) => told.push(`system ${system}`),
			onUnitOverride: (quantity, unit) =>
				told.push(`${quantity} ${unit ?? 'none'}`),
		});
		const select = (id: string): FakeElement =>
			byClass(section, 'field__select').find(
				(element) => element.id === id,
			) as FakeElement;
		const systems = byClass(section, 'segmented__input');
		/** What a quantity's drop-down offers, as value and text. */
		const offered = (id: string) =>
			select(id).children.map((option) => [option.value, option.textContent]);
		return {
			told,
			section,
			panel,
			systems,
			offered,
			style: select('settings-wind-style'),
			unit: (quantity: (typeof QUANTITIES)[number]) =>
				select(unitSelectId(quantity)),
			checkedSystems: () =>
				systems.filter((input) => input.checked).map((input) => input.value),
		};
	};

	it('holds Winds drawn as, then the Units group of the system and a drop-down per quantity', () => {
		const { section, told, systems } = make();
		expect(section.children).toHaveLength(2);
		expect(selectIds(section)).toEqual([
			'settings-wind-style',
			'settings-unit-temperature',
			'settings-unit-pressure',
			'settings-unit-windSpeed',
			'settings-unit-height',
			'settings-unit-distance',
		]);
		expect(
			byClass(section, 'field__label').map((label) => [
				label.htmlFor,
				label.textContent,
			]),
		).toEqual([
			['settings-wind-style', 'Winds drawn as'],
			['settings-unit-temperature', 'Temperature'],
			['settings-unit-pressure', 'Pressure'],
			['settings-unit-windSpeed', 'Wind speed'],
			['settings-unit-height', 'Heights and depths'],
			['settings-unit-distance', 'Distances'],
		]);
		const group = oneByClass(section, 'settings-units');
		expect(section.children[1]).toBe(group);
		expect(group.getAttribute('role')).toBe('group');
		const heading = oneByClass(group, 'settings-units__heading');
		expect(heading.textContent).toBe('Units');
		expect(group.getAttribute('aria-labelledby')).toBe(heading.id);
		expect(group.children[1]).toBe(oneByClass(group, 'segmented'));
		expect(
			systems.map((input) => [input.name, input.value, input.checked]),
		).toEqual([
			[UNIT_SYSTEM_NAME, 'metric', true],
			[UNIT_SYSTEM_NAME, 'imperial', false],
		]);
		expect(
			byClass(group, 'segmented__label').map((label) => label.textContent),
		).toEqual(['Metric', 'Imperial']);
		expect(told).toEqual([]);
	});

	it('adds them after what the section holds', () => {
		const fakeSection = fake.createElement('div');
		const first = fake.createElement('p');
		fakeSection.append(first);
		createSettingsPanel(fakeSection as unknown as HTMLElement, {
			windStyle: 'arrows',
			units: DEFAULT_UNIT_CHOICE,
			onWindStyle: () => {},
			onUnitSystem: () => {},
			onUnitOverride: () => {},
		});
		expect(fakeSection.children).toHaveLength(3);
		expect(fakeSection.children[0]).toBe(first);
	});

	it('offers Arrows and Streaks, and for each quantity As the system then its units', () => {
		const { style, offered } = make();
		expect(
			style.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['arrows', 'Arrows'],
			['streaks', 'Streaks'],
		]);
		expect(offered('settings-unit-temperature')).toEqual([
			[AS_THE_SYSTEM, 'As the system (°C)'],
			['°C', '°C'],
			['°F', '°F'],
			['K', 'K'],
		]);
		expect(offered('settings-unit-pressure')).toEqual([
			[AS_THE_SYSTEM, 'As the system (hPa)'],
			['hPa', 'hPa'],
			['inHg', 'inHg'],
		]);
		expect(offered('settings-unit-windSpeed')).toEqual([
			[AS_THE_SYSTEM, 'As the system (m/s)'],
			['m/s', 'm/s'],
			['mph', 'mph'],
			['km/h', 'km/h'],
			['knots', 'knots'],
		]);
		expect(offered('settings-unit-height')).toEqual([
			[AS_THE_SYSTEM, 'As the system (m)'],
			['m', 'm'],
			['ft', 'ft'],
		]);
		expect(offered('settings-unit-distance')).toEqual([
			[AS_THE_SYSTEM, 'As the system (km)'],
			['km', 'km'],
			['mi', 'mi'],
		]);
	});

	it('starts on the way and the units given, naming the system’s units', () => {
		expect(make('streaks').style.value).toBe('streaks');
		expect(make('arrows').style.value).toBe('arrows');
		const { unit, offered, checkedSystems } = make('streaks', {
			system: 'imperial',
			overrides: { temperature: 'K', windSpeed: 'knots' },
		});
		expect(checkedSystems()).toEqual(['imperial']);
		expect(QUANTITIES.map((quantity) => unit(quantity).value)).toEqual([
			'K',
			AS_THE_SYSTEM,
			'knots',
			AS_THE_SYSTEM,
			AS_THE_SYSTEM,
		]);
		expect(
			QUANTITIES.map(
				(quantity) => offered(unitSelectId(quantity))[0]?.[1] ?? '',
			),
		).toEqual([
			'As the system (°F)',
			'As the system (inHg)',
			'As the system (mph)',
			'As the system (ft)',
			'As the system (mi)',
		]);
	});

	it('shows everything from the start', () => {
		const { section } = make();
		expect(section.children.every((field) => field.hidden !== true)).toBe(true);
	});

	it('reports each way chosen, and the way alone', () => {
		const { told, style } = make();
		style.value = 'arrows';
		style.fire('change');
		style.value = 'streaks';
		style.fire('change');
		expect(told).toEqual(['wind style arrows', 'wind style streaks']);
	});

	it('reports the system chosen, and changes nothing itself', () => {
		const { told, systems, offered } = make();
		fake.pick(systems[1] as FakeElement);
		expect(told).toEqual(['system imperial']);
		expect(offered('settings-unit-windSpeed')[0]).toEqual([
			AS_THE_SYSTEM,
			'As the system (m/s)',
		]);
	});

	it('reports each unit chosen, and none for As the system', () => {
		const { told, unit } = make();
		unit('windSpeed').value = 'knots';
		unit('windSpeed').fire('change');
		unit('temperature').value = 'K';
		unit('temperature').fire('change');
		unit('windSpeed').value = AS_THE_SYSTEM;
		unit('windSpeed').fire('change');
		unit('distance').value = 'mi';
		unit('distance').fire('change');
		expect(told).toEqual([
			'windSpeed knots',
			'temperature K',
			'windSpeed none',
			'distance mi',
		]);
	});

	it('shows units chosen elsewhere, renaming each As the system, without reporting them', () => {
		const { told, panel, unit, offered, checkedSystems } = make('streaks', {
			system: 'metric',
			overrides: { pressure: 'inHg' },
		});
		panel.showUnits({
			system: 'imperial',
			overrides: { height: 'm' },
		});
		expect(checkedSystems()).toEqual(['imperial']);
		expect(QUANTITIES.map((quantity) => unit(quantity).value)).toEqual([
			AS_THE_SYSTEM,
			AS_THE_SYSTEM,
			AS_THE_SYSTEM,
			'm',
			AS_THE_SYSTEM,
		]);
		expect(offered('settings-unit-temperature')[0]).toEqual([
			AS_THE_SYSTEM,
			'As the system (°F)',
		]);
		expect(offered('settings-unit-windSpeed')[0]).toEqual([
			AS_THE_SYSTEM,
			'As the system (mph)',
		]);
		panel.showUnits(DEFAULT_UNIT_CHOICE);
		expect(checkedSystems()).toEqual(['metric']);
		expect(offered('settings-unit-height')[0]).toEqual([
			AS_THE_SYSTEM,
			'As the system (m)',
		]);
		expect(told).toEqual([]);
	});

	it('names the unit each system gives in As the system', () => {
		expect(asTheSystemLabel('metric', 'temperature')).toBe(
			'As the system (°C)',
		);
		expect(asTheSystemLabel('imperial', 'pressure')).toBe(
			'As the system (inHg)',
		);
	});
});
