import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { temperatureOf } from '../../core/testing/temperatureFixtures';
import { windResultOf } from '../../core/testing/windFixtures';
import {
	ARROW_CAP_SPEED,
	ARROW_EDGE_COLOUR,
	ARROW_EDGE_PX,
	ARROW_FILL_COLOUR,
	arrowShape,
} from '../globe/wind';
import { createLayerStore, type WindsLayer } from '../layers';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { LEGEND_EMPTY_TEXT, LEGEND_OUT_OF_DATE_TEXT } from './legend';
import {
	createWindKey,
	formatSpeed,
	WIND_KEY_CAPTION,
	WIND_KEY_SPEEDS,
	WINDS_CALCULATING_TEXT,
	WINDS_UNAVAILABLE_TEXT,
	windKeyContent,
} from './windKey';

describe('formatSpeed', () => {
	it('writes the speed in metres a second', () => {
		expect(formatSpeed(5)).toBe('5 m/s');
	});

	it('writes the cap, and any speed above it, as the cap and more', () => {
		expect(formatSpeed(ARROW_CAP_SPEED)).toBe(`${ARROW_CAP_SPEED}+ m/s`);
		expect(formatSpeed(3 * ARROW_CAP_SPEED)).toBe(`${ARROW_CAP_SPEED}+ m/s`);
		expect(formatSpeed(ARROW_CAP_SPEED - 0.5)).toBe(
			`${ARROW_CAP_SPEED - 0.5} m/s`,
		);
	});
});

describe('windKeyContent', () => {
	const layer = (status: WindsLayer['status']): WindsLayer => ({
		status,
		result: null,
	});

	it.each([
		['current', null],
		['outOfDate', LEGEND_OUT_OF_DATE_TEXT],
		['calculating', WINDS_CALCULATING_TEXT],
		['empty', LEGEND_EMPTY_TEXT],
		['unavailable', WINDS_UNAVAILABLE_TEXT],
	] as const)('words the %s winds as the legend does', (status, words) => {
		expect(windKeyContent(layer(status))).toEqual({ status: words });
	});

	it('follows the store’s winds through a calculation', () => {
		const store = createLayerStore(() => {});
		const said = (): string | null => windKeyContent(store.winds).status;
		expect(said()).toBe('Not calculated yet');
		store.markWindsCalculating();
		expect(said()).toBe('Calculating');
		store.setWindsResult(
			{
				winds: windResultOf(1),
				temperature: temperatureOf(1),
				dayLengthHours: 24,
			},
			true,
		);
		expect(said()).toBeNull();
		store.markWindsOutOfDate();
		expect(said()).toBe('Out of date');
		store.markWindsUnavailable();
		expect(said()).toBe('Winds unavailable');
	});
});

describe('createWindKey', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('starts hidden, with a caption, an arrow and its speed for each speed, and an empty status line', () => {
		const key = createWindKey();
		const element = key.element as unknown as FakeElement;
		expect(element.hidden).toBe(true);
		expect(oneByClass(element, 'wind-key__caption').textContent).toBe(
			WIND_KEY_CAPTION,
		);
		expect(
			byClass(element, 'wind-key__label').map((label) => label.textContent),
		).toEqual(WIND_KEY_SPEEDS.map(formatSpeed));
		expect(
			byClass(element, 'wind-key__label').map((label) => label.textContent),
		).toEqual(['5 m/s', '10+ m/s']);
		const status = oneByClass(element, 'wind-key__status');
		expect(status.textContent).toBe('');
		expect(status.getAttribute('aria-live')).toBe('polite');
	});

	it('draws each arrow at the size and in the colours of those on the globe', () => {
		const element = createWindKey().element as unknown as FakeElement;
		const arrows = byClass(element, 'wind-key__row').map(
			(row) => row.children[0],
		);
		expect(arrows).toHaveLength(WIND_KEY_SPEEDS.length);
		WIND_KEY_SPEEDS.forEach((speed, index) => {
			const shape = arrowShape(speed);
			const svg = arrows[index];
			expect(svg?.getAttribute('width')).toBe(
				String((shape?.length ?? 0) + 2 * ARROW_EDGE_PX),
			);
			const outline = svg?.children[0];
			expect(outline?.tagName).toBe('POLYGON');
			const points = outline
				?.getAttribute('points')
				?.split(' ')
				.map((pair) => pair.split(',').map(Number));
			expect(Math.max(...(points ?? []).map(([x]) => x as number))).toBe(
				shape?.length,
			);
			expect(outline?.getAttribute('fill')).toBe(
				`#${ARROW_FILL_COLOUR.toString(16).padStart(6, '0')}`,
			);
			expect(outline?.getAttribute('stroke')).toBe(
				`#${ARROW_EDGE_COLOUR.toString(16).padStart(6, '0')}`,
			);
			expect(outline?.getAttribute('stroke-width')).toBe(
				String(2 * ARROW_EDGE_PX),
			);
		});
	});

	it('shows the status it is given, and hides for null', () => {
		const key = createWindKey();
		const element = key.element as unknown as FakeElement;
		const status = oneByClass(element, 'wind-key__status');
		key.show({ status: WINDS_CALCULATING_TEXT });
		expect(element.hidden).toBe(false);
		expect(status.textContent).toBe(WINDS_CALCULATING_TEXT);
		key.show({ status: null });
		expect(status.textContent).toBe('');
		key.show(null);
		expect(element.hidden).toBe(true);
	});
});
