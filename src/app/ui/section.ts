/**
 * A section of the side panel that opens and closes from its heading.
 */

import { createElement } from './fields';

/** What separates a section's name from its summary in the heading. */
export const SUMMARY_SEPARATOR = ' · ';

/** What a section starts with and whom it tells when it opens or closes. */
export type SectionOptions = {
	/**
	 * The `id` of the section's body, unique on the page, which the heading
	 * names as what it opens and closes.
	 */
	readonly id: string;
	/** Whether the section starts open. */
	readonly open: boolean;
	/**
	 * Called with the new state each time the section opens or closes, by a
	 * click on its heading or by {@link Section.setOpen}. It is not called for
	 * the state the section starts in.
	 */
	readonly onToggle: (open: boolean) => void;
};

/** A section of the panel that opens and closes. */
export type Section = {
	/** The section, heading and body, to put in the panel. */
	readonly element: HTMLElement;
	/** The body, for the section's content, hidden while it is closed. */
	readonly body: HTMLElement;
	/** Whether the section is open. */
	isOpen(): boolean;
	/**
	 * Opens or closes the section as a click on its heading does, telling
	 * `onToggle` of it. Asked for the state it is already in, it does
	 * nothing and tells nobody.
	 */
	setOpen(open: boolean): void;
	/**
	 * Gives the section a short summary, which the heading shows after the
	 * name while the section is closed, or takes it away.
	 *
	 * @param summary - The summary, shown as plain text, or null for none.
	 */
	setSummary(summary: string | null): void;
};

/**
 * What a section's heading says: the name, followed by the summary while
 * the section is closed and has one, such as `Tools · Raise`.
 *
 * @param title - The section's name.
 * @param summary - Its summary, or null for none.
 * @param open - Whether the section is open.
 */
export const headingText = (
	title: string,
	summary: string | null,
	open: boolean,
): string =>
	open || summary === null ? title : `${title}${SUMMARY_SEPARATOR}${summary}`;

/**
 * Creates a section of the panel whose heading opens and closes it.
 *
 * @remarks
 * The heading holds one button, so a click, Enter and Space each open and
 * close the section. The button says whether the section is open through
 * `aria-expanded`, and names the body as what it controls. While the
 * section is closed its body is hidden, which takes the controls in it out
 * of the tab order and out of reach of assistive technology; whatever fills
 * the body carries on as when it shows.
 *
 * @param title - The section's name, as its heading shows it.
 * @param options - The body's `id`, the starting state and whom to tell.
 * @returns The section, with nothing in its body.
 */
export const createSection = (
	title: string,
	options: SectionOptions,
): Section => {
	const section = createElement('section', 'panel__section');
	const heading = createElement('h2', 'panel__heading');
	const button = createElement('button', 'panel__toggle');
	button.type = 'button';
	button.setAttribute('aria-controls', options.id);
	heading.append(button);
	const body = createElement('div', 'panel__body');
	body.id = options.id;
	section.append(heading, body);

	let open = options.open;
	let summary: string | null = null;
	/** Shows the state and the summary on the heading and the body. */
	const render = (): void => {
		button.setAttribute('aria-expanded', String(open));
		body.hidden = !open;
		const text = headingText(title, summary, open);
		// Rewritten only if it differs, so that a screen reader is not told
		// the name again for nothing.
		if (button.textContent !== text) {
			button.textContent = text;
		}
	};
	render();

	const setOpen = (next: boolean): void => {
		if (next === open) {
			return;
		}
		open = next;
		render();
		options.onToggle(open);
	};
	button.addEventListener('click', () => setOpen(!open));

	return {
		element: section,
		body,
		isOpen: () => open,
		setOpen,
		setSummary: (next) => {
			summary = next;
			render();
		},
	};
};
