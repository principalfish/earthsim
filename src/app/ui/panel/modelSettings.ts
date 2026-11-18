/**
 * The Model settings screen: every setting the climate models run on,
 * read from the config the models themselves are built from, with what it
 * controls, what raising and lowering it do, where its value comes from
 * and whether it was tuned.
 *
 * It only shows. A setting is changed in `src/core/config.ts`, and nothing
 * on this screen reaches the models.
 */

import {
	type ConfigEntry,
	type ConfigGroup,
	type ConfigSection,
	formatConfigValue,
	TEMPERATURE_CONFIG,
	WIND_CONFIG,
} from '../../../core/index';
import { createButton, createElement } from '../fields';

/** The sections the screen shows, a tab each, in order. */
export const MODEL_SETTINGS_SECTIONS: readonly ConfigSection[] = [
	TEMPERATURE_CONFIG,
	WIND_CONFIG,
];

/** The screen's title, and what the button that opens it says. */
export const MODEL_SETTINGS_TITLE = 'Model settings';

/** What the screen says under its title. */
export const MODEL_SETTINGS_INTRO =
	'The numbers the temperature and wind models run on. They are shown here to read, not to change: a setting is changed in the code, in src/core/config.ts.';

/** What the Close button says. */
export const CLOSE_LABEL = 'Close';

/** The name of what each of an entry's texts says, in the order shown. */
export const ENTRY_TEXTS = [
	['what', 'What it controls'],
	['raising', 'Raising it'],
	['lowering', 'Lowering it'],
	['source', 'Where it comes from'],
] as const;

/** What the mark of a tuned setting says. */
export const TUNED_MARK = 'Tuned';

const TITLE_ID = 'model-settings-title';

/** The `id` of a section's tab, from its place among the tabs. */
export const tabId = (index: number): string => `model-settings-tab-${index}`;

/** The `id` of a section's panel, from its place among the tabs. */
export const panelId = (index: number): string =>
	`model-settings-panel-${index}`;

/** What the screen is built from and where it goes. */
export type ModelSettingsOptions = {
	/** The sections to show, a tab each; the temperature's and the winds'. */
	readonly sections?: readonly ConfigSection[];
	/** Where the screen is added to the page; the body by default. */
	readonly parent?: HTMLElement;
};

const textElement = <K extends 'p' | 'span' | 'dt' | 'dd' | 'h2' | 'h3' | 'h4'>(
	tag: K,
	className: string,
	text: string,
): HTMLElementTagNameMap[K] => {
	const element = createElement(tag, className);
	element.textContent = text;
	return element;
};

/** One setting: its name, its value and what is said of it. */
const createEntry = (name: string, entry: ConfigEntry): HTMLElement => {
	const card = createElement('article', 'model-setting');
	const head = createElement('div', 'model-setting__head');
	head.append(
		textElement('h4', 'model-setting__name', name),
		textElement('span', 'model-setting__value', formatConfigValue(entry)),
	);
	if (entry.tuned !== null) {
		head.append(textElement('span', 'model-setting__tuned', TUNED_MARK));
	}
	const details = createElement('dl', 'model-setting__details');
	for (const [key, label] of ENTRY_TEXTS) {
		details.append(
			textElement('dt', 'model-setting__label', label),
			textElement('dd', 'model-setting__text', entry[key]),
		);
	}
	if (entry.tuned !== null) {
		details.append(
			textElement('dt', 'model-setting__label', 'Tuned against'),
			textElement('dd', 'model-setting__text', entry.tuned),
		);
	}
	card.append(head, details);
	return card;
};

/** A titled group of settings. */
const createGroup = (group: ConfigGroup): HTMLElement => {
	const element = createElement('section', 'model-settings__group');
	element.append(textElement('h3', 'model-settings__group-title', group.title));
	for (const [name, entry] of Object.entries(group.settings)) {
		element.append(createEntry(name, entry));
	}
	return element;
};

/** What a section's panel holds: its groups, then its fixed choices. */
const createPanel = (section: ConfigSection, index: number): HTMLElement => {
	const panel = createElement('div', 'model-settings__panel');
	panel.id = panelId(index);
	panel.setAttribute('role', 'tabpanel');
	panel.setAttribute('aria-labelledby', tabId(index));
	panel.tabIndex = 0;
	panel.append(
		...section.groups.map(createGroup),
		createGroup(section.constants),
	);
	return panel;
};

/**
 * Opens the screen.
 *
 * @remarks
 * It is a modal dialog laid over most of the page, with the globe showing
 * at its edges: the rest of the page cannot be used while it is open, the
 * keyboard's focus stays inside it, and Escape or Close closes it, after
 * which the focus is back where it was. Each model has a tab, with the
 * arrow keys, Home and End moving between them, and in it the model's
 * groups of settings, then the fixed choices the code reads directly. The
 * screen holds nothing that changes a setting.
 *
 * @param options - The sections to show and where to put the screen.
 * @returns The dialog, already open.
 */
export const openModelSettings = (
	options: ModelSettingsOptions = {},
): HTMLDialogElement => {
	const sections = options.sections ?? MODEL_SETTINGS_SECTIONS;
	const dialog = createElement('dialog', 'dialog model-settings');
	dialog.setAttribute('aria-labelledby', TITLE_ID);

	const title = textElement('h2', 'dialog__title', MODEL_SETTINGS_TITLE);
	title.id = TITLE_ID;
	const close = createButton({
		label: CLOSE_LABEL,
		onClick: () => dialog.close(),
	});
	close.classList.add('button--compact');
	close.autofocus = true;
	const header = createElement('div', 'model-settings__header');
	header.append(title, close);

	const tabs = createElement('div', 'model-settings__tabs');
	tabs.setAttribute('role', 'tablist');
	tabs.setAttribute('aria-label', 'Model');
	const panels = sections.map(createPanel);
	const tabButtons = sections.map((section, index) => {
		const tab = createElement('button', 'model-settings__tab');
		tab.type = 'button';
		tab.id = tabId(index);
		tab.setAttribute('role', 'tab');
		tab.setAttribute('aria-controls', panelId(index));
		tab.textContent = section.name;
		return tab;
	});

	const body = createElement('div', 'model-settings__body');
	body.append(...panels);

	/** Shows one section's panel and marks its tab, the others hidden. */
	const select = (chosen: number): void => {
		// Another tab's panel starts at its top, not where this one was read to.
		body.scrollTop = 0;
		tabButtons.forEach((tab, index) => {
			const on = index === chosen;
			tab.setAttribute('aria-selected', String(on));
			tab.tabIndex = on ? 0 : -1;
			tab.classList.toggle('model-settings__tab--selected', on);
			(panels[index] as HTMLElement).hidden = !on;
		});
	};
	tabButtons.forEach((tab, index) => {
		tab.addEventListener('click', () => select(index));
		tab.addEventListener('keydown', (event) => {
			const last = tabButtons.length - 1;
			const target = {
				ArrowRight: index === last ? 0 : index + 1,
				ArrowLeft: index === 0 ? last : index - 1,
				Home: 0,
				End: last,
			}[event.key];
			if (target === undefined) {
				return;
			}
			event.preventDefault();
			select(target);
			(tabButtons[target] as HTMLElement).focus();
		});
	});
	tabs.append(...tabButtons);
	select(0);

	dialog.append(
		header,
		textElement('p', 'model-settings__intro', MODEL_SETTINGS_INTRO),
		tabs,
		body,
	);
	dialog.addEventListener('close', () => dialog.remove());
	(options.parent ?? document.body).append(dialog);
	dialog.showModal();
	return dialog;
};
