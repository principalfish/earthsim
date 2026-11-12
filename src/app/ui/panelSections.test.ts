import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLANET, type TerrainStats } from '../../core/index';
import { createPanelMemory, panelMemoryKey } from '../panelMemory';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { createFakeStorage, type FakeStorage } from '../testing/fakeStorage';
import {
	createPanelSections,
	FIRST_VISIT_OPEN,
	PANEL_SECTIONS,
	type PanelSections,
	sectionBodyId,
} from './panelSections';
import { createPlanetPanel, formatTilt } from './planetPanel';
import { createStatsPanel, STATS_PENDING_TEXT } from './statsPanel';

describe('createPanelSections', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (storage: FakeStorage = createFakeStorage()) => {
		const panel = fake.createElement('aside');
		const title = fake.createElement('h1');
		panel.append(title);
		const sections = createPanelSections(
			panel as unknown as HTMLElement,
			createPanelMemory(storage),
		);
		/** What each heading says, in the panel's order. */
		const headings = () =>
			byClass(panel, 'panel__toggle').map((button) => button.textContent);
		/** Whether each section is open, in the panel's order. */
		const states = (of: PanelSections = sections) =>
			PANEL_SECTIONS.map(({ key }) => of[key].isOpen());
		const button = (key: keyof PanelSections): FakeElement =>
			oneByClass(
				sections[key].element as unknown as FakeElement,
				'panel__toggle',
			);
		return { panel, title, sections, storage, headings, states, button };
	};

	it('adds the sections after what the panel holds, in the order World, Layers, View, Planet, Tools, Statistics', () => {
		const { panel, title, sections, headings } = make();
		expect(headings()).toEqual([
			'World',
			'Layers',
			'View',
			'Planet',
			'Tools',
			'Statistics',
		]);
		expect(panel.children).toEqual([
			title,
			...PANEL_SECTIONS.map(({ key }) => sections[key].element),
		]);
		for (const { key } of PANEL_SECTIONS) {
			const body = sections[key].body as unknown as FakeElement;
			expect(body.id).toBe(sectionBodyId(key));
			expect(body.children).toEqual([]);
		}
		expect(sectionBodyId('world')).toBe('section-world');
	});

	it('opens only World on a first visit, and writes nothing', () => {
		const { sections, states, storage } = make();
		expect(FIRST_VISIT_OPEN).toEqual(['world']);
		expect(states()).toEqual([true, false, false, false, false, false]);
		expect(PANEL_SECTIONS.map(({ key }) => sections[key].body.hidden)).toEqual([
			false,
			true,
			true,
			true,
			true,
			true,
		]);
		expect(storage.writes).toEqual([]);
	});

	it('opens each section as it was left, and as on a first visit where nothing was', () => {
		const { states, storage } = make(
			createFakeStorage({
				[panelMemoryKey('world')]: 'closed',
				[panelMemoryKey('planet')]: 'open',
				[panelMemoryKey('statistics')]: 'open',
				[panelMemoryKey('tools')]: 'unreadable',
			}),
		);
		expect(states()).toEqual([false, false, false, true, false, true]);
		expect(storage.writes).toEqual([]);
	});

	it('opens as on a first visit when the storage throws', () => {
		const panel = fake.createElement('aside');
		const sections = createPanelSections(
			panel as unknown as HTMLElement,
			createPanelMemory({
				getItem: () => {
					throw new Error('Storage is blocked');
				},
				setItem: () => {
					throw new Error('Storage is blocked');
				},
			}),
		);
		expect(PANEL_SECTIONS.map(({ key }) => sections[key].isOpen())).toEqual([
			true,
			false,
			false,
			false,
			false,
			false,
		]);
		const toggle = oneByClass(
			sections.view.element as unknown as FakeElement,
			'panel__toggle',
		);
		toggle.fire('click');
		expect(sections.view.isOpen()).toBe(true);
	});

	it('remembers each click on a heading, for the next visit', () => {
		const { button, storage, states } = make();
		button('layers').fire('click');
		button('world').fire('click');
		button('tools').fire('click');
		button('tools').fire('click');
		expect(storage.writes).toEqual([
			[panelMemoryKey('layers'), 'open'],
			[panelMemoryKey('world'), 'closed'],
			[panelMemoryKey('tools'), 'open'],
			[panelMemoryKey('tools'), 'closed'],
		]);
		const before = states();

		const again = make(createFakeStorage(Object.fromEntries(storage.entries)));
		expect(again.states()).toEqual(before);
		expect(before).toEqual([false, true, false, false, false, false]);
	});

	it('keeps the controls of a closed section working while its body is hidden', () => {
		const { sections } = make();
		const planet = createPlanetPanel(sections.planet.body, {
			planet: DEFAULT_PLANET,
			onChange: () => {},
		});
		const stats = createStatsPanel(sections.statistics.body);
		const planetBody = sections.planet.body as unknown as FakeElement;
		const statsBody = sections.statistics.body as unknown as FakeElement;
		expect(planetBody.hidden).toBe(true);
		expect(statsBody.hidden).toBe(true);

		planet.setPlanet({ ...DEFAULT_PLANET, axialTiltDeg: 45 });
		const [tilt] = byClass(planetBody, 'field__value');
		expect(tilt?.textContent).toBe(formatTilt(45));
		expect(oneByClass(statsBody, 'stats__status').textContent).toBe(
			STATS_PENDING_TEXT,
		);
		const figures: TerrainStats = {
			landFraction: 0.5,
			landAreaKm2: 1,
			seaAreaKm2: 1,
			highestM: 100,
			deepestM: -100,
			meanLandHeightM: 50,
			meanOceanDepthM: 50,
		};
		stats.show(figures);

		sections.statistics.setOpen(true);
		expect(statsBody.hidden).toBe(false);
		expect(
			byClass(statsBody, 'stats__value').map((value) => value.textContent),
		).toEqual(['50.0%', '100 m', '−100 m', '50 m', '50 m']);
		expect(planetBody.hidden).toBe(true);
	});
});
