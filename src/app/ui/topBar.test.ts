import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PRESSURE_LAYER,
	type ScalarLayerSpec,
	TEMPERATURE_LAYER,
} from '../scalarLayer';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { MADE_UP_ID, MADE_UP_LAYER } from '../testing/scalarLayerFixtures';
import {
	DEFAULT_PAGE_VIEW,
	type PageView,
	SOURCES,
	WIND_SOURCES,
} from '../view';
import { COMPARISON_NAME } from './comparison';
import { createTopBar, SHOW_LABEL } from './topBar';

describe('createTopBar', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** A top bar on the view given, offering the layers given or the page's. */
	const make = (
		view: Partial<PageView> = {},
		layers?: readonly ScalarLayerSpec[],
	) => {
		const told: string[] = [];
		const bar = createTopBar({
			...(layers === undefined ? {} : { layers }),
			view: { ...DEFAULT_PAGE_VIEW, ...view },
			onSummary: (layer, summary) => told.push(`${layer} ${summary}`),
			onSource: (source) => told.push(`source ${source}`),
		});
		const element = bar.element as unknown as FakeElement;
		/** The Show choices, in the order of the layers. */
		const shows = byClass(element, 'top-bar__show');
		/** The drop-down of the Show choice with the id given. */
		const select = (id: string) =>
			byClass(element, 'field__select').find(
				(each) => each.id === id,
			) as FakeElement;
		const radios = byClass(element, 'segmented__input').filter(
			(input) => input.name === COMPARISON_NAME,
		);
		return { bar, told, element, shows, select, radios };
	};

	it('holds a Show choice for each layer, in order, then the one comparison control', () => {
		const { element, shows } = make();
		expect(element.className).toBe('top-bar');
		expect(element.children.map((child) => child.className)).toEqual([
			'field top-bar__show',
			'field top-bar__show',
			'comparison',
		]);
		expect(shows.map((show) => byClass(show, 'field__select')[0]?.id)).toEqual([
			TEMPERATURE_LAYER.summaryControlId,
			PRESSURE_LAYER.summaryControlId,
		]);
		expect(
			byClass(element, 'field__label').map((label) => label.textContent),
		).toEqual([SHOW_LABEL, SHOW_LABEL]);
		expect(SHOW_LABEL).toBe('Show');
	});

	it('shows the Show choice of the layer on screen only, and none on Terrain', () => {
		const { bar, element, shows } = make();
		// Terrain at first, with nothing offered: the bar is hidden.
		expect(shows.map((show) => show.hidden)).toEqual([true, true]);
		expect(element.hidden).toBe(true);
		bar.showView({ ...DEFAULT_PAGE_VIEW, layer: 'temperature' });
		expect(shows.map((show) => show.hidden)).toEqual([false, true]);
		expect(element.hidden).toBe(false);
		bar.showView({ ...DEFAULT_PAGE_VIEW, layer: 'pressure' });
		expect(shows.map((show) => show.hidden)).toEqual([true, false]);
		bar.showView(DEFAULT_PAGE_VIEW);
		expect(shows.map((show) => show.hidden)).toEqual([true, true]);
		expect(element.hidden).toBe(true);
	});

	it('starts on the layer on screen given', () => {
		const { shows } = make({ layer: 'pressure' });
		expect(shows.map((show) => show.hidden)).toEqual([true, false]);
	});

	it('offers each layer’s own views of its year in a labelled drop-down, on the one given', () => {
		const { select, told } = make({
			layer: 'temperature',
			summaries: { temperature: 'coldest', pressure: 'annualMean' },
		});
		const temperature = select(TEMPERATURE_LAYER.summaryControlId);
		expect(temperature.tagName).toBe('SELECT');
		expect(
			temperature.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['month', 'Month'],
			['annualMean', 'Annual average'],
			['warmest', 'Warmest month'],
			['coldest', 'Coldest month'],
			['range', 'Seasonal range'],
		]);
		expect(temperature.value).toBe('coldest');
		const pressure = select(PRESSURE_LAYER.summaryControlId);
		expect(
			pressure.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['month', 'Month'],
			['annualMean', 'Annual average'],
		]);
		expect(pressure.value).toBe('annualMean');
		temperature.value = 'range';
		temperature.fire('change');
		pressure.value = 'month';
		pressure.fire('change');
		expect(told).toEqual(['temperature range', 'pressure month']);
	});

	it('shows each layer’s view of its year from the view settings, telling nothing', () => {
		const { bar, select, told } = make({ layer: 'temperature' });
		bar.showView({
			...DEFAULT_PAGE_VIEW,
			layer: 'temperature',
			summaries: { temperature: 'warmest', pressure: 'annualMean' },
		});
		expect(select(TEMPERATURE_LAYER.summaryControlId).value).toBe('warmest');
		expect(select(PRESSURE_LAYER.summaryControlId).value).toBe('annualMean');
		expect(told).toEqual([]);
	});

	it('gives a layer described only its own views, and no comparison of its own', () => {
		const { element, select, shows, bar, told } = make(
			{
				summaries: {
					...DEFAULT_PAGE_VIEW.summaries,
					[MADE_UP_ID]: 'annualMean',
				},
			},
			[TEMPERATURE_LAYER, MADE_UP_LAYER],
		);
		const madeUp = select('made-up-view');
		expect(
			madeUp.children.map((option) => [option.value, option.textContent]),
		).toEqual([
			['month', 'This month'],
			['annualMean', 'Yearly mean'],
		]);
		expect(madeUp.value).toBe('annualMean');
		madeUp.value = 'month';
		madeUp.fire('change');
		expect(told).toEqual([`${MADE_UP_ID} month`]);
		expect(byClass(element, 'comparison')).toHaveLength(1);
		bar.showView({ ...DEFAULT_PAGE_VIEW, layer: MADE_UP_ID });
		expect(shows.map((show) => show.hidden)).toEqual([true, false]);
	});

	it('shows the comparison as told, hidden while nothing is offered, and passes on a choice', () => {
		const { bar, element, radios, told } = make();
		const comparison = oneByClass(element, 'comparison');
		expect(comparison.hidden).toBe(true);
		bar.showComparison({
			offered: WIND_SOURCES,
			source: 'observed',
			message: null,
		});
		// On Terrain with the winds on: the bar shows the comparison alone.
		expect(comparison.hidden).toBe(false);
		expect(element.hidden).toBe(false);
		expect(
			radios.map((radio) => [radio.value, radio.checked, radio.disabled]),
		).toEqual([
			['simulated', false, false],
			['observed', true, false],
			['difference', false, true],
		]);
		bar.showComparison({
			offered: SOURCES,
			source: 'observed',
			message: 'Loading',
		});
		expect(radios.map((radio) => radio.disabled)).toEqual([
			false,
			false,
			false,
		]);
		expect(oneByClass(element, 'comparison__message').textContent).toBe(
			'Loading',
		);
		fake.pick(radios[2] as FakeElement);
		expect(told).toEqual(['source difference']);
		bar.showComparison({ offered: [], source: 'simulated', message: null });
		expect(comparison.hidden).toBe(true);
		expect(element.hidden).toBe(true);
	});

	it('keeps the bar shown while the Show choice shows with nothing to compare', () => {
		const { bar, element } = make({ layer: 'temperature' });
		bar.showComparison({ offered: [], source: 'simulated', message: null });
		expect(element.hidden).toBe(false);
	});
});
