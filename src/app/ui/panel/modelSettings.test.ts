import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	type ConfigSection,
	defineSection,
	formatConfigValue,
	TEMPERATURE_CONFIG,
	WIND_CONFIG,
} from '../../../core/index';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	findAll,
	oneByClass,
} from '../../testing/fakeDocument';
import {
	CLOSE_LABEL,
	ENTRY_TEXTS,
	MODEL_SETTINGS_SECTIONS,
	MODEL_SETTINGS_TITLE,
	openModelSettings,
	panelId,
	TUNED_MARK,
	tabId,
} from './modelSettings';

const entry = {
	unit: 'K',
	what: 'What it does',
	raising: 'Up',
	lowering: 'Down',
	source: 'A guess.',
};

const small: ConfigSection = defineSection(
	'Made up',
	[
		{
			title: 'First group',
			settings: {
				tuned: { ...entry, value: 2.5e8, tuned: 'Against the Earth.' },
				plain: { ...entry, value: 20, tuned: null },
			},
		},
		{
			title: 'Second group',
			numerical: true,
			settings: { steps: { ...entry, unit: 'steps', value: 2, tuned: null } },
		},
	],
	{ title: 'Fixed', settings: { limit: { ...entry, value: 5, tuned: null } } },
);

/** The names of a section's settings, in the order the screen lists them. */
const namesOf = (section: ConfigSection): string[] => [
	...section.groups.flatMap((group) => Object.keys(group.settings)),
	...Object.keys(section.constants.settings),
];

describe('openModelSettings', () => {
	let fake: FakeDocument;
	let shown: number;
	let closed: number;
	beforeEach(() => {
		fake = createFakeDocument();
		shown = 0;
		closed = 0;
		vi.stubGlobal('document', {
			...fake.document,
			createElement: (tag: string) => {
				const element = fake.createElement(tag);
				// The stand-in has no dialogs of its own: this one counts how it
				// is opened and closed, and takes itself out as a dialog does.
				return tag === 'dialog'
					? Object.assign(element, {
							showModal: () => {
								shown++;
							},
							close: () => {
								closed++;
								element.fire('close');
							},
							remove: () => {
								element.parentNode = null;
							},
						})
					: element;
			},
		});
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const open = (sections?: readonly ConfigSection[]) => {
		const parent = fake.createElement('div');
		const dialog = openModelSettings({
			sections,
			parent: parent as unknown as HTMLElement,
		}) as unknown as FakeElement;
		const tabs = byClass(dialog, 'model-settings__tab');
		const panels = byClass(dialog, 'model-settings__panel');
		return { parent, dialog, tabs, panels };
	};

	/** What a card shows, as its name, value, mark and labelled texts. */
	const cardOf = (card: FakeElement) => ({
		name: oneByClass(card, 'model-setting__name').textContent,
		value: oneByClass(card, 'model-setting__value').textContent,
		marked: byClass(card, 'model-setting__tuned').map(
			(mark) => mark.textContent,
		),
		texts: byClass(card, 'model-setting__label').map((label, index) => [
			label.textContent,
			(byClass(card, 'model-setting__text')[index] as FakeElement).textContent,
		]),
	});

	it('opens a modal dialog, titled, in the parent', () => {
		const { parent, dialog } = open();
		expect(shown).toBe(1);
		expect(parent.children).toEqual([dialog]);
		expect(dialog.tagName).toBe('DIALOG');
		const title = oneByClass(dialog, 'dialog__title');
		expect(title.textContent).toBe(MODEL_SETTINGS_TITLE);
		expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
	});

	it('goes in the body of the page when no parent is given', () => {
		const body = fake.createElement('body');
		vi.stubGlobal('document', { ...document, body });
		const dialog = openModelSettings() as unknown as FakeElement;
		expect(body.children).toEqual([dialog]);
		expect(shown).toBe(1);
	});

	it('starts each tab at the top of the body when it is chosen', () => {
		const { dialog, tabs } = open();
		const body = oneByClass(dialog, 'model-settings__body') as FakeElement & {
			scrollTop: number;
		};
		body.scrollTop = 300;
		tabs[1]?.fire('click');
		expect(body.scrollTop).toBe(0);
	});

	it('has a tab for each model, the first chosen, each controlling its panel', () => {
		const { dialog, tabs, panels } = open();
		expect(tabs.map((tab) => tab.textContent)).toEqual([
			'Temperature',
			'Winds',
		]);
		expect(
			oneByClass(dialog, 'model-settings__tabs').getAttribute('role'),
		).toBe('tablist');
		expect(tabs.map((tab) => tab.getAttribute('role'))).toEqual(['tab', 'tab']);
		expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
			'true',
			'false',
		]);
		expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1]);
		expect(panels.map((panel) => panel.hidden)).toEqual([false, true]);
		tabs.forEach((tab, index) => {
			expect(tab.id).toBe(tabId(index));
			expect(tab.getAttribute('aria-controls')).toBe(panelId(index));
			const panel = panels[index] as FakeElement;
			expect(panel.id).toBe(panelId(index));
			expect(panel.getAttribute('role')).toBe('tabpanel');
			expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
		});
	});

	it('lists every setting of both models once, in group order, the fixed choices last', () => {
		const { panels } = open();
		expect(MODEL_SETTINGS_SECTIONS).toEqual([TEMPERATURE_CONFIG, WIND_CONFIG]);
		MODEL_SETTINGS_SECTIONS.forEach((section, index) => {
			const panel = panels[index] as FakeElement;
			expect(
				byClass(panel, 'model-setting__name').map((name) => name.textContent),
			).toEqual(namesOf(section));
			expect(
				byClass(panel, 'model-settings__group-title').map(
					(title) => title.textContent,
				),
			).toEqual([
				...section.groups.map((group) => group.title),
				section.constants.title,
			]);
		});
	});

	it('shows every field of every setting, and the Tuned mark only on tuned ones', () => {
		const { panels } = open();
		MODEL_SETTINGS_SECTIONS.forEach((section, index) => {
			const cards = byClass(panels[index] as FakeElement, 'model-setting');
			const entries = [
				...section.groups.flatMap((group) => Object.entries(group.settings)),
				...Object.entries(section.constants.settings),
			];
			expect(cards).toHaveLength(entries.length);
			entries.forEach(([name, setting], position) => {
				const shownCard = cardOf(cards[position] as FakeElement);
				const expected = ENTRY_TEXTS.map(([key, label]) => [
					label,
					setting[key],
				]);
				if (setting.tuned !== null) {
					expected.push(['Tuned against', setting.tuned]);
				}
				expect(shownCard, name).toEqual({
					name,
					value: formatConfigValue(setting),
					marked: setting.tuned === null ? [] : [TUNED_MARK],
					texts: expected,
				});
			});
		});
	});

	it('shows a made-up section as it is given, tuned and plain settings apart', () => {
		const { tabs, panels } = open([small]);
		expect(tabs.map((tab) => tab.textContent)).toEqual(['Made up']);
		const cards = byClass(panels[0] as FakeElement, 'model-setting').map(
			cardOf,
		);
		expect(cards.map((card) => [card.name, card.value, card.marked])).toEqual([
			['tuned', '2.5e8 K', ['Tuned']],
			['plain', '20 K', []],
			['steps', '2 steps', []],
			['limit', '5 K', []],
		]);
		expect(cards[0]?.texts.at(-1)).toEqual([
			'Tuned against',
			'Against the Earth.',
		]);
		expect(cards[1]?.texts.map(([label]) => label)).toEqual([
			'What it controls',
			'Raising it',
			'Lowering it',
			'Where it comes from',
		]);
	});

	it('switches tabs by click, showing one panel at a time', () => {
		const { tabs, panels } = open();
		tabs[1]?.fire('click');
		expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
			'false',
			'true',
		]);
		expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0]);
		expect(panels.map((panel) => panel.hidden)).toEqual([true, false]);
		tabs[0]?.fire('click');
		expect(panels.map((panel) => panel.hidden)).toEqual([false, true]);
	});

	it('moves between tabs with the arrow keys, Home and End, wrapping, and focuses the one chosen', () => {
		const { tabs, panels } = open();
		const press = (tab: FakeElement | undefined, key: string): boolean => {
			let stopped = false;
			tab?.fire('keydown', { key, preventDefault: () => (stopped = true) });
			return stopped;
		};
		expect(press(tabs[0], 'ArrowRight')).toBe(true);
		expect(panels.map((panel) => panel.hidden)).toEqual([true, false]);
		expect(fake.document.activeElement).toBe(tabs[1]);
		expect(press(tabs[1], 'ArrowRight')).toBe(true);
		expect(panels.map((panel) => panel.hidden)).toEqual([false, true]);
		expect(press(tabs[0], 'ArrowLeft')).toBe(true);
		expect(fake.document.activeElement).toBe(tabs[1]);
		expect(press(tabs[1], 'Home')).toBe(true);
		expect(fake.document.activeElement).toBe(tabs[0]);
		expect(press(tabs[0], 'End')).toBe(true);
		expect(fake.document.activeElement).toBe(tabs[1]);
		expect(press(tabs[1], 'a')).toBe(false);
		expect(panels.map((panel) => panel.hidden)).toEqual([true, false]);
	});

	it('closes by its Close button and takes itself out of the page', () => {
		const { dialog } = open();
		const buttons = byClass(dialog, 'button');
		expect(buttons.map((button) => button.textContent)).toEqual([CLOSE_LABEL]);
		expect(
			(buttons[0] as FakeElement & { autofocus?: boolean }).autofocus,
		).toBe(true);
		buttons[0]?.fire('click');
		expect(closed).toBe(1);
		expect(dialog.parentNode).toBeNull();
	});

	it('leaves Escape to the dialog, which closes it as it stands', () => {
		const { dialog } = open();
		let stopped = false;
		dialog.fire('cancel', { preventDefault: () => (stopped = true) });
		expect(stopped).toBe(false);
	});

	it('holds nothing that changes a setting: no input, select or text area', () => {
		const { dialog } = open();
		const controls = findAll(dialog, (element) =>
			['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName),
		);
		expect(controls).toEqual([]);
		expect(
			findAll(dialog, (element) => element.tagName === 'BUTTON').every(
				(button) => button.type === 'button',
			),
		).toBe(true);
	});

	it('changes nothing it reads from', () => {
		const before = JSON.stringify([TEMPERATURE_CONFIG, WIND_CONFIG]);
		open();
		expect(JSON.stringify([TEMPERATURE_CONFIG, WIND_CONFIG])).toBe(before);
	});
});
