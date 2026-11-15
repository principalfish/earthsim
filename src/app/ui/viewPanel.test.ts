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
			onWindSource: (source) => told.push(`wind source ${source}`),
		});
		return { told, section };
	};

	it('holds the two sliders and the three wind choices, in that order, and no checkbox for the grid, Sunlight or Winds', () => {
		const { section, told } = make();
		expect(fieldIds(section)).toEqual([
			'view-exaggeration',
			'view-sea-level',
			'view-wind-style',
			'view-wind-source',
			'view-wind-unit',
		]);
		expect(byClass(section, 'field__checkbox')).toEqual([]);
		expect(
			byClass(section, 'field__label').map((label) => label.textContent),
		).toEqual([
			'Relief exaggeration',
			'Sea level',
			'Winds drawn as',
			'Winds shown',
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
			onWindSource: (source) => told.push(`wind source ${source}`),
		});
		const select = byClass(section, 'field__select').find(
			(element) => element.id === 'view-wind-unit',
		) as FakeElement;
		return { told, section, select };
	};

	it('comes last, directly under the Winds shown choice, labelled Wind speed, offering m/s, km/h and mph', () => {
		const { section, select } = make();
		expect(fieldIds(section).slice(-2)).toEqual([
			'view-wind-source',
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

	it('shows from the start, as every field does but the Winds shown choice', () => {
		const { select, section } = make();
		expect(select.hidden).toBe(false);
		// The Winds shown choice is hidden until it is offered.
		expect(
			section.children
				.filter(
					(field) =>
						byClass(field, 'field__select')[0]?.id !== 'view-wind-source',
				)
				.every((field) => field.hidden !== true),
		).toBe(true);
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

describe('the Winds shown choice', () => {
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
		const panel = createViewPanel(section as unknown as HTMLElement, {
			seaLevel: 0,
			onExaggeration: () => {},
			onSeaLevel: () => {},
			onWindStyle: (style) => told.push(`wind style ${style}`),
			onWindUnit: (unit) => told.push(`wind unit ${unit}`),
			onWindSource: (source) => told.push(`wind source ${source}`),
		});
		const select = byClass(section, 'field__select').find(
			(element) => element.id === 'view-wind-source',
		) as FakeElement;
		const field = section.children.find((child) =>
			child.children.includes(select),
		) as FakeElement;
		return { told, section, select, field, panel };
	};

	it('comes directly under Winds drawn as, above Wind speed, offering Simulated and Observed', () => {
		const { section, select, field } = make();
		const at = section.children.indexOf(field);
		expect(fieldIds(section).slice(at - 1, at + 2)).toEqual([
			'view-wind-style',
			'view-wind-source',
			'view-wind-unit',
		]);
		expect(select.id).toBe('view-wind-source');
		const label = byClass(section, 'field__label').find(
			(element) => element.htmlFor === 'view-wind-source',
		);
		expect(label?.textContent).toBe('Winds shown');
		expect(
			select.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['simulated', 'Simulated'],
			['observed', 'Observed'],
		]);
	});

	it('starts hidden, on Simulated, and is shown, hidden and set as told, telling nothing', () => {
		const { told, select, field, panel } = make();
		expect(field.hidden).toBe(true);
		expect(select.value).toBe('simulated');
		panel.showWindSource({ offered: true, source: 'simulated' });
		expect(field.hidden).toBe(false);
		panel.showWindSource({ offered: true, source: 'observed' });
		expect(select.value).toBe('observed');
		panel.showWindSource({ offered: false, source: 'simulated' });
		expect(field.hidden).toBe(true);
		expect(select.value).toBe('simulated');
		expect(told).toEqual([]);
	});

	it('reports each source chosen, and the source alone', () => {
		const { told, select, panel } = make();
		panel.showWindSource({ offered: true, source: 'simulated' });
		select.value = 'observed';
		select.fire('change');
		select.value = 'simulated';
		select.fire('change');
		expect(told).toEqual(['wind source observed', 'wind source simulated']);
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
			onWindSource: (source) => told.push(`wind source ${source}`),
		});
		const select = byClass(section, 'field__select').find(
			(element) => element.id === 'view-wind-style',
		) as FakeElement;
		const field = section.children.find((child) =>
			child.children.includes(select),
		) as FakeElement;
		return { told, section, select, field };
	};

	it('comes directly under the Sea level slider, above Winds shown, offering Arrows and Streaks', () => {
		const { section, select, field } = make();
		const at = section.children.indexOf(field);
		expect(fieldIds(section).slice(at - 1, at + 2)).toEqual([
			'view-sea-level',
			'view-wind-style',
			'view-wind-source',
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
