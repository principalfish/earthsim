import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	findAll,
} from '../testing/fakeDocument';
import {
	gridIcon,
	ICON_SIZE,
	pauseIcon,
	playIcon,
	pressureIcon,
	sunlightIcon,
	temperatureIcon,
	terrainIcon,
	windsIcon,
} from './icons';

/** Every icon, by the name its class gives it. */
const ICONS = [
	['terrain', terrainIcon],
	['temperature', temperatureIcon],
	['pressure', pressureIcon],
	['winds', windsIcon],
	['sunlight', sunlightIcon],
	['grid', gridIcon],
	['pause', pauseIcon],
	['play', playIcon],
] as const;

/** The attributes a colour can be given by on an SVG element. */
const COLOUR_ATTRIBUTES = ['fill', 'stroke', 'color', 'style'] as const;

describe('the icons', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(ICONS)(
		'draws %s as an svg on the square, hidden from screen readers',
		(name, draw) => {
			const svg = draw() as unknown as FakeElement;
			expect(svg.tagName).toBe('SVG');
			expect(svg.getAttribute('viewBox')).toBe(`0 0 ${ICON_SIZE} ${ICON_SIZE}`);
			expect(ICON_SIZE).toBe(24);
			expect(svg.getAttribute('class')).toBe(`icon icon--${name}`);
			expect(svg.getAttribute('aria-hidden')).toBe('true');
			expect(svg.children.length).toBeGreaterThan(0);
		},
	);

	it.each(ICONS)(
		'draws %s in the colour of the text, with no colour of its own',
		(_name, draw) => {
			const svg = draw() as unknown as FakeElement;
			expect(svg.getAttribute('stroke')).toBe('currentColor');
			for (const element of findAll(svg, () => true)) {
				for (const attribute of COLOUR_ATTRIBUTES) {
					const value = element.getAttribute(attribute);
					expect([null, 'none', 'currentColor']).toContain(value);
				}
			}
		},
	);

	it('makes a new icon at each call, to be put in more than one place', () => {
		expect(terrainIcon()).not.toBe(terrainIcon());
	});
});
