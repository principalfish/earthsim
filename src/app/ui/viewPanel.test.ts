import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_DRAWN_SEA_LEVEL_M,
	MIN_DRAWN_SEA_LEVEL_M,
} from '../globe/material';
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

describe('createViewPanel', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (sunlight?: boolean, winds?: boolean) => {
		const told: string[] = [];
		const section = fake.createElement('div');
		createViewPanel(section as unknown as HTMLElement, {
			seaLevel: 0,
			sunlight,
			winds,
			onExaggeration: (factor) => told.push(`exaggeration ${factor}`),
			onSeaLevel: (metres) => told.push(`sea level ${metres}`),
			onGridVisible: (visible) => told.push(`grid ${visible}`),
			onSunlight: (on) => told.push(`sunlight ${on}`),
			onWinds: (on) => told.push(`winds ${on}`),
			onWindUnit: (unit) => told.push(`wind unit ${unit}`),
			onWindSource: (source) => told.push(`wind source ${source}`),
		});
		const box = (id: string): FakeElement => {
			const found = byClass(section, 'field__checkbox').find(
				(input) => input.id === id,
			);
			if (found === undefined) {
				throw new Error(`No checkbox ${id}`);
			}
			return found;
		};
		return { told, section, box };
	};

	it('puts a Sunlight checkbox under Show cell grid, cleared', () => {
		const { section, box } = make();
		expect(
			byClass(section, 'field__checkbox').map((input) => input.id),
		).toEqual(['view-grid', 'view-sunlight', 'view-winds']);
		const label = byClass(section, 'field__label').find(
			(element) => element.htmlFor === 'view-sunlight',
		);
		expect(label?.textContent).toBe('Sunlight');
		expect(box('view-sunlight').checked).toBe(false);
	});

	it('starts the Sunlight checkbox on the setting given', () => {
		expect(make(true).box('view-sunlight').checked).toBe(true);
	});

	it('reports each change of the Sunlight checkbox as the sunlight, and a change of the grid checkbox as the grid alone', () => {
		const { told, box } = make();
		const sunlight = box('view-sunlight');
		sunlight.checked = true;
		sunlight.fire('change');
		sunlight.checked = false;
		sunlight.fire('change');
		const grid = box('view-grid');
		grid.checked = true;
		grid.fire('change');
		expect(told).toEqual(['sunlight true', 'sunlight false', 'grid true']);
	});
});

describe('the Winds checkbox', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (winds?: boolean) => {
		const told: string[] = [];
		const section = fake.createElement('div');
		createViewPanel(section as unknown as HTMLElement, {
			seaLevel: 0,
			winds,
			onExaggeration: () => {},
			onSeaLevel: () => {},
			onGridVisible: (visible) => told.push(`grid ${visible}`),
			onSunlight: (on) => told.push(`sunlight ${on}`),
			onWinds: (on) => told.push(`winds ${on}`),
			onWindUnit: (unit) => told.push(`wind unit ${unit}`),
			onWindSource: (source) => told.push(`wind source ${source}`),
		});
		const box = byClass(section, 'field__checkbox').find(
			(input) => input.id === 'view-winds',
		);
		if (box === undefined) {
			throw new Error('No Winds checkbox');
		}
		return { told, section, box };
	};

	it('comes after Sunlight, labelled Winds and cleared', () => {
		const { section, box } = make();
		const ids = byClass(section, 'field__checkbox').map((input) => input.id);
		expect(ids.indexOf('view-winds')).toBe(ids.indexOf('view-sunlight') + 1);
		const label = byClass(section, 'field__label').find(
			(element) => element.htmlFor === 'view-winds',
		);
		expect(label?.textContent).toBe('Winds');
		expect(box.checked).toBe(false);
	});

	it('starts on the setting given', () => {
		expect(make(true).box.checked).toBe(true);
	});

	it('reports each change as the winds alone', () => {
		const { told, box } = make();
		box.checked = true;
		box.fire('change');
		box.checked = false;
		box.fire('change');
		expect(told).toEqual(['winds true', 'winds false']);
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

	const make = (windUnit?: WindUnit, winds?: boolean) => {
		const told: string[] = [];
		const section = fake.createElement('div');
		createViewPanel(section as unknown as HTMLElement, {
			seaLevel: 0,
			winds,
			windUnit,
			onExaggeration: () => {},
			onSeaLevel: () => {},
			onGridVisible: () => {},
			onSunlight: () => {},
			onWinds: (on) => told.push(`winds ${on}`),
			onWindUnit: (unit) => told.push(`wind unit ${unit}`),
			onWindSource: (source) => told.push(`wind source ${source}`),
		});
		const select = byClass(section, 'field__select').find(
			(element) => element.id === 'view-wind-unit',
		) as FakeElement;
		return { told, section, select };
	};

	it('comes directly under the Winds shown choice, under the Winds checkbox, labelled Wind speed, offering m/s, km/h and mph', () => {
		const { section, select } = make();
		const fields = section.children;
		const winds = fields.findIndex((field) =>
			byClass(field, 'field__checkbox').some(
				(input) => input.id === 'view-winds',
			),
		);
		expect(
			byClass(fields[winds + 1] as FakeElement, 'field__select')[0]?.id,
		).toBe('view-wind-source');
		expect(fields[winds + 2]?.children).toContain(select);
		expect(fields).toHaveLength(winds + 3);
		expect(select.id).toBe('view-wind-unit');
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

	it('shows whether or not the winds are shown', () => {
		for (const winds of [false, true]) {
			const { select, section } = make(undefined, winds);
			expect(select.hidden).toBe(false);
			// Every field but the Winds shown choice, which is hidden until
			// it is offered.
			expect(
				section.children
					.filter(
						(field) =>
							byClass(field, 'field__select')[0]?.id !== 'view-wind-source',
					)
					.every((field) => field.hidden !== true),
			).toBe(true);
		}
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
			onGridVisible: () => {},
			onSunlight: () => {},
			onWinds: (on) => told.push(`winds ${on}`),
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

	it('comes directly under the Winds checkbox, above Wind speed, offering Simulated and Observed', () => {
		const { section, select } = make();
		const fields = section.children;
		const winds = fields.findIndex((field) =>
			byClass(field, 'field__checkbox').some(
				(input) => input.id === 'view-winds',
			),
		);
		expect(fields[winds + 1]?.children).toContain(select);
		expect(
			byClass(fields[winds + 2] as FakeElement, 'field__select')[0]?.id,
		).toBe('view-wind-unit');
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
