/**
 * The sections of the side panel, in the order the panel shows them, each
 * opened or closed as the browser remembers it.
 */

import type { PanelMemory } from '../panelMemory';
import { createSection, type Section } from './section';

/** The panel's sections, in the order it shows them, which is the tab order. */
export const PANEL_SECTIONS = [
	{ key: 'world', title: 'World' },
	{ key: 'layers', title: 'Layers' },
	{ key: 'view', title: 'View' },
	{ key: 'planet', title: 'Planet' },
	{ key: 'tools', title: 'Tools' },
	{ key: 'statistics', title: 'Statistics' },
] as const;

/** A section of the panel, by its name in the memory. */
export type PanelSectionKey = (typeof PANEL_SECTIONS)[number]['key'];

/** The panel's sections, by name. */
export type PanelSections = Readonly<Record<PanelSectionKey, Section>>;

/** The sections open on a first visit; the rest start closed. */
export const FIRST_VISIT_OPEN: readonly PanelSectionKey[] = ['world'];

/**
 * The `id` of a section's body, such as `section-world`.
 *
 * @param key - The section's name in the memory.
 */
export const sectionBodyId = (key: PanelSectionKey): string => `section-${key}`;

/**
 * Adds the panel's sections to the side panel, empty, for the controls of
 * each to fill.
 *
 * @remarks
 * Each section opens as the memory says it was left, and as on a first
 * visit when the memory has nothing to go by: World open and the rest
 * closed. Each time a section opens or closes, by its heading or by the
 * page, the memory is told. Reading the memory at the start writes nothing
 * to it.
 *
 * @param panel - The panel to add the sections to, after what it holds.
 * @param memory - Which sections were left open.
 * @returns The sections, by name.
 */
export const createPanelSections = (
	panel: HTMLElement,
	memory: PanelMemory,
): PanelSections => {
	const sections = PANEL_SECTIONS.map(({ key, title }) => {
		const section = createSection(title, {
			id: sectionBodyId(key),
			open: memory.isOpen(key, FIRST_VISIT_OPEN.includes(key)),
			onToggle: (open) => memory.setOpen(key, open),
		});
		panel.append(section.element);
		return [key, section] as const;
	});
	return Object.fromEntries(sections) as PanelSections;
};
