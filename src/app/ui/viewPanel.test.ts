import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_DRAWN_SEA_LEVEL_M,
	MIN_DRAWN_SEA_LEVEL_M,
} from '../globe/material';
import type { UnitOf } from '../settings/units';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	findAll,
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

	it('writes metres as before when given them', () => {
		expect(formatMetres(-40, 'm')).toBe('−40 m');
		expect(formatMetres(1250, 'm')).toBe('1,250 m');
	});

	it('writes whole feet in feet, for the least, the greatest and the first few steps of the slider', () => {
		expect(formatMetres(MIN_DRAWN_SEA_LEVEL_M, 'ft')).toBe('−19,685 ft');
		expect(formatMetres(MAX_DRAWN_SEA_LEVEL_M, 'ft')).toBe('19,685 ft');
		expect(formatMetres(0, 'ft')).toBe('0 ft');
		expect(formatMetres(10, 'ft')).toBe('33 ft');
		expect(formatMetres(20, 'ft')).toBe('66 ft');
		expect(formatMetres(30, 'ft')).toBe('98 ft');
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
			[...byClass(field, 'field__range'), ...byClass(field, 'field__select')][0]
				?.id ?? '',
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
		});
		return { told, section };
	};

	it('holds the two sliders alone, in that order: no checkbox for the grid, Sunlight or Winds, nor a choice of the winds’ source, how they are drawn or their unit', () => {
		const { section, told } = make();
		expect(fieldIds(section)).toEqual(['view-exaggeration', 'view-sea-level']);
		expect(byClass(section, 'field__select')).toEqual([]);
		expect(
			byClass(section, 'field__label').map((label) => label.textContent),
		).toEqual(['Relief exaggeration', 'Sea level']);
		expect(told).toEqual([]);
	});
});

describe('the sea level in a unit', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (seaLevel: number, heightUnit?: UnitOf<'height'>) => {
		const told: string[] = [];
		const section = fake.createElement('div');
		const panel = createViewPanel(section as unknown as HTMLElement, {
			seaLevel,
			heightUnit,
			onExaggeration: (factor) => told.push(`exaggeration ${factor}`),
			onSeaLevel: (metres) => told.push(`sea level ${metres}`),
		});
		const [slider] = findAll(
			section,
			(element) => element.id === 'view-sea-level',
		);
		if (slider === undefined) {
			throw new Error('No sea-level slider');
		}
		const [output] = byClass(slider.parentNode as FakeElement, 'field__value');
		/** The sea level as shown beside the label and to a screen reader. */
		const shown = () => [
			output?.textContent,
			slider.getAttribute('aria-valuetext'),
		];
		return { told, panel, slider, shown };
	};

	it('is written in metres when no unit is given, and in metres when they are', () => {
		expect(make(-40).shown()).toEqual(['−40 m', '−40 m']);
		expect(make(1250, 'm').shown()).toEqual(['1,250 m', '1,250 m']);
	});

	it('starts in feet when given them, on a slider that steps in metres', () => {
		const { slider, shown } = make(30, 'ft');
		expect(shown()).toEqual(['98 ft', '98 ft']);
		expect(slider.value).toBe('30');
		expect(slider.step).toBe(String(SEA_LEVEL_SLIDER_STEP_M));
		expect(slider.min).toBe(String(MIN_DRAWN_SEA_LEVEL_M));
		expect(slider.max).toBe(String(MAX_DRAWN_SEA_LEVEL_M));
	});

	it('is rewritten at once in a new unit, with the slider left where it was and nothing told', () => {
		const { panel, slider, shown, told } = make(20);
		panel.setHeightUnit('ft');
		expect(shown()).toEqual(['66 ft', '66 ft']);
		expect(slider.value).toBe('20');
		panel.setHeightUnit('m');
		expect(shown()).toEqual(['20 m', '20 m']);
		expect(slider.value).toBe('20');
		expect(told).toEqual([]);
	});

	it('keeps the new unit as the slider moves and as the level is set', () => {
		const { panel, slider, shown, told } = make(0);
		panel.setHeightUnit('ft');
		slider.value = String(MAX_DRAWN_SEA_LEVEL_M);
		slider.fire('input');
		expect(told).toEqual([`sea level ${MAX_DRAWN_SEA_LEVEL_M}`]);
		expect(shown()).toEqual(['19,685 ft', '19,685 ft']);
		panel.setSeaLevel(MIN_DRAWN_SEA_LEVEL_M);
		expect(shown()).toEqual(['−19,685 ft', '−19,685 ft']);
	});
});
