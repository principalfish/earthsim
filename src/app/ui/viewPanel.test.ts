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
