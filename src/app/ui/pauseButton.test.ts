import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import {
	createPauseButton,
	PAUSE_BUTTON_LABEL,
	RESUME_BUTTON_LABEL,
} from './pauseButton';

describe('createPauseButton', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** A Pause button, with what it told of each press. */
	const make = () => {
		const told: boolean[] = [];
		const button = createPauseButton({
			onPause: (paused) => told.push(paused),
		});
		const element = button.element as unknown as FakeElement;
		/** The class of the icon it holds. */
		const icon = (): string | null | undefined =>
			element.children.at(0)?.getAttribute('class');
		const label = () => oneByClass(element, 'pause-button__label');
		return { told, element, icon, label };
	};

	it('is a button, not pressed, showing the pause icon and the word Pause', () => {
		const { element, icon, label } = make();
		expect(element.tagName).toBe('BUTTON');
		expect(element.className).toBe('pause-button');
		expect(element.type).toBe('button');
		expect(element.getAttribute('aria-pressed')).toBe('false');
		expect(icon()).toBe('icon icon--pause');
		expect(label().textContent).toBe(PAUSE_BUTTON_LABEL);
		expect(element.title).toBe(PAUSE_BUTTON_LABEL);
		expect(PAUSE_BUTTON_LABEL).toBe('Pause');
		expect(element.getAttribute('aria-label')).toBe('Pause');
	});

	it('is named Pause apart from its word, beside an icon hidden from screen readers, so the name stays when the word is hidden from the eye', () => {
		const { element, label } = make();
		expect(element.children).toHaveLength(2);
		expect(element.children.at(0)?.getAttribute('aria-hidden')).toBe('true');
		expect(element.children.at(1)).toBe(label());
		expect(element.getAttribute('aria-label')).toBe('Pause');
	});

	it('shows itself pressed, with the play icon and the word and tooltip Resume but still named Pause, when pressed, and tells of it', () => {
		const { told, element, icon, label } = make();
		element.fire('click');
		expect(told).toEqual([true]);
		expect(element.getAttribute('aria-pressed')).toBe('true');
		expect(icon()).toBe('icon icon--play');
		expect(label().textContent).toBe(RESUME_BUTTON_LABEL);
		expect(element.title).toBe(RESUME_BUTTON_LABEL);
		expect(RESUME_BUTTON_LABEL).toBe('Resume');
		expect(element.getAttribute('aria-label')).toBe('Pause');
		expect(element.children).toHaveLength(2);
	});

	it('goes back to Pause when pressed again, and tells of each press', () => {
		const { told, element, icon, label } = make();
		element.fire('click');
		element.fire('click');
		expect(told).toEqual([true, false]);
		expect(element.getAttribute('aria-pressed')).toBe('false');
		expect(element.getAttribute('aria-label')).toBe('Pause');
		expect(icon()).toBe('icon icon--pause');
		expect(label().textContent).toBe(PAUSE_BUTTON_LABEL);
		expect(element.title).toBe(PAUSE_BUTTON_LABEL);
	});
});
