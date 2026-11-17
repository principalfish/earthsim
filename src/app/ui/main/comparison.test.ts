import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCES, type Source, WIND_SOURCES } from '../../layers/view';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../../testing/fakeDocument';
import {
	COMPARISON_LEGEND,
	COMPARISON_NAME,
	createComparisonControls,
} from './comparison';

describe('createComparisonControls', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (source: Source = 'simulated') => {
		const chosen: Source[] = [];
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
			options: byClass(root, 'segmented__option'),
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

	it('offers the three sources as one group named Source, starting on the one given', () => {
		const { root, inputs } = make('difference');
		expect(oneByClass(root, 'u-visually-hidden').textContent).toBe('Source');
		expect(COMPARISON_LEGEND).toBe('Source');
		expect(
			inputs.map((input) => [input.name, input.value, input.checked]),
		).toEqual([
			[COMPARISON_NAME, 'simulated', false],
			[COMPARISON_NAME, 'observed', false],
			[COMPARISON_NAME, 'difference', true],
		]);
		expect(COMPARISON_NAME).toBe('source');
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

	it('shows what it is told: what is offered, the source and the message', () => {
		const { controls, root, inputs, message, chosen } = make();
		expect(message.getAttribute('aria-live')).toBe('polite');
		controls.show({ offered: SOURCES, source: 'observed', message: 'Loading' });
		expect(root.hidden).toBe(false);
		expect(inputs.map((input) => input.checked)).toEqual([false, true, false]);
		expect(message.textContent).toBe('Loading');
		controls.show({ offered: SOURCES, source: 'simulated', message: null });
		expect(inputs.map((input) => input.checked)).toEqual([true, false, false]);
		expect(message.textContent).toBe('');
		expect(message.hidden).toBe(false);
		controls.show({ offered: [], source: 'simulated', message: null });
		expect(root.hidden).toBe(true);
		// Showing a source is not choosing one.
		expect(chosen).toEqual([]);
	});

	it('shows only the sources offered, Simulated and Observed for the winds alone, and all three again after', () => {
		const { controls, root, options, inputs } = make();
		controls.show({
			offered: WIND_SOURCES,
			source: 'observed',
			message: null,
		});
		expect(root.hidden).toBe(false);
		expect(options.map((option) => option.hidden)).toEqual([
			false,
			false,
			true,
		]);
		expect(inputs.map((input) => input.disabled)).toEqual([false, false, true]);
		controls.show({ offered: SOURCES, source: 'difference', message: null });
		expect(options.map((option) => option.hidden)).toEqual([
			false,
			false,
			false,
		]);
		expect(inputs.map((input) => input.disabled)).toEqual([
			false,
			false,
			false,
		]);
		expect(inputs.map((input) => input.checked)).toEqual([false, false, true]);
	});
});
