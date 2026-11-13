import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createFakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { createSection, headingText, SUMMARY_SEPARATOR } from './section';

describe('headingText', () => {
	it('is the name alone while the section is open, or has no summary', () => {
		expect(headingText('Tools', 'Raise', true)).toBe('Tools');
		expect(headingText('Tools', null, false)).toBe('Tools');
		expect(headingText('Tools', null, true)).toBe('Tools');
	});

	it('adds the summary after the name while the section is closed', () => {
		expect(headingText('Tools', 'Raise', false)).toBe('Tools · Raise');
		expect(SUMMARY_SEPARATOR).toBe(' · ');
	});
});

describe('createSection', () => {
	beforeEach(() => {
		vi.stubGlobal('document', createFakeDocument().document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (open: boolean) => {
		const told: boolean[] = [];
		const section = createSection('Planet', {
			id: 'section-planet',
			open,
			onToggle: (next) => told.push(next),
		});
		const element = section.element as unknown as FakeElement;
		const heading = oneByClass(element, 'panel__heading');
		const button = oneByClass(element, 'panel__toggle');
		const body = section.body as unknown as FakeElement;
		return { section, told, element, heading, button, body };
	};

	it('is a section holding a heading with one button, and the body', () => {
		const { element, heading, button, body } = make(true);
		expect(element.tagName).toBe('SECTION');
		expect(element.className).toBe('panel__section');
		expect(element.children).toEqual([heading, body]);
		expect(heading.tagName).toBe('H2');
		expect(heading.children).toEqual([button]);
		expect(button.tagName).toBe('BUTTON');
		expect(button.type).toBe('button');
		expect(button.textContent).toBe('Planet');
		expect(body.className).toBe('panel__body');
		expect(body.id).toBe('section-planet');
		expect(button.getAttribute('aria-controls')).toBe('section-planet');
		expect(body.children).toEqual([]);
	});

	it('starts open, with the body showing, when told to', () => {
		const { section, button, body, told } = make(true);
		expect(section.isOpen()).toBe(true);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(body.hidden).toBe(false);
		expect(told).toEqual([]);
	});

	it('starts closed, with the body hidden, when told to', () => {
		const { section, button, body, told } = make(false);
		expect(section.isOpen()).toBe(false);
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(body.hidden).toBe(true);
		expect(told).toEqual([]);
	});

	it('opens and closes at each click of its button, and says so each time', () => {
		const { section, button, body, told } = make(false);
		button.fire('click');
		expect(section.isOpen()).toBe(true);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(body.hidden).toBe(false);
		button.fire('click');
		expect(section.isOpen()).toBe(false);
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(body.hidden).toBe(true);
		expect(told).toEqual([true, false]);
	});

	it('opens and closes from code as a click does, and does nothing for the state it is in', () => {
		const { section, button, body, told } = make(false);
		section.setOpen(false);
		expect(told).toEqual([]);
		section.setOpen(true);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(body.hidden).toBe(false);
		section.setOpen(true);
		section.setOpen(false);
		expect(body.hidden).toBe(true);
		expect(told).toEqual([true, false]);
	});

	it('shows its summary after the name only while it is closed', () => {
		const { section, button } = make(false);
		section.setSummary('Raise');
		expect(button.textContent).toBe('Planet · Raise');
		button.fire('click');
		expect(button.textContent).toBe('Planet');
		section.setSummary('Lower');
		expect(button.textContent).toBe('Planet');
		button.fire('click');
		expect(button.textContent).toBe('Planet · Lower');
		section.setSummary(null);
		expect(button.textContent).toBe('Planet');
	});
});
