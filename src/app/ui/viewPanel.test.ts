import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_DRAWN_SEA_LEVEL_M,
	MIN_DRAWN_SEA_LEVEL_M,
} from '../globe/material';
import type { WindStyle } from '../globe/windMotion';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
} from '../testing/fakeDocument';
import type { WindUnit } from '../windUnits';
import {
	createViewPanel,
	formatExaggeration,
	formatMetres,
	SEA_LEVEL_SLIDER_STEP_M,
} from './viewPanel';

describe('formatExaggeration', () => {
	it('writes the factor with a multiplication sign', () => {
		expect(formatExaggeration(40)).toBe('40×');
		expect(formatExaggeration(1)).toBe('1×');
	});

	it('rounds to a whole factor', () => {
		expect(formatExaggeration(39.6)).toBe('40×');
	});
});

describe('formatMetres', () => {
	it('writes zero without a sign', () => {
		expect(formatMetres(0)).toBe('0 m');
		expect(formatMetres(-0.2)).toBe('0 m');
	});

	it('groups thousands', () => {
		expect(formatMetres(1250)).toBe('1,250 m');
		expect(formatMetres(6000)).toBe('6,000 m');
	});

	it('writes negatives with a minus sign rather than a hyphen', () => {
		expect(formatMetres(-40)).toBe('−40 m');
		expect(formatMetres(-6000)).toBe('−6,000 m');
	});

	it('rounds to a whole metre', () => {
		expect(formatMetres(12.4)).toBe('12 m');
	});
});

describe('the sea-level slider', () => {
	it('can be set to zero and to both ends of the drawn range', () => {
		expect(MIN_DRAWN_SEA_LEVEL_M % SEA_LEVEL_SLIDER_STEP_M).toBe(-0);
		expect(MAX_DRAWN_SEA_LEVEL_M % SEA_LEVEL_SLIDER_STEP_M).toBe(0);
	});
});

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

describe('createViewPanel', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = () => {
		const told: string[] = [];
		const section = fake.createElement('div');
		createViewPanel(section as unknown as HTMLElement, {
			seaLevel: 0,
			onExaggeration: (factor) => told.push(`exaggeration ${factor}`),
			onSeaLevel: (metres) => told.push(`sea level ${metres}`),
			onWindStyle: (style) => told.push(`wind style ${style}`),
			onWindUnit: (unit) => told.push(`wind unit ${unit}`),
		});
		return { told, section };
	};

	it('holds the two sliders and the two wind choices, in that order, and no checkbox for the grid, Sunlight or Winds, nor a choice of the winds’ source', () => {
		const { section, told } = make();
		expect(fieldIds(section)).toEqual([
			'view-exaggeration',
			'view-sea-level',
			'view-wind-style',
			'view-wind-unit',
		]);
		expect(byClass(section, 'field__checkbox')).toEqual([]);
		expect(
			byClass(section, 'field__label').map((label) => label.textContent),
		).toEqual([
			'Relief exaggeration',
			'Sea level',
			'Winds drawn as',
			'Wind speed',
		]);
		expect(told).toEqual([]);
	});
});

describe('the Wind speed choice', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (windUnit?: WindUnit) => {
		const told: string[] = [];
		const section = fake.createElement('div');
		createViewPanel(section as unknown as HTMLElement, {
			seaLevel: 0,
			windUnit,
			onExaggeration: () => {},
			onSeaLevel: () => {},
			onWindStyle: (style) => told.push(`wind style ${style}`),
			onWindUnit: (unit) => told.push(`wind unit ${unit}`),
		});
		const select = byClass(section, 'field__select').find(
			(element) => element.id === 'view-wind-unit',
		) as FakeElement;
		return { told, section, select };
	};

	it('comes last, directly under the Winds drawn as choice, labelled Wind speed, offering m/s, km/h and mph', () => {
		const { section, select } = make();
		expect(fieldIds(section).slice(-2)).toEqual([
			'view-wind-style',
			'view-wind-unit',
		]);
		expect(section.children.at(-1)?.children).toContain(select);
		const label = byClass(section, 'field__label').find(
			(element) => element.htmlFor === 'view-wind-unit',
		);
		expect(label?.textContent).toBe('Wind speed');
		expect(
			select.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['m/s', 'm/s'],
			['km/h', 'km/h'],
			['mph', 'mph'],
		]);
	});

	it('starts on m/s, or on the unit given', () => {
		expect(make().select.value).toBe('m/s');
		expect(make('mph').select.value).toBe('mph');
		expect(make('km/h').select.value).toBe('km/h');
	});

	it('shows from the start, as every field does', () => {
		const { select, section } = make();
		expect(select.hidden).toBe(false);
		expect(section.children.every((field) => field.hidden !== true)).toBe(true);
	});

	it('reports each unit chosen, and the unit alone', () => {
		const { told, select } = make();
		select.value = 'km/h';
		select.fire('change');
		select.value = 'mph';
		select.fire('change');
		select.value = 'm/s';
		select.fire('change');
		expect(told).toEqual(['wind unit km/h', 'wind unit mph', 'wind unit m/s']);
	});
});

describe('the Winds drawn as choice', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (windStyle?: WindStyle) => {
		const told: string[] = [];
		const section = fake.createElement('div');
		createViewPanel(section as unknown as HTMLElement, {
			seaLevel: 0,
			windStyle,
			onExaggeration: () => {},
			onSeaLevel: () => {},
			onWindStyle: (style) => told.push(`wind style ${style}`),
			onWindUnit: (unit) => told.push(`wind unit ${unit}`),
		});
		const select = byClass(section, 'field__select').find(
			(element) => element.id === 'view-wind-style',
		) as FakeElement;
		const field = section.children.find((child) =>
			child.children.includes(select),
		) as FakeElement;
		return { told, section, select, field };
	};

	it('comes directly under the Sea level slider, above Wind speed, offering Arrows and Streaks', () => {
		const { section, select, field } = make();
		const at = section.children.indexOf(field);
		expect(fieldIds(section).slice(at - 1, at + 2)).toEqual([
			'view-sea-level',
			'view-wind-style',
			'view-wind-unit',
		]);
		expect(select.id).toBe('view-wind-style');
		const label = byClass(section, 'field__label').find(
			(element) => element.htmlFor === 'view-wind-style',
		);
		expect(label?.textContent).toBe('Winds drawn as');
		expect(
			select.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['arrows', 'Arrows'],
			['streaks', 'Streaks'],
		]);
	});

	it('starts on Arrows, or on the way given', () => {
		expect(make().select.value).toBe('arrows');
		expect(make('streaks').select.value).toBe('streaks');
		expect(make('arrows').select.value).toBe('arrows');
	});

	it('shows from the start, telling nothing at first', () => {
		const { field, told } = make();
		expect(field.hidden).not.toBe(true);
		expect(told).toEqual([]);
	});

	it('reports each way chosen, and the way alone', () => {
		const { told, select } = make();
		select.value = 'streaks';
		select.fire('change');
		select.value = 'arrows';
		select.fire('change');
		expect(told).toEqual(['wind style streaks', 'wind style arrows']);
	});
});
