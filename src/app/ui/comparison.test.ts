import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import type { TemperatureSource } from '../view';
import { createComparisonControls } from './comparison';

describe('createComparisonControls', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (source: TemperatureSource = 'simulated') => {
		const chosen: TemperatureSource[] = [];
		const container = fake.createElement('div');
		const controls = createComparisonControls(
			container as unknown as HTMLElement,
			{ source, onSource: (next) => chosen.push(next) },
		);
		const [root] = container.children as [FakeElement];
		return {
			controls,
			chosen,
			root,
			inputs: byClass(root, 'segmented__input'),
			message: oneByClass(root, 'comparison__message'),
		};
	};

	it('adds itself to the container, hidden', () => {
		const { controls, root } = make();
		expect(root.className).toBe('comparison');
		expect(root.hidden).toBe(true);
		expect(controls.element).toBe(root as unknown as HTMLElement);
	});

	it('offers the three sources as one group, starting on the one given', () => {
		const { root, inputs } = make('difference');
		expect(oneByClass(root, 'u-visually-hidden').textContent).toBe(
			'Temperature source',
		);
		expect(
			inputs.map((input) => [input.name, input.value, input.checked]),
		).toEqual([
			['temperature-source', 'simulated', false],
			['temperature-source', 'observed', false],
			['temperature-source', 'difference', true],
		]);
		expect(
			byClass(root, 'segmented__label').map((label) => label.textContent),
		).toEqual(['Simulated', 'Observed', 'Difference']);
	});

	it('passes on each choice made', () => {
		const { chosen, inputs } = make();
		fake.pick(inputs[1] as FakeElement);
		fake.pick(inputs[2] as FakeElement);
		expect(chosen).toEqual(['observed', 'difference']);
	});

	it('shows what it is told: offered or not, the source and the message', () => {
		const { controls, root, inputs, message, chosen } = make();
		expect(message.getAttribute('aria-live')).toBe('polite');
		controls.show({ offered: true, source: 'observed', message: 'Loading' });
		expect(root.hidden).toBe(false);
		expect(inputs.map((input) => input.checked)).toEqual([false, true, false]);
		expect(message.textContent).toBe('Loading');
		controls.show({ offered: true, source: 'simulated', message: null });
		expect(inputs.map((input) => input.checked)).toEqual([true, false, false]);
		expect(message.textContent).toBe('');
		expect(message.hidden).toBe(false);
		controls.show({ offered: false, source: 'simulated', message: null });
		expect(root.hidden).toBe(true);
		// Showing a source is not choosing one.
		expect(chosen).toEqual([]);
	});
});
