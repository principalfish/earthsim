import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WindStyle } from '../globe/windMotion';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
} from '../testing/fakeDocument';
import type { WindUnit } from '../windUnits';
import { createSettingsPanel } from './settingsPanel';

/** The id of the control each field of a section holds, in order. */
const fieldIds = (section: FakeElement): string[] =>
	section.children.map(
		(field) =>
			[
				...byClass(field, 'field__range'),
				...byClass(field, 'field__select'),
				...byClass(field, 'field__checkbox'),
			][0]?.id ?? '',
	);

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
	 * @param windUnit - The unit wind speeds are written in at first.
	 */
	const make = (
		windStyle: WindStyle = 'streaks',
		windUnit: WindUnit = 'm/s',
	) => {
		const told: string[] = [];
		const section = fake.createElement('div');
		createSettingsPanel(section as unknown as HTMLElement, {
			windStyle,
			windUnit,
			onWindStyle: (style) => told.push(`wind style ${style}`),
			onWindUnit: (unit) => told.push(`wind unit ${unit}`),
		});
		const select = (id: string): FakeElement =>
			byClass(section, 'field__select').find(
				(element) => element.id === id,
			) as FakeElement;
		return {
			told,
			section,
			style: select('settings-wind-style'),
			unit: select('settings-wind-unit'),
		};
	};

	it('holds the Winds drawn as choice, then the Wind speed choice, and nothing else', () => {
		const { section, told } = make();
		expect(fieldIds(section)).toEqual([
			'settings-wind-style',
			'settings-wind-unit',
		]);
		expect(byClass(section, 'field__range')).toEqual([]);
		expect(byClass(section, 'field__checkbox')).toEqual([]);
		expect(
			byClass(section, 'field__label').map((label) => [
				label.htmlFor,
				label.textContent,
			]),
		).toEqual([
			['settings-wind-style', 'Winds drawn as'],
			['settings-wind-unit', 'Wind speed'],
		]);
		expect(told).toEqual([]);
	});

	it('adds them after what the section holds', () => {
		const fakeSection = fake.createElement('div');
		const first = fake.createElement('p');
		fakeSection.append(first);
		createSettingsPanel(fakeSection as unknown as HTMLElement, {
			windStyle: 'arrows',
			windUnit: 'mph',
			onWindStyle: () => {},
			onWindUnit: () => {},
		});
		expect(fakeSection.children).toHaveLength(3);
		expect(fakeSection.children[0]).toBe(first);
	});

	it('offers Arrows and Streaks, and m/s, km/h and mph', () => {
		const { style, unit } = make();
		expect(
			style.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['arrows', 'Arrows'],
			['streaks', 'Streaks'],
		]);
		expect(
			unit.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['m/s', 'm/s'],
			['km/h', 'km/h'],
			['mph', 'mph'],
		]);
	});

	it('starts on the way and the unit given', () => {
		expect(make('streaks').style.value).toBe('streaks');
		expect(make('arrows').style.value).toBe('arrows');
		expect(make('streaks', 'm/s').unit.value).toBe('m/s');
		expect(make('streaks', 'km/h').unit.value).toBe('km/h');
		expect(make('streaks', 'mph').unit.value).toBe('mph');
	});

	it('shows both from the start', () => {
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

	it('reports each unit chosen, and the unit alone', () => {
		const { told, unit } = make();
		unit.value = 'km/h';
		unit.fire('change');
		unit.value = 'mph';
		unit.fire('change');
		unit.value = 'm/s';
		unit.fire('change');
		expect(told).toEqual(['wind unit km/h', 'wind unit mph', 'wind unit m/s']);
	});
});
