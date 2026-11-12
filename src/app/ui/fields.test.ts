import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { createSegmentedPicker } from './fields';

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
