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
	formatWindDirectionRight,
	formatWindOffBy,
	OBSERVED_WINDS_FAILED_TEXT,
	OBSERVED_WINDS_LOADING_TEXT,
	WIND_DIRECTION_TITLE,
	WIND_KEY_CAPTION,
	WIND_KEY_SPEEDS,
	WIND_KEY_STREAKS_TEXT,
	WIND_OFF_BY_TITLE,
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
		expect(formatSpeed(ARROW_CAP_SPEED - 0.6)).toBe(
			`${ARROW_CAP_SPEED - 1} m/s`,
		);
	});

	it('writes the key’s two speeds in each unit, the arrows’ own speeds converted', () => {
		expect(WIND_KEY_SPEEDS).toEqual([5, 10]);
		expect(WIND_KEY_SPEEDS.map((speed) => formatSpeed(speed, 'm/s'))).toEqual([
			'5 m/s',
			'10+ m/s',
		]);
		expect(WIND_KEY_SPEEDS.map((speed) => formatSpeed(speed, 'km/h'))).toEqual([
			'18 km/h',
			'36+ km/h',
		]);
		expect(WIND_KEY_SPEEDS.map((speed) => formatSpeed(speed, 'mph'))).toEqual([
			'11 mph',
			'22+ mph',
		]);
		expect(formatSpeed(3 * ARROW_CAP_SPEED, 'mph')).toBe('22+ mph');
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
		).toEqual(WIND_KEY_SPEEDS.map((speed) => formatSpeed(speed)));
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

	it('starts in the unit it is given, and writes the speeds in another when told, the arrows unchanged', () => {
		const key = createWindKey('km/h');
		const element = key.element as unknown as FakeElement;
		const labels = () =>
			byClass(element, 'wind-key__label').map((label) => label.textContent);
		const widths = () =>
			byClass(element, 'wind-key__row').map((row) =>
				row.children[0]?.getAttribute('width'),
			);
		expect(labels()).toEqual(['18 km/h', '36+ km/h']);
		const drawn = widths();
		key.setUnit('mph');
		expect(labels()).toEqual(['11 mph', '22+ mph']);
		key.setUnit('m/s');
		expect(labels()).toEqual(['5 m/s', '10+ m/s']);
		expect(widths()).toEqual(drawn);
		expect(byClass(element, 'wind-key__row')).toHaveLength(2);
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

describe('the key’s figures', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('writes how far off the winds are to one decimal of the unit chosen', () => {
		expect(formatWindOffBy(3.8, 'm/s')).toBe('Off by 3.8 m/s on average');
		expect(formatWindOffBy(3.8, 'km/h')).toBe('Off by 13.7 km/h on average');
		expect(formatWindOffBy(3.8, 'mph')).toBe('Off by 8.5 mph on average');
		expect(formatWindOffBy(0.04, 'm/s')).toBe('Off by 0.0 m/s on average');
		expect(formatWindOffBy(2.25, 'm/s')).toBe('Off by 2.3 m/s on average');
	});

	it('writes how much of the map the winds point right on as a whole percentage', () => {
		expect(formatWindDirectionRight(0.61)).toBe(
			'Direction right on 61% of the map',
		);
		expect(formatWindDirectionRight(0.605)).toBe(
			'Direction right on 61% of the map',
		);
		expect(formatWindDirectionRight(1)).toBe(
			'Direction right on 100% of the map',
		);
	});

	it('words the loading and the failure of the observed winds, and the figures’ exact definitions', () => {
		expect(OBSERVED_WINDS_LOADING_TEXT).toBe('Loading observed winds');
		expect(OBSERVED_WINDS_FAILED_TEXT).toBe(
			'Observed winds could not be loaded',
		);
		expect(WIND_OFF_BY_TITLE).toBe(
			'The area-weighted root-mean-square difference between the simulated and the observed wind, as vectors.',
		);
		expect(WIND_DIRECTION_TITLE).toBe(
			'The share of the surface, where the observed wind is at least 1 m/s, on which the simulated wind points within 45° of the observed.',
		);
	});

	it('puts two lines under the arrows, above the status, each with its definition as its tooltip, and none while there are no figures', () => {
		const key = createWindKey();
		const element = key.element as unknown as FakeElement;
		const classes = () => element.children.map((child) => child.className);
		expect(classes()).toEqual([
			'wind-key__caption',
			'wind-key__row',
			'wind-key__row',
			'wind-key__figure',
			'wind-key__figure',
			'wind-key__status',
		]);
		const [offBy, direction] = byClass(element, 'wind-key__figure') as [
			FakeElement,
			FakeElement,
		];
		key.show({ status: null });
		expect([offBy.hidden, direction.hidden]).toEqual([true, true]);
		key.show({
			status: null,
			figures: { rmsVectorDifference: 3.8, directionShare: 0.61 },
		});
		expect([offBy.hidden, direction.hidden]).toEqual([false, false]);
		expect(offBy.textContent).toBe('Off by 3.8 m/s on average');
		expect(direction.textContent).toBe('Direction right on 61% of the map');
		expect(offBy.title).toBe(WIND_OFF_BY_TITLE);
		expect(direction.title).toBe(WIND_DIRECTION_TITLE);
		key.show({
			status: 'Out of date',
			figures: { rmsVectorDifference: 3.8, directionShare: null },
		});
		expect([offBy.hidden, direction.hidden]).toEqual([false, true]);
		key.show({ status: null });
		expect([offBy.hidden, direction.hidden]).toEqual([true, true]);
	});

	it('writes how far off the winds are in the unit it starts in, and follows a change of it at once', () => {
		const key = createWindKey('km/h');
		const element = key.element as unknown as FakeElement;
		const offBy = () => byClass(element, 'wind-key__figure')[0]?.textContent;
		key.show({
			status: null,
			figures: { rmsVectorDifference: 3.8, directionShare: 0.61 },
		});
		expect(offBy()).toBe('Off by 13.7 km/h on average');
		key.setUnit('mph');
		expect(offBy()).toBe('Off by 8.5 mph on average');
		key.setUnit('m/s');
		expect(offBy()).toBe('Off by 3.8 m/s on average');
		expect(byClass(element, 'wind-key__figure')[1]?.textContent).toBe(
			'Direction right on 61% of the map',
		);
	});
});

describe('the key while the winds are streaks', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** The classes of what the key holds, in order. */
	const classesOf = (element: FakeElement) =>
		element.children.map((child) => child.className);

	const ARROWS_KEY = [
		'wind-key__caption',
		'wind-key__row',
		'wind-key__row',
		'wind-key__figure',
		'wind-key__figure',
		'wind-key__status',
	];

	const STREAKS_KEY = [
		'wind-key__caption',
		'wind-key__streaks',
		'wind-key__figure',
		'wind-key__figure',
		'wind-key__status',
	];

	it('words the line in the arrows’ place', () => {
		expect(WIND_KEY_STREAKS_TEXT).toBe(
			'Faster, longer streaks are stronger winds',
		);
	});

	it('starts with one line in place of the arrows, keeping the caption, figures and status', () => {
		const key = createWindKey('m/s', 'streaks');
		const element = key.element as unknown as FakeElement;
		expect(classesOf(element)).toEqual(STREAKS_KEY);
		expect(oneByClass(element, 'wind-key__streaks').textContent).toBe(
			WIND_KEY_STREAKS_TEXT,
		);
		expect(oneByClass(element, 'wind-key__caption').textContent).toBe(
			WIND_KEY_CAPTION,
		);
		expect(byClass(element, 'wind-key__label')).toEqual([]);
		key.show({
			status: WINDS_CALCULATING_TEXT,
			figures: { rmsVectorDifference: 3.8, directionShare: 0.61 },
		});
		expect(oneByClass(element, 'wind-key__status').textContent).toBe(
			WINDS_CALCULATING_TEXT,
		);
		expect(
			byClass(element, 'wind-key__figure').map((line) => line.textContent),
		).toEqual([
			'Off by 3.8 m/s on average',
			'Direction right on 61% of the map',
		]);
	});

	it('swaps the arrows for the line and back when told, keeping what it shows', () => {
		const key = createWindKey('km/h');
		const element = key.element as unknown as FakeElement;
		key.show({
			status: 'Out of date',
			figures: { rmsVectorDifference: 3.8, directionShare: 0.61 },
		});
		const status = oneByClass(element, 'wind-key__status');
		key.setStyle('streaks');
		expect(classesOf(element)).toEqual(STREAKS_KEY);
		expect(element.hidden).toBe(false);
		expect(oneByClass(element, 'wind-key__status')).toBe(status);
		expect(status.textContent).toBe('Out of date');
		expect(byClass(element, 'wind-key__figure')[0]?.textContent).toBe(
			'Off by 13.7 km/h on average',
		);
		key.setUnit('mph');
		key.setStyle('arrows');
		expect(classesOf(element)).toEqual(ARROWS_KEY);
		expect(
			byClass(element, 'wind-key__label').map((label) => label.textContent),
		).toEqual(['11 mph', '22+ mph']);
		expect(byClass(element, 'wind-key__figure')[0]?.textContent).toBe(
			'Off by 8.5 mph on average',
		);
	});

	it('is just as before with arrows, told so or not', () => {
		const told = createWindKey();
		told.setStyle('arrows');
		expect(classesOf(told.element as unknown as FakeElement)).toEqual(
			ARROWS_KEY,
		);
		const given = createWindKey('m/s', 'arrows');
		expect(classesOf(given.element as unknown as FakeElement)).toEqual(
			ARROWS_KEY,
		);
		expect(
			byClass(given.element as unknown as FakeElement, 'wind-key__streaks'),
		).toEqual([]);
	});

	it('stays hidden while it has nothing to show, whichever way the winds are drawn', () => {
		const key = createWindKey();
		key.setStyle('streaks');
		expect((key.element as unknown as FakeElement).hidden).toBe(true);
	});
});
