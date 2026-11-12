import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import {
	createRangeField,
	createSegmentedPicker,
	createSelectField,
} from './fields';

describe('createSegmentedPicker', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = () => {
		const chosen: string[] = [];
		const picker = createSegmentedPicker({
			name: 'fruit',
			legend: 'Fruit',
			choices: [
				{ value: 'apple', label: 'Apple' },
				{ value: 'pear', label: 'Pear' },
				{ value: 'plum', label: 'Plum' },
			],
			value: 'pear',
			onChange: (value) => chosen.push(value),
		}) as unknown as FakeElement;
		return { picker, chosen, inputs: byClass(picker, 'segmented__input') };
	};

	it('offers each choice as a radio button of one group, with its label', () => {
		const { picker, inputs } = make();
		expect(picker.tagName).toBe('FIELDSET');
		expect(picker.className).toBe('segmented');
		expect(oneByClass(picker, 'u-visually-hidden').textContent).toBe('Fruit');
		expect(
			inputs.map((input) => [input.type, input.name, input.value]),
		).toEqual([
			['radio', 'fruit', 'apple'],
			['radio', 'fruit', 'pear'],
			['radio', 'fruit', 'plum'],
		]);
		expect(
			byClass(picker, 'segmented__label').map((label) => label.textContent),
		).toEqual(['Apple', 'Pear', 'Plum']);
	});

	it('starts on the value given', () => {
		const { inputs } = make();
		expect(inputs.map((input) => input.checked)).toEqual([false, true, false]);
	});

	it('passes on each choice made', () => {
		const { inputs, chosen } = make();
		fake.pick(inputs[2] as FakeElement);
		fake.pick(inputs[0] as FakeElement);
		expect(chosen).toEqual(['plum', 'apple']);
	});

	it('passes on nothing for a button cleared', () => {
		const { inputs, chosen } = make();
		(inputs[1] as FakeElement).checked = false;
		(inputs[1] as FakeElement).fire('change');
		expect(chosen).toEqual([]);
	});
});

describe('createRangeField', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (quietValue?: boolean) => {
		const moved: number[] = [];
		const field = createRangeField({
			id: 'speed',
			label: 'Speed',
			min: 0,
			max: 10,
			step: 1,
			value: 3,
			format: (value) => `${value} km/h`,
			onInput: (value) => moved.push(value),
			quietValue,
		});
		const root = field.element as unknown as FakeElement;
		return {
			field,
			moved,
			input: oneByClass(root, 'field__range'),
			output: oneByClass(root, 'field__value'),
		};
	};

	it('writes its value beside the label and for screen readers', () => {
		const { input, output } = make();
		expect(output.textContent).toBe('3 km/h');
		expect(input.getAttribute('aria-valuetext')).toBe('3 km/h');
	});

	it('writes and passes on the value it is moved to', () => {
		const { input, output, moved } = make();
		input.value = '7';
		input.fire('input');
		expect(moved).toEqual([7]);
		expect(output.textContent).toBe('7 km/h');
		expect(input.getAttribute('aria-valuetext')).toBe('7 km/h');
	});

	it('moves to a value it is given without passing it on', () => {
		const { field, input, output, moved } = make();
		field.setValue(9);
		expect(input.value).toBe('9');
		expect(output.textContent).toBe('9 km/h');
		expect(input.getAttribute('aria-valuetext')).toBe('9 km/h');
		expect(moved).toEqual([]);
	});

	it('leaves its value to be read out as it changes unless kept quiet', () => {
		expect(make().output.getAttribute('aria-live')).toBeNull();
		expect(make(false).output.getAttribute('aria-live')).toBeNull();
	});

	it('keeps its value from being read out when asked, still writing it', () => {
		const { field, input, output } = make(true);
		expect(output.getAttribute('aria-live')).toBe('off');
		field.setValue(5);
		expect(output.textContent).toBe('5 km/h');
		expect(input.getAttribute('aria-valuetext')).toBe('5 km/h');
	});
});

describe('createSelectField', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = () => {
		const chosen: string[] = [];
		const field = createSelectField({
			id: 'fruit',
			label: 'Fruit',
			choices: [
				{ value: 'apple', label: 'Apple' },
				{ value: 'pear', label: 'Pear' },
			],
			value: 'pear',
			onChange: (value) => chosen.push(value),
		}) as unknown as FakeElement;
		return { field, chosen, select: oneByClass(field, 'field__select') };
	};

	it('labels a drop-down of the choices, on the value given', () => {
		const { field, select } = make();
		const label = oneByClass(field, 'field__label');
		expect(label.textContent).toBe('Fruit');
		expect(label.htmlFor).toBe('fruit');
		expect(select.tagName).toBe('SELECT');
		expect(select.id).toBe('fruit');
		expect(
			select.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['apple', 'Apple'],
			['pear', 'Pear'],
		]);
		expect(select.value).toBe('pear');
	});

	it('passes on each choice made', () => {
		const { select, chosen } = make();
		select.value = 'apple';
		select.fire('change');
		expect(chosen).toEqual(['apple']);
	});

	it('passes on nothing for a value it does not offer', () => {
		const { select, chosen } = make();
		select.value = 'plum';
		select.fire('change');
		expect(chosen).toEqual([]);
	});
});
